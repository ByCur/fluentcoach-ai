export const SCENARIOS = [
  {slug:'restaurant',version:1,title:'Restaurant'},{slug:'travel',version:1,title:'Travel'},
  {slug:'hotel',version:1,title:'Hotel'},{slug:'shopping',version:1,title:'Shopping'},
  {slug:'doctor-visit',version:1,title:'Doctor visit'},{slug:'free-conversation',version:1,title:'Free conversation'}
] as const;
export type ConversationMode='natural'|'teaching'; export type SessionState='created'|'active'|'ended'|'abandoned'|'failed';
export interface SessionSnapshot {scenarioSlug:string;scenarioVersion:number;level:'A1'|'A2'|'B1'|'B2';mode:ConversationMode;promptVersion:string}
export interface ConversationTurn {sequence:number;sourceEventKey:string;speaker:'learner'|'tutor'|'help';text:string;language:'en'|'es'}
export function transitionSession(state:SessionState,next:SessionState):SessionState {if(state===next)return state;if(['ended','abandoned','failed'].includes(state))throw new Error('SESSION_TERMINAL');if((state==='created'&&next==='active')||(['created','active'].includes(state)&&['ended','abandoned','failed'].includes(next)))return next;throw new Error('INVALID_SESSION_TRANSITION')}
export function correctionPolicy(mode:ConversationMode){return mode==='natural'?'deferred':'after-turn'}
