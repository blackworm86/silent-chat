import { signal, batch } from '@preact/signals';
import type { View, ChatMsg, ServerMsg, Intent, ClientMsg } from '../shared/types';
import type { Wire } from './bus/types';
import { config, isFirebase } from './config';
import { getPass } from './content';

export const view = signal<View | null>(null);
export const chat = signal<ChatMsg[]>([]);
export const conn = signal<'idle' | 'connecting' | 'open' | 'closed'>('idle');
export const fatal = signal<string | null>(null);       // no_room | started | full
export const hostOffline = signal(false);               // Firebase mode: the host's device is not answering
export const toasts = signal<{ id: number; code: string; params?: Record<string, unknown> }[]>([]);
export const typingMap = signal<Record<string, number>>({});
export const vmItems = signal<{ seat: number; mime: string; b64: string }[] | null>(null);
export const errors = signal<{ id: number; code: string }[]>([]);
export const nudge = signal<number>(0);

let wire: Wire | null = null;
let offset = 0;
const samples: number[] = [];
type Params = { room: string; role: 'player' | 'table'; create: boolean; name: string; local?: boolean; takeover?: boolean };
let params: Params | null = null;
let retry = 0;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 1;

export function deviceId(): string {
  let id = localStorage.getItem('aim.device');
  if (!id) {
    id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replaceAll('-', '').slice(0, 32);
    localStorage.setItem('aim.device', id);
  }
  return id;
}
/** The demo runs the game on a sped-up clock; everything that reads game time goes through here. */
let clockFn: (() => number) | null = null;
export function setClockFn(f: (() => number) | null) { clockFn = f; }
export const serverNow = () => (clockFn ? clockFn() : Date.now() + offset);

