import type { Intent } from '@unicornrush/engine-api/Intents';
import type { ClientMessage, RoomSettings, ServerMessage, StartInfo } from '@unicornrush/engine-api/net/Protocol';

type Lobby = Extract<ServerMessage, { t: 'lobby' }>;

/** Creates a room on the server and returns its code. */
export async function createRoom(): Promise<string> {
  const res = await fetch('api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error(`Couldn't create a room (${res.status}).`);
  return ((await res.json()) as { code: string }).code;
}

/** This browser's private key for a room, so a reload or a dropped connection gets the same seat back. */
function playerKey(code: string): string {
  const k = `unicornrush.room.${code}`;
  try {
    let key = localStorage.getItem(k);
    if (!key) {
      key = crypto.getRandomValues(new Uint32Array(4)).join('-');
      localStorage.setItem(k, key);
    }
    return key;
  } catch {
    return crypto.getRandomValues(new Uint32Array(4)).join('-');
  }
}

/** The WebSocket to one room: joins, reconnects after a drop, and hands messages to the screens. */
export class RoomClient {
  onLobby: (lobby: Lobby) => void = () => {};
  onStart: (info: StartInfo, you: number) => void = () => {};
  onTurns: (from: number, turns: Intent[][]) => void = () => {};
  onDesync: (turn: number) => void = () => {};
  onError: (text: string) => void = () => {};
  /** Connected or not (a dropped connection retries by itself). */
  onStatus: (connected: boolean) => void = () => {};

  private ws: WebSocket | null = null;
  private left = false;
  private retries = 0;
  private readonly key: string;

  constructor(
    readonly code: string,
    private name: string,
  ) {
    this.key = playerKey(code);
    this.connect();
  }

  private connect(): void {
    const url = new URL(`api/rooms/${this.code}`, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.onStatus(true);
      this.send({ t: 'join', name: this.name, key: this.key });
    };
    ws.onmessage = (e) => this.handle(JSON.parse(e.data as string) as ServerMessage);
    ws.onclose = (e) => {
      if (this.ws !== ws || this.left) return;
      this.onStatus(false);
      // 4000: opened in another tab; 4001: refused (full, already started). Don't fight it.
      if (e.code === 4000 || e.code === 4001) return;
      const delay = Math.min(10_000, 1000 * 2 ** this.retries++);
      window.setTimeout(() => !this.left && this.connect(), delay);
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'lobby':
        return this.onLobby(msg);
      case 'start':
        return this.onStart(msg.info, msg.you);
      case 'turns':
        return this.onTurns(msg.from, msg.turns);
      case 'desync':
        return this.onDesync(msg.turn);
      case 'error':
        return this.onError(msg.text);
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  setSettings(settings: RoomSettings): void {
    this.send({ t: 'settings', settings });
  }

  start(): void {
    this.send({ t: 'start' });
  }

  leave(): void {
    this.left = true;
    this.ws?.close(1000, 'Left');
  }
}
