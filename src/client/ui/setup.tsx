import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import qrcode from 'qrcode-generator';
import { Share2, KeyRound, SlidersHorizontal, ChevronRight, Pencil, Check, Tablet, Plus, Mic, Square, Play, ShieldAlert, DoorOpen, RotateCcw } from 'lucide-preact';
import { send } from '../net';
import { C, tx, character, drive, posterUrl, dayWord, inviteUrl } from '../content';
import { t, Btn, Panel, Label, Muted, Avatar, seatName, UnofficialTag, showUnofficial, ActionBar, Waiting, TextLink, Section, ListRow, Modal, Switch } from './common';
import { startAudio } from './sound';
import { rules } from '../../shared/rules';
import type { Sources, View } from '../../shared/types';

// ---------- helpers ----------
export function Qr({ text, small }: { text: string; small?: boolean }) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return <div class={`qr ${small ? 'sm' : ''}`} role="img" aria-label="QR" dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) }} />;
}
export function usePoster(index: number | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; setUrl(null); if (index !== null) posterUrl(index).then((u) => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [index]);
  return url;
}
export function Poster({ index }: { index: number }) {
  const url = usePoster(index);
  return url ? <img class="poster" src={url} alt={`Poster ${index + 1}`} /> : <div class="poster ph">…</div>;
}

const me = (v: View) => v.players.find((p) => p.seat === v.me.seat)!;
const count = (v: View, f: (p: View['players'][number]) => boolean) => `${v.players.filter(f).length}/${v.players.length}`;

/**
 * The bottom bar of every setup screen. `personal` is this player's own pending action (it wins over everything);
 * otherwise the host gets "Next" (+ a quiet override when blocked) and everyone else waits.
 */
function PhaseBar({ v, blocked, label, force, status, personal }: { v: View; blocked?: boolean; label?: string; force?: boolean; status?: ComponentChildren; personal?: ComponentChildren }) {
  const host = v.me.isHost;
  return (
    <ActionBar status={status}>
      {personal ?? (host
        ? <>
            <Btn disabled={blocked} onClick={() => send({ type: 'next' })}>{label ?? t('next')}</Btn>
            {blocked && force !== false && <TextLink onClick={() => send({ type: 'next', force: true })}>{t('forceNext')}</TextLink>}
          </>
        : <Waiting>{t('waitHost')}</Waiting>)}
    </ActionBar>
  );
}

// ---------- lobby ----------
const SRC_KEYS: (keyof Sources)[] = ['characters', 'drives', 'poster', 'clues', 'suspects', 'locations', 'search', 'voicemail'];

async function shareInvite(url: string): Promise<'shared' | 'copied' | 'failed'> {
  try { if (navigator.share) { await navigator.share({ title: 'Silent Chat', url }); return 'shared'; } } catch (e) { if ((e as Error)?.name === 'AbortError') return 'failed'; }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}

