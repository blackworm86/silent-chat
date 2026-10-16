import { useEffect } from 'preact/hooks';
import { Play } from 'lucide-preact';
import { view, fatal, connect, disconnect } from '../net';
import { C, tx, inviteUrl, fmtClock } from '../content';
import { t, Btn, Muted, useRemaining, Label } from './common';
import { TableView, LightsOut } from './play';
import { SoundDock, VoicemailPlayer, startAudio, type DockMode } from './sound';
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

const PRE = ['lobby', 'safety', 'intro', 'characters', 'drives', 'intros', 'relations', 'voicemail', 'hunches', 'deal', 'rules'];

/**
 * The tablet is one grid whose children never change position (clock · main · dock · action), only their
 * contents and the grid areas do. That keeps the video player mounted from the lobby to the end of the game.
 */
function TableBody({ v, code }: { v: NonNullable<typeof view.value>; code: string }) {
  const rem = useRemaining();
  const phase = v.phase;
  const playing = phase === 'play';
  const layout = playing ? 'play' : phase === 'ready' ? 'ready' : PRE.includes(phase) ? 'pre' : 'end';
  const dock: DockMode | null = !v.me.isSound ? null : playing || phase === 'ready' || phase === 'final' || phase === 'playback' ? 'inline' : 'parked';
  return (
    <div class="page table">
      <LightsOut v={v} />
      <header class="t-head">
        <span class="brand">{t('tableDevice')}</span>
        <span class="faint num">{code} · {v.players.length} {t('players').toLowerCase()}</span>
      </header>
      <div class={`t-grid t-${layout}`}>
        <div class="t-clock">{playing && <div class={`bigclock ${rem < 600000 ? 'hot' : ''}`} role="timer">{fmtClock(rem)}</div>}</div>

        <div class="t-main">
          {PRE.includes(phase) && (
            <div class="stack loose">
              <div class="stack tight"><h1>{t(('phase_' + phase) as keyof typeof dict.en)}</h1><p class="lede">{t('tableWaiting')}</p></div>
              {phase === 'lobby' && <Qr text={inviteUrl(code, 'r')} />}
              {phase === 'intro' && <div class="prose lede">{C().specialCards.intro.body.map((b: any, i: number) => <p key={i}>{tx(b)}</p>)}</div>}
            </div>
          )}
          {phase === 'ready' && <div class="stack tight"><h1>{t('startTitle')}</h1><p class="lede">{t('startHint')}</p></div>}
          {playing && <TableView v={v} big />}
          {phase === 'final' && <h1>{t('timesUp')}</h1>}
          {phase === 'playback' && <div class="stack loose"><h1>{t('voicemailsTitle')}</h1>{v.me.isSound && <VoicemailPlayer />}</div>}
          {(phase === 'debrief' || phase === 'done') && <div class="stack"><h1>{t('debriefTitle')}</h1><Muted>{t('tableDebrief')}</Muted></div>}
        </div>

        {dock ? <SoundDock mode={dock} /> : <div class="dock parked" />}

        <div class="t-action">
          {phase === 'ready' && v.me.isSound && <Btn icon={<Play size={22} />} onClick={() => startAudio(v.settings.videoOffsetSec)}>{t('startGame')}</Btn>}
          {v.me.isSound && playing && <Label>{t('soundHere')}</Label>}
        </div>
      </div>
    </div>
  );
}
