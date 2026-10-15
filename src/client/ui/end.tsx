import { useState } from 'preact/hooks';
import { send, chat } from '../net';
import { C, tx } from '../content';
import { t, Btn, Panel, Label, Muted, seatName, UnofficialTag, showUnofficial } from './common';
import { ChatTab } from './play';
import { SoundPlayer, VoicemailPlayer } from './sound';
import type { View } from '../../shared/types';

function Next({ v, label }: { v: View; label?: string }) {
  return v.me.isHost ? <Btn onClick={() => send({ type: 'next' })}>{label ?? t('next')}</Btn> : <Muted>{t('waitHost')}</Muted>;
}

export function Final({ v }: { v: View }) {
  const chatApp = v.settings.sources.chat === 'app';
  return (
    <div class="stack">
      <Panel amber><h2>{t('timesUp')}</h2><p>{t('finalHint')}</p></Panel>
      {chatApp ? <ChatTab v={v} groupOnly /> : <Muted>{t('finalExternal')}</Muted>}
      {v.me.isSound && <SoundPlayer />}
      <Next v={v} label={t('toVoicemails')} />
    </div>
  );
}

export function Playback({ v }: { v: View }) {
  return (
    <div class="stack">
      <Panel amber><h2>{t('voicemailsTitle')}</h2><p>{t('playbackHint')}</p></Panel>
      {v.me.isSound ? <><SoundPlayer /><VoicemailPlayer /></> : <Muted>{v.settings.soundDevice === 'table' ? t('listenTable') : t('listenHost')}</Muted>}
      <Next v={v} label={t('toDebrief')} />
    </div>
  );
}

function exportChat(v: View) {
  const lines = chat.value.filter((m) => m.kind === 'msg' && !m.deleted).map((m) => {
    const d = new Date(m.at); const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const to = m.to === 'group' ? '' : ` → ${seatName(v, m.to as number)}`;
    return `[${hh}] ${seatName(v, m.from, true)}${to}: ${m.text}`;
  });
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = `alice-chat-${v.code}.txt`; a.click();
}

export function Debrief({ v }: { v: View }) {
  const d = C().specialCards.debrief;
  const [name, setName] = useState('');
  const chatApp = v.settings.sources.chat === 'app';
  const real = chat.value.filter((m) => m.kind === 'msg' && m.as === null && !m.deleted);
  return (
    <div class="stack">
      <Panel amber>
        <Label>{tx(d.title)} {showUnofficial() && <UnofficialTag />}</Label>
        <p class="italic">{tx(d.intro)}</p>
        <ol class="guide">{d.questions.map((q: any, i: number) => <li key={i}>{tx(q)}</li>)}</ol>
        <p class="italic">{tx(d.outro)}</p>
      </Panel>
      {v.me.isHost && <Muted>{t('debriefReader')}</Muted>}
      {chatApp ? (
        <Panel>
          <Label>{t('realNames')}</Label>
          {real.map((m) => <p key={m.id}><b>{seatName(v, m.from)}</b>: {m.text}</p>)}
          <div class="row">
            <input class="input" value={name} maxLength={60} placeholder={t('realNamePlaceholder')} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <Btn full={false} onClick={() => { if (name.trim()) { send({ type: 'realName', text: name }); setName(''); } }}>➤</Btn>
          </div>
          <Btn kind="ghost" small onClick={() => exportChat(v)}>⬇ {t('exportChat')}</Btn>
        </Panel>
      ) : <Muted>{t('renameContacts')}</Muted>}
      <Next v={v} label={t('finish')} />
    </div>
  );
}

export function Done() {
  return <Panel amber><h2>{t('thanks')}</h2><p>{t('thanksHint')}</p></Panel>;
}
