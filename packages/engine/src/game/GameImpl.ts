import type {
  ActiveEvent,
  Company,
  CompanySpec,
  GameResult,
  Lawsuit,
  LogEntry,
  MessageTone,
  Pnl,
  ValuationBreakdown,
  WinReason,
} from '@unicornrush/engine-api/game/Game';
import type { CityData } from '@unicornrush/engine-api/game/City';
import { NEUTRAL, Wealth, type GameMap } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { generateGridCity, mapFromCity, neighbors } from '@unicornrush/engine-lib/game/GameMap';
import { PseudoRandom } from '@unicornrush/engine-lib/PseudoRandom';
import type { Execution } from '../execution/Execution';

const emptyPnl = (): Pnl => ({ revenue: 0, variableCost: 0, salaries: 0, interest: 0, profit: 0 });

/**
 * The whole simulation state plus the rules everyone reads from it.
 * State changes happen in executions; this class holds the bookkeeping
 * they share (ownership, borders, valuation, messages).
 */
export class GameImpl {
  readonly map: GameMap;
  readonly owner: Int16Array;
  readonly companies: Company[] = [];
  readonly rng: PseudoRandom;
  readonly log: LogEntry[] = [];
  tick = 0;
  events: ActiveEvent[] = [];
  lawsuits: Lawsuit[] = [];
  result: GameResult | null = null;
  /** Bumped whenever tile ownership changes, so renderers can skip redraws. */
  ownershipVersion = 0;

  /** Streets each company lost since its last report, by cause (a rival's id, or churn). */
  private losses = new Map<number, Map<number | 'churn', number>>();
  private executions: Execution[] = [];
  private pending: Execution[] = [];
  private nb: number[] = [];
  private nb2: number[] = [];
  private logId = 0;

  /** Plays on `city` (from OpenStreetMap) when given, otherwise on a synthetic grid city. */
  constructor(seed: number, specs: CompanySpec[], city?: CityData) {
    this.rng = new PseudoRandom(seed);
    this.map = city ? mapFromCity(city) : generateGridCity(this.rng);
    this.owner = new Int16Array(this.map.size).fill(NEUTRAL);
    specs.forEach((s, id) => this.companies.push(newCompany(id, s)));
    this.placeSpawns();
  }

  // ---------- execution loop ----------

  addExecution(...execs: Execution[]): void {
    this.pending.push(...execs);
  }

  executeNextTick(): void {
    if (this.result) return;
    this.tick++;
    this.startPending();
    for (const e of this.executions) if (e.isActive()) e.tick(this);
    this.executions = this.executions.filter((e) => e.isActive());
  }

  /**
   * Starts newly added executions without advancing time, so actions taken
   * while the game is paused (hire, price, staff split…) apply right away.
   */
  startPending(): void {
    // init may reject an execution (it stays inactive) or add more.
    while (this.pending.length > 0) {
      const batch = this.pending;
      this.pending = [];
      for (const e of batch) {
        e.init(this);
        if (e.isActive()) this.executions.push(e);
      }
    }
  }

  // ---------- time ----------

  get day(): number {
    return this.tick / CONFIG.ticksPerDay;
  }

  isNewDay(): boolean {
    return this.tick % CONFIG.ticksPerDay === 0;
  }

  get player(): Company {
    return this.companies[0];
  }

  // ---------- derived numbers ----------

  salesStaff(c: Company): number {
    return Math.round(c.employees * c.salesShare);
  }

  opsStaff(c: Company): number {
    return c.employees - this.salesStaff(c);
  }

  traineeCount(c: Company): number {
    return c.trainees.reduce((s, t) => s + t.count, 0);
  }

  /** Customers the operations team can serve. */
  capacity(c: Company): number {
    return this.opsStaff(c) * CONFIG.staff.customersPerOps;
  }

  /** Capacity relative to customers, capped: above 1 means spare staff and better service. */
  serviceLevel(c: Company): number {
    return c.customers <= 0 ? 1 : Math.min(CONFIG.sales.maxServiceLevel, this.capacity(c) / c.customers);
  }

  /** Push the defender holds per street: its customer-retention effort. */
  retention(c: Company): number {
    return Math.min(CONFIG.sales.maxRetention, 1 + (CONFIG.sales.retentionPerPush * c.push) / Math.max(1, c.tiles));
  }

  /** Share of customers actually served. */
  coverage(c: Company): number {
    return c.customers <= 0 ? 1 : Math.min(1, this.capacity(c) / c.customers);
  }

  /** Sales staff after diminishing returns: each extra rep adds a bit less. */
  effectiveSales(c: Company): number {
    const reps = this.salesStaff(c);
    return reps / (1 + reps / CONFIG.sales.salesScale);
  }

  pushPerDay(c: Company): number {
    return this.effectiveSales(c) * CONFIG.sales.pushPerRepPerDay * CONFIG.prices[c.price].push;
  }

  maxPush(c: Company): number {
    return Math.max(10, this.salesStaff(c) * CONFIG.sales.maxPushDaysStored);
  }

