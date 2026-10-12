import type { CityData } from '@unicornrush/engine-api/game/City';
import type { CompanySpec, LogEntry } from '@unicornrush/engine-api/game/Game';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { GameRunner } from '@unicornrush/engine/GameRunner';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';

/** Drives the engine in real time and relays the player's intents to it. */
export class ClientGameRunner {
  readonly runner: GameRunner;
  speed = 1;
  private acc = 0;
  private lastLogId = 0;

  constructor(seed: number, companies: CompanySpec[], city?: CityData) {
    this.runner = new GameRunner(seed, companies, city);
  }

  get game(): GameImpl {
    return this.runner.game;
  }

  /** Sends an intent on behalf of the player (company 0). */
  send(intent: Intent): void {
    this.runner.addIntent(intent);
  }

  /** Advances the simulation by `elapsedMs` of real time. */
  advance(elapsedMs: number): void {
    this.acc += Math.min(250, elapsedMs) * this.speed;
    const msPerTick = 1000 / CONFIG.ticksPerDay;
    while (this.acc >= msPerTick && !this.game.result) {
      this.runner.executeNextTick();
      this.acc -= msPerTick;
    }
  }

  /** Log entries added since the last call. */
  newLogEntries(): LogEntry[] {
    const fresh = this.game.log.filter((l) => l.id > this.lastLogId);
    if (fresh.length) this.lastLogId = fresh[fresh.length - 1].id;
    return fresh;
  }
}
