import { describe, it, expect } from 'vitest';
import { MemoryBus } from '../src/client/bus/memory';
import { HostEngine } from '../src/client/bus/host';
import { openRemote } from '../src/client/bus/remote';
import { connectBus } from '../src/client/bus/connect';
import { deriveBusKey } from '../src/client/bus/crypto';
import type { ServerMsg, View, ChatMsg, Hello } from '../src/shared/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 3000, what = 'condition') {
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
    await until(() => host.view?.me.isHost === true, 3000, 'host view');
    const a = await device(bus, 'ROOM01', 'ann'), b = await device(bus, 'ROOM01', 'bob');
    await until(() => host.view!.players.length === 3 && a.view?.phase === 'lobby' && b.view?.phase === 'lobby', 3000, 'joined');
    const all = [host, a, b];
    const step = async (phase: string) => { host.send({ type: 'next' }); await until(() => all.every((d) => d.view?.phase === phase), 3000, 'phase ' + phase); };
    await step('safety'); all.forEach((d) => d.send({ type: 'consent' })); await until(() => host.view!.players.every((p) => p.consent), 3000, 'consent');
    await step('intro'); await step('characters');
    a.send({ type: 'pickCharacter', id: 'evan' }); b.send({ type: 'pickCharacter', id: 'julia' });
    await until(() => host.view!.players.every((p) => p.characterId), 3000, 'chars');
    await step('drives'); await step('intros');
    for (const d of all) { d.send({ type: 'introDone' }); await sleep(30); }
    await until(() => host.view!.players.every((p) => p.introDone), 3000, 'intros');
    await step('relations');
    all.forEach((d, i) => { d.send({ type: 'assignRelation', line: 0, target: (i + 1) % 3 }); d.send({ type: 'assignRelation', line: 1, target: (i + 2) % 3 }); });
    await until(() => host.view!.players.every((p) => p.relations[0] !== null && p.relations[1] !== null), 3000, 'relations');
    await step('voicemail'); all.forEach((d) => d.send({ type: 'voicemail', mime: 'audio/webm', b64: 'QUJDREVG' }));
    await until(() => host.view!.players.every((p) => p.vm), 3000, 'vms');
    await step('hunches'); for (const d of all) { d.send({ type: 'hunchDone' }); await sleep(30); }
    await until(() => host.view!.players.every((p) => p.hunchDone), 3000, 'hunches');
    await step('deal'); await step('rules');
    all.forEach((d) => d.send({ type: 'ready', value: true })); await until(() => host.view!.players.every((p) => p.ready), 3000, 'ready');
    await step('ready');
    host.send({ type: 'startGame', source: 'manual' });
    await until(() => all.every((d) => d.view?.phase === 'play'), 3000, 'play');
    await until(() => host.view!.hands.some((h) => h.ts === 90 && h.status === 'unlocked'), 3000, 'clue 90 unlock');
    host.send({ type: 'flipClue', ts: 90 });
    await until(() => host.view!.hands.find((h) => h.ts === 90)?.status === 'flipped', 3000, 'flip');
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
    await until(() => host.view !== null, 3000, 'host');
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
    await until(() => h1.room.s!.players.length === 3, 3000, 'joined');
    remotes[0].send({ t: 'do', a: { type: 'setName', name: 'Annabel' } });
    await until(() => h1.room.s!.players[1].name === 'Annabel', 3000, 'rename');
    await sleep(150);                                    // let the snapshot be saved
    await h1.stop();

    const msgs2: ServerMsg[] = [];
    const h2 = new HostEngine({ code: 'ROOM03', deviceId: 'host', bus, key, onLocal: (m) => msgs2.push(m), saveMs: 20, tickMs: 50, beatMs: 100 });
    expect(await h2.start('resume')).toBe('resumed');
    h2.openLocal({ t: 'hello', room: 'ROOM03', deviceId: 'host', role: 'player', create: true, name: 'Host' });
    await until(() => h2.room.conns.has('ann') && h2.room.conns.has('bob'), 3000, 'remotes re-announced after epoch change');
    expect(h2.room.s!.players.map((p) => p.name)).toEqual(['Host', 'Annabel', 'bob']);
    expect(h2.room.s!.players[1].seat).toBe(1);
    remotes[1].send({ t: 'do', a: { type: 'setName', name: 'Roberto' } });
    await until(() => h2.room.s!.players[2].name === 'Roberto', 3000, 'still working after restart');
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
    await until(() => h.room.conns.has('ann'), 3000, 'ann joined');
    expect(h.room.s!.players[1].connected).toBe(true);
    r1.close();                                         // phone loses signal
    await until(() => !h.room.conns.has('ann'), 3000, 'ann marked offline');
    expect(h.room.s!.players[1].connected).toBe(false);
    const r2 = openRemote({ code: 'ROOM04', deviceId: 'ann', hello, bus, key, pingMs: 40, onMsg: () => {} });  // same device returns
    await until(() => h.room.conns.has('ann') && h.room.s!.players[1].connected, 3000, 'ann back');
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
    await until(() => h.room.s!.players.length === 2, 3000, 'eve joined as a normal player');
    expect(h.room.s!.players[0].name).toBe('Host');
    expect(h.room.s!.players[1].isHost).toBe(false);
    expect(h.room.s!.players[1].deviceId).toBe('eve');
    r.close(); await h.stop();
  });
});
