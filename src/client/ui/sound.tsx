import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { view, send, vmItems, unlockAudio, serverNow } from '../net';
import { rules } from '../../shared/rules';
import { t, Btn, Panel, remainingMs } from './common';
import { charName } from '../content';

// ---- minimal YouTube IFrame API wrapper (loaded only on the sound device) ----
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
let apiPromise: Promise<any> | null = null;
function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout')), 9000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); clearTimeout(to); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(to); reject(new Error('load')); };
    document.head.appendChild(s);
  });
  apiPromise.catch(() => { apiPromise = null; });
  return apiPromise;
}

export const yt = { player: null as any, ready: false, failed: false, listeners: new Set<() => void>() };
const notify = () => yt.listeners.forEach((f) => f());

/** Called from a user tap on the table. Starts the video inside the tap (browsers need one) and tells the server. */
export function startAudio(offsetSec: number) {
  unlockAudio();
  if (yt.player && yt.ready && !yt.failed) {
    try { yt.player.seekTo(offsetSec, true); yt.player.playVideo(); send({ type: 'startGame', source: 'video' }); return; } catch { /* fall through */ }
  }
  send({ type: 'startGame', source: 'manual' });
}
/** Pause/resume from the table. Inside the tap so the browser lets the video play again; the sync loop keeps it in step. */
export function toggleClock(running: boolean) {
  unlockAudio();
  if (running) { try { yt.player?.pauseVideo(); } catch { /* ignore */ } send({ type: 'pauseClock' }); }
  else { try { if (yt.ready && !yt.failed) yt.player?.playVideo(); } catch { /* ignore */ } send({ type: 'resumeClock' }); }
}
export function setVideoVolume(v: number) { try { yt.player?.setVolume(v); } catch { /* ignore */ } }

/** True while the sound device has its audio tab open during play (the dock then slides into view). */
export const soundSheet = signal(false);
export type DockMode = 'top' | 'sheet' | 'parked' | 'inline';
/**
 * The ONE YouTube player of the sound device. It is mounted once, at a fixed place in the tree, for the whole game:
 * moving or re-creating it would reload the video, so screens only change its CSS mode, never where it lives.
 */
export function SoundDock({ mode }: { mode: DockMode }) {
  return <div class={`dock ${mode}`}><SoundPlayer big /></div>;
}

/** The visible YouTube player (must stay visible: min 200x200). Lives on the sound device only. */
export function SoundPlayer({ big }: { big?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(yt.failed ? 'failed' : yt.ready ? 'ready' : 'loading');
  const v = view.value!;

  useEffect(() => {
    let dead = false;
    const fail = () => { yt.failed = true; notify(); if (!dead) setState('failed'); const vv = view.value; if (vv && vv.clock.source === 'video') send({ type: 'setClockSource', source: 'manual' }); };
    loadApi().then((YT) => {
      if (dead || !host.current) return;
      const el = document.createElement('div');
      host.current.innerHTML = '';
      host.current.appendChild(el);
      yt.player = new YT.Player(el, {
        videoId: rules.settings.videoId, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onReady: () => { yt.ready = true; notify(); if (!dead) setState('ready'); },
          onError: fail,
          onStateChange: () => notify()
        }
      });
    }).catch(fail);
    return () => { dead = true; try { yt.player?.destroy(); } catch { /* ignore */ } yt.player = null; yt.ready = false; };
  }, []);

  // the game clock is the source of truth: the video follows it (plays, pauses, and seeks back when it drifts)
  useEffect(() => {
    const i = setInterval(() => {
      const vv = view.value;
      if (!vv || !yt.player || !yt.ready || yt.failed || vv.phase !== 'play') return;
      try {
        const playing = yt.player.getPlayerState() === 1;
        if (!vv.clock.running) { if (playing) yt.player.pauseVideo(); return; }
        const want = vv.settings.videoOffsetSec + (vv.clock.lengthMs - remainingMs(vv, serverNow())) / 1000;
        if (Math.abs(yt.player.getCurrentTime() - want) > 2) yt.player.seekTo(want, true);
        if (!playing) yt.player.playVideo();
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div class={`yt-wrap ${big ? 'big' : ''}`}>
      <div class="yt-box" ref={host} />
      {state === 'failed' && <p class="warn">{t('videoFailed')}</p>}
      {state === 'loading' && <p class="muted">{t('videoLoading')}</p>}
      {v.clock.source === 'manual' && v.phase === 'play' && <p class="muted small">{t('manualClock')}</p>}
    </div>
  );
}

/** Plays all voicemails in order, ducking the video volume. Runs on the sound device. */
export function VoicemailPlayer() {
  const items = vmItems.value;
  const [idx, setIdx] = useState<number>(-1);
  const [shown, setShown] = useState<number[]>([]);
  const v = view.value!;
  const audio = useRef<HTMLAudioElement | null>(null);

  const play = (i: number) => {
    if (!items || i >= items.length) { setIdx(-1); setVideoVolume(100); return; }
    setIdx(i);
    setVideoVolume(35);
    const a = new Audio(`data:${items[i].mime};base64,${items[i].b64}`);
    audio.current = a;
    a.onended = () => { setShown((s) => [...s, items[i].seat]); play(i + 1); };
    a.onerror = () => { setShown((s) => [...s, items[i].seat]); play(i + 1); };
    a.play().catch(() => { setShown((s) => [...s, items[i].seat]); play(i + 1); });
  };
  useEffect(() => () => { audio.current?.pause(); }, []);

  return (
    <Panel>
      {!items && <Btn onClick={() => { unlockAudio(); send({ type: 'getVoicemails' }); }}>{t('loadVoicemails')}</Btn>}
      {items && items.length === 0 && <p class="muted">{t('noVoicemails')}</p>}
      {items && items.length > 0 && idx === -1 && shown.length === 0 && <Btn onClick={() => play(0)}>{t('playVoicemails')}</Btn>}
      {items && items.map((it, i) => (
        <div class={`vm-row ${idx === i ? 'on' : ''}`} key={it.seat}>
          <span>{idx === i ? '▶' : shown.includes(it.seat) ? '✓' : '•'}</span>
          <span>{shown.includes(it.seat) ? charName(v.players.find((p) => p.seat === it.seat)?.characterId ?? null, v.players.find((p) => p.seat === it.seat)?.name) : t('anonymousVoice', { n: i + 1 })}</span>
        </div>
      ))}
    </Panel>
  );
}
