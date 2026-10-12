import type { MarketEventKind } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';


/** Starts and ends economy-wide shocks every few months. */
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
    if (day < this.nextDay) return;
    const kind = game.rng.pick<MarketEventKind>(['recession', 'supplierHike', 'boom']);
    const info = EVENT_INFO[kind];
    game.events.push({ kind, endsDay: day + info.days });
    game.news(`${info.title}! ${info.text}`, kind === 'boom' ? 'good' : 'bad');
    this.nextDay = day + game.rng.range(CONFIG.events.minGap, CONFIG.events.maxGap);
  }
}
