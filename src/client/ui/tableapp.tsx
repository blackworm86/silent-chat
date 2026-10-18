import { useEffect, useState } from 'preact/hooks';
import { Play, Pause, Menu, Trash2, LogOut, Crown, MicOff, Lock, BellRing } from 'lucide-preact';
import { view, fatal, connect, disconnect, conn, send, deleteSession } from '../net';
import { C, tx, inviteUrl, fmtClock, lang, setLang, charName } from '../content';
import { t, Btn, Muted, useRemaining, Label, Avatar, Modal, ListRow, Section, ConfirmSheet, seatName } from './common';
import { TableView, LightsOut } from './play';
import { SoundDock, VoicemailPlayer, startAudio, toggleClock, type DockMode } from './sound';
import { Qr } from './setup';
import { useWakeLock, FatalScreen, Connecting } from './shell';
import { dict } from '../i18n';
import type { View } from '../../shared/types';

/**
 * The table: a tablet or PC in the middle of the table. It opens the game, runs the game server (Firebase mode),
 * plays the video/music, owns the clock and shows the shared state. It has no seat.
 */
export function TableApp({ code, create }: { code: string; create: boolean }) {
  useEffect(() => { connect(code, 'table', create, 'table'); return () => disconnect(); }, [code]);
  // once the room exists, drop "/new" so a reload resumes instead of trying to create again
  useEffect(() => {
    if (create && conn.value === 'open' && view.value) history.replaceState(null, '', location.pathname + location.search + `#/t/${code}`);
  }, [create, conn.value, !!view.value]);
  useWakeLock(true);
  const v = view.value;
  if (fatal.value) return <FatalScreen code={fatal.value} />;
  if (!v) return <Connecting />;
  return <TableBody v={v} />;
}

const PRE = ['lobby', 'safety', 'intro', 'characters', 'drives', 'intros', 'relations', 'voicemail', 'hunches', 'deal', 'rules'];

/**
 * One grid whose children never change position (clock · main · dock · action), only their contents and the grid
 * areas do. That keeps the video player mounted from the lobby to the end of the game.
 */
export function TableBody({ v, noSound }: { v: View; noSound?: boolean }) {
  const rem = useRemaining();
  const [menu, setMenu] = useState(false);
  const phase = v.phase;
  const playing = phase === 'play';
  const layout = playing ? 'play' : phase === 'ready' ? 'ready' : PRE.includes(phase) ? 'pre' : 'end';
  const dock: DockMode | null = noSound ? null : playing || phase === 'ready' || phase === 'final' || phase === 'playback' ? 'inline' : 'parked';
  return (
    <div class="page table">
      <LightsOut v={v} />
      <header class="t-head">
        <span class="brand">{t('tableDevice')}</span>
        <span class="row nowrap">
          <span class="faint num">{v.code} · {v.players.length} {t('players').toLowerCase()}</span>
          <button class="icon-btn" aria-label={t('menu')} onClick={() => setMenu(true)}><Menu size={22} /></button>
        </span>
      </header>
      <div class={`t-grid t-${layout}`}>
        <div class="t-clock">
          {playing && <div class={`bigclock ${rem < 600000 ? 'hot' : ''}`} role="timer">{fmtClock(rem)}</div>}
          {playing && !v.clock.running && <div class="t-paused">{t('pausedBig')}</div>}
        </div>

        <div class="t-main">
          {phase === 'lobby' && <TableLobby v={v} />}
          {PRE.includes(phase) && phase !== 'lobby' && (
            <div class="stack loose">
              <div class="stack tight"><h1>{t(('phase_' + phase) as keyof typeof dict.en)}</h1><p class="lede">{t('tableWaiting')}</p></div>
              {phase === 'intro' && <div class="prose lede">{C().specialCards.intro.body.map((b: any, i: number) => <p key={i}>{tx(b)}</p>)}</div>}
              <TablePlayers v={v} />
            </div>
          )}
          {phase === 'ready' && <div class="stack loose"><div class="stack tight"><h1>{t('startTitle')}</h1><p class="lede">{t('startHint')}</p></div><TablePlayers v={v} /></div>}
          {playing && (
            <div class="stack loose">
              <ClueReminder v={v} rem={rem} />
              <Timeline v={v} rem={rem} />
              <TablePlayers v={v} />
              <TableView v={v} big />
            </div>
          )}
          {phase === 'final' && <h1>{t('timesUp')}</h1>}
          {phase === 'playback' && <div class="stack loose"><h1>{t('voicemailsTitle')}</h1><VoicemailPlayer /></div>}
          {(phase === 'debrief' || phase === 'done') && <div class="stack"><h1>{t('debriefTitle')}</h1><Muted>{t('tableDebrief')}</Muted></div>}
        </div>

        {dock ? <SoundDock mode={dock} /> : <div class="dock parked" />}

        <div class="t-action">
          {phase === 'ready' && <Btn icon={<Play size={22} />} onClick={() => startAudio(v.settings.videoOffsetSec)}>{t('startGame')}</Btn>}
          {playing && (v.clock.running
            ? <Btn kind="ghost" icon={<Pause size={22} />} onClick={() => toggleClock(true)}>{t('tablePause')}</Btn>
            : <Btn icon={<Play size={22} />} onClick={() => toggleClock(false)}>{t('tableResume')}</Btn>)}
          {playing && <Label>{t('soundHere')}</Label>}
        </div>
      </div>
      {menu && <TableMenu v={v} onClose={() => setMenu(false)} />}
    </div>
  );
}

