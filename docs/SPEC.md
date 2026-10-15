# Alice Is Missing — Private Companion App
## Complete Specification v0.2 (2026-10-15) — implementation status in Appendix A

> **Private use only.** This app contains the text of a commercial game. It is built for the owner and a small group of friends. It must never be published, listed or shared publicly. Game content lives in a separate content pack (`content/content.json`), encrypted at rest (see §12.4). The app code itself contains no game text.

---

## 0. Decisions already taken (do not re-ask)

| # | Decision |
|---|---|
| D1 | Private use for the owner and friends. Original Italian content from the owner's physical copy (base game only). |
| D2 | App UI in **Italian and English**. Card content: Italian verbatim + **unofficial English translation**, always labelled "Unofficial translation". |
| D3 | Two play modes: **Full Digital** and **Chat + Game Aids** (uses the physical components). Mixable per component (§2). |
| D4 | Two sound options for the countdown video/soundtrack: **audio from the Host's device** or **audio from the shared tablet**. |
| D5 | Shared "table device" (tablet in the centre) is optional but first-class. |
| D6 | Works with internet; must also work on a **local wireless network without internet** (clock-only audio fallback, no YouTube). |
| D7 | Speed is the goal: the app automates dealing, shuffling, drawing, timing, reminders. |
| D8 | The day of the week shown is **Saturday** by default (Italian guide prints "domenica", which contradicts "Wednesday, 3 days ago"). It is a setting. |
| D9 | The first message of the game is sent by Charlie when the **first song ends** — players hear it; the app never needs the song length. |
| D10 | No game text is ever sent to a public server in clear text (§12.4). |

---

## 1. Scope

### 1.1 In scope
- Whole session from lobby to debrief for 3–5 players: safety tools, intro, poster, characters, drives, introductions, relationships, voicemails, starting hunches, clue dealing, 90-minute game, final messages, voicemail playback, debrief.
- In-app group chat and private chats (Full Digital).
- Shared table view (revealed Suspect/Location cards, decks, culprit/Alice markers, clock).
- Every physical component supported either as digital or as physical-with-tracking (§2).
- Full bilingual UI and content.

