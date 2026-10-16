import { useEffect } from 'preact/hooks';
import { view, fatal, connect, disconnect } from '../net';
import { C, tx, inviteUrl } from '../content';
import { t, Btn, Panel, Muted, useRemaining, Label } from './common';
import { TableView, LightsOut } from './play';
import { SoundPlayer, VoicemailPlayer, startAudio } from './sound';
import { fmtClock } from '../content';
import { Qr } from './setup';
import { useWakeLock, FatalScreen, Connecting } from './shell';
import { dict } from '../i18n';

/** The shared tablet in the middle of the table (no seat). Can be the sound device. */
export function TableApp({ code }: { code: string }) {
  useEffect(() => { connect(code, 'table', false, 'table'); return () => disconnect(); }, [code]);
  useWakeLock(true);
  const v = view.value;
  if (fatal.value) return <FatalScreen code={fatal.value} />;
  if (!v) return <Connecting />;
  return <TableBody v={v} code={code} />;
}

function TableBody({ v, code }: { v: NonNullable<typeof view.value>; code: string }) {
  const rem = useRemaining();
  const pre = ['lobby', 'safety', 'intro', 'characters', 'drives', 'intros', 'relations', 'voicemail', 'hunches', 'deal', 'rules'];
  return (
    <div class="page table">
      <LightsOut v={v} />
      <header class="row between" style={{ marginBottom: 'var(--s5)' }}>
        <span class="brand">{t('tableDevice')}</span>
        <span class="faint num">{code} · {v.players.length} {t('players').toLowerCase()}</span>
      </header>
      {pre.includes(v.phase) && (
        <div class="stack loose">
          <div class="stack tight"><h1>{t(('phase_' + v.phase) as keyof typeof dict.en)}</h1><p class="lede">{t('tableWaiting')}</p></div>
          {v.phase === 'lobby' && <Qr text={inviteUrl(code, 'r')} />}
          {v.phase === 'intro' && <div class="prose lede">{C().specialCards.intro.body.map((b: any, i: number) => <p key={i}>{tx(b)}</p>)}</div>}
        </div>
      )}
      {v.phase === 'ready' && (
        <div class="stack loose">
          <Panel amber><h2>{t('startTitle')}</h2><p>{t('startHint')}</p></Panel>
          {v.me.isSound && <><SoundPlayer big /><Btn onClick={() => startAudio(v.settings.videoOffsetSec)}>{t('startGame')}</Btn></>}
        </div>
      )}
      {v.phase === 'play' && (
        <div class="stack loose">
          <div class={`bigclock ${rem < 600000 ? 'hot' : ''}`}>{fmtClock(rem)}</div>
          {v.me.isSound && <SoundPlayer big />}
          <TableView v={v} big />
        </div>
      )}
      {v.phase === 'final' && <div class="stack loose"><h1>{t('timesUp')}</h1>{v.me.isSound && <SoundPlayer />}</div>}
      {v.phase === 'playback' && <div class="stack loose"><h1>{t('voicemailsTitle')}</h1>{v.me.isSound && <><SoundPlayer /><VoicemailPlayer /></>}</div>}
      {(v.phase === 'debrief' || v.phase === 'done') && <div class="stack"><h1>{t('debriefTitle')}</h1><Muted>{t('tableDebrief')}</Muted></div>}
      {v.me.isSound && <div style={{ marginTop: 'var(--s5)' }}><Label>{t('soundHere')}</Label></div>}
    </div>
  );
}
