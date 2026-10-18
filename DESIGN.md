---
name: Silent Chat
description: A phone screen in a dark room — cool ink surfaces, one warm lamp accent, blue for your own words, red only for safety.
colors:
  ink-0: "oklch(0.145 0.012 255)"
  ink-1: "oklch(0.185 0.014 255)"
  ink-2: "oklch(0.225 0.016 255)"
  ink-3: "oklch(0.285 0.018 255)"
  hairline: "oklch(0.34 0.02 255 / 0.5)"
  text: "oklch(0.955 0.008 255)"
  text-muted: "oklch(0.78 0.018 255)"
  text-faint: "oklch(0.63 0.02 255)"
  lamp: "oklch(0.84 0.135 78)"
  lamp-ink: "oklch(0.24 0.05 70)"
  lamp-soft: "oklch(0.84 0.135 78 / 0.11)"
  lamp-line: "oklch(0.84 0.135 78 / 0.35)"
  mine: "oklch(0.52 0.15 258)"
  danger: "oklch(0.69 0.185 25)"
  danger-ink: "oklch(0.22 0.06 25)"
  danger-soft: "oklch(0.69 0.185 25 / 0.13)"
  ok: "oklch(0.78 0.12 162)"
typography:
  display:
    fontFamily: "Fraunces Variable, ui-serif, Georgia, serif"
    fontSize: "34px"
    fontWeight: 560
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Fraunces Variable, ui-serif, Georgia, serif"
    fontSize: "26px"
    fontWeight: 560
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Instrument Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 620
    lineHeight: 1.3
  body:
    fontFamily: "Instrument Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Instrument Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
rounded:
  s: "10px"
  m: "14px"
  l: "22px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  button-primary:
    backgroundColor: "{colors.lamp}"
    textColor: "{colors.lamp-ink}"
    rounded: "{rounded.m}"
    height: "52px"
    padding: "0 24px"
  button-ghost:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.m}"
    height: "52px"
    padding: "0 24px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.m}"
    height: "52px"
  chip:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 16px"
  chip-selected:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ink-0}"
  input:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.m}"
    height: "52px"
    padding: "0 16px"
  panel:
    backgroundColor: "{colors.ink-1}"
    rounded: "{rounded.l}"
    padding: "16px"
  bubble-mine:
    backgroundColor: "{colors.mine}"
    textColor: "#ffffff"
    rounded: "18px"
    padding: "8px 12px"
  bubble-theirs:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.text}"
    rounded: "18px"
    padding: "8px 12px"
---

# Design System: Silent Chat

## Overview

**Creative North Star: "The Lamp in the Dark Room"**

Silent Chat is used on a phone, in a dim room, in near silence, by people who are in character and cannot look away from the table for long. The interface is a dark screen with cool ink-blue neutrals that recede, and a single warm lamp-gold accent that appears only where something wants attention: the primary action, a clue that has just unlocked, the player whose turn it is. The mood and the colour roles come from the project's own stylesheet header ("a phone screen in a dark room"); the name for it is ours, so confirm it.

Density is moderate and calm. Screens are built to fit one phone screen without page scrolling, so structure comes from grouping and spacing rather than from boxes inside boxes. Display type is a literary serif (Fraunces) for names and phase titles, which carries the tone of a mystery; everything functional is a clean humanist sans (Instrument Sans). The chat follows the conventions of a messaging app (blue bubbles on the right for you, grey on the left for others, grouped messages, quoted replies) because players already know how to read it.

**Key Characteristics:**
- Dark only (`color-scheme: dark`); no light theme.
- One accent colour, used sparingly. Blue means "me". Red means safety or destruction. Green means "online" or "done".
- Tonal layering instead of shadows: surfaces step up in lightness (`ink-0` → `ink-3`).
- Large touch targets (44–52 px), generous rounding, one-handed use.
- Serif for voice, sans for function.

## Colors

A cool, low-chroma ink scale for surfaces, one warm lamp accent, and three semantic hues.

### Primary
- **Lamp Gold** (`oklch(0.84 0.135 78)`): the only accent. Primary buttons, links, the focus ring, text selection, the current speaker or turn, clue banners. Its tinted forms are `lamp-soft` (11% fill, for amber panels) and `lamp-line` (35% outline). Text on it is **Lamp Ink** (`oklch(0.24 0.05 70)`).

