import { useEffect, useRef, useState } from 'preact/hooks';
import qrcode from 'qrcode-generator';
import { send } from '../net';
import {
  C, tx, character, drive, posterUrl, dayWord
} from '../content';
import { t, Btn, Panel, Label, Muted, Avatar, seatName, UnofficialTag, showUnofficial } from './common';
import { SoundPlayer, startAudio } from './sound';
import { rules } from '../../shared/rules';
import type { Sources, View } from '../../shared/types';

// ---------- helpers ----------
export function Qr({ text }: { text: string }) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return <div class="qr" role="img" aria-label="QR" dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} />;
}
export function usePoster(index: number | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; setUrl(null); if (index !== null) posterUrl(index).then((u) => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [index]);
  return url;
}
export function Poster({ index, small, onClick }: { index: number; small?: boolean; onClick?: () => void }) {
  const url = usePoster(index);
  return url
    ? <img class={`poster ${small ? 'small' : ''}`} src={url} alt={`Poster ${index + 1}`} onClick={onClick} />
    : <div class={`poster ph ${small ? 'small' : ''}`} onClick={onClick}>…</div>;
}
function HostNext({ v, blocked, label, force }: { v: View; blocked?: boolean; label?: string; force?: boolean }) {
  if (!v.me.isHost) return <Muted>{t('waitHost')}</Muted>;
  return (
    <div class="stack">
      <Btn disabled={blocked} onClick={() => send({ type: 'next' })}>{label ?? t('next')}</Btn>
      {blocked && force !== false && <Btn kind="ghost" small onClick={() => send({ type: 'next', force: true })}>{t('forceNext')}</Btn>}
    </div>
  );
}
const joinUrl = (code: string, role: 'r' | 't') => `${location.origin}${location.pathname}#/${role}/${code}`;

// ---------- lobby ----------
const SRC_KEYS: (keyof Sources)[] = ['characters', 'drives', 'poster', 'clues', 'suspects', 'locations', 'search', 'voicemail'];

