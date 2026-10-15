# Silent Chat — private companion app for *Alice Is Missing* (IT/EN)

> **Private use only.** The app plays a commercial game using content from your own Italian copy.
> Never publish this folder or put `content/` or `assets/` on a public repository (they are git-ignored).
> The deployed website contains **no readable game text**: the cards and posters are encrypted and open with your group's passphrase.

## What you get
* **Full Digital** mode (cards, chat, clock all in the app) and **Chat + Game Aids** mode (real cards + your own group chat; the app runs clock, reminders, timed rules and tracking). Every component can be switched digital/physical separately.
* Italian and English interface and card text (English card text is an *unofficial translation*, labelled as such).
* Shared **table tablet** (optional) and two sound options: **audio from the host's device** or **from the shared tablet**.
* Works online (Cloudflare) and on a **local Wi-Fi without internet** (local relay).

---

## 1) Deploy it (about 10 minutes, free)

You need: a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npx wrangler login                       # opens your browser once to connect your Cloudflare account
```

Then choose a **group passphrase** (anything memorable, 6+ characters — your friends will type it once per device) and deploy:

```bash
# macOS / Linux
PACK_PASSPHRASE="your group passphrase" npm run deploy

# Windows PowerShell
$env:PACK_PASSPHRASE="your group passphrase"; npm run deploy
```

Wrangler prints your address, like `https://alice-companion.<your-name>.workers.dev`. Open it on a phone, enter the passphrase, and you are in.
To change the passphrase later, deploy again with a new one; everyone re-enters it (menu → *Forget passphrase*).

> Free plan notes: the app uses one Durable Object per game room (SQLite-backed, allowed on the free plan). A 2-hour game with 5 players is far below the free limits. Rooms delete themselves 24 hours after their last activity.

## 2) Play

1. **Host** (Charlie) opens the site → *Create a game*. A room code and two QR codes appear.
2. **Friends** scan the *Players* QR (or open the address and type the code). Max 5 players.
3. *(Optional)* **Table tablet**: scan the *Table tablet* QR on a tablet (or choose *Open as table tablet*). It shows the clock and the revealed Suspect/Location cards.
4. Host picks the mode in the lobby, and **where the sound comes from**:
   * *Host's device*: the host's phone plays the YouTube soundtrack/timer and keeps the clock.
   * *Shared tablet*: the table tablet plays it; **the tablet starts the game** with its big Start button (browsers only allow sound after a tap on that same device).
5. Walk through the steps (safety → introduction → characters → drives → introductions → relationships → voicemails → hunches → clue deal → rules → start). Everything the rulebook asks for is on screen.
6. During play: **Chat** (Full Digital), **Cards** (your clue cards unlock at the right time; vibration + sound), **Table**, **Notes**. The red **X** button is always one tap away.

### Chat + Game Aids (real cards)
Pick it in the lobby. The app gives you a *deal plan* (who takes which numbers from the box), pings each holder when a card's time comes, and asks you to **tap the card you drew/flipped** (a picture grid, no camera). Timed rules (2-minute waits, coin flips at 15:00 / 8:00 / 3:00, "captured at 2:00", lights-out) are run for you. Use *Per-component settings* to mix, for example real clue cards + digital suspect/location decks.

### Sound / video notes
* The video is `https://youtu.be/ysOOFIOAy7A`. The clock follows the video position, so pausing the video pauses everyone.
* If the video can't load or is blocked, the app switches **automatically** to a manual clock. The host can also force it (Menu → Host panel → *Switch to manual clock*).
* If your video has an intro before the countdown, set *Video position at 90:00* in the lobby.

## 3) Play without internet (local relay)

On a laptop (or Raspberry Pi) connected to the same Wi-Fi or phone hotspot as everyone:

```bash
PACK_PASSPHRASE="your group passphrase" npm run build      # once, while you still have internet
npm run relay                                              # prints addresses like http://192.168.1.20:8787
```

Phones open that address. In this mode **YouTube is not available** (use the manual clock and play the music from another device). Plain `http` pages cannot be installed as an app or keep the screen awake, so install the app once from your https address beforehand and keep phone screens on manually.

## 4) Develop / test

```bash
npm test                  # 30+ tests: rules engine, 240 random full games, relay, encryption, UI in a simulated browser
npm run typecheck
# live development:
PACK_PASSPHRASE=dev node tools/pack.mjs --out public/pack
npx tsx relay/relay.ts &  npm run dev                      # relay on :8787, app on :5173 (WebSocket proxied)
```

Project layout: `src/shared` (rules engine, used by server **and** client), `src/client` (Preact app), `worker` (Cloudflare Worker + Durable Object), `relay` (local server), `tools` (pack encryption, service worker), `content` + `assets` (your private game data), `docs/SPEC.md` (full specification).

## 5) Honest status and limits
* Built and tested in a sandbox without real phones: the rules engine (240 simulated games), WebSocket server (Node relay **and** the real Cloudflare runtime via `wrangler dev`), encryption, and the UI (in a simulated browser) are tested. **Not tested here:** real phones/browsers, the live YouTube player, microphone recording on iOS/Android. Do a short playtest with two phones before game night.
* Not implemented yet (see SPEC appendix): serverless WebRTC local mode, own-audio-file clock, automatic redistribution of cards when a player quits mid-game.
