import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

/** Ends the match: first unicorn, last company standing, or time up. */
export class WinCheckExecution implements Execution {
  init(): void {}

  isActive(): boolean {
    return true;
  }

  tick(game: GameImpl): void {
    for (const c of game.companies) {
      if (c.alive && game.valuation(c).total >= CONFIG.valuation.unicorn) {
        game.news(`🦄 ${c.isBot ? c.name : 'You'} became a unicorn!`, 'good');
        game.finish(c.id, 'unicorn');
        return;
      }
    }
    // The match ends when the human player closes. In bot-only matches (balance
    // runs) it carries on, so one bot closing doesn't crown whoever leads that day.
    if (!game.player.alive && !game.player.isBot && !game.spectating) return game.finish(game.leaderId(), 'playerBankrupt');
    const alive = game.companies.filter((c) => c.alive);
    if (alive.length === 1 && game.companies.length > 1) return game.finish(alive[0].id, 'lastStanding');
    if (game.day >= CONFIG.matchDays) game.finish(game.leaderId(), 'time');
  }
}