### 1.2 Out of scope (v1)
- Expansions (Silent Falls, Whispering Pines).
- Camera scanning of physical cards (the app uses a picture grid instead, §10).
- Public accounts, payments, analytics.
- Shipping the soundtrack/video (the app plays the official YouTube video, or the user's own local file).

---

## 2. Play modes

### 2.1 The two modes
| | **Full Digital** (*Tutto digitale*) | **Chat + Game Aids** (*Chat + Supporti di gioco*) |
|---|---|---|
| Chat | In-app group + private chats | The players' own messaging app (WhatsApp/iMessage/…). The app shows no chat. |
| Cards | App deals, shuffles, draws, shows | Physical cards on the table; app tracks and assists |
| Clock/audio | App | App |
| Voicemails | In-app recording on each phone | Physical: one phone records (as in the book) — or in-app |
| Setup speed | Fastest (can be done remotely before meeting) | As fast as the app can make it with real cards |

### 2.2 Per-component source setting
Each component has its own switch; the two modes are just presets.

| Component | Digital | Physical (app = tracker/assistant) | Preset: Full Digital | Preset: Chat+Aids |
|---|---|---|---|---|
| Character cards | App assigns/shows | Players pick real cards; each taps their character | Digital | Physical |
| Drive cards | App deals randomly, shows privately | Real deal; each player taps their drive (5 options) | Digital | Physical |
| Missing-person poster | App picks a random one, shows to all | Real poster picked; someone taps which of the 10 | Digital | Physical |
| Intro card | Shown on table device | Read from the real card | Digital | Physical |
| Clue cards | App deals (§5.2), reveals at the right time | **Deal assistant** (§5.3): app prints a plan; real cards stay face down; app tells each holder when to flip | Digital | Physical |
| Suspect deck | App shuffles/draws | Real draws; player taps the drawn card (§10) — or "let the app pick" | Digital | Physical |
| Location deck | same | same | Digital | Physical |
| Search deck | App draws | Real draw; tap the card | Digital | Physical |
| X card | Button + shown to all | Real card + the same button (both work) | Digital | Both |
| Character Record (notes sheet) | Private in-app notebook | Paper sheet | Digital | Physical |
| Voicemails | In-app | One phone records, host plays | Digital | Physical |
| Debrief card | Shown on Charlie's screen | Read from the real card | Digital | Physical |
| Chat | In-app | External app | Digital | External |
| Timer + audio | App | App | App | App |

Rules:
1. A deck is either Digital or Physical for the whole session (no mixing inside one deck). *Exception:* an "Advanced" toggle allows per-draw override; the app then excludes already-registered cards from random draws.
2. Switching a component mid-game is allowed from the Host panel (it re-syncs state from the last registered cards).
3. Anything the app tracks can be corrected manually (undo + manual edit) — the app is never the only source of truth in Physical mode.

---

## 3. Devices and roles

| Role | Description |
|---|---|
| **Host / Facilitator** | Plays **Charlie Barnes**. Creates the room, owns settings, sees the Facilitator panel (prompts, nudges, overrides). Also a normal player. |
| **Player** | Any other seat (2–4). |
| **Table device** *(optional)* | A shared tablet in the centre: shows the table view. Can be the sound device (D4). Not a player seat. |
| **Sound device** | Exactly one device plays the video/audio: **Host's device** or **Table device** (chosen in lobby, changeable only while paused). |

Seats: 3–5 players including Charlie. Late join and reconnect restore the seat from a local token.

---

## 4. Session flow (phases)

Each phase lists what the app does. "Aids" = Chat + Game Aids preset.

0. **Lobby.** Room code + QR + (local mode) address. Pick language per device, mode, component switches, sound device, day-of-week, content settings (§4.1). Min 3, max 5 players. Remote pre-setup allowed: phases 2–5 can be completed **before** the group meets.
1. **Safety.** Content warning text (original wording by the app, not the book's). Lines & Veils editor (shared list, anyone can add, suggested veils: gore/violence, sexual non-consent, victim blaming). X card explanation + open-door policy. Everyone taps "OK for me". *(Required to proceed.)*
2. **Introduction.** Intro card on the table device / each phone. Poster reveal (random or physical). Day-of-week shown.
3. **Characters.** Charlie is fixed to the Host. Others choose in turn or free-for-all; cards show title + the three sections (Background / Secret / Voicemail prompt). Secrets are read **privately** (a player does not see others' secrets — note: the printed game shows all five cards to everyone while choosing; the app has a setting "Show secrets while choosing" default **off**, because the book instructs players not to share secrets).
4. **Drives.** Random deal (or physical tap). Each player sees their Motive privately and their two Relationship lines.
5. **Introductions.** Clockwise from Charlie: name, pronouns, relationship to Alice, physical description, Background answer. App shows a "your turn" indicator and a free-text card (optional, local) per player. No secrets.
6. **Relationships.** Each player assigns their two relationship lines to two other characters (tap target per line). Result is visible to everyone as a small matrix (one-sided relationships).
7. **Voicemails.** Each player records (§9). Parallel with 8 (the "break").
8. **Table setup + Starting hunches.** Five Suspects and five Locations laid out; players take turns choosing one and describing why it is suspicious (app shows the turn order and a prompt). Then all cards are shuffled back into 10-card decks.
9. **Clue deal.** App deals (§5.2/5.3). Centre card (10) placed. Everyone sees only their own cards' timestamps (never the text until it is time).
10. **Rules walkthrough.** Quick Guide (13 points) shown; Host panel offers the explanation script prompts (short, original wording).
11. **Ready check → Start.** Clock paused at **90:00**. Host taps *Start* (starts video on sound device, clock follows).
12. **Play (90:00 → 0:00).** See §5–§8. Silent-play banner ("no talking").
13. **Final messages (0:00).** One last in-character message each. Debrief card on Charlie's screen.
14. **Voicemail playback.** Plays on the sound device, ducking the final song (§9).
15. **Debrief.** Four questions on Charlie's screen; "Send real-name message" step; reminder to rename contacts (Aids/external chat only). Optional chat-log export (Full Digital).

### 4.1 Host settings (all in lobby, editable while paused)
`language(UI)`, `mode preset`, per-component source switches (§2.2), `soundDevice` (host|table), `dayOfWeek` (default saturday), `includeBodyEnding` (default on; off removes clue_10_b), `showSecretsWhileChoosing` (off), `silentPlayBanner` (on), `vibrateOnClue` (on), `autoLockChat` (on).

---

## 5. Rules engine

The engine is a **pure TypeScript module** (no UI, no network) shared by client and server. All randomness uses a seeded PRNG stored in the session, so a session is reproducible from its event log.

### 5.1 Decks
| Deck | Cards | Notes |
|---|---|---|
| Suspect | 10 = 5 names × 2 | Draw random from remaining; revealed cards are listed face-up |
| Location | 10 = 5 names × 2 | same |
| Search | 8 | Draw without replacement; reshuffle only if empty |
| Clue pool | 31 = 90(1) + 3 each at 80,70,60,50,45,40,35,30,20,10 | Per game one random variant per timestamp |
| Character | 5 | Charlie fixed |
| Drive | 5 | Random deal; leftovers unused |

### 5.2 Clue deal algorithm (Digital)
Input: players `P` (3–5), Charlie ∈ P.
1. Pick one random variant for each of 90 (single), 80, 70, 60, 50, 45, 40, 35, 30, 20, 10.
2. `clue_90` → Charlie. `clue_10` → centre (not dealt).
3. Deal the nine cards {80,70,60,50,45,40,35,30,20} to players with these constraints:
   - **Swap rule:** no player may hold two cards whose timestamps differ by **≤ 10** (counting Charlie's 90).
   - Hand sizes differ by at most 1 (counting the 90). *(Verified by exhaustive search: always feasible for 3, 4 and 5 players; for 5 players perfectly balanced.)*
4. Method: randomised backtracking in descending timestamp order; on dead end, retry with a new shuffle (cap 1,000 tries); fallback: allow size difference 2.
5. Cards stay hidden. Each holder sees only "You hold: 70, 50, 35 — text unlocks at that time".

Reference result (found by the solver): 4 players → `[90,60,40] [70,30] [80,50,35] [45,20]`.

### 5.3 Deal assistant (Physical clue cards)
Same algorithm, but outputs a **plan** only: per player, a list of timestamps. Players take the physical cards by number from the box (random variant by hand). Option "let the app choose the variants" shows each variant as a small picture card ("take the one starting *Sei andato alla polizia…*").
Then the app only **notifies holders when a timestamp arrives** and, if a holder registers the physical card they flipped, uses it for rules state (see §10).

### 5.4 Flipping a card (Digital)
At timestamp T the holder's device vibrates/sounds and shows the card (unlocks text), with:
- the card's question,
- any effect UI (draw suspect/location, countdowns, coin flip…),
- a **"Shared with the group"** reminder (the book: all information on a card must be shared).
Everyone sees a short system line "Clue T revealed by <character>" (not the text) — the holder shares in character.
If a holder has not opened their card **60 s** after T, the Host panel shows a nudge button ("Remind Dakota"), which sends a private nudge. (The book: missed cards are the most common problem.) Late flips are allowed at any time; later clocks are unaffected.

### 5.5 Effect catalogue (data-driven, see `content.json` → `effects`)
| type | Meaning |
|---|---|
| `holder` | Card is held by a role (e.g. facilitator) rather than dealt |
| `prepareMessage` / `sendWhen` | Charlie's opening message is prepared; **Send** is enabled manually when the first song ends |
| `draw` (`suspect`/`location`) | Draw a random card from that deck, add to revealed row |
| `drawFromRevealed` (`culprit`/`aliceLocation`) | Shuffle **revealed** cards of that deck, draw one → culprit / Alice's location. `putRestOnTopOfDeck`: remaining revealed suspects go back on top of the deck (30-minute cards) |
| `giveCard` | 20-minute cards: holder chooses the player who goes to Alice; that player receives `clue_10` (hidden until 10:00) |
| `delay` | After N minutes (startsOn flip) show a countdown to the holder and alert at the end (50-A, 35-B, 35-C) |
| `lightsOut` | 45-B: warning, dim every screen to near black with a short reminder + optional flashlight prompt; restore on a tap by the holder |
| `unlock` (`aliceCar`) | Records that Alice's car may now be mentioned (rule: car/phone only when a card says so) |
| `muteSelf` | 20-C: composer disabled for N minutes (countdown) |
| `atClock` | At a specific remaining time: `coinFlip`, `outOfCharacterMessage` (choose target, private DM prompt), `drawTopUntilNot` (10-C at 8:00), `captured` (10-C at 2:00) |
| `becomeAlice` | 10-A: that player's chat identity switches to **Alice**; announced to the group |
| `lockChat` | Group/private in-character messaging disabled (OOC parentheses still allowed; one-time private "state report" allowed) |

**Coin flip:** the app animates a coin, logs the result for everyone, and applies the outcome text. In Physical mode the holder can instead tap Heads/Tails after tossing a real coin.

### 5.6 Special rules enforced or surfaced
- Two characters never in the same place (reminder only).
- Alice's phone/car are only found if a card says so (35-B unlocks the car).
- Revealed Suspect/Location cards stay visible on the table view.
- 10-card holder must be the player who actually goes: Host can reassign the 10 card before 10:00 (book p.43).
- At **0:00**: chat allows one last message per player, then the debrief screen.
- Content setting `includeBodyEnding=false` removes `clue_10_b` from the 10 pool.

---

## 6. Clock and audio

### 6.1 Clock model
- Authoritative state: `startedAtEpochMs` (server time), `pausedAtRemainingMs`, `running`.
- Remaining time on any device = `90:00 − (serverNow − startedAt)`, where `serverNow = Date.now() + offset`; `offset` measured with a 5-sample ping handshake and refreshed every 60 s.
- Backgrounded phones don't drift (time is computed, not counted).
- Pause/resume by the Host adjusts `startedAt`.

### 6.2 Two sound options (D4)
| Option | Where video plays | What others see |
|---|---|---|
| **A. Host's device** | Host phone (or laptop): YouTube player is open in the app (small, visible) | Clock only; audio comes from the Host's device (optionally Bluetooth/cast at the OS level) |
| **B. Shared tablet** | Table tablet: large video + table view | Clock + table view; audio from the tablet |

Video: `https://youtu.be/ysOOFIOAy7A` (soundtrack + countdown). The YouTube IFrame Player API on the sound device reports `currentTime`; **clock = video position** while the video plays ("video-synced" mode), so pausing the video pauses everyone.
Requirements: the player must remain visible (≥ 200×200 px) per YouTube terms; start requires a user tap (autoplay policy) — satisfied by the Host's *Start* button.

### 6.3 Fallbacks (automatic)
1. **Offline or embedding blocked or ads interfere** → app switches to its own clock ("manual mode"): Host taps *Start together* when the music starts; ±1 s nudge buttons fix drift.
2. **External playback** (the Host casts YouTube from the YouTube app) → same as manual mode.
3. **User's own audio file** (optional): file picker stores it in IndexedDB on the sound device; played with the Web Audio/HTMLAudio API; the clock then follows the file position. The app never ships audio.

### 6.4 Clock-triggered events
Scheduled by the engine from the clue deal: clue unlocks (every timestamp), effect triggers (15:00, 8:00, 3:00, 2:00), delays. Triggers survive reconnects because they derive from `remaining`.

---

## 7. Chat (Full Digital)

- **Group chat** (all seats) + **private chats** between any two characters. No other group chats.
- Names are **character names** (this replaces the contact-renaming step). At the end, a "real names" message step runs (debrief).
- Messages: text (emoji ok), timestamp (in-game time optional), delivered ✓, typing indicator (the book highlights the "typing dots" effect), unread badges.
- **Out-of-character:** text in parentheses `( … )` is auto-styled grey/italic.
- **Safety commands** are buttons that insert a system card: `(X)`, `(X: …)`, `(Line: …)`, `(Veil: …)`; typing them manually also works. After an X, the author of the content gets a "delete your message" prompt (book p.9). No one may contest an X.
- **Delete own message** (needed for X) — shows "message removed".
- **Locked state** (§5.5): composer disabled with countdown or message; OOC allowed.
- **Alice identity** after 10-A: that player's messages appear from "Alice".
- No attachments in v1. Chat log export at the end (text file, local).
- Latency budget: < 300 ms on local network, < 600 ms online.

In **Chat + Game Aids** mode there is no chat UI; the app can generate a **setup helper** ("start your group chat; Charlie sends the first message; everyone answers with their character name; rename contacts") and a closing helper ("send your real name; rename contacts back").

---

## 8. Safety tools

- Content warning at lobby (original text), consent tap per player.
- **Lines & Veils:** shared list; anyone can add `(Line: …)`/`(Veil: …)` any time. Pinned in a collapsible panel on every screen.
- **X card:** always one tap away (floating button), plus the physical card.
- **Open door:** "I need to step out" button → Host gets a private flag and is prompted to message them; if a player leaves, the Host chooses *redistribute their unflipped clue cards* (automatic, respecting the swap rule) or *stop the game*.
- **Aftercare:** debrief screen can't be skipped; shows the four debrief questions.

---

## 9. Voicemails

- Prompt shown from the player's Character card ("The last voicemail you left Alice before you knew she was missing"; include your secret, directly or subtly; ideally ≤ 1 minute).
- Recording: MediaRecorder (Opus/WebM; AAC fallback on iOS), local only, re-record allowed, preview.
- Delivery: when the player taps *Ready*, the blob (≈ 100–250 KB) uploads to the sound device (peer/relay), encrypted in transit. Charlie records first in the physical flow; the app has no enforced order except playback order = Charlie first, then clockwise.
- **Physical option:** the Host records all voicemails on one phone as in the book; the app only offers a "record on this phone" mini-recorder.
- **Playback (at 0:00):** on the sound device. Duck the video's audio to ~35% while a voicemail plays; if the final song ends, voicemails continue. Show the speaker's name only **after** each clip ends.

---

## 10. Handling physical cards (registration UX)

Goal: one tap per physical event, never a camera.
- **Picture grid:** each deck shows card thumbnails (the app's art). Tap the card that was drawn.
- **Duplicates:** suspects/locations exist twice; the app tracks `remainingCopies` per name (0–2) and warns if a third is registered ("check: only 2 copies exist").
- **When registration is needed:** a suspect/location is drawn (clue 80–35); a search card is drawn; 30/20 draw (the app can pick randomly from the registered revealed cards — "Let the app pick" — or the table shuffles and taps the result); who has the 10-minute card.
- **Warnings:** before 30:00 and 20:00 the app lists the revealed cards it knows and asks "Is the table the same?" with a quick edit.
- **Everything is undoable** (long-press an entry → remove/edit).

---

## 11. Data and state

### 11.1 Content pack (`content/content.json`)
Sections: `meta`, `settings`, `characters`, `drives`, `locations`, `suspects`, `searchCards`, `clueCards` (with `effects`), `specialCards` (intro, debrief, xcard), `quickGuide`, `posters`, `characterRecord`, `backs`. Every translatable string is `{ "it": …, "en": … }`. `meta.printTypos` lists known printed errors (e.g. "della vacanze", "sessionex", "domenica").
Validation: `tools/validate_content.py` (72 cards, 3×10+1 clue cards, both languages present).

### 11.2 Session state (authoritative copy, JSON)
```
Session {
  id, createdAt, seed, language{deviceId→it|en},
  settings{...§4.1}, mode, sources{component→digital|physical},
  players[{ seat, deviceId, name, characterId, driveId, isHost, connected, locked:{until|forever|null}, identity:"self|alice" }],
  poster, phase,
  clock{ running, startedAt, pausedRemainingMs, source:"video|manual|file" },
  safety{ lines[], veils[], xLog[] },
  decks{ suspect{remaining[], revealed[]}, location{...}, search{...} },
  clues{ hands{seat→[clueId]}, centre:"clue_10_?", flipped[], tenHolder },
  results{ culprit, aliceLocation, accomplice, aliceCarUnlocked },
  chat{ messages[], ... }, notes{seat→{...}}, voicemails{seat→blob ref},
  log[ events ]
}
```
Events are append-only; state = reduce(events). Undo = compensating event.

### 11.3 Hidden information and projections
Each client receives only its **projection**: own secret, own drive, own clue hands, public table state. The server/relay holds the full state. In **local mode the relay runs on the Host's laptop/device** — the Host (Charlie) could technically inspect it; accepted for a friends' game, but the Host UI never displays others' hidden data.

### 11.4 Synchronisation
WebSocket per device → room authority applies intents (`flipClue`, `drawCard`, `sendMessage`, `registerPhysical…`) → broadcasts diffs. Optimistic UI for chat; everything else waits for confirmation. Reconnect = resend `lastEventId`.

---

## 12. Architecture and deployment

### 12.1 Stack (recommended)
- **Client:** TypeScript, Vite, **Svelte** (small, fast on phones), PWA (installable, offline shell), IndexedDB for content/voicemails/session cache.
- **Engine:** pure TS package + unit tests (Vitest).
- **Realtime:** Cloudflare **Workers + Durable Objects** (one object per room, WebSocket hibernation). Free tier is enough for this use.
- **Hosting:** Cloudflare Pages (auto-deploy from GitHub).

### 12.2 Online mode
Players open the site, enter room code or scan QR. All state via the Durable Object. Voicemails and chat transit over the WebSocket.

### 12.3 Local mode (no internet) — staged
1. **Stage A (reliable):** a single-file **local relay** (Node/Deno) running the same engine on a laptop/Raspberry Pi/travel router, serving the PWA and WebSockets at `http://192.168.x.x:PORT`. Phones join the same Wi-Fi/hotspot and scan a QR. *Limits:* plain-HTTP origins cannot use service workers, install-as-app or Screen Wake Lock → the PWA must be **installed beforehand** from the HTTPS site (so it is cached), then pointed at the relay address; a NoSleep video fallback keeps the screen on.
2. **Stage B (experimental, serverless):** host-phone star topology over WebRTC data channels, set up by QR/offer-answer exchange, on the host's hotspot. Known risk: mDNS ICE candidates and client isolation on some hotspots; iOS Safari quirks. Build only after Stage A is solid.
3. In local mode there is **no YouTube**: use manual/own-file clock (§6.3).

### 12.4 Content privacy (D10)
- Public site = app shell only.
- `content.json` and poster images are **AES-GCM encrypted** with a key derived (PBKDF2) from a group passphrase; the encrypted pack is hosted next to the app. On first launch each friend enters the passphrase once; decrypted content is cached in IndexedDB for offline use. (Alternative: Cloudflare Access email gate — heavier, not needed.)
- `robots: noindex`, no analytics, no third-party scripts except the YouTube IFrame API on the sound device.

### 12.5 Repository layout (proposed)
```
alice-app/
  docs/SPEC.md
  content/content.json                (source, plaintext, NEVER deployed)
  assets/posters/*.jpg
  packages/engine/        (rules, deck, deal, effects, clock)  + tests
  packages/app/           (Svelte PWA, i18n, UI)
  packages/server/        (Cloudflare DO)    packages/relay/ (local relay)
  tools/validate_content.py  tools/encrypt_pack.ts
```

---

## 13. Internationalisation and content rules

- UI strings: `it.json`, `en.json` (both complete before release). Language is **per device** (two players can read different languages in the same room); card text for a viewer is shown in their language.
- English card text is flagged by a small "Unofficial translation" tag; names of characters, locations, suspects use the official English names from the rulebook (`enOfficial: true`).
- Gender slashes ("Quella/o", "Migliore Amica/o"): shown as printed in Italian; the English text is neutral. Optional setting "match my character's pronouns" for Italian wording (later).
- Printed typos are preserved in the pack; the UI can apply the `printTypos` corrections (default: apply **only** the day-of-week token).
- Dates/times formatted by locale; the clock always `MM:SS`.

---

## 14. UI inventory

Reuse the approved look from the mockup (dark "phone at night", amber for clue moments).
**Phone screens:** Home, Lobby, Settings, Safety, Intro/Poster, Pick character, Private card (+secret reveal), Drive & relationships, Assign relationships, Introductions timeline, Voicemail recorder, Hunches, Clue deal result, Rules (Quick Guide), Ready check, **Play** (clock bar, tabs Group/Direct/Cards, composer, X button), Clue card overlay, Coin flip, Countdown (delay), Lights-out, Locked chat, Final message, Voicemail player, Debrief, Notebook (Character Record), Host panel.
**Table device:** Table view (clock large; Suspect row; Location row; culprit/Alice markers when revealed; search deck count; 10-card marker; X card button), video (when sound device), lights-out screen, final voicemail screen.
**Aids mode extras:** deal plan, registration grid, "is the table the same?" check, setup/closing chat helpers.

---

## 15. Non-functional requirements

- **Performance:** first load < 200 KB gzipped JS; content pack lazy-loaded; ≥ 60 fps UI on mid-range phones; chat render of 500 messages without jank.
- **Battery/screen:** Screen Wake Lock on all play screens (HTTPS); fallback NoSleep.
- **Notifications:** in-app sound + vibration (Android; iOS has no vibration API) — no push.
- **Accessibility:** touch targets ≥ 44 px, AA contrast, real buttons/labels, dynamic type, reduced-motion respected.
- **Reliability:** any device can reload/rejoin mid-game without losing state; Host can hand over the Host role (tap *Make host*, requires current Host confirmation) — important because Host is also Charlie.
- **Privacy:** no persistent server storage of chat or voicemails after the room closes (rooms expire 12 h after last activity).

---

## 16. Test plan and acceptance criteria

### 16.1 Engine unit/property tests
- Deal: 10,000 seeds × {3,4,5 players}: every hand satisfies the swap rule; size spread ≤ 1; Charlie holds 90; centre is a 10; exactly one variant per timestamp.
- Decks: 5 names × 2 copies; a third copy never drawn; reveal order reproducible from seed.
- 30-minute effect: culprit ∈ revealed suspects; the rest go back **on top**; with ≥ 3 revealed suspects at all times (80, 60, 40 guarantee 3).
- 20-minute effect: Alice's location ∈ revealed locations (70, 50, 35 guarantee 3).
- 10-C: draws from top until non-culprit; terminates (≥ 2 distinct suspects exist).
- Clock: pause/resume/reconnect keep remaining within ±250 ms across devices (simulated drift).
- Effects: coin flip logged once; lock/unlock windows correct (20-C 2 min; 10-C at 2:00; 10-B tails).

### 16.2 Integration tests
- 3, 4, 5 simulated players complete a full session in Full Digital and in Aids mode.
- Mixed mode: clue Physical + suspects Digital + chat external.
- Reconnect, Host handover, player leaves (redistribute cards).
- Offline: local relay, manual clock, no YouTube.

### 16.3 Content tests
`validate_content.py` passes: 72 cards; 31 clue cards (1 + 3×10); both languages present in all strings; every `effects` type is known to the engine.

### 16.4 Manual acceptance (on real phones)
1. Full Digital, 4 players, internet, sound device = tablet: complete game incl. all safety tools; voicemails play over the final song.
2. Chat + Aids, 4 players with real cards and WhatsApp: deal plan, registration, 30/20 draws, 10-card handoff.
3. Local mode, no internet: full session.

---

## 17. Milestones

| M | Deliverable | Done when |
|---|---|---|
| M0 | `engine` + content pack + tests | §16.1 and §16.3 pass |
| M1 | App shell, i18n, lobby, settings, table view, clock + video sync (online) | Two phones + tablet share one clock |
| M2 | Setup flow (safety → clue deal) Digital | A full setup in < 15 min with 4 testers |
| M3 | Play: clue flips, effects, chat, safety buttons | A 90-minute playtest completes |
| M4 | Voicemails + debrief | Playback over the final song |
| M5 | Chat + Game Aids (deal plan, registration, mixed sources) | Acceptance 2 passes |
| M6 | Local relay + offline behaviours + encrypted pack | Acceptance 3 passes |
| M7 | Polish, accessibility, deploy to Cloudflare | Friends' test night |

---

## 18. Risks and open points

| Risk / question | Mitigation / owner |
|---|---|
| YouTube embedding disabled for this video, or ads | Test early (M1); manual clock fallback; optional local file |
| Plain-HTTP local relay blocks install/wake lock | Install PWA first from HTTPS; NoSleep fallback |
| WebRTC star on hotspots fails (mDNS/client isolation/iOS) | Stage B only after Stage A; relay is the supported path |
| Host sees hidden info (local mode) | Accepted for friends; UI never shows it |
| English translation quality | Flagged unofficial; review pass by the owner before the friends' night |
| First-song timing (D9) | Not needed |
| Day of week | Default Saturday; owner may switch to Sunday |
| Poster stats duplicates (posters 01 and 08) | Kept as printed |
| Video content license | Played from the official YouTube video only |
| Copyright | Private use; encrypted pack; do not publish repo with `content/` or `assets/` |

**Open questions for the owner (answer when convenient):**
1. Do you want a **dark-room** look on the table tablet by default (low brightness)?
2. Should the Host see a **"story map"** (all revealed cards in order) for the facilitator role?
3. Preferred chat-log export format (TXT/PDF) at the end?


---

## Appendix A — Implementation status (v0.2)

**Implemented and tested** (see `tests/`): the whole rules engine (`src/shared`), all phases from lobby to debrief, both modes and per-component sources, clue dealing with the swap rule, every clue-card effect, physical-card registration, in-app chat with locks/X/Line/Veil/delete, Alice identity switch, clock model with video sync and manual fallback, table device, voicemail recording/playback, encrypted content pack, Cloudflare Worker + Durable Object, local Node relay, offline service worker, IT/EN UI.

**Deviations from the spec above**
| Spec | As built | Why |
|---|---|---|
| Svelte | **Preact** (+ signals) | Smaller, mature, easier to test in a simulated browser |
| Chat+Aids preset: voicemail Physical | Preset keeps voicemail **Digital** (switchable) | Recording on each phone is faster than passing one phone |
| Event-sourced log | Mutable authoritative state + short event log + `snapshot()` | Simpler; persistence via snapshot (session) + separate voicemail keys |
| Host handover | Not implemented (the same device reconnects to its seat) | Charlie is fixed to the host seat |

**Not implemented yet:** WebRTC serverless local mode (§12.3 Stage B), own-audio-file clock (§6.3.3), redistribution of a leaving player's clue cards (§8), "advanced per-draw override" (§2.2 rule 1; decks are digital or physical as a whole), Wake Lock fallback video for plain-http relay, chat-log export in PDF.

**Needs a real-device playtest:** YouTube embed behaviour (the player must stay visible; autoplay needs the Start tap), microphone formats on iOS (audio/mp4) and Android (audio/webm), vibration (Android only), Screen Wake Lock behaviour on each phone.
