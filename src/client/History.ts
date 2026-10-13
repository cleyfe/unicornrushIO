import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { Sample } from './hud/Sparkline';

/** Records valuations (every company) and the player's daily profit once per game day, for charts. */
export class History {
  readonly valuation: Sample[] = [];
  readonly profit: Sample[] = [];
  /** Valuation per company per day; null once a company has closed. */
  readonly race: { day: number; values: (number | null)[] }[] = [];
  /** The player's state each day, for the end-of-match "what happened". */
  readonly player: { day: number; cash: number; profit: number; tiles: number; oneOff: Record<string, number> }[] = [];
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
    if (me.alive) this.player.push({ day, cash: me.cash, profit: me.pnl.profit, tiles: me.tiles, oneOff: { ...me.oneOff } });
    this.race.push({ day, values: g.companies.map((c) => (c.alive ? g.valuation(c).total : null)) });
  }
}
