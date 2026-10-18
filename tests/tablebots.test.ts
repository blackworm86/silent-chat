// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryBus } from '../src/client/bus/memory';
import { connectBus, setBusFactory } from '../src/client/bus/connect';
import { kdf } from '../src/client/bus/crypto';
import { config } from '../src/client/config';
import { addTableBot, stopTableBots, resumeTableBots } from '../src/client/tablebots';
import type { View } from '../src/shared/types';

kdf.iterations = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 15000, what = '') { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout ' + what); await sleep(20); } }
const store = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) }; };

afterEach(() => stopTableBots());

describe('bot players added by the table to a real game (one tablet + one phone)', () => {
  it('bots join like phones, take their seats and play the setup phases on their own', async () => {
    const bus = new MemoryBus();
    setBusFactory(async () => bus);
    config.value = { transport: 'firebase', firebase: { databaseURL: 'https://x.firebaseio.com' } };
    localStorage.setItem('aim.pass', 'friends-pass');
    let tv: View | null = null, hv: View | null = null;
    const table = await connectBus(bus, { code: 'BOTS01', role: 'table', create: true, name: 'table', deviceId: 'tbl', pass: 'friends-pass', storage: store(), onMsg: (m) => { if (m.t === 'view') tv = m.v; }, onFatal: () => {} });
    const phone = await connectBus(bus, { code: 'BOTS01', role: 'player', create: false, name: 'Riccardo', deviceId: 'me', pass: 'friends-pass', storage: store(), onMsg: (m) => { if (m.t === 'view') hv = m.v; }, onFatal: () => {} });
    await until(() => tv?.players.length === 1, 15000, 'phone joined');
    addTableBot('BOTS01'); addTableBot('BOTS01');
    await until(() => tv!.players.length === 3, 15000, 'bots joined');
    expect(tv!.players.map((p) => p.name).sort()).toEqual(['Ada', 'Bruno', 'Riccardo']);
    table!.send({ t: 'do', a: { type: 'setFacilitator', seat: hv!.me.seat } });
    await until(() => hv?.me.isHost === true, 15000, 'facilitator');
    phone!.send({ t: 'do', a: { type: 'next' } });
    await until(() => hv?.phase === 'safety', 15000, 'safety');
    await until(() => tv!.players.filter((p) => p.name !== 'Riccardo').every((p) => p.consent), 15000, 'bots consent');
    // the table reloads: the bots come back with the same seats, no duplicates
    resumeTableBots('BOTS01');
    await sleep(1500);
    expect(tv!.players.length).toBe(3);
    table!.close(); phone!.close();
  }, 40000);
});
