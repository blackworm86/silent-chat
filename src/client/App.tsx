import { useEffect, useState } from 'preact/hooks';
import { unlock, tryStoredPass, content, lang, setLang, forget } from './content';
import { t, Btn, Panel, Muted } from './ui/common';
import { PlayerRoom } from './ui/shell';
import { Diag } from './ui/diag';
import { loadConfig, codeLength, isFirebase } from './config';
import { TableApp } from './ui/tableapp';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: codeLength() }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

function useHash(): string {
  const [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => setH(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}

function LangSwitch() {
  return <div class="seg small"><button class={lang.value === 'it' ? 'on' : ''} onClick={() => setLang('it')}>IT</button><button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button></div>;
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
      <Panel>
        <div class="row between"><h1>Silent Chat</h1><LangSwitch /></div>
        <Muted>{t('unlockHint')}</Muted>
        <input class="input" type="password" autocomplete="current-password" value={pass} placeholder={t('passphrase')} onInput={(e) => setPass((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        {bad && <p class="warn">{t('wrongPass')}</p>}
        {missing && <p class="warn">{t('packMissing')}</p>}
        <Btn disabled={busy || pass.length < 1} onClick={go}>{busy ? t('unlocking') : t('unlock')}</Btn>
      </Panel>
    </div>
  );
}

function Home() {
  const [name, setName] = useState(localStorage.getItem('aim.name') || '');
  const [code, setCode] = useState('');
  const saveName = (n: string) => { setName(n); localStorage.setItem('aim.name', n); };
  const ok = name.trim().length > 0;
  return (
    <div class="page">
      <header class="topbar"><div class="phase">Silent Chat</div><LangSwitch /></header>
      <main class="main">
        <Panel amber><h2>{t('homeTitle')}</h2><p>{t('homeTag')}</p></Panel>
        <Panel>
          <input class="input" value={name} maxLength={20} placeholder={t('yourName')} onInput={(e) => saveName((e.target as HTMLInputElement).value)} />
          <Btn disabled={!ok} onClick={() => { location.hash = `#/r/${newCode()}/new`; }}>{t('createGame')}</Btn>
        </Panel>
        <Panel>
          <input class="input code-input" value={code} maxLength={6} placeholder={t('roomCode')} onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} />
          <Btn kind="ghost" disabled={!ok || code.length < 3} onClick={() => { location.hash = `#/r/${code}`; }}>{t('joinGame')}</Btn>
          <Btn kind="ghost" disabled={code.length < 3} onClick={() => { location.hash = `#/t/${code}`; }}>{t('joinAsTable')}</Btn>
        </Panel>
        <Muted>{t('privateNote')}</Muted>
        {isFirebase() && <a class="btn ghost small" href="#/diag">{t('diagTitle')}</a>}
        <Btn kind="ghost" small onClick={() => { forget(); location.reload(); }}>{t('forgetPass')}</Btn>
      </main>
    </div>
  );
}

export function App() {
  const [checked, setChecked] = useState(false);
  const hash = useHash();
  useEffect(() => { void Promise.all([loadConfig(), tryStoredPass()]).finally(() => setChecked(true)); }, []);
  useEffect(() => { document.documentElement.lang = lang.value; }, [lang.value]);
  if (!checked) return <div class="page center"><p>…</p></div>;
  if (!content.value) return <Unlock />;
  if (hash === '#/diag') return <Diag />;
  const m = /^#\/(r|t)\/([A-Za-z0-9]{3,10})(\/new)?$/.exec(hash);
  if (m) {
    const code = m[2].toUpperCase();
    return m[1] === 't' ? <TableApp code={code} /> : <PlayerRoom code={code} create={!!m[3]} />;
  }
  return <Home />;
}
