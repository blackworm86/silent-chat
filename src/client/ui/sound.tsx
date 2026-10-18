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

// ---- the soundtrack: one player on the table, either the YouTube video or a file kept on this device ----
/** What every soundtrack player can do; the sync loop only talks to this. */
interface Media { play(): Promise<void> | void; pause(): void; seek(sec: number): void; time(): number; playing(): boolean; volume(v: number): void }
export const yt = { player: null as Media | null, ready: false, failed: false, listeners: new Set<() => void>() };
const notify = () => yt.listeners.forEach((f) => f());
/** The browser refused to start the sound without a tap (autoplay rules, typical after a reload). */
export const soundBlocked = signal(false);

export type SoundSource = 'youtube' | 'file';
const readSource = (): SoundSource => { try { return localStorage.getItem('aim.sound.source') === 'file' ? 'file' : 'youtube'; } catch { return 'youtube'; } };
export const soundSource = signal<SoundSource>(readSource());
export const soundFileName = signal<string | null>(null);
export function setSoundSource(x: SoundSource) { soundSource.value = x; try { localStorage.setItem('aim.sound.source', x); } catch { /* ignore */ } }

// The soundtrack file never leaves this device: it is kept in the browser's own storage (IndexedDB), not uploaded.
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open('aim-sound', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function saveSoundFile(file: File): Promise<void> {
  const db = await idb();
  await new Promise<void>((res, rej) => { const tx = db.transaction('f', 'readwrite'); tx.objectStore('f').put({ blob: file, name: file.name }, 'soundtrack'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  soundFileName.value = file.name; setSoundSource('file');
}
export async function loadSoundFile(): Promise<{ blob: Blob; name: string } | null> {
  try {
    const db = await idb();
    const v = await new Promise<any>((res) => { const r = db.transaction('f').objectStore('f').get('soundtrack'); r.onsuccess = () => res(r.result ?? null); r.onerror = () => res(null); });
    soundFileName.value = v?.name ?? null;
    return v;
  } catch { return null; }
}
export async function forgetSoundFile(): Promise<void> {
  try { const db = await idb(); db.transaction('f', 'readwrite').objectStore('f').delete('soundtrack'); } catch { /* ignore */ }
  soundFileName.value = null; setSoundSource('youtube');
}

const tryPlay = (m: Media) => {
  try {
    const p = m.play();
    if (p && typeof (p as Promise<void>).then === 'function') (p as Promise<void>).then(() => { soundBlocked.value = false; }, () => { soundBlocked.value = true; });
    else setTimeout(() => { if (!m.playing()) soundBlocked.value = true; else soundBlocked.value = false; }, 1500);
  } catch { soundBlocked.value = true; }
};
/** A tap on "enable sound": the browser now allows the soundtrack to play. */
export function unblockSound() { unlockAudio(); if (yt.player) tryPlay(yt.player); }

/** Called from a user tap on the table. Starts the soundtrack inside the tap (browsers need one) and tells the server. */
export function startAudio(offsetSec: number) {
  unlockAudio();
  if (yt.player && yt.ready && !yt.failed) {
    try { yt.player.seek(offsetSec); tryPlay(yt.player); send({ type: 'startGame', source: 'video' }); return; } catch { /* fall through */ }
  }
  send({ type: 'startGame', source: 'manual' });
}
/** Pause/resume from the table. Inside the tap so the browser lets the sound play again; the sync loop keeps it in step. */
export function toggleClock(running: boolean) {
  unlockAudio();
  if (running) { try { yt.player?.pause(); } catch { /* ignore */ } send({ type: 'pauseClock' }); }
  else { if (yt.player && yt.ready && !yt.failed) tryPlay(yt.player); send({ type: 'resumeClock' }); }
}
export function setVideoVolume(v: number) { try { yt.player?.volume(v); } catch { /* ignore */ } }

/** True while the sound device has its audio tab open during play (the dock then slides into view). */
export const soundSheet = signal(false);
export type DockMode = 'top' | 'sheet' | 'parked' | 'inline';
/**
 * The ONE soundtrack player of the table. It is mounted once, at a fixed place in the tree, for the whole game:
 * moving or re-creating it would reload the media, so screens only change its CSS mode, never where it lives.
 * Switching the source (YouTube / file) remounts it on purpose.
 */
export function SoundDock({ mode }: { mode: DockMode }) {
  return <div class={`dock ${mode}`}><SoundPlayer key={soundSource.value + (soundFileName.value ?? '')} big /></div>;
}

export function SoundPlayer({ big }: { big?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'nofile'>('loading');
  const v = view.value!;

  useEffect(() => {
    let dead = false;
    yt.ready = false; yt.failed = false; yt.player = null;
    const fail = () => { yt.failed = true; notify(); if (!dead) setState('failed'); const vv = view.value; if (vv && vv.clock.source === 'video') send({ type: 'setClockSource', source: 'manual' }); };
    const ok = () => { yt.ready = true; notify(); if (!dead) setState('ready'); };
    let cleanup = () => {};
    if (soundSource.value === 'file') {
      void loadSoundFile().then((f) => {
        if (dead || !host.current) return;
        if (!f) { setState('nofile'); yt.failed = true; notify(); return; }
        const el = document.createElement('video');
        el.playsInline = true; el.preload = 'auto'; el.controls = true;
        const url = URL.createObjectURL(f.blob);
        el.src = url;
        host.current.innerHTML = ''; host.current.appendChild(el);
        el.oncanplay = () => { if (!yt.ready) ok(); };
        el.onerror = fail;
        el.onplay = el.onpause = () => notify();
        yt.player = {
          play: () => el.play(), pause: () => el.pause(), seek: (sec) => { el.currentTime = sec; },
          time: () => el.currentTime, playing: () => !el.paused && !el.ended, volume: (x) => { el.volume = Math.max(0, Math.min(1, x / 100)); }
        };
        cleanup = () => { el.pause(); el.removeAttribute('src'); URL.revokeObjectURL(url); };
      });
    } else {
      loadApi().then((YT) => {
        if (dead || !host.current) return;
        const el = document.createElement('div');
        host.current.innerHTML = '';
        host.current.appendChild(el);
        const p = new YT.Player(el, {
          videoId: rules.settings.videoId, width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
          events: { onReady: ok, onError: fail, onStateChange: () => notify() }
        });
        yt.player = {
          play: () => p.playVideo(), pause: () => p.pauseVideo(), seek: (sec) => p.seekTo(sec, true),
          time: () => p.getCurrentTime(), playing: () => p.getPlayerState() === 1, volume: (x) => p.setVolume(x)
        };
        cleanup = () => { try { p.destroy(); } catch { /* ignore */ } };
      }).catch(fail);
    }
    return () => { dead = true; cleanup(); yt.player = null; yt.ready = false; };
  }, []);

  // The game clock is the source of truth: the soundtrack follows it (plays, pauses, and seeks when it drifts).
  // Seeks are rare on purpose: on slow Wi-Fi each one re-buffers, so only a real drift (>3 s) triggers one, at most every 15 s.
  useEffect(() => {
    let lastSeek = 0;
    const i = setInterval(() => {
      const vv = view.value, m = yt.player;
      if (!vv || !m || !yt.ready || yt.failed || vv.phase !== 'play') return;
      try {
        const playing = m.playing();
        if (!vv.clock.running) { if (playing) m.pause(); return; }
        const want = vv.settings.videoOffsetSec + (vv.clock.lengthMs - remainingMs(vv, serverNow())) / 1000;
        if (Math.abs(m.time() - want) > 3 && Date.now() - lastSeek > 15000) { m.seek(want); lastSeek = Date.now(); }
        if (!playing && !soundBlocked.value) tryPlay(m);
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div class={`yt-wrap ${big ? 'big' : ''}`}>
      <div class="yt-box" ref={host} />
      {state === 'failed' && <p class="warn">{t('videoFailed')}</p>}
      {state === 'nofile' && <p class="warn">{t('soundNoFile')}</p>}
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
