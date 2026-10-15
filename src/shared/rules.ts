import rulesJson from './rules.generated.json';

export interface Effect { type: string; [k: string]: any }
export interface ClueRule {
  id: string; timestamp: number; variant: string | null;
  sensitive: boolean; removableByFacilitator: boolean; effects: Effect[];
}
export interface Rules {
  settings: { gameLengthMinutes: number; clueSchedule: number[]; dealtClueTimestamps: number[]; swapRuleMinutes: number; videoId: string };
  characters: { id: string; facilitator: boolean }[];
  drives: { id: string }[];
  locations: { id: string; copies: number }[];
  suspects: { id: string; copies: number }[];
  searchCards: { id: string }[];
  posterCount: number;
  clueCards: ClueRule[];
}
export const rules = rulesJson as unknown as Rules;
export const clueById = new Map(rules.clueCards.map((c) => [c.id, c]));
export const cluesAt = (ts: number) => rules.clueCards.filter((c) => c.timestamp === ts);

/** "15:00" -> milliseconds remaining at which the effect triggers */
export function clockToMs(clock: string): number {
  const [m, s] = clock.split(':').map(Number);
  return (m * 60 + (s || 0)) * 1000;
}
