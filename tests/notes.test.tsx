// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { content, lang } from '../src/client/content';
import { NotesEditor } from '../src/client/ui/notes';
import { notes, lastNote, setNote, hasNotes, useNotesRoom } from '../src/client/notes';
import { view } from '../src/client/net';
import type { View } from '../src/shared/types';

const T = (s: string) => ({ it: s, en: s });
content.value = {
  settings: {}, clueCards: [], specialCards: {}, quickGuide: { title: T('g'), items: [] }, posters: {}, meta: {}, searchCards: [],
  characterRecord: { secretLabel: T('Segreto:') },
  characters: [{ id: 'charlie', name: 'Charlie Barnes' }, { id: 'julia', name: 'Julia North' }, { id: 'evan', name: 'Evan Holwell' }],
  drives: [{ id: 'd1', relationships: [T('Le devo un favore.'), T('Mi ignora.')] }, { id: 'd2', relationships: [T('Non mi fido di lei.'), T('Ci siamo lasciati.')] }],
  suspects: [{ id: 'sus_a', name: 'Bria Brown', role: T('x') }, { id: 'sus_b', name: 'Mr. Halvert', role: T('x') }],
  locations: [{ id: 'loc_a', name: T('The Old Barn') }, { id: 'loc_b', name: T('Kalisto Rivers State Park') }]
} as any;
lang.value = 'it';

const pl = (seat: number, characterId: string, relations: [number | null, number | null]) => ({ seat, name: 'P' + seat, isHost: seat === 0, connected: true, characterId, consent: true, introDone: true, hunchDone: true, ready: true, identity: 'self', locked: false, vm: true, relations });
const V = {
  code: 'NOTE1', me: { seat: 0, role: 'player', isHost: true, isSound: false },
  myDriveId: 'd1', players: [pl(0, 'charlie', [1, null]), pl(1, 'julia', [null, 0]), pl(2, 'evan', [null, null])],
  relationsToMe: [{ from: 1, line: 1, driveId: 'd2' }],
  decks: { suspect: { remaining: 4, revealed: [{ id: 'sus_b', copy: 1 }] }, location: { remaining: 4, revealed: [] }, searchRemaining: 0 }
} as unknown as View;

beforeEach(() => { cleanup(); localStorage.clear(); notes.value = {}; useNotesRoom('x'); useNotesRoom('NOTE1'); view.value = V; });

describe('notes on characters, suspects and locations', () => {
  it('shows the relationship phrases next to a character, and saves what you write', () => {
    lastNote.value = { group: 'c', sel: 'c_julia' };
    render(<NotesEditor v={V} />);
    expect(screen.getByText(/Le devo un favore/)).toBeTruthy();          // your line for her (you assigned line 0 to seat 1)
    expect(screen.getByText(/Ci siamo lasciati/)).toBeTruthy();          // her line for you (relationsToMe)
    expect(screen.queryByText(/Mi ignora/)).toBeNull();                  // your other line went to someone else
    fireEvent.input(screen.getByLabelText('Julia North'), { target: { value: 'era al lago' } });
    expect(notes.value.c_julia).toBe('era al lago');
    expect(JSON.parse(localStorage.getItem('aim.notes.NOTE1')!).c_julia).toBe('era al lago');
    expect(hasNotes()).toBe(true);
  });
  it('the chat panel (compact) edits the same notes and opens on the chosen entry', () => {
    setNote('c_evan', 'ha una macchina nuova');
    lastNote.value = { group: 'c', sel: 'c_evan' };
    render(<NotesEditor v={V} compact />);
    expect((screen.getByLabelText('Evan Holwell') as HTMLTextAreaElement).value).toBe('ha una macchina nuova');
    fireEvent.click(screen.getByText('Luoghi'));
    expect(lastNote.value.group).toBe('l');
    fireEvent.click(screen.getByText('Kalisto Rivers'));                 // short chip label drops the article and keeps two words
    fireEvent.input(screen.getByLabelText('Kalisto Rivers State Park'), { target: { value: 'sentiero chiuso' } });
    expect(notes.value.l_loc_b).toBe('sentiero chiuso');
  });
  it('marks suspects already revealed by the clue cards, and keeps old notes', () => {
    localStorage.setItem('aim.notes.NOTE2', JSON.stringify({ secret: 'vecchio segreto', s_sus_a: 'ok' }));
    useNotesRoom('NOTE2');
    lastNote.value = { group: 's', sel: 's_sus_a' };
    render(<NotesEditor v={{ ...V, code: 'NOTE2' } as View} />);
    expect(screen.getByText('scoperto')).toBeTruthy();                   // Mr. Halvert
    expect((screen.getByLabelText('Bria Brown') as HTMLTextAreaElement).value).toBe('ok');
    expect(notes.value.secret).toBe('vecchio segreto');
  });
});
