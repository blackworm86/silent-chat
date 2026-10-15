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
type Params = { room: string; role: 'player' | 'table'; create: boolean; name: string };
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
export const serverNow = () => Date.now() + offset;

function wsUrl(room: string) {
  const override = new URLSearchParams(location.search).get('ws');
  if (override) return `${override.replace(/\/$/, '')}/ws/${room}`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/${room}`;
}

export function connect(room: string, role: 'player' | 'table', create: boolean, name: string) {
  disconnect();
  params = { room, role, create, name };
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
    sock.send(JSON.stringify({ t: 'hello', room: p.room, deviceId: deviceId(), role: p.role, create: p.create, name: p.name }));
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
      code: p.room, role: p.role, create: p.create, name: p.name, deviceId: deviceId(), pass: getPass(),
      onMsg, onFatal: (c) => { fatal.value = c; }, onHostState: (off) => { hostOffline.value = off; }
    });
    if (params !== p) { w?.close(); return; }
    wire = w;
  } catch (e) {
    conn.value = 'closed';
    errors.value = [...errors.value.slice(-3), { id: seq++, code: 'firebase: ' + String((e as Error)?.message ?? e) }];
  }
}

// ---------------- shared message handling ----------------
function onMsg(m: ServerMsg) {
  switch (m.t) {
    case 'welcome': conn.value = 'open'; break;
    case 'view': view.value = m.v; break;
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
      if (['no_room', 'started', 'full'].includes(m.code)) { fatal.value = m.code; if (reconnectTimer) clearTimeout(reconnectTimer); }
      else { const id = seq++; errors.value = [...errors.value.slice(-3), { id, code: m.msg ?? m.code }]; setTimeout(() => dismissError(id), 6000); }
      break;
    case 'toast': { const id = seq++; toasts.value = [...toasts.value.slice(-4), { id, code: m.code, params: m.params }]; alertDevice(m.code); setTimeout(() => dismissToast(id), 8000); break; }
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
