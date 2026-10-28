import { useState } from 'preact/hooks';
import { C, tx, drive, charName } from '../content';
import { notes, setNote, noteOf, useNotesRoom, lastNote } from '../notes';
import { t, Modal, Avatar } from './common';
import type { View } from '../../shared/types';

type Group = 'c' | 's' | 'l';
interface Entry { key: string; label: string; short: string; seat?: number; found?: boolean }

const shortName = (n: string) => n.replace(/^(the|il|lo|la|l'|i|gli|le)\s+/i, '').split(/\s+/).slice(0, 2).join(' ');

function entries(v: View, group: Group): Entry[] {
  if (group === 'c') {
    const secret = tx(C().characterRecord.secretLabel).replace(':', '');
    return [
      { key: 'secret', label: secret, short: secret },
      ...C().characters.map((c: any) => ({ key: 'c_' + c.id, label: c.name as string, short: String(c.name).split(' ')[0], seat: v.players.find((p) => p.characterId === c.id)?.seat }))
    ];
  }
  const rev = (d: 'suspect' | 'location') => new Set(v.decks[d].revealed.map((r) => r.id));
  if (group === 's') { const r = rev('suspect'); return C().suspects.map((x: any) => { const n = String(x.name ?? x.id); return { key: 's_' + x.id, label: n, short: shortName(n), found: r.has(x.id) }; }); }
  const r = rev('location');
  return C().locations.map((l: any) => { const n = tx(l.name) || String(l.id); return { key: 'l_' + l.id, label: n, short: shortName(n), found: r.has(l.id) }; });
}

/** The two relationship phrases between you and a character, as written on the drive cards. */
function Relations({ v, seat, name }: { v: View; seat: number; name: string }) {
  const me = v.me.seat; if (me === null || seat === me) return null;
  const self = v.players.find((p) => p.seat === me);
  const mine = v.myDriveId && self ? ([0, 1] as const).filter((l) => self.relations[l] === seat).map((l) => tx(drive(v.myDriveId)!.relationships[l])) : [];
  const theirs = v.relationsToMe.filter((r) => r.from === seat).map((r) => tx(drive(r.driveId)!.relationships[r.line]));
  if (!mine.length && !theirs.length) return null;
  return (
    <div class="rels">
      {mine.map((x, i) => <div key={'m' + i}><div class="relh">{t('relYours', { name })}</div><div class="rel">“{x}”</div></div>)}
      {theirs.map((x, i) => <div key={'t' + i}><div class="relh">{t('relTheirs', { name })}</div><div class="rel">“{x}”</div></div>)}
    </div>
  );
}

const first = (s: string) => s.split(/\n/)[0];

/**
 * Notes on characters (next to the relationship phrases), suspects and locations.
 * Full: a list with one open entry. Compact (the chat panel): chips for the entries and one editor.
 */
export function NotesEditor({ v, compact, onPick }: { v: View; compact?: boolean; onPick?: () => void }) {
  useNotesRoom(v.code);
  const [editing, setEditing] = useState(false);
  const { group, sel } = lastNote.value;
  const list = entries(v, group);
  const cur = list.find((e) => e.key === sel) ?? list[0];
  const pickGroup = (g: Group) => { lastNote.value = { group: g, sel: entries(v, g)[0].key }; };
  const pick = (k: string) => { lastNote.value = { group, sel: k }; onPick?.(); };
  const seatName_ = (e: Entry) => (e.seat !== undefined ? charName(v.players.find((p) => p.seat === e.seat)?.characterId ?? null, e.label) : e.label);
  const area = (e: Entry) => (
    <div class="stk" style={{ gap: '8px' }}>
      {e.seat !== undefined && <Relations v={v} seat={e.seat} name={e.short} />}
      <textarea class="note-area" rows={compact ? 3 : 4} value={noteOf(e.key)} placeholder={t('notePlaceholder')} aria-label={e.label}
        onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onInput={(ev) => setNote(e.key, (ev.target as HTMLTextAreaElement).value)} />
    </div>
  );
  return (
    <div class={`notes-ed ${editing ? 'is-editing' : ''}`}>
      <div class="seg small" role="tablist">
        {([['c', t('characters')], ['s', t('suspects')], ['l', t('locations')]] as [Group, string][]).map(([g, label]) => (
          <button key={g} role="tab" aria-selected={group === g} class={group === g ? 'on' : ''} onClick={() => pickGroup(g)}>{label}</button>
        ))}
      </div>
      {compact ? (
        <>
          <div class="note-chips">
            {list.map((e) => <button key={e.key} class={`chip ${cur.key === e.key ? 'on' : ''}`} onClick={() => pick(e.key)}>{e.short}{noteOf(e.key).trim() && <span class="note-dot" aria-label={t('hasNote')} />}</button>)}
          </div>
          {area(cur)}
        </>
      ) : (
        <div class="stack tight">
          {list.map((e) => e.key === cur.key
            ? <div class="note-row open" key={e.key}><div class="note-hd">{e.seat !== undefined && <Avatar seat={e.seat} size={32} />}<b>{seatName_(e)}</b>{e.found && <span class="tag">{t('noteFound')}</span>}</div>{area(e)}</div>
            : <button class="note-row" key={e.key} onClick={() => pick(e.key)}>
                <span class="note-hd">{e.seat !== undefined && <Avatar seat={e.seat} size={32} />}<b>{seatName_(e)}</b>{e.found && <span class="tag">{t('noteFound')}</span>}</span>
                <span class="note-pv">{first(noteOf(e.key)) || '—'}</span>
              </button>)}
        </div>
      )}
    </div>
  );
}

/** The notes panel opened from the chat. */
export function NotesSheet({ v, onClose }: { v: View; onClose: () => void }) {
  return <Modal title={t('tabNotes')} onClose={onClose}><NotesEditor v={v} compact /></Modal>;
}
export { notes };
