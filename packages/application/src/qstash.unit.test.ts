import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { verifyQStashSignature } from './qstash.js';
const bytes = (value: string) => new TextEncoder().encode(value);
const currentSigningKey = 'synthetic-current-signing-key-32-bytes', nextSigningKey = 'synthetic-next-signing-key-32-bytes';
const body = bytes('{ "version": 1 }'), url = 'https://api.test/api/v1/jobs/analysis';
async function sign(key: string, expiration = Math.floor(Date.now()/1000)+60, target = url) {
  return new SignJWT({body: createHash('sha256').update(body).digest('base64url')}).setProtectedHeader({alg: 'HS256'}).setIssuer('Upstash').setSubject(target).setNotBefore(Math.floor(Date.now()/1000)-1).setExpirationTime(expiration).sign(bytes(key));
}
describe('complete QStash verification matrix', () => {
  it.each([currentSigningKey,nextSigningKey])('accepts an active rotation key %s', async key => {
    await expect(verifyQStashSignature({signature: await sign(key),currentSigningKey,nextSigningKey,body,url})).resolves.toBeUndefined();
  });
  it('rejects altered raw bytes even for equivalent JSON', async () => {
    await expect(verifyQStashSignature({signature: await sign(currentSigningKey),currentSigningKey,nextSigningKey,body: bytes('{"version":1}'),url})).rejects.toThrow('INVALID_QSTASH_SIGNATURE');
  });
  it('rejects the wrong URL, expired token, invalid signature and a token without expiry', async () => {
    for (const signature of [await sign(currentSigningKey,undefined,url+'?different=1'),await sign(currentSigningKey,Math.floor(Date.now()/1000)-60),await sign('synthetic-untrusted-key-32-bytes'), 'not.a.jwt']) await expect(verifyQStashSignature({signature,currentSigningKey,nextSigningKey,body,url})).rejects.toThrow('INVALID_QSTASH_SIGNATURE');
    const noExpiry = await new SignJWT({body: createHash('sha256').update(body).digest('base64url')}).setProtectedHeader({alg: 'HS256'}).setIssuer('Upstash').setSubject(url).sign(bytes(currentSigningKey));
    await expect(verifyQStashSignature({signature: noExpiry,currentSigningKey,nextSigningKey,body,url})).rejects.toThrow('INVALID_QSTASH_SIGNATURE');
  });
});
