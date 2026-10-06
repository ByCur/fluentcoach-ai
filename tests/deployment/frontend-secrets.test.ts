import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const serverSecrets=['DATABASE_URL','REDIS_URL','OIDC_CLIENT_SECRET','QSTASH_TOKEN','QSTASH_CURRENT_SIGNING_KEY','QSTASH_NEXT_SIGNING_KEY','GEMINI_API_KEY'];
async function contents(path:string):Promise<string> {
  const entries=await readdir(path,{withFileTypes:true});
  return (await Promise.all(entries.map(entry=>entry.isDirectory()?contents(join(path,entry.name)):readFile(join(path,entry.name),'utf8')))).join('\n');
}
it('builds actual browser assets with server-secret canaries; no values or credential URLs ship',async()=>{
  const path=await mkdtemp(join(tmpdir(),'m11-frontend-'));
  try {
    const canaries=Object.fromEntries(serverSecrets.flatMap((name,i)=>[name,`VITE_${name}`,`VITE_PUBLIC_${name}`].map((key,j)=>[key,`M11_SERVER_CANARY_${i}_${j}_NEVER_PUBLIC`])));
    const viteTrap='M11_VITE_CANARY_'+randomUUID();
    execFileSync('pnpm',['--filter','@fluentcoach/web','exec','vite','build','--outDir',path],{env:{...process.env,...canaries,VITE_GEMINI_API_KEY:viteTrap},stdio:'pipe'});
    const bundle=await contents(path);
    for(const value of [...Object.values(canaries),viteTrap])expect(bundle).not.toContain(value);
    expect(bundle).not.toMatch(/postgresql:\/\/|rediss?:\/\/|Bearer M11_/);
    // Exposed custom env variables have no place in the browser; production auth mode comes from the API.
    const source=await contents('apps/web/src');
    expect(source).not.toMatch(/process\.env|import\.meta\.env\.(?!DEV\b|PROD\b|MODE\b|BASE_URL\b|SSR\b)/);
    for(const key of serverSecrets)expect(source).not.toContain(key);
    // The detector must also reject a deliberately leaked asset.
    const detect=(asset:string)=>Object.values(canaries).some(value=>asset.includes(value));
    expect(detect(bundle)).toBe(false);expect(detect(`public-config=${canaries['OIDC_CLIENT_SECRET']}`)).toBe(true);
  } finally {await rm(path,{recursive:true,force:true});}
});
