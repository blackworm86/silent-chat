// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startDemo, stopDemo, setDemoSpeed, viewAs, demoSeats } from '../src/client/demo';
import { view, chat, send, errors, myGames } from '../src/client/net';

afterEach(() => { stopDemo(); vi.useRealTimers(); });

const wait = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };
async function next(expectPhase: string) {
  for (let i = 0; i < 20 && view.value?.phase !== expectPhase; i++) { send({ type: 'next' }); await wait(2500); }
  expect(view.value?.phase).toBe(expectPhase);
}

describe('host demo', () => {
  it('bots carry a full digital game from lobby to done, on a sped-up clock', async () => {
    vi.useFakeTimers();
    startDemo('Host');
    await wait(10);
    expect(view.value?.code).toBe('DEMO');
    expect(view.value?.players.length).toBe(4);
    expect(demoSeats.value.map((s) => s.name)).toEqual(['Host', 'Ada', 'Bruno', 'Celia']);

    await next('safety');
    send({ type: 'consent' });
    for (const p of ['intro', 'characters', 'drives', 'intros']) await next(p);
    // the host takes their own turn; bots take theirs
    for (let i = 0; i < 8 && !view.value!.players.every((p) => p.introDone); i++) { send({ type: 'introDone' }); await wait(2500); }
    await next('relations');
    const others = view.value!.players.filter((p) => p.seat !== 0);
    send({ type: 'assignRelation', line: 0, target: others[0].seat });
    send({ type: 'assignRelation', line: 1, target: others[1].seat });
    await next('voicemail');
    send({ type: 'voicemail', mime: 'audio/wav', b64: 'AAAA' });
    await next('hunches');
    for (let i = 0; i < 8 && !view.value!.players.every((p) => p.hunchDone); i++) { send({ type: 'hunchDone' }); await wait(2500); }
    for (const p of ['deal', 'rules']) await next(p);
    send({ type: 'ready', value: true });
    await next('ready');

    send({ type: 'startGame', source: 'manual' });
    await wait(10);
    expect(view.value?.phase).toBe('play');
    send({ type: 'chat', to: 'group', text: 'Has anyone heard from Alice?' });
    setDemoSpeed(60);
    for (let i = 0; i < 200 && view.value?.phase === 'play'; i++) {
      for (const h of view.value!.hands) if (h.status === 'unlocked') send({ type: 'flipClue', ts: h.ts });
      await wait(1000);
    }
    expect(view.value?.phase).toBe('final');
    // every clue the bots held got flipped, and someone answered the host in character
    expect(view.value!.flipped.length).toBeGreaterThan(5);
    expect(chat.value.some((m) => m.kind === 'msg' && m.from !== 0)).toBe(true);

    for (const p of ['playback', 'debrief', 'done']) await next(p);
    expect(myGames.value).toEqual([]);           // a demo never shows up in "Your games"
    expect(errors.value.filter((e) => !/blocked|not_your_turn|taken|already/.test(e.code))).toEqual([]);
  }, 30000);

  it('can look through a bot and act as it', async () => {
    vi.useFakeTimers();
    startDemo('Host');
    await wait(10);
    viewAs(2);
    await wait(10);
    expect(view.value?.me.seat).toBe(2);
    expect(view.value?.me.isHost).toBe(false);
    viewAs(0);
    await wait(10);
    expect(view.value?.me.isHost).toBe(true);
  });
});
