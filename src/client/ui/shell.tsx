import { useEffect, useState } from 'preact/hooks';
import { view, send, connect, disconnect, fatal, conn, hostOffline } from '../net';
import { isFirebase } from '../config';
import { lang, setLang, forget } from '../content';
import { t, Btn, Panel, Muted, Modal } from './common';
import { Lobby, Safety, Intro, Characters, Drives, Turns, Relations, Voicemail, Deal, Rules, Ready, QuickGuide } from './setup';
import { PlayScreen, NotesTab, HostPanel, LightsOut, Toasts } from './play';
import { Final, Playback, Debrief, Done } from './end';
import { dict } from '../i18n';
import type { View } from '../../shared/types';

export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: any = null;
    const acquire = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignore */ } };
    void acquire();
    const vis = () => { if (document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); try { lock?.release?.(); } catch { /* ignore */ } };
  }, [on]);
}

export function PlayerRoom({ code, create }: { code: string; create: boolean }) {
  const [name, setName] = useState(localStorage.getItem('aim.name') || '');
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (!name) return;
    connect(code, 'player', create, name);
    return () => disconnect();
  }, [code, name]);
  useWakeLock(true);
  if (!name) {
    return (
      <div class="page center"><Panel>
        <h2>{t('yourNameFirst')}</h2>
        <input class="input" value={draft} maxLength={20} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { localStorage.setItem('aim.name', draft.trim()); setName(draft.trim()); } }} />
        <Btn disabled={!draft.trim()} onClick={() => { localStorage.setItem('aim.name', draft.trim()); setName(draft.trim()); }}>{t('continue')}</Btn>
      </Panel></div>
    );
  }
  const v = view.value;
  if (fatal.value) {
    return (
      <div class="page center"><Panel>
        <h2>{t(('fatal_' + fatal.value) as keyof typeof dict.en)}</h2>
        <a class="btn ghost" href="#/">{t('back')}</a>
      </Panel></div>
    );
  }
  if (!v) return <div class="page center"><div><p>{conn.value === 'open' ? t('loading') : t('connecting')}…</p>{hostOffline.value && <p class="warn">{t('hostOffline')}</p>}</div></div>;
  return <Shell v={v} />;
}

export function Screen({ v }: { v: View }) {
  switch (v.phase) {
    case 'lobby': return <Lobby v={v} />;
    case 'safety': return <Safety v={v} />;
    case 'intro': return <Intro v={v} />;
    case 'characters': return <Characters v={v} />;
    case 'drives': return <Drives v={v} />;
    case 'intros': return <Turns v={v} kind="intros" />;
    case 'relations': return <Relations v={v} />;
    case 'voicemail': return <Voicemail v={v} />;
    case 'hunches': return <Turns v={v} kind="hunches" />;
    case 'deal': return <Deal v={v} />;
    case 'rules': return <Rules v={v} />;
    case 'ready': return <Ready v={v} />;
    case 'play': return <PlayScreen v={v} />;
    case 'final': return <Final v={v} />;
    case 'playback': return <Playback v={v} />;
    case 'debrief': return <Debrief v={v} />;
    default: return <Done />;
  }
}

function Shell({ v }: { v: View }) {
  const [menu, setMenu] = useState<null | 'menu' | 'guide' | 'notes' | 'safety' | 'host'>(null);
  const showX = !['lobby', 'safety', 'done'].includes(v.phase);
  return (
    <div class="page">
      <LightsOut v={v} />
      <header class="topbar">
        <div><div class="phase">{t(('phase_' + v.phase) as keyof typeof dict.en)}</div><div class="muted small">{t('room')} {v.code}</div></div>
        <button class="icon-btn" aria-label={t('menu')} onClick={() => setMenu('menu')}>☰</button>
      </header>
      <Toasts />
      {isFirebase() && v.me.isHost && ['lobby', 'ready'].includes(v.phase) && <div class="hostnote">🖥 {t('hostKeepOpen')}</div>}
      {isFirebase() && !v.me.isHost && hostOffline.value && <div class="hostnote warn">⚠ {t('hostOffline')}</div>}
      <main class={v.phase === 'play' ? 'main play-main' : 'main'}><Screen v={v} /></main>
      {showX && v.phase !== 'play' && <button class="xfloat" aria-label={t('xCard')} onClick={() => send({ type: 'safety', kind: 'x', text: '' })}>X</button>}
      {menu === 'menu' && (
        <Modal title={t('menu')} onClose={() => setMenu(null)}>
          <div class="stack">
            <Btn kind="ghost" onClick={() => setMenu('guide')}>📖 {t('quickGuide')}</Btn>
            <Btn kind="ghost" onClick={() => setMenu('notes')}>📝 {t('tabNotes')}</Btn>
            <Btn kind="ghost" onClick={() => setMenu('safety')}>⚠ {t('safetyTools')}</Btn>
            {v.me.isHost && <Btn kind="ghost" onClick={() => setMenu('host')}>🎛 {t('hostPanel')}</Btn>}
            {v.me.isHost && v.phase !== 'lobby' && v.phase !== 'ready' && v.phase !== 'play' && v.phase !== 'final' && v.phase !== 'playback' && v.phase !== 'debrief' && v.phase !== 'done' && <Btn kind="ghost" onClick={() => { send({ type: 'back' }); setMenu(null); }}>↩ {t('prevPhase')}</Btn>}
            <div class="seg"><button class={lang.value === 'it' ? 'on' : ''} onClick={() => setLang('it')}>Italiano</button><button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
            <Btn kind="ghost" onClick={() => { location.hash = '#/'; }}>{t('leave')}</Btn>
            <Btn kind="ghost" small onClick={() => { forget(); location.reload(); }}>{t('forgetPass')}</Btn>
          </div>
        </Modal>
      )}
      {menu === 'guide' && <Modal title={t('quickGuide')} onClose={() => setMenu(null)}><QuickGuide v={v} /></Modal>}
      {menu === 'notes' && <Modal title={t('tabNotes')} onClose={() => setMenu(null)}><NotesTab v={v} /></Modal>}
      {menu === 'safety' && <Modal title={t('safetyTools')} onClose={() => setMenu(null)}><Panel><p>{t('safetyX')}</p><p>{t('safetyDoor')}</p></Panel><Muted>{t('linesAndVeils')}: {v.safety.items.map((i) => `${i.kind === 'line' ? t('line') : t('veil')}: ${i.text}`).join(' · ') || t('noneYet')}</Muted></Modal>}
      {menu === 'host' && v.me.isHost && <HostPanel v={v} onClose={() => setMenu(null)} />}
    </div>
  );
}
