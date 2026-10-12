import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

/**
 * The competition authority (antitrust). A company serving too large a share
 * of the city's customers is warned; if it stays dominant, it is fined and
 * must sell part of its business, as regulators do with monopolies.
 */
export class CompetitionAuthorityExecution implements Execution {
  private totalCustomers = 0;
  private dominantSince = new Map<number, number>();
  private lastAction = new Map<number, number>();
  private warned = new Set<number>();

  init(game: GameImpl): void {
    for (let i = 0; i < game.map.size; i++) this.totalCustomers += game.map.demand[i];
  }

  isActive(): boolean {
    return true;
  }

  tick(game: GameImpl): void {
    if (!game.isNewDay()) return;
    const A = CONFIG.antitrust;
    for (const c of game.companies) {
      if (!c.alive) continue;
      const share = c.customers / this.totalCustomers;
      if (share < A.warnShare) {
        this.warned.delete(c.id);
        this.dominantSince.delete(c.id);
        continue;
      }
      if (!this.warned.has(c.id)) {
        this.warned.add(c.id);
        const text = `🏛️ The competition authority is watching ${c.name}: it serves ${pct(share)} of the city's customers. Above ${pct(A.actShare)} for ${A.graceDays} days means a fine and forced sales.`;
        if (c.isBot) game.news(text, 'info');
        else game.message(c.id, text, 'bad');
      }
      if (share < A.actShare) {
        this.dominantSince.delete(c.id);
        continue;
      }
      if (!this.dominantSince.has(c.id)) this.dominantSince.set(c.id, game.day);
      const since = this.dominantSince.get(c.id)!;
      const last = this.lastAction.get(c.id) ?? -Infinity;
      if (game.day - since < A.graceDays || game.day - last < A.cooldownDays) continue;
      // Fine and forced divestment.
      const fine = c.pnl.revenue * A.fineRevenueDays;
      c.cash -= fine;
      c.oneOff.legalFees -= fine;
      const sold = game.releaseScattered(c.id, Math.floor(c.tiles * A.divestShare), 8);
      this.lastAction.set(c.id, game.day);
      this.dominantSince.delete(c.id);
      game.news(`🏛️ Antitrust ruling: ${c.name} is fined ${money(fine)} and must give up ${sold} streets to restore competition.`, c.isBot ? 'good' : 'bad');
    }
  }
}
