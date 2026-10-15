import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { view, send, chat, typingMap, sendTyping, toasts, dismissToast, errors, dismissError } from '../net';
import { C, tx, clueCard, clueVariants, cardName, searchText, charName, fmtClock, dayWord } from '../content';
import { t, Btn, Panel, Label, Muted, Avatar, seatName, Countdown, useRemaining, useNow, Modal, useLocalState, UnofficialTag, showUnofficial } from './common';
import { SoundPlayer } from './sound';
import { rules } from '../../shared/rules';
import type { View, HandView, CardRef, ChatMsg } from '../../shared/types';

// =====================================================================
// Clock bar
// =====================================================================
export function ClockBar({ v }: { v: View }) {
  const rem = useRemaining();
  const length = v.clock.lengthMs;
  const nextTs = [...rules.settings.clueSchedule].sort((a, b) => b - a).find((ts) => ts * 60000 < rem - 500);
  const lockedMine = v.myLock;
  return (
    <div class="clockbar">
      <div class="row between">
        <div class={`clock mono ${rem < 600000 ? 'hot' : ''}`}>{fmtClock(rem)}</div>
        <div class="right">
          <div class="label">{v.clock.running ? t('nextClue') : t('paused')}</div>
          <div class="amber-text">{nextTs !== undefined ? `${nextTs}:00` : '—'}</div>
        </div>
      </div>
      <div class="bar"><div class="fill" style={{ width: `${Math.min(100, (1 - rem / length) * 100)}%` }} />
        {rules.settings.clueSchedule.filter((x) => x !== 90).map((ts) => <i key={ts} class={ts * 60000 >= rem ? 'tick passed' : 'tick'} style={{ left: `${(1 - (ts * 60000) / length) * 100}%` }} />)}
      </div>
      {lockedMine && <div class="lockbar">{lockedMine.reason === 'mute' && lockedMine.until ? <>🔇 {t('muteBanner')} <Countdown until={lockedMine.until} /></> : <>🔒 {t('lockedBanner')}</>}</div>}
    </div>
  );
}

// =====================================================================
// Card tiles, table view
// =====================================================================
function Tile({ id, badges = [] }: { id: string; badges?: { cls: string; text: string }[] }) {
  const n = cardName(id);
  return (
    <div class="tile">
      <b>{n.name}</b>{n.sub && <div class="muted small">{n.sub}</div>}
      {badges.map((b, i) => <span key={i} class={`badge ${b.cls}`}>{b.text}</span>)}
    </div>
  );
}
function same(a: CardRef | null, b: CardRef) { return !!a && a.id === b.id && a.copy === b.copy; }

export function TableView({ v, big }: { v: View; big?: boolean }) {
  const r = v.results;
  const sus = v.decks.suspect.revealed, loc = v.decks.location.revealed;
  return (
    <div class={`stack ${big ? 'big' : ''}`}>
      <Panel>
        <Label>{t('suspects')} <span class="muted">· {t('inDeck', { n: v.decks.suspect.remaining })}</span></Label>
        <div class="tiles">
          {sus.length === 0 && <Muted>{t('noneRevealed')}</Muted>}
          {sus.map((c, i) => <Tile key={i} id={c.id} badges={[...(same(r.culprit, c) ? [{ cls: 'red', text: t('culprit') }] : []), ...(same(r.accomplice, c) ? [{ cls: 'amber', text: t('accomplice') }] : [])]} />)}
        </div>
        <Label>{t('locations')} <span class="muted">· {t('inDeck', { n: v.decks.location.remaining })}</span></Label>
        <div class="tiles">
          {loc.length === 0 && <Muted>{t('noneRevealed')}</Muted>}
          {loc.map((c, i) => <Tile key={i} id={c.id} badges={same(r.aliceLocation, c) ? [{ cls: 'teal', text: t('aliceHere') }] : []} />)}
        </div>
        {r.aliceCar && <p class="amber-text">🚗 {t('carUnlocked')}</p>}
      </Panel>
      <Panel>
        <Label>{t('revealedClues')}</Label>
        <div class="ts-row">
          {rules.settings.clueSchedule.map((ts) => {
            const f = v.flipped.find((x) => x.ts === ts);
            return <span key={ts} class={`ts small ${f ? 'on' : ''}`} title={f ? seatName(v, f.holder) : ''}>{ts}</span>;
          })}
        </div>
        <div class="muted small">{t('searchLeft', { n: v.decks.searchRemaining })}</div>
      </Panel>
      {v.safety.items.length > 0 && (
        <Panel><Label>{t('linesAndVeils')}</Label>{v.safety.items.map((i) => <div class="row" key={i.id}><span class={`tag ${i.kind}`}>{i.kind === 'line' ? t('line') : t('veil')}</span> {i.text}</div>)}</Panel>
      )}
    </div>
  );
}

