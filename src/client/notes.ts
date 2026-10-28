// Private notes: kept on this phone, per game. The Notes tab and the notes panel in the chat edit the same store.
import { signal } from '@preact/signals';

export const notes = signal<Record<string, string>>({});
let room = '';
const key = (code: string) => 'aim.notes.' + code;

/** Switch to a game's notes (idempotent; call on render). */
export function useNotesRoom(code: string) {
  if (room === code) return;
  room = code;
  try { const o = JSON.parse(localStorage.getItem(key(code)) ?? '{}'); notes.value = o && typeof o === 'object' ? o : {}; } catch { notes.value = {}; }
}
export function setNote(k: string, v: string) {
  notes.value = { ...notes.value, [k]: v };
  try { localStorage.setItem(key(room), JSON.stringify(notes.value)); } catch { /* ignore */ }
}
export const hasNotes = () => Object.values(notes.value).some((x) => x.trim());
export const noteOf = (k: string) => notes.value[k] ?? '';

/** Selection remembered between openings (so the panel comes back where you left it). */
export const lastNote = signal<{ group: 'c' | 's' | 'l'; sel: string }>({ group: 'c', sel: 'secret' });
