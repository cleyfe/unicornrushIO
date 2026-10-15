import { describe, expect, it } from 'vitest';
import type { Intent } from '@unicornrush/engine-api/Intents';
import type { GameEvent, RoomListing, ServerMessage } from '@unicornrush/engine-api/net/Protocol';
import { parseBrowserEvent } from '../server/events';
import { GameRunner } from '@unicornrush/engine/GameRunner';
import { type Conn, RoomCore } from '../server/RoomCore';

/** A fake connection that records what the room sends it. */
function client(room: RoomCore) {
  const got: ServerMessage[] = [];
  let closed = false;
  const conn: Conn = { send: (m) => got.push(JSON.parse(JSON.stringify(m))), close: () => (closed = true) };
  room.connect(conn);
  return {
    got,
    conn,
    get closed() {
      return closed;
    },
    say: (msg: object) => room.message(conn, JSON.stringify(msg)),
    last: <T extends ServerMessage['t']>(t: T) => [...got].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined,
  };
}

function room() {
  let ticking = false;
  const listings: (RoomListing | null)[] = [];
  const events: GameEvent[] = [];
  const r = new RoomCore(
    'ABCDE',
    () => {
      ticking = true;
      return () => (ticking = false);
    },
    () => 12345,
    (l) => listings.push(l),
    (e) => events.push(e),
  );
  return { r, ticking: () => ticking, listing: () => listings.at(-1), events };
}

