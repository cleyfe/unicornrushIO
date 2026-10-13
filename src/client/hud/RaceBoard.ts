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
    // Big matches: show the top of the race, plus you wherever you are.
    const ranked = [...g.companies].sort((a, b) => g.valuation(b).total - g.valuation(a).total);
    const shown = ranked.length <= 6 ? ranked : ranked.filter((c, i) => i < 5 || c.id === 0);
    const hidden = ranked.length - shown.length;
    const rows = shown
      .map((c) => {
        const v = g.valuation(c).total;
        const margin = c.pnl.revenue > 0 ? c.pnl.profit / c.pnl.revenue : 0;
        return `<li class="${c.alive ? '' : 'dead'} ${c.isBot ? '' : 'me'}" title="${c.name}: ${CONFIG.prices[c.price].label} prices · margin ${pct(margin)} · ${c.tiles} streets · defence ×${g.defence(c).toFixed(1)}">
          <div class="race-name"><i style="background:${rgb(c.color)}"></i>${c.isBot ? c.name : `${c.name} (you)`}<span>${c.alive ? money(v) : 'closed'}</span></div>
          <div class="race-sub">${c.alive ? `<span class="${c.pnl.profit >= 0 ? 'pos' : 'neg'}">${c.pnl.profit >= 0 ? '+' : ''}${money(c.pnl.profit)}/day</span>` : ''}</div>
          <div class="race-bar"><div style="width:${pct(c.alive ? unicornProgress(v) : 0)};background:${rgb(c.color)}"></div></div>
        </li>`;
      })
      .join('') + (hidden > 0 ? `<li class="race-more">+ ${hidden} more companies · 📈 Race (R)</li>` : '');
    $(this.root, '[data-v="rows"]').innerHTML = rows;
  }
}
