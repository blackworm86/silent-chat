import { describe, it, expect } from 'vitest';
import { MemoryBus } from '../src/client/bus/memory';
import { HostEngine } from '../src/client/bus/host';
import { openRemote } from '../src/client/bus/remote';
import { connectBus, deleteRoomOnBus } from '../src/client/bus/connect';
import { deriveBusKey, kdf } from '../src/client/bus/crypto';

kdf.iterations = 1000;   // tests only
import type { ServerMsg, View, ChatMsg, Hello } from '../src/shared/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 8000, what = 'condition') {
  const t = Date.now();
  while (!f()) { if (Date.now() - t > ms) throw new Error('timeout: ' + what); await sleep(8); }
}
const store = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) }; };

interface Dev { id: string; send(a: any): void; view: View | null; chat: ChatMsg[]; msgs: ServerMsg[]; wire: { send(m: any): void; close(): void } | null; offline: boolean }
async function device(bus: MemoryBus, code: string, id: string, o: { create?: boolean; role?: 'player' | 'table'; pass?: string; store?: ReturnType<typeof store> } = {}): Promise<Dev> {
  const d: Dev = { id, view: null, chat: [], msgs: [], wire: null, offline: false, send(a) { d.wire!.send({ t: 'do', a }); } };
  d.wire = await connectBus(bus, {
    code, role: o.role ?? 'player', create: !!o.create, name: id, deviceId: id, pass: o.pass ?? 'friends-pass', storage: o.store ?? store(),
    onMsg: (m) => { d.msgs.push(m); if (m.t === 'view') d.view = m.v; if (m.t === 'chat') d.chat.push(m.m); if (m.t === 'chatHistory') d.chat = [...m.ms]; },
    onFatal: () => {}, onHostState: (off) => { d.offline = off; }
  });
  return d;
}

