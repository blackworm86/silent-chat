import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import {
  Menu, Lock, MicOff, Hourglass, Flashlight, CarFront, Dice5, Coins, Mail, Smartphone, Layers, MessageCircle, LayoutGrid,
  NotebookPen, Volume2, SendHorizontal, ShieldAlert, Trash2, Undo2, Search, Pause, Play, Bell, ChevronRight, Sparkles
} from 'lucide-preact';
import { view, send, chat, typingMap, sendTyping, toasts, dismissToast, errors, dismissError } from '../net';
import { C, tx, clueCard, clueVariants, cardName, searchText, charName, fmtClock, dayWord } from '../content';
import { t, Btn, Panel, Label, Muted, Avatar, seatName, Countdown, useRemaining, useNow, Modal, useLocalState, UnofficialTag, showUnofficial, Section, ListRow, ConfirmSheet, TextLink } from './common';
import { soundSheet } from './sound';
import { DealPlan } from './setup';
import { rules } from '../../shared/rules';
import type { View, HandView, CardRef, ChatMsg } from '../../shared/types';

// =====================================================================
// Clock header
// =====================================================================
export function ClockBar({ v, onMenu }: { v: View; onMenu?: () => void }) {
  const rem = useRemaining();
  const length = v.clock.lengthMs;
  const nextTs = [...rules.settings.clueSchedule].sort((a, b) => b - a).find((ts) => ts * 60000 < rem - 500);
  const lockedMine = v.myLock;
  return (
    <header class="play-head">
      <div class="row nowrap between">
        <div class={`clock ${rem < 600000 ? 'hot' : ''}`} role="timer" aria-live="off">{fmtClock(rem)}</div>
        <div class="row nowrap">
          <div class="next-clue">
            <span>{v.clock.running ? t('nextClue') : t('paused')}</span>
            <b>{nextTs !== undefined ? `${nextTs}:00` : '—'}</b>
          </div>
          {onMenu && <button class="icon-btn" aria-label={t('menu')} onClick={onMenu}><Menu size={22} /></button>}
        </div>
      </div>
      <div class="bar" aria-hidden="true"><div class="fill" style={{ width: `${Math.min(100, (1 - rem / length) * 100)}%` }} />
        {rules.settings.clueSchedule.filter((x) => x !== 90).map((ts) => <i key={ts} class={ts * 60000 >= rem ? 'tick passed' : 'tick'} style={{ left: `${(1 - (ts * 60000) / length) * 100}%` }} />)}
      </div>
      {lockedMine && <div class="lockbar">{lockedMine.reason === 'mute' && lockedMine.until ? <><MicOff size={16} />{t('muteBanner')} <Countdown until={lockedMine.until} /></> : <><Lock size={16} />{t('lockedBanner')}</>}</div>}
    </header>
  );
}

// =====================================================================
// Card tiles, table view
// =====================================================================
function Tile({ id, badges = [] }: { id: string; badges?: { cls: string; text: string }[] }) {
  const n = cardName(id);
  return (
    <div class="tile">
      <b>{n.name}</b>{n.sub && <span class="faint small">{n.sub}</span>}
      {badges.map((b, i) => <span key={i} class={`badge ${b.cls}`}>{b.text}</span>)}
    </div>
  );
}
function same(a: CardRef | null, b: CardRef) { return !!a && a.id === b.id && a.copy === b.copy; }

