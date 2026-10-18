import { describe, it, expect } from 'vitest';
import { Harness, setupToReady } from './harness';
import { rules } from '../src/shared/rules';

function startPlay(h: Harness) {
  h.do('p0', { type: 'startGame', source: 'manual' });
  expect(h.v('p0').phase).toBe('play');
}
const allHands = (h: Harness, ids: string[]) => ids.flatMap((id) => h.v(id).hands.map((x) => ({ id, ...x })));

describe('room setup', () => {
  it('needs 3 players and gates phases', () => {
    const h = new Harness();
    h.join('p0', { create: true }); h.join('p1');
    h.do('p0', { type: 'next' });
    expect(h.err('p0')).toContain('min_players');
    h.join('p2');
    h.do('p0', { type: 'next' });
    expect(h.v('p0').phase).toBe('safety');
    h.do('p0', { type: 'next' });
    expect(h.err('p0')).toContain('consent');
  });
  it('rejects unknown rooms and late joiners', () => {
    const h = new Harness();
    h.join('x', { create: false });
    expect(h.inbox.get('x')![0]).toMatchObject({ t: 'err', code: 'no_room' });
    const h2 = new Harness();
    setupToReady(h2, 3);
    h2.join('late');
    expect(h2.inbox.get('late')![0]).toMatchObject({ t: 'err', code: 'started' });
  });
  it('runs the full digital setup to ready', () => {
    const h = new Harness();
    const ids = setupToReady(h, 4);
    const v = h.v('p0');
    expect(v.phase).toBe('ready');
    expect(v.posterIndex).not.toBeNull();
    expect(new Set(ids.map((i) => h.v(i).myDriveId)).size).toBe(4);
    const chars = v.players.map((p) => p.characterId!);
    expect(chars[0]).toBe('charlie');
    expect(new Set(chars).size).toBe(4);
    const hands = allHands(h, ids);
    expect(hands.length).toBe(10);                    // 9 dealt + 90 (the 10 is in the centre)
    expect(hands.filter((x) => x.ts === 90)[0].id).toBe('p0');
    expect(hands.every((x) => x.variant === null)).toBe(true); // hidden until unlocked
    expect(v.centre).toEqual({ ts: 10, held: false });
  });
});

