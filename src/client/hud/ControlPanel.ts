import type { BuildingType, PriceLevel } from '@unicornrush/engine-api/game/Game';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { BUILDING_TYPES, CONFIG, PRICE_LEVELS } from '@unicornrush/engine-lib/configuration/Config';
import { int, money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $ } from './dom';

const B = CONFIG.buildings;
const BUILDING_INFO: Record<BuildingType, { icon: string; effect: string }> = {
  branch: { icon: '🏬', effect: `+${B.branch.capacity} buildings served` },
  warehouse: { icon: '🏭', effect: `Variable costs −${pct(1 - B.warehouse.variableCostMult)}` },
  adAgency: { icon: '📣', effect: `Sales push +${pct(B.adAgency.pushBonus)}` },
  legalDept: { icon: '⚖️', effect: `Lets you sue · ${pct(B.legalDept.defense)} chance to dismiss suits` },
};

type WithoutCompany<T> = T extends unknown ? Omit<T, 'companyId'> : never;
type Send = (intent: WithoutCompany<Intent>) => void;

/** The side panel: every lever the player can pull, plus a live P&L. */
export class ControlPanel {
  readonly root: HTMLElement;
  constructor(
    private game: GameImpl,
    private sendIntent: (intent: Intent) => void,
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'hud';
    this.root.innerHTML = this.template();
    this.bind();
  }

  private get me() {
    return this.game.player;
  }

  private template(): string {
    const prices = PRICE_LEVELS.map((p) => `<button data-price="${p}">${CONFIG.prices[p].label}</button>`).join('');
    const buildings = BUILDING_TYPES.map((t) => {
      const b = B[t];
      const info = BUILDING_INFO[t];
      return `<button class="building" data-build="${t}">
        <span class="b-icon">${info.icon}</span>
        <span class="b-main"><b>${b.label}</b> <span data-bcount="${t}"></span><br>
        <small>${info.effect}</small></span>
        <span class="b-cost">${money(b.cost)}<br><small>${money(b.rentPerDay)}/day rent</small></span>
      </button>`;
    }).join('');
    const L = CONFIG.lawsuit;

    return `
      <section class="panel valuation">
        <div class="label">Company valuation</div>
        <div class="big" data-v="total"></div>
        <div class="unicorn"><div class="unicorn-fill" data-v="unicornFill"></div><span data-v="unicornText"></span></div>
        <div class="formula">
          <span>Cash <b data-v="vCash"></b></span>
          <span>− Debt <b data-v="vDebt"></b></span>
          <span>+ Assets <b data-v="vAssets"></b></span>
          <span>+ 10× yearly profit <b data-v="vEarnings"></b></span>
        </div>
        <p class="tip">💡 Investors pay for <b>profit</b>, not size. Reach $1B to become a unicorn 🦄.</p>
      </section>

      <section class="panel">
        <h3>Profit &amp; Loss <small>per day</small></h3>
        <table class="pnl">
          <tr><td>Revenue</td><td data-v="revenue" class="pos"></td></tr>
          <tr><td>− Variable costs</td><td data-v="variableCost" class="neg"></td></tr>
          <tr><td>− Salaries</td><td data-v="salaries" class="neg"></td></tr>
          <tr><td>− Rent</td><td data-v="rent" class="neg"></td></tr>
          <tr><td>− Interest</td><td data-v="interest" class="neg"></td></tr>
          <tr class="total"><td>= Profit</td><td data-v="profit"></td></tr>
          <tr class="cash"><td>Cash</td><td data-v="cash"></td></tr>
        </table>
        <div class="warn" data-v="cashWarn" hidden></div>
      </section>

      <section class="panel">
        <h3>Team <small data-v="team"></small></h3>
        <div class="split-labels"><span>⚙️ Operations <b data-v="ops"></b></span><span>Sales <b data-v="sales"></b> 🤝</span></div>
        <input type="range" min="0" max="100" step="5" data-input="split" aria-label="Share of staff in sales" />
        <div class="meter"><div data-v="coverFill"></div></div>
        <div class="row small"><span>Customers served</span><span data-v="coverage"></span></div>
        <div class="warn" data-v="overload" hidden>Overloaded! Unserved customers are leaving. Move staff to Operations, hire, or open a Branch.</div>
        <div class="buttons">
          <button data-hire="1">Hire +1</button><button data-hire="10">Hire +10</button>
          <button data-fire="1" class="ghost">Fire −1</button><button data-fire="10" class="ghost">Fire −10</button>
        </div>
        <p class="tip">💡 Hiring costs ${money(CONFIG.staff.hireCost)} up front plus ${money(CONFIG.staff.salaryPerDay)}/day. New hires train for ${CONFIG.staff.trainingDays} days before they help: an investment.</p>
      </section>

      <section class="panel">
        <h3>Price</h3>
        <div class="seg">${prices}</div>
        <div class="row small"><span>Margin per customer</span><span data-v="margin"></span></div>
        <p class="tip" data-v="priceTip"></p>
      </section>

      <section class="panel">
        <h3>Sales push <small data-v="pushRate"></small></h3>
        <div class="meter push"><div data-v="pushFill"></div></div>
        <p class="tip">👆 Click the map next to your territory to launch a campaign. It spends half your push. Rivals' customers cost more to win, especially if they're cheap or well served.</p>
      </section>

      <section class="panel">
        <h3>Buildings</h3>
        ${buildings}
      </section>

      <section class="panel lawsuit-panel">
        <h3>Lawsuits ⚖️</h3>
        <div class="sue-row">
          <select data-input="sueTarget" aria-label="Company to sue"></select>
          <button data-action="sue" class="danger">Sue · ${money(L.cost)}</button>
        </div>
        <div class="row small"><span>Your chance to get a suit dismissed</span><span data-v="defense"></span></div>
        <div data-v="cases" class="cases"></div>
        <p class="tip">💡 A class action costs ${money(L.cost)} in legal fees and takes ${L.courtDays} days. If it isn't dismissed, the defendant loses ${pct(L.customerLoss)} of its customers all over its territory and pays you ${L.damagesRevenueDays} days of its revenue. If it's dismissed, you pay their costs. Legal risk is a real business cost.</p>
      </section>

      <section class="panel">
        <h3>Bank</h3>
        <div class="row"><span>Debt</span><b data-v="debt"></b></div>
        <div class="row small"><span>Credit limit (${CONFIG.bank.maxDebtRevenueDays} days of revenue)</span><span data-v="limit"></span></div>
        <div class="row small"><span>Interest ${pct(CONFIG.bank.interestPerYear)}/year</span><span data-v="interestDay"></span></div>
        <div class="buttons">
          <button data-bank="borrow">Borrow ${money(CONFIG.bank.loanChunk)}</button>
          <button data-bank="repay" class="ghost">Repay ${money(CONFIG.bank.loanChunk)}</button>
        </div>
        <p class="tip">💡 Debt speeds up growth, but interest is due even in a recession.</p>
      </section>`;
  }

