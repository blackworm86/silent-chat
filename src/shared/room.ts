import {
  rules, clueById, cluesAt, clockToMs, type Effect
} from './rules';
import { nextRandom, randInt, shuffle } from './rng';
import { dealClues } from './deal';
import {
  PHASE_ORDER, type Phase, type Session, type Player, type Settings, type Sources,
  type CardRef, type ClueRun, type DeckKey, type ChatMsg, type View, type HandView,
  type ServerMsg, type Hello, type ClientMsg, type Intent, type IO, type TimerEntry
} from './types';

export const LENGTH_MS = rules.settings.gameLengthMinutes * 60000;
const MAX_VM_B64 = 1_500_000;

export function presetSources(mode: 'digital' | 'aids'): Sources {
  return mode === 'digital'
    ? { characters: 'digital', drives: 'digital', poster: 'digital', clues: 'digital', suspects: 'digital', locations: 'digital', search: 'digital', voicemail: 'digital', chat: 'app' }
    : { characters: 'physical', drives: 'physical', poster: 'physical', clues: 'physical', suspects: 'physical', locations: 'physical', search: 'physical', voicemail: 'digital', chat: 'app' };
}
export function defaultSettings(): Settings {
  return {
    mode: 'digital', sources: presetSources('digital'), soundDevice: 'host', dayOfWeek: 'saturday',
    includeBodyEnding: true, showSecretsWhileChoosing: false, videoOffsetSec: 0
  };
}

