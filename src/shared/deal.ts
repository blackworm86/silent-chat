import { rules } from './rules';
import { shuffle } from './rng';

/**
 * Deal the nine middle clue timestamps among the seats.
 * Constraints (rulebook): nobody holds two cards within `swapRuleMinutes` of each other
 * (Charlie's 90 counts); hand sizes differ by at most 1 (fallback 2).
 * Returns seat -> sorted timestamps (descending). Charlie's hand includes 90.
 */
export function dealClues(
  rngState: { rng: number }, seats: number[], charlieSeat: number
): Record<number, number[]> {
  const gap = rules.settings.swapRuleMinutes;
  const cards = [...rules.settings.dealtClueTimestamps].sort((a, b) => b - a);
  const ok = (hand: number[], c: number) => hand.every((x) => Math.abs(x - c) > gap);

  for (const maxSpread of [1, 2, 3]) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const hands: Record<number, number[]> = {};
      seats.forEach((s) => (hands[s] = []));
      hands[charlieSeat].push(90);
      let nodes = 0;
      const rec = (i: number): boolean => {
        if (++nodes > 4000) return false;
        if (i === cards.length) {
          const sizes = seats.map((s) => hands[s].length);
          return Math.max(...sizes) - Math.min(...sizes) <= maxSpread;
        }
        const c = cards[i];
        const order = shuffle(rngState, seats).sort((a, b) => hands[a].length - hands[b].length);
        for (const s of order) {
          if (!ok(hands[s], c)) continue;
          hands[s].push(c);
          if (rec(i + 1)) return true;
          hands[s].pop();
        }
        return false;
      };
      if (rec(0)) {
        seats.forEach((s) => hands[s].sort((a, b) => b - a));
        return hands;
      }
    }
  }
  throw new Error('deal impossible');
}