  private bind(): void {
    const r = this.root;
    const send: Send = (i) => this.sendIntent({ ...i, companyId: 0 } as Intent);
    $<HTMLInputElement>(r, '[data-input="split"]').addEventListener('input', (e) =>
      send({ type: 'setSalesShare', share: Number((e.target as HTMLInputElement).value) / 100 }),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) =>
      b.addEventListener('click', () => send({ type: 'setPrice', price: b.dataset.price as PriceLevel })),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-hire]').forEach((b) =>
      b.addEventListener('click', () => send({ type: 'hire', count: Number(b.dataset.hire) })),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-fire]').forEach((b) =>
      b.addEventListener('click', () => send({ type: 'fire', count: Number(b.dataset.fire) })),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((b) =>
      b.addEventListener('click', () => send({ type: 'build', building: b.dataset.build as BuildingType })),
    );
    $(r, '[data-bank="borrow"]').addEventListener('click', () => send({ type: 'borrow' }));
    $(r, '[data-bank="repay"]').addEventListener('click', () => send({ type: 'repay' }));
    $(r, '[data-action="sue"]').addEventListener('click', () => {
      const target = Number($<HTMLSelectElement>(r, '[data-input="sueTarget"]').value);
      if (!Number.isNaN(target)) send({ type: 'lawsuit', targetId: target });
    });
  }

  private set(key: string, text: string, cls?: string): HTMLElement {
    const e = $(this.root, `[data-v="${key}"]`);
    e.textContent = text;
    if (cls !== undefined) e.className = cls;
    return e;
  }

  update(): void {
    const g = this.game;
    const c = this.me;
    const v = g.valuation(c);

    // Valuation, on a log scale from $1M to $1B so early progress is visible.
    this.set('total', money(v.total));
    const progress = Math.max(0, Math.min(1, Math.log10(Math.max(1, v.total) / 1e6) / 3));
    $(this.root, '[data-v="unicornFill"]').style.width = pct(progress);
    this.set('unicornText', `🦄 ${money(Math.max(0, v.total))} / $1B unicorn`);
    this.set('vCash', money(v.cash));
    this.set('vDebt', money(v.debt));
    this.set('vAssets', money(v.assets));
    this.set('vEarnings', money(v.earnings));

    const p = c.pnl;
    this.set('revenue', money(p.revenue));
    this.set('variableCost', money(p.variableCost));
    this.set('salaries', money(p.salaries));
    this.set('rent', money(p.rent));
    this.set('interest', money(p.interest));
    this.set('profit', money(p.profit), p.profit >= 0 ? 'pos' : 'neg');
    this.set('cash', money(c.cash), c.cash >= 0 ? '' : 'neg');
    const warn = $(this.root, '[data-v="cashWarn"]');
    if (c.cash < 0) {
      warn.hidden = false;
      warn.textContent = `Out of cash! Bankrupt in ${Math.max(0, CONFIG.bankruptcyGraceDays - c.negativeCashDays).toFixed(0)} days. Borrow, cut staff, or raise prices.`;
    } else if (p.profit < 0 && c.cash / -p.profit < 30) {
      warn.hidden = false;
      warn.textContent = `Losing money: cash runs out in ~${Math.floor(c.cash / -p.profit)} days.`;
    } else {
      warn.hidden = true;
    }

    const trainees = g.traineeCount(c);
    this.set('team', `${int(c.employees)} staff${trainees ? ` + ${trainees} training` : ''}`);
    this.set('ops', int(g.opsStaff(c)));
    this.set('sales', int(g.salesStaff(c)));
    const slider = $<HTMLInputElement>(this.root, '[data-input="split"]');
    if (document.activeElement !== slider) slider.value = String(Math.round(c.salesShare * 100));
    const cap = g.capacity(c);
    const cover = g.coverage(c);
    const coverFill = $(this.root, '[data-v="coverFill"]');
    coverFill.style.width = pct(cover);
    coverFill.className = cover < 1 ? 'bad' : '';
    this.set('coverage', `${int(Math.min(cap, c.tiles))} / ${int(c.tiles)} buildings (capacity ${int(cap)})`);
    $(this.root, '[data-v="overload"]').hidden = cover >= 1;

    this.root
      .querySelectorAll<HTMLButtonElement>('[data-price]')
      .forEach((b) => b.classList.toggle('active', b.dataset.price === c.price));
    const margin = CONFIG.prices[c.price].revenue * g.revenueMult() - CONFIG.variableCostPerCustomer * g.variableCostMult(c);
    this.set('margin', `${money(margin)} / day`);
    this.set(
      'priceTip',
      c.price === 'low'
        ? '💡 Low prices: thin margins, but you win customers fast and they stay loyal.'
        : c.price === 'high'
          ? '💡 High prices: fat margins, but growth is slow and rivals can steal customers easily.'
          : '💡 Medium prices: a balance between margin and growth.',
    );

    this.set('pushRate', `+${g.pushPerDay(c).toFixed(1)}/day`);
    $(this.root, '[data-v="pushFill"]').style.width = pct(c.push / g.maxPush(c));

    for (const t of BUILDING_TYPES) {
      const n = c.buildings[t];
      $(this.root, `[data-bcount="${t}"]`).textContent = n ? `×${n}` : '';
      $<HTMLButtonElement>(this.root, `[data-build="${t}"]`).disabled = n >= B[t].max || c.cash < B[t].cost;
    }

    this.updateLawsuits();

    this.set('debt', money(c.debt));
    this.set('limit', money(g.maxDebt(c)));
    this.set('interestDay', `${money(p.interest)}/day`);
  }

  private updateLawsuits(): void {
    const g = this.game;
    const c = this.me;
    const select = $<HTMLSelectElement>(this.root, '[data-input="sueTarget"]');
    const rivals = g.companies.filter((r) => r.alive && r.id !== c.id);
    const key = rivals.map((r) => r.id).join(',');
    if (select.dataset.key !== key) {
      const prev = select.value;
      select.innerHTML = rivals.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
      if (rivals.some((r) => String(r.id) === prev)) select.value = prev;
      select.dataset.key = key;
    }
    const sueBtn = $<HTMLButtonElement>(this.root, '[data-action="sue"]');
    const busy = g.activeLawsuitBy(c);
    sueBtn.disabled = c.buildings.legalDept === 0 || !!busy || c.cash < CONFIG.lawsuit.cost || rivals.length === 0;
    sueBtn.title = c.buildings.legalDept === 0 ? 'Open a Legal Dept first' : busy ? 'Your lawyers are busy' : '';
    this.set('defense', pct(g.legalDefense(c)));
    const mine = g.lawsuits.filter((l) => l.plaintiff === c.id || l.defendant === c.id);
    $(this.root, '[data-v="cases"]').innerHTML = mine
      .map((l) => {
        const days = Math.ceil(l.rulingDay - g.day);
        return l.plaintiff === c.id
          ? `<div class="case attack">You v. ${g.companies[l.defendant].name}: ruling in ${days}d</div>`
          : `<div class="case defend">${g.companies[l.plaintiff].name} is suing you! Ruling in ${days}d. A Legal Dept improves your odds.</div>`;
      })
      .join('');
  }
}