describe('online rooms', () => {
  it('seats players in join order and lets only the host change settings and start', () => {
    const { r, ticking } = room();
    const a = client(r);
    const b = client(r);
    a.say({ t: 'join', name: 'Alice', key: 'ka' });
    b.say({ t: 'join', name: 'Bob', key: 'kb' });
    expect(b.last('lobby')).toMatchObject({ you: 1, host: 0, players: [{ name: 'Alice' }, { name: 'Bob' }] });
    b.say({ t: 'settings', settings: { cityId: 'geneva', difficulty: 'hard', bots: 1 } });
    b.say({ t: 'start' });
    expect(r.started).toBe(false);
    a.say({ t: 'settings', settings: { cityId: 'geneva', difficulty: 'hard', bots: 1 } });
    expect(b.last('lobby')!.settings).toEqual({ cityId: 'geneva', difficulty: 'hard', bots: 1, listed: true });
    a.say({ t: 'start' });
    expect(ticking()).toBe(true);
    const start = b.last('start')!;
    expect(start.you).toBe(1);
    expect(start.info.cityId).toBe('geneva');
    expect(start.info.companies.map((c) => [c.name, c.isBot])).toEqual([
      ['Alice', false],
      ['Bob', false],
      ['BudgetMart', true],
    ]);
  });

  it('relays intents as the sender’s own company, in the same turns for everyone', () => {
    const { r } = room();
    const a = client(r);
    const b = client(r);
    a.say({ t: 'join', name: 'Alice', key: 'ka' });
    b.say({ t: 'join', name: 'Bob', key: 'kb' });
    a.say({ t: 'start' });
    // Bob pretends to be Alice: the room fixes the company id.
    b.say({ t: 'intent', intent: { type: 'setPrice', companyId: 0, price: 'high' } });
    r.tick();
    r.tick();
    const turnsA = a.got.filter((m) => m.t === 'turns');
    const turnsB = b.got.filter((m) => m.t === 'turns');
    expect(turnsA).toEqual(turnsB);
    expect(turnsA[0]).toEqual({ t: 'turns', from: 0, turns: [[{ type: 'setPrice', companyId: 1, price: 'high' }]] });
    expect(turnsA[1]).toEqual({ t: 'turns', from: 1, turns: [[]] });
  });

  it('lets a player reconnect to their seat and replays the match so far', () => {
    const { r, ticking } = room();
    const a = client(r);
    a.say({ t: 'join', name: 'Alice', key: 'ka' });
    a.say({ t: 'start' });
    a.say({ t: 'intent', intent: { type: 'hire', companyId: 0, count: 5 } });
    r.tick();
    r.tick();
    r.disconnect(a.conn);
    expect(ticking()).toBe(false); // nobody left: the clock stops
    const again = client(r);
    again.say({ t: 'join', name: 'Alice', key: 'ka' });
    expect(ticking()).toBe(true);
    expect(again.last('start')!.you).toBe(0);
    expect(again.last('turns')).toEqual({ t: 'turns', from: 0, turns: [[{ type: 'hire', companyId: 0, count: 5 }], []] });
    // Strangers can't join a match in progress.
    const late = client(r);
    late.say({ t: 'join', name: 'Mallory', key: 'km' });
    expect(late.closed).toBe(true);
  });

  it('frees the seats of players who leave the lobby', () => {
    const { r } = room();
    const a = client(r);
    const b = client(r);
    const c = client(r);
    a.say({ t: 'join', name: 'A', key: '1' });
    b.say({ t: 'join', name: 'B', key: '2' });
    c.say({ t: 'join', name: 'C', key: '3' });
    r.disconnect(b.conn);
    expect(c.last('lobby')).toMatchObject({ you: 1, players: [{ seat: 0, name: 'A' }, { seat: 1, name: 'C' }] });
  });

  it('flags clients that disagree about the game state', () => {
    const { r } = room();
    const a = client(r);
    const b = client(r);
    a.say({ t: 'join', name: 'A', key: '1' });
    b.say({ t: 'join', name: 'B', key: '2' });
    a.say({ t: 'start' });
    for (let i = 0; i < 50; i++) r.tick();
    a.say({ t: 'hash', turn: 50, hash: 1 });
    b.say({ t: 'hash', turn: 50, hash: 1 });
    expect(a.last('desync')).toBeUndefined();
    for (let i = 0; i < 50; i++) r.tick();
    a.say({ t: 'hash', turn: 100, hash: 1 });
    b.say({ t: 'hash', turn: 100, hash: 2 });
    expect(a.last('desync')).toEqual({ t: 'desync', turn: 100 });
  });

  it('gives every client the same game from the same seed and turns (lockstep)', () => {
    const { r } = room();
    const a = client(r);
    const b = client(r);
    a.say({ t: 'join', name: 'Alice', key: 'ka' });
    b.say({ t: 'join', name: 'Bob', key: 'kb' });
    a.say({ t: 'settings', settings: { cityId: 'grid', difficulty: 'normal', bots: 2 } });
    a.say({ t: 'start' });
    const info = a.last('start')!.info;
    const runners = [new GameRunner(info.seed, info.companies, undefined, true), new GameRunner(info.seed, info.companies, undefined, true)];
    const play = (turns: Intent[][]) =>
      runners.forEach((g) =>
        turns.forEach((t) => {
          t.forEach((i) => g.addIntent(i));
          g.executeNextTick();
        }),
      );
    for (let day = 0; day < 60; day++) {
      if (day === 2) a.say({ t: 'intent', intent: { type: 'hire', companyId: 0, count: 10 } });
      if (day === 3) b.say({ t: 'intent', intent: { type: 'setPrice', companyId: 1, price: 'low' } });
      for (let t = 0; t < 10; t++) r.tick();
    }
    play(a.got.filter((m) => m.t === 'turns').flatMap((m) => (m as { turns: Intent[][] }).turns));
    expect(runners[0].game.tick).toBe(600);
    expect(runners[0].stateHash()).toBe(runners[1].stateHash());
    expect(runners[0].game.companies[1].price).toBe('low');
    expect(runners[0].game.multiplayer).toBe(true);
  });

  it('lists a waiting room in open games until it starts, empties or goes private', () => {
    const { r, listing } = room();
    const a = client(r);
    a.say({ t: 'join', name: 'Alice', key: 'ka' });
    expect(listing()).toMatchObject({ code: 'ABCDE', host: 'Alice', players: 1, cityId: 'paris-opera' });
    a.say({ t: 'settings', settings: { cityId: 'rome', difficulty: 'easy', bots: 2, listed: false } });
    expect(listing()).toBeNull();
    a.say({ t: 'settings', settings: { cityId: 'rome', difficulty: 'easy', bots: 2, listed: true } });
    expect(listing()).toMatchObject({ cityId: 'rome', bots: 2 });
    a.say({ t: 'start' });
    expect(listing()).toBeNull();
    const { r: r2, listing: l2 } = room();
    const b = client(r2);
    b.say({ t: 'join', name: 'Bob', key: 'kb' });
    r2.disconnect(b.conn);
    expect(l2()).toBeNull();
  });

  it('records anonymous stats: room created, match started, match finished once', () => {
    const { r, events } = room();
    const a = client(r);
    const b = client(r);
    a.say({ t: 'join', name: 'Alice', key: 'ka' });
    b.say({ t: 'join', name: 'Bob', key: 'kb' });
    a.say({ t: 'start' });
    a.say({ t: 'over', day: 412.7, reason: 'unicorn', winner: 'human' });
    b.say({ t: 'over', day: 412.7, reason: 'unicorn', winner: 'human' });
    expect(events.map((e) => e.type)).toEqual(['room_created', 'match_started', 'match_finished']);
    expect(events[1]).toMatchObject({ mode: 'online', humans: 2, bots: 3, city: 'paris-opera' });
    expect(events[2]).toMatchObject({ day: 412, reason: 'unicorn', winner: 'human' });
    expect(JSON.stringify(events)).not.toMatch(/Alice|Bob|ka|kb/); // no names, no keys
  });

  it('only accepts visits and known single-player events from browsers', () => {
    expect(parseBrowserEvent({ type: 'solo_finished', city: 'geneva', difficulty: 'easy', bots: 3, day: 300.5, reason: 'unicorn', winner: 'human' })).toEqual({
      type: 'solo_finished',
      mode: 'solo',
      city: 'geneva',
      difficulty: 'easy',
      humans: 1,
      bots: 3,
      day: 300,
      reason: 'unicorn',
      winner: 'human',
    });
    expect(parseBrowserEvent({ type: 'match_started' })).toBeNull();
    expect(parseBrowserEvent({ type: 'solo_started', city: '<script>' })?.city).toBeUndefined();
    expect(parseBrowserEvent('nope')).toBeNull();
    expect(parseBrowserEvent({ type: 'visit', reason: 'invite', city: 'x' })).toEqual({ type: 'visit', mode: 'web', reason: 'invite' });
    expect(parseBrowserEvent({ type: 'visit', reason: 'evil' })?.reason).toBe('home');
    expect(parseBrowserEvent({ type: 'visit', reason: 'app' })?.reason).toBe('app');
  });
});
