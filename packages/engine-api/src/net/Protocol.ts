import type { CompanySpec, Difficulty } from '../game/Game';
import type { Intent } from '../Intents';

/**
 * Online matches use deterministic lockstep: the room server never runs the game.
 * It collects every player's intents and sends them back in numbered turns, one
 * per engine tick, and every client applies the same turns to the same seed.
 */

/** One engine tick per turn: 10 turns a second, the game's 1× speed. */
export const TURN_MS = 100;

/** Room codes: 5 letters/digits, without the easily confused 0/O/1/I. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;

/** Most companies on one map, humans and bots together. */
export const MAX_COMPANIES = 20;

/** Every this many turns, clients report a hash of their game state to catch desyncs. */
export const HASH_EVERY_TURNS = 50;

export interface RoomSettings {
  cityId: string;
  /** Difficulty of the bot rivals. */
  difficulty: Difficulty;
  /** Bot rivals added after the human players. */
  bots: number;
  /** Listed in the main menu's open games (otherwise join by code or link only). */
  listed: boolean;
}

/** An open game in the main menu: a room still in its lobby. */
export interface RoomListing {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  cityId: string;
  bots: number;
  difficulty: Difficulty;
  /** When the room last changed (ms since epoch); old entries expire. */
  updated: number;
}

export interface LobbyPlayer {
  /** Seat: the company id this player gets when the match starts. */
  seat: number;
  name: string;
  connected: boolean;
}

// ---------- analytics ----------

/** An anonymous event for the stats page: no player ids, no cookies. A `visit` is one page load of the game. */
export interface GameEvent {
  type: 'visit' | 'room_created' | 'match_started' | 'match_finished' | 'solo_started' | 'solo_finished';
  mode: 'online' | 'solo' | 'web';
  room?: string;
  city?: string;
  difficulty?: string;
  humans?: number;
  bots?: number;
  /** Game day the match ended on. */
  day?: number;
  /** How a match ended; for a visit, how it arrived: 'home' or 'invite' (a room link). */
  reason?: string;
  /** Whether a human or a bot won. */
  winner?: 'human' | 'bot' | 'none';
}

// ---------- client → server ----------

export type ClientMessage =
  /** First message on every connection. `key` lets a player reconnect to the same seat. */
  | { t: 'join'; name: string; key: string }
  /** Host only, before the start. */
  | { t: 'settings'; settings: RoomSettings }
  /** Host only. */
  | { t: 'start' }
  /** The server overwrites `companyId` with the sender's seat. */
  | { t: 'intent'; intent: Intent }
  | { t: 'hash'; turn: number; hash: number }
  /** The match ended on this client (for the stats; the first report counts). */
  | { t: 'over'; day: number; reason: string; winner: 'human' | 'bot' | 'none' };

// ---------- server → client ----------

export interface StartInfo {
  seed: number;
  cityId: string;
  companies: CompanySpec[];
}

export type ServerMessage =
  | { t: 'lobby'; code: string; you: number; host: number; players: LobbyPlayer[]; settings: RoomSettings }
  /** The match has started (also sent to a player who reconnects mid-match). */
  | { t: 'start'; info: StartInfo; you: number }
  /** Turns `from`, `from + 1`, …: each is the list of intents to apply before that tick. */
  | { t: 'turns'; from: number; turns: Intent[][] }
  /** Clients disagreed about the game state at this turn. */
  | { t: 'desync'; turn: number }
  | { t: 'error'; text: string };
