import type { CityData } from '@unicornrush/engine-api/game/City';
import type { CompanySpec } from '@unicornrush/engine-api/game/Game';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { BotExecution } from './execution/bots/BotExecution';
import { CompanyExecution } from './execution/CompanyExecution';
import { createExecution } from './execution/ExecutionManager';
import { MarketEventExecution } from './execution/MarketEventExecution';
import { WinCheckExecution } from './execution/WinCheckExecution';
import { GameImpl } from './game/GameImpl';

/**
 * Entry point to the engine. Collects intents and applies them as a turn on
 * the next tick. Today the client calls this directly; for multiplayer, a
 * server would gather everyone's intents into the same turns.
 */
export class GameRunner {
  readonly game: GameImpl;
  private queued: Intent[] = [];

  /** Plays on a real city when `city` is given, otherwise on a synthetic grid city. */
  constructor(seed: number, companies: CompanySpec[], city?: CityData) {
    this.game = new GameImpl(seed, companies, city);
    const g = this.game;
    g.addExecution(new MarketEventExecution());
    for (const c of g.companies) g.addExecution(new CompanyExecution(c.id));
    for (const c of g.companies) if (c.isBot) g.addExecution(new BotExecution(c.id));
    g.addExecution(new WinCheckExecution());
    g.news('Market opens. Grab customers before your rivals do!', 'info');
  }

  addIntent(intent: Intent): void {
    this.queued.push(intent);
  }

  executeNextTick(): void {
    const turn = this.queued;
    this.queued = [];
    this.game.addExecution(...turn.map(createExecution));
    this.game.executeNextTick();
  }
}
