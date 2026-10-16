# Silent Chat — companion app for *Alice Is Missing* (IT/EN)

Two ways to host it. **Path A is the default** (free, no credit card, works from a phone).

| | **A — GitHub Pages + Firebase** | **B — Cloudflare** |
|---|---|---|
| Cost | free, no card | free, no card |
| Who runs the game "server" | the **host's phone/browser** (keep the app open in front) | Cloudflare (always on) |
| Needs a computer | no | no (Workers Builds) / yes (CLI) |
| Offline Wi-Fi mode | via `npm run relay` | via `npm run relay` |

> The deployed site contains **no readable game text**: cards and posters are AES-GCM encrypted (`public/pack`) and open with your group passphrase. Chat messages travelling through Firebase are end-to-end encrypted with a key derived from the same passphrase + room code. The plaintext cards (`content/`, `assets/`) are never committed.

## Path A — GitHub Pages + Firebase

1. **GitHub**: a *public* repository (free GitHub Pages needs public; nothing readable is exposed). Settings → Pages → Source: **GitHub Actions**. Every push to `main` rebuilds the site (`.github/workflows/pages.yml`).
2. **Firebase** (console.firebase.google.com, Google account, no card): create a project → *Realtime Database* → create (locked mode) → **Rules**: paste `firebase/database.rules.json` → Publish → register a *Web app* → copy the `firebaseConfig`.
3. Put the config in `public/config.json` (`transport: "firebase"`).
4. Encrypt your game data with a group passphrase: `PACK_PASSPHRASE="..." node tools/pack.mjs --out public/pack` (needs `content/` + `assets/` locally).
5. Open `https://<user>.github.io/<repo>/` → enter the passphrase → open `#/diag` and run **Connection test** → play.

How it works: the device that *creates* the room runs the game engine in its browser and talks to the others through a small encrypted message queue in Firebase. If the host's phone is closed or loses signal, everyone sees "waiting for the host"; when it returns (same device) the game resumes from the saved snapshot. Rooms delete themselves at the end of the game.

## Path B — Cloudflare (always-on server)

`npm install && npx wrangler login && PACK_PASSPHRASE="..." npm run deploy` (remove or rename `public/config.json` so the app uses WebSockets). See `wrangler.toml`.

## Playing

Host creates a game → friends scan the QR (or get the link through **Share invite**) → the host picks **Full Digital** or **Chat + Game Aids** and the sound source (**host's device** or **shared tablet**) under *Game settings* → follow the on-screen steps. Everything the rulebook asks for is on screen; the red **X** is always one tap away.

**Deleting a game:** the host can delete a game at any time from the menu (☰ → *Delete game*), or from *Your games* on the home screen. Everyone connected is told the game was deleted; the room, its chat and its voicemails are erased (Firebase, relay and Cloudflare alike).

The interface is designed for phones first; see `docs/UX-REVIEW.md` for the mobile usability review behind it.

## Without internet (local relay)
```bash
PACK_PASSPHRASE="..." npm run build && npm run relay      # prints http://192.168.x.x:8787 for phones on the same Wi-Fi/hotspot
```
YouTube is unavailable offline (manual clock; play the music from another device).

## Develop / test
```bash
npm test          # 47 tests: rules engine (240 random games), relay, Firebase-style transport, game deletion, encryption, UI
npm run typecheck
```
`src/shared` rules engine · `src/client` Preact app (`bus/` = Firebase transport) · `worker` Cloudflare · `relay` local server · `tools` · `docs/SPEC.md`.

## Honest status
Tested in a sandbox: rules engine, both transports (WebSocket relay + real Cloudflare runtime; Firebase transport on an in-memory bus that mimics Firebase), encryption, UI (simulated browser). **Not tested here:** the live Firebase service, real phones, live YouTube, microphones. Use `#/diag` and a two-phone playtest before game night.