// =====================================================================
// Registration grid (physical cards)
// =====================================================================
export function RegisterGrid({ deck, forTs, onClose }: { deck: 'suspect' | 'location' | 'search'; forTs?: number; onClose: () => void }) {
  const v = view.value!;
  if (deck === 'search') {
    return (
      <Modal title={t('registerSearch')} onClose={onClose}>
        <div class="stack">{rules.searchCards.map((s) => <Btn kind="ghost" key={s.id} onClick={() => { send({ type: 'registerSearch', id: s.id }); onClose(); }}>{searchText(s.id)}</Btn>)}</div>
      </Modal>
    );
  }
  const list = deck === 'suspect' ? rules.suspects : rules.locations;
  const revealed = v.decks[deck].revealed;
  return (
    <Modal title={deck === 'suspect' ? t('registerSuspect') : t('registerLocation')} onClose={onClose}>
      <div class="stack">
        {list.map((c) => {
          const left = c.copies - revealed.filter((r) => r.id === c.id).length;
          const n = cardName(c.id);
          return (
            <Btn kind="ghost" key={c.id} disabled={left <= 0} onClick={() => { send({ type: 'registerDraw', deck, id: c.id, forTs }); onClose(); }}>
              {n.name} {n.sub && <span class="muted"> · {n.sub}</span>} <span class="tag">×{Math.max(0, left)}</span>
            </Btn>
          );
        })}
        {revealed.length > 0 && (
          <><Label>{t('undoRegistration')}</Label>
            {revealed.map((c, i) => <Btn key={i} kind="ghost" small onClick={() => send({ type: 'unregisterDraw', deck, index: i })}>↩ {cardName(c.id).name}</Btn>)}</>
        )}
      </div>
    </Modal>
  );
}

// =====================================================================
// Clue cards
// =====================================================================
function ClueFace({ card }: { card: any }) {
  return (
    <div class="clueface">
      {card.top && <p class="italic">{tx(card.top)}</p>}
      <h3 class="amber-text">{tx(card.header)}</h3>
      {card.title && <h3>{tx(card.title)}</h3>}
      {card.subtitle && <p class="muted">{tx(card.subtitle)}</p>}
      <p class="big-text">{tx(card.body)}</p>
      {card.question && <p><b>{tx(card.question)}</b></p>}
      {card.box && <p class="boxed">{tx(card.box)}</p>}
      {card.footer && <p class="italic">{tx(card.footer)}</p>}
      {showUnofficial() && <UnofficialTag />}
    </div>
  );
}

function PlayerPick({ v, onPick, exclude }: { v: View; onPick: (seat: number) => void; exclude?: number }) {
  return <div class="chips">{v.players.filter((p) => p.seat !== exclude).map((p) => <button class="chip" key={p.seat} onClick={() => onPick(p.seat)}>{seatName(v, p.seat)}</button>)}</div>;
}