export function TableView({ v, big }: { v: View; big?: boolean }) {
  const r = v.results;
  const sus = v.decks.suspect.revealed, loc = v.decks.location.revealed;
  return (
    <div class={`stack loose ${big ? 'big' : ''}`}>
      <Section title={<>{t('suspects')} <span class="faint">· {t('inDeck', { n: v.decks.suspect.remaining })}</span></>}>
        <div class="tiles">
          {sus.length === 0 && <Muted small>{t('noneRevealed')}</Muted>}
          {sus.map((c, i) => <Tile key={i} id={c.id} badges={[...(same(r.culprit, c) ? [{ cls: 'red', text: t('culprit') }] : []), ...(same(r.accomplice, c) ? [{ cls: 'amber', text: t('accomplice') }] : [])]} />)}
        </div>
      </Section>
      <Section title={<>{t('locations')} <span class="faint">· {t('inDeck', { n: v.decks.location.remaining })}</span></>}>
        <div class="tiles">
          {loc.length === 0 && <Muted small>{t('noneRevealed')}</Muted>}
          {loc.map((c, i) => <Tile key={i} id={c.id} badges={same(r.aliceLocation, c) ? [{ cls: 'teal', text: t('aliceHere') }] : []} />)}
        </div>
        {r.aliceCar && <p class="accent small"><CarFront size={16} style={{ verticalAlign: '-3px' }} /> {t('carUnlocked')}</p>}
      </Section>
      <Section title={t('revealedClues')}>
        <div class="ts-row">
          {rules.settings.clueSchedule.map((ts) => {
            const f = v.flipped.find((x) => x.ts === ts);
            return <span key={ts} class={`ts small ${f ? 'on' : ''}`} title={f ? seatName(v, f.holder) : ''}>{ts}</span>;
          })}
        </div>
        <span class="faint small">{t('searchLeft', { n: v.decks.searchRemaining })}</span>
      </Section>
      {v.safety.items.length > 0 && (
        <Section title={t('linesAndVeils')}>
          <div class="chips">{v.safety.items.map((i) => <span class={`tag ${i.kind}`} key={i.id}>{i.kind === 'line' ? t('line') : t('veil')}: {i.text}</span>)}</div>
        </Section>
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
        <div class="list">{rules.searchCards.map((s) => <ListRow key={s.id} onClick={() => { send({ type: 'registerSearch', id: s.id }); onClose(); }}>{searchText(s.id)}</ListRow>)}</div>
      </Modal>
    );
  }
  const list = deck === 'suspect' ? rules.suspects : rules.locations;
  const revealed = v.decks[deck].revealed;
  return (
    <Modal title={deck === 'suspect' ? t('registerSuspect') : t('registerLocation')} onClose={onClose}>
      <div class="list">
        {list.map((c) => {
          const left = c.copies - revealed.filter((r) => r.id === c.id).length;
          const n = cardName(c.id);
          return left > 0
            ? <ListRow key={c.id} sub={n.sub || undefined} onClick={() => { send({ type: 'registerDraw', deck, id: c.id, forTs }); onClose(); }} end={<span class="tag num">×{left}</span>}>{n.name}</ListRow>
            : <ListRow key={c.id} sub={n.sub || undefined} end={<span class="tag num">×0</span>}><span class="faint">{n.name}</span></ListRow>;
        })}
      </div>
      {revealed.length > 0 && (
        <Section title={t('undoRegistration')}>
          <div class="list">{revealed.map((c, i) => <ListRow key={i} icon={<Undo2 size={18} />} onClick={() => send({ type: 'unregisterDraw', deck, index: i })}>{cardName(c.id).name}</ListRow>)}</div>
        </Section>
      )}
    </Modal>
  );
}

// =====================================================================
// Clue cards
// =====================================================================
function ClueFace({ card }: { card: any }) {
  return (
    <div class="clueface">
      {card.top && <p class="italic muted">{tx(card.top)}</p>}
      <h3 class="accent">{tx(card.header)}</h3>
      {card.title && <h3>{tx(card.title)}</h3>}
      {card.subtitle && <p class="muted">{tx(card.subtitle)}</p>}
      <p class="big-text">{tx(card.body)}</p>
      {card.question && <p><b>{tx(card.question)}</b></p>}
      {card.box && <p class="boxed">{tx(card.box)}</p>}
      {card.footer && <p class="italic muted">{tx(card.footer)}</p>}
      {showUnofficial() && <UnofficialTag />}
    </div>
  );
}

function PlayerPick({ v, onPick, exclude }: { v: View; onPick: (seat: number) => void; exclude?: number }) {
  return <div class="chips">{v.players.filter((p) => p.seat !== exclude).map((p) => <button class="chip" key={p.seat} onClick={() => onPick(p.seat)}>{seatName(v, p.seat)}</button>)}</div>;
}
const Note = ({ icon, children }: { icon: any; children: any }) => <p class="row nowrap" style={{ alignItems: 'flex-start', gap: '10px' }}><span class="accent" style={{ marginTop: '2px' }}>{icon}</span><span>{children}</span></p>;

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
          <p class="bubble out" style={{ alignSelf: 'flex-end', maxWidth: '90%' }}>{text}</p>
          <Muted small>{t('firstMessageHint')}</Muted>
          {digital
            ? <Btn icon={<SendHorizontal size={18} />} onClick={() => send({ type: 'chat', to: 'group', text })}>{t('sendNow')}</Btn>
            : <Btn kind="ghost" onClick={() => navigator.clipboard?.writeText(text)}>{t('copyText')}</Btn>}
        </Panel>
      );
    }
    case 'draw': {
      if (hand.drawn) { const n = cardName(hand.drawn.id); return <Panel amber><Label>{e.deck === 'suspect' ? t('suspectDrawn') : t('locationDrawn')}</Label><h3>{n.name}</h3>{n.sub && <Muted small>{n.sub}</Muted>}</Panel>; }
      if (hand.pendingDraw === e.deck) return <Panel amber><Muted small>{t('registerPrompt')}</Muted><Btn onClick={() => setGrid(e.deck)}>{t('registerCard')}</Btn>{grid && <RegisterGrid deck={grid} forTs={hand.ts} onClose={() => setGrid(null)} />}</Panel>;
      return null;
    }
    case 'delay':
      return hand.delayEndsAt
        ? <Panel amber>{hand.delayDone ? <Note icon={<Hourglass size={18} />}>{t('delayDone')}</Note> : <Note icon={<Hourglass size={18} />}>{t('delayRunning')} <Countdown until={hand.delayEndsAt} /></Note>}</Panel>
        : null;
    case 'lightsOut':
      return v.lightsOut.active && v.lightsOut.by === v.me.seat
        ? <Panel amber><Note icon={<Flashlight size={18} />}>{t('lightsOutActive')}</Note><Btn onClick={() => send({ type: 'endLights' })}>{t('lightsBack')}</Btn></Panel> : null;
    case 'unlock': return v.results.aliceCar ? <Panel amber><Note icon={<CarFront size={18} />}>{t('carUnlocked')}</Note></Panel> : null;
    case 'drawFromRevealed': {
      const kind = e.result as 'culprit' | 'aliceLocation';
      const res = v.results[kind];
      if (res) { const n = cardName(res.id); return <Panel amber><Label>{kind === 'culprit' ? t('culprit') : t('aliceHere')}</Label><h3>{n.name}</h3>{n.sub && <Muted small>{n.sub}</Muted>}</Panel>; }
      if (hand.pendingPick === kind) {
        const deck = kind === 'culprit' ? 'suspect' : 'location';
        return (
          <Panel amber>
            <Muted small>{kind === 'culprit' ? t('pickCulpritHint') : t('pickAliceHint')}</Muted>
            <Btn icon={<Dice5 size={18} />} onClick={() => send({ type: 'pickResult', ts: hand.ts })}>{t('letAppPick')}</Btn>
            <TextLink onClick={() => setRevealedPick(!revealedPick)}>{t('iPickedReal')}</TextLink>
            {revealedPick && <div class="chips">{v.decks[deck].revealed.map((c, i) => <button class="chip" key={i} onClick={() => send({ type: 'pickResult', ts: hand.ts, id: c.id, copy: c.copy })}>{cardName(c.id).name}</button>)}</div>}
          </Panel>
        );
      }
      return null;
    }
    case 'giveCard':
      if (hand.needsTarget === 'ten') return <Panel amber><Label>{t('giveTenTitle')}</Label><Muted small>{t('giveTenHint')}</Muted><PlayerPick v={v} onPick={(s) => send({ type: 'chooseTarget', ts: hand.ts, target: s })} /></Panel>;
      if (hand.target !== null) return <Panel amber><Note icon={<Layers size={18} />}>{t('tenGivenTo', { name: seatName(v, hand.target) })}</Note></Panel>;
      return null;
    case 'muteSelf': return <Panel amber><Note icon={<MicOff size={18} />}>{t('muteNote')}</Note></Panel>;
    case 'becomeAlice': return <Panel amber><Note icon={<Smartphone size={18} />}>{t('becomeAliceNote')}</Note></Panel>;
    case 'atClock': {
      const clock = e.clock as string;
      if (e.action === 'coinFlip') {
        const coin = hand.coins.find((c) => c.idx === idx);
        if (!coin) return <Panel class="locked"><Note icon={<Coins size={18} />}>{t('coinAt', { clock })}</Note></Panel>;
        if (coin.pending) return (
          <Panel amber>
            <Note icon={<Coins size={18} />}>{t('coinNow')}</Note>
            <Btn icon={<Dice5 size={18} />} onClick={() => send({ type: 'coin', ts: hand.ts, idx, result: 'random' })}>{t('flipDigitalCoin')}</Btn>
            <div class="row nowrap"><Btn kind="ghost" small onClick={() => send({ type: 'coin', ts: hand.ts, idx, result: 'heads' })}>{t('heads')}</Btn><Btn kind="ghost" small onClick={() => send({ type: 'coin', ts: hand.ts, idx, result: 'tails' })}>{t('tails')}</Btn></div>
          </Panel>
        );
        return <Panel amber><Note icon={<Coins size={18} />}><b>{coin.result === 'heads' ? t('heads') : t('tails')}</b></Note><p>{tx(coin.result === 'heads' ? e.heads : e.tails)}</p></Panel>;
      }
      if (e.action === 'outOfCharacterMessage') {
        if (hand.needsTarget === 'ooc') return <Panel amber><Label>{t('chooseOocTarget')}</Label><PlayerPick v={v} exclude={v.me.seat ?? undefined} onPick={(s) => send({ type: 'chooseTarget', ts: hand.ts, target: s })} /></Panel>;
        if (hand.oocDue) return <Panel amber><Note icon={<Mail size={18} />}>{t('oocNow', { name: seatName(v, hand.target) })}</Note><p class="italic muted">{tx(e.note)}</p></Panel>;
        return <Panel class="locked"><Note icon={<Mail size={18} />}>{t('oocAt', { clock, name: hand.target !== null ? seatName(v, hand.target) : '…' })}</Note></Panel>;
      }
      if (e.action === 'drawTopUntilNot') {
        if (v.results.accomplice) { const n = cardName(v.results.accomplice.id); return <Panel amber><Label>{t('accomplice')}</Label><h3>{n.name}</h3></Panel>; }
        if (hand.pendingPick === 'accomplice') return (
          <Panel amber>
            <Muted small>{t('pickAccompliceHint')}</Muted>
            <Btn icon={<Dice5 size={18} />} onClick={() => send({ type: 'pickResult', ts: hand.ts })}>{t('letAppPick')}</Btn>
            <TextLink onClick={() => setGrid('suspect')}>{t('iPickedReal')}</TextLink>
            {grid && <Modal title={t('registerSuspect')} onClose={() => setGrid(null)}><div class="list">{rules.suspects.map((s) => <ListRow key={s.id} onClick={() => { send({ type: 'pickResult', ts: hand.ts, id: s.id }); setGrid(null); }}>{cardName(s.id).name}</ListRow>)}</div></Modal>}
          </Panel>
        );
        return <Panel class="locked"><Note icon={<Layers size={18} />}>{t('accompliceAt', { clock })}</Note></Panel>;
      }
      if (e.action === 'captured') return <Panel class="locked"><Note icon={<Lock size={18} />}>{t('capturedAt', { clock })}</Note></Panel>;
      return null;
    }
    default: return null;
  }
}

