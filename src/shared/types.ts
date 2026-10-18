// Shared types: session state, views, protocol. No game text lives here.
export type Phase =
  | 'lobby' | 'safety' | 'intro' | 'characters' | 'drives' | 'intros' | 'relations'
  | 'voicemail' | 'hunches' | 'deal' | 'rules' | 'ready' | 'play' | 'final'
  | 'playback' | 'debrief' | 'done';

export const PHASE_ORDER: Phase[] = [
  'lobby', 'safety', 'intro', 'characters', 'drives', 'intros', 'relations',
  'voicemail', 'hunches', 'deal', 'rules', 'ready', 'play', 'final', 'playback', 'debrief', 'done'
];

export type Src = 'digital' | 'physical';
export interface Sources {
  characters: Src; drives: Src; poster: Src; clues: Src;
  suspects: Src; locations: Src; search: Src; voicemail: Src;
  chat: 'app' | 'external';
}
export interface Settings {
  mode: 'digital' | 'aids' | 'custom';
  sources: Sources;
  /** always 'table' now (kept for old snapshots) */
  soundDevice: 'host' | 'table';
  dayOfWeek: 'saturday' | 'sunday';
  includeBodyEnding: boolean;
  showSecretsWhileChoosing: boolean;
  videoOffsetSec: number; // video position that corresponds to 90:00
}

export interface CardRef { id: string; copy: number }
export interface DeckState { remaining: CardRef[]; revealed: CardRef[] }
export type DeckKey = 'suspect' | 'location';

export interface Lock { until: number | null; reason: 'mute' | 'captured' | 'tails'; stateReportUsed: boolean }

export interface Player {
  seat: number; deviceId: string; name: string; isHost: boolean; connected: boolean;
  characterId: string | null; driveId: string | null;
  consent: boolean; introDone: boolean; hunchDone: boolean; ready: boolean;
  identity: 'self' | 'alice';
  lock: Lock | null;
  relations: [number | null, number | null];
  vm: boolean;
  nudgedAt: number | null;
}

export interface CoinState { idx: number; result: 'heads' | 'tails' | null; at: number | null; pending: boolean }

export interface ClueRun {
  ts: number;
  holder: number | null;
  status: 'locked' | 'unlocked' | 'flipped';
  variant: string | null;         // 'A' | 'B' | 'C' | null
  clueId: string | null;
  unlockedAt: number | null;
  flippedAt: number | null;
  delayEndsAt: number | null;
  delayDone: boolean;
  pendingDraw: DeckKey | null;
  pendingPick: 'culprit' | 'aliceLocation' | 'accomplice' | null;
  drawn: CardRef | null;
  needsTarget: 'ten' | 'ooc' | null;
  target: number | null;
  oocDue: boolean;
  coins: CoinState[];
}

export interface TimerEntry { ts: number; idx: number; atMs: number; done: boolean }

export interface ChatMsg {
  id: number; at: number;
  kind: 'msg' | 'system' | 'safety';
  from: number | null;
  as: string | null;               // character id or 'alice' for display
  to: 'group' | number;
  text: string; ooc: boolean; deleted: boolean;
  code?: string; params?: Record<string, unknown>;
  safety?: 'x' | 'line' | 'veil';
  replyTo?: number;
}

export interface SafetyItem { id: number; kind: 'line' | 'veil'; text: string; by: number | null; at: number }

export interface Results {
  culprit: CardRef | null; aliceLocation: CardRef | null; accomplice: CardRef | null; aliceCar: boolean;
}

export interface Clock {
  running: boolean; startedAt: number; pausedRemainingMs: number | null;
  source: 'video' | 'manual'; lengthMs: number;
}

