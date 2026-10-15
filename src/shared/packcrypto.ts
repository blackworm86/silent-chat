// AES-GCM + PBKDF2 helpers (WebCrypto; works in browsers and Node >= 20).
// File format: iv(12 bytes) || ciphertext || tag(16)  — same as produced by tools/pack.mjs.
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
export async function deriveKey(passphrase: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(passphrase);
  const base = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64) as BufferSource, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
export async function decryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.slice(0, 12), ct = data.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  return new Uint8Array(pt);
}
export async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0); out.set(ct, 12);
  return out;
}