function Settings({ v }: { v: View }) {
  const [adv, setAdv] = useState(false);
  const st = v.settings;
  const host = v.me.isHost;
  const set = (o: Record<string, unknown>) => send({ type: 'setSettings', ...o });
  return (
    <>
      {!host && <Muted small>{t('settingsReadOnly')}</Muted>}
      <Section title={t('mode')}>
        <div class="seg">
          <button class={st.mode === 'digital' ? 'on' : ''} disabled={!host} onClick={() => set({ mode: 'digital' })}>{t('modeDigital')}</button>
          <button class={st.mode === 'aids' ? 'on' : ''} disabled={!host} onClick={() => set({ mode: 'aids' })}>{t('modeAids')}</button>
        </div>
        <Muted small>{st.mode === 'aids' ? t('modeAidsHint') : st.mode === 'digital' ? t('modeDigitalHint') : t('modeCustomHint')}</Muted>
        <TextLink onClick={() => setAdv(!adv)}>{adv ? t('hideAdvanced') : t('showAdvanced')}</TextLink>
        {adv && (
          <div class="stack tight">
            {SRC_KEYS.map((k) => (
              <div class="row between nowrap" key={k}>
                <span class="small">{t(('src_' + k) as any)}</span>
                <div class="seg small">
                  <button class={st.sources[k] === 'digital' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { [k]: 'digital' } })}>{t('digital')}</button>
                  <button class={st.sources[k] === 'physical' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { [k]: 'physical' } })}>{t('physical')}</button>
                </div>
              </div>
            ))}
            <div class="row between nowrap">
              <span class="small">{t('src_chat')}</span>
              <div class="seg small">
                <button class={st.sources.chat === 'app' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { chat: 'app' } })}>{t('chatApp')}</button>
                <button class={st.sources.chat === 'external' ? 'on' : ''} disabled={!host} onClick={() => set({ sources: { chat: 'external' } })}>{t('chatExternal')}</button>
              </div>
            </div>
          </div>
        )}
      </Section>
      <Section title={t('soundDevice')}>
        <div class="seg">
          <button class={st.soundDevice === 'host' ? 'on' : ''} disabled={!host} onClick={() => set({ soundDevice: 'host' })}>{t('soundHost')}</button>
          <button class={st.soundDevice === 'table' ? 'on' : ''} disabled={!host} onClick={() => set({ soundDevice: 'table' })}>{t('soundTable')}</button>
        </div>
        <Muted small>{st.soundDevice === 'table' ? t('soundTableHint') : t('soundHostHint')}</Muted>
      </Section>
      <Section title={t('dayOfWeek')}>
        <div class="seg">
          <button class={st.dayOfWeek === 'saturday' ? 'on' : ''} disabled={!host} onClick={() => set({ dayOfWeek: 'saturday' })}>{dayWord('saturday')}</button>
          <button class={st.dayOfWeek === 'sunday' ? 'on' : ''} disabled={!host} onClick={() => set({ dayOfWeek: 'sunday' })}>{dayWord('sunday')}</button>
        </div>
      </Section>
      <div class="stack tight">
        <Switch checked={st.includeBodyEnding} disabled={!host} onChange={(x) => set({ includeBodyEnding: x })}>{t('includeBody')}</Switch>
        <Switch checked={st.showSecretsWhileChoosing} disabled={!host} onChange={(x) => set({ showSecretsWhileChoosing: x })}>{t('showSecrets')}</Switch>
        <div class="switch-row"><span>{t('videoOffset')}</span>
          <input class="input narrow num" type="number" inputMode="numeric" min={0} max={600} value={st.videoOffsetSec} disabled={!host} onChange={(e) => set({ videoOffsetSec: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <Muted small>{t('videoOffsetHint')}</Muted>
      </div>
    </>
  );
}

export function Lobby({ v }: { v: View }) {
  const self = me(v);
  const [name, setName] = useState(self?.name ?? '');
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [tableQr, setTableQr] = useState(false);
  const [shared, setShared] = useState<null | 'copied'>(null);
  const st = v.settings;
  const enough = v.players.length >= 3;
  const summary = [st.mode === 'aids' ? t('modeAids') : t('modeDigital'), st.soundDevice === 'table' ? t('soundTable') : t('soundHost'), dayWord(st.dayOfWeek)].join(' · ');
  const share = async () => { if ((await shareInvite(inviteUrl(v.code, 'r'))) === 'copied') { setShared('copied'); setTimeout(() => setShared(null), 2200); } };
  const saveName = () => { if (name.trim()) send({ type: 'setName', name: name.trim() }); setEditing(false); };
  return (
    <>
      <section class="section">
        <div class="stack tight center-text">
          <h2>{t('inviteFriends')}</h2>
          <Muted small>{t('inviteHow')}</Muted>
        </div>
        <Qr text={inviteUrl(v.code, 'r')} />
        <div class="code" aria-label={`${t('roomCode')} ${v.code.split('').join(' ')}`}>{v.code}</div>
        <Btn kind="ghost" icon={shared ? <Check size={18} /> : <Share2 size={18} />} onClick={share}>{shared ? t('copied') : t('share')}</Btn>
        <TextLink onClick={() => setTableQr(!tableQr)}><Tablet size={16} />{t('showTableQr')}</TextLink>
        {tableQr && <Qr small text={inviteUrl(v.code, 't')} />}
        <p class="faint small center-text"><KeyRound size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />{t('inviteSecretNote')}</p>
      </section>

      <Section title={`${t('players')} · ${v.players.length}/5`}>
        <div class="list">
          {v.players.map((p) => p.seat === self.seat && editing ? (
            <div class="list-row" key={p.seat}>
              <input class="input" autoFocus value={name} maxLength={20} onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
              <button class="icon-btn" aria-label={t('save')} onClick={saveName}><Check size={20} /></button>
            </div>
          ) : (
            <ListRow key={p.seat} icon={<Avatar seat={p.seat} byName />}
              sub={p.seat === self.seat ? t('you') : undefined}
              end={<span class="row nowrap" style={{ gap: '8px' }}>
                {p.isHost && <span class="tag">{t('host')}</span>}
                <span class={`dot ${p.connected ? 'on' : ''}`} role="img" aria-label={p.connected ? t('online') : t('offline')} />
                {p.seat === self.seat && <button class="icon-btn" aria-label={t('edit')} onClick={() => { setName(self.name); setEditing(true); }}><Pencil size={17} /></button>}
              </span>}>
              <b>{p.name}</b>
            </ListRow>
          ))}
          <ListRow icon={<span class="avatar" style={{ width: '36px', height: '36px', background: 'var(--ink-2)', color: 'var(--fg-3)' }}><Tablet size={18} /></span>}
            end={<span class={`dot ${v.tableConnected ? 'on' : ''}`} />}>
            <span class="muted">{t('tableDevice')}</span><small>{v.tableConnected ? t('connected') : t('notConnected')}</small>
          </ListRow>
        </div>
      </Section>

      <div class="list">
        <ListRow icon={<SlidersHorizontal size={20} />} sub={summary} onClick={() => setSettings(true)} end={<ChevronRight size={20} class="chev" />}>{t('gameSettings')}</ListRow>
      </div>
      {settings && <Modal title={t('gameSettings')} onClose={() => setSettings(false)}><Settings v={v} /></Modal>}

      <PhaseBar v={v} blocked={!enough} label={t('startSetup')} force={false} status={enough ? undefined : t('needThree')} />
    </>
  );
}

// ---------- safety ----------
export function Safety({ v }: { v: View }) {
  const [kind, setKind] = useState<'line' | 'veil'>('line');
  const [text, setText] = useState('');
  const self = me(v);
  const add = (k: 'line' | 'veil', tt: string) => { if (tt.trim()) send({ type: 'addSafety', kind: k, text: tt }); };
  const all = v.players.every((p) => p.consent);
  return (
    <>
      <Panel amber><Label>{t('contentWarning')}</Label><p>{t('safetyWarning')}</p></Panel>
      <Section title={t('linesAndVeils')}>
        <Muted small>{t('linesVeilsHint')}</Muted>
        {v.safety.items.length > 0 && (
          <div class="list">{v.safety.items.map((i) => <ListRow key={i.id} icon={<span class={`tag ${i.kind}`}>{i.kind === 'line' ? t('line') : t('veil')}</span>}>{i.text}</ListRow>)}</div>
        )}
        <div class="chips">
          {(['sugGore', 'sugConsent', 'sugBlame'] as const).filter((k) => !v.safety.items.some((i) => i.text === t(k))).map((k) => (
            <button class="chip dashed" key={k} onClick={() => add('veil', t(k))}><Plus size={15} />{t('veil')}: {t(k)}</button>
          ))}
        </div>
        <div class="seg small" style={{ alignSelf: 'flex-start' }}>
          <button class={kind === 'line' ? 'on' : ''} onClick={() => setKind('line')}>{t('line')}</button>
          <button class={kind === 'veil' ? 'on' : ''} onClick={() => setKind('veil')}>{t('veil')}</button>
        </div>
        <div class="row nowrap">
          <input class="input" value={text} maxLength={120} placeholder={t('addTopic')} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { add(kind, text); setText(''); } }} />
          <Btn small full={false} kind="ghost" label={t('add')} disabled={!text.trim()} onClick={() => { add(kind, text); setText(''); }}><Plus size={20} /></Btn>
        </div>
      </Section>
      <Section title={t('xCard')}>
        <div class="row nowrap" style={{ alignItems: 'flex-start' }}><ShieldAlert size={20} class="warn" /><p class="muted">{t('safetyX')}</p></div>
      </Section>
      <Section title={t('openDoor')}>
        <div class="row nowrap" style={{ alignItems: 'flex-start' }}><DoorOpen size={20} class="faint" /><p class="muted">{t('safetyDoor')}</p></div>
      </Section>
      <PhaseBar v={v} blocked={!all} status={`${count(v, (p) => p.consent)} ${t('agreed')}`}
        personal={!self.consent ? <Btn onClick={() => send({ type: 'consent' })}>{t('consentBtn')}</Btn> : undefined} />
    </>
  );
}

