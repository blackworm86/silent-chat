# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A small group of friends (3–5 players, one of them the host) playing the tabletop game *Alice Is Missing* together, each on their own smartphone, in the same room, usually in the dark. The game is played in silence: all communication is by text message. Players are in character, under time pressure (90 minutes), and cannot look away from the table for long.

The host is the owner of the physical game. They also run the session: they create the room, pick the mode, hold the clock and recover the game if something goes wrong. An optional shared tablet in the middle of the table shows the common state.

## Product Purpose

A private companion app for *Alice Is Missing* (Italian and English) that removes the game's paperwork so the group can stay inside the story: it deals and tracks the cards, keeps the 90-minute clock and the timed rules, delivers clues and reminders, and hosts the in-app group and private chats. It works in two modes: **Full Digital** and **Chat + Game Aids** (physical cards, in-app chat and tracking).

Success means a full session runs from lobby to debrief with nobody reading a rulebook, nobody losing the thread of the chat, and the phone never getting in the way of the fiction.

## Positioning

Not a general chat app and not a rules reference: a purpose-built table companion whose chat, clock and card tracking are tied to the game's rules. Messages carry in-character names, honour chat locks and the "out of character" convention, and the safety tools (X card, lines and veils) are always one tap away.

## Operating Context

- Phones in portrait, held one-handed, in a dim room, mostly in a silent game.
- The host's phone runs the game server in its browser (Firebase transport); if it closes or loses signal, the others wait and the game resumes from a saved snapshot when the same device returns.
- Optional local relay for a Wi-Fi network without internet.
- Hosting: GitHub Pages (static site) plus Firebase Realtime Database. Every push to `main` redeploys.
- The game text and posters are encrypted in `public/pack` and unlocked with a group passphrase the host types once; friends join through a QR code or link that carries the key.

## Capabilities and Constraints

- Full session flow: safety tools, intro and poster, characters, drives, introductions, relationships, voicemails, starting hunches, clue dealing, 90-minute game, final messages, voicemail playback, debrief.
- Chat: group and private conversations, quoted replies, deletion of one's own messages, "typing" indicator, in-character names, rule-driven chat locks.
- Safety: X card, lines and veils added at any time; lines and veils can be removed during the safety phase.
- Host tools: pause/resume the clock, set the clock to a given time, nudge players, reassign the ten, end or delete the game.
- UI in Italian and English; card text in Italian with an unofficial English translation, always labelled as such.
- Private use only: no public accounts, no analytics, no payments. The app code contains no game text.
- Phone screens must not need page scrolling during play; the phone keyboard must stay open while chatting.
- Dark theme only.
- Undecided: sound source and video availability vary per session (host's device or shared tablet; video may be unavailable, in which case the clock runs manually).

## Brand Commitments

- Product name: **Silent Chat**, a companion to *Alice Is Missing*.
- Display face Fraunces, UI face Instrument Sans, self-hosted. Icons from lucide.
- The red **X** (safety card) keeps its distinct red and is always reachable.

## Evidence on Hand

- The full specification is in `docs/SPEC.md`; the first usability review is in `docs/UX-REVIEW.md`.
- The real card content, posters and soundtrack are private and kept out of the repository (`content/`, `assets/` are ignored). There are no testimonials, metrics, screenshots or press; none should be invented.
- Real-world feedback so far comes from the owner playing on Android phones.

## Product Principles

1. **The fiction comes first.** Every screen either serves the story or gets out of the way; no screen should pull players out of character for long.
2. **The chat is the game.** Reading and writing messages on a phone must feel as immediate as a messaging app: keyboard open, grouped messages, quick replies.
3. **One screen, no hunting.** On a phone during play nothing should require scrolling the page or finding a hidden control; safety and clock are always visible or one tap away.
4. **Never lose the game.** The host's session must survive reloads, locked phones and bad Wi-Fi, including voicemails and the clock.
5. **Safety is always one tap.** The X card, lines and veils are quiet but never more than a tap away, and nothing in the UI shames their use.

## Accessibility & Inclusion

- Dark room use: text contrast of at least WCAG AA (4.5:1 for body text), touch targets of at least 44 px.
- Keyboard and screen-reader access for message actions and dialogs.
- Honour the system "reduce motion" setting.
- Bilingual: layouts must survive Italian and English text lengths.

---

*Written from the repository, `docs/SPEC.md` and the owner's feedback during development; confirmed by the owner (platform: web). Items under "Undecided" are open.*
