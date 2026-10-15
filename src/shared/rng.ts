// Small seeded PRNG (mulberry32) whose state lives in the session, so it survives persistence.
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function randInt(state: { rng: number }, n: number): number {
  return Math.floor(nextRandom(state) * n);
}
export function shuffle<T>(state: { rng: number }, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
