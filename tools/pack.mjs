// Encrypts the private game content + poster images into dist/pack (or --out DIR).
// Usage:  PACK_PASSPHRASE="your group passphrase" node tools/pack.mjs [--out public/pack]
// The deployed site then contains NO readable game text: friends enter the passphrase once per device.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : 'dist/pack';
const passphrase = process.env.PACK_PASSPHRASE;
if (!passphrase || passphrase.length < 6) {
  console.error('\nERROR: set PACK_PASSPHRASE (at least 6 characters). Example:\n  PACK_PASSPHRASE="my secret words" npm run build\n');
  process.exit(1);
}
const ITER = 600000;
const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(passphrase, salt, ITER, 32, 'sha256');

function enc(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const manifest = { v: 1, salt: salt.toString('base64'), iterations: ITER, files: [] };

const put = (name, buf) => { fs.writeFileSync(path.join(outDir, name), enc(buf)); manifest.files.push(name); };
put('content.enc', fs.readFileSync('content/content.json'));
const posters = fs.readdirSync('assets/posters').filter((f) => f.endsWith('.jpg')).sort();
posters.forEach((f, i) => put('poster_' + String(i + 1).padStart(2, '0') + '.enc', fs.readFileSync(path.join('assets/posters', f))));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
console.log('pack written to', outDir, '(' + manifest.files.length + ' encrypted files)');
