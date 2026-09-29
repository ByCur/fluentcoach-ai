import {SCENARIOS,correctionPolicy,transitionSession,type ConversationMode,type ConversationTurn,type SessionSnapshot,type SessionState} from '@fluentcoach/domain';
export interface TutorContext {snapshot:SessionSnapshot;recentTurns:readonly ConversationTurn[];helpLanguage?:'es'}
export interface ConversationProvider {stream(context:TutorContext,input:string):AsyncIterable<{text:string;done:boolean}>}
export interface SessionRecord {id:string;accountId:string;snapshot:SessionSnapshot;state:SessionState;turns:ConversationTurn[];events:{sequence:number;kind:string;payload:unknown}[]}
export interface SessionRepository {create(accountId:string,snapshot:SessionSnapshot):Promise<SessionRecord>;get(accountId:string,id:string):Promise<SessionRecord|null>;save(record:SessionRecord):Promise<void>;history(accountId:string):Promise<SessionRecord[]>}
export class ConversationService {
 constructor(private repo:SessionRepository,private provider:ConversationProvider){}
 scenarios(){return SCENARIOS}
 async start(accountId:string,input:{scenarioSlug:string;level:'A1'|'A2'|'B1'|'B2';mode:ConversationMode}){const scenario=SCENARIOS.find(x=>x.slug===input.scenarioSlug);if(!scenario)throw new Error('UNKNOWN_SCENARIO');return this.repo.create(accountId,{scenarioSlug:scenario.slug,scenarioVersion:scenario.version,level:input.level,mode:input.mode,promptVersion:'tutor-v1'})}
 async turn(accountId:string,id:string,key:string,text:string){const s=await this.required(accountId,id);if(s.state==='created')s.state=transitionSession(s.state,'active');if(s.state!=='active')throw new Error('SESSION_TERMINAL');if(s.turns.some(t=>t.sourceEventKey===key))return s;const learner:ConversationTurn={sequence:s.turns.length+1,sourceEventKey:key,speaker:'learner',text,language:'en'};s.turns.push(learner);let reply='';for await(const chunk of this.provider.stream({snapshot:s.snapshot,recentTurns:s.turns},text))reply+=chunk.text;s.turns.push({sequence:s.turns.length+1,sourceEventKey:`${key}:reply`,speaker:'tutor',text:reply,language:'en'});s.events.push({sequence:s.events.length+1,kind:'turn.completed',payload:{through:s.turns.length,correction:correctionPolicy(s.snapshot.mode)}});await this.repo.save(s);return s}
 async help(accountId:string,id:string){const s=await this.required(accountId,id);if(s.state!=='active')throw new Error('SESSION_NOT_ACTIVE');s.turns.push({sequence:s.turns.length+1,sourceEventKey:`help:${s.turns.length}`,speaker:'help',text:'Explicación breve en español. Continuamos en inglés.',language:'es'});await this.repo.save(s);return s}
 async end(accountId:string,id:string){const s=await this.required(accountId,id);s.state=transitionSession(s.state,'ended');await this.repo.save(s);return s}
 events(accountId:string,id:string,cursor=0){return this.required(accountId,id).then(s=>s.events.filter(e=>e.sequence>cursor))}
 history(accountId:string){return this.repo.history(accountId)}
 private async required(a:string,id:string){const s=await this.repo.get(a,id);if(!s)throw new Error('SESSION_NOT_FOUND');return s}
}
