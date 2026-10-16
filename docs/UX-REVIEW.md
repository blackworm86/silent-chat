# Mobile usability review (2026-10-16)

Method: the built app ran on the local relay with a placeholder content pack (no real card text) and three simulated
players, each on a separate origin at 375×812 (iPhone-size), dark scheme. The full setup flow was walked from the host's
seat, plus the play screen. Findings are ranked by impact on a phone held in one hand, in a dim room, during a silent game.

## Critical — breaks the core loop

| # | Where | Finding | Fix |
|---|---|---|---|
| C1 | Play | Toasts are fixed at `top: 66px` and sit **exactly on top of the clock** — the one thing everyone needs during play. The "clue ready" toast and the "clue ready" banner also say the same thing twice. | Toasts move over the header; the clue-unlock toast is replaced by the in-place banner (vibration/beep kept). |
| C2 | Play / chat | The composer is in normal page flow under a thread capped at `52vh`. The page is 943 px tall on an 812 px screen, so the input is **below the fold**, and when the keyboard opens the page and the thread scroll separately. | Play screen becomes a fixed full-height column: header → thread (scrolls) → composer → tab bar. |
| C3 | Play | 4–5 top tabs + a clue banner + the clock stack up to ~260 px before any content. Tabs are at the top, far from the thumb. | Bottom tab bar with icons; clock lives in the header. |
| C4 | Safety | Line / Veil in chat use `window.prompt()`, and End game uses `window.confirm()`: on iOS standalone (installed PWA) these are ugly system boxes, and some in-app browsers block them. | In-app bottom sheets. |

## Major — slows people down or confuses

| # | Where | Finding | Fix |
|---|---|---|---|
| M1 | Lobby | The host's primary action ("Start setup") is at the very bottom of a ~2000 px page, under every advanced setting. Players see the same settings greyed out. | Settings collapse into one summary row that opens a sheet; the primary action is pinned in a bottom action bar on every setup screen. |
| M2 | All setup screens | "Next" and "Continue anyway" are two equal full-width buttons right next to each other, and "Continue anyway" (skipping players who are not done) looks as safe as "Next". | One primary button + a quiet text link for the override, with the reason it is disabled ("2/3 agreed"). |
| M3 | Lobby | Inviting means "Copy link" with **no feedback**, and there is no native Share (WhatsApp is how friends are actually invited). Two small QR codes side by side; the tablet QR is rarely needed. | Share button (`navigator.share`, copy fallback with "Copied"); one large player QR; tablet QR behind a toggle. |
| M4 | Join | A friend who opens the invite sees "What's your name?" with no game name, no placeholder, no keyboard focus. | Context line ("You're joining game J9GZ"), autofocus, enter-to-continue. |
| M5 | Home | Panels touch each other (no gap: `main` is not a stack). The code field's placeholder is letter-spaced into "C O D I C E  S T A N Z A". "Forget passphrase" is a full button at the same weight as the main actions. | Real spacing rhythm, normal placeholder, destructive/rare actions as text links. |
| M6 | Host | **No way to delete a game.** A room lives on in Firebase until the end screen; an abandoned room can only expire. | Host-only "Delete game" in the menu (with confirmation) and a "Your games" list on Home with Resume / Delete. Everyone connected sees "The host deleted this game". |
| M7 | Menu | Menu items are stacked full-width ghost buttons with emoji; the host's "Previous phase" sits next to "Leave", which is easy to mis-tap. | Grouped list rows with icons; host tools in their own section; dangerous actions in red at the end. |

## Minor — polish

- Emoji used as icons (🔑 🖥 ⚠ 🂠 🔦 …) render differently on every phone and carry no accessible name → SVG icons.
- Avatar circles get squeezed into ovals in flex rows (missing `flex-shrink: 0`).
- The "silent play" banner is pushed below the composer and cut off at the bottom of the screen → shown in the empty-chat state instead.
- Every block is a bordered card, and some cards sit inside other cards (character card inside a pick card) → flatter sections, using spacing to group.
- Body text is system-ui with no typographic hierarchy; uppercase micro-labels are the only structure.
- `theme-color` and the background don't match the safe-area notch on iOS standalone.
- Hit targets: OK (no control under 44 px found on the measured screens).
