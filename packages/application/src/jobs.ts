export const JOB_ENVELOPE_VERSION=1 as const;
export interface AnalysisJob {version:1;analysisRunId:string;accountId:string;sessionId:string;transcriptRevision:number}
export interface AnalysisRun {id:string;accountId:string;sessionId:string;revision:number;status:'pending'|'running'|'succeeded'|'failed'|'skipped';attempts:number;leaseUntil?:Date;errorCode?:string}
export interface JobStore {finalize(input:{accountId:string;sessionId:string;hasTurns:boolean}):Promise<{run:AnalysisRun;outboxId:string}>;claim(runId:string,now:Date,leaseUntil:Date):Promise<AnalysisRun|null>;succeed(runId:string,providerRunId:string):Promise<void>;fail(runId:string,errorCode:string,retry:boolean):Promise<void>;pending():Promise<AnalysisJob[]>;markPublished?(runId:string):Promise<void>}
export interface JobTransport {enqueue(job:AnalysisJob):Promise<void>}
export interface AnalysisProvider {analyze(job:AnalysisJob):Promise<{providerRunId:string}>}
export class JobService {constructor(private store:JobStore,private transport:JobTransport,private provider:AnalysisProvider,private maxAttempts=3){}
 finalize(accountId:string,sessionId:string,hasTurns:boolean){return this.store.finalize({accountId,sessionId,hasTurns})}
 async dispatch(){for(const job of await this.store.pending()){await this.transport.enqueue(job);await this.store.markPublished?.(job.analysisRunId)}}
 async execute(job:AnalysisJob,now=new Date()){if(job.version!==JOB_ENVELOPE_VERSION)throw new Error('UNSUPPORTED_JOB_VERSION');const run=await this.store.claim(job.analysisRunId,now,new Date(now.getTime()+30_000));if(!run)return 'duplicate';try{const result=await this.provider.analyze(job);await this.store.succeed(run.id,result.providerRunId);return 'succeeded'}catch(e){await this.store.fail(run.id,e instanceof Error?e.name:'ANALYSIS_ERROR',run.attempts<this.maxAttempts);return 'failed'}}
 async reconcile(){await this.dispatch()}}