describe('play', () => {
  it('unlocks clues on time and executes effects (digital)', () => {
    const h = new Harness();
    const ids = setupToReady(h, 4);
    startPlay(h);
    // 90 unlocked immediately for Charlie
    expect(h.v('p0').hands.find((x) => x.ts === 90)!.status).toBe('unlocked');
    h.do('p0', { type: 'flipClue', ts: 90 });
    expect(h.v('p0').hands.find((x) => x.ts === 90)!.clueId).toBe('clue_90');
    // run to 80:00
    h.advance(10 * 60 * 1000);
    const holder80 = ids.find((i) => h.v(i).hands.some((x) => x.ts === 80))!;
    expect(h.v(holder80).hands.find((x) => x.ts === 80)!.status).toBe('unlocked');
    h.do(holder80, { type: 'flipClue', ts: 80 });
    expect(h.v(holder80).hands.find((x) => x.ts === 80)!.drawn).not.toBeNull();
    expect(h.v('p0').decks.suspect.revealed.length).toBe(1);
    // non-holder cannot flip
    const other = ids.find((i) => i !== holder80)!;
    h.do(other, { type: 'flipClue', ts: 80 });
    expect(h.err(other)).toBeTruthy();
  });

  it('plays a whole 90-minute game: culprit, Alice location, ten card, coin, locks, final', () => {
    const h = new Harness();
    const ids = setupToReady(h, 4);
    startPlay(h);
    const flipAt = (minRemaining: number) => {
      const elapsed = (90 - minRemaining) * 60 * 1000;
      const cur = 90 * 60000 - (h.room.remaining(h.t));
      if (elapsed > cur) h.advance(elapsed - cur);
      const run = h.room.s!.clues.find((r) => r.ts === minRemaining)!;
      if (run.holder !== null) h.do(ids[run.holder], { type: 'flipClue', ts: minRemaining });
      return run;
    };
    flipAt(90);
    [80, 70, 60, 50, 45, 40, 35].forEach((m) => {
      const run = flipAt(m);
      const c = rules.clueCards.find((x) => x.id === run.clueId)!;
      if (c.effects.some((e) => e.type === 'delay')) h.advance(2 * 60000 + 1000);
    });
    const s = h.room.s!;
    expect(s.decks.suspect.revealed.length).toBeGreaterThanOrEqual(3);
    expect(s.decks.location.revealed.length).toBeGreaterThanOrEqual(3);
    // lights out card may have been drawn at 45: end it
    if (s.lightsOut.active) h.do(ids[s.lightsOut.by!], { type: 'endLights' });
    // 30: culprit
    const revealedBefore = s.decks.suspect.revealed.map((r) => r.id + r.copy);
    const r30 = flipAt(30);
    expect(s.results.culprit).not.toBeNull();
    expect(revealedBefore).toContain(s.results.culprit!.id + s.results.culprit!.copy);
    expect(s.decks.suspect.revealed).toHaveLength(1);
    // 20: Alice location + choose who gets the 10 card
    const r20 = flipAt(20);
    expect(s.results.aliceLocation).not.toBeNull();
    expect(r20.needsTarget).toBe('ten');
    h.do(ids[r20.holder!], { type: 'chooseTarget', ts: 20, target: 2 });
    expect(s.clues.find((r) => r.ts === 10)!.holder).toBe(2);
    // coin at 15:00 for 30-A / 30-C is handled by the timer
    h.advance(6 * 60000);   // now ~ 14 min remaining
    // 10 minutes
    const r10 = flipAt(10);
    const c10 = rules.clueCards.find((x) => x.id === r10.clueId)!;
    expect(r10.holder).toBe(2);
    expect(r10.status).toBe('flipped');
    // run the remaining time
    h.advance(11 * 60000);
    expect(s.phase).toBe('final');
    // 10-C draws the accomplice at 8:00 and captures at 2:00
    if (c10.id === 'clue_10_c') {
      expect(s.results.accomplice).not.toBeNull();
      expect(s.results.accomplice!.id).not.toBe(s.results.culprit!.id);
      expect(s.players[2].lock?.reason).toBe('captured');
    }
    if (c10.id === 'clue_10_a') expect(s.players[2].identity).toBe('alice');
    // flow to the end
    h.do('p0', { type: 'next' }); expect(s.phase).toBe('playback');
    h.do('p0', { type: 'getVoicemails' });
    const vms = h.inbox.get('p0')!.filter((m) => m.t === 'vms');
    expect(vms.length).toBe(1);
    h.do('p0', { type: 'next' }); expect(s.phase).toBe('debrief');
  });

  it('enforces lock, X card, OOC and deletion in chat', () => {
    const h = new Harness();
    const ids = setupToReady(h, 3);
    startPlay(h);
    h.do('p1', { type: 'chat', to: 'group', text: 'hello' });
    expect(h.chats('p0').some((m) => m.text === 'hello')).toBe(true);
    h.do('p1', { type: 'chat', to: 2, text: 'psst' });
    expect(h.chats('p2').some((m) => m.text === 'psst')).toBe(true);
    expect(h.chats('p0').some((m) => m.text === 'psst')).toBe(false); // DMs are private
    h.do('p1', { type: 'chat', to: 'group', text: '(X: spiders)' });
    expect(h.room.s!.safety.xCount).toBe(1);
    h.do('p1', { type: 'chat', to: 'group', text: '(Line: gore)' });
    expect(h.room.s!.safety.items.some((i) => i.kind === 'line' && i.text === 'gore')).toBe(true);
    const mid = h.room.s!.chat.find((m) => m.text === 'hello')!.id;
    h.do('p2', { type: 'chatDelete', id: mid });
    expect(h.err('p2')).toBe('not_author');
    h.do('p1', { type: 'chatDelete', id: mid });
    expect(h.room.s!.chat.find((m) => m.id === mid)!.deleted).toBe(true);
    // lock
    h.room.s!.players[1].lock = { until: null, reason: 'captured', stateReportUsed: false };
    h.do('p1', { type: 'chat', to: 'group', text: 'let me out' });
    expect(h.err('p1')).toBe('locked');
    h.do('p1', { type: 'chat', to: 'group', text: '(still here, out of character)' });
    expect(h.room.s!.chat.some((m) => m.text.startsWith('(still here'))).toBe(true);
  });

  it('clock pauses, resumes and nudges', () => {
    const h = new Harness();
    setupToReady(h, 3);
    startPlay(h);
    h.advance(60000);
    expect(h.room.remaining()).toBeCloseTo(89 * 60000, -3);
    h.do('p0', { type: 'pauseClock' });
    h.advance(30000);
    expect(h.room.remaining()).toBeCloseTo(89 * 60000, -3);
    h.do('p0', { type: 'resumeClock' });
    h.advance(1000);
    expect(h.room.remaining()).toBeCloseTo(89 * 60000 - 1000, -3);
    h.do('p0', { type: 'nudgeClock', ms: 5000 });
    expect(h.room.remaining()).toBeCloseTo(89 * 60000 - 6000, -3);
    h.do('p1', { type: 'pauseClock' });
    expect(h.err('p1')).toBe('host_only');
  });

  it('the table runs the clock: start, pause, resume; the video never moves it', () => {
    const h = new Harness();
    setupToReady(h, 3);
    expect(h.v('tbl').me.isSound).toBe(true);
    expect(h.v('p0').me.isSound).toBe(false);
    h.do('p1', { type: 'startGame', source: 'manual' });
    expect(h.err('p1')).toBe('not_sound_device');
    h.do('tbl', { type: 'startGame', source: 'video' });
    expect(h.v('p0').phase).toBe('play');
    h.advance(10000);
    h.do('tbl', { type: 'reportVideo', sec: 25, playing: true });   // the video follows the clock, not the other way
    expect(h.room.remaining()).toBeCloseTo(90 * 60000 - 10000, -3);
    h.do('tbl', { type: 'pauseClock' });
    expect(h.room.s!.clock.running).toBe(false);
    h.do('p1', { type: 'resumeClock' });                             // a plain player cannot
    expect(h.room.s!.clock.running).toBe(false);
    h.do('p0', { type: 'resumeClock' });                             // the facilitator can
    expect(h.room.s!.clock.running).toBe(true);
    expect(h.v('tbl').timeline?.length).toBeGreaterThan(5);           // the table gets the clue timeline
    expect(h.v('p1').timeline).toBeNull();
  });
});

