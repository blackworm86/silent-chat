import type { Bus, Meta, Unsub } from './types';

/** In-memory Bus with Firebase-like semantics (ordered child_added, initial replay, small random latency). Used by tests. */
export class MemoryBus implements Bus {
  private meta = new Map<string, Meta>();
  private metaL = new Map<string, Set<(m: Meta | null) => void>>();
  private q = new Map<string, { id: number; d: string; m: string }[]>();
  private qL = new Map<string, Set<(d: string, m: string) => void>>();
  private to = new Map<string, { id: number; m: string }[]>();
  private toL = new Map<string, Set<(m: string) => void>>();
  private snaps = new Map<string, string>();
  private vms = new Map<string, Map<number, string>>();
  private seq = 1;
  failWrites = false;

  private lat() { return new Promise<void>((r) => setTimeout(r, Math.random() * 3)); }

  async getMeta(c: string) { await this.lat(); return this.meta.get(c) ?? null; }
  async setMeta(c: string, m: Meta) { await this.lat(); this.meta.set(c, { ...m }); this.fireMeta(c); }
  async beat(c: string, hb: number) { await this.lat(); const m = this.meta.get(c); if (m) { m.hb = hb; this.fireMeta(c); } }
  private fireMeta(c: string) { const m = this.meta.get(c) ?? null; this.metaL.get(c)?.forEach((f) => setTimeout(() => f(m ? { ...m } : null), 1)); }
  onMeta(c: string, cb: (m: Meta | null) => void): Unsub {
    const s = this.metaL.get(c) ?? this.metaL.set(c, new Set()).get(c)!; s.add(cb);
    const m = this.meta.get(c); setTimeout(() => cb(m ? { ...m } : null), 1);
    return () => { s.delete(cb); };
  }

  async pushToHost(c: string, d: string, enc: string) {
    if (this.failWrites) throw new Error('offline');
    await this.lat();
    const arr = this.q.get(c) ?? this.q.set(c, []).get(c)!; arr.push({ id: this.seq++, d, m: enc });
    this.drainQ(c);
  }
  private drainQ(c: string) {
    const ls = this.qL.get(c); if (!ls || ls.size === 0) return;
    const arr = this.q.get(c) ?? [];
    while (arr.length) { const e = arr.shift()!; ls.forEach((f) => f(e.d, e.m)); }
  }
  onHostQueue(c: string, cb: (d: string, m: string) => void): Unsub {
    const s = this.qL.get(c) ?? this.qL.set(c, new Set()).get(c)!; s.add(cb);
    setTimeout(() => this.drainQ(c), 1);
    return () => { s.delete(cb); };
  }

  async pushToDevice(c: string, d: string, enc: string) {
    if (this.failWrites) throw new Error('offline');
    await this.lat();
    const k = c + '/' + d; const arr = this.to.get(k) ?? this.to.set(k, []).get(k)!; arr.push({ id: this.seq++, m: enc });
    this.drainTo(k);
  }
  private drainTo(k: string) {
    const ls = this.toL.get(k); if (!ls || ls.size === 0) return;
    const arr = this.to.get(k) ?? [];
    while (arr.length) { const e = arr.shift()!; ls.forEach((f) => f(e.m)); }
  }
  onDeviceQueue(c: string, d: string, cb: (m: string) => void): Unsub {
    const k = c + '/' + d; const s = this.toL.get(k) ?? this.toL.set(k, new Set()).get(k)!; s.add(cb);
    setTimeout(() => this.drainTo(k), 1);
    return () => { s.delete(cb); };
  }

  async saveSnapshot(c: string, enc: string) { await this.lat(); this.snaps.set(c, enc); }
  async loadSnapshot(c: string) { await this.lat(); return this.snaps.get(c) ?? null; }
  async saveVm(c: string, seat: number, enc: string) { await this.lat(); (this.vms.get(c) ?? this.vms.set(c, new Map()).get(c)!).set(seat, enc); }
  async loadVms(c: string) { await this.lat(); return [...(this.vms.get(c) ?? new Map()).entries()] as [number, string][]; }
  async removeRoom(c: string) { await this.lat(); this.meta.delete(c); this.snaps.delete(c); this.vms.delete(c); this.fireMeta(c); }

  /** every string currently stored (for "no plaintext on the bus" assertions) */
  dump(): string {
    return JSON.stringify([...this.q.values(), ...this.to.values()]) + [...this.snaps.values()].join('') + [...this.vms.values()].map((m) => [...m.values()].join('')).join('');
  }
}