function wsUrl(room: string) {
  const override = new URLSearchParams(location.search).get('ws');
  if (override) return `${override.replace(/\/$/, '')}/ws/${room}`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/${room}`;
}

export function connect(room: string, role: 'player' | 'table', create: boolean, name: string, takeover = false) {
  disconnect();
  params = { room, role, create, name, takeover };
  fatal.value = null; retry = 0; offset = 0; samples.length = 0;
  if (isFirebase()) void openBus(params); else openWs();
}

export function disconnect() {
  params = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  try { wire?.close(); } catch { /* ignore */ }
  wire = null;
  batch(() => { view.value = null; chat.value = []; conn.value = 'idle'; vmItems.value = null; hostOffline.value = false; });
}

// ---------------- transport 1: WebSocket (Cloudflare Worker or local relay) ----------------
function openWs() {
  if (!params) return;
  conn.value = 'connecting';
  const p = params;
  let sock: WebSocket;
  try { sock = new WebSocket(wsUrl(p.room)); } catch { scheduleReconnect(); return; }
  wire = { send: (m: ClientMsg) => { if (sock.readyState === 1) sock.send(JSON.stringify(m)); }, close: () => { sock.onclose = null; sock.close(); } };
  sock.onopen = () => {
    retry = 0;
    sock.send(JSON.stringify({ t: 'hello', room: p.room, deviceId: deviceId(), role: p.role, create: p.create, name: p.name, takeover: p.takeover }));
    conn.value = 'open';
    sendPing();
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(sendPing, 8000);
  };
  sock.onmessage = (ev) => { try { onMsg(JSON.parse(String(ev.data))); } catch { /* ignore */ } };
  sock.onclose = () => { conn.value = 'closed'; if (pingTimer) clearInterval(pingTimer); scheduleReconnect(); };
  sock.onerror = () => { /* onclose follows */ };
}
function scheduleReconnect() {
  if (!params || fatal.value) return;
  const d = Math.min(8000, 700 * 2 ** retry++);
  reconnectTimer = setTimeout(() => { if (params) { params.create = false; openWs(); } }, d);
}
function sendPing() { wire?.send({ t: 'ping', c: Date.now() }); }

// ---------------- transport 2: Firebase bus (host's browser is the server) ----------------
async function openBus(p: Params) {
  conn.value = 'connecting';
  try {
    const { makeBus, connectBus } = await import('./bus/connect');
    const bus = await makeBus(config.value.firebase);
    const w = await connectBus(bus, {
      code: p.room, role: p.role, create: p.create, name: p.name, deviceId: deviceId(), pass: getPass(), takeover: p.takeover,
      onMsg, onFatal: setFatal, onHostState: (off) => { hostOffline.value = off; }
    });
    if (params !== p) { w?.close(); return; }
    wire = w;
  } catch (e) {
    conn.value = 'closed';
    errors.value = [...errors.value.slice(-3), { id: seq++, code: 'firebase: ' + String((e as Error)?.message ?? e) }];
  }
}

// ---------------- transport 3: in-page (host demo, the game runs right here) ----------------
export function connectLocal(room: string, name: string, open: (deliver: (m: ServerMsg) => void) => Wire) {
  disconnect();
  params = { room, role: 'player', create: true, name, local: true };
  fatal.value = null;
  wire = open(onMsg);
  conn.value = 'open';
}
/** Demo seat switch: forget what the previous seat saw before the new one's state arrives. */
export function resetLocalView() { batch(() => { view.value = null; chat.value = []; vmItems.value = null; typingMap.value = {}; }); }

// ---------------- games this device runs as the table (for "Your games" on the home screen) ----------------
export interface MyGame { code: string; at: number }
const GAMES_KEY = 'aim.games';
export const myGames = signal<MyGame[]>(readGames());
function readGames(): MyGame[] {
  try { const g = JSON.parse(localStorage.getItem(GAMES_KEY) ?? '[]'); return Array.isArray(g) ? g.filter((x) => x && typeof x.code === 'string') : []; } catch { return []; }
}
function writeGames(g: MyGame[]) {
  myGames.value = g;
  try { localStorage.setItem(GAMES_KEY, JSON.stringify(g)); } catch { /* ignore */ }
}
function rememberGame(code: string) { if (!myGames.value.some((g) => g.code === code)) writeGames([{ code, at: Date.now() }, ...myGames.value].slice(0, 8)); }
export function forgetGame(code: string) {
  writeGames(myGames.value.filter((g) => g.code !== code));
  try { localStorage.removeItem('aim.host.' + code); localStorage.removeItem('aim.notes.' + code); localStorage.removeItem('aim.read.' + code); } catch { /* ignore */ }
}

function setFatal(code: string) {
  fatal.value = code;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (code === 'deleted' && params) forgetGame(params.room);
}

/**
 * Host only: delete a game for everyone. Works from inside the room (the engine broadcasts "deleted")
 * and from the home screen, where the room may not be running on this device.
 */
export async function deleteSession(code: string): Promise<void> {
  if (params?.room === code && wire) {
    if (params.local) { send({ type: 'deleteRoom' }); return; }
    send({ type: 'deleteRoom' });
  } else if (isFirebase()) {
    const { makeBus, deleteRoomOnBus } = await import('./bus/connect');
    await deleteRoomOnBus(await makeBus(config.value.firebase), code);
  } else {
    await new Promise<void>((resolve) => {
      let sock: WebSocket;
      try { sock = new WebSocket(wsUrl(code)); } catch { resolve(); return; }
      const done = () => { clearTimeout(timer); try { sock.close(); } catch { /* ignore */ } resolve(); };
      const timer = setTimeout(done, 4000);
      sock.onopen = () => {
        sock.send(JSON.stringify({ t: 'hello', room: code, deviceId: deviceId(), role: 'table', create: false, name: '' }));
        sock.send(JSON.stringify({ t: 'do', a: { type: 'deleteRoom' } }));
      };
      sock.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.t === 'err' && (['deleted', 'no_room'].includes(m.code) || m.msg === 'host_only')) done(); } catch { /* ignore */ } };
      sock.onerror = done;
    });
  }
  forgetGame(code);
}

// ---------------- shared message handling ----------------
function onMsg(m: ServerMsg) {
  switch (m.t) {
    case 'welcome': conn.value = 'open'; if (params?.role === 'table' && !params.local) rememberGame(params.room); break;
    case 'view': view.value = m.v; if (m.v.phase === 'done' && m.v.me.role === 'table' && !params?.local) forgetGame(m.v.code); break;
    case 'chatHistory': chat.value = m.ms; break;
    case 'chat': if (!chat.value.some((x) => x.id === m.m.id)) chat.value = [...chat.value, m.m]; break;
    case 'chatUpdate': chat.value = chat.value.map((x) => (x.id === m.m.id ? m.m : x)); break;
    case 'pong': {
      const rtt = Date.now() - m.c;
      samples.push(m.s + rtt / 2 - Date.now());
      if (samples.length > 7) samples.shift();
      const sorted = [...samples].sort((a, b) => a - b);
      offset = sorted[Math.floor(sorted.length / 2)];
      break;
    }
    case 'err':
      if (['no_room', 'started', 'full', 'deleted', 'table_taken', 'table_replaced'].includes(m.code)) setFatal(m.code);
      else { const id = seq++; errors.value = [...errors.value.slice(-3), { id, code: m.msg ?? m.code }]; setTimeout(() => dismissError(id), 6000); }
      break;
    case 'toast': {
      alertDevice(m.code);
      if (m.code === 'clueUnlocked') break;          // the play screen shows its own banner; a toast would cover the clock
      const id = seq++; toasts.value = [...toasts.value.slice(-4), { id, code: m.code, params: m.params }]; setTimeout(() => dismissToast(id), 8000); break; }
    case 'typing': {
      const key = m.to === 'group' ? 'group' : String(m.from);
      typingMap.value = { ...typingMap.value, [key]: Date.now() + 3500 };
      break;
    }
    case 'nudge': nudge.value = Date.now(); alertDevice('nudge'); break;
    case 'vms': vmItems.value = m.items; break;
  }
}

export function send(a: Intent) { wire?.send({ t: 'do', a }); }
export function sendTyping(to: 'group' | number) { wire?.send({ t: 'typing', to }); }
export function dismissToast(id: number) { toasts.value = toasts.value.filter((t) => t.id !== id); }
export function dismissError(id: number) { errors.value = errors.value.filter((t) => t.id !== id); }

// ---- attention: vibration + short beep ----
let audioCtx: AudioContext | null = null;
export function alertDevice(code: string) {
  if (!['clueUnlocked', 'nudge', 'delayDone', 'coinPending', 'oocDue', 'tenUnassigned'].includes(code)) return;
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
  try {
    audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.25);
  } catch { /* ignore */ }
}
export function unlockAudio() {
  try { audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)(); void audioCtx.resume(); } catch { /* ignore */ }
}
