import { useEffect, useState } from 'preact/hooks';
import { KeyRound, Trash2, Tablet, FlaskConical } from 'lucide-preact';
import { unlock, tryStoredPass, content, lang, setLang, forget } from './content';
import { t, Btn, Section, ListRow, TextLink, ConfirmSheet, Waiting } from './ui/common';
import { myGames, deleteSession } from './net';
import { PlayerRoom } from './ui/shell';
import { Diag } from './ui/diag';
import { loadConfig, codeLength, isFirebase } from './config';
import { TableApp } from './ui/tableapp';
import { DemoRoom } from './ui/demo';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: codeLength() }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

function useHash(): string {
  const [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => setH(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}

function LangSwitch() {
  return <div class="seg small" role="group" aria-label={t('language')}><button class={lang.value === 'it' ? 'on' : ''} onClick={() => setLang('it')}>IT</button><button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button></div>;
}

function Unlock() {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const [missing, setMissing] = useState(false);
  const go = async () => {
    setBusy(true); setBad(false); setMissing(false);
    try { const ok = await unlock(pass); if (!ok) setBad(true); } catch { setMissing(true); }
    setBusy(false);
  };
  return (
    <div class="page center">
      <div class="narrow-box stack loose">
        <div class="row between"><span class="brand">Silent Chat</span><LangSwitch /></div>
        <div class="stack tight"><h1>{t('homeTitle')}</h1><p class="lede">{t('unlockHint')}</p></div>
        <div class="stack">
          <input class="input" type="password" autocomplete="current-password" enterKeyHint="go" value={pass} placeholder={t('passphrase')} onInput={(e) => setPass((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          {bad && <p class="warn small">{t('wrongPass')}</p>}
          {missing && <p class="warn small">{t('packMissing')}</p>}
          <Btn disabled={busy || pass.length < 1} icon={<KeyRound size={18} />} onClick={go}>{busy ? t('unlocking') : t('unlock')}</Btn>
        </div>
      </div>
    </div>
  );
}

/** Games this device runs as the table: resume or delete them without remembering the code. */
function MyGames() {
  const [del, setDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (myGames.value.length === 0) return null;
  const fmt = (at: number) => new Date(at).toLocaleString(lang.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const confirmDelete = async () => {
    if (!del) return;
    setBusy(true);
    try { await deleteSession(del); } catch { /* the room may already be gone */ }
    setBusy(false); setDel(null);
  };
  return (
    <Section title={t('yourGames')}>
      <div class="list">
        {myGames.value.map((g) => (
          <ListRow key={g.code} sub={t('startedOn', { date: fmt(g.at) })}
            end={<span class="row nowrap" style={{ gap: '4px' }}>
              <Btn small full={false} kind="ghost" onClick={() => { location.hash = `#/t/${g.code}`; }}>{t('resume')}</Btn>
              <button class="icon-btn warn" aria-label={`${t('deleteGame')} ${g.code}`} onClick={() => setDel(g.code)}><Trash2 size={19} /></button>
            </span>}>
            <b class="num" style={{ letterSpacing: '0.12em' }}>{g.code}</b>
          </ListRow>
        ))}
      </div>
      {del && (
        <ConfirmSheet title={t('deleteGameTitle')} body={t('deleteGameBody')} confirm={busy ? t('deleting') : t('deleteGame')} danger busy={busy}
          onClose={() => setDel(null)} onConfirm={confirmDelete} />
      )}
    </Section>
  );
}

function Home() {
  const [name, setName] = useState(localStorage.getItem('aim.name') || '');
  const [code, setCode] = useState('');
  const saveName = (n: string) => { setName(n); localStorage.setItem('aim.name', n); };
  const ok = name.trim().length > 0;
  const join = () => { if (ok && code.length >= 3) location.hash = `#/r/${code}`; };
  return (
    <div class="page">
      <main class="main no-bar">
        <div class="row between" style={{ paddingTop: 'var(--safe-t)' }}><span class="brand">Silent Chat</span><LangSwitch /></div>
        <div class="hero"><h1>{t('homeTitle')}</h1><p class="lede">{t('homeTag')}</p></div>
        <div class="stack tight">
          <Btn icon={<Tablet size={18} />} onClick={() => { location.hash = `#/t/${newCode()}/new`; }}>{t('createGame')}</Btn>
          <p class="faint small">{t('createHint')}</p>
        </div>
        <MyGames />
        <div class="or">{t('orJoin')}</div>
        <div class="stack">
          <input class="input" value={name} maxLength={20} autocomplete="given-name" placeholder={t('yourName')} onInput={(e) => saveName((e.target as HTMLInputElement).value)} />
          <input class="input code-input" value={code} maxLength={codeLength()} autocapitalize="characters" autocomplete="off" spellcheck={false} placeholder={t('roomCode')}
            onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && join()} />
          <Btn kind="ghost" disabled={!ok || code.length < 3} onClick={join}>{t('joinGame')}</Btn>
        </div>
        <div class="stack tight">
          <Btn kind="outline" disabled={!ok} icon={<FlaskConical size={18} />} onClick={() => { location.hash = '#/demo'; }}>{t('hostDemo')}</Btn>
          <p class="faint small center-text">{t('hostDemoHint')}</p>
        </div>
        <div class="stack tight center-text" style={{ marginTop: 'var(--s5)' }}>
          <p class="faint small">{t('privateNote')}</p>
          <div class="row" style={{ justifyContent: 'center', gap: '4px' }}>
            {isFirebase() && <a class="link" href="#/diag">{t('diagTitle')}</a>}
            <TextLink onClick={() => { forget(); location.reload(); }}>{t('forgetPass')}</TextLink>
          </div>
        </div>
      </main>
    </div>
  );
}

const ROUTE = /^#\/(r|t)\/([A-Za-z0-9]{3,10})(\/new)?(?:\?(.*))?$/;
export function parseRoute(hash: string) {
  const m = ROUTE.exec(hash);
  if (!m) return null;
  return { role: m[1] as 'r' | 't', code: m[2].toUpperCase(), create: !!m[3], key: new URLSearchParams(m[4] ?? '').get('k') };
}
/** Remove the key from the address bar (so it is not left in screenshots / history). */
function cleanUrl() {
  const h = location.hash.replace(/\?k=[^&]*&?/, '?').replace(/\?$/, '');
  if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
}

function InviteNote({ warn, text }: { warn?: boolean; text: string }) {
  return (
    <div class="page center">
      <div class="narrow-box stack loose">
        <div class="row between"><span class="brand">Silent Chat</span><LangSwitch /></div>
        <p class={warn ? 'warn' : 'lede'}>{text}</p>
        <a class="link" href="#/">{t('imHost')}</a>
      </div>
    </div>
  );
}

export function App() {
  const [checked, setChecked] = useState(false);
  const [linkState, setLinkState] = useState<'idle' | 'bad'>('idle');
  const hash = useHash();
  const route = parseRoute(hash);
  useEffect(() => { void Promise.all([loadConfig(), tryStoredPass()]).finally(() => setChecked(true)); }, []);
  useEffect(() => { document.documentElement.lang = lang.value; }, [lang.value]);
  // A friend opened an invite link/QR: unlock silently with the key inside it.
  useEffect(() => {
    if (!checked || !route?.key) return;
    if (content.value) { cleanUrl(); return; }
    unlock(route.key).then((ok) => { if (ok) cleanUrl(); else setLinkState('bad'); }).catch(() => setLinkState('bad'));
  }, [checked, route?.key]);

  if (!checked) return <div class="page center" />;
  if (!content.value) {
    if (route?.key) return linkState === 'bad' ? <InviteNote warn text={t('inviteBad')} /> : <div class="page center"><div class="narrow-box"><Waiting>{t('unlocking')}</Waiting></div></div>;
    if (route) return <InviteNote text={t('needInvite')} />;   // friends never get a passphrase box
    return <Unlock />;                                          // only the host's start screen asks for it
  }
  if (hash === '#/diag') return <Diag />;
  if (hash === '#/demo') return <DemoRoom />;
  if (route) return route.role === 't' ? <TableApp code={route.code} create={route.create} /> : <PlayerRoom code={route.code} create={false} />;
  return <Home />;
}
