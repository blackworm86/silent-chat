// Bot players' brain: shared by the one-device demo and by bots the table adds to a real game.
import { rules, cluesAt } from '../shared/rules';
import type { View, ChatMsg } from '../shared/types';
import { lang } from './content';

export interface BotState { name: string; view: View | null; chat: ChatMsg[]; said: Set<string> }
type Do = (a: { type: string } & Record<string, unknown>) => void;

/**
 * One decision for one bot player: what a reasonable player would do next in this phase.
 * `isHuman(seat)` says whose messages deserve an in-character answer (bots never chat among themselves).
 */
export function botStep(d: BotState, doIt: Do, isHuman: (seat: number) => boolean) {
  const v = d.view;
  if (!v || v.me.seat === null) return;
  const seat = v.me.seat;
  const me = v.players.find((p) => p.seat === seat)!;
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
    case 'play': playTurn(d, v, seat, doIt, once, isHuman); break;
    case 'final': once('final', () => doIt({ type: 'chat', to: 'group', text: line('final', seat) })); break;
    case 'debrief': once('real', () => doIt({ type: 'realName', text: d.name })); break;
    default: break;
  }
}

function playTurn(d: BotState, v: View, seat: number, doIt: Do, once: (k: string, f: () => void) => void, isHuman: (seat: number) => boolean) {
  if (v.lightsOut.active && v.lightsOut.by === seat) { once('lights' + v.flipped.length, () => setTimeout(() => doIt({ type: 'endLights' }), 4000)); return; }
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
  // answer the last message a person sent that reached us, once, in character (bots never chat among themselves)
  const last = [...d.chat].reverse().find((m) => m.kind === 'msg' && m.from !== null && isHuman(m.from) && !m.deleted && !m.ooc);
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