  maxDebt(c: Company): number {
    return Math.max(CONFIG.bank.loanChunk, c.pnl.revenue * CONFIG.bank.maxDebtRevenueDays);
  }

  valuation(c: Company): ValuationBreakdown {
    if (!c.alive) return { cash: 0, debt: 0, earnings: 0, total: 0 };
    const v = CONFIG.valuation;
    const earnings = Math.max(0, c.avgProfit) * 365 * v.earningsMultiple;
    return { cash: c.cash, debt: c.debt, earnings, total: c.cash - c.debt + earnings };
  }

  revenueMult(): number {
    let m = 1;
    for (const e of this.events) {
      if (e.kind === 'recession') m *= 0.7;
      if (e.kind === 'boom') m *= 1.25;
    }
    return m;
  }

  variableCostMult(): number {
    let m = 1;
    for (const e of this.events) if (e.kind === 'supplierHike') m *= 2;
    return m;
  }

  /** Push needed to win one area from `target` (NEUTRAL or a company id). */
  tileCost(attacker: Company, target: number, tile: number): number {
    // Wealthier customers are worth more, and harder to win.
    const w = CONFIG.wealth[this.map.wealth[tile]];
    const d = this.map.demand[tile] * (0.5 + 0.5 * w.spend);
    if (target === NEUTRAL) return CONFIG.sales.neutralTileCost * d;
    const def = this.companies[target];
    // Price matters a lot to budget customers and little to luxury ones,
    // who also stick with premium brands and distrust cheap ones.
    const sens = w.priceSensitivity;
    let loyalty = 1 + (CONFIG.prices[def.price].loyalty - 1) * sens;
    if (def.price === 'high') loyalty *= w.prestige;
    if (def.price === 'low') loyalty /= w.prestige;
    let mult = Math.max(0.3, this.serviceLevel(def)) * loyalty * this.retention(def);
    const ar = CONFIG.prices[attacker.price].revenue;
    const dr = CONFIG.prices[def.price].revenue;
    if (ar < dr) mult *= 1 - 0.25 * sens;
    if (ar > dr) mult *= 1 + 0.25 * sens;
    return CONFIG.sales.rivalTileCost * d * mult;
  }

  activeLawsuitBy(c: Company): Lawsuit | undefined {
    return this.lawsuits.find((l) => l.plaintiff === c.id);
  }

  /** Does company `c` share a border with `target`? */
  touches(c: Company, target: number): boolean {
    for (const b of c.border) {
      for (const n of neighbors(this.map, b, this.nb)) if (this.owner[n] === target) return true;
    }
    return false;
  }

  leaderId(): number | null {
    let best: Company | null = null;
    for (const c of this.companies) {
      if (!c.alive) continue;
      if (!best || this.valuation(c).total > this.valuation(best).total) best = c;
    }
    return best ? best.id : null;
  }

  // ---------- state changes shared by executions ----------

  recordLoss(loser: number, cause: number | 'churn'): void {
    if (this.companies[loser].isBot) return;
    if (!this.losses.has(loser)) this.losses.set(loser, new Map());
    const m = this.losses.get(loser)!;
    m.set(cause, (m.get(cause) ?? 0) + 1);
  }

  /** Tells a human player which streets they lost, and why. */
  reportLosses(companyId: number): void {
    const m = this.losses.get(companyId);
    if (!m || m.size === 0) return;
    for (const [cause, n] of m) {
      const streets = n === 1 ? '1 street' : `${n} streets`;
      if (cause === 'churn') this.message(companyId, `${streets} left you: you were overloaded and couldn't serve them.`, 'bad');
      else this.message(companyId, `${this.companies[cause].name} stole ${streets} from you.`, 'bad');
    }
    m.clear();
  }

