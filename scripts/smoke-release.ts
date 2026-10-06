import { readFile } from 'node:fs/promises';
import { releaseManifestSchema, operatorAuthorizationSchema, releaseIdentitySchema } from '../packages/infrastructure/src/release-policy.js';

async function main() {
  const [environment, baseFlag, baseUrl, apiFlag, apiUrl, manifestFlag, manifestFile, authFlag, authFile] = process.argv.slice(2).filter(arg=>arg!=='--');
  if (!['staging','production'].includes(environment ?? '') || baseFlag !== '--base-url' || !baseUrl || apiFlag !== '--api-base-url' || !apiUrl || manifestFlag !== '--manifest' || !manifestFile || (authFlag && (authFlag !== '--authorization' || !authFile))) throw new Error();
  for (const raw of [baseUrl,apiUrl]) {
    const url=new URL(raw);
    if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.pathname!=='/' || url.hostname.endsWith('.invalid') || ['localhost','127.0.0.1'].includes(url.hostname)) throw new Error();
  }
  const manifest=releaseManifestSchema.parse(JSON.parse(await readFile(manifestFile,'utf8')) as unknown);
  if(manifest.environment!==environment) throw new Error();
  if(environment==='production') {
    const approval=operatorAuthorizationSchema.parse(JSON.parse(await readFile(authFile ?? '','utf8')) as unknown);
    if(new Date(approval.expiresAt)<=new Date() || JSON.stringify(approval.identity)!==JSON.stringify(manifest.identity)) throw new Error();
  }
  // Explicit, bounded, read-only network probe. No synthetic login, AI/media calls or learner writes.
  const get=(base:string,path:string)=>fetch(new URL(path,base),{redirect:'error',signal:AbortSignal.timeout(75000)});
  const frontend=await get(baseUrl,'/');
  if(!frontend.ok || !(frontend.headers.get('content-type')??'').includes('text/html')) throw new Error();
  for(const path of ['/health/live','/health/ready']) {
    const response=await get(apiUrl,path);
    const body=await response.json() as {status?:string;service?:string};
    if(!response.ok || body.status!=='ok' || body.service!=='api') throw new Error();
  }
  const response=await get(apiUrl,'/health/release');
  const identity=releaseIdentitySchema.parse(await response.json() as unknown);
  if(!response.ok || JSON.stringify(identity)!==JSON.stringify(manifest.identity)) throw new Error();
  const unauthenticated=await get(apiUrl,'/api/v1/me');
  if(unauthenticated.status!==401) throw new Error();
  const mode=await get(apiUrl,'/api/v1/auth/mode');
  if(!mode.ok || (await mode.json() as {mode?:string}).mode!=='oidc') throw new Error();
  console.log(JSON.stringify({environment,status:'read-only-smoke-passed',contacted:true,identity,fullLearnerPath:'manual-gate'}));
}
void main().catch(()=>{console.error('SMOKE_FAILED: explicit HTTPS base URLs, manifest and production authorization required; no pass recorded');process.exitCode=1;});
