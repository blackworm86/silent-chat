/// <reference types="@cloudflare/workers-types" />
// Cloudflare Worker + Durable Object. One DO per room code. Static assets (dist/) are served by the platform.
import { Room } from '../src/shared/room';
import type { ClientMsg, ServerMsg } from '../src/shared/types';

interface Env { ROOMS: DurableObjectNamespace }

export class RoomDO implements DurableObject {
  private room!: Room;
  private sockets = new Map<string, WebSocket>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;

  private io: import('../src/shared/types').IO;
  constructor(private state: DurableObjectState, _env: Env) {
    const io = {
      now: () => Date.now(),
      send: (deviceId: string, m: ServerMsg) => {
        const ws = this.sockets.get(deviceId);
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
      },
      persist: (snap: string) => this.schedulePersist(snap),
      persistVm: (seat: number, vm: { mime: string; b64: string }) => { void this.state.storage.put('vm:' + seat, vm).catch(() => { /* too large: ignore */ }); },
      destroy: () => {
        // the host deleted the game: erase everything stored for this room and hang up
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
        this.pending = null;
        void this.state.storage.deleteAll();
        setTimeout(() => { for (const ws of this.sockets.values()) { try { ws.close(1000, 'deleted'); } catch { /* ignore */ } } }, 50);
      }
    };
    this.io = io;
    this.state.blockConcurrencyWhile(async () => {
      const snap = await this.state.storage.get<string>('snap');
      if (!snap) { this.room = new Room(io); return; }
      const vms: [number, { mime: string; b64: string }][] = [];
      const list = await this.state.storage.list<{ mime: string; b64: string }>({ prefix: 'vm:' });
      for (const [k, v] of list) vms.push([Number(k.slice(3)), v]);
      this.room = Room.restore(io, snap, vms);
    });
  }

  private schedulePersist(snap: string) {
    this.pending = snap;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      if (this.pending) {
        const p = this.pending; this.pending = null;
        try { await this.state.storage.put('snap', p); await this.state.storage.setAlarm(Date.now() + 24 * 3600_000); } catch { /* ignore */ }
      }
    }, 3000);
  }

  private startTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      this.room.tick();
      if (this.sockets.size === 0) this.stopTicker();
    }, 1000);
  }
  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    if (this.pending) { void this.state.storage.put('snap', this.pending); this.pending = null; }
  }

  /** Rooms clean themselves up 24 h after their last activity. */
  async alarm() {
    if (this.sockets.size > 0) { await this.state.storage.setAlarm(Date.now() + 3600_000); return; }
    await this.state.storage.deleteAll();
    this.room = new Room(this.io);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    let deviceId: string | null = null;

    server.addEventListener('message', (ev: MessageEvent) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.t === 'hello') {
        if (!m.deviceId || String(m.deviceId).length > 64) return;
        const old = this.sockets.get(m.deviceId);
        if (old && old !== server) { try { old.close(1000, 'replaced'); } catch { /* ignore */ } }
        deviceId = m.deviceId;
        this.sockets.set(deviceId, server);
        this.room.open(deviceId, m);
        this.startTicker();
        return;
      }
      if (deviceId) this.room.receive(deviceId, m);
    });
    const gone = () => {
      if (deviceId && this.sockets.get(deviceId) === server) {
        this.sockets.delete(deviceId);
        this.room.close(deviceId);
      }
    };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{3,10})$/);
    if (m) {
      const id = env.ROOMS.idFromName(m[1].toUpperCase());
      return env.ROOMS.get(id).fetch(request);
    }
    return new Response('Not found', { status: 404 });
  }
};
