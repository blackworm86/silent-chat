// Host demo: the whole game runs inside this page, with bot players, so the host can rehearse a session
// from lobby to debrief on one phone. No network, nothing stored, nothing remembered as "your games".
import { signal } from '@preact/signals';
import { Room } from '../shared/room';
import { rules, cluesAt } from '../shared/rules';
import type { ServerMsg, View, ChatMsg, Hello } from '../shared/types';
import { connectLocal, disconnect, resetLocalView, setClockFn, deviceId } from './net';
import { lang } from './content';

export const DEMO_CODE = 'DEMO';
export const BOT_NAMES = ['Ada', 'Bruno', 'Celia', 'Dario'];

/** Seat the screen currently shows (0 = you, the host). */
export const demoSeat = signal(0);
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
let deliver: ((m: ServerMsg) => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const hello = (d: Dev, create = false): Hello => ({ t: 'hello', room: DEMO_CODE, deviceId: d.id, role: 'player', create, name: d.name });
const active = () => devs[demoSeat.value];

function route(id: string, m: ServerMsg) {
  const d = devs.find((x) => x.id === id);
  if (!d) return;
  if (m.t === 'view') d.view = m.v;
  if (m.t === 'chatHistory') d.chat = m.ms;
  if (m.t === 'chat') d.chat = [...d.chat, m.m];
  if (m.t === 'chatUpdate') d.chat = d.chat.map((x) => (x.id === m.m.id ? m.m : x));
  if (m.t === 'err' && m.code === 'deleted') { stopDemo(); location.hash = '#/'; return; }
  if (d === active()) deliver?.(m);
  else if (m.t === 'view' || m.t === 'chat') schedule(d);
}

export function startDemo(hostName: string, bots = 3) {
  stopDemo();
  base = Date.now(); anchor = Date.now(); demoSpeed.value = 1; demoSeat.value = 0; demoAuto.value = true;
  setClockFn(now);
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
  room.open(devs[0].id, hello(devs[0], true));
  for (let i = 0; i < bots; i++) addBot();
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
  devs = []; room = null; deliver = null;
  setClockFn(null);
  demoActive.value = false; demoSeats.value = []; demoSheet.value = false;
  disconnect();
}

/** Look at the game through another seat's phone (and play it by hand). */
export function viewAs(seat: number) {
  if (!room || !devs[seat] || seat === demoSeat.value) return;
  demoSeat.value = seat;
  resetLocalView();
  const d = devs[seat];
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
  const seat = v.me.seat;
  const me = v.players.find((p) => p.seat === seat)!;
  const doIt = (a: Record<string, unknown> & { type: string }) => room!.receive(d.id, { t: 'do', a });
  const once = (key: string, f: () => void) => { if (!d.said.has(key)) { d.said.add(key); f(); } };
  const others = v.players.filter((p) => p.seat !== seat);

  switch (v.phase) {
    case 'safety': if (!me.consent) doIt({ type: 'consent' }); break;
    case 'characters': if (!me.characterId && v.availableCharacters.length) doIt({ type: 'pickCharacter', id: v.availableCharacters[seat % v.availableCharacters.length] }); break;
    case 'drives':
      // the view only shows our own drive: try random ones until one is not taken
      if (!v.myDriveId) doIt({ type: 'setDrive', id: rules.drives[Math.floor(Math.random() * rules.drives.length)].id });
      break;
    case 'intros': case 'hunches': {
      const t = v.turn;
      const done = v.phase === 'intros' ? me.introDone : me.hunchDone;
      if (t && t.order[t.idx] === seat && !done) doIt({ type: v.phase === 'intros' ? 'introDone' : 'hunchDone' });
      break;
    }
    case 'relations':
      if (me.relations[0] === null) doIt({ type: 'assignRelation', line: 0, target: others[0].seat });
      else if (me.relations[1] === null) doIt({ type: 'assignRelation', line: 1, target: others[1 % others.length].seat });
      break;
    case 'voicemail': if (v.settings.sources.voicemail === 'digital' && !me.vm) doIt({ type: 'voicemail', mime: 'audio/wav', b64: toneWav(seat) }); break;
    case 'rules': if (!me.ready) doIt({ type: 'ready', value: true }); break;
    case 'play': playTurn(d, v, seat, doIt, once); break;
    case 'final': once('final', () => doIt({ type: 'chat', to: 'group', text: line('final', seat) })); break;
    case 'debrief': once('real', () => doIt({ type: 'realName', text: d.name })); break;
    default: break;
  }
  if (d.view !== v) schedule(d);   // the world moved while we acted: look again
}

function playTurn(d: Dev, v: View, seat: number, doIt: (a: { type: string } & Record<string, unknown>) => void, once: (k: string, f: () => void) => void) {
  if (v.lightsOut.active && v.lightsOut.by === seat) { once('lights' + v.flipped.length, () => setTimeout(() => room && doIt({ type: 'endLights' }), 4000)); return; }
  for (const h of v.hands) {
    if (h.status === 'unlocked') {
      const variant = h.variant ?? cluesAt(h.ts)[0]?.variant ?? undefined;
      doIt({ type: 'flipClue', ts: h.ts, variant });
      return;
    }
    if (h.status !== 'flipped') continue;
    if (h.needsTarget) { doIt({ type: 'chooseTarget', ts: h.ts, target: h.needsTarget === 'ten' ? v.hostSeat : v.players.find((p) => p.seat !== seat)!.seat }); return; }
    if (h.pendingPick) { doIt({ type: 'pickResult', ts: h.ts }); return; }
    if (h.pendingDraw) {
      const pool = h.pendingDraw === 'suspect' ? rules.suspects : rules.locations;
      doIt({ type: 'registerDraw', deck: h.pendingDraw, id: pool[Math.floor(Math.random() * pool.length)].id, forTs: h.ts });
      return;
    }
    const coin = h.coins.find((c) => c.pending);
    if (coin) { doIt({ type: 'coin', ts: h.ts, idx: coin.idx }); return; }
    if (h.oocDue && h.target !== null) once('ooc' + h.ts, () => doIt({ type: 'chat', to: h.target, text: `(${line('ooc', seat)})` }));
  }
  // answer the last message YOU sent that reached us, once, in character (bots never chat among themselves)
  const you = demoSeat.value;
  const last = [...d.chat].reverse().find((m) => m.kind === 'msg' && m.from === you && !m.deleted && !m.ooc);
  if (last && !d.said.has('re' + last.id) && (last.to === seat || Math.random() < 0.45)) {
    d.said.add('re' + last.id);
    doIt({ type: 'chat', to: last.to === 'group' ? 'group' : last.from, text: line('reply', seat + last.id), replyTo: last.to === 'group' ? last.id : undefined });
  }
}

const LINES = {
  it: {
    reply: ['Aspetta, cosa intendi?', 'Non ne sapevo niente…', "L'ultima volta che l'ho vista era venerdì.", 'Perché non me l\'hai detto prima?', 'Ho un brutto presentimento.', 'Controllo e ti scrivo.'],
    final: ['Alice, se leggi, torna a casa.', 'Non smetterò di cercarti.', 'Mi dispiace per tutto.'],
    ooc: ['messaggio fuori dal personaggio di prova']
  },
  en: {
    reply: ['Wait, what do you mean?', "I didn't know any of that…", 'The last time I saw her was Friday.', "Why didn't you tell me sooner?", 'I have a bad feeling about this.', "Let me check, I'll text you back."],
    final: ['Alice, if you read this, come home.', "I won't stop looking for you.", "I'm sorry for everything."],
    ooc: ['test out-of-character message']
  }
};
function line(kind: keyof typeof LINES.en, n: number) { const xs = LINES[lang.value][kind]; return xs[Math.abs(n) % xs.length]; }

/** A short, quiet, different tone per bot so the voicemail playback has something to play. */
function toneWav(seat: number): string {
  const rate = 8000, n = rate * 1.2, data = new Uint8Array(44 + n), dv = new DataView(data.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => data[o + i] = c.charCodeAt(0));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  const f = 330 + seat * 110;
  for (let i = 0; i < n; i++) data[44 + i] = 128 + Math.round(24 * Math.sin((2 * Math.PI * f * i) / rate) * Math.min(1, i / 400, (n - i) / 400));
  let bin = ''; data.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