describe('Firebase-style transport (host browser = server) over an in-memory bus', () => {
  it('runs a game: create, join, setup phases, start, flip a clue, chat; bus carries only ciphertext', async () => {
    const bus = new MemoryBus();
    const host = await device(bus, 'ROOM01', 'host', { create: true });
    await until(() => host.view?.me.isHost === true, 8000, 'host view');
    const a = await device(bus, 'ROOM01', 'ann'), b = await device(bus, 'ROOM01', 'bob');
    await until(() => host.view!.players.length === 3 && a.view?.phase === 'lobby' && b.view?.phase === 'lobby', 8000, 'joined');
    const all = [host, a, b];
    const seatOf = (d: Dev) => d.view!.me.seat!;
    const inTurnOrder = () => [...all].sort((x, y) => seatOf(x) - seatOf(y));      // seats follow join order, which is not deterministic
    const step = async (phase: string) => { host.send({ type: 'next' }); await until(() => all.every((d) => d.view?.phase === phase), 8000, 'phase ' + phase); };
    await step('safety'); all.forEach((d) => d.send({ type: 'consent' })); await until(() => host.view!.players.every((p) => p.consent), 8000, 'consent');
    await step('intro'); await step('characters');
    a.send({ type: 'pickCharacter', id: 'evan' }); b.send({ type: 'pickCharacter', id: 'julia' });
    await until(() => host.view!.players.every((p) => p.characterId), 8000, 'chars');
    await step('drives'); await step('intros');
    for (const d of inTurnOrder()) { d.send({ type: 'introDone' }); await sleep(30); }
    await until(() => host.view!.players.every((p) => p.introDone), 8000, 'intros');
    await step('relations');
    all.forEach((d) => { const s = seatOf(d); d.send({ type: 'assignRelation', line: 0, target: (s + 1) % 3 }); d.send({ type: 'assignRelation', line: 1, target: (s + 2) % 3 }); });
    await until(() => host.view!.players.every((p) => p.relations[0] !== null && p.relations[1] !== null), 8000, 'relations');
    await step('voicemail'); all.forEach((d) => d.send({ type: 'voicemail', mime: 'audio/webm', b64: 'QUJDREVG' }));
    await until(() => host.view!.players.every((p) => p.vm), 8000, 'vms');
    await step('hunches'); for (const d of inTurnOrder()) { d.send({ type: 'hunchDone' }); await sleep(30); }
    await until(() => host.view!.players.every((p) => p.hunchDone), 8000, 'hunches');
    await step('deal'); await step('rules');
    all.forEach((d) => d.send({ type: 'ready', value: true })); await until(() => host.view!.players.every((p) => p.ready), 8000, 'ready');
    await step('ready');
    host.send({ type: 'startGame', source: 'manual' });
    await until(() => all.every((d) => d.view?.phase === 'play'), 8000, 'play');
    await until(() => host.view!.hands.some((h) => h.ts === 90 && h.status === 'unlocked'), 8000, 'clue 90 unlock');
    host.send({ type: 'flipClue', ts: 90 });
    await until(() => host.view!.hands.find((h) => h.ts === 90)?.status === 'flipped', 8000, 'flip');
    // chat from a remote reaches everyone, in order
    for (let i = 0; i < 12; i++) a.send({ type: 'chat', to: 'group', text: 'msg-' + i + ' ciao-segreto' });
    await until(() => b.chat.filter((m) => m.kind === 'msg').length === 12 && host.chat.filter((m) => m.kind === 'msg').length === 12, 4000, 'chat');
    expect(b.chat.filter((m) => m.kind === 'msg').map((m) => m.text)).toEqual(Array.from({ length: 12 }, (_, i) => 'msg-' + i + ' ciao-segreto'));
    // privacy: nothing readable on the bus
    await sleep(100);
    const dump = bus.dump();
    for (const needle of ['ciao-segreto', 'consent', 'evan', 'startGame', 'QUJDREVG']) expect(dump.includes(needle), needle).toBe(false);
    for (const d of all) d.wire!.close();
  }, 30000);

  it('a device with the wrong passphrase can neither join nor read anything', async () => {
    const bus = new MemoryBus();
    const host = await device(bus, 'ROOM02', 'host', { create: true });
    await until(() => host.view !== null, 8000, 'host');
    const intruder = await device(bus, 'ROOM02', 'eve', { pass: 'not-the-passphrase' });
    await sleep(400);
    expect(intruder.view).toBeNull();
    expect(host.view!.players.length).toBe(1);
    host.wire!.close(); intruder.wire!.close();
  });

  it('an unknown room code is reported as no_room', async () => {
    const bus = new MemoryBus();
    let fatal = '';
    const w = await connectBus(bus, { code: 'NOPE99', role: 'player', create: false, name: 'x', deviceId: 'x', pass: 'p', storage: store(), onMsg: () => {}, onFatal: (c) => { fatal = c; } });
    expect(w).toBeNull(); expect(fatal).toBe('no_room');
  });

  it('host restart: the snapshot is restored, players keep their seats and re-announce themselves automatically', async () => {
    const bus = new MemoryBus();
    const key = await deriveBusKey('friends-pass', 'ROOM03');
    const hostMsgs: ServerMsg[] = [];
    const h1 = new HostEngine({ code: 'ROOM03', deviceId: 'host', bus, key, onLocal: (m) => hostMsgs.push(m), saveMs: 20, tickMs: 50, beatMs: 100 });
    await h1.start('create');
    h1.openLocal({ t: 'hello', room: 'ROOM03', deviceId: 'host', role: 'player', create: true, name: 'Host' });
    const mkHello = (id: string): Hello => ({ t: 'hello', room: 'ROOM03', deviceId: id, role: 'player', create: false, name: id });
    const views: Record<string, View | null> = { ann: null, bob: null };
    const remotes = ['ann', 'bob'].map((id) => openRemote({ code: 'ROOM03', deviceId: id, hello: mkHello(id), bus, key, pingMs: 60, onMsg: (m) => { if (m.t === 'view') views[id] = m.v; } }));
    await until(() => h1.room.s!.players.length === 3, 8000, 'joined');
    const byDev = (h: HostEngine, id: string) => h.room.s!.players.find((p) => p.deviceId === id)!;     // seat order depends on who's hello arrived first
    remotes[0].send({ t: 'do', a: { type: 'setName', name: 'Annabel' } });
    await until(() => byDev(h1, 'ann').name === 'Annabel', 8000, 'rename');
    const annSeat = byDev(h1, 'ann').seat;
    (h1.room as any).vms.set(annSeat, { mime: 'audio/webm', b64: 'QUJD' });
    (h1 as any).saveVm(annSeat, { mime: 'audio/webm', b64: 'QUJD' });
    await sleep(150);                                    // let the snapshot be saved
    await h1.stop();

    const msgs2: ServerMsg[] = [];
    const h2 = new HostEngine({ code: 'ROOM03', deviceId: 'host', bus, key, onLocal: (m) => msgs2.push(m), saveMs: 20, tickMs: 50, beatMs: 100 });
    expect(await h2.start('resume')).toBe('resumed');
    h2.openLocal({ t: 'hello', room: 'ROOM03', deviceId: 'host', role: 'player', create: true, name: 'Host' });
    await until(() => h2.room.conns.has('ann') && h2.room.conns.has('bob'), 8000, 'remotes re-announced after epoch change');
    expect(h2.room.s!.players.map((p) => p.name).sort()).toEqual(['Annabel', 'Host', 'bob']);
    expect(byDev(h2, 'ann').seat).toBe(annSeat);                 // same seat after the host restart
    expect(h2.room.vms.get(annSeat)).toEqual({ mime: 'audio/webm', b64: 'QUJD' });   // voicemails survive the restart
    expect(byDev(h2, 'host').isHost).toBe(true);
    remotes[1].send({ t: 'do', a: { type: 'setName', name: 'Roberto' } });
    await until(() => byDev(h2, 'bob').name === 'Roberto', 8000, 'still working after restart');
    remotes.forEach((r) => r.close()); await h2.stop();
  }, 20000);

  it('presence: a silent device is marked offline, and comes back by itself on its next message', async () => {
    const bus = new MemoryBus();
    const key = await deriveBusKey('friends-pass', 'ROOM04');
    const h = new HostEngine({ code: 'ROOM04', deviceId: 'host', bus, key, onLocal: () => {}, saveMs: 50, tickMs: 30, staleMs: 150, beatMs: 80 });
    await h.start('create');
    h.openLocal({ t: 'hello', room: 'ROOM04', deviceId: 'host', role: 'player', create: true, name: 'Host' });
    const hello: Hello = { t: 'hello', room: 'ROOM04', deviceId: 'ann', role: 'player', create: false, name: 'ann' };
    const r1 = openRemote({ code: 'ROOM04', deviceId: 'ann', hello, bus, key, pingMs: 40, onMsg: () => {} });
    await until(() => h.room.conns.has('ann'), 8000, 'ann joined');
    expect(h.room.s!.players[1].connected).toBe(true);
    r1.close();                                         // phone loses signal
    await until(() => !h.room.conns.has('ann'), 8000, 'ann marked offline');
    expect(h.room.s!.players[1].connected).toBe(false);
    const r2 = openRemote({ code: 'ROOM04', deviceId: 'ann', hello, bus, key, pingMs: 40, onMsg: () => {} });  // same device returns
    await until(() => h.room.conns.has('ann') && h.room.s!.players[1].connected, 8000, 'ann back');
    expect(h.room.s!.players.length).toBe(2);           // same seat, no duplicate
    r2.close(); await h.stop();
  }, 15000);

  it('a remote cannot pretend to be another device or to be the host', async () => {
    const bus = new MemoryBus();
    const key = await deriveBusKey('friends-pass', 'ROOM05');
    const h = new HostEngine({ code: 'ROOM05', deviceId: 'host', bus, key, onLocal: () => {}, tickMs: 50 });
    await h.start('create');
    h.openLocal({ t: 'hello', room: 'ROOM05', deviceId: 'host', role: 'player', create: true, name: 'Host' });
    const evil: Hello = { t: 'hello', room: 'ROOM05', deviceId: 'host', role: 'player', create: true, name: 'Evil' };   // claims to be the host
    const r = openRemote({ code: 'ROOM05', deviceId: 'eve', hello: evil, bus, key, pingMs: 1e6, onMsg: () => {} });
    await until(() => h.room.s!.players.length === 2, 8000, 'eve joined as a normal player');
    expect(h.room.s!.players[0].name).toBe('Host');
    expect(h.room.s!.players[1].isHost).toBe(false);
    expect(h.room.s!.players[1].deviceId).toBe('eve');
    r.close(); await h.stop();
  });
});

