import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { History } from '../History';
import { $, el } from './dom';
import { RaceChart } from './RaceChart';
import { Sparkline } from './Sparkline';

export type DrawerKind = 'finances' | 'lawsuit' | 'race';

/** A panel that slides in over the map for less frequent decisions. */
export class Drawer {
  readonly root: HTMLElement;
  private kind: DrawerKind | null = null;
  private valueChart = new Sparkline('Valuation', '#60a5fa');
  private profitChart = new Sparkline('Profit per day', '#a78bfa');
  private raceChart: RaceChart;

  constructor(
    private game: GameImpl,
    private sendIntent: (intent: Intent) => void,
    private history: History,
  ) {
    this.root = el('aside', 'drawer glass', '');
    this.root.hidden = true;
    this.raceChart = new RaceChart(game, history);
    // Contents are redrawn, so listen once on the drawer itself.
    const send = (i: Record<string, unknown>) => this.sendIntent({ ...i, companyId: 0 } as Intent);
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sue], [data-bank]');
      if (!b || b.disabled) return;
      if (b.dataset.sue) send({ type: 'lawsuit', targetId: Number(b.dataset.sue) });
      else send({ type: b.dataset.bank });
    });
  }

  toggle(kind: DrawerKind): void {
    if (this.kind === kind) return this.close();
    this.kind = kind;
    this.root.hidden = false;
    const html = { finances: this.financesHtml, lawsuit: this.lawsuitHtml, race: this.raceHtml }[kind].call(this);
    this.root.innerHTML = `<button class="close" aria-label="Close">✕</button>${html}`;
    this.root.classList.toggle('wide', kind === 'race');
    $(this.root, '.close').addEventListener('click', () => this.close());
    if (kind === 'finances') this.root.querySelector('[data-v="charts"]')!.append(this.valueChart.root, this.profitChart.root);
    if (kind === 'race') {
      this.root.querySelector('[data-v="race"]')!.append(this.raceChart.root);
      this.raceChart.draw();
    }
    this.update();
  }

  close(): void {
    this.kind = null;
    this.root.hidden = true;
  }

  private financesHtml(): string {
    const b = CONFIG.bank;
    return `<h2>🏦 Money</h2>
      <div data-v="charts" class="charts"></div>
      <h3>Every day</h3>
      <table class="pnl">
        <tr><td title="Customers served × their spend × your price">Revenue</td><td data-v="revenue" class="pos"></td></tr>
        <tr><td title="What each sale costs you to deliver">− Supplies <small data-v="varNote"></small></td><td data-v="variableCost" class="neg"></td></tr>
        <tr><td title="${money(CONFIG.staff.salaryPerDay)} per person per day, trainees included">− Salaries</td><td data-v="salaries" class="neg"></td></tr>
        <tr><td title="${pct(b.interestPerYear)} a year on your debt">− Interest</td><td data-v="interest" class="neg"></td></tr>
        <tr class="total"><td>= Profit</td><td data-v="profit"></td></tr>
      </table>
      <h3>Valuation</h3>
      <table class="pnl">
        <tr><td>Cash</td><td data-v="vCash"></td></tr>
        <tr><td>− Debt</td><td data-v="vDebt" class="neg"></td></tr>
        <tr><td title="Average daily profit over the last ${CONFIG.valuation.profitWindowDays} days × 365 × ${CONFIG.valuation.earningsMultiple}">+ ${CONFIG.valuation.earningsMultiple}× yearly profit</td><td data-v="vEarnings"></td></tr>
        <tr class="total"><td>= Valuation</td><td data-v="vTotal"></td></tr>
      </table>
      <h3>Bank <small data-v="limit"></small></h3>
      <div class="row"><span>Debt</span><b data-v="debt"></b></div>
      <div class="buttons">
        <button data-bank="borrow" title="${pct(b.interestPerYear)} a year. Credit limit: ${b.maxDebtRevenueDays} days of revenue.">Borrow ${money(b.loanChunk)}</button>
        <button data-bank="repay" class="ghost">Repay ${money(b.loanChunk)}</button>
      </div>`;
  }

  private lawsuitHtml(): string {
    const L = CONFIG.lawsuit;
    return `<h2>⚖️ Sue</h2>
      <p class="fee-line" title="${L.feeRevenueDays} days of your revenue, at least ${money(L.minFee)}. Lawyers keep ${pct(L.lawyerShare)} of damages. If the court dismisses the case, you also pay ${pct(L.dismissedCostShare)} of your fee to the rival.">Fees <b data-v="fee"></b> · ruling in ${L.courtDays} days · lose: −<span data-v="counter"></span></p>
      <table class="cases-table">
        <tr><th>Rival</th><th title="Streets they took from you recently, and predatory (low) pricing">Evidence</th><th>Odds</th><th title="Your lost profits on those streets, after your lawyers' share. They also lose ${pct(L.customerLoss)} of their customers.">You'd get</th><th title="Average result after fees and risk">Worth</th><th></th></tr>
        <tbody data-v="caseRows"></tbody>
      </table>
      <div data-v="cases"></div>`;
  }

  private raceHtml(): string {
    return `<h2>📈 Race to $1B</h2><div data-v="race"></div>`;
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
      this.set('limit', `limit ${money(g.maxDebt(c))}`);
      if (g.tick % 10 === 0) {
        this.valueChart.update(this.history.valuation);
        this.profitChart.update(this.history.profit);
      }
      return;
    }
    if (this.kind === 'race') {
      if (g.tick % 10 === 0) this.raceChart.draw();
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
          <td>${k.evidence >= 0.5 ? `${Math.round(k.evidence)} streets` : '—'}${k.r.price === 'low' ? ' · cheap' : ''}</td>
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