// ---------- intro + poster ----------
export function Intro({ v }: { v: View }) {
  const intro = C().specialCards.intro;
  const physical = v.settings.sources.poster === 'physical';
  return (
    <>
      <article class="gcard">
        <div class="row between"><Label>{tx(intro.title)}</Label>{showUnofficial() && <UnofficialTag />}</div>
        <div class="prose">{intro.body.map((b: any, i: number) => <p key={i}>{tx(b)}</p>)}</div>
        <p class="accent"><b>{tx(intro.instruction)}</b></p>
      </article>
      <Section title={t('missingPoster')}>
        {v.posterIndex !== null && <div style={{ maxWidth: '300px', width: '100%', margin: '0 auto' }}><Poster index={v.posterIndex} /></div>}
        {physical && v.posterIndex === null && <Muted small>{t('pickPosterHint')}</Muted>}
        {physical && (
          <div class="poster-grid">
            {Array.from({ length: rules.posterCount }, (_, i) => (
              <button key={i} class={v.posterIndex === i ? 'on' : ''} aria-label={`Poster ${i + 1}`} onClick={() => send({ type: 'pickPoster', index: i })}><Poster index={i} /></button>
            ))}
          </div>
        )}
        <Muted small>{t('dayBanner', { day: dayWord(v.settings.dayOfWeek) })}</Muted>
      </Section>
      <PhaseBar v={v} blocked={v.posterIndex === null} />
    </>
  );
}

