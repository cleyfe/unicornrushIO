import type { PriceLevel } from '@unicornrush/engine-api/game/Game';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG, PRICE_LEVELS } from '@unicornrush/engine-lib/configuration/Config';
import { int, money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, el } from './dom';

type WithoutCompany<T> = T extends unknown ? Omit<T, 'companyId'> : never;

const P = CONFIG.prices;
const PRICE_TIPS: Record<PriceLevel, string> = {
  low: `Low price: customers buy ×${P.low.volume} as much, you win streets faster and they stay loyal, but each sale earns less. Works best on budget streets.`,
  medium: 'Medium price: a balance between margin and growth.',
  high: `High price: each sale earns more, but customers buy only ×${P.high.volume} as much, growth is slower and rivals steal customers more easily, except on rich streets, where premium brands are sticky.`,
};

/** Bottom of the screen: the levers you use every few seconds. */
export class ActionBar {
  readonly root: HTMLElement;

  constructor(
    private game: GameImpl,
    private sendIntent: (intent: Intent) => void,
    private open: (drawer: 'finances' | 'lawsuit') => void,
  ) {
    const prices = PRICE_LEVELS.map(
      (p, i) =>
        `<button data-price="${p}" title="${PRICE_TIPS[p]}">${CONFIG.prices[p].label} ${'$'.repeat(i + 1)}<small>sells ×${CONFIG.prices[p].volume}</small></button>`,
    ).join('');
    this.root = el(
      'section',
      'action-bar glass',
      `<div class="ab-block push" data-tip="push">
        <div class="ab-label">🤝 Sales push <span data-v="pushRate"></span></div>
        <div class="push-meter"><div data-v="pushFill"></div><span data-v="pushText"></span></div>
        <div class="ab-hint" data-v="pushHint"></div>
      </div>
      <div class="ab-block team" data-tip="team">
        <div class="ab-label">👥 Team <span data-v="team"></span></div>
        <div class="split">
          <span title="Operations staff serve customers: ${CONFIG.staff.customersPerOps} each">⚙️ Ops <b data-v="ops"></b></span>
          <input type="range" min="0" max="100" step="5" data-input="split" aria-label="Share of staff in sales" />
          <span title="Sales staff build push to win new streets">Sales <b data-v="sales"></b> 🤝</span>
        </div>
        <div class="team-row">
          <span class="capacity" data-v="capacity"></span>
          <span class="hire">
            <button data-hire="1" title="Hire 1: ${money(CONFIG.staff.hireCost)} now + ${money(CONFIG.staff.salaryPerDay)}/day. New hires train ${CONFIG.staff.trainingDays} days.">+1</button>
            <button data-hire="10" title="Hire 10: ${money(CONFIG.staff.hireCost * 10)} now + ${money(CONFIG.staff.salaryPerDay * 10)}/day">+10</button>
            <button data-hire="100" title="Hire 100: ${money(CONFIG.staff.hireCost * 100)} now + ${money(CONFIG.staff.salaryPerDay * 100)}/day">+100</button>
            <button data-fire="1" class="ghost" title="Fire 1: ${money(CONFIG.staff.fireCost)} severance">−1</button>
          </span>
        </div>
      </div>
      <div class="ab-block price" data-tip="price">
        <div class="ab-label">🏷️ Price <span data-v="margin"></span></div>
        <div class="seg">${prices}</div>
      </div>
      <div class="ab-block more">
        <button data-open="finances" title="Profit & loss, valuation and bank loans">🏦 Finances</button>
        <button data-open="lawsuit" title="Sue a rival">⚖️ Sue</button>
      </div>`,
    );
    this.bind();
  }

  private send(i: WithoutCompany<Intent>): void {
    this.sendIntent({ ...i, companyId: 0 } as Intent);
  }

  private bind(): void {
    const r = this.root;
    const slider = $<HTMLInputElement>(r, '[data-input="split"]');
    slider.addEventListener('input', () => this.send({ type: 'setSalesShare', share: Number(slider.value) / 100 }));
    // Give keyboard focus back to the game, so Space still pauses.
    slider.addEventListener('change', () => slider.blur());
    r.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) =>
      b.addEventListener('click', () => this.send({ type: 'setPrice', price: b.dataset.price as PriceLevel })),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-hire]').forEach((b) =>
      b.addEventListener('click', () => this.send({ type: 'hire', count: Number(b.dataset.hire) })),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-fire]').forEach((b) =>
      b.addEventListener('click', () => this.send({ type: 'fire', count: Number(b.dataset.fire) })),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => this.open(b.dataset.open as 'finances' | 'lawsuit')),
    );
  }

  update(): void {
    const g = this.game;
    const c = g.player;
    const r = this.root;

    const fill = c.push / g.maxPush(c);
    $(r, '[data-v="pushFill"]').style.width = pct(fill);
    $(r, '[data-v="pushText"]').textContent = `${Math.floor(c.push)} / ${Math.floor(g.maxPush(c))}`;
    $(r, '[data-v="pushRate"]').textContent = `+${g.pushPerDay(c).toFixed(1)}/day`;
    const hint = $(r, '[data-v="pushHint"]');
    if (g.salesStaff(c) === 0) hint.textContent = 'No sales staff: move the slider toward Sales.';
    else if (c.push < 5) hint.textContent = 'Building up… your sales team is pitching.';
    else hint.textContent = fill >= 0.95 ? 'Full! Click a glowing street to expand.' : 'Click a glowing street to win it.';
    hint.classList.toggle('urgent', fill >= 0.95);

    const trainees = g.traineeCount(c);
    $(r, '[data-v="team"]').textContent = `${int(c.employees)}${trainees ? ` + ${trainees} training` : ''} · ${money(c.pnl.salaries)}/day`;
    $(r, '[data-v="ops"]').textContent = int(g.opsStaff(c));
    $(r, '[data-v="sales"]').textContent = int(g.salesStaff(c));
    const slider = $<HTMLInputElement>(r, '[data-input="split"]');
    if (document.activeElement !== slider) slider.value = String(Math.round(c.salesShare * 100));
    const cover = g.coverage(c);
    const cap = $(r, '[data-v="capacity"]');
    cap.textContent = `Serving ${int(Math.min(g.capacity(c), c.customers))} / ${int(c.customers)} customers`;
    cap.className = `capacity ${cover < 1 ? 'bad' : 'good'}`;

    r.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) => b.classList.toggle('active', b.dataset.price === c.price));
    const price = CONFIG.prices[c.price];
    const margin = price.volume * (price.revenue * g.revenueMult() - CONFIG.variableCostPerCustomer * g.variableCostMult());
    $(r, '[data-v="margin"]').textContent = `profit ${money(margin)} per customer/day`;
    $(r, '[data-v="margin"]').title = 'Before staff costs, for a middle-income customer';
    r.querySelectorAll<HTMLButtonElement>('[data-hire]').forEach(
      (b) => (b.disabled = c.cash < Number(b.dataset.hire) * CONFIG.staff.hireCost),
    );
  }
}
