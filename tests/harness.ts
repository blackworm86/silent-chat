import { Room } from '../src/shared/room';
import type { ClientMsg, ServerMsg, View, ChatMsg, Intent } from '../src/shared/types';

export class Harness {
  t = 1_700_000_000_000;
  inbox = new Map<string, ServerMsg[]>();
  views = new Map<string, View>();
  room: Room;
  constructor() {
    this.room = new Room({
      now: () => this.t,
      send: (d, m) => {
        (this.inbox.get(d) ?? this.inbox.set(d, []).get(d)!).push(m);
        if (m.t === 'view') this.views.set(d, m.v);
      }
    });
  }
  join(id: string, opts: { create?: boolean; role?: 'player' | 'table'; name?: string } = {}) {
    // A player "creating" stands for the usual start: the table opens the room and picks this player as facilitator.
    if (opts.create && (opts.role ?? 'player') === 'player') {
      this.room.open('tbl', { t: 'hello', room: 'TEST', deviceId: 'tbl', role: 'table', create: true, name: 'table' });
      this.room.open(id, { t: 'hello', room: 'TEST', deviceId: id, role: 'player', name: opts.name ?? id });
      this.do('tbl', { type: 'setFacilitator', seat: 0 });
      return;
    }
    this.room.open(id, { t: 'hello', room: 'TEST', deviceId: id, role: opts.role ?? 'player', create: opts.create, name: opts.name ?? id });
  }
  do(id: string, a: Intent) { this.room.receive(id, { t: 'do', a } as ClientMsg); }
  err(id: string): string | null {
    const m = [...(this.inbox.get(id) ?? [])].reverse().find((x) => x.t === 'err');
    return m && m.t === 'err' ? (m.msg ?? m.code) : null;
  }
  clearInbox() { this.inbox.clear(); }
  v(id: string): View { return this.views.get(id)!; }
  advance(ms: number, step = 1000) {
    for (let i = 0; i < ms; i += step) { this.t += step; this.room.tick(); }
  }
  chats(id: string): ChatMsg[] {
    return (this.inbox.get(id) ?? []).flatMap((m) => (m.t === 'chat' ? [m.m] : m.t === 'chatHistory' ? m.ms : []));
  }
}

/** Create a room with n players (ids p0..p{n-1}) and run through the setup phases to 'ready'. */
export function setupToReady(h: Harness, n = 4, opts: { aids?: boolean; hook?: (phase: string) => void } = {}) {
  h.join('p0', { create: true, name: 'Host' });
  for (let i = 1; i < n; i++) h.join('p' + i);
  if (opts.aids) h.do('p0', { type: 'setSettings', mode: 'aids' });
  const ids = Array.from({ length: n }, (_, i) => 'p' + i);
  const host = 'p0';
  opts.hook?.('lobby');
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // lobby -> safety
  ids.forEach((i) => h.do(i, { type: 'consent' }));
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> intro
  if (opts.aids) h.do('p1', { type: 'pickPoster', index: 3 });
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> characters
  const chars = ['evan', 'julia', 'jack', 'dakota'];
  for (let i = 1; i < n; i++) h.do('p' + i, { type: 'pickCharacter', id: chars[i - 1] });
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> drives
  if (opts.aids) for (let i = 0; i < n; i++) h.do('p' + i, { type: 'setDrive', id: 'drive_' + (i + 1) });
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> intros
  for (let i = 0; i < n; i++) h.do('p' + i, { type: 'introDone' });
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> relations
  for (let i = 0; i < n; i++) { h.do('p' + i, { type: 'assignRelation', line: 0, target: (i + 1) % n }); h.do('p' + i, { type: 'assignRelation', line: 1, target: (i + 2) % n }); }
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> voicemail
  for (let i = 0; i < n; i++) h.do('p' + i, { type: 'voicemail', mime: 'audio/webm', b64: 'QUJD' });
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> hunches
  for (let i = 0; i < n; i++) h.do('p' + i, { type: 'hunchDone' });
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> deal
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> rules
  ids.forEach((i) => h.do(i, { type: 'ready', value: true }));
  h.do(host, { type: 'next' }); opts.hook?.(h.v('p0').phase);                         // -> ready
  return ids;
}
