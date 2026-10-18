// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { content, lang } from '../src/client/content';
import { config } from '../src/client/config';
import { App } from '../src/client/App';
import { view } from '../src/client/net';
import { MemoryBus } from '../src/client/bus/memory';
import { kdf } from '../src/client/bus/crypto';

kdf.iterations = 1000;   // tests only
import { setBusFactory, connectBus } from '../src/client/bus/connect';
import type { ServerMsg, View } from '../src/shared/types';

const has = fs.existsSync('content/content.json');
const maybe = has ? describe : describe.skip;

maybe('real <App/> in Firebase mode (host browser = server), in-memory bus', () => {
  it('host creates a room from the UI, friends join through the bus, host clicks through setup', async () => {
    const bus = new MemoryBus();
    setBusFactory(async () => bus);
    config.value = { transport: 'firebase', firebase: { databaseURL: 'https://example-default-rtdb.firebaseio.com' } };
    content.value = JSON.parse(fs.readFileSync('content/content.json', 'utf8'));
    lang.value = 'en';
    localStorage.setItem('aim.name', 'Giulia');
    localStorage.setItem('aim.pass', 'friends-pass');
    // the table (tablet/PC) opens the game and runs the server; Giulia's phone joins through the UI
    const tbl = await connectBus(bus, { code: 'ABC234', role: 'table', create: true, name: 'table', deviceId: 'tbl', pass: 'friends-pass', storage: { get: () => null, set: () => {} },
      onMsg: () => {}, onFatal: () => {} });
    location.hash = '#/r/ABC234';

    render(<App />);
    await screen.findByText('ABC234', {}, { timeout: 5000 });
    tbl!.send({ t: 'do', a: { type: 'setFacilitator', seat: 0 } });
    await waitFor(() => expect(view.value!.me.isHost).toBe(true), { timeout: 5000 });

    const remotes: { v: View | null; w: any }[] = [];
    for (const id of ['bea', 'carlo']) {
      const r: { v: View | null; w: any } = { v: null, w: null };
      r.w = await connectBus(bus, { code: 'ABC234', role: 'player', create: false, name: id, deviceId: id, pass: 'friends-pass', storage: { get: () => null, set: () => {} },
        onMsg: (m: ServerMsg) => { if (m.t === 'view') r.v = m.v; }, onFatal: () => {} });
      remotes.push(r);
    }
    await waitFor(() => expect(view.value!.players.length).toBe(3), { timeout: 5000 });
    await screen.findByText('carlo');

    fireEvent.click(screen.getByText('Start setup'));
    await waitFor(() => expect(view.value!.phase).toBe('safety'), { timeout: 5000 });
    await waitFor(() => expect(remotes.every((r) => r.v?.phase === 'safety')).toBe(true), { timeout: 5000 });   // friends follow through the bus
    await screen.findByText('Content warning');
    fireEvent.click(screen.getByText("I've read this and I'm in"));
    for (const r of remotes) r.w.send({ t: 'do', a: { type: 'consent' } });
    await waitFor(() => expect(view.value!.players.every((p) => p.consent)).toBe(true), { timeout: 5000 });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(view.value!.phase).toBe('intro'), { timeout: 5000 });
    await screen.findByText(/Silent Falls/);
    cleanup();
    remotes.forEach((r) => r.w.close()); tbl!.close();
    await new Promise((r) => setTimeout(r, 150));     // let queued UI effects finish before the simulated browser is torn down
  }, 30000);
});
