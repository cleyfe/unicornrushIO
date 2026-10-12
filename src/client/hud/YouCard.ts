import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, el, rgb, unicornProgress } from './dom';

/** Top-left: how your company is doing, at a glance. */
export class YouCard {
  readonly root: HTMLElement;

  constructor(
    private game: GameImpl,
    onFinances: () => void,
    onLocate: () => void,
  ) {
    const me = game.player;
    this.root = el(
      'section',
      'you-card glass',
      `<div class="you-head"><i style="background:${rgb(me.color)}"></i><b>${me.name}</b>
        <button class="link" data-act="locate" title="Show my company on the map">📍</button>
        <button class="link" data-act="finances">Finances ▸</button></div>
      <div class="you-value" title="Valuation = cash − debt + ${CONFIG.valuation.earningsMultiple}× yearly profit. Investors pay for profit, not size."><span data-v="value"></span><small>valuation</small></div>
      <div class="unicorn-bar" title="Progress to a $1B valuation (log scale: each third is ×10)"><div data-v="bar"></div><span data-v="barText"></span></div>
      <div class="kpis">
        <div title="Money in the bank. Below zero for ${CONFIG.bankruptcyGraceDays} days = bankrupt."><small>Cash</small><b data-v="cash"></b></div>
        <div title="Revenue minus all costs, per day"><small>Profit / day</small><b data-v="profit"></b></div>
        <div title="Share of your customers your operations team can serve"><small>Served</small><b data-v="served"></b></div>
      </div>
      <div class="alert" data-v="alert" hidden></div>`,
    );
    $(this.root, '[data-act="finances"]').addEventListener('click', onFinances);
    $(this.root, '[data-act="locate"]').addEventListener('click', onLocate);
  }

  update(): void {
    const g = this.game;
    const c = g.player;
    const v = g.valuation(c).total;
    $(this.root, '[data-v="value"]').textContent = money(v);
    $(this.root, '[data-v="bar"]').style.width = pct(unicornProgress(v));
    $(this.root, '[data-v="barText"]').textContent = `🦄 ${money(Math.max(0, v))} of $1B`;
    $(this.root, '[data-v="cash"]').textContent = money(c.cash);
    $(this.root, '[data-v="cash"]').className = c.cash < 0 ? 'neg' : '';
    const p = $(this.root, '[data-v="profit"]');
    p.textContent = `${c.pnl.profit >= 0 ? '+' : ''}${money(c.pnl.profit)}`;
    p.className = c.pnl.profit >= 0 ? 'pos' : 'neg';
    const cover = g.coverage(c);
    const served = $(this.root, '[data-v="served"]');
    served.textContent = pct(cover);
    served.className = cover < 1 ? 'neg' : 'pos';

    const alert = $(this.root, '[data-v="alert"]');
    let msg = '';
    if (c.cash < 0) msg = `Out of cash! Bankrupt in ${Math.max(0, CONFIG.bankruptcyGraceDays - c.negativeCashDays).toFixed(0)} days. Borrow, fire staff or raise prices.`;
    else if (c.pnl.profit < 0 && c.cash / -c.pnl.profit < 30) msg = `Losing money: cash runs out in ~${Math.floor(c.cash / -c.pnl.profit)} days.`;
    else if (cover < 1) msg = 'Overloaded: unserved customers are leaving. Move staff to Operations or hire.';
    alert.hidden = !msg;
    alert.textContent = msg;
  }
}
