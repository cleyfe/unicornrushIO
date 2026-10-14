import type { CityData } from '@unicornrush/engine-api/game/City';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { HASH_EVERY_TURNS, type StartInfo } from '@unicornrush/engine-api/net/Protocol';
import { ClientGameRunner } from '../ClientGameRunner';
import type { RoomClient } from './RoomClient';

/** Turns run per animation frame at most, so catching up after a reconnect doesn't freeze the page. */
const MAX_TURNS_PER_FRAME = 400;

/**
 * An online match. The clock is the room server: each turn it sends is one tick,
 * with every player's intents applied first, so all clients stay identical.
 * Your own actions go to the server and come back in a later turn.
 */
export class NetGameRunner extends ClientGameRunner {
  private queue: Intent[][] = [];
  /** Turns received so far (applied or queued). */
  private received = 0;

  constructor(
    info: StartInfo,
    city: CityData | undefined,
    you: number,
    private room: RoomClient,
  ) {
    super(info.seed, info.companies, city, true);
    this.game.playerId = you;
    this.speed = 1;
  }

  override get online(): boolean {
    return true;
  }

  override send(intent: Intent): void {
    this.room.send({ t: 'intent', intent });
  }

  /** Turns from the server. A reconnect replays the match from turn 0: skip what we already have. */
  receive(from: number, turns: Intent[][]): void {
    if (from > this.received) return; // a gap can't be filled; the next reconnect replays everything
    const fresh = turns.slice(this.received - from);
    this.queue.push(...fresh);
    this.received += fresh.length;
  }

  /** How many turns we're behind the server (to show "catching up"). */
  get behind(): number {
    return this.queue.length;
  }

  override advance(): void {
    for (let n = 0; n < MAX_TURNS_PER_FRAME && this.queue.length > 0 && !this.game.result; n++) {
      for (const intent of this.queue.shift()!) this.runner.addIntent(intent);
      this.runner.executeNextTick();
      const turn = this.game.tick;
      if (turn % HASH_EVERY_TURNS === 0) this.room.send({ t: 'hash', turn, hash: this.runner.stateHash() });
    }
  }
}
