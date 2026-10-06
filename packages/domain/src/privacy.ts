export const PRIVACY_EXPORT_SCHEMA_VERSION = "privacy-export-v1" as const;
export const PRIVACY_JOB_VERSION = "privacy-job-v1" as const;
export const RETENTION_POLICY_VERSION = "retention-v1" as const;
export const DELETION_PROTOCOL_VERSION = "deletion-v1" as const;
export const TOMBSTONE_SCHEMA_VERSION = "deletion-tombstone-v1" as const;
export const PRIVACY_LIMITS = Object.freeze({
  exportMaxBytes: 8 * 1024 * 1024,
  exportLifetimeMs: 86400000,
  exportRequestsPerDay: 3,
  openSessions: 5,
  retentionBatch: 25,
  jobAttempts: 3,
  jsonBodyBytes: 65536,
});
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - 90 * 86400000);
}
export type PrivacyJob = {
  id: string;
  kind: "export" | "deletion";
  version: string;
  state: "pending" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
  errorCode: string | null;
  expiresAt: string | null;
};
export type Tombstone = {
  accountId: string;
  deletionEpoch: number;
  requestedAt: string;
  completedAt: string | null;
  protocolVersion: typeof DELETION_PROTOCOL_VERSION;
  schemaVersion: typeof TOMBSTONE_SCHEMA_VERSION;
};