function EffectWidget({ e, idx, hand, card, v }: { e: any; idx: number; hand: HandView; card: any; v: View }) {
  const [grid, setGrid] = useState<null | 'suspect' | 'location'>(null);
  const [revealedPick, setRevealedPick] = useState(false);
  const digital = v.settings.sources.chat === 'app';
  switch (e.type) {
    case 'prepareMessage': {
      const text = tx(card.body);
      return (
        <Panel amber>
          <Label>{t('firstMessage')}</Label>
          <p class="bubble out">{text}</p>
          <Muted>{t('firstMessageHint')}</Muted>
          {digital
            ? <Btn onClick={() => send({ type: 'chat', to: 'group', text })}>{t('sendNow')}</Btn>
            : <Btn kind="ghost" onClick={() => navigator.clipboard?.writeText(text)}>{t('copyText')}</Btn>}
        </Panel>
      );
    }
    case 'draw': {
      if (hand.drawn) { const n = cardName(hand.drawn.id); return <Panel amber><Label>{e.deck === 'suspect' ? t('suspectDrawn') : t('locationDrawn')}</Label><h3>{n.name}</h3><Muted>{n.sub}</Muted></Panel>; }
      if (hand.pendingDraw === e.deck) return <Panel amber><Muted>{t('registerPrompt')}</Muted><Btn onClick={() => setGrid(e.deck)}>{t('registerCard')}</Btn>{grid && <RegisterGrid deck={grid} forTs={hand.ts} onClose={() => setGrid(null)} />}</Panel>;
      return null;
    }
    case 'delay':
      return hand.delayEndsAt
        ? <Panel amber>{hand.delayDone ? <p>✓ {t('delayDone')}</p> : <p>⏳ {t('delayRunning')} <Countdown until={hand.delayEndsAt} /></p>}</Panel>
        : null;
    case 'lightsOut':
      return v.lightsOut.active && v.lightsOut.by === v.me.seat
        ? <Panel amber><p>🔦 {t('lightsOutActive')}</p><Btn onClick={() => send({ type: 'endLights' })}>{t('lightsBack')}</Btn></Panel> : null;
    case 'unlock': return v.results.aliceCar ? <Panel amber><p>🚗 {t('carUnlocked')}</p></Panel> : null;
    case 'drawFromRevealed': {
      const kind = e.result as 'culprit' | 'aliceLocation';
      const res = v.results[kind];
      if (res) { const n = cardName(res.id); return <Panel amber><Label>{kind === 'culprit' ? t('culprit') : t('aliceHere')}</Label><h3>{n.name}</h3><Muted>{n.sub}</Muted></Panel>; }
      if (hand.pendingPick === kind) {
        const deck = kind === 'culprit' ? 'suspect' : 'location';
        return (
          <Panel amber>
            <Muted>{kind === 'culprit' ? t('pickCulpritHint') : t('pickAliceHint')}</Muted>
            <Btn onClick={() => send({ type: 'pickResult', ts: hand.ts })}>🎲 {t('letAppPick')}</Btn>
            <Btn kind="ghost" onClick={() => setRevealedPick(!revealedPick)}>{t('iPickedReal')}</Btn>
            {revealedPick && v.decks[deck].revealed.map((c, i) => <Btn key={i} kind="ghost" small onClick={() => send({ type: 'pickResult', ts: hand.ts, id: c.id, copy: c.copy })}>{cardName(c.id).name}</Btn>)}
          </Panel>
        );
      }
      return null;
    }
    case 'giveCard':
      if (hand.needsTarget === 'ten') return <Panel amber><Label>{t('giveTenTitle')}</Label><Muted>{t('giveTenHint')}</Muted><PlayerPick v={v} onPick={(s) => send({ type: 'chooseTarget', ts: hand.ts, target: s })} /></Panel>;
      if (hand.target !== null) return <Panel amber><p>🃏 {t('tenGivenTo', { name: seatName(v, hand.target) })}</p></Panel>;
      return null;
    case 'muteSelf': return <Panel amber><p>🔇 {t('muteNote')}</p></Panel>;
    case 'becomeAlice': return <Panel amber><p>📱 {t('becomeAliceNote')}</p></Panel>;
    case 'atClock': {
      const clock = e.clock as string;
      if (e.action === 'coinFlip') {
        const coin = hand.coins.find((c) => c.idx === idx);
        if (!coin) return <Panel><p>🪙 {t('coinAt', { clock })}</p></Panel>;
        if (coin.pending) return (
          <Panel amber>
            <p>🪙 {t('coinNow')}</p>
            <Btn onClick={() => send({ type: 'coin', ts: hand.ts, idx, result: 'random' })}>🎲 {t('flipDigitalCoin')}</Btn>
            <div class="row"><Btn kind="ghost" small onClick={() => send({ type: 'coin', ts: hand.ts, idx, result: 'heads' })}>{t('heads')}</Btn><Btn kind="ghost" small onClick={() => send({ type: 'coin', ts: hand.ts, idx, result: 'tails' })}>{t('tails')}</Btn></div>
          </Panel>
        );
        return <Panel amber><p>🪙 <b>{coin.result === 'heads' ? t('heads') : t('tails')}</b></p><p>{tx(coin.result === 'heads' ? e.heads : e.tails)}</p></Panel>;
      }
      if (e.action === 'outOfCharacterMessage') {
        if (hand.needsTarget === 'ooc') return <Panel amber><Label>{t('chooseOocTarget')}</Label><PlayerPick v={v} exclude={v.me.seat ?? undefined} onPick={(s) => send({ type: 'chooseTarget', ts: hand.ts, target: s })} /></Panel>;
        if (hand.oocDue) return <Panel amber><p>✉️ {t('oocNow', { name: seatName(v, hand.target) })}</p><p class="italic">{tx(e.note)}</p></Panel>;
        return <Panel><p>✉️ {t('oocAt', { clock, name: hand.target !== null ? seatName(v, hand.target) : '…' })}</p></Panel>;
      }
      if (e.action === 'drawTopUntilNot') {
        if (v.results.accomplice) { const n = cardName(v.results.accomplice.id); return <Panel amber><Label>{t('accomplice')}</Label><h3>{n.name}</h3></Panel>; }
        if (hand.pendingPick === 'accomplice') return <Panel amber><Muted>{t('pickAccompliceHint')}</Muted><Btn onClick={() => send({ type: 'pickResult', ts: hand.ts })}>🎲 {t('letAppPick')}</Btn><Btn kind="ghost" onClick={() => setGrid('suspect')}>{t('iPickedReal')}</Btn>
          {grid && <Modal title={t('registerSuspect')} onClose={() => setGrid(null)}>{rules.suspects.map((s) => <Btn key={s.id} kind="ghost" onClick={() => { send({ type: 'pickResult', ts: hand.ts, id: s.id }); setGrid(null); }}>{cardName(s.id).name}</Btn>)}</Modal>}</Panel>;
        return <Panel><p>🃏 {t('accompliceAt', { clock })}</p></Panel>;
      }
      if (e.action === 'captured') return <Panel><p>⛓ {t('capturedAt', { clock })}</p></Panel>;
      return null;
    }
    default: return null;
  }
}

