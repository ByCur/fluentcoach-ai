import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { releaseIdentitySchema, RELEASE_MIGRATION, PREVIOUS_MIGRATION } from '../packages/infrastructure/src/release-policy.js';

async function main() {
  const [flag, metadataFile, archiveFlag, archiveFile, outputFlag, outputFile] = process.argv.slice(2).filter(arg=>arg!=='--');
  if (flag !== '--metadata' || !metadataFile || archiveFlag !== '--archive' || !archiveFile || outputFlag !== '--output' || !outputFile) throw new Error();
  const metadata = JSON.parse(await readFile(metadataFile, 'utf8')) as Record<string, unknown>;
  const identity = releaseIdentitySchema.parse({
    commitSha: process.env['RELEASE_COMMIT_SHA'], imageDigest: metadata['containerimage.digest'],
    migrationVersion: RELEASE_MIGRATION, compatibleMigrationVersions: [PREVIOUS_MIGRATION, RELEASE_MIGRATION],
  });
  // Bind metadata to the archived OCI content, not an arbitrary environment string or Docker config ID.
  const blob = (digest:string):Buffer => {
    if(!/^sha256:[a-f0-9]{64}$/.test(digest))throw new Error();
    const bytes=execFileSync('tar',['-xOf',archiveFile,`blobs/sha256/${digest.slice(7)}`],{maxBuffer:8*1024*1024});
    if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==digest)throw new Error();
    return bytes;
  };
  type Descriptor={digest:string;mediaType:string};
  type Manifest={config?:Descriptor;manifests?:Descriptor[]};
  const root=JSON.parse(blob(identity.imageDigest).toString()) as Manifest;
  const descriptor=root.manifests?.find(d=>d.mediaType==='application/vnd.oci.image.manifest.v1+json');
  const manifest=descriptor?JSON.parse(blob(descriptor.digest).toString()) as Manifest:root;
  if(!manifest.config)throw new Error();
  const config=JSON.parse(blob(manifest.config.digest).toString()) as {config:{Labels:Record<string,string>;Env:string[]}};
  if(config.config.Labels['org.opencontainers.image.revision']!==identity.commitSha || !config.config.Env.includes(`RELEASE_MIGRATION_VERSION=${RELEASE_MIGRATION}`))throw new Error();
  await writeFile(outputFile, JSON.stringify(identity, null, 2) + '\n', {flag:'wx', mode:0o600});
  console.log('Immutable OCI identity recorded; no deployment performed.');
}
void main().catch(() => { console.error('RELEASE_IDENTITY_FAILED'); process.exitCode = 1; });
