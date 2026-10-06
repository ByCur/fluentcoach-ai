import { execFileSync } from 'node:child_process';
import { expect,it } from 'vitest';
it('smoke commands refuse missing URLs, local defaults and incomplete production authorization',()=>{
  for(const args of [[],['production'],['staging','--base-url','http://localhost:4173','--api-base-url','http://localhost:3000','--manifest','missing.json']]) {
    try {
      execFileSync('node',['node_modules/tsx/dist/cli.mjs','scripts/smoke-release.ts',...args],{stdio:'pipe',timeout:15000});
      throw Error('Unexpected smoke pass');
    } catch(error) {
      expect(String((error as {stderr?:Buffer}).stderr)).toContain('SMOKE_FAILED');
      expect(String((error as {stdout?:Buffer}).stdout)).not.toContain('smoke-passed');
    }
  }
});
