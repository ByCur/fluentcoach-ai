import { expect, it } from 'vitest';
import { checkRelease, RELEASE_MIGRATION, PREVIOUS_MIGRATION, releaseIdentitySchema } from '@fluentcoach/infrastructure';
const identity={commitSha:'a'.repeat(40),imageDigest:'sha256:'+'b'.repeat(64),migrationVersion:RELEASE_MIGRATION,compatibleMigrationVersions:[PREVIOUS_MIGRATION,RELEASE_MIGRATION]};
const manifest={version:'release-v1',environment:'production',identity,topology:'render-free-local-ai-blocked',billingMode:'free_only',monthlyTargetEur:0,workerDeployed:false,paymentMethodAttached:false,billingEnabled:false,automaticUpgrade:false,paidFallback:false,services:{render:'free',neon:'free',redis:'free',qstash:'free',auth0:'free'},providerReviewDate:'2026-10-06',isolationReviewId:'synthetic-isolation'};
const now=new Date('2026-10-06T12:00:00Z');
const approval={action:'production-deployment',environment:'production',operator:'synthetic-operator',identity,expiresAt:'2026-10-07T00:00:00Z'};
it('requires a full commit SHA, immutable OCI digest and explicit compatible schemas',()=>{
  for(const values of [{commitSha:'main'},{imageDigest:'latest'},{imageDigest:'sha256:abc'},{migrationVersion:PREVIOUS_MIGRATION},{compatibleMigrationVersions:[]}])expect(()=>releaseIdentitySchema.parse({...identity,...values})).toThrow();
});
it('rejects billing, paid services, trials, upgrades, workers and unknown manifest fields',()=>{
  for(const values of [{monthlyTargetEur:1},{workerDeployed:true},{paymentMethodAttached:true},{billingEnabled:true},{automaticUpgrade:true},{paidFallback:true},{billingMode:'paid'},{services:{...manifest.services,neon:'trial'}},{overrideBlockers:true}])expect(()=>checkRelease({...manifest,...values},approval,now)).toThrow('RELEASE_MANIFEST_INVALID');
});
it('production needs explicit unexpired authorization tied to this exact identity',()=>{
  expect(()=>checkRelease(manifest,undefined,now)).toThrow('EXPLICIT_OPERATOR_AUTHORIZATION_REQUIRED');
  expect(()=>checkRelease(manifest,{...approval,expiresAt:'2026-10-05T00:00:00Z'},now)).toThrow('EXPLICIT_OPERATOR_AUTHORIZATION_REQUIRED');
  expect(()=>checkRelease(manifest,{...approval,identity:{...identity,commitSha:'c'.repeat(40)}},now)).toThrow('EXPLICIT_OPERATOR_AUTHORIZATION_REQUIRED');
});
it('fresh documentation and operator approval cannot bypass architecture/privacy blockers',()=>{
  expect(()=>checkRelease(manifest,approval,now)).toThrow('LOCAL_AI_VOICE_HOSTING_UNVERIFIED');
  expect(()=>checkRelease({...manifest,environment:'staging'},undefined,now)).toThrow('REDIS_FREE_ENCRYPTION_AT_REST_UNAVAILABLE');
  expect(()=>checkRelease({...manifest,providerReviewDate:'2026-09-01'},approval,now)).toThrow('PROVIDER_REVIEW_EXPIRED');
});
