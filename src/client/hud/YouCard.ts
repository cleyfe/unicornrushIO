import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, el, rgb, unicornProgress } from './dom';

/** Where each day's money goes, drawn as one bar: costs eat into revenue, what's left is profit. */
const FLOW = [
  { key: 'salaries', label: 'Salaries', color: '#f87171' },
  { key: 'variableCost', label: 'Supplies', color: '#fb923c' },
  { key: 'interest', label: 'Interest', color: '#c084fc' },
] as const;

/** Top-left: how your company is doing, at a glance. */
export class YouCard {
  readonly root: HTMLElement;
  private spentSoFar = 0;

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
        <button class="link" data-act="finances" title="Finances (F)">🏦</button></div>
      <div class="you-value" title="Valuation = cash − debt + ${CONFIG.valuation.earningsMultiple}× yearly profit"><span data-v="value"></span><small>valuation</small></div>
      <div class="unicorn-bar" title="Progress to $1B (log scale)"><div data-v="bar"></div><span data-v="barText"></span></div>
      <div class="cash-row">
        <div title="Cash in the bank. Below zero for ${CONFIG.bankruptcyGraceDays} days = bankrupt."><small>Cash</small><b data-v="cash"></b><span class="spend-pops" data-v="pops"></span></div>
        <div title="Revenue minus every cost, per day"><small>Profit / day</small><b data-v="profit"></b></div>
      </div>
      <div class="flow" title="Every day: revenue (full bar) minus costs. Green is what you keep.">
        <div class="flow-bar" data-v="flowBar"></div>
        <div class="flow-legend" data-v="flowLegend"></div>
      </div>
      <div class="you-stake" data-v="stake" hidden></div>
      <div class="alert" data-v="alert" hidden></div>`,
    );
    $(this.root, '[data-act="finances"]').addEventListener('click', onFinances);
    $(this.root, '[data-act="locate"]').addEventListener('click', onLocate);
    this.spentSoFar = this.spent();
  }

  /** One-off spending so far (hiring, ads, guards, legal fees…), as a positive number. */
  private spent(): number {
    const o = this.game.player.oneOff;
    return -(o.hiring + o.severance + o.advertising + o.guards + o.acquisitions + o.legalFees + Math.min(0, o.damages));
  }

  update(): void {
    const g = this.game;
    const c = g.player;
    const v = g.valuation(c).total;
    $(this.root, '[data-v="value"]').textContent = money(v);
    $(this.root, '[data-v="bar"]').style.width = pct(unicornProgress(v));
    $(this.root, '[data-v="barText"]').textContent = `🦄 ${money(Math.max(0, v))} of $1B${c.peakValuation > v * 1.15 ? ` · peak ${money(c.peakValuation)}` : ''}`;
    const cash = $(this.root, '[data-v="cash"]');
    cash.textContent = money(c.cash);
    cash.className = c.cash < 0 ? 'neg' : '';
    const p = $(this.root, '[data-v="profit"]');
    p.textContent = `${c.pnl.profit >= 0 ? '+' : ''}${money(c.pnl.profit)}`;
    p.className = c.pnl.profit >= 0 ? 'pos' : 'neg';

    // Spending pops: every one-off payment flashes next to your cash.
    const spent = this.spent();
    if (spent - this.spentSoFar >= 1) this.pop(spent - this.spentSoFar);
    this.spentSoFar = spent;

    this.drawFlow();

    const stake = $(this.root, '[data-v="stake"]');
    stake.hidden = c.stake > 0.999;
    stake.textContent = `💼 You own ${pct(c.stake)}: ${money(Math.max(0, v) * c.stake)}`;

    const alert = $(this.root, '[data-v="alert"]');
    let msg = '';
    if (c.cash < 0) msg = `Out of cash! Bankrupt in ${Math.max(0, CONFIG.bankruptcyGraceDays - c.negativeCashDays).toFixed(0)} days.`;
    else if (c.pnl.profit < 0 && c.cash / -c.pnl.profit < 60) msg = `Cash lasts ${Math.floor(c.cash / -c.pnl.profit)} days`;
    else if (g.onStrike(c) && g.coverage(c) < 1) msg = '✊ On strike: customers going unserved';
    else if (g.coverage(c) < 1) msg = `Overloaded: ${pct(1 - g.coverage(c))} of customers unserved`;
    alert.hidden = !msg;
    alert.textContent = msg;
  }

  private drawFlow(): void {
    const p = this.game.player.pnl;
    const costs = FLOW.map((f) => ({ ...f, value: Math.max(0, p[f.key]) }));
    const totalCost = costs.reduce((s, f) => s + f.value, 0);
    // The bar spans revenue, or costs when they're bigger (a loss).
    const span = Math.max(p.revenue, totalCost, 1);
    const seg = (w: number, color: string, tip: string) =>
      w > 0.002 ? `<i style="width:${(w * 100).toFixed(1)}%;background:${color}" title="${tip}"></i>` : '';
    const kept = Math.max(0, p.revenue - totalCost);
    const html =
      costs.map((f) => seg(f.value / span, f.color, `${f.label}: ${money(f.value)}/day`)).join('') +
      seg(kept / span, 'var(--pos)', `Profit: ${money(kept)}/day`);
    const bar = $(this.root, '[data-v="flowBar"]');
    if (bar.dataset.html !== html) {
      bar.dataset.html = html;
      bar.innerHTML = html;
    }
    bar.classList.toggle('loss', totalCost > p.revenue);
    $(this.root, '[data-v="flowLegend"]').innerHTML =
      `<span>Revenue ${money(p.revenue)}</span>` +
      costs
        .filter((f) => f.value >= 1)
        .map((f) => `<span><i style="background:${f.color}"></i>${f.label} ${money(f.value)}</span>`)
        .join('');
  }

  private pop(amount: number): void {
    const e = el('span', 'spend-pop', `−${money(amount)}`);
    $(this.root, '[data-v="pops"]').append(e);
    e.addEventListener('animationend', () => e.remove());
  }
}
