import { signal } from '@preact/signals';
import { deriveKey, decryptBytes } from '../shared/packcrypto';

export type Tx = { it: string; en: string };
export interface Content {
  settings: any; characters: any[]; drives: any[]; locations: any[]; suspects: any[]; searchCards: any[];
  clueCards: any[]; specialCards: any; quickGuide: { title: Tx; items: Tx[] }; posters: any; characterRecord: any; meta: any;
}

export const content = signal<Content | null>(null);
export const lang = signal<'it' | 'en'>((localStorage.getItem('aim.lang') as 'it' | 'en') || (navigator.language?.startsWith('it') ? 'it' : 'en'));
export function setLang(l: 'it' | 'en') { lang.value = l; localStorage.setItem('aim.lang', l); }

/** Pick the current language from a {it,en} object (falls back to the other language). */
export const tx = (o: Tx | null | undefined): string => (o ? (o[lang.value] || o.it || o.en) : '');

let key: CryptoKey | null = null;
const posterCache = new Map<number, string>();

const base = () => new URL('pack/', document.baseURI).toString();

export async function unlock(passphrase: string): Promise<boolean> {
  const man = await (await fetch(base() + 'manifest.json', { cache: 'no-cache' })).json();
  const k = await deriveKey(passphrase, man.salt, man.iterations);
  const enc = new Uint8Array(await (await fetch(base() + 'content.enc')).arrayBuffer());
  try {
    const plain = await decryptBytes(k, enc);
    content.value = JSON.parse(new TextDecoder().decode(plain)) as Content;
    key = k;
    localStorage.setItem('aim.pass', passphrase);
    return true;
  } catch { return false; }
}

export async function tryStoredPass(): Promise<boolean> {
  const p = localStorage.getItem('aim.pass');
  if (!p) return false;
  try { return await unlock(p); } catch { return false; }
}

export const getPass = () => localStorage.getItem('aim.pass') ?? '';
export function forget() { localStorage.removeItem('aim.pass'); content.value = null; key = null; posterCache.clear(); }

export async function posterUrl(index: number): Promise<string | null> {
  if (!key) return null;
  if (posterCache.has(index)) return posterCache.get(index)!;
  const name = 'poster_' + String(index + 1).padStart(2, '0') + '.enc';
  const enc = new Uint8Array(await (await fetch(base() + name)).arrayBuffer());
  const plain = await decryptBytes(key, enc);
  const url = URL.createObjectURL(new Blob([plain as BlobPart], { type: 'image/jpeg' }));
  posterCache.set(index, url);
  return url;
}

// ---- accessors ----
export const C = () => content.value!;
export const character = (id: string | null) => (id ? C().characters.find((c) => c.id === id) : undefined);
export const drive = (id: string | null) => (id ? C().drives.find((d) => d.id === id) : undefined);
export const clueCard = (id: string | null) => (id ? C().clueCards.find((c) => c.id === id) : undefined);
export const clueVariants = (ts: number) => C().clueCards.filter((c) => c.timestamp === ts);
export function cardName(id: string): { name: string; sub: string } {
  const loc = C().locations.find((l) => l.id === id);
  if (loc) return { name: tx(loc.name), sub: '' };
  const s = C().suspects.find((x) => x.id === id);
  if (s) return { name: s.name, sub: tx(s.role) };
  return { name: id, sub: '' };
}
export function searchText(id: string): string { return tx(C().searchCards.find((c) => c.id === id)?.text); }
export const dayWord = (d: 'saturday' | 'sunday') => tx(C().settings.dayOfWeek.labels[d]);
export const charName = (id: string | null, fallback = '') => {
  if (id === 'alice') return 'Alice';
  const c = character(id);
  return c ? c.name : fallback;
};
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
