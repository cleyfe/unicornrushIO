import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, el, rgb, unicornProgress } from './dom';

/** Top-right: every company's race to a $1B valuation. */
export class RaceBoard {
  readonly root: HTMLElement;

  constructor(private game: GameImpl) {
    this.root = el('section', 'race glass', `<h3>Race to $1B 🦄</h3><ol data-v="rows"></ol>`);
  }

  update(): void {
    const g = this.game;
    const rows = [...g.companies]
      .sort((a, b) => g.valuation(b).total - g.valuation(a).total)
      .map((c) => {
        const v = g.valuation(c).total;
        const share = c.tiles / g.map.size;
        return `<li class="${c.alive ? '' : 'dead'} ${c.isBot ? '' : 'me'}" title="${c.name}: ${CONFIG.prices[c.price].label} prices · ${pct(share)} of streets">
          <div class="race-name"><i style="background:${rgb(c.color)}"></i>${c.isBot ? c.name : `${c.name} (you)`}<span>${c.alive ? money(v) : 'closed'}</span></div>
          <div class="race-sub">${c.alive ? `${pct(share)} of streets · <span class="${c.pnl.profit >= 0 ? 'pos' : 'neg'}">${c.pnl.profit >= 0 ? '+' : ''}${money(c.pnl.profit)}/day</span>` : ''}</div>
          <div class="race-bar"><div style="width:${pct(c.alive ? unicornProgress(v) : 0)};background:${rgb(c.color)}"></div></div>
        </li>`;
      })
      .join('');
    $(this.root, '[data-v="rows"]').innerHTML = rows;
  }
}
