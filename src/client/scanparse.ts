/**
 * What a scanned QR may open. Only this app's own player invite is accepted: same site, `#/r/CODE[?k=KEY]`.
 * Anything else (another site, a table link, plain text) is refused, so a QR can never send a phone elsewhere.
 */
const PLAYER_HASH = /^#\/r\/[A-Za-z0-9]{3,10}(\?[^\s]*)?$/;

export function inviteHashFrom(text: string, siteOrigin: string, sitePath: string): string | null {
  let u: URL;
  try { u = new URL(text.trim()); } catch { return null; }
  if (u.origin !== siteOrigin) return null;
  const norm = (p: string) => p.replace(/\/index\.html$/, '').replace(/\/$/, '');
  if (norm(u.pathname) !== norm(sitePath)) return null;
  return PLAYER_HASH.test(u.hash) ? u.hash : null;
}