describe('table and facilitator', () => {
  it('only the table opens a room; the table picks the facilitator in the lobby', () => {
    const h = new Harness();
    h.room.open('x', { t: 'hello', room: 'TEST', deviceId: 'x', role: 'player', create: true, name: 'x' });
    expect(h.inbox.get('x')![0]).toMatchObject({ t: 'err', code: 'no_room' });
    h.join('tbl', { role: 'table', create: true });
    ['a', 'b', 'c'].forEach((id) => h.join(id));
    expect(h.v('a').players.every((p) => !p.isHost && !p.characterId)).toBe(true);
    h.do('tbl', { type: 'next' });
    expect(h.err('tbl')).toBe('player_only');
    h.do('tbl', { type: 'setFacilitator', seat: 1 });
    expect(h.v('a').players[1]).toMatchObject({ isHost: true, characterId: 'charlie' });
    h.do('tbl', { type: 'setFacilitator', seat: 2 });                  // change of mind
    expect(h.v('a').players[1]).toMatchObject({ isHost: false, characterId: null });
    expect(h.v('c').me.isHost).toBe(true);
    h.do('c', { type: 'next' });
    expect(h.v('a').phase).toBe('safety');
    h.do('tbl', { type: 'setFacilitator', seat: 0 });
    expect(h.err('tbl')).toBe('too_late');
  });
  it('the lobby cannot start without a facilitator', () => {
    const h = new Harness();
    h.join('tbl', { role: 'table', create: true });
    ['a', 'b', 'c'].forEach((id) => h.join(id));
    h.do('a', { type: 'next' });
    expect(h.err('a')).toBe('host_only');
  });
  it('a table restart brings the clock back paused at the last save', () => {
    const h = new Harness();
    setupToReady(h, 3);
    h.do('tbl', { type: 'startGame', source: 'manual' });
    h.advance(60000);
    const snap = h.room.snapshot();
    h.t += 5 * 60000;                                                // the tablet is off for 5 minutes
    const r = (h.room.constructor as any).restore({ now: () => h.t, send: () => {} }, snap);
    expect(r.s.clock.running).toBe(false);
    expect(r.remaining()).toBeCloseTo(89 * 60000, -3);
  });
});

