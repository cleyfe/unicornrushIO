import { WATER } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, rgb } from './dom';

/** Leaderboard plus the news feed, shown under the map. */
export class Leaderboard {
  readonly root: HTMLElement;
  private land: number;

  constructor(private game: GameImpl) {
    this.land = game.owner.reduce((s, o) => s + (o === WATER ? 0 : 1), 0);
    this.root = document.createElement('div');
    this.root.className = 'board';
    this.root.innerHTML = `<section class="panel leaders"><h3>Leaderboard</h3><table data-v="leaders"></table></section>
      <section class="panel news"><h3>News</h3><ul data-v="news"></ul></section>`;
  }

  update(): void {
    const g = this.game;
    const rows = [...g.companies]
      .sort((a, b) => g.valuation(b).total - g.valuation(a).total || b.tiles - a.tiles)
      .map((c) => {
        const status = c.alive ? `${pct(c.tiles / this.land)} share` : 'closed';
        return `<tr class="${c.alive ? '' : 'dead'} ${c.isBot ? '' : 'me'}">
          <td><i style="background:${rgb(c.color)}"></i>${c.name}</td>
          <td>${CONFIG.prices[c.price].label}</td><td>${status}</td><td>${money(g.valuation(c).total)}</td></tr>`;
      })
      .join('');
    $(this.root, '[data-v="leaders"]').innerHTML =
      `<tr><th>Company</th><th>Price</th><th>Market</th><th>Value</th></tr>${rows}`;
    // Public news, plus private confirmations for the player (errors are toasts).
    $(this.root, '[data-v="news"]').innerHTML = g.log
      .filter((l) => l.recipient === undefined || (l.recipient === 0 && l.tone !== 'error'))
      .slice(-7)
      .reverse()
      .map((l) => `<li class="${l.tone}"><span>D${l.day}</span>${l.text}</li>`)
      .join('');
  }
}
