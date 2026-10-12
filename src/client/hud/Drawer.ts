import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { History } from '../History';
import { $, el } from './dom';
import { Sparkline } from './Sparkline';

export type DrawerKind = 'finances' | 'lawsuit';

/** A panel that slides in over the map for less frequent decisions. */
export class Drawer {
  readonly root: HTMLElement;
  private kind: DrawerKind | null = null;
  private valueChart = new Sparkline('Valuation', '#60a5fa');
  private profitChart = new Sparkline('Profit per day', '#a78bfa');

  constructor(
    private game: GameImpl,
    private sendIntent: (intent: Intent) => void,
    private history: History,
  ) {
    this.root = el('aside', 'drawer glass', '');
    this.root.hidden = true;
  }

  toggle(kind: DrawerKind): void {
    if (this.kind === kind) return this.close();
    this.kind = kind;
    this.root.hidden = false;
    this.root.innerHTML = `<button class="close" aria-label="Close">✕</button>${kind === 'finances' ? this.financesHtml() : this.lawsuitHtml()}`;
    $(this.root, '.close').addEventListener('click', () => this.close());
    if (kind === 'finances') this.root.querySelector('[data-v="charts"]')!.append(this.valueChart.root, this.profitChart.root);
    this.bind();
    this.update();
  }

  close(): void {
    this.kind = null;
    this.root.hidden = true;
  }

  private financesHtml(): string {
    const b = CONFIG.bank;
    return `<h2>🏦 Finances</h2>
      <div data-v="charts" class="charts"></div>
      <h3>Profit &amp; loss <small>per day</small></h3>
      <table class="pnl">
        <tr><td>Revenue <small>customers served × spend × price</small></td><td data-v="revenue" class="pos"></td></tr>
        <tr><td>− Variable costs <small>${money(CONFIG.variableCostPerCustomer)} per customer</small></td><td data-v="variableCost" class="neg"></td></tr>
        <tr><td>− Salaries <small>${money(CONFIG.staff.salaryPerDay)} per person</small></td><td data-v="salaries" class="neg"></td></tr>
        <tr><td>− Interest <small>${pct(b.interestPerYear)} a year on debt</small></td><td data-v="interest" class="neg"></td></tr>
        <tr class="total"><td>= Profit</td><td data-v="profit"></td></tr>
      </table>
      <h3>Valuation</h3>
      <table class="pnl">
        <tr><td>Cash</td><td data-v="vCash"></td></tr>
        <tr><td>− Debt</td><td data-v="vDebt" class="neg"></td></tr>
        <tr><td>+ ${CONFIG.valuation.earningsMultiple}× yearly profit <small>based on average daily profit over the last ${CONFIG.valuation.profitWindowDays} days, so it reacts with a delay</small></td><td data-v="vEarnings"></td></tr>
        <tr class="total"><td>= Valuation</td><td data-v="vTotal"></td></tr>
      </table>
      <p class="tip">💡 Investors pay for profit, not size: a small company with fat margins can be worth more than a big one losing money. Investing (hiring) lowers profit at first, so your valuation can dip before it grows.</p>
      <h3>One-off cash flows <small>since the start, not in the daily P&amp;L</small></h3>
      <table class="pnl">
        <tr><td>Recruiting <small>${money(CONFIG.staff.hireCost)} per hire</small></td><td data-v="ooHiring"></td></tr>
        <tr><td>Severance <small>${money(CONFIG.staff.fireCost)} per person let go</small></td><td data-v="ooSeverance"></td></tr>
        <tr><td>Legal fees</td><td data-v="ooLegal"></td></tr>
        <tr><td>Lawsuit damages <small>received (+) or paid (−)</small></td><td data-v="ooDamages"></td></tr>
      </table>
      <h3>Bank</h3>
      <div class="row"><span>Debt</span><b data-v="debt"></b></div>
      <div class="row small"><span>Credit limit (${b.maxDebtRevenueDays} days of revenue)</span><span data-v="limit"></span></div>
      <div class="buttons">
        <button data-bank="borrow">Borrow ${money(b.loanChunk)}</button>
        <button data-bank="repay" class="ghost">Repay ${money(b.loanChunk)}</button>
      </div>
      <p class="tip">💡 A loan pays for growth now, but interest is due every day, even in a recession.</p>`;
  }

