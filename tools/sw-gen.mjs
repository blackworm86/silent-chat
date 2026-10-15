// Generates dist/sw.js: precaches the app shell (NOT the encrypted pack, which is cached at runtime on first use).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dist = 'dist';
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'pack') walk(p); }
    else if (f !== 'sw.js') files.push(path.relative(dist, p).replaceAll('\\', '/'));
  }
})(dist);
const version = crypto.createHash('sha1').update(files.map((f) => f + fs.statSync(path.join(dist, f)).size).join('|')).digest('hex').slice(0, 10);
const sw = `// auto-generated
const VERSION = 'aim-${version}';
const SHELL = ${JSON.stringify(['./', ...files])};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'aim-pack').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/ws/')) return;
  if (url.pathname.includes('/pack/') || url.pathname.endsWith('/config.json')) {
    // encrypted pack + config: network first (so a re-deploy wins), cache fallback for offline play
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open('aim-pack').then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match('./'))));
});
`;
fs.writeFileSync(path.join(dist, 'sw.js'), sw);
console.log('sw.js written, version', version, files.length, 'files');
