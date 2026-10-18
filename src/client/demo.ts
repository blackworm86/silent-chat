// Host demo: the whole game runs inside this page, with bot players, so the host can rehearse a session
// from lobby to debrief on one phone. No network, nothing stored, nothing remembered as "your games".
import { signal } from '@preact/signals';
import { Room } from '../shared/room';
import type { ServerMsg, View, ChatMsg, Hello } from '../shared/types';
import { connectLocal, disconnect, resetLocalView, setClockFn, deviceId } from './net';
import { botStep } from './botbrain';

export const DEMO_CODE = 'DEMO';
export const BOT_NAMES = ['Ada', 'Bruno', 'Celia', 'Dario'];

/** What the screen currently shows: TABLE (the tablet/PC), 0 = your phone, 1.. = a bot's phone. */
export const TABLE = -1;
export const demoSeat = signal(TABLE);
/** Game-time speed: 1 = real time, 30 = a 90-minute game in 3 minutes. */
export const demoSpeed = signal(1);
/** Bots act on their own (except the seat you are looking through). */
export const demoAuto = signal(true);
export const demoSeats = signal<{ seat: number; name: string }[]>([]);
export const demoActive = signal(false);
/** The demo control sheet (opened from the top bar or, in play, the floating pill). */
export const demoSheet = signal(false);

// ---- virtual clock ----
let base = 0, anchor = 0;
const now = () => base + (Date.now() - anchor) * demoSpeed.value;
export function setDemoSpeed(x: number) { base = now(); anchor = Date.now(); demoSpeed.value = x; }

interface Dev { id: string; name: string; view: View | null; chat: ChatMsg[]; busy: ReturnType<typeof setTimeout> | null; said: Set<string> }
let room: Room | null = null;
let devs: Dev[] = [];
let table: Dev | null = null;
let deliver: ((m: ServerMsg) => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const hello = (d: Dev, create = false): Hello => ({ t: 'hello', room: DEMO_CODE, deviceId: d.id, role: d === table ? 'table' : 'player', create, name: d.name });
const active = () => (demoSeat.value === TABLE ? table : devs[demoSeat.value]);

function route(id: string, m: ServerMsg) {
  const d = id === table?.id ? table : devs.find((x) => x.id === id);
  if (!d) return;
  if (m.t === 'view') d.view = m.v;
  if (m.t === 'chatHistory') d.chat = m.ms;
  if (m.t === 'chat') d.chat = [...d.chat, m.m];
  if (m.t === 'chatUpdate') d.chat = d.chat.map((x) => (x.id === m.m.id ? m.m : x));
  if (m.t === 'err' && m.code === 'deleted') { stopDemo(); location.hash = '#/'; return; }
  if (d === active()) deliver?.(m);
  else if ((m.t === 'view' || m.t === 'chat') && d !== table) schedule(d);
}

export function startDemo(hostName: string, bots = 3) {
  stopDemo();
  base = Date.now(); anchor = Date.now(); demoSpeed.value = 1; demoSeat.value = TABLE; demoAuto.value = true;
  setClockFn(now);
  // like a real evening: the table opens the game, then you and the bots join from your phones
  table = { id: 'demo-table', name: 'table', view: null, chat: [], busy: null, said: new Set() };
  devs = [{ id: deviceId(), name: hostName, view: null, chat: [], busy: null, said: new Set() }];
  room = new Room({ now, send: (id, m) => route(id, m) });
  connectLocal(DEMO_CODE, hostName, (onMsg) => {
    deliver = onMsg;
    return {
      send: (m) => {
        const d = active();
        if (!d || !room) return;
        // The demo clock is virtual: a real video would drag it back to real time every 2 s, so the demo is always on the manual clock.
        if (m.t === 'do' && m.a.type === 'reportVideo') return;
        if (m.t === 'do' && m.a.type === 'startGame') m = { t: 'do', a: { ...m.a, source: 'manual' } };
        room.receive(d.id, m);
      },
      close: () => { /* stopDemo owns teardown */ }
    };
  });
  room.open(table.id, hello(table, true));
  room.open(devs[0].id, hello(devs[0]));
  for (let i = 0; i < bots; i++) addBot();
  demoSeats.value = devs.map((x, seat) => ({ seat, name: x.name }));
  timer = setInterval(() => room?.tick(), 250);
  demoActive.value = true;
}

export function addBot() {
  if (!room?.s || room.s.phase !== 'lobby' || devs.length >= 5) return;
  const d: Dev = { id: 'demo-bot-' + devs.length, name: BOT_NAMES[devs.length - 1], view: null, chat: [], busy: null, said: new Set() };
  devs.push(d);
  room.open(d.id, hello(d));
  demoSeats.value = devs.map((x, seat) => ({ seat, name: x.name }));
}

export function stopDemo() {
  if (timer) clearInterval(timer);
  timer = null;
  devs.forEach((d) => d.busy && clearTimeout(d.busy));
  devs = []; table = null; room = null; deliver = null;
  setClockFn(null);
  demoActive.value = false; demoSeats.value = []; demoSheet.value = false;
  disconnect();
}

/** Look at the game through the table or another seat's phone (and play it by hand). */
export function viewAs(seat: number) {
  const d = seat === TABLE ? table : devs[seat];
  if (!room || !d || seat === demoSeat.value) return;
  demoSeat.value = seat;
  resetLocalView();
  if (d.busy) { clearTimeout(d.busy); d.busy = null; }
  room.open(d.id, hello(d));       // re-sends welcome, chat history and a fresh view to that seat
  devs.forEach((x, i) => i !== seat && schedule(x));
}

// ---- bots ----
function schedule(d: Dev) {
  if (!demoAuto.value || d.busy || d === active()) return;
  d.busy = setTimeout(() => { d.busy = null; act(d); }, 700 + Math.random() * 900);
}
export function nudgeBots() { devs.forEach((d) => schedule(d)); }

function act(d: Dev) {
  const v = d.view;
  if (!room || !v || v.me.seat === null || d === active() || !demoAuto.value) return;
  const you = demoSeat.value === TABLE ? 0 : demoSeat.value;
  botStep(d, (a) => room!.receive(d.id, { t: 'do', a }), (seat) => seat === you);
  if (d.view !== v) schedule(d);   // the world moved while we acted: look again
}

/** Act as any demo seat without switching the screen (used by tests and scripted walkthroughs). */
export function demoDo(seat: number, a: { type: string } & Record<string, unknown>) {
  const d = seat === TABLE ? table : devs[seat];
  if (room && d) room.receive(d.id, { t: 'do', a });
}
