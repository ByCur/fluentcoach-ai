import { validateConsent, validatePracticeGoal, validateProfile } from '@fluentcoach/domain';

export interface LearnerProfileInput { interfaceLanguage:string; nativeLanguage:string; timezone:string; cefrLevel:string; interests:readonly string[]; version?:number|undefined }
export interface PracticeGoalInput { minutesPerDay:number; daysPerWeek:number }
export interface ConsentInput { purpose:string; policyVersion:string; providerDisclosureVersion:string; accepted:boolean }
export interface LearnerRepository {
  getProfile(accountId:string):Promise<unknown>;
  saveProfile(accountId:string,input:LearnerProfileInput):Promise<unknown>;
  getGoal(accountId:string):Promise<unknown>;
  saveGoal(accountId:string,input:PracticeGoalInput):Promise<unknown>;
  getConsentHistory(accountId:string):Promise<unknown[]>;
  addConsent(accountId:string,input:ConsentInput):Promise<unknown>;
  completeOnboarding(accountId:string,input:{profile:LearnerProfileInput;goal:PracticeGoalInput;consent:ConsentInput}):Promise<{completed:true;onboardingVersion:number}>;
}
export interface AccountRepository { findStatus(accountId:string):Promise<'ACTIVE'|'DISABLED'|'DELETING'|null>; findOrCreateByIdentity(issuer:string,subject:string):Promise<{id:string}>; getMe(accountId:string):Promise<unknown> }
export class LearnerService {
  constructor(private readonly repository:LearnerRepository){}
  profile(accountId:string){return this.repository.getProfile(accountId)}
  saveProfile(accountId:string,input:LearnerProfileInput){validateProfile(input);return this.repository.saveProfile(accountId,input)}
  goal(accountId:string){return this.repository.getGoal(accountId)}
  saveGoal(accountId:string,input:PracticeGoalInput){validatePracticeGoal(input.minutesPerDay,input.daysPerWeek);return this.repository.saveGoal(accountId,input)}
  consent(accountId:string){return this.repository.getConsentHistory(accountId)}
  addConsent(accountId:string,input:ConsentInput){validateConsent(input);return this.repository.addConsent(accountId,input)}
  complete(accountId:string,input:{profile:LearnerProfileInput;goal:PracticeGoalInput;consent:ConsentInput}){validateProfile(input.profile);validatePracticeGoal(input.goal.minutesPerDay,input.goal.daysPerWeek);validateConsent(input.consent);return this.repository.completeOnboarding(accountId,input)}
}
export interface Clock { now(): Date }

export interface OidcIdentity { issuer:string; subject:string }
export interface OidcProvider {
 begin():Promise<{authorizationUrl:string;state:string}>;
 callback(input:{code:string;state:string}):Promise<OidcIdentity>;
}
export * from './conversation.js';
export * from './jobs.js';
export * from './qstash.js';
export * from './ai.js';
export * from './speech.js';
export * from './voice-turn.js';
export * from './issues.js';
export * from './vocabulary.js';
export * from './plans.js';
export * from './progress.js';
