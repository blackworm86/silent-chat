// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/preact';
import { App, parseRoute } from '../src/client/App';
import { content, lang, forget, inviteUrl } from '../src/client/content';
import { config } from '../src/client/config';

const has = fs.existsSync('content/content.json');
const maybe = has ? describe : describe.skip;
const PASS = 'test-only-dummy-passphrase-1';
const ODD = 'a b+c&d=é#?';
const dirs = { plain: 'tmp-invite-pack-a', odd: 'tmp-invite-pack-b' };
let current = dirs.plain;

class FakeSocket { readyState = 0; onopen: any; onclose: any; onmessage: any; onerror: any; send() {} close() {} }

beforeAll(() => {
  if (!has) return;
  const mk = (dir: string, pass: string) => execFileSync('node', ['tools/pack.mjs', '--out', dir], { env: { ...process.env, PACK_PASSPHRASE: pass, PACK_ITERATIONS: '1000' }, stdio: 'pipe' });
  mk(dirs.plain, PASS); mk(dirs.odd, ODD);
  (globalThis as any).fetch = async (u: string) => {
    const name = String(u).split('/pack/')[1];
    if (!name) return { ok: false, json: async () => ({}) };
    const buf = fs.readFileSync(`${current}/${name}`);
    return { ok: true, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  (globalThis as any).WebSocket = FakeSocket;
  (URL as any).createObjectURL = () => 'blob:x';
});
afterAll(() => { for (const d of Object.values(dirs)) fs.rmSync(d, { recursive: true, force: true }); });
beforeEach(() => { cleanup(); forget(); localStorage.clear(); lang.value = 'en'; config.value = { transport: 'websocket' }; current = dirs.plain; });

maybe('invite links: only the host types the passphrase', () => {
  it('a friend opening an invite link is unlocked silently and the key disappears from the address bar', async () => {
    location.hash = '#/r/ABC234?k=' + encodeURIComponent(PASS);
    render(<App />);
    await waitFor(() => expect(content.value).not.toBeNull(), { timeout: 5000 });
    expect(localStorage.getItem('aim.pass')).toBe(PASS);
    await waitFor(() => expect(location.hash).not.toContain('k='));
    expect(location.hash).toBe('#/r/ABC234');
    await screen.findByText("What's your name?");                       // straight into the join flow, never asked for a passphrase
    expect(document.querySelector('input[type=password]')).toBeNull();
  });

  it('keys with spaces and special characters survive the link', async () => {
    current = dirs.odd;
    expect(parseRoute('#/r/ABC234?k=' + encodeURIComponent(ODD))!.key).toBe(ODD);
    location.hash = '#/t/ABC234?k=' + encodeURIComponent(ODD);
    render(<App />);
    await waitFor(() => expect(content.value).not.toBeNull(), { timeout: 5000 });
    expect(localStorage.getItem('aim.pass')).toBe(ODD);
  });

  it('a friend without an invite never gets a passphrase box', async () => {
    location.hash = '#/r/ABC234';
    render(<App />);
    await screen.findByText(/Open the invite link/);
    expect(document.querySelector('input')).toBeNull();
    expect(content.value).toBeNull();
  });

  it('a wrong key in the link shows a clear message', async () => {
    location.hash = '#/r/ABC234?k=not-the-key';
    render(<App />);
    await screen.findByText(/doesn't open the game/, {}, { timeout: 5000 });
    expect(content.value).toBeNull();
  });

  it('only the host start screen asks for the passphrase, and typing the right one opens the app', async () => {
    location.hash = '#/';
    render(<App />);
    const input = (await waitFor(() => { const el = document.querySelector('input[type=password]'); if (!el) throw new Error('no input'); return el; })) as HTMLInputElement;
    expect(screen.getByText(/Owner only/)).toBeTruthy();
    fireEvent.input(input, { target: { value: PASS } });
    const btn = screen.getByText('Unlock') as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));            // the button enables once something is typed
    fireEvent.click(btn);
    await waitFor(() => expect(content.value).not.toBeNull(), { timeout: 5000 });
    await screen.findByText('Start a game on this tablet/PC');
  });

  it('the invite link built for the QR carries the host key and round-trips', () => {
    localStorage.setItem('aim.pass', ODD);
    const url = inviteUrl('XYZ789', 'r');
    const hash = url.slice(url.indexOf('#'));
    expect(hash.startsWith('#/r/XYZ789?k=')).toBe(true);
    expect(parseRoute(hash)).toEqual({ role: 'r', code: 'XYZ789', create: false, key: ODD });
    expect(url).not.toContain(' ');
  });
});