export function ClueCardView({ hand, v }: { hand: HandView; v: View }) {
  const physical = v.settings.sources.clues === 'physical';
  const card = clueCard(hand.clueId);
  const title = hand.ts === 10 && hand.isTenHeld ? t('tenCard') : t('clueN', { n: hand.ts });
  if (hand.status === 'locked') return <Panel class="locked"><b>🔒 {title}</b> <span class="muted">{t('unlocksAt', { clock: `${hand.ts}:00` })}</span></Panel>;
  if (hand.status === 'unlocked') {
    return (
      <Panel amber>
        <h3>{title} — {t('readyToFlip')}</h3>
        {physical && hand.ts !== 90 ? (
          <>
            <Muted>{t('whichCardFlipped')}</Muted>
            {clueVariants(hand.ts).map((c: any) => (
              <button class="variant" key={c.id} onClick={() => send({ type: 'flipClue', ts: hand.ts, variant: c.variant })}>
                <b>{c.variant}</b> {tx(c.body).slice(0, 80)}…
              </button>
            ))}
          </>
        ) : <Btn kind="amber" onClick={() => send({ type: 'flipClue', ts: hand.ts })}>🂠 {t('flipCard')}</Btn>}
      </Panel>
    );
  }
  if (!card) return null;
  return (
    <Panel>
      <h3>{title}</h3>
      <ClueFace card={card} />
      <Muted>{t('shareWithGroup')}</Muted>
      {card.effects.map((e: any, i: number) => <EffectWidget key={i} e={e} idx={i} hand={hand} card={card} v={v} />)}
    </Panel>
  );
}

