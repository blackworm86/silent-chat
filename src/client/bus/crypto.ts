import { bytesToB64, b64ToBytes, encryptBytes, decryptBytes } from '../../shared/packcrypto';

/** Key shared by everyone who knows the group passphrase AND the room code. */
export async function deriveBusKey(passphrase: string, code: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('aim-bus-v1:' + code.toUpperCase()) as BufferSource, iterations: 120000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
export async function encText(key: CryptoKey, text: string): Promise<string> {
  return bytesToB64(await encryptBytes(key, new TextEncoder().encode(text)));
}
export async function decText(key: CryptoKey, b64: string): Promise<string> {
  return new TextDecoder().decode(await decryptBytes(key, b64ToBytes(b64)));
}
export const encJson = (key: CryptoKey, v: unknown) => encText(key, JSON.stringify(v));
export async function decJson<T = any>(key: CryptoKey, b64: string): Promise<T> { return JSON.parse(await decText(key, b64)) as T; }