describe('host recovery clock', () => {
  it('sets the remaining time, running or paused, host only', () => {
    const h = new Harness();
    setupToReady(h, 4);
    h.do('p0', { type: 'startGame', source: 'manual' });
    h.do('p1', { type: 'setClock', remainingMs: 47 * 60000 });
    expect(h.err('p1')).toBeTruthy();
    h.do('p0', { type: 'setClock', remainingMs: 47 * 60000 + 30000 });
    const c = h.v('p1').clock;
    expect(c.running).toBe(true);
    expect(c.lengthMs - ((h as any).t - c.startedAt)).toBe(47 * 60000 + 30000);
    h.do('p0', { type: 'pauseClock' });
    h.do('p0', { type: 'setClock', remainingMs: 20 * 60000 });
    expect(h.v('p1').clock.pausedRemainingMs).toBe(20 * 60000);
  });
});

describe('lines and veils during setup', () => {
  it('can be removed in the safety phase by their author or the host, not by others, not later', () => {
    const h = new Harness();
    h.join('p0', { create: true, name: 'Host' }); h.join('p1'); h.join('p2');
    h.do('p0', { type: 'next' });
    h.do('p1', { type: 'addSafety', kind: 'line', text: 'spiders' });
    h.do('p1', { type: 'addSafety', kind: 'veil', text: 'gore' });
    const [a, b] = h.v('p0').safety.items;
    h.do('p2', { type: 'removeSafety', id: a.id });
    expect(h.err('p2')).toBe('not_author');
    h.do('p1', { type: 'removeSafety', id: a.id });
    h.do('p0', { type: 'removeSafety', id: b.id });
    expect(h.v('p2').safety.items).toHaveLength(0);
    h.do('p1', { type: 'addSafety', kind: 'line', text: 'dogs' });
    ['p0', 'p1', 'p2'].forEach((i) => h.do(i, { type: 'consent' }));
    h.do('p0', { type: 'next' });
    h.do('p1', { type: 'removeSafety', id: h.v('p1').safety.items[0].id });
    expect(h.err('p1')).toBe('not_now');
    expect(h.v('p1').safety.items).toHaveLength(1);
  });
});

describe('Chat + Game Aids (physical cards)', () => {
  it('uses a deal plan, registrations and manual coin/pick', () => {
    const h = new Harness();
    const ids = setupToReady(h, 4, { aids: true });
    const v = h.v('p0');
    expect(v.settings.sources.chat).toBe('app');
    expect(v.plan).not.toBeNull();
    expect(v.plan!.length).toBe(10);
    startPlay(h);
    h.do('p1', { type: 'chat', to: 'group', text: 'x' });
    expect(h.chats('p2').some((m) => m.text === 'x')).toBe(true);
    // physical flip needs the variant
    h.advance(10 * 60000);
    const holder = ids.find((i) => h.v(i).hands.some((x) => x.ts === 80))!;
    h.do(holder, { type: 'flipClue', ts: 80 });
    expect(h.err(holder)).toBe('need_variant');
    h.do(holder, { type: 'flipClue', ts: 80, variant: 'B' });
    let hand = h.v(holder).hands.find((x) => x.ts === 80)!;
    expect(hand.clueId).toBe('clue_80_b');
    expect(hand.pendingDraw).toBe('suspect');
    h.do(holder, { type: 'registerDraw', deck: 'suspect', id: 'sus_bria', forTs: 80 });
    hand = h.v(holder).hands.find((x) => x.ts === 80)!;
    expect(hand.pendingDraw).toBeNull();
    expect(hand.drawn!.id).toBe('sus_bria');
    expect([1, 2]).toContain(hand.drawn!.copy);      // which physical copy is arbitrary
    // third copy of a suspect is rejected
    h.do(holder, { type: 'registerDraw', deck: 'suspect', id: 'sus_bria' });   // 2nd copy ok
    expect(h.v(holder).decks.suspect.revealed.length).toBe(2);
    h.do(holder, { type: 'registerDraw', deck: 'suspect', id: 'sus_bria' });   // 3rd copy: does not exist
    expect(h.err(holder)).toBe('copies');
    expect(h.v(holder).decks.suspect.revealed.length).toBe(2);
    // undo one registration
    h.do(holder, { type: 'unregisterDraw', deck: 'suspect', index: 1 });
    expect(h.v(holder).decks.suspect.revealed.length).toBe(1);
    h.do(holder, { type: 'registerDraw', deck: 'suspect', id: 'sus_bria' });   // can be re-registered after undo
    expect(h.v(holder).decks.suspect.revealed.length).toBe(2);
  });
});


