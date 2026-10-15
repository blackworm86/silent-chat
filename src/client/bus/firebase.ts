// Real Bus on Firebase Realtime Database (free "Spark" plan, no credit card).
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, push, set, update, remove, get, onValue, onChildAdded } from 'firebase/database';
import type { Bus, Meta } from './types';

export interface FirebaseConfig { databaseURL: string; apiKey?: string; authDomain?: string; projectId?: string; appId?: string; [k: string]: unknown }

export function createFirebaseBus(cfg: FirebaseConfig): Bus {
  const app = getApps()[0] ?? initializeApp(cfg as any);
  const db = getDatabase(app);
  const R = (p: string) => ref(db, 'rooms/' + p);
  return {
    async getMeta(code) { const s = await get(R(`${code}/meta`)); return s.exists() ? (s.val() as Meta) : null; },
    setMeta: (code, meta) => set(R(`${code}/meta`), meta),
    beat: (code, hb) => update(R(`${code}/meta`), { hb }),
    onMeta: (code, cb) => onValue(R(`${code}/meta`), (s) => cb(s.exists() ? (s.val() as Meta) : null)),

    pushToHost: async (code, device, enc) => { await push(R(`${code}/q`), { d: device, m: enc }); },
    onHostQueue: (code, cb) => onChildAdded(R(`${code}/q`), (s) => {
      const v = s.val();
      void remove(s.ref);
      if (v && typeof v.d === 'string' && typeof v.m === 'string') cb(v.d, v.m);
    }),

    pushToDevice: async (code, device, enc) => { await push(R(`${code}/to/${device}`), enc); },
    onDeviceQueue: (code, device, cb) => onChildAdded(R(`${code}/to/${device}`), (s) => {
      const v = s.val();
      void remove(s.ref);
      if (typeof v === 'string') cb(v);
    }),

    saveSnapshot: (code, enc) => set(R(`${code}/snap`), enc),
    async loadSnapshot(code) { const s = await get(R(`${code}/snap`)); return s.exists() ? String(s.val()) : null; },
    saveVm: (code, seat, enc) => set(R(`${code}/vm/${seat}`), enc),
    async loadVms(code) {
      const s = await get(R(`${code}/vm`));
      const out: [number, string][] = [];
      s.forEach((c) => { out.push([Number(c.key), String(c.val())]); });
      return out;
    },
    removeRoom: (code) => remove(R(code))
  };
}
