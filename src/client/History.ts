import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { Sample } from './hud/Sparkline';

/** Records valuations (every company) and the player's daily profit once per game day, for charts. */
export class History {
  readonly valuation: Sample[] = [];
  readonly profit: Sample[] = [];
  /** Valuation per company per day; null once a company has closed. */
  readonly race: { day: number; values: (number | null)[] }[] = [];
  private lastDay = -1;

  constructor(private game: GameImpl) {}

  update(): void {
    const g = this.game;
    const day = Math.floor(g.day);
    if (day === this.lastDay) return;
    this.lastDay = day;
    const me = g.player;
    this.valuation.push({ day, value: g.valuation(me).total });
    this.profit.push({ day, value: me.pnl.profit });
    this.race.push({ day, values: g.companies.map((c) => (c.alive ? g.valuation(c).total : null)) });
  }
}
