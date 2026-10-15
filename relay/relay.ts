// Local relay for play WITHOUT internet: serves dist/ and the same game rooms over WebSocket.
// Run on a laptop/Raspberry Pi connected to the same Wi-Fi/hotspot as the phones:  npm run relay
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room } from '../src/shared/room';
import type { ClientMsg, ServerMsg } from '../src/shared/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.enc': 'application/octet-stream', '.jpg': 'image/jpeg'
};

interface Entry { room: Room; sockets: Map<string, WebSocket>; timer: NodeJS.Timeout; last: number }
export const rooms = new Map<string, Entry>();

function getEntry(code: string): Entry {
  let e = rooms.get(code);
  if (e) return e;
  const sockets = new Map<string, WebSocket>();
  const room = new Room({
    now: () => Date.now(),
    send: (deviceId, m: ServerMsg) => { const ws = sockets.get(deviceId); if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  });
  e = { room, sockets, last: Date.now(), timer: setInterval(() => room.tick(), 1000) };
  rooms.set(code, e);
  return e;
}

export function createServer(port = PORT) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(400); res.end('Bad request'); }
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const m = /^\/ws\/([A-Za-z0-9]{3,10})$/.exec(new URL(req.url ?? '/', 'http://x').pathname);
    if (!m) { socket.destroy(); return; }
    const code = m[1].toUpperCase();
    wss.handleUpgrade(req, socket, head, (ws) => attach(ws, code));
  });
  function attach(ws: WebSocket, code: string) {
    let deviceId: string | null = null;
    let entry: Entry | null = null;
    ws.on('message', (data) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(data)); } catch { return; }
      if (m.t === 'hello') {
        if (!m.deviceId || String(m.deviceId).length > 64) return;
        entry = m.create || rooms.has(code) ? getEntry(code) : getEntry(code); // empty rooms answer no_room
        const old = entry.sockets.get(m.deviceId);
        if (old && old !== ws) { try { old.close(1000, 'replaced'); } catch { /* ignore */ } }
        deviceId = m.deviceId;
        entry.sockets.set(deviceId, ws);
        entry.room.open(deviceId, m);
        entry.last = Date.now();
        return;
      }
      if (deviceId && entry) { entry.room.receive(deviceId, m); entry.last = Date.now(); }
    });
    const gone = () => {
      if (deviceId && entry && entry.sockets.get(deviceId) === ws) { entry.sockets.delete(deviceId); entry.room.close(deviceId); }
    };
    ws.on('close', gone); ws.on('error', gone);
  }
  // housekeeping: drop rooms idle for 12 h
  const gc = setInterval(() => {
    for (const [code, e] of rooms) if (Date.now() - e.last > 12 * 3600_000 && e.sockets.size === 0) { clearInterval(e.timer); rooms.delete(code); }
  }, 600_000);
  gc.unref();
  return new Promise<http.Server>((resolve) => server.listen(port, '0.0.0.0', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!fs.existsSync(path.join(root, 'index.html'))) console.warn('! dist/ not found. Run "npm run build" first (PACK_PASSPHRASE=... npm run build).');
  createServer().then(() => {
    console.log('\nAlice companion relay running. Open on phones (same Wi-Fi / hotspot):\n');
    for (const list of Object.values(os.networkInterfaces()))
      for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) console.log('   http://' + i.address + ':' + PORT);
    console.log('\nNote: plain http cannot install the app or keep the screen awake — install it once from your https site first.\n');
  });
}
