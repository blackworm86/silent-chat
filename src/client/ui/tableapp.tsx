import { useEffect } from 'preact/hooks';
import { view, fatal, connect, disconnect, conn } from '../net';
import { C, tx, inviteUrl } from '../content';
import { t, Btn, Panel, Muted, useRemaining, Label } from './common';
import { TableView, LightsOut } from './play';
import { SoundPlayer, VoicemailPlayer, startAudio } from './sound';
import { fmtClock } from '../content';
import { Qr } from './setup';
import { useWakeLock } from './shell';
import { dict } from '../i18n';

/** The shared tablet in the middle of the table (no seat). Can be the sound device. */
export function TableApp({ code }: { code: string }) {
  useEffect(() => { connect(code, 'table', false, 'table'); return () => disconnect(); }, [code]);
  useWakeLock(true);
  const v = view.value;
  if (fatal.value) return <div class="page center"><Panel><h2>{t(('fatal_' + fatal.value) as keyof typeof dict.en)}</h2><a class="btn ghost" href="#/">{t('back')}</a></Panel></div>;
  if (!v) return <div class="page center"><p>{conn.value === 'open' ? t('loading') : t('connecting')}…</p></div>;
  return <TableBody v={v} code={code} />;
}

function TableBody({ v, code }: { v: NonNullable<typeof view.value>; code: string }) {
  const rem = useRemaining();
  const pre = ['lobby', 'safety', 'intro', 'characters', 'drives', 'intros', 'relations', 'voicemail', 'hunches', 'deal', 'rules'];
  return (
    <div class="page table">
      <LightsOut v={v} />
      <header class="row between"><b>{t('tableDevice')} · {code}</b><span class="muted">{v.players.length} {t('players').toLowerCase()}</span></header>
      {pre.includes(v.phase) && (
        <Panel>
          <h2>{t(('phase_' + v.phase) as keyof typeof dict.en)}</h2>
          <p class="muted">{t('tableWaiting')}</p>
          {v.phase === 'lobby' && <div class="row center"><Qr text={inviteUrl(code, 'r')} /></div>}
          {v.phase === 'intro' && <p>{C().specialCards.intro.body.map((b: any, i: number) => <span key={i}>{tx(b)}<br /><br /></span>)}</p>}
        </Panel>
      )}
      {v.phase === 'ready' && (
        <div class="stack">
          <Panel amber><h2>{t('startTitle')}</h2><p>{t('startHint')}</p></Panel>
          {v.me.isSound && <><SoundPlayer big /><Btn kind="amber" onClick={() => startAudio(v.settings.videoOffsetSec)}>▶ {t('startGame')}</Btn></>}
        </div>
      )}
      {v.phase === 'play' && (
        <div class="stack">
          <div class={`bigclock mono ${rem < 600000 ? 'hot' : ''}`}>{fmtClock(rem)}</div>
          {v.me.isSound && <SoundPlayer big />}
          <TableView v={v} big />
        </div>
      )}
      {v.phase === 'final' && <><Panel amber><h2>{t('timesUp')}</h2></Panel>{v.me.isSound && <SoundPlayer />}</>}
      {v.phase === 'playback' && <><Panel amber><h2>{t('voicemailsTitle')}</h2></Panel>{v.me.isSound && <><SoundPlayer /><VoicemailPlayer /></>}</>}
      {(v.phase === 'debrief' || v.phase === 'done') && <Panel amber><h2>{t('debriefTitle')}</h2><Muted>{t('tableDebrief')}</Muted></Panel>}
      <Label>{v.me.isSound ? t('soundHere') : ''}</Label>
    </div>
  );
}
