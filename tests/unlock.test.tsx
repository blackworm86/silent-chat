// @vitest-environment jsdom
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { unlock, content, posterUrl, forget } from '../src/client/content';

const has = fs.existsSync('content/content.json');
const maybe = has ? describe : describe.skip;
const dir = 'tmp-unlock-pack';

maybe('client unlock flow against an encrypted pack', () => {
  it('rejects a wrong passphrase, accepts the right one, then decrypts content and posters', async () => {
    execFileSync('node', ['tools/pack.mjs', '--out', dir], { env: { ...process.env, PACK_PASSPHRASE: 'friends-only-2026' }, stdio: 'pipe' });
    (globalThis as any).fetch = async (u: string) => {
      const name = String(u).split('/pack/')[1];
      const buf = fs.readFileSync(`${dir}/${name}`);
      return { json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    };
    (URL as any).createObjectURL = () => 'blob:test';
    expect(await unlock('wrong one')).toBe(false);
    expect(content.value).toBeNull();
    expect(await unlock('friends-only-2026')).toBe(true);
    expect(content.value!.clueCards).toHaveLength(31);
    expect(content.value!.characters.map((c: any) => c.id)).toContain('charlie');
    expect(await posterUrl(0)).toBe('blob:test');
    expect(localStorage.getItem('aim.pass')).toBe('friends-only-2026');
    forget();
    expect(content.value).toBeNull();
    expect(localStorage.getItem('aim.pass')).toBeNull();
  }, 30000);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
