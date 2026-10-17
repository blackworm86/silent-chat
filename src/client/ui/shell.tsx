import { useEffect, useState } from 'preact/hooks';
import { BookOpen, NotebookPen, ShieldAlert, SlidersHorizontal, Undo2, LogOut, Trash2, Menu, WifiOff, Monitor, CircleAlert } from 'lucide-preact';
import { view, send, connect, disconnect, fatal, conn, hostOffline, deleteSession } from '../net';
import { isFirebase } from '../config';
import { lang, setLang, forget } from '../content';
import { t, Btn, Muted, Modal, ListRow, Section, ConfirmSheet, TextLink, Waiting } from './common';
import { Lobby, Safety, Intro, Characters, Drives, Turns, Relations, Voicemail, Deal, Rules, Ready, QuickGuide } from './setup';
import { PlayScreen, NotesTab, HostPanel, LightsOut, Toasts } from './play';
import { Final, Playback, Debrief, Done } from './end';
import { SoundDock, soundSheet, type DockMode } from './sound';
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

export function FatalScreen({ code }: { code: string }) {
  return (
    <div class="page center"><div class="narrow-box stack loose center-text">
      <CircleAlert size={36} class="faint" style={{ margin: '0 auto' }} />
      <h2>{t(('fatal_' + code) as keyof typeof dict.en)}</h2>
      <a class="btn ghost" href="#/">{t('backHome')}</a>
    </div></div>
  );
}
export function Connecting({ offline }: { offline?: boolean }) {
  return (
    <div class="page center"><div class="narrow-box stack">
      <Waiting>{conn.value === 'open' ? t('loading') : t('connecting')}…</Waiting>
      {offline && <p class="warn small center-text"><WifiOff size={14} style={{ verticalAlign: '-2px' }} /> {t('hostOffline')}</p>}
    </div></div>
  );
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
    const go = () => { if (draft.trim()) { localStorage.setItem('aim.name', draft.trim()); setName(draft.trim()); } };
    return (
      <div class="page center"><div class="narrow-box stack loose">
        <div class="stack tight">
          <span class="brand">Silent Chat</span>
          <Muted>{t('joiningGame', { code })}</Muted>
        </div>
        <div class="field">
          <h2>{t('yourNameFirst')}</h2>
          <input class="input" autoFocus autocomplete="given-name" enterKeyHint="go" value={draft} maxLength={20} placeholder={t('namePlaceholder')}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        </div>
        <Btn disabled={!draft.trim()} onClick={go}>{t('continue')}</Btn>
      </div></div>
    );
  }
  const v = view.value;
  if (fatal.value) return <FatalScreen code={fatal.value} />;
  if (!v) return <Connecting offline={hostOffline.value} />;
  return <Shell v={v} />;
}

export function Screen({ v, onMenu }: { v: View; onMenu?: () => void }) {
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
    case 'play': return <PlayScreen v={v} onMenu={onMenu} />;
    case 'final': return <Final v={v} />;
    case 'playback': return <Playback v={v} />;
    case 'debrief': return <Debrief v={v} />;
    default: return <Done />;
  }
}

const CAN_GO_BACK = ['safety', 'intro', 'characters', 'drives', 'intros', 'relations', 'voicemail', 'hunches', 'deal', 'rules'];
type Sheet = null | 'menu' | 'guide' | 'notes' | 'safety' | 'host' | 'delete';