describe('Firebase-style transport: deleting a game', () => {
  it('host deletes from inside the room: remotes get "deleted", the bus is emptied', async () => {
    const bus = new MemoryBus();
    const fatals: Record<string, string[]> = { host: [], ann: [] };
    const join = (id: string, create = false) => connectBus(bus, {
      code: 'DEL001', role: 'player', create, name: id, deviceId: id, pass: 'friends-pass', storage: store(),
      onMsg: (m) => { if (m.t === 'err' && m.code === 'deleted') fatals[id].push('deleted'); }, onFatal: (c) => fatals[id].push(c)
    });
    const host = await join('host', true);
    await join('ann');
    await until(() => (bus as any).meta.has('DEL001'), 4000, 'room');
    await sleep(100);
    host!.send({ t: 'do', a: { type: 'deleteRoom' } });
    await until(() => fatals.ann.includes('deleted'), 6000, 'remote told');
    expect(fatals.host).toContain('deleted');
    await until(() => !(bus as any).meta.has('DEL001'), 6000, 'room removed');
    expect(await bus.loadSnapshot('DEL001')).toBeNull();
    // a late device cannot resurrect it as a player
    const late: string[] = [];
    const w = await connectBus(bus, { code: 'DEL001', role: 'player', create: false, name: 'x', deviceId: 'x', pass: 'friends-pass', storage: store(), onMsg: () => {}, onFatal: (c) => late.push(c) });
    expect(w).toBeNull();
    expect(late).toEqual(['no_room']);
  }, 20000);

  it('host deletes from the home screen (engine not running): connected devices still get "deleted"', async () => {
    const bus = new MemoryBus();
    const fatals: string[] = [];
    const s = store();
    const host = await connectBus(bus, { code: 'DEL002', role: 'player', create: true, name: 'h', deviceId: 'h', pass: 'p', storage: s, onMsg: () => {}, onFatal: () => {} });
    await connectBus(bus, { code: 'DEL002', role: 'player', create: false, name: 'a', deviceId: 'a', pass: 'p', storage: store(), onMsg: () => {}, onFatal: (c) => fatals.push(c) });
    host!.close();                                         // the host left the room page
    await sleep(50);
    await deleteRoomOnBus(bus, 'DEL002', 50);
    await until(() => fatals.includes('deleted'), 4000, 'remote told');
    expect(await bus.getMeta('DEL002')).toBeNull();
  }, 20000);
});
