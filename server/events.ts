import type { GameEvent } from '@unicornrush/engine-api/net/Protocol';

/**
 * Anonymous gameplay events, one row each, for the private stats page
 * (a separate, private repo reads this database). No player ids, no IPs.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    mode TEXT NOT NULL,
    room TEXT,
    city TEXT,
    difficulty TEXT,
    humans INTEGER,
    bots INTEGER,
    day INTEGER,
    reason TEXT,
    winner TEXT,
    country TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS events_ts ON events (ts)',
  'CREATE INDEX IF NOT EXISTS events_type_ts ON events (type, ts)',
];

/** The bit of Cloudflare D1 used here (a D1Database fits), so this file also compiles for the tests. */
interface Statement {
  bind(...values: unknown[]): Statement;
  run(): Promise<unknown>;
}
export interface EventsDb {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}

let ready: Promise<unknown> | null = null;

export async function recordEvent(db: EventsDb, e: GameEvent, country?: string): Promise<void> {
  ready ??= db.batch(SCHEMA.map((q) => db.prepare(q)));
  await ready;
  await db
    .prepare('INSERT INTO events (ts, type, mode, room, city, difficulty, humans, bots, day, reason, winner, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(Date.now(), e.type, e.mode, e.room ?? null, e.city ?? null, e.difficulty ?? null, e.humans ?? null, e.bots ?? null, e.day ?? null, e.reason ?? null, e.winner ?? null, country ?? null)
    .run();
}

const SOLO_TYPES = new Set(['solo_started', 'solo_finished']);
const ENTRIES = new Set(['home', 'invite']);
const WORD = /^[a-z0-9-]{1,40}$/;
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : undefined);
const word = (v: unknown) => (typeof v === 'string' && WORD.test(v) ? v : undefined);

/**
 * An event sent by the browser: a visit, or a single-player match (those never touch the server
 * otherwise). Only known fields pass.
 */
export function parseBrowserEvent(body: unknown): GameEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.type === 'visit') return { type: 'visit', mode: 'web', reason: typeof b.reason === 'string' && ENTRIES.has(b.reason) ? b.reason : 'home' };
  if (typeof b.type !== 'string' || !SOLO_TYPES.has(b.type)) return null;
  return {
    type: b.type as GameEvent['type'],
    mode: 'solo',
    city: word(b.city),
    difficulty: word(b.difficulty),
    humans: 1,
    bots: int(b.bots, 30),
    day: int(b.day, 2000),
    reason: word(b.reason),
    winner: b.winner === 'human' || b.winner === 'bot' ? b.winner : undefined,
  };
}
