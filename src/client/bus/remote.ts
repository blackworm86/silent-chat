import type { ClientMsg, Hello, ServerMsg } from '../../shared/types';
import type { Bus, Wire } from './types';
import { encJson, decJson } from './crypto';

export interface RemoteOpts {
  code: string; deviceId: string; hello: Hello; bus: Bus; key: CryptoKey;
  onMsg: (m: ServerMsg) => void;
  onHostState?: (offline: boolean) => void;
  pingMs?: number; offlineMs?: number;
}

/** A non-host device: talks to the host's browser through the bus. */
export function openRemote(o: RemoteOpts): Wire {
  let closed = false;
  let epoch: string | null = null;
  let lastHb: number | null = null;
  let lastHbAt = Date.now();
  let inChain: Promise<void> = Promise.resolve();
  let outChain: Promise<void> = Promise.resolve();

  const send = (m: ClientMsg) => {
    outChain = outChain.then(async () => {
      if (closed) return;
      try { await o.bus.pushToHost(o.code, o.deviceId, await encJson(o.key, m)); } catch { /* offline: dropped */ }
    });
  };
  const unsubQ = o.bus.onDeviceQueue(o.code, o.deviceId, (enc) => {
    inChain = inChain.then(async () => {
      if (closed) return;
      try { o.onMsg(await decJson<ServerMsg>(o.key, enc)); } catch { /* ignore garbage */ }
    });
  });
  const unsubMeta = o.bus.onMeta(o.code, (meta) => {
    if (closed) return;
    if (!meta) { o.onHostState?.(true); return; }
    if (meta.hb !== lastHb) { lastHb = meta.hb; lastHbAt = Date.now(); o.onHostState?.(false); }
    if (meta.epoch !== epoch) { epoch = meta.epoch; send(o.hello); }   // first sight, or the host restarted: (re)announce ourselves
  });
  const timers = [
    setInterval(() => send({ t: 'ping', c: Date.now() }), o.pingMs ?? 8000),
    setInterval(() => { if (Date.now() - lastHbAt > (o.offlineMs ?? 20000)) o.onHostState?.(true); }, 3000)
  ];
  return {
    send,
    close() { closed = true; unsubQ(); unsubMeta(); timers.forEach(clearInterval); }
  };
}