  private lawsuitHtml(): string {
    const L = CONFIG.lawsuit;
    return `<h2>⚖️ Unfair-competition lawsuit</h2>
      <p>Accuse a rival of unfair practices (misleading ads, poaching staff, predatory pricing) and claim damages. Legal fees: <b>${money(L.cost)}</b>. The ruling comes in <b>${L.courtDays} days</b>, and everyone sees it coming.</p>
      <ul class="facts">
        <li>✅ If the court agrees (${pct(1 - L.dismissChance)} chance): they pay you <b>${L.damagesRevenueDays} days</b> of their revenue in damages, and the bad press drives away <b>${pct(L.customerLoss)}</b> of their customers all over the city.</li>
        <li>❌ If it's dismissed (${pct(L.dismissChance)}): you pay their ${money(L.dismissedCounterCost)} legal costs.</li>
        <li>One case at a time. Fees and damages show up in Finances under one-off cash flows.</li>
      </ul>
      <div class="sue-row"><select data-input="target" aria-label="Rival to sue"></select><button data-act="sue" class="danger">Sue for ${money(L.cost)}</button></div>
      <div data-v="cases"></div>
      <p class="tip">💡 Legal risk is a real business cost: even a strong company can lose a quarter of its market in one ruling.</p>`;
  }

  private bind(): void {
    const send = (i: Record<string, unknown>) => this.sendIntent({ ...i, companyId: 0 } as Intent);
    this.root.querySelectorAll<HTMLButtonElement>('[data-bank]').forEach((b) =>
      b.addEventListener('click', () => send({ type: b.dataset.bank })),
    );
    this.root.querySelector('[data-act="sue"]')?.addEventListener('click', () => {
      const target = Number($<HTMLSelectElement>(this.root, '[data-input="target"]').value);
      if (!Number.isNaN(target)) send({ type: 'lawsuit', targetId: target });
    });
  }

  private set(key: string, text: string, cls?: string): void {
    const e = this.root.querySelector<HTMLElement>(`[data-v="${key}"]`);
    if (!e) return;
    e.textContent = text;
    if (cls !== undefined) e.className = cls;
  }

  update(): void {
    if (!this.kind) return;
    const g = this.game;
    const c = g.player;
    if (this.kind === 'finances') {
      const p = c.pnl;
      this.set('revenue', money(p.revenue));
      this.set('variableCost', money(p.variableCost));
      this.set('salaries', money(p.salaries));
      this.set('interest', money(p.interest));
      this.set('profit', money(p.profit), p.profit >= 0 ? 'pos' : 'neg');
      const v = g.valuation(c);
      this.set('vCash', money(v.cash));
      this.set('vDebt', money(v.debt));
      this.set('vEarnings', money(v.earnings));
      this.set('vTotal', money(v.total));
      this.set('debt', money(c.debt));
      this.set('limit', money(g.maxDebt(c)));
      const signed = (v: number) => [money(v), v > 0 ? 'pos' : v < 0 ? 'neg' : ''] as const;
      this.set('ooHiring', ...signed(c.oneOff.hiring));
      this.set('ooSeverance', ...signed(c.oneOff.severance));
      this.set('ooLegal', ...signed(c.oneOff.legalFees));
      this.set('ooDamages', ...signed(c.oneOff.damages));
      if (g.tick % 10 === 0) {
        this.valueChart.update(this.history.valuation);
        this.profitChart.update(this.history.profit);
      }
      return;
    }
    const select = $<HTMLSelectElement>(this.root, '[data-input="target"]');
    const rivals = g.companies.filter((r) => r.alive && r.id !== c.id);
    const key = rivals.map((r) => r.id).join(',');
    if (select.dataset.key !== key) {
      select.innerHTML = rivals.map((r) => `<option value="${r.id}">${r.name} · ${money(g.valuation(r).total)}</option>`).join('');
      select.dataset.key = key;
    }
    const sue = $<HTMLButtonElement>(this.root, '[data-act="sue"]');
    const busy = g.activeLawsuitBy(c);
    sue.disabled = !!busy || c.cash < CONFIG.lawsuit.cost || rivals.length === 0;
    sue.title = busy ? 'Your lawyers are busy with a case' : c.cash < CONFIG.lawsuit.cost ? 'Not enough cash for the legal fees' : '';
    const mine = g.lawsuits.filter((l) => l.plaintiff === c.id || l.defendant === c.id);
    $(this.root, '[data-v="cases"]').innerHTML = mine
      .map((l) => {
        const days = Math.ceil(l.rulingDay - g.day);
        return l.plaintiff === c.id
          ? `<div class="case attack">You v. ${g.companies[l.defendant].name}: ruling in ${days} days</div>`
          : `<div class="case defend">${g.companies[l.plaintiff].name} is suing you! Ruling in ${days} days.</div>`;
      })
      .join('');
  }
}
