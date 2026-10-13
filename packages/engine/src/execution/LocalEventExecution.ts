import type { LocalEvent, LocalEventKind } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { LOCAL_EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

const E = CONFIG.localEvents;
/** How long a permanent change stays highlighted on the map once it opens. */
const SHOW_PERMANENT_DAYS = 30;

/**
 * Things happening in one part of the city: a new metro station (more
 * customers, for good), roadworks (they spend less for a while), a festival
 * (they spend more for a while). Each is announced in advance, so you can
 * race to be there first, or get out of the way.
 */
export class LocalEventExecution implements Execution {
  private nextDay: number = E.firstDay;
  private radius = 0;

  init(game: GameImpl): void {
    this.radius = game.cityWidth() * E.radiusShare;
  }

  isActive(): boolean {
    return true;
  }

  tick(game: GameImpl): void {
    if (!game.isNewDay()) return;
    const day = game.day;
    for (const e of game.localEvents) {
      const fx = E[e.kind];
      if (!e.active && day >= e.startsDay && (e.endsDay === null || day < e.endsDay)) {
        e.active = true;
        game.scaleStreets(e.streets, fx.demand, fx.spend);
        game.news(`${LOCAL_EVENT_INFO[e.kind].icon} ${LOCAL_EVENT_INFO[e.kind].started} ${game.placeName(e.center)}: ${LOCAL_EVENT_INFO[e.kind].effect}`, e.kind === 'roadworks' ? 'bad' : 'good');
      } else if (e.active && e.endsDay !== null && day >= e.endsDay) {
        e.active = false;
        game.scaleStreets(e.streets, 1 / fx.demand, 1 / fx.spend);
        game.news(`${LOCAL_EVENT_INFO[e.kind].icon} ${LOCAL_EVENT_INFO[e.kind].ended} ${game.placeName(e.center)}.`, 'info');
      }
    }
    // Finished events leave the list; permanent ones once they've had their moment.
    game.localEvents = game.localEvents.filter((e) =>
      e.endsDay === null ? day < e.startsDay + SHOW_PERMANENT_DAYS : e.active || day < e.startsDay,
    );
    if (day < this.nextDay) return;
    this.nextDay = day + game.rng.range(E.minGap, E.maxGap);
    this.announce(game);
  }

  private announce(game: GameImpl): void {
    const roll = game.rng.next();
    const kind: LocalEventKind = roll < 0.4 ? 'metro' : roll < 0.7 ? 'roadworks' : 'festival';
    const center = game.rng.int(0, game.map.size);
    const startsDay = game.day + E.warningDays;
    const days = E[kind].days;
    const event: LocalEvent = {
      kind,
      center,
      radius: this.radius,
      streets: game.streetsNear(center, this.radius),
      startsDay,
      endsDay: days === null ? null : startsDay + days,
      active: false,
    };
    game.localEvents.push(event);
    const info = LOCAL_EVENT_INFO[kind];
    game.news(`${info.icon} ${info.announced} ${game.placeName(center)} in ${E.warningDays} days: ${info.effect}`, 'info');
  }
}