export function SearchPanel({ v }: { v: View }) {
  const [grid, setGrid] = useState(false);
  const digital = v.settings.sources.search === 'digital';
  return (
    <Panel>
      <Label>{t('searchDeck')}</Label>
      <Muted>{t('searchHint')}</Muted>
      {digital ? <Btn kind="ghost" disabled={v.decks.searchRemaining === 0} onClick={() => send({ type: 'drawSearch' })}>🔦 {t('drawSearch')}</Btn>
        : <Btn kind="ghost" onClick={() => setGrid(true)}>🔦 {t('registerSearch')}</Btn>}
      {v.mySearch.map((s, i) => <p class="searchcard" key={i}>{searchText(s.id)}</p>)}
      {grid && <RegisterGrid deck="search" onClose={() => setGrid(false)} />}
    </Panel>
  );
}

function CardsTab({ v }: { v: View }) {
  const hands = [...v.hands].sort((a, b) => b.ts - a.ts);
  return (
    <div class="stack">
      {hands.length === 0 && <Muted>{t('noCards')}</Muted>}
      {hands.map((h) => <ClueCardView key={h.ts} hand={h} v={v} />)}
      <SearchPanel v={v} />
      {v.settings.sources.clues === 'physical' && v.plan && (
        <Panel><Label>{t('dealPlan')}</Label>
          {v.players.map((p) => <div class="row" key={p.seat}><b>{seatName(v, p.seat)}</b><span class="ts-row">{v.plan!.filter((x) => x.seat === p.seat).map((x) => x.ts).sort((a, b) => b - a).map((ts) => <span class="ts small" key={ts}>{ts}</span>)}</span></div>)}
        </Panel>
      )}
    </div>
  );
}

// =====================================================================
// Chat
// =====================================================================
const readMap = signal<Record<string, number>>({});
const convOf = (m: ChatMsg, me: number): string | null =>
  m.to === 'group' ? 'group' : m.from === me ? String(m.to) : m.to === me ? String(m.from) : null;

export function unreadCount(v: View): number {
  const me = v.me.seat; if (me === null) return 0;
  return chat.value.filter((m) => m.kind !== 'system' && m.from !== me && !m.deleted && m.id > (readMap.value[convOf(m, me) ?? 'group'] ?? 0)).length;
}

