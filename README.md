# Silent Chat — companion app for *Alice Is Missing* (IT/EN)

You need one **tablet or PC** in the middle of the table (it opens the game, plays the soundtrack and runs the clock) plus one phone per player. Two ways to host it. **Path A is the default** (free, no credit card).

| | **A — GitHub Pages + Firebase** | **B — Cloudflare** |
|---|---|---|
| Cost | free, no card | free, no card |
| Who runs the game "server" | the **table's browser** (keep the page open in front) | Cloudflare (always on) |
| Needs a computer | no | no (Workers Builds) / yes (CLI) |
| Offline Wi-Fi mode | via `npm run relay` | via `npm run relay` |

> The deployed site contains **no readable game text**: cards and posters are AES-GCM encrypted (`public/pack`) and open with your group passphrase. Chat messages travelling through Firebase are end-to-end encrypted with a key derived from the same passphrase + room code. The plaintext cards (`content/`, `assets/`) are never committed.

## Path A — GitHub Pages + Firebase

1. **GitHub**: a *public* repository (free GitHub Pages needs public; nothing readable is exposed). Settings → Pages → Source: **GitHub Actions**. Every push to `main` rebuilds the site (`.github/workflows/pages.yml`).
2. **Firebase** (console.firebase.google.com, Google account, no card): create a project → *Realtime Database* → create (locked mode) → **Rules**: paste `firebase/database.rules.json` → Publish → register a *Web app* → copy the `firebaseConfig`.
3. Put the config in `public/config.json` (`transport: "firebase"`).
4. Encrypt your game data with a group passphrase: `PACK_PASSPHRASE="..." node tools/pack.mjs --out public/pack` (needs `content/` + `assets/` locally).
5. Open `https://<user>.github.io/<repo>/` → enter the passphrase → open `#/diag` and run **Connection test** → play.

How it works: the table (tablet/PC) that *creates* the room runs the game engine in its browser and talks to the phones through a small encrypted message queue in Firebase. If the table is closed or loses signal, the phones show "waiting for the table"; when it returns (same device, from *Your games*) the game resumes from the saved snapshot with the clock paused. Rooms delete themselves at the end of the game. A second device can only become the table if you explicitly confirm the takeover.

## Path B — Cloudflare (always-on server)

`npm install && npx wrangler login && PACK_PASSPHRASE="..." npm run deploy` (remove or rename `public/config.json` so the app uses WebSockets). See `wrangler.toml`.

## Playing

On the tablet/PC: unlock with the passphrase → **Start a game on this tablet/PC** → players scan the QR on the table → tap the name of the **facilitator** (plays Charlie, runs the game from their phone: *Next*, mode **Full Digital** / **Chat + Game Aids** under *Game settings*, host tools) → follow the on-screen steps → the table starts the clock and the soundtrack and has Pause/Resume. During play the table shows the clock, the clue timeline with reminders, the players and the revealed cards. On the phones: the chat (group + private bubbles, `@name` mentions), the clue alert at the top of the screen, cards, table and notes. The red **X** is always one tap away.

**Soundtrack:** YouTube by default. To play without YouTube, open the table's menu → *Soundtrack* → choose an audio or video file on that tablet/PC (for example the soundtrack MP3). The file stays in that browser's storage, is never uploaded, and is remembered for next time. It must start at 90:00, or set the start offset in *Game settings*. The clock is always in charge: the music follows it, and pausing from any device pauses the music.

**Deleting a game:** the table (☰ → *Delete game*, or *Your games* on its home screen) or the facilitator (☰ → *Delete game*) can delete it at any time. Everyone connected is told the game was deleted; the room, its chat and its voicemails are erased (Firebase, relay and Cloudflare alike).

The interface is designed for phones first; see `docs/UX-REVIEW.md` for the mobile usability review behind it.

## Without internet (local relay)
```bash
PACK_PASSPHRASE="..." npm run build && npm run relay      # prints http://192.168.x.x:8787 for phones on the same Wi-Fi/hotspot
```
YouTube is unavailable offline: choose a soundtrack file on the table instead (see *Soundtrack* above).

## Develop / test
```bash
npm test          # rules engine (240 random games), relay, Firebase-style transport, table/facilitator, host demo, encryption, UI
npm run typecheck
```
`src/shared` rules engine · `src/client` Preact app (`bus/` = Firebase transport) · `worker` Cloudflare · `relay` local server · `tools` · `docs/SPEC.md`.

## Honest status
Tested in a sandbox: rules engine, both transports (WebSocket relay + real Cloudflare runtime; Firebase transport on an in-memory bus that mimics Firebase), encryption, UI (simulated browser). **Not tested here:** the live Firebase service, real phones and tablets, live YouTube, playback of a local soundtrack file on real devices, microphones. Use `#/diag` and a two-phone playtest before game night.
