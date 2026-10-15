import type { PriceLevel } from '@unicornrush/engine-api/game/Game';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG, PRICE_LEVELS } from '@unicornrush/engine-lib/configuration/Config';
import { int, money } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, el } from './dom';

type WithoutCompany<T> = T extends unknown ? Omit<T, 'companyId'> : never;
export type Panel = 'finances' | 'lawsuit' | 'poach' | 'race' | 'news';

const S = CONFIG.staff;
const P = CONFIG.prices;
const PRICE_KEYS: Record<PriceLevel, string> = { low: 'Q', medium: 'W', high: 'E' };
const PRICE_TIPS: Record<PriceLevel, string> = {
  low: `Low · $${P.low.revenue} a sale. Customers buy ×${P.low.volume}; you win streets faster and keep them. Best on budget streets.`,
  medium: `Medium · $${P.medium.revenue} a sale.`,
  high: `High · $${P.high.revenue} a sale. Customers buy ×${P.high.volume}; easier to steal, except on rich streets.`,
};

/**
 * The command dock at the bottom: one place for everything you do, like
 * OpenFront's bar. Status on top (push, defence, team), commands below, each
 * with a hotkey. Explanations live in tooltips, not on screen.
 */
const S_MAX_SERVICE = CONFIG.sales.maxServiceLevel;

export class ActionBar {
  readonly root: HTMLElement;
  /** Keep just enough operations staff, automatically. On by default for beginners. */
  autoOps = true;
  /** Called for commands that need a street: Ads (aim) and Guard (pick an area). */
  onAim: (mode: 'ad' | 'guard' | 'buy') => void = () => {};
  private lastAutoDay = -1;

