import { DurableObject } from 'cloudflare:workers';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN, type RoomListing, TURN_MS } from '@unicornrush/engine-api/net/Protocol';
import { parseBrowserEvent, recordEvent } from './events';
import { type Conn, RoomCore } from './RoomCore';

interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  DIRECTORY: DurableObjectNamespace<RoomDirectory>;
  EVENTS: D1Database;
  ASSETS: Fetcher;
}

/** Open games in a lobby are listed for at most this long without news from their room. */
const LISTING_TTL_MS = 30 * 60 * 1000;

const directory = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));

/**
 * The game's server. Static files (the game itself) are served by Cloudflare
 * before this code runs; it only handles /api:
 *   GET  /api/rooms          → open games waiting for players (RoomListing[])
 *   POST /api/rooms          → { code }: a new room
 *   GET  /api/rooms/<code>   → WebSocket into that room's GameRoom
 *   POST /api/events         → an anonymous visit or single-player event for the stats
 */
/** The iOS app runs the game from this origin and calls the API across origins. */
const APP_ORIGINS = new Set(['capacitor://localhost']);

/** Lets the iOS app read API responses (rooms, stats); the website itself needs nothing. */
function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !APP_ORIGINS.has(origin) || response.status === 101) return response;
  const r = new Response(response.body, response);
  r.headers.set('Access-Control-Allow-Origin', origin);
  r.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  r.headers.set('Access-Control-Max-Age', '86400');
  r.headers.append('Vary', 'Origin');
  return r;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return withCors(request, new Response(null, { status: 204 }));
    return withCors(request, await handle(request, env, ctx));
  },
} satisfies ExportedHandler<Env>;

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/events' && request.method === 'POST') {
    const text = await request.text();
    if (text.length > 1000) return new Response(null, { status: 413 });
    // Automated browsers (previews, crawlers that run scripts) aren't visitors.
    if (/bot|crawl|spider|headless|lighthouse/i.test(request.headers.get('User-Agent') ?? '')) return new Response(null, { status: 204 });
    let event = null;
    try {
      event = parseBrowserEvent(JSON.parse(text));
    } catch {
      // Not JSON.
    }
    if (!event) return new Response(null, { status: 400 });
    ctx.waitUntil(recordEvent(env.EVENTS, event, request.cf?.country as string | undefined).catch(() => {}));
    return new Response(null, { status: 204 });
  }
  if (url.pathname === '/api/rooms' && request.method === 'GET') {
    return Response.json(await directory(env).list(), { headers: { 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newRoomCode();
      // Skip codes whose room is still in use.
      const info = await env.ROOMS.get(env.ROOMS.idFromName(code)).info();
      if (info.players === 0) return Response.json({ code });
    }
    return Response.json({ error: 'No free room code, try again.' }, { status: 503 });
  }
  const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
  if (match) {
    const code = match[1].toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) return new Response('Unknown room', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const headers = new Headers(request.headers);
    headers.set('X-Room-Code', code);
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(request, { headers }));
  }
  if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
  return env.ASSETS.fetch(request);
}

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

/** One room: its players' WebSockets and the turn clock. The game rules live in RoomCore. */
export class GameRoom extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private players = 0;
  /** The room creator's country, for the stats. */
  private country: string | undefined;

  /** How many players are connected (0 for a fresh or abandoned room). */
  async info(): Promise<{ players: number }> {
    return { players: this.players };
  }

  async fetch(request: Request): Promise<Response> {
    const code = request.headers.get('X-Room-Code') ?? '';
    this.core ??= new RoomCore(
      code,
      (tick) => {
        const id = setInterval(tick, TURN_MS);
        return () => clearInterval(id);
      },
      undefined,
      (listing) => {
        const d = directory(this.env);
        this.ctx.waitUntil((listing ? d.set(listing) : d.remove(code)).catch(() => {}));
      },
      (event) => this.ctx.waitUntil(recordEvent(this.env.EVENTS, event, this.country).catch(() => {})),
    );
    this.country ??= request.cf?.country as string | undefined;
    const core = this.core;
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const conn: Conn = {
      send: (msg) => {
        try {
          server.send(JSON.stringify(msg));
        } catch {
          // Closed socket: the close event cleans up.
        }
      },
      close: (closeCode, reason) => {
        try {
          server.close(closeCode ?? 1000, reason);
        } catch {
          // Already closed.
        }
      },
    };
    this.players++;
    core.connect(conn);
    server.addEventListener('message', (e) => core.message(conn, typeof e.data === 'string' ? e.data : ''));
    let closed = false;
    const onClose = () => {
      if (closed) return;
      closed = true;
      this.players--;
      core.disconnect(conn);
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
    return new Response(null, { status: 101, webSocket: client });
  }
}

/** The open games list: rooms waiting in their lobby report here; the main menu reads it. */
export class RoomDirectory extends DurableObject<Env> {
  async set(listing: RoomListing): Promise<void> {
    await this.ctx.storage.put(listing.code, listing);
  }

  async remove(code: string): Promise<void> {
    await this.ctx.storage.delete(code);
  }

  /** Open games, newest first; forgets rooms that haven't reported for a while. */
  async list(): Promise<RoomListing[]> {
    const now = Date.now();
    const all = [...(await this.ctx.storage.list<RoomListing>()).values()];
    const stale = all.filter((l) => now - l.updated > LISTING_TTL_MS).map((l) => l.code);
    if (stale.length) await this.ctx.storage.delete(stale);
    return all.filter((l) => now - l.updated <= LISTING_TTL_MS).sort((a, b) => b.updated - a.updated).slice(0, 50);
  }
}
