import { describe, it, expect } from 'vitest';
import { dealClues } from '../src/shared/deal';

describe('dealClues', () => {
  for (const n of [3, 4, 5]) {
    it(`respects swap rule and balance with ${n} players (2000 seeds)`, () => {
      for (let seed = 1; seed <= 2000; seed++) {
        const st = { rng: seed * 7919 };
        const seats = Array.from({ length: n }, (_, i) => i);
        const hands = dealClues(st, seats, 0);
        const all = seats.flatMap((s) => hands[s]).sort((a, b) => b - a);
        expect(all).toEqual([90, 80, 70, 60, 50, 45, 40, 35, 30, 20]);
        expect(hands[0]).toContain(90);
        const sizes = seats.map((s) => hands[s].length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        for (const s of seats) {
          const h = hands[s];
          for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) expect(Math.abs(h[i] - h[j])).toBeGreaterThan(10);
        }
      }
    });
  }
});