function Bubble({ m, v, mine }: { m: ChatMsg; v: View; mine: boolean }) {
  if (m.deleted) return <div class="sysmsg">{t('msgRemoved')}</div>;
  if (m.kind === 'safety') {
    const who = seatName(v, m.from);
    const label = m.safety === 'x' ? t('xUsed', { name: who }) : m.safety === 'line' ? t('lineAdded', { name: who }) : t('veilAdded', { name: who });
    return <div class="sysmsg safety">⚠ {label}{m.text ? `: ${m.text}` : ''}</div>;
  }
  if (m.kind === 'system') {
    const p = m.params as any;
    const msg =
      m.code === 'clueFlipped' ? t('sysClueFlipped', { n: p.ts, name: seatName(v, p.seat) }) :
      m.code === 'searchDrawn' ? t('sysSearch', { name: seatName(v, p.seat) }) :
      m.code === 'coin' ? t('sysCoin', { name: seatName(v, p.seat), result: p.result === 'heads' ? t('heads') : t('tails') }) :
      m.code === 'becameAlice' ? t('sysAlice', { name: seatName(v, p.seat) }) :
      m.code === 'captured' ? t('sysCaptured', { name: seatName(v, p.seat) }) : m.code ?? '';
    return <div class="sysmsg">{msg}</div>;
  }
  const sender = m.as ? charName(m.as, seatName(v, m.from)) : seatName(v, m.from);
  return (
    <div class={`msgrow ${mine ? 'mine' : ''}`}>
      {!mine && <Avatar seat={m.from ?? 0} size={28} />}
      <div>
        {!mine && <div class="sender">{sender}</div>}
        <div class={`bubble ${mine ? 'out' : 'in'} ${m.ooc ? 'ooc' : ''}`}>{m.text}</div>
        {mine && <button class="del" aria-label={t('deleteMsg')} onClick={() => send({ type: 'chatDelete', id: m.id })}>×</button>}
      </div>
    </div>
  );
}

