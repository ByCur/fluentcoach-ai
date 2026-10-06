import type { AnalysisJob, JobTransport } from '@fluentcoach/application';
import { sql } from './prisma.js';
export interface PublicationBudget { reserve():Promise<boolean>; block():Promise<void> }
export class PostgresPublicationBudget implements PublicationBudget {
  async reserve() {
    return (await sql(`INSERT INTO qstash_publication_budgets(day,publications) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,1)
      ON CONFLICT(day) DO UPDATE SET publications=qstash_publication_budgets.publications+1
      WHERE NOT qstash_publication_budgets.blocked AND qstash_publication_budgets.publications<100 RETURNING day`)).length===1;
  }
  async block() {
    await sql(`INSERT INTO qstash_publication_budgets(day,publications,blocked) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,0,true)
      ON CONFLICT(day) DO UPDATE SET blocked=true`);
  }
}
export class QStashTransport implements JobTransport {
  constructor(private readonly config:{token:string;destination:string;baseUrl?:string},private readonly budget:PublicationBudget=new PostgresPublicationBudget(),private readonly request:typeof fetch=fetch) {}
  async enqueue(job:AnalysisJob) {
    if(!await this.budget.reserve())throw new Error('QSTASH_QUOTA_UNAVAILABLE');
    const response=await this.request(`${this.config.baseUrl??'https://qstash.upstash.io'}/v2/publish/${encodeURIComponent(this.config.destination)}`,{
      method:'POST',signal:AbortSignal.timeout(5000),redirect:'error',
      headers:{authorization:`Bearer ${this.config.token}`,'content-type':'application/json','upstash-retries':'3'},body:JSON.stringify(job),
    });
    if(response.status===429)await this.budget.block();
    if(!response.ok)throw new Error(`QSTASH_ENQUEUE_${response.status}`);
  }
}
