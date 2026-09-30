import { AiError } from '@fluentcoach/application';
import { sql } from './prisma.js';
export interface FreeQuota {
  dailyRequests: number;
  dailyTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  verifiedUntil: Date;
}
export interface AiBudget {
  available(): Promise<void>;
  reserve(tokens: number): Promise<string>;
  settle(
    id: string,
    input: number | null,
    output: number | null,
  ): Promise<void>;
  block(): Promise<void>;
}
export class PostgresAiBudget implements AiBudget {
  constructor(
    private readonly quota: FreeQuota,
    private readonly model: string,
  ) {}
  private verify() {
    if (this.quota.verifiedUntil.getTime() <= Date.now())
      throw new AiError('budget-exhausted');
  }
  async available() {
    this.verify();
    const row = (
      await sql<{ requests: number; tokens: number; blocked: boolean }>(
        "SELECT requests,tokens,blocked FROM ai_daily_budgets WHERE model=$1 AND day=(now() AT TIME ZONE 'UTC')::date",
        [this.model],
      )
    )[0];
    if (
      row &&
      (row.blocked ||
        row.requests >= this.quota.dailyRequests ||
        row.tokens + this.quota.maxInputTokens + this.quota.maxOutputTokens >
          this.quota.dailyTokens)
    )
      throw new AiError('budget-exhausted');
  }
  async reserve(tokens: number) {
    this.verify();
    if (
      tokens > this.quota.dailyTokens ||
      !Number.isSafeInteger(tokens) ||
      tokens <= 0
    )
      throw new AiError('budget-exhausted');
    const rows = await sql<{ id: string }>(
      `WITH admitted AS (
 INSERT INTO ai_daily_budgets(model,day,requests,tokens) VALUES($1,(now() AT TIME ZONE 'UTC')::date,1,$2)
 ON CONFLICT(model,day) DO UPDATE SET requests=ai_daily_budgets.requests+1,tokens=ai_daily_budgets.tokens+$2
 WHERE NOT ai_daily_budgets.blocked AND ai_daily_budgets.requests<$3 AND ai_daily_budgets.tokens+$2<=$4 RETURNING model,day)
 INSERT INTO ai_budget_reservations(model,day,reserved_tokens) SELECT model,day,$2 FROM admitted RETURNING id`,
      [this.model, tokens, this.quota.dailyRequests, this.quota.dailyTokens],
    );
    if (tokens > this.quota.dailyTokens || !rows[0])
      throw new AiError('budget-exhausted');
    return rows[0].id;
  }
  async settle(id: string, input: number | null, output: number | null) {
    await sql(
      'UPDATE ai_budget_reservations SET input_tokens=$2,output_tokens=$3 WHERE id=$1',
      [id, input, output],
    ); /* Reservations stay charged: unknown usage, crashes and repeats never refund quota. */
  }
  async block() {
    await sql(
      `INSERT INTO ai_daily_budgets(model,day,requests,tokens,blocked)VALUES($1,(now() AT TIME ZONE 'UTC')::date,0,0,true)ON CONFLICT(model,day)DO UPDATE SET blocked=true`,
      [this.model],
    );
  }
}