export function ClueCardView({ hand, v }: { hand: HandView; v: View }) {
  const physical = v.settings.sources.clues === 'physical';
  const card = clueCard(hand.clueId);
  const title = hand.ts === 10 && hand.isTenHeld ? t('tenCard') : t('clueN', { n: hand.ts });
  if (hand.status === 'locked') {
    return (
      <div class="panel locked row nowrap between">
        <span class="row nowrap"><Lock size={18} class="faint" /><b>{title}</b></span>
        <span class="faint small num">{t('unlocksAt', { clock: `${hand.ts}:00` })}</span>
      </div>
    );
  }
  if (hand.status === 'unlocked') {
    return (
      <Panel amber>
        <h3>{title} — {t('readyToFlip')}</h3>
        {physical && hand.ts !== 90 ? (
          <>
            <Muted small>{t('whichCardFlipped')}</Muted>
            {clueVariants(hand.ts).map((c: any) => (
              <button class="variant" key={c.id} onClick={() => send({ type: 'flipClue', ts: hand.ts, variant: c.variant })}>
                <b>{c.variant}</b><span>{tx(c.body).slice(0, 80)}…</span>
              </button>
            ))}
          </>
        ) : <Btn icon={<Sparkles size={18} />} onClick={() => send({ type: 'flipClue', ts: hand.ts })}>{t('flipCard')}</Btn>}
      </Panel>
    );
  }
  if (!card) return null;
  return (
    <article class="gcard">
      <Label>{title}</Label>
      <ClueFace card={card} />
      <Muted small>{t('shareWithGroup')}</Muted>
      {card.effects.map((e: any, i: number) => <EffectWidget key={i} e={e} idx={i} hand={hand} card={card} v={v} />)}
    </article>
  );
}

