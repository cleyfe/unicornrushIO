import type { MarketEventKind } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

/**
 * Starts and ends economy-wide shocks every few months. Economists see each
 * one coming `warningDays` ahead, so players can prepare (save cash before a
 * recession, hire before a boom).
 */
export class MarketEventExecution implements Execution {
  private nextDay: number = CONFIG.events.firstDay;

  init(): void {}

  isActive(): boolean {
    return true;
  }

  tick(game: GameImpl): void {
    const day = game.day;
    game.events = game.events.filter((e) => {
      if (e.endsDay > day) return true;
      game.news(`${EVENT_INFO[e.kind].title} is over.`, 'info');
      return false;
    });
    if (game.forecasts.length === 0 && day >= this.nextDay - CONFIG.events.warningDays) {
      const kind = game.rng.pick<MarketEventKind>(['recession', 'supplierHike', 'boom']);
      game.forecasts.push({ kind, startsDay: this.nextDay });
      const info = EVENT_INFO[kind];
      game.news(`🔮 Economists expect a ${info.title.toLowerCase()} in ${Math.round(this.nextDay - day)} days: ${info.text}`, 'info');
    }
    if (day < this.nextDay) return;
    for (const f of game.forecasts) {
      const info = EVENT_INFO[f.kind];
      game.events.push({ kind: f.kind, endsDay: day + info.days });
      game.news(`${info.title}! ${info.text}`, f.kind === 'boom' ? 'good' : 'bad');
    }
    game.forecasts = [];
    this.nextDay = day + game.rng.range(CONFIG.events.minGap, CONFIG.events.maxGap);
  }
}
