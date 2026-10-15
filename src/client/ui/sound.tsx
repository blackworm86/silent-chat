import { useEffect, useRef, useState } from 'preact/hooks';
import { view, send, vmItems, unlockAudio } from '../net';
import { rules } from '../../shared/rules';
import { t, Btn, Panel } from './common';
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

/** Called from a user tap on the sound device. Starts the video and tells the server. */
export function startAudio(offsetSec: number) {
  unlockAudio();
  if (yt.player && yt.ready && !yt.failed) {
    try { yt.player.seekTo(offsetSec, true); yt.player.playVideo(); send({ type: 'startGame', source: 'video' }); return; } catch { /* fall through */ }
  }
  send({ type: 'startGame', source: 'manual' });
}
export function setVideoVolume(v: number) { try { yt.player?.setVolume(v); } catch { /* ignore */ } }

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

  // report the video position to the server while the video drives the clock
  useEffect(() => {
    const i = setInterval(() => {
      const vv = view.value;
      if (!vv || !yt.player || !yt.ready || vv.clock.source !== 'video') return;
      if (vv.phase !== 'play' && vv.phase !== 'ready') return;
      try {
        const st = yt.player.getPlayerState();
        if (vv.phase === 'ready') return;
        send({ type: 'reportVideo', sec: yt.player.getCurrentTime(), playing: st === 1 });
      } catch { /* ignore */ }
    }, 2000);
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