export function Lobby({ v }: { v: View }) {
  const me = v.players.find((p) => p.seat === v.me.seat)!;
  const [name, setName] = useState(me?.name ?? '');
  const [adv, setAdv] = useState(false);
  const st = v.settings;
  const host = v.me.isHost;
  const set = (o: Record<string, unknown>) => send({ type: 'setSettings', ...o });
  return (
    <div class="stack">
      <Panel>
        <Label>{t('roomCode')}</Label>
        <div class="code">{v.code}</div>
        <div class="row center">
          <div><Qr text={joinUrl(v.code, 'r')} /><Muted>{t('scanPlayers')}</Muted></div>
          <div><Qr text={joinUrl(v.code, 't')} /><Muted>{t('scanTable')}</Muted></div>
        </div>
        <Btn kind="ghost" small onClick={() => navigator.clipboard?.writeText(joinUrl(v.code, 'r'))}>{t('copyLink')}</Btn>
      </Panel>

      <Panel>
        <Label>{t('yourName')}</Label>
        <input class="input" value={name} maxLength={20} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => send({ type: 'setName', name })} />
        <Label>{t('players')} · {v.players.length}/5</Label>
        {v.players.map((p) => (
          <div class="row" key={p.seat}>
            <Avatar seat={p.seat} /> <b>{p.name}</b> {p.isHost && <span class="tag">{t('host')}</span>}
            <span class={`dot ${p.connected ? 'on' : ''}`} aria-label={p.connected ? t('online') : t('offline')} />
          </div>
        ))}
        {v.players.length < 3 && <Muted>{t('needThree')}</Muted>}
        <div class="row"><span>{t('tableDevice')}:</span> <b>{v.tableConnected ? t('connected') : t('notConnected')}</b></div>
      </Panel>

      <Panel>
        <Label>{t('mode')}</Label>
        <div class="seg">
          <button class={st.mode === 'digital' ? 'on' : ''} disabled={!host} onClick={() => set({ mode: 'digital' })}>{t('modeDigital')}</button>
          <button class={st.mode === 'aids' ? 'on' : ''} disabled={!host} onClick={() => set({ mode: 'aids' })}>{t('modeAids')}</button>
        </div>
        <Muted>{st.mode === 'aids' ? t('modeAidsHint') : st.mode === 'digital' ? t('modeDigitalHint') : t('modeCustomHint')}</Muted>
        <Btn kind="ghost" small onClick={() => setAdv(!adv)}>{adv ? t('hideAdvanced') : t('showAdvanced')}</Btn>
        {adv && (
          <div class="stack">
            {SRC_KEYS.map((k) => (
              <div class="row between" key={k}>
                <span>{t(('src_' + k) as any)}</span>
                <div class="seg small">
                  <button class={st.sources[k] === 'digital' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { [k]: 'digital' } })}>{t('digital')}</button>
                  <button class={st.sources[k] === 'physical' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { [k]: 'physical' } })}>{t('physical')}</button>
                </div>
              </div>
            ))}
            <div class="row between">
              <span>{t('src_chat')}</span>
              <div class="seg small">
                <button class={st.sources.chat === 'app' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { chat: 'app' } })}>{t('chatApp')}</button>
                <button class={st.sources.chat === 'external' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { chat: 'external' } })}>{t('chatExternal')}</button>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <Label>{t('soundDevice')}</Label>
        <div class="seg">
          <button class={st.soundDevice === 'host' ? 'on' : ''} disabled={!host} onClick={() => set({ soundDevice: 'host' })}>{t('soundHost')}</button>
          <button class={st.soundDevice === 'table' ? 'on' : ''} disabled={!host} onClick={() => set({ soundDevice: 'table' })}>{t('soundTable')}</button>
        </div>
        <Muted>{st.soundDevice === 'table' ? t('soundTableHint') : t('soundHostHint')}</Muted>
        <Label>{t('dayOfWeek')}</Label>
        <div class="seg">
          <button class={st.dayOfWeek === 'saturday' ? 'on' : ''} disabled={!host} onClick={() => set({ dayOfWeek: 'saturday' })}>{dayWord('saturday')}</button>
          <button class={st.dayOfWeek === 'sunday' ? 'on' : ''} disabled={!host} onClick={() => set({ dayOfWeek: 'sunday' })}>{dayWord('sunday')}</button>
        </div>
        <label class="check"><input type="checkbox" checked={st.includeBodyEnding} disabled={!host} onChange={(e) => set({ includeBodyEnding: (e.target as HTMLInputElement).checked })} /> {t('includeBody')}</label>
        <label class="check"><input type="checkbox" checked={st.showSecretsWhileChoosing} disabled={!host} onChange={(e) => set({ showSecretsWhileChoosing: (e.target as HTMLInputElement).checked })} /> {t('showSecrets')}</label>
        <div class="row between"><span>{t('videoOffset')}</span>
          <input class="input narrow" type="number" min={0} max={600} value={st.videoOffsetSec} disabled={!host} onChange={(e) => set({ videoOffsetSec: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <Muted>{t('videoOffsetHint')}</Muted>
      </Panel>

      <HostNext v={v} blocked={v.players.length < 3} label={t('startSetup')} />
    </div>
  );
}

// ---------- safety ----------
export function Safety({ v }: { v: View }) {
  const [kind, setKind] = useState<'line' | 'veil'>('line');
  const [text, setText] = useState('');
  const me = v.players.find((p) => p.seat === v.me.seat)!;
  const add = (k: 'line' | 'veil', tt: string) => { if (tt.trim()) send({ type: 'addSafety', kind: k, text: tt }); };
  return (
    <div class="stack">
      <Panel amber><Label>{t('contentWarning')}</Label><p>{t('safetyWarning')}</p></Panel>
      <Panel>
        <Label>{t('linesAndVeils')}</Label>
        <Muted>{t('linesVeilsHint')}</Muted>
        <div class="chips">
          {(['sugGore', 'sugConsent', 'sugBlame'] as const).map((k) => (
            <button class="chip" key={k} onClick={() => add('veil', t(k))}>+ {t('veil')}: {t(k)}</button>
          ))}
        </div>
        {v.safety.items.length === 0 && <Muted>{t('noneYet')}</Muted>}
        {v.safety.items.map((i) => <div class="row" key={i.id}><span class={`tag ${i.kind}`}>{i.kind === 'line' ? t('line') : t('veil')}</span> {i.text}</div>)}
        <div class="row">
          <div class="seg small"><button class={kind === 'line' ? 'on' : ''} onClick={() => setKind('line')}>{t('line')}</button><button class={kind === 'veil' ? 'on' : ''} onClick={() => setKind('veil')}>{t('veil')}</button></div>
          <input class="input" value={text} maxLength={120} placeholder={t('addTopic')} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <Btn small full={false} onClick={() => { add(kind, text); setText(''); }}>+</Btn>
        </div>
      </Panel>
      <Panel><Label>{t('xCard')}</Label><p>{t('safetyX')}</p><Label>{t('openDoor')}</Label><p>{t('safetyDoor')}</p></Panel>
      <Btn disabled={me.consent} onClick={() => send({ type: 'consent' })}>{me.consent ? t('consentDone') : t('consentBtn')}</Btn>
      <Muted>{v.players.filter((p) => p.consent).length}/{v.players.length} {t('agreed')}</Muted>
      <HostNext v={v} blocked={!v.players.every((p) => p.consent)} />
    </div>
  );
}

// ---------- intro + poster ----------
export function Intro({ v }: { v: View }) {
  const intro = C().specialCards.intro;
  const physical = v.settings.sources.poster === 'physical';
  return (
    <div class="stack">
      <Panel>
        <Label>{tx(intro.title)} {showUnofficial() && <UnofficialTag />}</Label>
        {intro.body.map((b: any, i: number) => <p key={i}>{tx(b)}</p>)}
        <p class="amber-text"><b>{tx(intro.instruction)}</b></p>
      </Panel>
      <Panel>
        <Label>{t('missingPoster')}</Label>
        {v.posterIndex !== null && <Poster index={v.posterIndex} />}
        {physical && v.posterIndex === null && <Muted>{t('pickPosterHint')}</Muted>}
        {physical && (
          <div class="poster-grid">
            {Array.from({ length: rules.posterCount }, (_, i) => <Poster key={i} index={i} small onClick={() => send({ type: 'pickPoster', index: i })} />)}
          </div>
        )}
        <Muted>{t('dayBanner', { day: dayWord(v.settings.dayOfWeek) })}</Muted>
      </Panel>
      <HostNext v={v} blocked={v.posterIndex === null} />
    </div>
  );
}

// ---------- character card (private) ----------
export function CharacterCard({ id, showSecret = true }: { id: string; showSecret?: boolean }) {
  const c = character(id)!;
  return (
    <div class="card">
      <h3>{c.name}</h3>
      <div class="muted">{tx(c.title)}</div>
      <Label>{t('background')}</Label><p>{tx(c.background)}</p>
      {showSecret && <><Label>{t('secret')}</Label><p>{tx(c.secret)}</p><Label>{t('voicemailPrompt')}</Label><p>{tx(c.voicemailPrompt)}</p></>}
      {showUnofficial() && <UnofficialTag />}
    </div>
  );
}

export function Characters({ v }: { v: View }) {
  const me = v.players.find((p) => p.seat === v.me.seat)!;
  const taken = new Map(v.players.filter((p) => p.characterId).map((p) => [p.characterId!, p]));
  const showAll = v.settings.showSecretsWhileChoosing;
  return (
    <div class="stack">
      <Muted>{t('chooseCharacter')}</Muted>
      {rules.characters.map((ch) => {
        const owner = taken.get(ch.id);
        const mine = owner?.seat === me.seat;
        const open = showAll || mine;
        return (
          <div class={`card pick ${mine ? 'mine' : ''} ${owner && !mine ? 'taken' : ''}`} key={ch.id}>
            <h3>{character(ch.id)!.name}</h3>
            <div class="muted">{tx(character(ch.id)!.title)}</div>
            {open ? <CharacterCard id={ch.id} /> : <Muted>{t('secretHidden')}</Muted>}
            {owner ? <div class="tag">{mine ? t('you') : owner.name}</div> : ch.facilitator ? <div class="tag">{t('facilitator')}</div>
              : <Btn small disabled={!!me.characterId} onClick={() => send({ type: 'pickCharacter', id: ch.id })}>{t('pick')}</Btn>}
            {mine && !me.isHost && <Btn kind="ghost" small onClick={() => send({ type: 'unpickCharacter' })}>{t('change')}</Btn>}
          </div>
        );
      })}
      <HostNext v={v} blocked={!v.players.every((p) => p.characterId)} />
    </div>
  );
}

// ---------- drives ----------
export function DriveCard({ id }: { id: string }) {
  const d = drive(id)!;
  return (
    <div class="card">
      <Label>{t('motive')}</Label><p>{tx(d.motive)}</p>
      <Label>{t('relationships')}</Label>
      {d.relationships.map((r: any, i: number) => <p key={i} class="rel">“{tx(r)}”</p>)}
      {showUnofficial() && <UnofficialTag />}
    </div>
  );
}
export function Drives({ v }: { v: View }) {
  const physical = v.settings.sources.drives === 'physical';
  return (
    <div class="stack">
      {v.myDriveId ? <DriveCard id={v.myDriveId} /> : <Muted>{physical ? t('pickDriveHint') : t('dealing')}</Muted>}
      {physical && (
        <Panel>
          <Label>{t('whichDrive')}</Label>
          <div class="chips">
            {rules.drives.map((d, i) => <button class={`chip ${v.myDriveId === d.id ? 'on' : ''}`} key={d.id} onClick={() => send({ type: 'setDrive', id: d.id })}>#{i + 1} · {tx(drive(d.id)!.motive).slice(0, 38)}…</button>)}
          </div>
        </Panel>
      )}
      <Muted>{t('drivePrivate')}</Muted>
      <HostNext v={v} blocked={false} />
    </div>
  );
}

// ---------- introductions / hunches (turn based) ----------
export function Turns({ v, kind }: { v: View; kind: 'intros' | 'hunches' }) {
  const turn = v.turn;
  const me = v.me.seat!;
  const cur = turn ? turn.order[turn.idx] : null;
  const myChar = v.players.find((p) => p.seat === me)?.characterId;
  const doneOf = (p: View['players'][number]) => (kind === 'intros' ? p.introDone : p.hunchDone);
  const allDone = v.players.every(doneOf);
  return (
    <div class="stack">
      <Panel amber>
        <p>{kind === 'intros' ? t('introPrompt') : t('hunchPrompt')}</p>
        {kind === 'intros' && myChar && <><Label>{t('background')}</Label><p>{tx(character(myChar)!.background)}</p></>}
      </Panel>
      {kind === 'hunches' && (
        <div class="two-col">
          <div><Label>{t('suspects')}</Label>{C().suspects.map((s: any) => <div class="mini" key={s.id}><b>{s.name}</b><br /><span class="muted">{tx(s.role)}</span></div>)}</div>
          <div><Label>{t('locations')}</Label>{C().locations.map((l: any) => <div class="mini" key={l.id}>{tx(l.name)}</div>)}</div>
        </div>
      )}
      <Panel>
        {turn?.order.map((seat) => {
          const p = v.players.find((x) => x.seat === seat)!;
          return <div class={`row turn ${seat === cur && !allDone ? 'cur' : ''}`} key={seat}><Avatar seat={seat} /> <b>{seatName(v, seat)}</b>{doneOf(p) && <span>✓</span>}{seat === cur && !doneOf(p) && <span class="tag">{t('yourTurnTag')}</span>}</div>;
        })}
      </Panel>
      {(cur === me || v.me.isHost) && !allDone && (
        <Btn onClick={() => send({ type: kind === 'intros' ? 'introDone' : 'hunchDone' })}>{cur === me ? t('imDone') : t('skipTurn')}</Btn>
      )}
      <HostNext v={v} blocked={!allDone} />
    </div>
  );
}

// ---------- relations ----------
export function Relations({ v }: { v: View }) {
  const me = v.players.find((p) => p.seat === v.me.seat)!;
  const d = v.myDriveId ? drive(v.myDriveId) : null;
  const others = v.players.filter((p) => p.seat !== me.seat);
  return (
    <div class="stack">
      <Muted>{t('relationsHint')}</Muted>
      {d && ([0, 1] as const).map((l) => (
        <Panel key={l}>
          <p class="rel">“{tx(d.relationships[l])}”</p>
          <div class="chips">
            {others.map((o) => <button class={`chip ${me.relations[l] === o.seat ? 'on' : ''}`} key={o.seat} onClick={() => send({ type: 'assignRelation', line: l, target: o.seat })}>{seatName(v, o.seat)}</button>)}
          </div>
        </Panel>
      ))}
      {!d && <Muted>{t('pickDriveHint')}</Muted>}
      {v.relationsToMe.length > 0 && (
        <Panel>
          <Label>{t('relationsToYou')}</Label>
          {v.relationsToMe.map((r, i) => <p key={i}><b>{seatName(v, r.from)}</b>: <span class="rel">“{tx(drive(r.driveId)!.relationships[r.line])}”</span></p>)}
        </Panel>
      )}
      <Muted>{v.players.filter((p) => p.relations[0] !== null && p.relations[1] !== null).length}/{v.players.length} {t('done')}</Muted>
      <HostNext v={v} blocked={!v.players.every((p) => p.relations[0] !== null && p.relations[1] !== null)} />
    </div>
  );
}

// ---------- voicemail ----------
function blobToB64(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(b); });
}
export function Recorder({ onSent, sent }: { onSent?: () => void; sent: boolean }) {
  const [state, setState] = useState<'idle' | 'rec' | 'done' | 'err'>('idle');
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) ?? '';
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const b = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        setBlob(b); setUrl(URL.createObjectURL(b)); setState('done');
      };
      rec.current = r; r.start(); setSecs(0); setState('rec');
      timer.current = setInterval(() => setSecs((s) => { if (s >= 89) { stop(); return s; } return s + 1; }), 1000);
    } catch { setState('err'); }
  };
  const stop = () => { if (timer.current) clearInterval(timer.current); if (rec.current?.state === 'recording') rec.current.stop(); };
  const upload = async () => { if (!blob) return; send({ type: 'voicemail', mime: blob.type || 'audio/webm', b64: await blobToB64(blob) }); onSent?.(); };

  return (
    <Panel>
      {state === 'err' && <p class="warn">{t('micError')}</p>}
      {state !== 'rec' && <Btn onClick={start}>{state === 'done' ? t('reRecord') : t('record')}</Btn>}
      {state === 'rec' && <Btn kind="danger" onClick={stop}>■ {t('stop')} · {secs}s</Btn>}
      {url && state === 'done' && <audio controls src={url} />}
      {blob && state === 'done' && <Btn kind="amber" onClick={upload}>{sent ? t('sentAgain') : t('sendVoicemail')}</Btn>}
      {sent && <p class="ok">✓ {t('vmSaved')}</p>}
    </Panel>
  );
}
export function Voicemail({ v }: { v: View }) {
  const me = v.players.find((p) => p.seat === v.me.seat)!;
  const digital = v.settings.sources.voicemail === 'digital';
  const ch = me.characterId ? character(me.characterId) : null;
  return (
    <div class="stack">
      <Panel amber>
        <p>{t('voicemailIntro')}</p>
        {ch && <><Label>{t('voicemailPrompt')}</Label><p>{tx(ch.voicemailPrompt)}</p><Label>{t('secret')}</Label><p>{tx(ch.secret)}</p></>}
      </Panel>
      {digital ? <Recorder sent={me.vm} /> : <Muted>{t('vmPhysical')}</Muted>}
      <Muted>{v.players.filter((p) => p.vm).length}/{v.players.length} {t('done')} · {t('timerBreak')}</Muted>
      <HostNext v={v} blocked={digital && !v.players.every((p) => p.vm)} />
    </div>
  );
}

