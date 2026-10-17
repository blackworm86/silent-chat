import { Room } from '../../shared/room';
import type { Hello, ClientMsg, ServerMsg, IO } from '../../shared/types';
import type { Bus, Unsub } from './types';
import { encJson, decJson, encText, decText } from './crypto';

export interface HostOpts {
  code: string; deviceId: string; bus: Bus; key: CryptoKey;
  onLocal: (m: ServerMsg) => void;
  now?: () => number; tickMs?: number; staleMs?: number; beatMs?: number; saveMs?: number; drainMs?: number;
}

/**
 * The game server running inside the HOST's browser (Firebase mode).
 * It owns the authoritative Room, reads device messages from the bus, and writes replies back.
 */
export class HostEngine {
  room!: Room;
  readonly epoch = Math.random().toString(36).slice(2, 10);
  private unsubs: Unsub[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private lastSeen = new Map<string, number>();
  private hellos = new Map<string, Hello>();
  private inChain: Promise<void> = Promise.resolve();
  private out = new Map<string, { q: ServerMsg[]; busy: boolean }>();
  private snap: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private doneHandled = false;

  constructor(private o: HostOpts) {}
  private now() { return this.o.now ? this.o.now() : Date.now(); }

  async start(mode: 'create' | 'resume'): Promise<'created' | 'resumed'> {
    const io: IO = {
      now: () => this.now(),
      send: (d, m) => this.sendOut(d, m),
      persist: (s) => this.queueSave(s),
      persistVm: (seat, vm) => { void this.saveVm(seat, vm); },
      destroy: () => { void this.destroyRoom(); }
    };
    let resumed = false;
    if (mode === 'resume') {
      const enc = await this.o.bus.loadSnapshot(this.o.code);
      if (enc) {
        const snap = await decText(this.o.key, enc);
        const vms: [number, { mime: string; b64: string }][] = [];
        for (const [seat, e] of await this.o.bus.loadVms(this.o.code)) vms.push([seat, JSON.parse(await decText(this.o.key, e))]);
        this.room = Room.restore(io, snap, vms);
        resumed = true;
      }
    }
    if (!resumed) this.room = new Room(io);
    await this.o.bus.setMeta(this.o.code, { epoch: this.epoch, hb: this.now(), created: this.now(), v: 1 });
    this.unsubs.push(this.o.bus.onHostQueue(this.o.code, (d, enc) => this.enqueueIn(d, enc)));
    this.timers.push(setInterval(() => this.tick(), this.o.tickMs ?? 1000));
    this.timers.push(setInterval(() => { void this.o.bus.beat(this.o.code, this.now()).catch(() => {}); }, this.o.beatMs ?? 5000));
    return resumed ? 'resumed' : 'created';
  }

  /** The host's own device (it is also a player). */
  openLocal(h: Hello) { this.hellos.set(h.deviceId, h); this.room.open(h.deviceId, h); }
  receiveLocal(m: ClientMsg) { this.room.receive(this.o.deviceId, m); }

  private enqueueIn(d: string, enc: string) {
    this.inChain = this.inChain.then(async () => {
      if (this.stopped) return;
      let m: ClientMsg;
      try { m = await decJson<ClientMsg>(this.o.key, enc); } catch { return; }
      this.handleRemote(d, m);
    });
  }

  private handleRemote(d: string, m: ClientMsg) {
    this.lastSeen.set(d, this.now());
    if (m.t === 'hello') {
      const h: Hello = { ...m, deviceId: d, create: false };      // never trust the claimed id / create flag
      this.hellos.set(d, h);
      this.room.open(d, h);
      return;
    }
    if (!this.room.conns.has(d)) {                               // e.g. after a network blip: silently re-attach
      const h = this.hellos.get(d);
      if (!h) return;
      this.room.open(d, h);
    }
    this.room.receive(d, m);
  }

  private tick() {
    if (this.stopped) return;
    this.room.tick();
    const now = this.now(), stale = this.o.staleMs ?? 30000;
    for (const [d, t] of this.lastSeen) if (now - t > stale && this.room.conns.has(d)) this.room.close(d);
    if (this.room.s?.phase === 'done' && !this.doneHandled) { this.doneHandled = true; void this.o.bus.removeRoom(this.o.code).catch(() => {}); }
  }

  private sendOut(d: string, m: ServerMsg) {
    if (d === this.o.deviceId) { this.o.onLocal(m); return; }
    let box = this.out.get(d);
    if (!box) this.out.set(d, (box = { q: [], busy: false }));
    if (m.t === 'view') box.q = box.q.filter((x) => x.t !== 'view');       // only the newest view matters
    box.q.push(m);
    void this.flush(d, box);
  }
  private async flush(d: string, box: { q: ServerMsg[]; busy: boolean }) {
    if (box.busy) return;
    box.busy = true;
    try {
      while (box.q.length && !this.stopped) {
        const m = box.q.shift()!;
        try { await this.o.bus.pushToDevice(this.o.code, d, await encJson(this.o.key, m)); } catch { /* drop */ }
      }
    } finally { box.busy = false; }
  }

  private queueSave(snap: string) {
    this.snap = snap;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; void this.saveNow(); }, this.o.saveMs ?? 1000);
  }
  /** Write the pending snapshot right away (page being hidden or reloaded). */
  saveSoon() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    void this.saveNow();
  }
  private async saveNow() {
    if (!this.snap) return;
    const s = this.snap; this.snap = null;
    try { await this.o.bus.saveSnapshot(this.o.code, await encText(this.o.key, s)); } catch { /* ignore */ }
  }
  /** Voicemails exist only here until stored: retry until the write succeeds (bad Wi-Fi must not lose them). */
  private async saveVm(seat: number, vm: { mime: string; b64: string }) {
    const enc = await encText(this.o.key, JSON.stringify(vm));
    for (let i = 0; i < 8 && !this.stopped; i++) {
      try { await this.o.bus.saveVm(this.o.code, seat, enc); return; } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** i)));
    }
  }

  /** The host deleted the game: flag it for every device, let the last messages drain, then erase the room. */
  private async destroyRoom() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.snap = null;
    this.timers.forEach(clearInterval); this.timers = [];
    this.unsubs.forEach((u) => u()); this.unsubs = [];
    try { await this.o.bus.setMeta(this.o.code, { epoch: this.epoch, hb: this.now(), created: this.now(), v: 1, closed: true }); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, this.o.drainMs ?? 1500));
    this.stopped = true;
    try { await this.o.bus.removeRoom(this.o.code); } catch { /* ignore */ }
  }

  async stop() {
    this.stopped = true;
    this.timers.forEach(clearInterval); this.unsubs.forEach((u) => u());
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    await this.saveNow();
  }
}
