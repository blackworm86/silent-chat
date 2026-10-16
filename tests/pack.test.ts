import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { deriveKey, decryptBytes, encryptBytes } from '../src/shared/packcrypto';

describe('encrypted content pack', () => {
  it('tools/pack.mjs output is decryptable by the browser-side WebCrypto code, and wrong passphrases fail', async () => {
    const out = 'tmp-pack-test';
    execFileSync('node', ['tools/pack.mjs', '--out', out], { env: { ...process.env, PACK_PASSPHRASE: 'correct horse', PACK_ITERATIONS: '1000' }, stdio: 'pipe' });
    const man = JSON.parse(fs.readFileSync(out + '/manifest.json', 'utf8'));
    const key = await deriveKey('correct horse', man.salt, man.iterations);
    const plain = await decryptBytes(key, new Uint8Array(fs.readFileSync(out + '/content.enc')));
    const content = JSON.parse(new TextDecoder().decode(plain));
    expect(content.clueCards).toHaveLength(31);
    const poster = await decryptBytes(key, new Uint8Array(fs.readFileSync(out + '/poster_01.enc')));
    expect(poster[0]).toBe(0xff); expect(poster[1]).toBe(0xd8); // JPEG magic
    const bad = await deriveKey('wrong passphrase', man.salt, man.iterations);
    await expect(decryptBytes(bad, new Uint8Array(fs.readFileSync(out + '/content.enc')))).rejects.toBeTruthy();
    // no readable game text in the encrypted file
    const raw = fs.readFileSync(out + '/content.enc').toString('latin1');
    expect(raw.includes('Silent Falls')).toBe(false);
    fs.rmSync(out, { recursive: true, force: true });
  }, 30000);
  it('encrypt/decrypt roundtrip', async () => {
    const key = await deriveKey('x'.repeat(8), 'AAAAAAAAAAAAAAAAAAAAAA==', 1000);
    const data = new TextEncoder().encode('ciao');
    expect(new TextDecoder().decode(await decryptBytes(key, await encryptBytes(key, data)))).toBe('ciao');
  });
});
