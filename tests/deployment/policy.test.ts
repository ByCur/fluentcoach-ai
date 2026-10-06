import { expect, it } from 'vitest';
import { appEnvironment, validateReleaseRuntime } from '@fluentcoach/infrastructure';
import { execFileSync } from 'node:child_process';

it('refuses paid modes, fallbacks and workers before any deployment',()=>{
  for(const values of [{BILLING_MODE:'paid'},{AI_FALLBACK_PROVIDER:'gemini-free'},{DEPLOY_WORKER:'true'}])expect(()=>validateReleaseRuntime(values)).toThrow();
});
it('isolates local, test, staging and production, with cloud gates that cannot be overridden',()=>{
  expect(appEnvironment({})).toBe('local');
  expect(()=>appEnvironment({APP_ENVIRONMENT:'staging',NODE_ENV:'test'})).toThrow();
  expect(()=>appEnvironment({APP_ENVIRONMENT:'local',NODE_ENV:'production'})).toThrow();
  for(const environment of ['staging','production']){
    expect(()=>validateReleaseRuntime({APP_ENVIRONMENT:environment,NODE_ENV:'production',BILLING_MODE:'free_only',AI_PROVIDER:'ollama',SPEECH_PROVIDER:'whisper-cpp',PRODUCTION_AUTHORIZED:'true'})).toThrow('RELEASE_BLOCKED');
    for(const values of [{AI_PROVIDER:'gemini-free'},{AI_PROVIDER:'fake'},{SPEECH_PROVIDER:'fake'}])expect(()=>validateReleaseRuntime({APP_ENVIRONMENT:environment,NODE_ENV:'production',BILLING_MODE:'free_only',...values})).toThrow('providers');
  }
  expect(()=>validateReleaseRuntime({NODE_ENV:'test',DATABASE_URL:'postgresql://user:SECRET@db.cloud/production',REDIS_URL:'redis://localhost:6379'})).toThrow('isolated test DATABASE_URL');
  expect(()=>validateReleaseRuntime({NODE_ENV:'test',DATABASE_URL:'postgresql://user:SECRET@localhost/app_test',REDIS_URL:'rediss://redis.cloud:6379'})).toThrow('isolated test REDIS_URL');
  expect(()=>validateReleaseRuntime({NODE_ENV:'test',DATABASE_URL:'postgresql://user:SECRET@localhost/app_test',REDIS_URL:'redis://localhost:6379'})).not.toThrow();
});
it('production bootstrap fails closed before listening or contacting a provider',()=>{
  try {
    execFileSync('node',['apps/api/dist/main.js'],{env:{...process.env,NODE_ENV:'production',APP_ENVIRONMENT:'production',BILLING_MODE:'free_only',AI_PROVIDER:'ollama',SPEECH_PROVIDER:'whisper-cpp'},stdio:'pipe',timeout:15000});
    throw new Error('Production unexpectedly started');
  } catch(error) {
    expect(String((error as {stderr?:Buffer}).stderr)).toContain('RELEASE_BLOCKED');
  }
});