interface Ctx { deviceId: string; p: Player | null; table: boolean }
const clean = (t: unknown, n: number) => String(t ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const isOoc = (t: string) => /^\s*\(.*\)\s*$/s.test(t);

export class Room {
  s: Session | null = null;
  conns = new Map<string, { role: 'player' | 'table' }>();
  vms = new Map<number, { mime: string; b64: string }>();

  constructor(private io: IO) {}

  // ---------- persistence ----------
  snapshot(): string { return JSON.stringify({ s: this.s }); }
  static restore(io: IO, snap: string, vms: [number, { mime: string; b64: string }][] = []): Room {
    const r = new Room(io);
    const o = JSON.parse(snap);
    r.s = o.s; r.vms = new Map(vms);
    r.s?.players.forEach((p) => (p.connected = false));
    return r;
  }

  // ---------- connection lifecycle ----------
  open(deviceId: string, h: Hello): void {
    const now = this.io.now();
    if (!this.s) {
      if (!(h.create && h.role === 'player')) return this.send(deviceId, { t: 'err', code: 'no_room' });
      this.s = this.create(h.room, now);
    }
    const s = this.s;
    if (h.role === 'table') {
      s.tableDeviceId = deviceId;
      this.conns.set(deviceId, { role: 'table' });
      this.send(deviceId, { t: 'welcome', seat: null, role: 'table', isHost: false, now });
    } else {
      let p = s.players.find((x) => x.deviceId === deviceId);
      if (!p) {
        if (s.phase !== 'lobby') return this.send(deviceId, { t: 'err', code: 'started' });
        if (s.players.length >= 5) return this.send(deviceId, { t: 'err', code: 'full' });
        const isHost = s.players.length === 0;
        p = {
          seat: s.players.length, deviceId, name: clean(h.name, 20) || `P${s.players.length + 1}`,
          isHost, connected: true, characterId: isHost ? 'charlie' : null, driveId: null,
          consent: false, introDone: false, hunchDone: false, ready: false, identity: 'self',
          lock: null, relations: [null, null], vm: false, nudgedAt: null
        };
        s.players.push(p);
      }
      p.connected = true;
      this.conns.set(deviceId, { role: 'player' });
      this.send(deviceId, { t: 'welcome', seat: p.seat, role: 'player', isHost: p.isHost, now });
    }
    this.send(deviceId, { t: 'chatHistory', ms: this.chatFor(deviceId) });
    this.changed();
  }

  close(deviceId: string): void {
    this.conns.delete(deviceId);
    const p = this.s?.players.find((x) => x.deviceId === deviceId);
    if (p) p.connected = false;
    if (this.s) this.changed();
  }

  /** Host-only: tell every connected device the game is gone, forget it, and let the transport clean up. */
  private destroy(): void {
    for (const [deviceId] of this.conns) this.send(deviceId, { t: 'err', code: 'deleted' });
    this.conns.clear();
    this.s = null;
    this.vms.clear();
    this.io.destroy?.();
  }

  receive(deviceId: string, m: ClientMsg): void {
    if (m.t === 'ping') return this.send(deviceId, { t: 'pong', c: m.c, s: this.io.now() });
    if (!this.s || !this.conns.has(deviceId)) return;
    if (m.t === 'typing') {
      const p = this.player(deviceId);
      if (!p) return;
      this.toPlayers((d, seat) => m.to === 'group' ? seat !== p.seat : seat === m.to, { t: 'typing', from: p.seat, to: m.to });
      return;
    }
    if (m.t !== 'do') return;
    const ctx: Ctx = { deviceId, p: this.player(deviceId) ?? null, table: this.conns.get(deviceId)!.role === 'table' };
    try {
      this.handle(ctx, m.a);
    } catch (e: any) {
      this.send(deviceId, { t: 'err', code: 'bad', msg: String(e?.message ?? e) });
    }
    this.changed();
  }

  // ---------- time ----------
  remaining(now = this.io.now()): number {
    const c = this.s!.clock;
    if (c.running) return Math.max(0, c.lengthMs - (now - c.startedAt));
    return c.pausedRemainingMs ?? c.lengthMs;
  }

  tick(): void {
    const s = this.s;
    if (!s) return;
    const now = this.io.now();
    let dirty = false;
    for (const p of s.players) {
      if (p.lock && p.lock.until !== null && now >= p.lock.until) { p.lock = null; dirty = true; }
    }
    for (const r of s.clues) {
      if (r.delayEndsAt && !r.delayDone && now >= r.delayEndsAt) {
        r.delayDone = true; dirty = true;
        this.toast(r.holder, 'delayDone', { ts: r.ts });
      }
    }
    if (s.phase === 'play' && s.clock.running) {
      const rem = this.remaining(now);
      for (const r of s.clues) {
        if (r.status === 'locked' && rem <= r.ts * 60000) {
          r.status = 'unlocked'; r.unlockedAt = now; dirty = true;
          this.toast(r.holder, 'clueUnlocked', { ts: r.ts });
          if (r.holder === null) this.toastHost('tenUnassigned', { ts: r.ts });
        }
      }
      for (const t of s.timers) {
        if (!t.done && rem <= t.atMs) { t.done = true; this.runTimer(t); dirty = true; }
      }
      if (rem <= 0) {
        s.clock.running = false; s.clock.pausedRemainingMs = 0;
        this.enter('final'); dirty = true;
      }
    }
    if (dirty) this.changed();
  }

  // ---------- creation ----------
  private create(code: string, now: number): Session {
    const seed = (Math.floor(Math.random() * 0xffffffff) ^ now) | 0;
    return {
      code, createdAt: now, rev: 0, rng: seed, phase: 'lobby', settings: defaultSettings(),
      players: [], tableDeviceId: null, posterIndex: null, turn: null,
      decks: { suspect: { remaining: [], revealed: [] }, location: { remaining: [], revealed: [] }, search: { remaining: [], drawn: [] } },
      discard: [], clues: [], timers: [],
      results: { culprit: null, aliceLocation: null, accomplice: null, aliceCar: false },
      clock: { running: false, startedAt: 0, pausedRemainingMs: null, source: 'manual', lengthMs: LENGTH_MS },
      lightsOut: { active: false, by: null }, safety: { items: [], xCount: 0 },
      chat: [], nextId: 1, log: []
    };
  }

  // ---------- helpers ----------
  private get S(): Session { return this.s!; }
  private player(deviceId: string): Player | undefined { return this.S.players.find((p) => p.deviceId === deviceId); }
  private bySeat(seat: number): Player | undefined { return this.S.players.find((p) => p.seat === seat); }
  private host(): Player { return this.S.players.find((p) => p.isHost)!; }
  private rand() { return nextRandom(this.S); }
  private send(deviceId: string, m: ServerMsg) { this.io.send(deviceId, m); }
  private toPlayers(pred: (deviceId: string, seat: number) => boolean, m: ServerMsg) {
    for (const p of this.S.players) if (p.connected && pred(p.deviceId, p.seat)) this.send(p.deviceId, m);
  }
  private toast(seat: number | null, code: string, params?: Record<string, unknown>) {
    const p = seat === null ? undefined : this.bySeat(seat);
    if (p?.connected) this.send(p.deviceId, { t: 'toast', code, params });
  }
  private toastHost(code: string, params?: Record<string, unknown>) { this.toast(this.host().seat, code, params); }
  private log(code: string, params?: Record<string, unknown>) {
    this.S.log.push({ at: this.io.now(), code, params });
    if (this.S.log.length > 200) this.S.log.shift();
  }
  private err(ctx: Ctx, code: string): never { throw new Error(code); }
  private needHost(ctx: Ctx) { if (!ctx.p?.isHost) this.err(ctx, 'host_only'); }
  private needPlayer(ctx: Ctx): Player { if (!ctx.p) this.err(ctx, 'player_only'); return ctx.p!; }
  private isSound(deviceId: string): boolean {
    const s = this.S;
    if (s.settings.soundDevice === 'table') return s.tableDeviceId === deviceId;
    return this.player(deviceId)?.isHost ?? false;
  }
  private run(ts: number): ClueRun | undefined { return this.S.clues.find((r) => r.ts === ts); }

  private changed() {
    const s = this.s;
    if (!s) return;
    s.rev++;
    for (const [deviceId] of this.conns) this.send(deviceId, { t: 'view', v: this.project(deviceId) });
    this.io.persist?.(this.snapshot());
  }

  // ---------- chat ----------
  private canSee(m: ChatMsg, seat: number) { return m.to === 'group' || m.from === seat || m.to === seat; }
  private chatFor(deviceId: string): ChatMsg[] {
    const p = this.player(deviceId);
    if (!p) return [];
    return this.S.chat.filter((m) => this.canSee(m, p.seat));
  }
  private pushChat(m: Omit<ChatMsg, 'id' | 'at' | 'deleted'>): ChatMsg {
    const s = this.S;
    const full: ChatMsg = { ...m, id: s.nextId++, at: this.io.now(), deleted: false };
    s.chat.push(full);
    if (s.chat.length > 1500) s.chat.shift();
    this.toPlayers((_d, seat) => this.canSee(full, seat), { t: 'chat', m: full });
    return full;
  }
  private sys(code: string, params: Record<string, unknown> = {}, to: 'group' | number = 'group') {
    this.pushChat({ kind: 'system', from: null, as: null, to, text: '', ooc: false, code, params });
  }

  // ---------- clock ----------
  private startedClock(source: 'video' | 'manual') {
    const c = this.S.clock;
    c.running = true; c.startedAt = this.io.now(); c.pausedRemainingMs = null; c.source = source;
  }
  private pauseClock() {
    const c = this.S.clock;
    if (!c.running) return;
    c.pausedRemainingMs = this.remaining(); c.running = false;
  }
  private resumeClock() {
    const c = this.S.clock;
    if (c.running) return;
    c.startedAt = this.io.now() - (c.lengthMs - (c.pausedRemainingMs ?? c.lengthMs));
    c.running = true; c.pausedRemainingMs = null;
  }

  // ---------- phases ----------
  private blockers(phase: Phase): string[] {
    const s = this.S, b: string[] = [];
    const all = (f: (p: Player) => boolean) => s.players.every(f);
    switch (phase) {
      case 'lobby':
        if (s.players.length < 3) b.push('min_players');
        break;
      case 'safety': if (!all((p) => p.consent)) b.push('consent'); break;
      case 'intro': if (s.posterIndex === null) b.push('poster'); break;
      case 'characters': if (!all((p) => !!p.characterId)) b.push('characters'); break;
      case 'drives': if (!all((p) => !!p.driveId)) b.push('drives'); break;
      case 'intros': if (!all((p) => p.introDone)) b.push('intros'); break;
      case 'relations': if (!all((p) => p.relations[0] !== null && p.relations[1] !== null)) b.push('relations'); break;
      case 'voicemail': if (s.settings.sources.voicemail === 'digital' && !all((p) => p.vm)) b.push('voicemail'); break;
      case 'hunches': if (!all((p) => p.hunchDone)) b.push('hunches'); break;
      case 'rules': if (!all((p) => p.ready)) b.push('ready'); break;
      default: break;
    }
    return b;
  }

  private advance(force: boolean) {
    const s = this.S;
    if (s.phase === 'ready' || s.phase === 'play') throw new Error('use_start');
    const i = PHASE_ORDER.indexOf(s.phase);
    const next = PHASE_ORDER[i + 1];
    if (!next) return;
    const b = this.blockers(s.phase);
    if (b.length && !force) throw new Error('blocked:' + b.join(','));
    this.enter(next);
  }

  enter(phase: Phase) {
    const s = this.S;
    s.phase = phase;
    s.players.forEach((p) => (p.ready = false));
    switch (phase) {
      case 'intro':
        if (s.settings.sources.poster === 'digital') s.posterIndex = randInt(s, rules.posterCount);
        break;
      case 'drives':
        if (s.settings.sources.drives === 'digital') {
          const ds = shuffle(s, rules.drives.map((d) => d.id));
          s.players.forEach((p, i) => (p.driveId = ds[i]));
        }
        break;
      case 'intros': {
        const order = this.clockwise();
        s.turn = { kind: 'intros', order, idx: 0 };
        break;
      }
      case 'hunches': s.turn = { kind: 'hunches', order: this.clockwise(), idx: 0 }; break;
      case 'deal': s.turn = null; this.setupDecks(); this.dealAll(); break;
      case 'final':
        s.lightsOut = { active: false, by: null };
        s.players.forEach((p) => { if (p.lock?.reason !== 'captured') p.lock = null; });
        break;
      default: break;
    }
    this.log('phase', { phase });
  }

  private clockwise(): number[] {
    const h = this.host().seat, n = this.S.players.length;
    return Array.from({ length: n }, (_, i) => (h + i) % n);
  }

  private setupDecks() {
    const s = this.S;
    const expand = (xs: { id: string; copies: number }[]): CardRef[] =>
      xs.flatMap((x) => Array.from({ length: x.copies }, (_, c) => ({ id: x.id, copy: c + 1 })));
    s.decks.suspect = { remaining: shuffle(s, expand(rules.suspects)), revealed: [] };
    s.decks.location = { remaining: shuffle(s, expand(rules.locations)), revealed: [] };
    s.decks.search = { remaining: shuffle(s, rules.searchCards.map((c) => c.id)), drawn: [] };
    s.discard = []; s.timers = [];
    s.results = { culprit: null, aliceLocation: null, accomplice: null, aliceCar: false };
  }

  private dealAll() {
    const s = this.S;
    const seats = s.players.map((p) => p.seat);
    const hands = dealClues(s, seats, this.host().seat);
    const digitalClues = s.settings.sources.clues === 'digital';
    const pick = (ts: number): { variant: string | null; clueId: string | null } => {
      if (!digitalClues) return { variant: null, clueId: ts === 90 ? 'clue_90' : null };
      const cands = cluesAt(ts).filter((c) => s.settings.includeBodyEnding || !c.removableByFacilitator);
      const c = cands[randInt(s, cands.length)];
      return { variant: c.variant, clueId: c.id };
    };
    const holderOf = new Map<number, number>();
    for (const seat of seats) for (const ts of hands[seat]) holderOf.set(ts, seat);
    s.clues = rules.settings.clueSchedule.map((ts): ClueRun => {
      const { variant, clueId } = pick(ts);
      return {
        ts, holder: ts === 10 ? null : (holderOf.get(ts) ?? null), status: 'locked', variant, clueId,
        unlockedAt: null, flippedAt: null, delayEndsAt: null, delayDone: false,
        pendingDraw: null, pendingPick: null, drawn: null, needsTarget: null, target: null,
        oocDue: false, coins: []
      };
    });
  }

  // ---------- intents ----------
  private handle(ctx: Ctx, a: Intent) {
    const s = this.S;
    const T = a.type;

    // devices without a seat (table) may only do a few things
    if (ctx.table) {
      if (!['startGame', 'reportVideo', 'setClockSource', 'getVoicemails'].includes(T)) this.err(ctx, 'player_only');
    }

    switch (T) {
      // ---- lobby / settings ----
      case 'setName': { const p = this.needPlayer(ctx); p.name = clean(a.name, 20) || p.name; return; }
      case 'setSettings': {
        this.needHost(ctx);
        if (PHASE_ORDER.indexOf(s.phase) > PHASE_ORDER.indexOf('ready')) this.err(ctx, 'too_late');
        const st = s.settings;
        if (a.mode === 'digital' || a.mode === 'aids') { st.mode = a.mode; st.sources = presetSources(a.mode); }
        if (a.sources) { st.sources = { ...st.sources, ...a.sources }; st.mode = 'custom'; }
        if (a.soundDevice === 'host' || a.soundDevice === 'table') st.soundDevice = a.soundDevice;
        if (a.dayOfWeek === 'saturday' || a.dayOfWeek === 'sunday') st.dayOfWeek = a.dayOfWeek;
        if (typeof a.includeBodyEnding === 'boolean') st.includeBodyEnding = a.includeBodyEnding;
        if (typeof a.showSecretsWhileChoosing === 'boolean') st.showSecretsWhileChoosing = a.showSecretsWhileChoosing;
        if (typeof a.videoOffsetSec === 'number') st.videoOffsetSec = Math.max(0, Math.min(600, Math.round(a.videoOffsetSec)));
        return;
      }
      case 'next': this.needHost(ctx); this.advance(!!a.force); return;
      case 'back': {
        this.needHost(ctx);
        const i = PHASE_ORDER.indexOf(s.phase);
        if (i > 0 && i <= PHASE_ORDER.indexOf('rules')) s.phase = PHASE_ORDER[i - 1];
        return;
      }

      // ---- safety ----
      case 'consent': this.needPlayer(ctx).consent = true; return;
      case 'addSafety': { const p = this.needPlayer(ctx); this.addSafety(p, a.kind === 'veil' ? 'veil' : 'line', clean(a.text, 120)); return; }
      case 'removeSafety': {
        // only while the group is still agreeing on them (setup), by whoever added it or the host
        const p = this.needPlayer(ctx);
        if (s.phase !== 'safety') this.err(ctx, 'not_now');
        const i = s.safety.items.findIndex((x) => x.id === Number(a.id));
        if (i < 0) return;
        if (s.safety.items[i].by !== p.seat && !p.isHost) this.err(ctx, 'not_author');
        s.safety.items.splice(i, 1); return;
      }

      // ---- intro / characters / drives ----
      case 'pickPoster': {
        this.needPlayer(ctx);
        const i = Number(a.index);
        if (!(i >= 0 && i < rules.posterCount)) this.err(ctx, 'bad_index');
        s.posterIndex = i; return;
      }
      case 'pickCharacter': {
        const p = this.needPlayer(ctx);
        if (s.phase !== 'characters' || p.isHost) this.err(ctx, 'not_allowed');
        const c = rules.characters.find((x) => x.id === a.id);
        if (!c || c.facilitator) this.err(ctx, 'bad_character');
        if (s.players.some((x) => x.characterId === a.id && x !== p)) this.err(ctx, 'taken');
        p.characterId = a.id; return;
      }
      case 'unpickCharacter': { const p = this.needPlayer(ctx); if (!p.isHost) p.characterId = null; return; }
      case 'setDrive': {
        const p = this.needPlayer(ctx);
        if (!rules.drives.some((d) => d.id === a.id)) this.err(ctx, 'bad_drive');
        if (s.players.some((x) => x.driveId === a.id && x !== p)) this.err(ctx, 'taken');
        p.driveId = a.id; return;
      }

      // ---- introductions / hunches / relations ----
      case 'introDone': case 'hunchDone': {
        const p = this.needPlayer(ctx);
        const t = s.turn;
        if (!t || t.kind !== (T === 'introDone' ? 'intros' : 'hunches')) this.err(ctx, 'no_turn');
        const seat = t!.order[t!.idx];
        if (seat !== p.seat && !p.isHost) this.err(ctx, 'not_your_turn');
        const who = this.bySeat(seat)!;
        if (T === 'introDone') who.introDone = true; else who.hunchDone = true;
        t!.idx = Math.min(t!.idx + 1, t!.order.length - 1);
        // advance to next player who is not done
        while (t!.idx < t!.order.length - 1 && (T === 'introDone' ? this.bySeat(t!.order[t!.idx])!.introDone : this.bySeat(t!.order[t!.idx])!.hunchDone)) t!.idx++;
        return;
      }
      case 'assignRelation': {
        const p = this.needPlayer(ctx);
        const line = a.line === 1 ? 1 : 0, target = Number(a.target);
        if (target === p.seat || !this.bySeat(target)) this.err(ctx, 'bad_target');
        p.relations[line] = target; return;
      }

      // ---- voicemail ----
      case 'voicemail': {
        const p = this.needPlayer(ctx);
        const b64 = String(a.b64 ?? '');
        if (!b64 || b64.length > MAX_VM_B64) this.err(ctx, 'vm_size');
        const entry = { mime: clean(a.mime, 40) || 'audio/webm', b64 };
        this.vms.set(p.seat, entry);
        this.io.persistVm?.(p.seat, entry);
        p.vm = true; return;
      }
      case 'ready': { this.needPlayer(ctx).ready = !!a.value; return; }

      // ---- start / clock ----
      case 'startGame': {
        if (s.phase !== 'ready') this.err(ctx, 'not_ready');
        const okDevice = this.isSound(ctx.deviceId) || (ctx.p?.isHost && a.source === 'manual');
        if (!okDevice) this.err(ctx, 'not_sound_device');
        this.startedClock(a.source === 'video' ? 'video' : 'manual');
        s.phase = 'play';
        this.log('start');
        this.tick();
        return;
      }
      case 'pauseClock': this.needHost(ctx); this.pauseClock(); return;
      case 'resumeClock': this.needHost(ctx); this.resumeClock(); return;
      case 'nudgeClock': {
        this.needHost(ctx);
        const ms = Math.max(-60000, Math.min(60000, Number(a.ms) || 0));
        const c = s.clock;
        if (c.running) c.startedAt -= ms; else if (c.pausedRemainingMs !== null) c.pausedRemainingMs = Math.max(0, c.pausedRemainingMs - ms);
        return;
      }
      case 'setClock': {
        // recovery: the host puts the clock back on the minute the group had reached (manual clock from now on)
        this.needHost(ctx);
        const c = s.clock;
        const rem = Math.max(0, Math.min(c.lengthMs, Math.round(Number(a.remainingMs))));
        if (!isFinite(rem)) this.err(ctx, 'bad_value');
        c.source = 'manual';
        if (c.running) c.startedAt = this.io.now() - (c.lengthMs - rem); else c.pausedRemainingMs = rem;
        this.tick();
        return;
      }
      case 'setClockSource': {
        if (!(ctx.p?.isHost || this.isSound(ctx.deviceId))) this.err(ctx, 'not_allowed');
        s.clock.source = a.source === 'video' ? 'video' : 'manual'; return;
      }
      case 'reportVideo': {
        if (!this.isSound(ctx.deviceId) || s.clock.source !== 'video') return;
        if (s.phase !== 'play' && s.phase !== 'ready') return;
        const sec = Number(a.sec) - s.settings.videoOffsetSec;
        if (!isFinite(sec) || sec < 0) return;
        const now = this.io.now();
        const c = s.clock;
        if (a.playing) {
          const wantStart = now - sec * 1000;
          if (!c.running && s.phase === 'play') { c.running = true; c.startedAt = wantStart; c.pausedRemainingMs = null; }
          else if (Math.abs(c.startedAt - wantStart) > 400) c.startedAt = wantStart;
        } else if (c.running && s.phase === 'play') {
          c.pausedRemainingMs = Math.max(0, c.lengthMs - sec * 1000); c.running = false;
        }
        return;
      }

      // ---- play: clues ----
      case 'flipClue': this.flip(ctx, a); return;
      case 'chooseTarget': {
        const r = this.run(Number(a.ts));
        if (!r || !(ctx.p && (ctx.p.seat === r.holder || ctx.p.isHost))) this.err(ctx, 'not_holder');
        const target = Number(a.target);
        if (!this.bySeat(target)) this.err(ctx, 'bad_target');
        if (r!.needsTarget === 'ten') {
          const ten = this.run(10)!;
          ten.holder = target; r!.target = target; r!.needsTarget = null;
          this.log('tenGiven', { to: target });
        } else if (r!.needsTarget === 'ooc') {
          r!.target = target; r!.needsTarget = null;
        } else this.err(ctx, 'no_target_needed');
        return;
      }
      case 'reassignTen': {
        this.needHost(ctx);
        const t = Number(a.seat);
        if (!this.bySeat(t)) this.err(ctx, 'bad_target');
        const ten = this.run(10)!; if (ten.status === 'flipped') this.err(ctx, 'too_late');
        ten.holder = t; return;
      }
      case 'coin': {
        const r = this.run(Number(a.ts));
        if (!r || !(ctx.p && (ctx.p.seat === r.holder || ctx.p.isHost))) this.err(ctx, 'not_holder');
        const c = r!.coins.find((x) => x.idx === Number(a.idx));
        if (!c || !c.pending) this.err(ctx, 'no_coin');
        const res = a.result === 'heads' || a.result === 'tails' ? a.result : (this.rand() < 0.5 ? 'heads' : 'tails');
        this.applyCoin(r!, c!, res);
        return;
      }
      case 'endLights': {
        const by = s.lightsOut.by;
        if (!(ctx.p && (ctx.p.seat === by || ctx.p.isHost))) this.err(ctx, 'not_holder');
        s.lightsOut = { active: false, by: null }; return;
      }

      // ---- decks (digital + physical registration) ----
      case 'drawSearch': {
        const p = this.needPlayer(ctx);
        if (s.phase !== 'play') this.err(ctx, 'not_playing');
        const d = s.decks.search;
        if (!d.remaining.length) d.remaining = shuffle(s, d.drawn.map((x) => x.id)), d.drawn = [];
        const id = d.remaining.shift()!;
        d.drawn.push({ seat: p.seat, id, at: this.io.now() });
        this.sys('searchDrawn', { seat: p.seat });
        this.log('search', { seat: p.seat, id });
        return;
      }
      case 'registerSearch': {
        const p = this.needPlayer(ctx);
        const d = s.decks.search;
        const i = d.remaining.indexOf(a.id);
        if (i < 0) this.err(ctx, 'copies');
        d.remaining.splice(i, 1);
        d.drawn.push({ seat: p.seat, id: a.id, at: this.io.now() });
        this.sys('searchDrawn', { seat: p.seat });
        return;
      }
      case 'registerDraw': {
        this.needPlayer(ctx);
        const deck: DeckKey = a.deck === 'location' ? 'location' : 'suspect';
        const ref = this.takeFromRemaining(deck, String(a.id));
        if (!ref) this.err(ctx, 'copies');
        const forTs = a.forTs !== undefined ? this.run(Number(a.forTs)) : undefined;
        if (forTs && forTs.pendingDraw === deck) { forTs.drawn = ref!; forTs.pendingDraw = null; }
        this.log('draw', { deck, id: ref!.id, ts: forTs?.ts });
        return;
      }
      case 'unregisterDraw': {
        this.needPlayer(ctx);
        const deck: DeckKey = a.deck === 'location' ? 'location' : 'suspect';
        const d = s.decks[deck];
        const i = Number(a.index);
        if (!(i >= 0 && i < d.revealed.length)) this.err(ctx, 'bad_index');
        const [ref] = d.revealed.splice(i, 1);
        d.remaining.push(ref);
        if (s.results.culprit && s.results.culprit.id === ref.id && s.results.culprit.copy === ref.copy) s.results.culprit = null;
        if (s.results.aliceLocation && s.results.aliceLocation.id === ref.id && s.results.aliceLocation.copy === ref.copy) s.results.aliceLocation = null;
        return;
      }
      case 'pickResult': {
        const r = this.run(Number(a.ts));
        if (!r || !(ctx.p && (ctx.p.seat === r.holder || ctx.p.isHost))) this.err(ctx, 'not_holder');
        const kind = r!.pendingPick;
        if (!kind) this.err(ctx, 'no_pick');
        if (a.id) this.setResultFromRegistration(kind!, String(a.id), Number(a.copy) || 0);
        else this.autoPick(kind!);
        r!.pendingPick = null;
        return;
      }

      // ---- chat & safety ----
      case 'chat': this.chat(ctx, a); return;
      case 'chatDelete': {
        const p = this.needPlayer(ctx);
        const m = s.chat.find((x) => x.id === Number(a.id));
        if (!m || m.from !== p.seat) this.err(ctx, 'not_author');
        m!.deleted = true; m!.text = '';
        this.toPlayers((_d, seat) => this.canSee(m!, seat), { t: 'chatUpdate', m: m! });
        return;
      }
      case 'safety': {
        const p = this.needPlayer(ctx);
        const kind = a.kind === 'line' ? 'line' : a.kind === 'veil' ? 'veil' : 'x';
        this.safetyMessage(p, kind, clean(a.text, 120)); return;
      }

      // ---- host tools ----
      case 'nudgePlayer': {
        this.needHost(ctx);
        const p = this.bySeat(Number(a.seat));
        if (p?.connected) this.send(p.deviceId, { t: 'nudge', ts: a.ts });
        return;
      }
      case 'endGame': this.needHost(ctx); s.clock.running = false; s.clock.pausedRemainingMs = 0; this.enter('final'); return;
      case 'deleteRoom': this.needHost(ctx); this.destroy(); return;
      case 'getVoicemails': {
        if (!(this.isSound(ctx.deviceId) || ctx.p?.isHost)) this.err(ctx, 'not_allowed');
        const order = this.clockwise();
        const items = order.filter((seat) => this.vms.has(seat)).map((seat) => ({ seat, ...this.vms.get(seat)! }));
        this.send(ctx.deviceId, { t: 'vms', items });
        return;
      }
      case 'realName': {
        const p = this.needPlayer(ctx);
        if (s.phase !== 'debrief') this.err(ctx, 'not_debrief');
        this.pushChat({ kind: 'msg', from: p.seat, as: null, to: 'group', text: clean(a.text, 200), ooc: true });
        return;
      }
      default: this.err(ctx, 'unknown_intent');
    }
  }

  // ---------- safety ----------
  private addSafety(p: Player | null, kind: 'line' | 'veil', text: string) {
    if (!text) return;
    const s = this.S;
    s.safety.items.push({ id: s.nextId++, kind, text, by: p?.seat ?? null, at: this.io.now() });
  }
  private safetyMessage(p: Player, kind: 'x' | 'line' | 'veil', text: string) {
    const s = this.S;
    if (kind === 'x') { s.safety.xCount++; this.log('x', { seat: p.seat }); }
    else this.addSafety(p, kind, text);
    this.pushChat({ kind: 'safety', from: p.seat, as: null, to: 'group', text, ooc: true, safety: kind });
  }

  // ---------- chat ----------
  private chat(ctx: Ctx, a: Intent) {
    const s = this.S;
    const p = this.needPlayer(ctx);
    if (s.settings.sources.chat !== 'app') this.err(ctx, 'chat_external');
    if (s.phase !== 'play' && s.phase !== 'final') this.err(ctx, 'not_playing');
    const text = clean(a.text, 1000);
    if (!text) return;
    const to: 'group' | number = a.to === 'group' ? 'group' : Number(a.to);
    if (to !== 'group' && (!this.bySeat(to) || to === p.seat)) this.err(ctx, 'bad_target');
    // typed safety commands
    const mm = /^\(\s*(x|line|veil)\s*(?::\s*(.*?))?\s*\)$/is.exec(text);
    if (mm) { this.safetyMessage(p, mm[1].toLowerCase() as any, clean(mm[2], 120)); return; }
    const ooc = isOoc(text);
    if (p.lock && !ooc) {
      const allowStateReport = to !== 'group' && !p.lock.stateReportUsed && p.lock.reason !== 'mute';
      if (!allowStateReport) this.err(ctx, 'locked');
      p.lock.stateReportUsed = true;
    }
    if (s.phase === 'final') {
      // one last in-character message each
      const used = s.chat.some((m) => m.kind === 'msg' && m.from === p.seat && m.at >= (s.log.filter((l) => l.code === 'phase' && l.params?.phase === 'final').pop()?.at ?? 0) && !m.ooc);
      if (used && !ooc) this.err(ctx, 'final_used');
    }
    const rid = Number(a.replyTo);
    const quoted = rid ? s.chat.find((x) => x.id === rid && x.kind === 'msg' && this.canSee(x, p.seat)) : undefined;
    this.pushChat({ kind: 'msg', from: p.seat, as: p.identity === 'alice' ? 'alice' : p.characterId, to, text, ooc, ...(quoted ? { replyTo: quoted.id } : {}) });
  }

  // ---------- decks ----------
  private takeFromRemaining(deck: DeckKey, id: string): CardRef | null {
    const d = this.S.decks[deck];
    const i = d.remaining.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const [ref] = d.remaining.splice(i, 1);
    d.revealed.push(ref);
    return ref;
  }
  private drawDigital(deck: DeckKey): CardRef | null {
    const d = this.S.decks[deck];
    const ref = d.remaining.shift();
    if (!ref) return null;
    d.revealed.push(ref);
    return ref;
  }
  private srcOf(deck: DeckKey) { return this.S.settings.sources[deck === 'suspect' ? 'suspects' : 'locations']; }

  private autoPick(kind: 'culprit' | 'aliceLocation' | 'accomplice') {
    const s = this.S;
    if (kind === 'culprit') {
      const d = s.decks.suspect;
      if (!d.revealed.length) this.drawDigital('suspect');
      const pick = d.revealed[randInt(s, d.revealed.length)];
      this.setCulprit(pick);
    } else if (kind === 'aliceLocation') {
      const d = s.decks.location;
      if (!d.revealed.length) this.drawDigital('location');
      s.results.aliceLocation = d.revealed[randInt(s, d.revealed.length)];
      this.log('aliceLocation', { id: s.results.aliceLocation.id });
    } else {
      const culprit = s.results.culprit;
      const d = s.decks.suspect;
      let found: CardRef | null = null;
      while (d.remaining.length) {
        const c = d.remaining.shift()!;
        if (!culprit || c.id !== culprit.id) { found = c; break; }
        s.discard.push(c);
      }
      if (!found) found = d.revealed.find((c) => !culprit || c.id !== culprit.id) ?? null;
      if (found && !d.revealed.includes(found)) d.revealed.push(found);
      s.results.accomplice = found;
      this.log('accomplice', { id: found?.id });
    }
  }
  private setCulprit(ref: CardRef) {
    const s = this.S, d = s.decks.suspect;
    s.results.culprit = ref;
    const rest = d.revealed.filter((c) => !(c.id === ref.id && c.copy === ref.copy));
    d.remaining = [...shuffle(s, rest), ...d.remaining];
    d.revealed = [ref];
    this.log('culprit', { id: ref.id });
  }
  private setResultFromRegistration(kind: 'culprit' | 'aliceLocation' | 'accomplice', id: string, copy: number) {
    const s = this.S;
    if (kind === 'culprit') {
      const ref = s.decks.suspect.revealed.find((c) => c.id === id && (!copy || c.copy === copy));
      if (!ref) throw new Error('not_revealed');
      this.setCulprit(ref);
    } else if (kind === 'aliceLocation') {
      const ref = s.decks.location.revealed.find((c) => c.id === id && (!copy || c.copy === copy));
      if (!ref) throw new Error('not_revealed');
      s.results.aliceLocation = ref;
    } else {
      let ref = s.decks.suspect.revealed.find((c) => c.id === id && (!copy || c.copy === copy));
      if (!ref) ref = this.takeFromRemaining('suspect', id) ?? undefined;
      if (!ref) throw new Error('copies');
      s.results.accomplice = ref;
    }
  }

  // ---------- flipping and effects ----------
  private flip(ctx: Ctx, a: Intent) {
    const s = this.S;
    if (s.phase !== 'play') this.err(ctx, 'not_playing');
    const r = this.run(Number(a.ts));
    if (!r) this.err(ctx, 'bad_ts');
    const run = r!;
    if (!(ctx.p && (ctx.p.seat === run.holder || ctx.p.isHost))) this.err(ctx, 'not_holder');
    if (run.status === 'flipped') this.err(ctx, 'already');
    if (run.status === 'locked' && !ctx.p!.isHost) this.err(ctx, 'locked');
    if (run.holder === null) this.err(ctx, 'no_holder');
    if (!run.variant && run.ts !== 90) {
      const v = String(a.variant ?? '');
      const c = cluesAt(run.ts).find((x) => x.variant === v);
      if (!c) this.err(ctx, 'need_variant');
      run.variant = v; run.clueId = c!.id;
    }
    run.status = 'flipped'; run.flippedAt = this.io.now();
    this.sys('clueFlipped', { ts: run.ts, seat: run.holder });
    this.log('flip', { ts: run.ts, seat: run.holder });
    const clue = clueById.get(run.clueId!)!;
    clue.effects.forEach((e, idx) => this.applyEffect(run, e, idx));
    this.tick();
  }

  private applyEffect(run: ClueRun, e: Effect, idx: number) {
    const s = this.S;
    const holder = run.holder!;
    switch (e.type) {
      case 'draw': {
        const deck = e.deck as DeckKey;
        if (this.srcOf(deck) === 'digital') {
          const ref = this.drawDigital(deck);
          run.drawn = ref;
          this.log('draw', { deck, id: ref?.id, ts: run.ts });
        } else run.pendingDraw = deck;
        break;
      }
      case 'delay': run.delayEndsAt = this.io.now() + (e.minutes as number) * 60000; run.delayDone = false; break;
      case 'lightsOut': s.lightsOut = { active: true, by: holder }; break;
      case 'unlock': if (e.what === 'aliceCar') s.results.aliceCar = true; break;
      case 'drawFromRevealed': {
        const kind = e.result as 'culprit' | 'aliceLocation';
        const deck: DeckKey = kind === 'culprit' ? 'suspect' : 'location';
        if (this.srcOf(deck) === 'digital') this.autoPick(kind); else run.pendingPick = kind;
        break;
      }
      case 'giveCard': run.needsTarget = 'ten'; break;
      case 'muteSelf': {
        const p = this.bySeat(holder)!;
        p.lock = { until: this.io.now() + (e.minutes as number) * 60000, reason: 'mute', stateReportUsed: false };
        break;
      }
      case 'becomeAlice': {
        this.bySeat(holder)!.identity = 'alice';
        this.sys('becameAlice', { seat: holder });
        break;
      }
      case 'atClock': {
        const t: TimerEntry = { ts: run.ts, idx, atMs: clockToMs(e.clock as string), done: false };
        if (e.action === 'outOfCharacterMessage') run.needsTarget = 'ooc';
        this.S.timers.push(t);
        break;
      }
      default: break; // holder, prepareMessage, sendWhen, preface: client-side only
    }
  }

  private runTimer(t: TimerEntry) {
    const s = this.S;
    const run = this.run(t.ts);
    if (!run) return;
    const clue = clueById.get(run.clueId!)!;
    const e = clue.effects[t.idx];
    const holder = run.holder!;
    switch (e.action) {
      case 'coinFlip': {
        const c = { idx: t.idx, result: null as 'heads' | 'tails' | null, at: null as number | null, pending: true };
        run.coins.push(c);
        if (s.settings.sources.clues === 'digital') this.applyCoin(run, c, this.rand() < 0.5 ? 'heads' : 'tails');
        else this.toast(holder, 'coinPending', { ts: run.ts });
        break;
      }
      case 'outOfCharacterMessage': run.oocDue = true; this.toast(holder, 'oocDue', { ts: run.ts }); break;
      case 'drawTopUntilNot': {
        if (this.srcOf('suspect') === 'digital') this.autoPick('accomplice'); else run.pendingPick = 'accomplice';
        break;
      }
      case 'captured': {
        const p = this.bySeat(holder)!;
        p.lock = { until: null, reason: 'captured', stateReportUsed: false };
        this.sys('captured', { seat: holder });
        break;
      }
      default: break;
    }
  }

  private applyCoin(run: ClueRun, c: { idx: number; result: 'heads' | 'tails' | null; at: number | null; pending: boolean }, res: 'heads' | 'tails') {
    c.result = res; c.at = this.io.now(); c.pending = false;
    const e = clueById.get(run.clueId!)!.effects[c.idx];
    this.sys('coin', { ts: run.ts, seat: run.holder, result: res });
    if (res === 'tails' && e.tailsEffect?.type === 'lockChat') {
      const p = this.bySeat(run.holder!)!;
      p.lock = { until: null, reason: 'tails', stateReportUsed: false };
    }
  }

  // ---------- projection ----------
  project(deviceId: string): View {
    const s = this.S;
    const p = this.player(deviceId);
    const role = p ? 'player' : 'table';
    const now = this.io.now();
    const handOf = (r: ClueRun): HandView => ({
      ts: r.ts, status: r.status, variant: r.status === 'locked' ? null : r.variant, clueId: r.status === 'locked' ? null : r.clueId,
      delayEndsAt: r.delayEndsAt, delayDone: r.delayDone, pendingDraw: r.pendingDraw, pendingPick: r.pendingPick,
      drawn: r.drawn, needsTarget: r.needsTarget, target: r.target, oocDue: r.oocDue, coins: r.coins,
      isTenHeld: r.ts === 10
    });
    const hands = p ? s.clues.filter((r) => r.holder === p.seat).map(handOf) : [];
    const ten = s.clues.find((r) => r.ts === 10);
    const physicalClues = s.settings.sources.clues === 'physical';
    const taken = new Set(s.players.map((x) => x.characterId).filter(Boolean) as string[]);
    const missed = p?.isHost
      ? s.clues.filter((r) => r.status === 'unlocked' && r.holder !== null && r.unlockedAt !== null && now - r.unlockedAt > 60000).map((r) => r.ts)
      : [];
    return {
      code: s.code, rev: s.rev, phase: s.phase, settings: s.settings,
      me: { seat: p?.seat ?? null, role, isHost: !!p?.isHost, isSound: this.isSound(deviceId) },
      hostSeat: this.host()?.seat ?? 0,
      tableConnected: !!s.tableDeviceId && this.conns.has(s.tableDeviceId),
      players: s.players.map((x) => ({
        seat: x.seat, name: x.name, isHost: x.isHost, connected: x.connected,
        characterId: x.characterId, consent: x.consent, introDone: x.introDone, hunchDone: x.hunchDone,
        ready: x.ready, identity: x.identity, locked: !!x.lock, vm: x.vm, relations: x.relations
      })),
      posterIndex: s.posterIndex,
      myDriveId: p?.driveId ?? null,
      relationsToMe: p
        ? s.players.flatMap((q) => ([0, 1] as const).filter((l) => q.relations[l] === p.seat && q.driveId).map((l) => ({ from: q.seat, line: l, driveId: q.driveId! })))
        : [],
      availableCharacters: rules.characters.filter((c) => !c.facilitator && !taken.has(c.id)).map((c) => c.id),
      turn: s.turn, clock: s.clock, hands,
      plan: physicalClues && s.clues.length
        ? s.clues.filter((r) => r.holder !== null).map((r) => ({ seat: r.holder as number, ts: r.ts }))
        : null,
      centre: ten ? { ts: 10, held: ten.holder !== null } : null,
      flipped: s.clues.filter((r) => r.status === 'flipped').map((r) => ({ ts: r.ts, holder: r.holder, variant: r.variant })),
      decks: {
        suspect: { remaining: s.decks.suspect.remaining.length, revealed: s.decks.suspect.revealed },
        location: { remaining: s.decks.location.remaining.length, revealed: s.decks.location.revealed },
        searchRemaining: s.decks.search.remaining.length
      },
      mySearch: p ? s.decks.search.drawn.filter((d) => d.seat === p.seat).map((d) => ({ id: d.id, at: d.at })) : [],
      results: s.results, lightsOut: s.lightsOut, safety: s.safety,
      myLock: p?.lock ?? null, log: s.log.slice(-40),
      hostExtra: p?.isHost ? { missed } : null
    };
  }
}
