import type { CityData } from '@unicornrush/engine-api/game/City';
import type { CompanySpec } from '@unicornrush/engine-api/game/Game';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { BotExecution } from './execution/bots/BotExecution';
import { CompanyExecution } from './execution/CompanyExecution';
import { CompetitionAuthorityExecution } from './execution/CompetitionAuthorityExecution';
import { createExecution } from './execution/ExecutionManager';
import { LocalEventExecution } from './execution/LocalEventExecution';
import { MarketEventExecution } from './execution/MarketEventExecution';
import { OpportunityExecution } from './execution/OpportunityExecution';
import { ScrutinyExecution } from './execution/ScrutinyExecution';
import { WinCheckExecution } from './execution/WinCheckExecution';
import { GameImpl } from './game/GameImpl';

/**
 * Entry point to the engine. Collects intents and applies them as a turn on
 * the next tick. Single player calls this directly; online, the room server
 * gathers everyone's intents into turns and every client applies the same ones.
 */
export class GameRunner {
  readonly game: GameImpl;
  private queued: Intent[] = [];

  /**
   * Plays on a real city when `city` is given, otherwise on a synthetic grid city.
   * `multiplayer` must be the same for every client of an online match.
   */
  constructor(seed: number, companies: CompanySpec[], city?: CityData, multiplayer = false) {
    this.game = new GameImpl(seed, companies, city, multiplayer);
    const g = this.game;
    g.addExecution(new MarketEventExecution());
    g.addExecution(new LocalEventExecution());
    g.addExecution(new CompetitionAuthorityExecution());
    g.addExecution(new ScrutinyExecution());
    g.addExecution(new OpportunityExecution());
    for (const c of g.companies) g.addExecution(new CompanyExecution(c.id));
    for (const c of g.companies) if (c.isBot) g.addExecution(new BotExecution(c.id));
    g.addExecution(new WinCheckExecution());
    g.news('Market opens. Grab customers before your rivals do!', 'info');
  }

  addIntent(intent: Intent): void {
    this.queued.push(intent);
  }

  /** Applies queued intents without advancing time (used while paused). */
  applyIntentsNow(): void {
    const turn = this.queued;
    this.queued = [];
    this.game.addExecution(...turn.map(createExecution));
    this.game.startPending();
  }

  executeNextTick(): void {
    const turn = this.queued;
    this.queued = [];
    this.game.addExecution(...turn.map(createExecution));
    this.game.executeNextTick();
  }

  /**
   * A fingerprint of the game state (who owns each street, every company's cash,
   * staff and push). Clients of an online match compare it to catch a desync.
   */
  stateHash(): number {
    const g = this.game;
    let h = 2166136261;
    const mix = (v: number) => {
      h = Math.imul(h ^ (v | 0), 16777619);
    };
    mix(g.tick);
    for (let i = 0; i < g.owner.length; i++) mix(g.owner[i]);
    for (const c of g.companies) {
      mix(Math.round(c.cash));
      mix(c.employees);
      mix(Math.round(c.push * 100));
      mix(c.alive ? 1 : 0);
    }
    return h >>> 0;
  }
}