describe('stress: many random full games', () => {
  for (const n of [3, 4, 5]) {
    it(`completes 80 random ${n}-player digital games with invariants`, () => {
      for (let g = 0; g < 80; g++) {
        const h = new Harness();
        const ids = setupToReady(h, n);
        h.do('p0', { type: 'startGame', source: 'manual' });
        const s = h.room.s!;
        const at = (m: number) => { const target = (90 - m) * 60000; const cur = 90 * 60000 - h.room.remaining(); if (target > cur) h.advance(target - cur); };
        let culpritCandidates: string[] = [];
        for (const m of [90, 80, 70, 60, 50, 45, 40, 35, 30, 20]) {
          at(m);
          if (m === 30) culpritCandidates = s.decks.suspect.revealed.map((r) => r.id + r.copy);
          const run = s.clues.find((r) => r.ts === m)!;
          expect(run.status).toBe('unlocked');
          h.do(ids[run.holder!], { type: 'flipClue', ts: m });
          expect(h.err(ids[run.holder!]), `flip ${m}`).toBeNull();
          if (s.lightsOut.active) h.do(ids[s.lightsOut.by!], { type: 'endLights' });
          if (run.delayEndsAt) h.advance(121000);
          if (m === 20) {
            const target = Math.floor((g * 7) % n);
            h.do(ids[run.holder!], { type: 'chooseTarget', ts: 20, target });
            expect(s.clues.find((r) => r.ts === 10)!.holder).toBe(target);
          }
          if (m === 30) {
            expect(culpritCandidates).toContain(s.results.culprit!.id + s.results.culprit!.copy);
            const c = rules.clueCards.find((x) => x.id === run.clueId)!;
            if (c.id === 'clue_30_c') { const t = (run.holder! + 1) % n; h.do(ids[run.holder!], { type: 'chooseTarget', ts: 30, target: t }); }
          }
        }
        at(10);
        const ten = s.clues.find((r) => r.ts === 10)!;
        expect(ten.status).toBe('unlocked');
        h.do(ids[ten.holder!], { type: 'flipClue', ts: 10 });
        expect(s.results.aliceLocation).not.toBeNull();
        h.advance(10 * 60000 + 2000);
        expect(s.phase).toBe('final');
        // all timers fired
        expect(s.timers.every((t) => t.done)).toBe(true);
        if (ten.clueId === 'clue_10_c') expect(s.results.accomplice!.id).not.toBe(s.results.culprit!.id);
      }
    });
  }
});

describe('persistence', () => {
  it('snapshot/restore keeps the game state; voicemails are restored separately', async () => {
    const { Room } = await import('../src/shared/room');
    const h = new Harness();
    setupToReady(h, 3);
    h.do('p0', { type: 'startGame', source: 'manual' });
    h.advance(5 * 60000);
    const vmSaved: [number, any][] = [];
    const snap = h.room.snapshot();
    expect(snap.length).toBeLessThan(1_000_000);
    expect(snap).not.toContain('QUJD');                    // voicemail audio is not inside the session snapshot
    const h2 = new Harness();
    const r2 = Room.restore({ now: () => h.t, send: () => {} }, snap, [[0, { mime: 'a/b', b64: 'QUJD' }]]);
    expect(r2.s!.phase).toBe('play');
    expect(r2.s!.players.every((p) => !p.connected)).toBe(true);
    expect(r2.remaining(h.t)).toBe(h.room.remaining(h.t));
    expect(r2.vms.get(0)!.b64).toBe('QUJD');
    void h2; void vmSaved;
  });
});

describe('deleting a game', () => {
  it('only the host can delete it; every device is told and the room is gone', () => {
    const h = new Harness();
    let destroyed = 0;
    (h.room as any).io.destroy = () => { destroyed++; };
    h.join('p0', { create: true }); h.join('p1'); h.join('p2');
    h.do('p1', { type: 'deleteRoom' });
    expect(h.err('p1')).toBe('host_only');
    expect(h.room.s).not.toBeNull();
    expect(destroyed).toBe(0);
    h.do('p0', { type: 'deleteRoom' });
    for (const id of ['p0', 'p1', 'p2']) expect(h.inbox.get(id)!.at(-1)).toMatchObject({ t: 'err', code: 'deleted' });
    expect(h.room.s).toBeNull();
    expect(destroyed).toBe(1);
    h.clearInbox();
    h.join('p1');                                        // a returning player finds nothing
    expect(h.inbox.get('p1')![0]).toMatchObject({ t: 'err', code: 'no_room' });
  });
});
