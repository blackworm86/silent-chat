// @vitest-environment jsdom
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { createServer } from '../relay/relay';
import { content, lang } from '../src/client/content';
import { App } from '../src/client/App';
import { view, chat } from '../src/client/net';

const has = fs.existsSync('content/content.json');
const maybe = has ? describe : describe.skip;
let server: import('node:http').Server;
afterAll(() => { server?.close(); });

function rawPlayer(port: number, code: string, id: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${code}`);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', room: code, deviceId: id, role: 'player', name: id })));
  return ws;
}

maybe('real <App/> against the relay (jsdom WebSocket)', () => {
  it('host creates a room from the UI, friends join, host walks the first phases with real clicks', async () => {
    (globalThis as any).WebSocket = WebSocket;   // browser-style API from the `ws` package (Node's built-in one clashes with jsdom events)
    server = await createServer(0);
    const port = (server.address() as AddressInfo).port;
    content.value = JSON.parse(fs.readFileSync('content/content.json', 'utf8'));
    lang.value = 'en';
    localStorage.setItem('aim.name', 'Giulia');
    history.replaceState(null, '', `/?ws=ws://127.0.0.1:${port}`);
    location.hash = '#/r/ABCD/new';

    render(<App />);
    await screen.findByText('ABCD', {}, { timeout: 4000 });                // lobby shows the room code
    expect(view.value!.me.isHost).toBe(true);
    expect(screen.getByText(/At least 3 players/)).toBeTruthy();

    const b = rawPlayer(port, 'ABCD', 'bea'), c = rawPlayer(port, 'ABCD', 'carlo');
    await waitFor(() => expect(view.value!.players.length).toBe(3), { timeout: 4000 });
    await screen.findByText('carlo');

    // switch to Chat + Game aids using the real button, then back to digital
    fireEvent.click(screen.getByText('Chat + Game aids'));
    await waitFor(() => expect(view.value!.settings.mode).toBe('aids'));
    fireEvent.click(screen.getByText('Full digital'));
    await waitFor(() => expect(view.value!.settings.mode).toBe('digital'));

    fireEvent.click(screen.getByText('Start setup'));
    await waitFor(() => expect(view.value!.phase).toBe('safety'));
    await screen.findByText('Content warning');
    fireEvent.click(screen.getByText("I've read this and I'm in"));
    await waitFor(() => expect(view.value!.players[0].consent).toBe(true));
    // the others consent through raw sockets
    for (const ws of [b, c]) ws.send(JSON.stringify({ t: 'do', a: { type: 'consent' } }));
    await waitFor(() => expect(view.value!.players.every((p) => p.consent)).toBe(true));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(view.value!.phase).toBe('intro'));
    await screen.findByText(/Silent Falls/);                                  // the intro card text (from the decrypted pack)
    // switch the UI language live
    lang.value = 'it';
    await screen.findByText('Introduzione');
    cleanup();
    expect(chat.value).toEqual([]);
    b.close(); c.close();
    await new Promise((r) => setTimeout(r, 150));     // let queued UI effects finish before teardown
  }, 20000);
});