export function ChatTab({ v, groupOnly }: { v: View; groupOnly?: boolean }) {
  const me = v.me.seat!;
  const [conv, setConv] = useState<string>('group');
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const msgs = chat.value.filter((m) => convOf(m, me) === conv);
  const others = v.players.filter((p) => p.seat !== me);
  const lock = v.myLock;
  const now = useNow(1000);
  const typing = typingMap.value[conv === 'group' ? 'group' : conv] > now;
  const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;

  useEffect(() => { readMap.value = { ...readMap.value, [conv]: Math.max(readMap.value[conv] ?? 0, lastId) }; end.current?.scrollIntoView?.({ block: "end" }); }, [conv, lastId]);

  const submit = () => {
    const tt = text.trim(); if (!tt) return;
    send({ type: 'chat', to: conv === 'group' ? 'group' : Number(conv), text: tt });
    setText('');
  };
  const unreadOf = (k: string) => chat.value.filter((m) => m.kind !== 'system' && m.from !== me && !m.deleted && convOf(m, me) === k && m.id > (readMap.value[k] ?? 0)).length;

  return (
    <div class="chat">
      {!groupOnly && (
        <div class="convs">
          {['group', ...others.map((o) => String(o.seat))].map((k) => (
            <button class={`chip ${conv === k ? 'on' : ''}`} key={k} onClick={() => setConv(k)}>
              {k === 'group' ? t('group') : seatName(v, Number(k))}{unreadOf(k) > 0 && <span class="badge-n">{unreadOf(k)}</span>}
            </button>
          ))}
        </div>
      )}
      <div class="thread">
        {msgs.length === 0 && <Muted>{t('noMessages')}</Muted>}
        {msgs.map((m) => <Bubble key={m.id} m={m} v={v} mine={m.from === me && m.kind === 'msg'} />)}
        {typing && <div class="typing" aria-label={t('typing')}><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <div class="safety-row">
        <button class="xbtn" onClick={() => send({ type: 'safety', kind: 'x', text: '' })} aria-label={t('xCard')}>X</button>
        <button class="chip" onClick={() => { const s = prompt(t('lineWhat')); if (s) send({ type: 'safety', kind: 'line', text: s }); }}>{t('line')}</button>
        <button class="chip" onClick={() => { const s = prompt(t('veilWhat')); if (s) send({ type: 'safety', kind: 'veil', text: s }); }}>{t('veil')}</button>
        <span class="muted small">{t('oocHint')}</span>
      </div>
      <div class="composer">
        <input class="input" value={text} placeholder={lock ? t('chatLocked') : t('messageAs', { name: seatName(v, me, true) })}
          onInput={(e) => { const val = (e.target as HTMLInputElement).value; setText(val); if (Date.now() - lastTyping.current > 2500 && val) { lastTyping.current = Date.now(); sendTyping(conv === 'group' ? 'group' : Number(conv)); } }}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <Btn full={false} onClick={submit} label={t('send')}>➤</Btn>
      </div>
      {lock && <Muted>{t('lockedHint')}</Muted>}
    </div>
  );
}

// =====================================================================
// Notes (digital Character Record)
// =====================================================================
export function NotesTab({ v }: { v: View }) {
  const rec = C().characterRecord;
  const [notes, setNotes] = useLocalState<Record<string, string>>('aim.notes.' + v.code, {});
  const fld = (k: string, label: string) => (
    <label class="note"><span>{label}</span><textarea rows={2} value={notes[k] ?? ''} onInput={(e) => setNotes({ ...notes, [k]: (e.target as HTMLTextAreaElement).value })} /></label>
  );
  return (
    <div class="stack">
      <Panel>{fld('secret', tx(rec.secretLabel).replace(':', ''))}</Panel>
      <Panel><Label>{t('characters')}</Label>{C().characters.map((c: any) => fld('c_' + c.id, c.name))}</Panel>
      <Panel><Label>{t('locations')}</Label>{C().locations.map((l: any) => fld('l_' + l.id, tx(l.name)))}</Panel>
      <Panel><Label>{t('suspects')}</Label>{C().suspects.map((s: any) => fld('s_' + s.id, s.name))}</Panel>
      <Muted>{t('notesPrivate')}</Muted>
    </div>
  );
}

// =====================================================================
// Host panel
// =====================================================================
export function HostPanel({ v, onClose }: { v: View; onClose: () => void }) {
  const miss = v.hostExtra?.missed ?? [];
  return (
    <Modal title={t('hostPanel')} onClose={onClose}>
      <div class="stack">
        <Label>{t('clock')}</Label>
        <div class="row">
          {v.clock.running ? <Btn kind="ghost" onClick={() => send({ type: 'pauseClock' })}>⏸ {t('pause')}</Btn> : <Btn kind="ghost" onClick={() => send({ type: 'resumeClock' })}>▶ {t('resume')}</Btn>}
          <Btn kind="ghost" small onClick={() => send({ type: 'nudgeClock', ms: -1000 })}>−1s</Btn>
          <Btn kind="ghost" small onClick={() => send({ type: 'nudgeClock', ms: 1000 })}>+1s</Btn>
        </div>
        <Muted>{t('clockSource')}: {v.clock.source === 'video' ? t('srcVideo') : t('srcManual')}</Muted>
        {v.clock.source === 'video' && <Btn kind="ghost" small onClick={() => { send({ type: 'setClockSource', source: 'manual' }); send({ type: 'resumeClock' }); }}>{t('switchManual')}</Btn>}
        <Label>{t('nudgePlayers')}</Label>
        {miss.length > 0 && <Muted>{t('missedClues', { list: miss.join(', ') })}</Muted>}
        <div class="chips">{v.players.filter((p) => !p.isHost).map((p) => <button class="chip" key={p.seat} onClick={() => send({ type: 'nudgePlayer', seat: p.seat })}>🔔 {seatName(v, p.seat)}</button>)}</div>
        <Label>{t('reassignTen')}</Label>
        <div class="chips">{v.players.map((p) => <button class="chip" key={p.seat} onClick={() => send({ type: 'reassignTen', seat: p.seat })}>{seatName(v, p.seat)}</button>)}</div>
        <Label>{t('registered')}</Label>
        <div class="row"><Btn kind="ghost" small onClick={() => send({ type: 'endLights' })}>🔦 {t('lightsBack')}</Btn></div>
        <Btn kind="danger" onClick={() => { if (confirm(t('confirmEnd'))) { send({ type: 'endGame' }); onClose(); } }}>{t('endGame')}</Btn>
      </div>
    </Modal>
  );
}

// =====================================================================
// Overlays
// =====================================================================
export function LightsOut({ v }: { v: View }) {
  if (!v.lightsOut.active) return null;
  return (
    <div class="lights" role="alert">
      <div>🔦</div><p>{t('lightsOutText')}</p>
      {(v.me.seat === v.lightsOut.by || v.me.isHost) && <Btn kind="ghost" full={false} onClick={() => send({ type: 'endLights' })}>{t('lightsBack')}</Btn>}
    </div>
  );
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((x) => (
        <div class="toast" key={x.id} onClick={() => dismissToast(x.id)}>{toastText(x.code, x.params)}</div>
      ))}
      {errors.value.map((x) => <div class="toast err" key={x.id} onClick={() => dismissError(x.id)}>{errText(x.code)}</div>)}
    </div>
  );
}
function toastText(code: string, p?: Record<string, unknown>): string {
  switch (code) {
    case 'clueUnlocked': return t('toastClue', { n: String(p?.ts) });
    case 'delayDone': return t('toastDelay');
    case 'coinPending': return t('toastCoin');
    case 'oocDue': return t('toastOoc');
    case 'tenUnassigned': return t('toastTen');
    case 'nudge': return t('toastNudge');
    default: return code;
  }
}
function errText(code: string): string {
  const map: Record<string, any> = { locked: 'errLocked', copies: 'errCopies', not_holder: 'errNotHolder', need_variant: 'errVariant', blocked: 'errBlocked', host_only: 'errHost', chat_external: 'errChatExternal' };
  const k = Object.keys(map).find((x) => code.startsWith(x));
  return k ? t(map[k]) : code;
}