### Secondary
- **Message Blue** (`oklch(0.52 0.15 258)`): your own chat bubbles only, with white text (contrast above 4.5:1). Never used for actions.

### Tertiary
- **Alarm Red** (`oklch(0.69 0.185 25)`): the X card, lines, destructive actions and warnings. Paired with `danger-ink` for text on solid red and `danger-soft` (13%) for tinted backgrounds.
- **Online Green** (`oklch(0.78 0.12 162)`): connected dots, completed steps.

### Neutral
- **Ink 0** (`oklch(0.145 0.012 255)`): the page background and the play screen.
- **Ink 1** (`oklch(0.185 0.014 255)`): panels, lists, cards, the tab bar and bottom sheets.
- **Ink 2** (`oklch(0.225 0.016 255)`): inputs, ghost buttons, chips, other players' bubbles, controls on a panel.
- **Ink 3** (`oklch(0.285 0.018 255)`): the strongest quiet surface, disabled borders, underline colour.
- **Hairline** (`oklch(0.34 0.02 255 / 0.5)`): dividers and input outlines.
- **Text / Muted / Faint** (`oklch(0.955 / 0.78 / 0.63)`): primary, secondary and tertiary text. Faint is for metadata only; it must not carry essential information at small sizes.

### Named Rules
**The One Lamp Rule.** The gold accent marks the single thing to act on or look at. If two things on a screen are gold, one of them is wrong.

**The Blue Is Me Rule.** Blue never leaves the chat. It belongs to the author's own messages.

**The Red Is Safety Rule.** Red is reserved for the X card, lines, warnings and destructive actions. It is never decoration, and the X button is always red.

## Typography

