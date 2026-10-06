import type { PrivacyJob, Tombstone } from "@fluentcoach/domain";
export interface PrivacyRepository {
  requestExport(accountId: string, requestKey: string): Promise<PrivacyJob>;
  status(accountId: string, jobId: string): Promise<PrivacyJob>;
  download(accountId: string, jobId: string): Promise<string>;
  requestDeletion(accountId: string, requestKey: string): Promise<PrivacyJob>;
  execute(jobId: string): Promise<void>;
  reconcile(): Promise<void>;
  retain(): Promise<{ accounts: number; sessions: number }>;
  exportTombstones(): Promise<Tombstone[]>;
  replay(tombstones: Tombstone[]): Promise<void>;
}
export class PrivacyService {
  constructor(private readonly repository: PrivacyRepository) {}
  export(accountId: string, requestKey: string) {
    return this.repository.requestExport(accountId, requestKey);
  }
  status(accountId: string, id: string) {
    return this.repository.status(accountId, id);
  }
  download(accountId: string, id: string) {
    return this.repository.download(accountId, id);
  }
  delete(accountId: string, requestKey: string, confirmation: boolean) {
    if (!confirmation) throw Error("DELETION_CONFIRMATION_REQUIRED");
    return this.repository.requestDeletion(accountId, requestKey);
  }
  execute(id: string) {
    return this.repository.execute(id);
  }
  reconcile() {
    return this.repository.reconcile();
  }
  retain() {
    return this.repository.retain();
  }
}
