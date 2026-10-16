import { describe, it, expect, afterAll } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { createServer } from '../relay/relay';
import type { ServerMsg, View } from '../src/shared/types';

class Client {
  ws!: WebSocket; msgs: ServerMsg[] = []; view: View | null = null;
  constructor(public id: string, private port: number, private code: string) {}
  open(role: 'player' | 'table' = 'player', create = false) {
    return new Promise<void>((res) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws/${this.code}`);
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({ t: 'hello', room: this.code, deviceId: this.id, role, create, name: this.id }));
        res();
      });
      this.ws.on('message', (d) => { const m = JSON.parse(String(d)) as ServerMsg; this.msgs.push(m); if (m.t === 'view') this.view = m.v; });
    });
  }
  do(a: Record<string, unknown>) { this.ws.send(JSON.stringify({ t: 'do', a })); }
  async until(f: () => boolean, ms = 2000) { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 15)); } }
}

let server: import('node:http').Server;
afterAll(() => { server?.close(); });

describe('local relay over real WebSockets', () => {
  it('creates a room, joins, plays through setup and syncs state', async () => {
    server = await createServer(0);
    const port = (server.address() as AddressInfo).port;
    const a = new Client('a', port, 'ABCD'), b = new Client('b', port, 'ABCD'), c = new Client('c', port, 'ABCD'), tab = new Client('tab', port, 'ABCD');
    await a.open('player', true);
    await a.until(() => a.view?.phase === 'lobby');
    expect(a.view!.me.isHost).toBe(true);
    await b.open(); await c.open(); await tab.open('table');
    await a.until(() => a.view!.players.length === 3 && a.view!.tableConnected);
    a.do({ type: 'next' });
    await b.until(() => b.view?.phase === 'safety');
    for (const x of [a, b, c]) x.do({ type: 'consent' });
    await a.until(() => a.view!.players.every((p) => p.consent));
    a.do({ type: 'next' });
    await tab.until(() => tab.view?.phase === 'intro');
    expect(tab.view!.me.role).toBe('table');
    expect(tab.view!.posterIndex).not.toBeNull();
    // someone who has not created the room cannot open a room that does not exist
    const ghost = new Client('g', port, 'ZZZZ');
    await ghost.open();
    await ghost.until(() => ghost.msgs.some((m) => m.t === 'err'));
    expect(ghost.msgs.find((m) => m.t === 'err')).toMatchObject({ code: 'no_room' });
    // ping/pong
    a.ws.send(JSON.stringify({ t: 'ping', c: 7 }));
    await a.until(() => a.msgs.some((m) => m.t === 'pong' && m.c === 7));
    [a, b, c, tab, ghost].forEach((x) => x.ws.close());
  });

  it('reconnects with the same device id and keeps the seat', async () => {
    const port = (server.address() as AddressInfo).port;
    const a2 = new Client('a', port, 'ABCD');
    await a2.open();
    await a2.until(() => a2.view !== null);
    expect(a2.view!.me.seat).toBe(0);
    expect(a2.view!.me.isHost).toBe(true);
    a2.ws.close();
  });
});

describe('local relay: host deletes the game', () => {
  it('tells every device and drops the room', async () => {
    const { rooms } = await import('../relay/relay');
    server ??= await createServer(0);
    const port = (server.address() as AddressInfo).port;
    const a = new Client('ha', port, 'DELE'), b = new Client('hb', port, 'DELE');
    await a.open('player', true); await a.until(() => a.view?.phase === 'lobby');
    await b.open(); await a.until(() => a.view!.players.length === 2);
    b.do({ type: 'deleteRoom' });
    await b.until(() => b.msgs.some((m) => m.t === 'err'));
    expect(rooms.has('DELE')).toBe(true);                // not the host: refused
    a.do({ type: 'deleteRoom' });
    await b.until(() => b.msgs.some((m) => m.t === 'err' && m.code === 'deleted'));
    await a.until(() => !rooms.has('DELE'));
    const c = new Client('hc', port, 'DELE');
    await c.open();
    await c.until(() => c.msgs.some((m) => m.t === 'err'));
    expect(c.msgs.find((m) => m.t === 'err')).toMatchObject({ code: 'no_room' });
    [a, b, c].forEach((x) => x.ws.close());
  });
});
