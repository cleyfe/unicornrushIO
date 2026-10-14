import { DurableObject } from 'cloudflare:workers';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN, TURN_MS } from '@unicornrush/engine-api/net/Protocol';
import { type Conn, RoomCore } from './RoomCore';

interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
}

/**
 * The game's server. Static files (the game itself) are served by Cloudflare
 * before this code runs; it only handles /api:
 *   POST /api/rooms          → { code }: a new room
 *   GET  /api/rooms/<code>   → WebSocket into that room's GameRoom
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
  },
} satisfies ExportedHandler<Env>;

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

/** One room: its players' WebSockets and the turn clock. The game rules live in RoomCore. */
export class GameRoom extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private players = 0;

  /** How many players are connected (0 for a fresh or abandoned room). */
  async info(): Promise<{ players: number }> {
    return { players: this.players };
  }

  async fetch(request: Request): Promise<Response> {
    const code = request.headers.get('X-Room-Code') ?? '';
    this.core ??= new RoomCore(code, (tick) => {
      const id = setInterval(tick, TURN_MS);
      return () => clearInterval(id);
    });
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
