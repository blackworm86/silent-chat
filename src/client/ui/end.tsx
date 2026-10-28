import { useState } from 'preact/hooks';
import { Download, SendHorizontal } from 'lucide-preact';
import { send, chat } from '../net';
import { C, tx } from '../content';
import { t, Btn, Panel, Label, Muted, seatName, UnofficialTag, showUnofficial, ActionBar, Waiting, Section, TextLink } from './common';
import { ChatTab } from './play';
import { VoicemailPlayer } from './sound';
import type { View } from '../../shared/types';

function Next({ v, label }: { v: View; label?: string }) {
  return <ActionBar>{v.me.isHost ? <Btn onClick={() => send({ type: 'next' })}>{label ?? t('next')}</Btn> : <Waiting>{t('waitHost')}</Waiting>}</ActionBar>;
}

export function Final({ v }: { v: View }) {
  const chatApp = v.settings.sources.chat === 'app';
  return (
    <>
      <Panel amber><h2>{t('timesUp')}</h2><p>{t('finalHint')}</p></Panel>
      {chatApp ? <ChatTab v={v} groupOnly /> : <Muted>{t('finalExternal')}</Muted>}
      <Next v={v} label={t('toVoicemails')} />
    </>
  );
}

export function Playback({ v }: { v: View }) {
  return (
    <>
      <Panel amber><h2>{t('voicemailsTitle')}</h2><p>{t('playbackHint')}</p></Panel>
      {v.me.isSound ? <VoicemailPlayer /> : <Muted>{t('listenTable')}</Muted>}
      <Next v={v} label={t('toDebrief')} />
    </>
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
  const [tab, setTab] = useState<'talk' | 'names'>('talk');   // two short views instead of one long page
  return (
    <>
      {chatApp && (
        <div class="seg">
          <button class={tab === 'talk' ? 'on' : ''} onClick={() => setTab('talk')}>{tx(d.title)}</button>
          <button class={tab === 'names' ? 'on' : ''} onClick={() => setTab('names')}>{t('realNames')}{real.length ? ` · ${real.length}` : ''}</button>
        </div>
      )}
      {tab === 'talk' && <article class="gcard">
        <div class="row between"><Label>{tx(d.title)}</Label>{showUnofficial() && <UnofficialTag />}</div>
        <p class="italic muted">{tx(d.intro)}</p>
        <ol class="guide">{d.questions.map((q: any, i: number) => <li key={i}>{tx(q)}</li>)}</ol>
        <p class="italic muted">{tx(d.outro)}</p>
      </article>}
      {tab === 'names' && chatApp && (
        <Section>
          {real.map((m) => <p key={m.id}><b>{seatName(v, m.from)}</b> {m.text}</p>)}
          <div class="row nowrap">
            <input class="input" value={name} maxLength={60} placeholder={t('realNamePlaceholder')} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <Btn small full={false} label={t('send')} disabled={!name.trim()} onClick={() => { if (name.trim()) { send({ type: 'realName', text: name }); setName(''); } }}><SendHorizontal size={20} /></Btn>
          </div>
          <TextLink onClick={() => exportChat(v)}><Download size={16} />{t('exportChat')}</TextLink>
        </Section>
      )}
      {!chatApp && <Muted>{t('renameContacts')}</Muted>}
      <Next v={v} label={t('finish')} />
    </>
  );
}

export function Done() {
  return <div class="stack loose center-text" style={{ paddingTop: '48px' }}><h1>{t('thanks')}</h1><p class="lede">{t('thanksHint')}</p><a class="btn ghost" href="#/">{t('backHome')}</a></div>;
}