export function SearchPanel({ v }: { v: View }) {
  const [grid, setGrid] = useState(false);
  const digital = v.settings.sources.search === 'digital';
  return (
    <Section title={t('searchDeck')}>
      <Muted small>{t('searchHint')}</Muted>
      {digital ? <Btn kind="ghost" icon={<Search size={18} />} disabled={v.decks.searchRemaining === 0} onClick={() => send({ type: 'drawSearch' })}>{t('drawSearch')}</Btn>
        : <Btn kind="ghost" icon={<Search size={18} />} onClick={() => setGrid(true)}>{t('registerSearch')}</Btn>}
      {v.mySearch.map((s, i) => <p class="searchcard" key={i}>{searchText(s.id)}</p>)}
      {grid && <RegisterGrid deck="search" onClose={() => setGrid(false)} />}
    </Section>
  );
}

function CardsTab({ v }: { v: View }) {
  const hands = [...v.hands].sort((a, b) => b.ts - a.ts);
  return (
    <>
      {hands.length === 0 && <Muted>{t('noCards')}</Muted>}
      {hands.map((h) => <ClueCardView key={h.ts} hand={h} v={v} />)}
      <SearchPanel v={v} />
      {v.settings.sources.clues === 'physical' && v.plan && <DealPlan v={v} />}
    </>
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
    return <div class="sysmsg safety">{label}{m.text ? `: ${m.text}` : ''}</div>;
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
      <div class="msgcol">
        {!mine && <div class="sender">{sender}</div>}
        <div class={`bubble ${mine ? 'out' : 'in'} ${m.ooc ? 'ooc' : ''}`}>{m.text}</div>
        {mine && <button class="del" aria-label={t('deleteMsg')} onClick={() => send({ type: 'chatDelete', id: m.id })}><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}

function SafetySheet({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'line' | 'veil'>('line');
  const [text, setText] = useState('');
  const ok = () => { if (text.trim()) { send({ type: 'safety', kind, text: text.trim() }); onClose(); } };
  return (
    <Modal title={t('addLineVeil')} onClose={onClose}>
      <Muted small>{t('linesVeilsHint')}</Muted>
      <div class="seg">
        <button class={kind === 'line' ? 'on' : ''} onClick={() => setKind('line')}>{t('line')}</button>
        <button class={kind === 'veil' ? 'on' : ''} onClick={() => setKind('veil')}>{t('veil')}</button>
      </div>
      <input class="input" autoFocus value={text} maxLength={120} placeholder={kind === 'line' ? t('lineWhat') : t('veilWhat')} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      <Btn disabled={!text.trim()} onClick={ok}>{t('add')}</Btn>
      <Muted small>{t('oocHint')}</Muted>
    </Modal>
  );
}

export function ChatTab({ v, groupOnly }: { v: View; groupOnly?: boolean }) {
  const me = v.me.seat!;
  const [conv, setConv] = useState<string>('group');
  const [text, setText] = useState('');
  const [safety, setSafety] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const msgs = chat.value.filter((m) => convOf(m, me) === conv);
  const others = v.players.filter((p) => p.seat !== me);
  const lock = v.myLock;
  const now = useNow(1000);
  const typing = typingMap.value[conv === 'group' ? 'group' : conv] > now;
  const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;

  useEffect(() => {
    readMap.value = { ...readMap.value, [conv]: Math.max(readMap.value[conv] ?? 0, lastId) };
    const el = thread.current; if (el) el.scrollTop = el.scrollHeight;
  }, [conv, lastId, typing]);

  const submit = () => {
    const tt = text.trim(); if (!tt) return;
    send({ type: 'chat', to: conv === 'group' ? 'group' : Number(conv), text: tt });
    setText('');
  };
  const unreadOf = (k: string) => chat.value.filter((m) => m.kind !== 'system' && m.from !== me && !m.deleted && convOf(m, me) === k && m.id > (readMap.value[k] ?? 0)).length;

  return (
    <div class={`chat-view ${groupOnly ? 'inline' : ''}`}>
      {!groupOnly && (
        <div class="convs" role="tablist">
          {['group', ...others.map((o) => String(o.seat))].map((k) => (
            <button role="tab" aria-selected={conv === k} class={`chip ${conv === k ? 'on' : ''}`} key={k} onClick={() => setConv(k)}>
              {k === 'group' ? t('group') : seatName(v, Number(k))}{unreadOf(k) > 0 && <span class="badge-n">{unreadOf(k)}</span>}
            </button>
          ))}
        </div>
      )}
      <div class="thread" ref={thread} aria-live="polite">
        {msgs.length === 0 && <div class="thread-empty"><MessageCircle size={28} /><b>{t('emptyChatTitle')}</b><span>{t('silentBanner')}</span></div>}
        {msgs.map((m) => <Bubble key={m.id} m={m} v={v} mine={m.from === me && m.kind === 'msg'} />)}
        {typing && <div class="typing" aria-label={t('typing')}><i /><i /><i /></div>}
      </div>
      {lock && <div class="lock-note">{t('lockedHint')}</div>}
      <div class="composer">
        <button class="xbtn" onClick={() => send({ type: 'safety', kind: 'x', text: '' })} aria-label={t('xCard')}>X</button>
        <button class="safety-btn" onClick={() => setSafety(true)} aria-label={t('addLineVeil')}><ShieldAlert size={20} /></button>
        <input class="input" value={text} enterKeyHint="send" placeholder={lock ? t('chatLocked') : t('messageAs', { name: seatName(v, me, true) })}
          onInput={(e) => { const val = (e.target as HTMLInputElement).value; setText(val); if (Date.now() - lastTyping.current > 2500 && val) { lastTyping.current = Date.now(); sendTyping(conv === 'group' ? 'group' : Number(conv)); } }}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button class="send" disabled={!text.trim()} onClick={submit} aria-label={t('send')}><SendHorizontal size={20} /></button>
      </div>
      {safety && <SafetySheet onClose={() => setSafety(false)} />}
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
    <label class="note-field" key={k}><span>{label}</span><textarea class="input" rows={2} value={notes[k] ?? ''} onInput={(e) => setNotes({ ...notes, [k]: (e.target as HTMLTextAreaElement).value })} /></label>
  );
  return (
    <div class="stack loose">
      {fld('secret', tx(rec.secretLabel).replace(':', ''))}
      <Section title={t('characters')}>{C().characters.map((c: any) => fld('c_' + c.id, c.name))}</Section>
      <Section title={t('locations')}>{C().locations.map((l: any) => fld('l_' + l.id, tx(l.name)))}</Section>
      <Section title={t('suspects')}>{C().suspects.map((s: any) => fld('s_' + s.id, s.name))}</Section>
      <Muted small>{t('notesPrivate')}</Muted>
    </div>
  );
}

// =====================================================================
// Host panel
// =====================================================================
export function HostPanel({ v, onClose }: { v: View; onClose: () => void }) {
  const miss = v.hostExtra?.missed ?? [];
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (confirmEnd) return <ConfirmSheet title={t('endGame')} body={t('confirmEnd')} confirm={t('endGame')} danger onConfirm={() => { send({ type: 'endGame' }); onClose(); }} onClose={() => setConfirmEnd(false)} />;
  return (
    <Modal title={t('hostPanel')} onClose={onClose}>
      <Section title={t('clock')}>
        <div class="row nowrap">
          {v.clock.running
            ? <Btn kind="ghost" icon={<Pause size={18} />} onClick={() => send({ type: 'pauseClock' })}>{t('pause')}</Btn>
            : <Btn kind="ghost" icon={<Play size={18} />} onClick={() => send({ type: 'resumeClock' })}>{t('resume')}</Btn>}
          <Btn kind="ghost" small full={false} onClick={() => send({ type: 'nudgeClock', ms: -1000 })}>−1s</Btn>
          <Btn kind="ghost" small full={false} onClick={() => send({ type: 'nudgeClock', ms: 1000 })}>+1s</Btn>
        </div>
        <Muted small>{t('clockSource')}: {v.clock.source === 'video' ? t('srcVideo') : t('srcManual')}</Muted>
        {v.clock.source === 'video' && <TextLink onClick={() => { send({ type: 'setClockSource', source: 'manual' }); send({ type: 'resumeClock' }); }}>{t('switchManual')}</TextLink>}
      </Section>
      <Section title={t('nudgePlayers')}>
        {miss.length > 0 && <p class="accent small">{t('missedClues', { list: miss.join(', ') })}</p>}
        <div class="chips">{v.players.filter((p) => !p.isHost).map((p) => <button class="chip" key={p.seat} onClick={() => send({ type: 'nudgePlayer', seat: p.seat })}><Bell size={15} />{seatName(v, p.seat)}</button>)}</div>
      </Section>
      <Section title={t('reassignTen')}>
        <div class="chips">{v.players.map((p) => <button class="chip" key={p.seat} onClick={() => send({ type: 'reassignTen', seat: p.seat })}>{seatName(v, p.seat)}</button>)}</div>
      </Section>
      <div class="list">
        <ListRow icon={<Flashlight size={20} />} onClick={() => send({ type: 'endLights' })} end={<ChevronRight size={20} class="chev" />}>{t('lightsBack')}</ListRow>
        <ListRow danger icon={<Lock size={20} />} onClick={() => setConfirmEnd(true)}>{t('endGame')}</ListRow>
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
      <Flashlight size={48} /><p>{t('lightsOutText')}</p>
      {(v.me.seat === v.lightsOut.by || v.me.isHost) && <Btn kind="outline" full={false} onClick={() => send({ type: 'endLights' })}>{t('lightsBack')}</Btn>}
    </div>
  );
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((x) => <button class="toast" key={x.id} onClick={() => dismissToast(x.id)}>{toastText(x.code, x.params)}</button>)}
      {errors.value.map((x) => <button class="toast err" key={x.id} onClick={() => dismissError(x.id)}>{errText(x.code)}</button>)}
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
// Play screen: fixed full-height column — clock header, content, bottom tabs
// =====================================================================
type Tab = 'chat' | 'cards' | 'table' | 'notes' | 'sound';
export function PlayScreen({ v, onMenu }: { v: View; onMenu?: () => void }) {
  const chatApp = v.settings.sources.chat === 'app';
  const [tab, setTab] = useState<Tab>(chatApp ? 'chat' : 'cards');
  const ready = v.hands.find((h) => h.status === 'unlocked');
  const unread = chatApp && tab !== 'chat' ? unreadCount(v) : 0;
  useEffect(() => { soundSheet.value = tab === 'sound'; return () => { soundSheet.value = false; }; }, [tab]);
  const tabs: { k: Tab; icon: any; label: string; badge?: string | number }[] = [
    ...(chatApp ? [{ k: 'chat' as Tab, icon: <MessageCircle size={22} />, label: t('tabChat'), badge: unread || undefined }] : []),
    { k: 'cards', icon: <Layers size={22} />, label: t('tabCards'), badge: ready ? '!' : undefined },
    { k: 'table', icon: <LayoutGrid size={22} />, label: t('tabTable') },
    { k: 'notes', icon: <NotebookPen size={22} />, label: t('tabNotes') },
    ...(v.me.isSound ? [{ k: 'sound' as Tab, icon: <Volume2 size={22} />, label: t('tabSound') }] : [])
  ];
  return (
    <div class="play">
      <ClockBar v={v} onMenu={onMenu} />
      {ready && tab !== 'cards' && (
        <button class="clue-banner" onClick={() => setTab('cards')}><Sparkles size={20} /><span>{t('clueReadyBanner', { n: ready.ts })}</span><ChevronRight size={20} /></button>
      )}
      <div class="play-body">
        {tab === 'chat' && chatApp && <ChatTab v={v} />}
        {tab === 'cards' && <div class="scroll"><CardsTab v={v} /></div>}
        {tab === 'table' && <div class="scroll"><TableView v={v} /></div>}
        {tab === 'notes' && <div class="scroll"><NotesTab v={v} /></div>}
        {/* the player itself lives in the app shell (SoundDock) so it survives phase changes; this tab only brings it into view */}
        {tab === 'sound' && <div class="scroll"><Muted>{t('soundHere')}</Muted></div>}
      </div>
      <nav class="tabbar" role="tablist">
        {tabs.map((x) => (
          <button key={x.k} role="tab" aria-selected={tab === x.k} class={tab === x.k ? 'on' : ''} onClick={() => setTab(x.k)}>
            {x.icon}{x.label}{x.badge !== undefined && <span class="badge-n">{x.badge}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

export { dayWord };