// ---------- deal ----------
export function Deal({ v }: { v: View }) {
  const mine = v.hands.map((h) => h.ts).sort((a, b) => b - a);
  const physical = v.settings.sources.clues === 'physical';
  return (
    <div class="stack">
      <Panel amber>
        <Label>{t('yourClues')}</Label>
        <div class="ts-row">{mine.map((ts) => <span class="ts" key={ts}>{ts}</span>)}</div>
        <Muted>{physical ? t('dealPhysicalHint') : t('dealDigitalHint')}</Muted>
      </Panel>
      {physical && v.plan && (
        <Panel>
          <Label>{t('dealPlan')}</Label>
          {v.players.map((p) => (
            <div class="row" key={p.seat}><Avatar seat={p.seat} /><b>{seatName(v, p.seat)}</b>
              <span class="ts-row">{v.plan!.filter((x) => x.seat === p.seat).map((x) => x.ts).sort((a, b) => b - a).map((ts) => <span class="ts small" key={ts}>{ts}</span>)}</span></div>
          ))}
          <p class="muted">{t('centreCard')}</p>
        </Panel>
      )}
      <HostNext v={v} />
    </div>
  );
}

// ---------- rules ----------
export function QuickGuide({ v }: { v: View }) {
  const g = C().quickGuide;
  const day = dayWord(v.settings.dayOfWeek);
  return (
    <Panel>
      <Label>{tx(g.title)} {showUnofficial() && <UnofficialTag />}</Label>
      <ul class="guide">{g.items.map((it: any, i: number) => <li key={i}>{tx(it).replaceAll('{day}', day)}</li>)}</ul>
    </Panel>
  );
}
export function Rules({ v }: { v: View }) {
  const me = v.players.find((p) => p.seat === v.me.seat)!;
  return (
    <div class="stack">
      <QuickGuide v={v} />
      <Btn kind={me.ready ? 'ghost' : 'primary'} onClick={() => send({ type: 'ready', value: !me.ready })}>{me.ready ? '✓ ' + t('ready') : t('imReady')}</Btn>
      <Muted>{v.players.filter((p) => p.ready).length}/{v.players.length} {t('ready')}</Muted>
      <HostNext v={v} blocked={!v.players.every((p) => p.ready)} />
    </div>
  );
}

// ---------- ready / start ----------
export function Ready({ v }: { v: View }) {
  const isSound = v.me.isSound;
  return (
    <div class="stack">
      <Panel amber>
        <h2>{t('startTitle')}</h2>
        <p>{t('startHint')}</p>
        <Muted>{v.settings.soundDevice === 'table' ? t('soundTableHint') : t('soundHostHint')}</Muted>
      </Panel>
      {isSound && <SoundPlayer big />}
      {isSound && <Btn kind="amber" onClick={() => startAudio(v.settings.videoOffsetSec)}>▶ {t('startGame')}</Btn>}
      {!isSound && v.settings.soundDevice === 'table' && <Muted>{v.tableConnected ? t('waitTableStart') : t('tableMissing')}</Muted>}
      {v.me.isHost && !isSound && <Btn kind="ghost" onClick={() => send({ type: 'startGame', source: 'manual' })}>{t('startManual')}</Btn>}
      {v.me.isHost && isSound && <Btn kind="ghost" small onClick={() => send({ type: 'startGame', source: 'manual' })}>{t('startManual')}</Btn>}
    </div>
  );
}