  closeCompany(c: Company, why: string): void {
    if (!c.alive) return;
    this.reportLosses(c.id);
    c.alive = false;
    c.closedDay = this.day;
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === c.id) this.setOwner(i, NEUTRAL);
    this.lawsuits = this.lawsuits.filter((l) => l.plaintiff !== c.id && l.defendant !== c.id);
    this.news(
      c.isBot ? `${c.name} ${why} and closed. Its customers are up for grabs.` : `Your company ${why} and closed.`,
      c.isBot ? 'good' : 'bad',
    );
  }

  finish(winnerId: number | null, reason: WinReason): void {
    this.result = { winnerId, reason, day: this.day };
  }

  setOwner(tile: number, newOwner: number): void {
    const old = this.owner[tile];
    if (old === newOwner) return;
    const d = this.map.demand[tile];
    if (old >= 0) {
      const oc = this.companies[old];
      oc.tiles--;
      oc.customers -= d;
      oc.spend -= this.map.spend[tile];
      oc.border.delete(tile);
    }
    this.owner[tile] = newOwner;
    if (newOwner >= 0) {
      const nc = this.companies[newOwner];
      nc.tiles++;
      nc.customers += d;
      nc.spend += this.map.spend[tile];
    }
    this.refreshBorder(tile);
    for (const n of neighbors(this.map, tile, this.nb2)) this.refreshBorder(n);
    this.ownershipVersion++;
  }

  /** An area is on its owner's border if any neighbour is neutral or a rival. */
  isBorder(tile: number): boolean {
    const o = this.owner[tile];
    if (o < 0) return false;
    for (const n of neighbors(this.map, tile, this.nb)) {
      if (this.owner[n] !== o) return true;
    }
    return false;
  }

  private refreshBorder(tile: number): void {
    const o = this.owner[tile];
    if (o < 0) return;
    const set = this.companies[o].border;
    if (this.isBorder(tile)) set.add(tile);
    else set.delete(tile);
  }

  /** Public news everyone sees. */
  news(text: string, tone: MessageTone): void {
    this.pushLog({ text, tone });
  }

  /** A private message to one company, e.g. why an action was rejected. */
  message(companyId: number, text: string, tone: MessageTone = 'error'): void {
    this.pushLog({ text, tone, recipient: companyId });
  }

  private pushLog(e: Omit<LogEntry, 'id' | 'day'>): void {
    this.log.push({ ...e, id: ++this.logId, day: Math.floor(this.day) });
    if (this.log.length > 80) this.log.shift();
  }

  /**
   * Starts every company far apart, in an ordinary middle-income area, with
   * about the same number of customers, grown outward along its streets.
   */
  private placeSpawns(): void {
    const m = this.map;
    const sorted = [...m.demand].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < m.size; i++) {
      minX = Math.min(minX, m.x[i]);
      maxX = Math.max(maxX, m.x[i]);
      minY = Math.min(minY, m.y[i]);
      maxY = Math.max(maxY, m.y[i]);
    }
    // Stay away from the edges, where there is less room to grow.
    const marginX = (maxX - minX) * 0.12;
    const marginY = (maxY - minY) * 0.12;
    // Candidate starts: ordinary middle-income streets away from the edges.
    const inside = (i: number) =>
      m.x[i] >= minX + marginX && m.x[i] <= maxX - marginX && m.y[i] >= minY + marginY && m.y[i] <= maxY - marginY;
    let candidates: number[] = [];
    for (let i = 0; i < m.size; i++) {
      if (inside(i) && m.wealth[i] === Wealth.Middle && m.demand[i] <= median * 1.5) candidates.push(i);
    }
    if (candidates.length < this.companies.length) candidates = [...Array(m.size).keys()];
    // Pick the most spread-out set among many random tries, so no start is cramped.
    const n = this.companies.length;
    let best: number[] = [];
    let bestSpread = -1;
    for (let attempt = 0; attempt < 300; attempt++) {
      const set = Array.from({ length: n }, () => candidates[this.rng.int(0, candidates.length)]);
      let spread = Infinity;
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) spread = Math.min(spread, Math.hypot(m.x[set[a]] - m.x[set[b]], m.y[set[a]] - m.y[set[b]]));
      if (spread > bestSpread) (bestSpread = spread), (best = set);
    }
    // Shuffle which company gets which start, so no seat is favoured.
    const seeds = best;
    for (let k = seeds.length - 1; k > 0; k--) {
      const j = this.rng.int(0, k + 1);
      [seeds[k], seeds[j]] = [seeds[j], seeds[k]];
    }
    // Grow every territory one street at a time, in turns, so nobody gets more.
    const frontiers = seeds.map((s) => [s]);
    const nb: number[] = [];
    let growing = true;
    while (growing) {
      growing = false;
      this.companies.forEach((c, id) => {
        if (c.customers >= CONFIG.start.customers) return;
        const queue = frontiers[id];
        while (queue.length > 0) {
          const t = queue.shift()!;
          if (this.owner[t] !== NEUTRAL) continue;
          // Skip streets that would overshoot the target, so nobody starts overloaded.
          if (c.customers > 0 && c.customers + m.demand[t] > CONFIG.start.customers * 1.1) continue;
          this.setOwner(t, id);
          for (const n of neighbors(m, t, nb)) if (this.owner[n] === NEUTRAL) queue.push(n);
          growing = true;
          return;
        }
      });
    }
  }
}

function newCompany(id: number, s: CompanySpec): Company {
  return {
    id,
    name: s.name,
    color: s.color,
    isBot: s.isBot,
    personality: s.personality ?? 'balanced',
    alive: true,
    cash: CONFIG.start.cash,
    debt: 0,
    employees: CONFIG.start.employees,
    trainees: [],
    salesShare: CONFIG.start.salesShare,
    price: s.price ?? (s.personality === 'discounter' ? 'low' : s.personality === 'premium' ? 'high' : 'medium'),
    push: CONFIG.start.push, // enough for a first expansion right away
    tiles: 0,
    customers: 0,
    spend: 0,
    border: new Set(),
    pnl: emptyPnl(),
    oneOff: { hiring: 0, severance: 0, legalFees: 0, damages: 0 },
    avgProfit: 0,
    churnCarry: 0,
    negativeCashDays: 0,
    peakTiles: 0,
    peakValuation: 0,
    closedDay: null,
  };
}