// ---------- character card (private) ----------
function CharacterBody({ id, showSecret = true }: { id: string; showSecret?: boolean }) {
  const c = character(id)!;
  return (
    <>
      <Label>{t('background')}</Label><p>{tx(c.background)}</p>
      {showSecret && <><Label>{t('secret')}</Label><p>{tx(c.secret)}</p><Label>{t('voicemailPrompt')}</Label><p>{tx(c.voicemailPrompt)}</p></>}
    </>
  );
}
export function CharacterCard({ id, showSecret = true }: { id: string; showSecret?: boolean }) {
  const c = character(id)!;
  return (
    <article class="gcard">
      <h2>{c.name}</h2>
      <p class="muted">{tx(c.title)}</p>
      <CharacterBody id={id} showSecret={showSecret} />
      {showUnofficial() && <UnofficialTag />}
    </article>
  );
}

export function Characters({ v }: { v: View }) {
  const self = me(v);
  const taken = new Map(v.players.filter((p) => p.characterId).map((p) => [p.characterId!, p]));
  const showAll = v.settings.showSecretsWhileChoosing;
  return (
    <>
      <Muted>{t('chooseCharacter')}</Muted>
      {rules.characters.map((ch) => {
        const owner = taken.get(ch.id);
        const mine = owner?.seat === self.seat;
        const c = character(ch.id)!;
        return (
          <article class={`gcard pick ${mine ? 'mine' : ''} ${owner && !mine ? 'taken' : ''}`} key={ch.id}>
            <div class="row between nowrap" style={{ alignItems: 'flex-start' }}>
              <div class="grow"><h2>{c.name}</h2><p class="muted">{tx(c.title)}</p></div>
              {owner ? <span class="tag accent">{mine ? t('you') : owner.name}</span> : ch.facilitator ? <span class="tag">{t('facilitator')}</span> : null}
            </div>
            {showAll || mine ? <CharacterBody id={ch.id} /> : <p class="faint small">{t('secretHidden')}</p>}
            {mine && showUnofficial() && <UnofficialTag />}
            {!owner && !ch.facilitator && !self.characterId && <Btn kind="ghost" onClick={() => send({ type: 'pickCharacter', id: ch.id })}>{t('pick')}</Btn>}
            {mine && !self.isHost && <TextLink onClick={() => send({ type: 'unpickCharacter' })}>{t('change')}</TextLink>}
          </article>
        );
      })}
      <PhaseBar v={v} blocked={!v.players.every((p) => p.characterId)} status={`${count(v, (p) => !!p.characterId)} ${t('done')}`} />
    </>
  );
}

