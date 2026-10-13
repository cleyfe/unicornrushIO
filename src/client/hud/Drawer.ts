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
  /** Called with true when a drawer opens and false when it closes (to pause the game). */
  onOpenChange: (open: boolean) => void = () => {};
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
    if (!this.kind) this.onOpenChange(true);
    this.kind = kind;
    this.root.hidden = false;
    this.root.innerHTML = `<button class="close" aria-label="Close">✕</button>${kind === 'finances' ? this.financesHtml() : this.lawsuitHtml()}`;
    $(this.root, '.close').addEventListener('click', () => this.close());
    if (kind === 'finances') this.root.querySelector('[data-v="charts"]')!.append(this.valueChart.root, this.profitChart.root);
    this.bind();
    this.update();
  }

  close(): void {
    if (this.kind) this.onOpenChange(false);
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
        <tr><td>− Variable costs <small data-v="varNote"></small></td><td data-v="variableCost" class="neg"></td></tr>
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
        <tr><td>Advertising <small>cash turned into sales push</small></td><td data-v="ooAds"></td></tr>
        <tr><td>Legal fees and fines</td><td data-v="ooLegal"></td></tr>
        <tr><td>Lawsuit damages <small>received (+) or paid (−)</small></td><td data-v="ooDamages"></td></tr>
      </table>
      <h3>Bank</h3>
      <div class="row"><span>Debt</span><b data-v="debt"></b></div>
      <div class="row small"><span>Credit limit (${b.maxDebtRevenueDays} days of revenue)</span><span data-v="limit"></span></div>
      <div class="buttons">
        <button data-bank="borrow">Borrow ${money(b.loanChunk)}</button>
        <button data-bank="repay" class="ghost">Repay ${money(b.loanChunk)}</button>
      </div>
      <p class="tip">💡 A loan pays for growth now (more staff, more ads), but interest is due every day, even in a recession. Borrow when each dollar earns more than ${pct(CONFIG.bank.interestPerYear)} a year.</p>`;
  }

  private lawsuitHtml(): string {
    const L = CONFIG.lawsuit;
    return `<h2>⚖️ Unfair-competition lawsuit</h2>
      <p>Sue a rival that hurt your business unfairly. The court looks at the <b>evidence</b>: streets they took from you recently (poaching your customers), and predatory pricing if they sell cheap. Ruling in <b>${L.courtDays} days</b>.</p>
      <p class="fee-line">Your legal fees: <b data-v="fee"></b> <small>(${L.feeRevenueDays} days of your revenue, at least ${money(L.minFee)}: small companies pay less up front). If you win, your lawyers keep ${pct(L.lawyerShare)} of the damages.</small></p>
      <table class="cases-table">
        <tr><th>Rival</th><th title="Streets they took from you recently (older ones count less)">Evidence</th><th>Win chance</th><th title="Your lost profits on those streets, after your lawyers' share">You'd get</th><th title="Average result after fees and risk">Worth it?</th><th></th></tr>
        <tbody data-v="caseRows"></tbody>
      </table>
      <ul class="facts">
        <li>✅ If you win: they pay your lost profits as damages, and bad press drives away ${pct(L.customerLoss)} of their customers.</li>
        <li>❌ If you lose: you also pay their legal costs, ${pct(L.dismissedCostShare)} of your fee (<span data-v="counter"></span>).</li>
      </ul>
      <div data-v="cases"></div>
      <p class="tip">💡 Courts decide on evidence, not on who is winning. Suing without a case is an expensive bet.</p>`;
  }

  private bind(): void {
    const send = (i: Record<string, unknown>) => this.sendIntent({ ...i, companyId: 0 } as Intent);
    this.root.querySelectorAll<HTMLButtonElement>('[data-bank]').forEach((b) =>
      b.addEventListener('click', () => send({ type: b.dataset.bank })),
    );
    // Rows are redrawn, so listen on the drawer itself.
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sue]');
      if (b && !b.disabled) send({ type: 'lawsuit', targetId: Number(b.dataset.sue) });
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
      const mult = g.variableCostMult(c);
      const why = mult > 1 ? ' (supplier price hike!)' : mult < 1 ? ' (supplier deal)' : '';
      this.set('varNote', `${money(CONFIG.variableCostPerCustomer * mult)} per purchase${why}`);
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
      this.set('ooAds', ...signed(c.oneOff.advertising));
      this.set('ooDamages', ...signed(c.oneOff.damages));
      if (g.tick % 10 === 0) {
        this.valueChart.update(this.history.valuation);
        this.profitChart.update(this.history.profit);
      }
      return;
    }
    const L = CONFIG.lawsuit;
    const rivals = g.companies.filter((r) => r.alive && r.id !== c.id);
    const cases = rivals
      .map((r) => {
        const p = g.lawsuitWinChance(c.id, r.id);
        const damages = g.lawsuitDamages(c.id, r.id);
        return { r, p, damages: damages * (1 - L.lawyerShare), value: g.lawsuitValue(c.id, r.id), evidence: g.streetsTaken(r.id, c.id) };
      })
      .sort((a, b) => b.value - a.value);
    const busy = g.activeLawsuitBy(c);
    const fee = g.lawsuitFee(c);
    this.set('fee', money(fee));
    this.set('counter', money(fee * L.dismissedCostShare));
    const blocked = busy ? 'Your lawyers are busy with a case' : c.cash < fee ? `Legal fees are ${money(fee)}` : '';
    const rowsHtml = cases
      .map(
        (k) => `<tr><td><i style="background:rgb(${k.r.color.join(',')})"></i>${k.r.name}</td>
          <td>${k.evidence >= 0.5 ? `took ${Math.round(k.evidence)} streets` : 'none'}${k.r.price === 'low' ? ' · cheap' : ''}</td>
          <td>${pct(k.p)}</td><td>${money(k.damages)}</td>
          <td class="${k.value > 0 ? 'pos' : 'neg'}">${k.value > 0 ? '+' : ''}${money(k.value)}</td>
          <td><button class="danger sue-btn" data-sue="${k.r.id}" ${blocked ? 'disabled' : ''} title="${blocked || `Sue ${k.r.name} for ${money(fee)} in fees`}">Sue</button></td></tr>`,
      )
      .join('');
    // Only redraw when something changed, so buttons don't flicker under the mouse.
    const rows = $(this.root, '[data-v="caseRows"]');
    if (rows.dataset.html !== rowsHtml) {
      rows.dataset.html = rowsHtml;
      rows.innerHTML = rowsHtml;
    }
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