**Display Font:** Fraunces Variable (fallback `ui-serif, Georgia, serif`)
**Body Font:** Instrument Sans Variable (fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`)

**Character:** A bookish serif for names and moments, a neutral sans for everything you tap. Both are self-hosted.

### Hierarchy
- **Display** (560, 34–40 px, 1.12): home title; scaled down to fit narrow phones.
- **Headline** (560, 26 px, 1.12): phase and card headings, sheet titles.
- **Title** (620, 18 px, 1.3): list-row and item titles in the sans.
- **Body** (400, 16 px, 1.5): everything else. Chat text is 16 px. Keep line length short on phones; wrap with `text-wrap: pretty`.
- **Label** (600, 13 px, 1.45): section labels in Faint. Small text is 14 px; the minimum for readable metadata is 12 px.

Numbers that change (clock, counts, room code) use tabular numerals.

### Named Rules
**The Serif Is a Voice Rule.** Fraunces is for names and titles only, never for buttons, labels or chat messages.

## Layout

Mobile-first, single column, maximum content width about 560 px, centred. The play screen is a fixed full-height column: clock header, content, bottom tab bar. Setup screens use a sticky top bar and a pinned action bar at the bottom with a primary action and a status line. The goal is that no phase needs the page to scroll on a 360×740 phone; longer content is folded (tabs, expandable rows, horizontal strips) rather than stacked.

Spacing follows a 4-based scale: 4, 8, 12, 16, 24, 32, 48. Group related items with 8–12 px, separate groups with 16–24 px. Safe-area insets are respected at top and bottom. While the keyboard is open in the chat, the tab bar, clue banner and progress timeline are hidden to give the thread room.

On a tablet in landscape (the shared table device) the layout becomes a grid with the clock and sound on the left and table cards on the right, with larger type.

## Elevation & Depth

Flat by default. Depth is conveyed by tonal layering (`ink-0` page, `ink-1` panel, `ink-2` control on a panel), not by shadows. The few shadows are functional: a soft drop under toasts and context menus (`0 10px 30px` at 50–55% black) and an upward shadow under the sound dock sheet. The top bar uses a translucent ink background with a backdrop blur so content passing under it stays legible.

### Named Rules
**The Tone Not Shadow Rule.** Raise a surface by making it lighter, not by adding a shadow. Shadows are for things that float over content (toasts, menus, sheets).

## Shapes

Generously rounded, never sharp. Radii: 10 px (small controls), 14 px (buttons, inputs), 22 px (panels, lists, cards), full pill (chips, the language switch, tags, avatars). Chat bubbles use 18 px, with the corner next to the sender flattened to 5 px when messages are grouped. Avatars are circles. Selected or current items are marked with a 2 px lamp-gold ring or a lamp-tinted fill, not a thick side border.

## Components

### Buttons
- **Shape:** 14 px radius, 52 px tall (44 px for the small variant at 10 px radius), full width by default.
- **Primary:** Lamp Gold fill, Lamp Ink text, weight 620. Disabled becomes a neutral Ink 2 with Faint text, not a faded gold.
- **Ghost:** Ink 2 fill, Text colour. **Outline:** transparent with a 1 px Ink 3 ring. **Danger:** Alarm Red fill; **danger-ghost** uses the 13% red tint.
- **Press:** scale to 0.98 on press. **Focus:** 2 px lamp outline with 3 px offset.

### Chips and segmented controls
- Chips are pills, 44 px tall, Ink 2; the selected chip inverts to Text on Ink 0. The compact variants (36–38 px visible) get an invisible 44 px touch area so the page does not grow.
- Segmented controls are an Ink 2 track with a 14 px radius; the selected segment is Text-coloured with Ink 0 text.

### Cards, panels and lists
- Panels use Ink 1, 22 px radius, 16 px padding. An "amber" panel uses the lamp-soft fill with a 1 px lamp-line ring, for the content the group should read first.
- Lists are one Ink 1 block with 56 px rows and hairline separators; rows can hold an icon or avatar, a title and subtitle, and an end element.

### Inputs / Fields
- Ink 2 fill, 14 px radius, a 1 px hairline ring, 16 px text (16 px prevents zoom on iOS). Focus swaps the ring for a 2 px lamp ring. The chat field is a rounded multi-line textarea that grows up to four lines, with the send button beside it; Enter sends, Shift+Enter makes a new line.

### Navigation
- Setup screens: a sticky top bar with the phase title in Fraunces, the room code in Faint, the X button and the menu.
- Play screen: a bottom tab bar (Chat, Cards, Table, Notes, plus Audio for the sound device), icon above label at 12 px, with a lamp-gold bar over the active tab and a numbered badge for unread or ready items.

### Chat bubbles
- Mine: Message Blue, white text, right-aligned. Theirs: Ink 2, left-aligned, with the sender name in Faint above the first message of a run and an avatar beside the last. Out-of-character messages are italic and dimmed. Replies show a quoted box with a 3 px lamp-gold left rule, the sender in gold and two lines of the quoted text. System events are small centred pills; safety events are red-tinted pills.
- Long press, right click or Enter on a bubble opens a small menu (Reply and Delete for your own messages; Reply and Private message for others').

### Sheets and dialogs
- Bottom sheets with a grab handle, 22 px top radius, Ink 1, a dimmed backdrop, focus kept inside, Esc to close. Context menus are small Ink 2 floating lists at 48 px per row.

### Safety button (signature component)
- The red **X** is a circle of Alarm Red with a bold X, 44 px, in the top bar on setup screens and beside the chat field in play. It is the only solid red element permanently on screen.

## Do's and Don'ts

### Do:
- **Do** keep a screen to one gold element: the single action or focus the player should take next.
- **Do** keep the page from scrolling on a phone: fold, tab or strip content instead of stacking it.
- **Do** keep touch targets at 44 px or more; enlarge invisibly (a pseudo-element) rather than adding height.
- **Do** keep body text at or above 4.5:1 contrast on its surface; check Faint text before using it for anything important.
- **Do** keep the X button visible and red on every screen that is part of the game.
- **Do** keep copy ready for both Italian and English text lengths.
- **Do** respect reduced motion: replace movement with a short fade.

### Don't:
- **Don't** use a light theme or pure black and white; surfaces stay on the ink-blue scale.
- **Don't** use gold for decoration, or blue/red/green for anything other than their roles.
- **Don't** add thick one-sided coloured borders to cards, list rows or callouts, and don't nest cards in cards. (The thin quote rule in a chat reply is the single, deliberate exception.)
- **Don't** use emoji or Unicode symbols as icons; use the lucide set.
- **Don't** use shadows to raise ordinary surfaces.
- **Don't** put the serif on buttons, labels or message text.
- **Don't** hide or move the safety controls to make room for other content.

---

*Extracted from `src/client/styles.css`, the components in `src/client/ui/` and rendered screens on a 360×740 and 390×844 phone. The Creative North Star, the named rules and the Do's and Don'ts are inferred from that code and from the owner's feedback, not confirmed in an interview. The `.impeccable/design.json` sidecar was generated on refresh.*