// ---------- drives ----------
export function DriveCard({ id }: { id: string }) {
  const d = drive(id)!;
  return (
    <article class="gcard">
      <Label>{t('motive')}</Label><p>{tx(d.motive)}</p>
      <Label>{t('relationships')}</Label>
      {d.relationships.map((r: any, i: number) => <p key={i} class="rel">“{tx(r)}”</p>)}
      {showUnofficial() && <UnofficialTag />}
    </article>
  );
}
export function Drives({ v }: { v: View }) {
  const physical = v.settings.sources.drives === 'physical';
  return (
    <>
      {v.myDriveId ? <DriveCard id={v.myDriveId} /> : <Muted>{physical ? t('pickDriveHint') : t('dealing')}</Muted>}
      {physical && (
        <Section title={t('whichDrive')}>
          <div class="list">
            {rules.drives.map((d, i) => (
              <ListRow key={d.id} onClick={() => send({ type: 'setDrive', id: d.id })} end={v.myDriveId === d.id ? <Check size={20} class="accent" /> : undefined}>
                <span class="small">#{i + 1} · {tx(drive(d.id)!.motive).slice(0, 60)}…</span>
              </ListRow>
            ))}
          </div>
        </Section>
      )}
      <Muted small>{t('drivePrivate')}</Muted>
      <PhaseBar v={v} />
    </>
  );
}

// ---------- introductions / hunches (turn based) ----------
export function Turns({ v, kind }: { v: View; kind: 'intros' | 'hunches' }) {
  const turn = v.turn;
  const seat = v.me.seat!;
  const cur = turn ? turn.order[turn.idx] : null;
  const myChar = v.players.find((p) => p.seat === seat)?.characterId;
  const doneOf = (p: View['players'][number]) => (kind === 'intros' ? p.introDone : p.hunchDone);
  const allDone = v.players.every(doneOf);
  const doneType = kind === 'intros' ? 'introDone' : 'hunchDone';
  const myTurn = cur === seat && !allDone;
  return (
    <>
      <Panel amber>
        <p>{kind === 'intros' ? t('introPrompt') : t('hunchPrompt')}</p>
        {kind === 'intros' && myChar && <><Label>{t('background')}</Label><p>{tx(character(myChar)!.background)}</p></>}
      </Panel>
      {kind === 'hunches' && (
        <div class="two-col">
          <Section title={t('suspects')}>{C().suspects.map((s: any) => <div class="mini" key={s.id}><b>{s.name}</b><br /><span class="faint small">{tx(s.role)}</span></div>)}</Section>
          <Section title={t('locations')}>{C().locations.map((l: any) => <div class="mini" key={l.id}>{tx(l.name)}</div>)}</Section>
        </div>
      )}
      <div class="list">
        {turn?.order.map((s) => {
          const p = v.players.find((x) => x.seat === s)!;
          const isCur = s === cur && !allDone;
          return (
            <ListRow key={s} icon={<Avatar seat={s} />} end={doneOf(p) ? <Check size={20} class="ok" /> : isCur ? <span class="tag accent">{t('yourTurnTag')}</span> : undefined}>
              <span class={isCur ? 'accent' : ''}><b>{seatName(v, s)}</b></span>
            </ListRow>
          );
        })}
      </div>
      <PhaseBar v={v} blocked={!allDone} status={`${count(v, doneOf)} ${t('done')}`}
        personal={myTurn ? <Btn onClick={() => send({ type: doneType })}>{t('imDone')}</Btn> : undefined} />
      {v.me.isHost && !allDone && !myTurn && cur !== null && (
        <div class="center-text"><TextLink onClick={() => send({ type: doneType })}>{t('skipTurn')}</TextLink></div>
      )}
    </>
  );
}