export interface Session {
  code: string; createdAt: number; rev: number; rng: number;
  phase: Phase; settings: Settings;
  players: Player[];
  tableDeviceId: string | null;
  posterIndex: number | null;
  turn: { kind: 'intros' | 'hunches'; order: number[]; idx: number } | null;
  decks: { suspect: DeckState; location: DeckState; search: { remaining: string[]; drawn: { seat: number; id: string; at: number }[] } };
  discard: CardRef[];
  clues: ClueRun[];
  timers: TimerEntry[];
  results: Results;
  clock: Clock;
  lightsOut: { active: boolean; by: number | null };
  safety: { items: SafetyItem[]; xCount: number };
  chat: ChatMsg[];
  nextId: number;
  log: { at: number; code: string; params?: Record<string, unknown> }[];
}

// ---------- View (what a device receives) ----------
export interface PublicPlayer {
  seat: number; name: string; isHost: boolean; connected: boolean;
  characterId: string | null; consent: boolean; introDone: boolean; hunchDone: boolean; ready: boolean;
  identity: 'self' | 'alice'; locked: boolean; vm: boolean;
  relations: [number | null, number | null];
}
export interface HandView {
  ts: number; status: ClueRun['status']; variant: string | null; clueId: string | null;
  delayEndsAt: number | null; delayDone: boolean;
  pendingDraw: DeckKey | null; pendingPick: ClueRun['pendingPick'];
  drawn: CardRef | null; needsTarget: ClueRun['needsTarget']; target: number | null;
  oocDue: boolean; coins: CoinState[]; isTenHeld: boolean;
}
export interface View {
  code: string; rev: number; phase: Phase; settings: Settings;
  me: { seat: number | null; role: 'player' | 'table'; isHost: boolean; isSound: boolean };
  hostSeat: number; tableConnected: boolean;
  players: PublicPlayer[];
  posterIndex: number | null;
  myDriveId: string | null;
  relationsToMe: { from: number; line: 0 | 1; driveId: string }[];
  availableCharacters: string[];
  turn: { kind: 'intros' | 'hunches'; order: number[]; idx: number } | null;
  clock: Clock;
  hands: HandView[];
  plan: { seat: number; ts: number }[] | null;      // only when clues are physical
  centre: { ts: number; held: boolean } | null;
  flipped: { ts: number; holder: number | null; variant: string | null }[];
  decks: { suspect: { remaining: number; revealed: CardRef[] }; location: { remaining: number; revealed: CardRef[] }; searchRemaining: number };
  mySearch: { id: string; at: number }[];
  results: Results;
  lightsOut: { active: boolean; by: number | null };
  safety: { items: SafetyItem[]; xCount: number };
  myLock: Lock | null;
  log: Session['log'];
  hostExtra: { missed: number[] } | null;
  /** clue schedule with holders (no card text): the table's reminders and the facilitator's overview */
  timeline: { ts: number; holder: number | null; status: ClueRun['status'] }[] | null;
}

// ---------- Protocol ----------
export interface Hello { t: 'hello'; room: string; deviceId: string; role: 'player' | 'table'; create?: boolean; name?: string }
export type Intent = { type: string } & Record<string, any>;
export type ClientMsg =
  | Hello
  | { t: 'ping'; c: number }
  | { t: 'do'; a: Intent }
  | { t: 'typing'; to: 'group' | number };
export type ServerMsg =
  | { t: 'welcome'; seat: number | null; role: 'player' | 'table'; isHost: boolean; now: number }
  | { t: 'view'; v: View }
  | { t: 'chat'; m: ChatMsg }
  | { t: 'chatUpdate'; m: ChatMsg }
  | { t: 'chatHistory'; ms: ChatMsg[] }
  | { t: 'pong'; c: number; s: number }
  | { t: 'err'; code: string; msg?: string }
  | { t: 'toast'; code: string; params?: Record<string, unknown> }
  | { t: 'typing'; from: number; to: 'group' | number }
  | { t: 'nudge'; ts?: number }
  | { t: 'vms'; items: { seat: number; mime: string; b64: string }[] };

export interface IO {
  now(): number;
  send(deviceId: string, msg: ServerMsg): void;
  persist?(snapshot: string): void;
  persistVm?(seat: number, vm: { mime: string; b64: string }): void;
  /** The host deleted the room: the transport must drop it (and its stored data) after the goodbye messages are out. */
  destroy?(): void;
}