// =====================================================================
// Play screen shell
// =====================================================================
export function PlayScreen({ v }: { v: View }) {
  const chatApp = v.settings.sources.chat === 'app';
  const [tab, setTab] = useState<'chat' | 'cards' | 'table' | 'notes' | 'sound'>(chatApp ? 'chat' : 'cards');
  const unreadyHand = v.hands.find((h) => h.status === 'unlocked');
  const unread = chatApp ? unreadCount(v) : 0;
  return (
    <div class="play">
      <div class="stickyhead">
      <ClockBar v={v} />
      {unreadyHand && tab !== 'cards' && <button class="banner" onClick={() => setTab('cards')}>🂠 {t('clueReadyBanner', { n: unreadyHand.ts })} →</button>}
      <div class="tabs" role="tablist">
        {chatApp && <button role="tab" aria-selected={tab === 'chat'} class={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>{t('tabChat')}{unread > 0 && <span class="badge-n">{unread}</span>}</button>}
        <button role="tab" aria-selected={tab === 'cards'} class={tab === 'cards' ? 'on' : ''} onClick={() => setTab('cards')}>{t('tabCards')}{unreadyHand && <span class="badge-n">!</span>}</button>
        <button role="tab" aria-selected={tab === 'table'} class={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>{t('tabTable')}</button>
        <button role="tab" aria-selected={tab === 'notes'} class={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>{t('tabNotes')}</button>
        {v.me.isSound && <button role="tab" aria-selected={tab === 'sound'} class={tab === 'sound' ? 'on' : ''} onClick={() => setTab('sound')}>🔊</button>}
      </div>
      </div>
      <div class="tabbody">
        {tab === 'chat' && chatApp && <ChatTab v={v} />}
        {tab === 'cards' && <CardsTab v={v} />}
        {tab === 'table' && <TableView v={v} />}
        {tab === 'notes' && <NotesTab v={v} />}
      </div>
      {/* the player must stay rendered & visible on the sound device; it is parked off-screen unless its tab is open */}
      {v.me.isSound && <div class={tab === 'sound' ? 'sound-open' : 'sound-parked'}><SoundPlayer /></div>}
      <Muted>{t('silentBanner')}</Muted>
    </div>
  );
}

export { dayWord };