// ---------- relations ----------
export function Relations({ v }: { v: View }) {
  const self = me(v);
  const d = v.myDriveId ? drive(v.myDriveId) : null;
  const others = v.players.filter((p) => p.seat !== self.seat);
  const done = (p: View['players'][number]) => p.relations[0] !== null && p.relations[1] !== null;
  return (
    <>
      <Muted>{t('relationsHint')}</Muted>
      {d && ([0, 1] as const).map((l) => (
        <article class="gcard" key={l}>
          <p class="rel">“{tx(d.relationships[l])}”</p>
          <div class="chips">
            {others.map((o) => <button class={`chip ${self.relations[l] === o.seat ? 'on' : ''}`} key={o.seat} onClick={() => send({ type: 'assignRelation', line: l, target: o.seat })}>{seatName(v, o.seat)}</button>)}
          </div>
        </article>
      ))}
      {!d && <Muted>{t('pickDriveHint')}</Muted>}
      {v.relationsToMe.length > 0 && (
        <Section title={t('relationsToYou')}>
          {v.relationsToMe.map((r, i) => <p key={i}><b>{seatName(v, r.from)}</b> <span class="rel">“{tx(drive(r.driveId)!.relationships[r.line])}”</span></p>)}
        </Section>
      )}
      <PhaseBar v={v} blocked={!v.players.every(done)} status={`${count(v, done)} ${t('done')}`} />
    </>
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
    <div class="stack">
      {state === 'err' && <p class="warn small">{t('micError')}</p>}
      {(state === 'idle' || state === 'err') && <Btn kind="ghost" icon={<Mic size={20} />} onClick={start}>{t('record')}</Btn>}
      {state === 'rec' && <Btn kind="danger" icon={<Square size={18} />} onClick={stop}>{t('stop')} · <span class="num">{secs}s</span></Btn>}
      {url && state === 'done' && <audio controls src={url} />}
      {blob && state === 'done' && (
        <div class="row nowrap">
          <Btn kind="ghost" icon={<RotateCcw size={18} />} onClick={start}>{t('reRecord')}</Btn>
          <Btn onClick={upload}>{sent ? t('sentAgain') : t('sendVoicemail')}</Btn>
        </div>
      )}
      {sent && <p class="ok small"><Check size={15} style={{ verticalAlign: '-2px' }} /> {t('vmSaved')}</p>}
    </div>
  );
}
export function Voicemail({ v }: { v: View }) {
  const self = me(v);
  const digital = v.settings.sources.voicemail === 'digital';
  const ch = self.characterId ? character(self.characterId) : null;
  return (
    <>
      <Panel amber>
        <p>{t('voicemailIntro')}</p>
        {ch && <><Label>{t('voicemailPrompt')}</Label><p>{tx(ch.voicemailPrompt)}</p><Label>{t('secret')}</Label><p>{tx(ch.secret)}</p></>}
      </Panel>
      {digital ? <Recorder sent={self.vm} /> : <Muted>{t('vmPhysical')}</Muted>}
      <Muted small>{t('timerBreak')}</Muted>
      <PhaseBar v={v} blocked={digital && !v.players.every((p) => p.vm)} status={`${count(v, (p) => p.vm)} ${t('done')}`} />
    </>
  );
}

