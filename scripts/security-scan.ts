import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
const GITLEAKS = "8.24.3",
  TRIVY = "0.75.0";
async function main() {
  const gitleaks = execFileSync("gitleaks", ["version"], {
    encoding: "utf8",
  }).trim();
  const trivy = execFileSync("trivy", ["--version"], { encoding: "utf8" });
  if (gitleaks !== GITLEAKS || !trivy.includes("Version: " + TRIVY))
    throw Error("SCANNER_VERSION_MISMATCH");
  execFileSync(
    "gitleaks",
    ["git", "--redact", "--no-banner", "--log-opts=--all"],
    { stdio: "pipe" },
  );
  let auditText: string;
  try {
    auditText = execFileSync("pnpm", ["audit", "--prod", "--json"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (e) {
    if (!(e instanceof Error && "stdout" in e && typeof e.stdout === "string"))
      throw Error("DEPENDENCY_AUDIT_UNAVAILABLE");
    auditText = e.stdout;
  }
  const audit = JSON.parse(auditText) as {
    error?: unknown;
    metadata?: {
      vulnerabilities: {
        high: number;
        critical: number;
        moderate: number;
        low: number;
      };
    };
  };
  if (audit.error || !audit.metadata)
    throw Error("DEPENDENCY_AUDIT_UNAVAILABLE");
  console.log(
    JSON.stringify({
      scan: "production-dependencies",
      ...audit.metadata.vulnerabilities,
    }),
  );
  if (
    audit.metadata.vulnerabilities.high ||
    audit.metadata.vulnerabilities.critical
  )
    throw Error("HIGH_CRITICAL_DEPENDENCY_VULNERABILITY");
  const dir = await mkdtemp(tmpdir() + "/m10-security-");
  try {
    for (const service of ["api", "web", "worker"]) {
      const image = `fluentcoach-${service}:security`,
        config = JSON.parse(
          execFileSync("docker", ["image", "inspect", image], {
            encoding: "utf8",
          }),
        ) as { Config: { User: string } }[];
      if (
        !config[0]?.Config.User ||
        ["root", "0", "0:0"].includes(config[0].Config.User)
      )
        throw Error("ROOT_RUNTIME_IMAGE");
      const report = dir + "/" + service + ".json";
      execFileSync(
        "trivy",
        [
          "image",
          "--quiet",
          "--scanners",
          "vuln",
          "--severity",
          "HIGH,CRITICAL",
          "--ignore-unfixed",
          "--format",
          "json",
          "--output",
          report,
          image,
        ],
        { stdio: "pipe" },
      );
      const scan = JSON.parse(await readFile(report, "utf8")) as {
        Results?: {
          Vulnerabilities?: {
            VulnerabilityID: string;
            Severity: string;
            FixedVersion?: string;
          }[];
        }[];
      };
      const vulnerabilities = (scan.Results ?? []).flatMap(
        (r) => r.Vulnerabilities ?? [],
      );
      console.log(
        JSON.stringify({
          scan: "runtime-image",
          service,
          scanner: TRIVY,
          fixableHighCritical: vulnerabilities.length,
          advisories: vulnerabilities.map((v) => v.VulnerabilityID),
        }),
      );
      if (vulnerabilities.length)
        throw Error("HIGH_CRITICAL_IMAGE_VULNERABILITY");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({ scan: "secrets", scanner: GITLEAKS, outcome: "passed" }),
  );
}
void main().catch((e) => {
  console.error(
    e instanceof Error && /^[A-Z_]+$/.test(e.message)
      ? e.message
      : "SECURITY_SCAN_FAILED",
  );
  process.exitCode = 1;
});
