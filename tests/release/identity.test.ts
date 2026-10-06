import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect,it } from 'vitest';
import { RELEASE_MIGRATION } from '@fluentcoach/infrastructure';
it('binds release identity to archived OCI bytes and baked commit; a forged commit cannot be recorded',async()=>{
  const path=await mkdtemp(join(tmpdir(),'m11-oci-'));
  const commit='a'.repeat(40);
  try {
    await mkdir(join(path,'blobs','sha256'),{recursive:true});
    const put=async(value:unknown)=>{
      const bytes=JSON.stringify(value),hash=createHash('sha256').update(bytes).digest('hex');
      await writeFile(join(path,'blobs','sha256',hash),bytes);
      return 'sha256:'+hash;
    };
    const config=await put({config:{Labels:{'org.opencontainers.image.revision':commit},Env:[`RELEASE_MIGRATION_VERSION=${RELEASE_MIGRATION}`]}});
    const digest=await put({schemaVersion:2,config:{mediaType:'application/vnd.oci.image.config.v1+json',digest:config}});
    const archive=join(path,'api.oci.tar'),metadata=join(path,'metadata.json'),output=join(path,'identity.json');
    execFileSync('tar',['-cf',archive,'-C',path,'blobs']);await writeFile(metadata,JSON.stringify({'containerimage.digest':digest}));
    const run=(sha:string,target:string)=>execFileSync('node',['node_modules/tsx/dist/cli.mjs','scripts/release-identity.ts','--metadata',metadata,'--archive',archive,'--output',target],{env:{...process.env,RELEASE_COMMIT_SHA:sha},stdio:'pipe',timeout:15000});
    run(commit,output);expect(JSON.parse(await readFile(output,'utf8'))).toMatchObject({commitSha:commit,imageDigest:digest,migrationVersion:RELEASE_MIGRATION});
    expect(()=>run('c'.repeat(40),join(path,'forged.json'))).toThrow();
    await writeFile(join(path,'blobs','sha256',digest.slice(7)),'tampered');
    execFileSync('tar',['-cf',archive,'-C',path,'blobs']);
    expect(()=>run(commit,join(path,'tampered.json'))).toThrow();
  } finally {await rm(path,{recursive:true,force:true});}
});
