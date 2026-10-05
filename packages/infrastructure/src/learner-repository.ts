import type { PoolClient } from 'pg';
import { AiError } from '@fluentcoach/application';
import type {
  AccountRepository,
  ConsentInput,
  LearnerProfileInput,
  LearnerRepository,
  PracticeGoalInput,
} from '@fluentcoach/application';
import { pool, sql } from './prisma.js';
export class PostgresAccountRepository implements AccountRepository {
  async findStatus(accountId: string) {
    const r = await sql<{ status: 'ACTIVE' | 'DISABLED' | 'DELETING' }>(
      'SELECT status FROM accounts WHERE id=$1',
      [accountId],
    );
    return r[0]?.status ?? null;
  }
  async findOrCreateByIdentity(issuer: string, subject: string) {
    const r = await sql<{ id: string }>(
      'INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES($1,$2) ON CONFLICT(oidc_issuer,oidc_subject) DO UPDATE SET updated_at=now() RETURNING id',
      [issuer, subject],
    );
    return r[0]!;
  }
  async getMe(accountId: string) {
    return (
      (
        await sql(
          'SELECT id,status,(SELECT onboarding_version FROM learner_profiles WHERE account_id=accounts.id) AS "onboardingVersion" FROM accounts WHERE id=$1',
          [accountId],
        )
      )[0] ?? null
    );
  }
}
export class PostgresLearnerRepository implements LearnerRepository {
  // Acquire the account mutex BEFORE any profile row lock. M09 date snapshots
  // must serialize with profile/goal writes without an inverted lock order.
  private async write<T>(
    accountId: string,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query<Record<string, unknown>>('BEGIN');
      if (
        !(
          await c.query<Record<string, unknown>>(
            "SELECT id FROM accounts WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
            [accountId],
          )
        ).rowCount
      )
        throw new AiError('unauthorized');
      const result = await fn(c);
      await c.query<Record<string, unknown>>('COMMIT');
      return result;
    } catch (e) {
      await c.query<Record<string, unknown>>('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async getProfile(accountId: string) {
    return (
      (
        await sql(
          'SELECT interface_language AS "interfaceLanguage",native_language AS "nativeLanguage",timezone,cefr_level AS "cefrLevel",interests,version,onboarding_version AS "onboardingVersion" FROM learner_profiles WHERE account_id=$1',
          [accountId],
        )
      )[0] ?? null
    );
  }
  async saveProfile(accountId: string, v: LearnerProfileInput) {
    return this.write(accountId, async (c) => {
      const rows = (
        await c.query<Record<string, unknown>>(
          `INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id) DO UPDATE SET interface_language=$2,native_language=$3,timezone=$4,cefr_level=$5::"CefrLevel",interests=$6,version=learner_profiles.version+1,updated_at=now() WHERE $7::int IS NULL OR learner_profiles.version=$7 RETURNING *`,
          [
            accountId,
            v.interfaceLanguage,
            v.nativeLanguage,
            v.timezone,
            v.cefrLevel,
            v.interests,
            v.version ?? null,
          ],
        )
      ).rows;
      if (!rows[0]) throw new Error('STALE_VERSION');
      return rows[0];
    });
  }
  async getGoal(accountId: string) {
    return (
      (
        await sql(
          'SELECT minutes_per_day AS "minutesPerDay",days_per_week AS "daysPerWeek",version FROM practice_goals WHERE account_id=$1',
          [accountId],
        )
      )[0] ?? null
    );
  }
  async saveGoal(accountId: string, v: PracticeGoalInput) {
    return this.write(
      accountId,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            'INSERT INTO practice_goals(account_id,minutes_per_day,days_per_week) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET minutes_per_day=$2,days_per_week=$3,version=practice_goals.version+1,updated_at=now() RETURNING *',
            [accountId, v.minutesPerDay, v.daysPerWeek],
          )
        ).rows[0]!,
    );
  }
  getConsentHistory(accountId: string) {
    return sql(
      'SELECT purpose,policy_version AS "policyVersion",provider_disclosure_version AS "providerDisclosureVersion",accepted_at AS "acceptedAt",revoked_at AS "revokedAt" FROM consent_records WHERE account_id=$1 ORDER BY accepted_at DESC',
      [accountId],
    );
  }
  async addConsent(accountId: string, v: ConsentInput) {
    return (
      await sql(
        'INSERT INTO consent_records(account_id,purpose,policy_version,provider_disclosure_version) VALUES($1,$2,$3,$4) RETURNING *',
        [accountId, v.purpose, v.policyVersion, v.providerDisclosureVersion],
      )
    )[0]!;
  }
  async completeOnboarding(
    accountId: string,
    v: {
      profile: LearnerProfileInput;
      goal: PracticeGoalInput;
      consent: ConsentInput;
    },
  ) {
    return this.write(accountId, async (c) => {
      await c.query<Record<string, unknown>>(
        `INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests,onboarding_version)VALUES($1,$2,$3,$4,$5,$6,1)ON CONFLICT(account_id)DO UPDATE SET interface_language=$2,native_language=$3,timezone=$4,cefr_level=$5::"CefrLevel",interests=$6,onboarding_version=1,version=learner_profiles.version+1,updated_at=now()`,
        [
          accountId,
          v.profile.interfaceLanguage,
          v.profile.nativeLanguage,
          v.profile.timezone,
          v.profile.cefrLevel,
          v.profile.interests,
        ],
      );
      await c.query<Record<string, unknown>>(
        'INSERT INTO practice_goals(account_id,minutes_per_day,days_per_week)VALUES($1,$2,$3)ON CONFLICT(account_id)DO UPDATE SET minutes_per_day=$2,days_per_week=$3,version=practice_goals.version+1,updated_at=now()',
        [accountId, v.goal.minutesPerDay, v.goal.daysPerWeek],
      );
      await c.query<Record<string, unknown>>(
        'INSERT INTO consent_records(account_id,purpose,policy_version,provider_disclosure_version)VALUES($1,$2,$3,$4)',
        [
          accountId,
          v.consent.purpose,
          v.consent.policyVersion,
          v.consent.providerDisclosureVersion,
        ],
      );
      return { completed: true as const, onboardingVersion: 1 };
    });
  }
}
