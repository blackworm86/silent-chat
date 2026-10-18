// Bot players that the table adds to a REAL game (e.g. a test with one tablet and one phone as facilitator).
// Each bot connects exactly like a phone would (its own device id, through Firebase or the WebSocket server),
// so the game, the clock and the chat behave as on a real evening.
import { signal } from '@preact/signals';
import type { ServerMsg } from '../shared/types';
import type { Wire } from './bus/types';
import type { BusParams } from './bus/connect';
import { config, isFirebase } from './config';
import { getPass } from './content';
import { wsUrl } from './net';
import { botStep, type BotState } from './botbrain';
import { BOT_NAMES } from './demo';

interface Bot extends BotState { id: string; wire: Wire | null; busy: ReturnType<typeof setTimeout> | null; closed: boolean }
const bots: Bot[] = [];
let room = '';
export const tableBots = signal(0);

const key = (code: string) => 'aim.bots.' + code;
const isBotSeat = (seat: number) => bots.some((b) => b.view?.me.seat === seat);

function schedule(b: Bot) {
  if (b.busy || b.closed) return;
  b.busy = setTimeout(() => {
    b.busy = null;
    const v = b.view;
    botStep(b, (a) => b.wire?.send({ t: 'do', a }), (seat) => !isBotSeat(seat));
    if (b.view !== v) schedule(b);
  }, 900 + Math.random() * 1200);
}

function onMsg(b: Bot, m: ServerMsg) {
  if (m.t === 'view') b.view = m.v;
  else if (m.t === 'chatHistory') b.chat = m.ms;
  else if (m.t === 'chat') b.chat = [...b.chat, m.m];
  else if (m.t === 'chatUpdate') b.chat = b.chat.map((x) => (x.id === m.m.id ? m.m : x));
  else if (m.t === 'err' && ['deleted', 'no_room', 'started', 'full'].includes(m.code)) { b.closed = true; return; }
  if (m.t === 'view' || m.t === 'chat') schedule(b);
}

async function connectBot(code: string, b: Bot) {
  if (isFirebase()) {
    const { makeBus, connectBus } = await import('./bus/connect');
    const p: BusParams = {
      code, role: 'player', create: false, name: b.name, deviceId: b.id, pass: getPass(),
      onMsg: (m) => onMsg(b, m), onFatal: () => { b.closed = true; },
      storage: { get: () => null, set: () => {} }
    };
    b.wire = await connectBus(await makeBus(config.value.firebase), p);
  } else {
    const sock = new WebSocket(wsUrl(code));
    b.wire = { send: (m) => { if (sock.readyState === 1) sock.send(JSON.stringify(m)); }, close: () => sock.close() };
    sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', room: code, deviceId: b.id, role: 'player', name: b.name }));
    sock.onmessage = (ev) => { try { onMsg(b, JSON.parse(String(ev.data))); } catch { /* ignore */ } };
  }
}

function spawn(code: string, i: number) {
  const b: Bot = { id: `bot-${code}-${i}`, name: BOT_NAMES[i % BOT_NAMES.length], view: null, chat: [], said: new Set(), wire: null, busy: null, closed: false };
  bots.push(b);
  void connectBot(code, b).catch(() => { b.closed = true; });
}

/** Add one bot player (lobby only, at most 4 so a human always has a seat). */
export function addTableBot(code: string) {
  if (bots.length >= 4) return;
  spawn(code, bots.length);
  tableBots.value = bots.length;
  try { localStorage.setItem(key(code), String(bots.length)); } catch { /* ignore */ }
}

/** The table (re)opened this room: bring back the bots it had, with the same device ids, so they keep their seats. */
export function resumeTableBots(code: string) {
  stopTableBots();
  room = code;
  let n = 0;
  try { n = Math.min(4, Number(localStorage.getItem(key(code)) ?? 0) || 0); } catch { /* ignore */ }
  for (let i = 0; i < n; i++) spawn(code, i);
  tableBots.value = bots.length;
}

export function stopTableBots() {
  for (const b of bots) { b.closed = true; if (b.busy) clearTimeout(b.busy); try { b.wire?.close(); } catch { /* ignore */ } }
  bots.length = 0; room = ''; tableBots.value = 0;
}
export const tableBotsRoom = () => room;