function TableLobby({ v }: { v: View }) {
  const enough = v.players.length >= 3;
  return (
    <div class="t-lobby">
      <section class="t-join">
        <Qr text={inviteUrl(v.code, 'r')} />
        <div class="stack tight">
          <h1>{t('scanToJoin')}</h1>
          <div class="code" aria-label={`${t('roomCode')} ${v.code.split('').join(' ')}`}>{v.code}</div>
          <p class="faint small">{t('inviteSecretNote')}</p>
        </div>
      </section>
      <Section title={`${t('players')} · ${v.players.length}/5`}>
        {v.players.length === 0 ? <Muted>{t('waitingPlayers')}</Muted> : (
          <>
            <div class="stack tight"><h2>{t('pickFacilitator')}</h2><Muted small>{t('pickFacilitatorHint')}</Muted></div>
            <div class="t-seats" role="radiogroup" aria-label={t('pickFacilitator')}>
              {v.players.map((p) => (
                <button key={p.seat} class={`t-seat ${p.isHost ? 'on' : ''}`} role="radio" aria-checked={p.isHost} onClick={() => send({ type: 'setFacilitator', seat: p.seat })}>
                  <Avatar seat={p.seat} size={36} byName />
                  <span class="grow t-seat-name"><b>{p.name}</b>{p.isHost && <small class="t-role"><Crown size={14} aria-hidden="true" />{t('host')}</small>}</span>
                  <span class={`dot ${p.connected ? 'on' : ''}`} />
                </button>
              ))}
            </div>
            {!enough && <Muted small>{t('needThree')}</Muted>}
          </>
        )}
      </Section>
    </div>
  );
}

/** Who is at the table, and anything the whole table should know about them. */
function TablePlayers({ v }: { v: View }) {
  return (
    <div class="t-people">
      {v.players.map((p) => (
        <span key={p.seat} class={`t-person ${p.connected ? '' : 'off'}`}>
          <Avatar seat={p.seat} size={28} />
          <span>{p.characterId ? charName(p.characterId, p.name) : p.name}{p.characterId && <small> · {p.name}</small>}</span>
          {p.isHost && <Crown size={14} class="accent" aria-label={t('host')} />}
          {p.identity === 'alice' && <small class="accent">{t('tableStatusAlice')}</small>}
          {p.locked && <span class="warn" aria-label={t('tableStatusMuted')}>{v.phase === 'play' ? <MicOff size={14} /> : <Lock size={14} />}</span>}
        </span>
      ))}
    </div>
  );
}

/** The big reminder when a clue unlocks and its holder has not revealed it yet. */
function ClueReminder({ v, rem }: { v: View; rem: number }) {
  const due = (v.timeline ?? []).filter((c) => c.status === 'unlocked').sort((a, b) => b.ts - a.ts);
  if (!due.length) return null;
  return (
    <div class="t-remind" role="status">
      <BellRing size={28} aria-hidden="true" />
      <div class="stack tight">
        {due.map((c) => <b key={c.ts}>{c.holder === null ? t('clueNobody', { ts: c.ts }) : t('clueNowFor', { name: seatName(v, c.holder), ts: c.ts })}</b>)}
      </div>
      <span class="sr-only">{fmtClock(rem)}</span>
    </div>
  );
}

function Timeline({ v, rem }: { v: View; rem: number }) {
  const tl = [...(v.timeline ?? [])].sort((a, b) => b.ts - a.ts);
  const next = tl.find((c) => c.status === 'locked' && c.ts * 60000 < rem);
  return (
    <Section title={t('timelineTitle')}>
      <ol class="t-line">
        {tl.map((c) => (
          <li key={c.ts} class={`t-clue ${c.status} ${next?.ts === c.ts ? 'next' : ''}`}>
            <b class="num">{c.ts}:00</b>
            <span>{c.holder === null ? '—' : seatName(v, c.holder)}</span>
            {next?.ts === c.ts && <small class="accent">{t('clueNext')}</small>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function TableMenu({ v, onClose }: { v: View; onClose: () => void }) {
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  if (del) {
    return <ConfirmSheet title={t('deleteGameTitle')} body={t('deleteGameBody')} confirm={busy ? t('deleting') : t('deleteGame')} danger busy={busy}
      onClose={() => setDel(false)} onConfirm={async () => { setBusy(true); try { await deleteSession(v.code); } finally { setBusy(false); } location.hash = '#/'; }} />;
  }
  return (
    <Modal title={t('menu')} onClose={onClose}>
      <Section title={t('language')}>
        <div class="seg"><button class={lang.value === 'it' ? 'on' : ''} onClick={() => setLang('it')}>Italiano</button><button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
      </Section>
      <Muted small>{t('hostKeepOpen')}</Muted>
      <div class="list">
        <ListRow icon={<LogOut size={20} />} onClick={() => { location.hash = '#/'; }}>{t('leave')}</ListRow>
        <ListRow danger icon={<Trash2 size={20} />} onClick={() => setDel(true)}>{t('deleteGame')}</ListRow>
      </div>
    </Modal>
  );
}
