import { signal } from '@preact/signals';

export interface AppConfig { transport: 'websocket' | 'firebase'; firebase?: { databaseURL: string; [k: string]: unknown } }
export const config = signal<AppConfig>({ transport: 'websocket' });

/** public/config.json decides how devices talk to each other. Absent => websocket (Cloudflare / local relay). */
export async function loadConfig(): Promise<void> {
  try {
    const r = await fetch(new URL('config.json', document.baseURI).toString(), { cache: 'no-cache' });
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.transport === 'firebase') config.value = j as AppConfig;
  } catch { /* keep default */ }
}
export const isFirebase = () => config.value.transport === 'firebase';
export const codeLength = () => (isFirebase() ? 6 : 4);