function Shell({ v }: { v: View }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [deleting, setDeleting] = useState(false);
  const close = () => setSheet(null);
  useEffect(() => { window.scrollTo(0, 0); }, [v.phase]);     // every phase starts at its top
  const showX = !['lobby', 'safety', 'play', 'done'].includes(v.phase);
  const noBar = ['done'].includes(v.phase);
  const dock: DockMode | null = !v.me.isSound ? null : ['ready', 'final', 'playback'].includes(v.phase) ? 'top' : v.phase === 'play' && soundSheet.value ? 'sheet' : 'parked';
  const doDelete = async () => {
    setDeleting(true);
    try { await deleteSession(v.code); } finally { setDeleting(false); }
    location.hash = '#/';
  };
  return (
    <div class="page">
      <LightsOut v={v} />
      <Toasts />
      {v.phase === 'play' ? <Screen v={v} onMenu={() => setSheet('menu')} /> : (
        <>
          <header class="topbar">
            <div><div class="title">{t(('phase_' + v.phase) as keyof typeof dict.en)}</div><div class="sub num">{t('room')} {v.code}</div></div>
            <div class="topbar-end">
              {showX && <button class="xbtn" aria-label={t('xCard')} onClick={() => send({ type: 'safety', kind: 'x', text: '' })}>X</button>}
              <button class="icon-btn" aria-label={t('menu')} onClick={() => setSheet('menu')}><Menu size={22} /></button>
            </div>
          </header>
          {isFirebase() && v.me.isHost && ['lobby', 'ready'].includes(v.phase) && <div class="hostnote"><Monitor size={18} style={{ flex: 'none', marginTop: '1px' }} /><span>{t('hostKeepOpen')}</span></div>}
          {isFirebase() && !v.me.isHost && hostOffline.value && <div class="hostnote warn"><WifiOff size={18} style={{ flex: 'none', marginTop: '1px' }} /><span>{t('hostOffline')}</span></div>}
          <main class={`main ${noBar ? 'no-bar' : ''} ${dock === 'top' ? 'with-dock' : ''}`}><Screen v={v} /></main>
        </>
      )}
      {dock && <SoundDock mode={dock} />}

      {sheet === 'menu' && (
        <Modal title={t('menu')} onClose={close}>
          <div class="list">
            <ListRow icon={<BookOpen size={20} />} onClick={() => setSheet('guide')}>{t('quickGuide')}</ListRow>
            <ListRow icon={<NotebookPen size={20} />} onClick={() => setSheet('notes')}>{t('tabNotes')}</ListRow>
            <ListRow icon={<ShieldAlert size={20} />} onClick={() => setSheet('safety')}>{t('safetyTools')}</ListRow>
          </div>
          {v.me.isHost && (
            <Section title={t('hostSection')}>
              <div class="list">
                <ListRow icon={<SlidersHorizontal size={20} />} onClick={() => setSheet('host')}>{t('hostPanel')}</ListRow>
                {CAN_GO_BACK.includes(v.phase) && <ListRow icon={<Undo2 size={20} />} onClick={() => { send({ type: 'back' }); close(); }}>{t('prevPhase')}</ListRow>}
              </div>
            </Section>
          )}
          <Section title={t('language')}>
            <div class="seg"><button class={lang.value === 'it' ? 'on' : ''} onClick={() => setLang('it')}>Italiano</button><button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
          </Section>
          <div class="list">
            <ListRow icon={<LogOut size={20} />} onClick={() => { location.hash = '#/'; }}>{t('leave')}</ListRow>
            {v.me.isHost && <ListRow danger icon={<Trash2 size={20} />} onClick={() => setSheet('delete')}>{t('deleteGame')}</ListRow>}
          </div>
          <TextLink onClick={() => { forget(); location.reload(); }}>{t('forgetPass')}</TextLink>
        </Modal>
      )}
      {sheet === 'guide' && <Modal title={t('quickGuide')} onClose={close}><QuickGuide v={v} /></Modal>}
      {sheet === 'notes' && <Modal title={t('tabNotes')} onClose={close}><NotesTab v={v} /></Modal>}
      {sheet === 'safety' && (
        <Modal title={t('safetyTools')} onClose={close}>
          <p class="muted">{t('safetyX')}</p>
          <p class="muted">{t('safetyDoor')}</p>
          <Section title={t('linesAndVeils')}>
            {v.safety.items.length === 0 ? <Muted small>{t('noneYet')}</Muted>
              : <div class="chips">{v.safety.items.map((i) => <span class={`tag ${i.kind}`} key={i.id}>{i.kind === 'line' ? t('line') : t('veil')}: {i.text}</span>)}</div>}
          </Section>
        </Modal>
      )}
      {sheet === 'host' && v.me.isHost && <HostPanel v={v} onClose={close} />}
      {sheet === 'delete' && v.me.isHost && (
        <ConfirmSheet title={t('deleteGameTitle')} body={t('deleteGameBody')} confirm={deleting ? t('deleting') : t('deleteGame')} danger busy={deleting} onConfirm={doDelete} onClose={close} />
      )}
    </div>
  );
}
