import type { Hello, ServerMsg } from '../../shared/types';
import type { Bus, Wire } from './types';
import { deriveBusKey } from './crypto';
import { HostEngine } from './host';
import { openRemote } from './remote';

export type BusFactory = (cfg: any) => Promise<Bus>;
let factory: BusFactory = async (cfg) => (await import('./firebase')).createFirebaseBus(cfg);
/** Tests inject an in-memory bus here. */
export function setBusFactory(f: BusFactory) { factory = f; }
export const makeBus = (cfg: any) => factory(cfg);

export interface BusParams {
  code: string; role: 'player' | 'table'; create: boolean; name: string; deviceId: string; pass: string; takeover?: boolean;
  onMsg: (m: ServerMsg) => void;
  onFatal: (code: string) => void;
  onHostState?: (offline: boolean) => void;
  storage?: { get(k: string): string | null; set(k: string, v: string): void };
}

function defaultStore() {
  return {
    get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
  };
}

/**
 * The TABLE (tablet/PC) that creates a room becomes its server, and keeps being it after a page reload.
 * Phones, the facilitator's included, are remote clients.
 */
export async function connectBus(bus: Bus, p: BusParams): Promise<Wire | null> {
  const store = p.storage ?? defaultStore();
  const key = await deriveBusKey(p.pass, p.code);
  const hello: Hello = { t: 'hello', room: p.code, deviceId: p.deviceId, role: p.role, create: false, name: p.name, takeover: p.takeover };
  const meta = await bus.getMeta(p.code);
  const hostFlag = store.get('aim.host.' + p.code) === p.deviceId;
  const becomeHost = p.role === 'table' && !meta?.closed && ((p.create && !meta) || (hostFlag && !!meta));
  if (becomeHost) {
    const engine = new HostEngine({ code: p.code, deviceId: p.deviceId, bus, key, onLocal: p.onMsg });
    await engine.start(meta ? 'resume' : 'create');
    store.set('aim.host.' + p.code, p.deviceId);
    engine.openLocal({ ...hello, create: true });
    // a reload or a phone locking must not lose the last moves: save immediately when the page goes away
    const flush = () => engine.saveSoon();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    if (typeof window !== 'undefined') { window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', onVis); }
    return {
      send: (m) => engine.receiveLocal(m),
      close: () => {
        if (typeof window !== 'undefined') { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVis); }
        void engine.stop();
      }
    };
  }
  if (!meta) { p.onFatal('no_room'); return null; }
  if (meta.closed) { p.onFatal('deleted'); return null; }
  return openRemote({ code: p.code, deviceId: p.deviceId, hello, bus, key, onMsg: p.onMsg, onHostState: p.onHostState, onDeleted: () => p.onFatal('deleted') });
}

/** Delete a room without running its engine (e.g. from the host's home screen). Connected devices see "deleted". */
export async function deleteRoomOnBus(bus: Bus, code: string, drainMs = 1500): Promise<void> {
  const meta = await bus.getMeta(code);
  if (meta) {
    await bus.setMeta(code, { ...meta, closed: true });
    await new Promise((r) => setTimeout(r, drainMs));
  }
  await bus.removeRoom(code);
}
