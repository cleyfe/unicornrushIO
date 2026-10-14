import type { Intent } from '@unicornrush/engine-api/Intents';
import {
  type ClientMessage,
  HASH_EVERY_TURNS,
  MAX_COMPANIES,
  type LobbyPlayer,
  type RoomSettings,
  type ServerMessage,
  type StartInfo,
} from '@unicornrush/engine-api/net/Protocol';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { MAX_HUMANS, MAX_RIVALS, multiplayerCompanies } from '@unicornrush/engine-lib/configuration/Companies';

/** A player's connection, as the room sees it. */
export interface Conn {
  send(msg: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

interface Player {
  key: string;
  name: string;
  seat: number;
  conn: Conn | null;
  /** Intents received during the current turn, to cap spam. */
  sentThisTurn: number;
}

const MAX_INTENTS_PER_TURN = 20;
const MAX_MESSAGE_BYTES = 4096;
const CATCH_UP_CHUNK = 2000;
/** The match length plus a margin, so a room can't tick forever. */
const MAX_TURNS = (CONFIG.matchDays + 30) * CONFIG.ticksPerDay;
const CITY_ID = /^[a-z0-9-]{1,40}$/;
const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

/**
 * One online match, without any Cloudflare API, so it can be tested directly.
 * Lobby: players join with a name and a private key (to reconnect to their seat);
 * the first player is the host and picks the city and bots. Match: every TURN_MS
 * the room sends everyone the intents gathered since the last turn.
 */
export class RoomCore {
  private players: Player[] = [];
  private conns = new Map<Conn, Player | null>();
  private settings: RoomSettings = { cityId: 'paris-opera', difficulty: 'normal', bots: 3 };
  private info: StartInfo | null = null;
  private turns: Intent[][] = [];
  private pending: Intent[] = [];
  private hashes = new Map<number, Map<number, number>>();
  private desynced = false;
  private stopTimer: (() => void) | null = null;

  constructor(
    readonly code: string,
    /** Starts calling `tick` every turn; returns a function that stops it. */
    private startTimer: (tick: () => void) => () => void,
    private random: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0],
  ) {}

  get started(): boolean {
    return this.info !== null;
  }

  get turnCount(): number {
    return this.turns.length;
  }

  connect(conn: Conn): void {
    this.conns.set(conn, null);
  }

  disconnect(conn: Conn): void {
    const p = this.conns.get(conn);
    this.conns.delete(conn);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    if (!this.started) {
      // Before the start, leaving frees the seat; seats stay 0..n-1.
      this.players = this.players.filter((x) => x !== p);
      this.players.forEach((x, i) => (x.seat = i));
      this.broadcastLobby();
    } else if (!this.players.some((x) => x.conn)) {
      // Nobody left watching: pause until someone reconnects.
      this.pause();
    }
  }

  message(conn: Conn, raw: string): void {
    if (raw.length > MAX_MESSAGE_BYTES) return conn.close(1009, 'Message too big');
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const p = this.conns.get(conn);
    if (msg.t === 'join') return this.join(conn, msg.name, msg.key);
    if (!p) return conn.send({ t: 'error', text: 'Join the room first.' });
    switch (msg.t) {
      case 'settings':
        return this.updateSettings(p, msg.settings);
      case 'start':
        return this.start(p);
      case 'intent':
        return this.intent(p, msg.intent);
      case 'hash':
        return this.hash(p, msg.turn, msg.hash);
    }
  }

  /** One turn: send everyone what was gathered since the last one. */
  tick(): void {
    if (!this.started) return;
    const turn = this.pending;
    this.pending = [];
    for (const p of this.players) p.sentThisTurn = 0;
    this.turns.push(turn);
    this.broadcast({ t: 'turns', from: this.turns.length - 1, turns: [turn] });
    if (this.turns.length >= MAX_TURNS) this.pause();
  }

  // ---------- lobby ----------

  private join(conn: Conn, rawName: unknown, rawKey: unknown): void {
    const name = typeof rawName === 'string' ? rawName.trim().slice(0, 16) || 'Player' : 'Player';
    const key = typeof rawKey === 'string' ? rawKey.slice(0, 64) : '';
    if (!key) return conn.send({ t: 'error', text: 'Missing player key.' });
    let p = this.players.find((x) => x.key === key);
    if (!p) {
      if (this.started) return this.reject(conn, 'This match has already started.');
      if (this.players.length >= MAX_HUMANS) return this.reject(conn, `This room is full (${MAX_HUMANS} players).`);
      p = { key, name, seat: this.players.length, conn: null, sentThisTurn: 0 };
      this.players.push(p);
    }
    // A second tab with the same key takes the seat over.
    if (p.conn && p.conn !== conn) p.conn.close(4000, 'Opened elsewhere');
    p.conn = conn;
    if (!this.started) p.name = name;
    this.conns.set(conn, p);
    if (this.started) {
      this.sendMatch(p);
      if (!this.stopTimer && this.turns.length < MAX_TURNS) this.stopTimer = this.startTimer(() => this.tick());
    } else {
      this.broadcastLobby();
    }
  }

  private reject(conn: Conn, text: string): void {
    conn.send({ t: 'error', text });
    conn.close(4001, text);
  }

  private host(): Player | undefined {
    return this.players[0];
  }

  private updateSettings(p: Player, s: RoomSettings): void {
    if (this.started || p !== this.host() || !s) return;
    if (typeof s.cityId === 'string' && CITY_ID.test(s.cityId)) this.settings.cityId = s.cityId;
    if (DIFFICULTIES.has(s.difficulty)) this.settings.difficulty = s.difficulty;
    if (Number.isFinite(s.bots)) this.settings.bots = Math.max(0, Math.min(MAX_RIVALS, Math.floor(s.bots)));
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    const players: LobbyPlayer[] = this.players.map((x) => ({ seat: x.seat, name: x.name, connected: !!x.conn }));
    for (const x of this.players) {
      x.conn?.send({ t: 'lobby', code: this.code, you: x.seat, host: 0, players, settings: this.settings });
    }
  }

  // ---------- match ----------

  private start(p: Player): void {
    if (this.started || p !== this.host()) return;
    const humans = this.players.map((x) => x.name);
    const bots = Math.min(this.settings.bots, MAX_COMPANIES - humans.length);
    this.info = {
      seed: this.random() >>> 0,
      cityId: this.settings.cityId,
      companies: multiplayerCompanies(humans, this.settings.difficulty, bots),
    };
    for (const x of this.players) this.sendMatch(x);
    this.stopTimer = this.startTimer(() => this.tick());
  }

  /** The match so far: its setup, then every turn played (a reconnecting client replays them). */
  private sendMatch(p: Player): void {
    if (!this.info || !p.conn) return;
    p.conn.send({ t: 'start', info: this.info, you: p.seat });
    for (let from = 0; from < this.turns.length; from += CATCH_UP_CHUNK) {
      p.conn.send({ t: 'turns', from, turns: this.turns.slice(from, from + CATCH_UP_CHUNK) });
    }
  }

  private intent(p: Player, intent: Intent): void {
    if (!this.started || !intent || typeof intent.type !== 'string') return;
    if (++p.sentThisTurn > MAX_INTENTS_PER_TURN) return;
    // Players act only for their own company, whatever the client claims.
    this.pending.push({ ...intent, companyId: p.seat } as Intent);
  }

  private hash(p: Player, turn: number, hash: number): void {
    if (this.desynced || !Number.isInteger(turn) || turn % HASH_EVERY_TURNS !== 0 || turn > this.turns.length) return;
    let seen = this.hashes.get(turn);
    if (!seen) this.hashes.set(turn, (seen = new Map()));
    seen.set(p.seat, hash);
    if (new Set(seen.values()).size > 1) {
      this.desynced = true;
      this.broadcast({ t: 'desync', turn });
    }
    // Keep only recent checkpoints.
    for (const t of this.hashes.keys()) if (t < turn - HASH_EVERY_TURNS * 10) this.hashes.delete(t);
  }

  private pause(): void {
    this.stopTimer?.();
    this.stopTimer = null;
  }

  private broadcast(msg: ServerMessage): void {
    for (const p of this.players) p.conn?.send(msg);
  }
}
