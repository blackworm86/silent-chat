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
  code: string; role: 'player' | 'table'; create: boolean; name: string; deviceId: string; pass: string;
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
 * The device that CREATES a room becomes its server (and keeps being it after a page reload).
 * Every other device is a remote client.
 */
export async function connectBus(bus: Bus, p: BusParams): Promise<Wire | null> {
  const store = p.storage ?? defaultStore();
  const key = await deriveBusKey(p.pass, p.code);
  const hello: Hello = { t: 'hello', room: p.code, deviceId: p.deviceId, role: p.role, create: false, name: p.name };
  const meta = await bus.getMeta(p.code);
  const hostFlag = store.get('aim.host.' + p.code) === p.deviceId;
  const becomeHost = p.role === 'player' && ((p.create && !meta) || (hostFlag && !!meta));
  if (becomeHost) {
    const engine = new HostEngine({ code: p.code, deviceId: p.deviceId, bus, key, onLocal: p.onMsg });
    await engine.start(meta ? 'resume' : 'create');
    store.set('aim.host.' + p.code, p.deviceId);
    engine.openLocal({ ...hello, create: true });
    return { send: (m) => engine.receiveLocal(m), close: () => { void engine.stop(); } };
  }
  if (!meta) { p.onFatal('no_room'); return null; }
  return openRemote({ code: p.code, deviceId: p.deviceId, hello, bus, key, onMsg: p.onMsg, onHostState: p.onHostState });
}