  constructor(
    private game: GameImpl,
    private sendIntent: (intent: Intent) => void,
    private open: (panel: Panel) => void,
  ) {
    const cmd = (attrs: string, icon: string, label: string, key: string, tip: string) =>
      `<button class="cmd" ${attrs} title="${tip}"><span class="ic">${icon}</span><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    this.root = el(
      'section',
      'action-bar glass',
      `<div class="dock-status">
        <div class="push" data-tip="push" title="Sales push: your sales team builds it every day. Clicking a street spends half of it to win that street.">
          <span class="ic">🤝</span>
          <div class="push-meter"><div data-v="pushFill"></div><span data-v="pushText"></span></div>
          <span class="rate" data-v="pushRate"></span>
          <label class="per-click" title="How much of your push each click commits. Small clicks for precise moves, big ones to grab land fast. Unspent push comes back.">
            <input type="range" min="10" max="100" step="10" data-input="share" aria-label="Push per click" /><span data-v="share"></span>
          </label>
        </div>
        <div class="defence" data-v="defence" title="Defence: how much harder your streets are to steal. Spare Ops staff and unspent push raise it; being overloaded lowers it."></div>
      </div>
      <div class="dock-team team" data-tip="team">
        <span class="side ops" title="Operations staff serve customers (${S.customersPerOps} each) and keep them loyal. O: more Ops">⚙️ Ops <b data-v="ops"></b><kbd>O</kbd></span>
        <span class="split">
          <input type="range" min="0" max="100" step="5" data-input="split" aria-label="Share of staff in sales" />
          <i class="mark m1" data-v="mark1" title="Service ×1: every customer served"></i>
          <i class="mark m15" data-v="mark15" title="Service ×1.5: the most defence spare Ops can give"></i>
        </span>
        <span class="side" title="Sales staff build push to win streets. P: more Sales">Sales <b data-v="sales"></b> 🤝<kbd>P</kbd></span>
        <label class="auto" title="Auto: keep just enough Ops for every customer; everyone else sells. Moving the slider turns it off."><input type="checkbox" data-input="auto" checked />Auto</label>
        <span class="capacity" data-v="capacity"></span>
      </div>
      <div class="dock-cmds">
        <div class="grp">
          ${cmd('data-hire="10"', '👥', 'Hire 10', 'H', `Hire 10: ${money(S.hireCost * 10)} now, ${money(S.salaryPerDay * 10)}/day. Trains ${S.trainingDays} days.`)}
          ${cmd('data-fire="10"', '👋', 'Fire 10', 'J', `Let 10 people go: ${money(S.fireCost * 10)} severance, saves ${money(S.salaryPerDay * 10)}/day.`)}
        </div>
        <div class="grp price">
          <div class="price-switch" title="Your price (Q / W / E). A change takes a few days to reach every shop.">
            <div class="seg">${PRICE_LEVELS.map((p, i) => `<button data-price="${p}" title="${PRICE_TIPS[p]} Key: ${PRICE_KEYS[p]}">${'$'.repeat(i + 1)}</button>`).join('')}</div>
            <span class="lb" data-v="priceLabel"></span>
          </div>
        </div>
        <div class="grp view">
          ${cmd('data-open="finances"', '🏦', 'Money', 'F', 'Profit & loss, valuation, bank loans')}
          ${cmd('data-open="race"', '📈', 'Race', 'R', "Everyone's valuation over time")}
          ${cmd('data-open="news"', '📰', 'News', 'N', 'Everything that happened this match')}
        </div>
      </div>`,
    );
    this.bind();
  }

  private send(i: WithoutCompany<Intent>): void {
    this.sendIntent({ ...i, companyId: this.game.playerId } as Intent);
  }

  private bind(): void {
    const r = this.root;
    const slider = $<HTMLInputElement>(r, '[data-input="split"]');
    const auto = $<HTMLInputElement>(r, '[data-input="auto"]');
    slider.addEventListener('input', () => {
      // Taking the slider means taking over from autopilot.
      this.autoOps = false;
      auto.checked = false;
      this.send({ type: 'setSalesShare', share: Number(slider.value) / 100 });
    });
    auto.addEventListener('change', () => {
      this.autoOps = auto.checked;
      this.lastAutoDay = -1;
      auto.blur();
    });
    // Give keyboard focus back to the game, so hotkeys keep working.
    slider.addEventListener('change', () => slider.blur());
    const share = $<HTMLInputElement>(r, '[data-input="share"]');
    share.addEventListener('input', () => this.send({ type: 'setCampaignShare', share: Number(share.value) / 100 }));
    share.addEventListener('change', () => share.blur());
    r.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.price) this.send({ type: 'setPrice', price: d.price as PriceLevel });
      else if (d.hire) this.send({ type: 'hire', count: Number(d.hire) });
      else if (d.fire) this.send({ type: 'fire', count: Number(d.fire) });
      else if (d.open) this.open(d.open as Panel);
    });
  }

  /** Moves 5% of staff between Ops and Sales (O / P keys), taking over from Auto. */
  private nudgeSplit(toSales: number): void {
    const c = this.game.player;
    this.autoOps = false;
    $<HTMLInputElement>(this.root, '[data-input="auto"]').checked = false;
    const share = Math.max(0, Math.min(1, Math.round((c.salesShare + toSales) * 20) / 20));
    this.send({ type: 'setSalesShare', share });
  }

  /** Runs the command bound to a hotkey; returns false if the key isn't one. */
  hotkey(key: string): boolean {
    const k = key.toUpperCase();
    if (k === 'O' || k === 'P') {
      this.nudgeSplit(k === 'O' ? -0.05 : 0.05);
      return true;
    }
    // Actions live in the ring on the map (right-click a street); their keys still work.
    const aim = ({ A: 'ad', G: 'guard', B: 'buy' } as const)[k as 'A' | 'G' | 'B'];
    if (aim) {
      this.onAim(aim);
      return true;
    }
    if (k === 'S' || k === 'T') {
      this.open(k === 'S' ? 'lawsuit' : 'poach');
      return true;
    }
    const price = PRICE_LEVELS.find((p) => PRICE_KEYS[p] === k);
    if (price) {
      this.send({ type: 'setPrice', price });
      return true;
    }
    const target = [...this.root.querySelectorAll<HTMLButtonElement>('.cmd')].find((b) => b.querySelector('kbd')?.textContent === k);
    if (!target || target.disabled) return false;
    target.click();
    target.classList.add('pressed');
    window.setTimeout(() => target.classList.remove('pressed'), 150);
    return true;
  }

  /** Autopilot: just enough operations staff for every customer (5% slack). */
  private autoBalance(): void {
    const g = this.game;
    const c = g.player;
    const day = Math.floor(g.day);
    if (!this.autoOps || day === this.lastAutoDay || c.employees === 0) return;
    this.lastAutoDay = day;
    const opsNeeded = Math.ceil((c.customers * 1.05) / S.customersPerOps);
    const share = Math.max(0, Math.min(0.95, 1 - opsNeeded / c.employees));
    if (Math.abs(share - c.salesShare) > 0.01) this.send({ type: 'setSalesShare', share });
  }

  update(): void {
    const g = this.game;
    const c = g.player;
    const r = this.root;
    this.autoBalance();

    const fill = c.push / g.maxPush(c);
    $(r, '[data-v="pushFill"]').style.width = `${Math.min(100, fill * 100)}%`;
    const committed = c.pushCommitted >= 1 ? ` · ${Math.floor(c.pushCommitted)} at work` : '';
    $(r, '[data-v="pushText"]').textContent = `${Math.floor(c.push)} / ${Math.floor(g.maxPush(c))} · click ${Math.floor(c.push * c.campaignShare)}${committed}`;
    const share = $<HTMLInputElement>(r, '[data-input="share"]');
    if (document.activeElement !== share) share.value = String(Math.round(c.campaignShare * 100));
    $(r, '[data-v="share"]').textContent = `${Math.round(c.campaignShare * 100)}%`;
    $(r, '[data-v="pushRate"]').textContent = `+${g.pushPerDay(c).toFixed(1)}/d`;
    const def = g.defence(c);
    const defEl = $(r, '[data-v="defence"]');
    defEl.textContent = `🛡 ×${def.toFixed(1)}`;
    defEl.className = `defence ${def < 0.95 ? 'weak' : def > 1.3 ? 'strong' : ''}`;
    // Defence = service × push reserve: show both, so a big reserve can't hide a lack of Ops.
    defEl.title = `Defence ×${def.toFixed(2)}: how much more push rivals need to steal your streets.\nService ×${g.serviceDefence(c).toFixed(2)} (spare Ops, up to ×${S_MAX_SERVICE}; overloaded drags it down fast) × push reserve ×${g.retention(c).toFixed(2)} (unspent push, up to ×${CONFIG.sales.maxRetention}).`;

    $(r, '[data-v="ops"]').textContent = int(g.opsStaff(c));
    const trainees = g.traineeCount(c);
    $(r, '[data-v="sales"]').textContent = `${int(g.salesStaff(c))}${trainees ? ` +${trainees}` : ''}`;
    const slider = $<HTMLInputElement>(r, '[data-input="split"]');
    if (document.activeElement !== slider) slider.value = String(Math.round(c.salesShare * 100));
    // Service: Ops capacity ÷ customers. The target band is ×1 to ×1.5.
    const service = c.customers > 0 ? g.capacity(c) / c.customers : 1;
    const cap = $(r, '[data-v="capacity"]');
    cap.textContent = `⚙️ ×${service.toFixed(2)}`;
    cap.className = `capacity ${service < 1 ? 'bad' : service > S_MAX_SERVICE + 0.05 ? 'over' : 'good'}`;
    cap.title =
      `Service: Ops can serve ${int(g.capacity(c))} of your ${int(c.customers)} customers (${S.customersPerOps} each; trainees don't count yet).\n` +
      `Below ×1, unserved customers don't pay and your streets get easy to steal. ×1 to ×${S_MAX_SERVICE}: spare Ops make your streets harder to steal. Above ×${S_MAX_SERVICE}: no extra effect.`;
    // Slider marks where service hits ×1 and ×1.5 (the slider is the share of staff in sales).
    const staff = Math.max(1, c.employees);
    const markAt = (level: number) => Math.max(0, Math.min(100, 100 * (1 - (c.customers * level) / S.customersPerOps / staff)));
    $(r, '[data-v="mark1"]').style.left = `calc(8px + (100% - 16px) * ${markAt(1) / 100})`;
    $(r, '[data-v="mark15"]').style.left = `calc(8px + (100% - 16px) * ${markAt(S_MAX_SERVICE) / 100})`;

    r.querySelectorAll<HTMLButtonElement>('[data-hire]').forEach((b) => (b.disabled = c.cash < Number(b.dataset.hire) * S.hireCost));

    r.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) => {
      const p = b.dataset.price as PriceLevel;
      b.classList.toggle('active', p === c.price);
      b.classList.toggle('pending', c.pendingPrice?.price === p);
    });
    const label = $(r, '[data-v="priceLabel"]');
    label.textContent = c.pendingPrice ? `${P[c.pendingPrice.price].label} in ${Math.ceil(c.pendingPrice.day - g.day)}d` : P[c.price].label;
    label.classList.toggle('pending', !!c.pendingPrice);

    this.cues();
  }

  /**
   * Lights up the one thing worth doing next, instead of explaining it:
   * overloaded → Ops; push full → the push meter (and the map's frontier); idle cash → hire.
   */
  private cues(): void {
    const g = this.game;
    const c = g.player;
    const r = this.root;
    const overloaded = g.coverage(c) < 0.97 && !this.autoOps;
    const pushFull = c.push >= g.maxPush(c) * 0.95;
    const idleCash = g.day > 10 && c.cash > (S.hireCost + S.salaryPerDay * 30) * 10 && g.traineeCount(c) === 0 && c.pnl.profit > 0;
    const cue = overloaded ? 'ops' : pushFull ? 'push' : idleCash ? 'hire' : '';
    $(r, '.side.ops').classList.toggle('cue', cue === 'ops');
    $(r, '.push').classList.toggle('cue', cue === 'push');
    $(r, '[data-hire="10"]').classList.toggle('cue', cue === 'hire');
  }
}