// ---------- deal ----------
export function DealPlan({ v }: { v: View }) {
  return (
    <Section title={t('dealPlan')}>
      <div class="list">
        {v.players.map((p) => (
          <ListRow key={p.seat} icon={<Avatar seat={p.seat} size={32} />}
            end={<span class="ts-row">{v.plan!.filter((x) => x.seat === p.seat).map((x) => x.ts).sort((a, b) => b - a).map((ts) => <span class="ts small" key={ts}>{ts}</span>)}</span>}>
            <b>{seatName(v, p.seat)}</b>
          </ListRow>
        ))}
      </div>
      <Muted small>{t('centreCard')}</Muted>
    </Section>
  );
}
export function Deal({ v }: { v: View }) {
  const mine = v.hands.map((h) => h.ts).sort((a, b) => b - a);
  const physical = v.settings.sources.clues === 'physical';
  return (
    <>
      <Section title={t('yourClues')}>
        <div class="ts-row">{mine.map((ts) => <span class="ts" key={ts}>{ts}</span>)}</div>
        <Muted small>{physical ? t('dealPhysicalHint') : t('dealDigitalHint')}</Muted>
      </Section>
      {physical && v.plan && <DealPlan v={v} />}
      <PhaseBar v={v} />
    </>
  );
}

// ---------- rules ----------
export function QuickGuide({ v }: { v: View }) {
  const g = C().quickGuide;
  const day = dayWord(v.settings.dayOfWeek);
  return (
    <section class="section">
      <div class="row between"><Label>{tx(g.title)}</Label>{showUnofficial() && <UnofficialTag />}</div>
      <ol class="guide">{g.items.map((it: any, i: number) => <li key={i}>{tx(it).replaceAll('{day}', day)}</li>)}</ol>
    </section>
  );
}
export function Rules({ v }: { v: View }) {
  const self = me(v);
  return (
    <>
      <QuickGuide v={v} />
      <PhaseBar v={v} blocked={!v.players.every((p) => p.ready)} status={`${count(v, (p) => p.ready)} ${t('ready')}`}
        personal={!self.ready ? <Btn onClick={() => send({ type: 'ready', value: true })}>{t('imReady')}</Btn>
          : !v.me.isHost ? <><Waiting>{t('waitHost')}</Waiting><TextLink onClick={() => send({ type: 'ready', value: false })}>{t('change')}</TextLink></> : undefined} />
    </>
  );
}

// ---------- ready / start ----------
export function Ready({ v }: { v: View }) {
  const isSound = v.me.isSound;
  const host = v.me.isHost;
  return (
    <>
      <Panel amber>
        <h2>{t('startTitle')}</h2>
        <p>{t('startHint')}</p>
        <Muted small>{v.settings.soundDevice === 'table' ? t('soundTableHint') : t('soundHostHint')}</Muted>
      </Panel>
      <ActionBar>
        {isSound && <Btn icon={<Play size={20} />} onClick={() => startAudio(v.settings.videoOffsetSec)}>{t('startGame')}</Btn>}
        {host && isSound && <TextLink onClick={() => send({ type: 'startGame', source: 'manual' })}>{t('startManual')}</TextLink>}
        {host && !isSound && <Btn kind="ghost" onClick={() => send({ type: 'startGame', source: 'manual' })}>{t('startManual')}</Btn>}
        {!host && !isSound && <Waiting>{v.settings.soundDevice === 'table' ? (v.tableConnected ? t('waitTableStart') : t('tableMissing')) : t('waitHost')}</Waiting>}
      </ActionBar>
    </>
  );
}
