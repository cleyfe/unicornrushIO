import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { Sample } from './hud/Sparkline';

/** Records the player's valuation and daily profit once per game day, for charts. */
export class History {
  readonly valuation: Sample[] = [];
  readonly profit: Sample[] = [];
  private lastDay = -1;

  constructor(private game: GameImpl) {}

  update(): void {
    const day = Math.floor(this.game.day);
    if (day === this.lastDay) return;
    this.lastDay = day;
    const me = this.game.player;
    this.valuation.push({ day, value: this.game.valuation(me).total });
    this.profit.push({ day, value: me.pnl.profit });
  }
}
