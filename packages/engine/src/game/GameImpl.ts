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
import { NEUTRAL, WATER, type GameMap } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { powInt } from '@unicornrush/engine-lib/DetMath';
import { generateMap, neighbors4 } from '@unicornrush/engine-lib/game/GameMap';
import { PseudoRandom } from '@unicornrush/engine-lib/PseudoRandom';
import type { Execution } from '../execution/Execution';

const emptyPnl = (): Pnl => ({ revenue: 0, variableCost: 0, salaries: 0, rent: 0, interest: 0, profit: 0 });

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

  private executions: Execution[] = [];
  private pending: Execution[] = [];
  private nb: number[] = [];
  private nb2: number[] = [];
  private logId = 0;

  constructor(seed: number, specs: CompanySpec[]) {
    this.rng = new PseudoRandom(seed);
    this.map = generateMap(this.rng);
    const size = this.map.width * this.map.height;
    this.owner = new Int16Array(size).fill(NEUTRAL);
    for (let i = 0; i < size; i++) if (this.map.isWater[i]) this.owner[i] = WATER;
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
    // New executions start this tick; init may reject them (inactive).
    while (this.pending.length > 0) {
      const batch = this.pending;
      this.pending = [];
      for (const e of batch) {
        e.init(this);
        if (e.isActive()) this.executions.push(e);
      }
    }
    for (const e of this.executions) if (e.isActive()) e.tick(this);
    this.executions = this.executions.filter((e) => e.isActive());
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

  capacity(c: Company): number {
    return this.opsStaff(c) * CONFIG.staff.tilesPerOps + c.buildings.branch * CONFIG.buildings.branch.capacity;
  }

  coverage(c: Company): number {
    return c.tiles === 0 ? 1 : Math.min(1, this.capacity(c) / c.tiles);
  }

  pushPerDay(c: Company): number {
    const ad = 1 + c.buildings.adAgency * CONFIG.buildings.adAgency.pushBonus;
    return this.salesStaff(c) * CONFIG.sales.pushPerRepPerDay * CONFIG.prices[c.price].push * ad;
  }

  maxPush(c: Company): number {
    return Math.max(10, this.salesStaff(c) * CONFIG.sales.maxPushDaysStored);
  }

  maxDebt(c: Company): number {
    return Math.max(CONFIG.bank.loanChunk, c.pnl.revenue * CONFIG.bank.maxDebtRevenueDays);
  }

  rentPerDay(c: Company): number {
    let rent = 0;
    for (const [type, n] of Object.entries(c.buildings)) {
      rent += n * CONFIG.buildings[type as keyof typeof CONFIG.buildings].rentPerDay;
    }
    return rent;
  }

  valuation(c: Company): ValuationBreakdown {
    if (!c.alive) return { cash: 0, debt: 0, assets: 0, earnings: 0, total: 0 };
    const v = CONFIG.valuation;
    const assets = c.buildingSpend * v.assetRecovery;
    const earnings = Math.max(0, c.avgProfit) * 365 * v.earningsMultiple;
    return { cash: c.cash, debt: c.debt, assets, earnings, total: c.cash - c.debt + assets + earnings };
  }

  revenueMult(): number {
    let m = 1;
    for (const e of this.events) {
      if (e.kind === 'recession') m *= 0.7;
      if (e.kind === 'boom') m *= 1.25;
    }
    return m;
  }

  variableCostMult(c: Company): number {
    let m = powInt(CONFIG.buildings.warehouse.variableCostMult, c.buildings.warehouse);
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
    let mult = Math.max(0.3, this.coverage(def)) * loyalty;
    const ar = CONFIG.prices[attacker.price].revenue;
    const dr = CONFIG.prices[def.price].revenue;
    if (ar < dr) mult *= 1 - 0.25 * sens;
    if (ar > dr) mult *= 1 + 0.25 * sens;
    return CONFIG.sales.rivalTileCost * d * mult;
  }

  /** Chance that a lawsuit against `c` gets dismissed. */
  legalDefense(c: Company): number {
    return 1 - powInt(1 - CONFIG.buildings.legalDept.defense, c.buildings.legalDept);
  }

  activeLawsuitBy(c: Company): Lawsuit | undefined {
    return this.lawsuits.find((l) => l.plaintiff === c.id);
  }

  /** Does company `c` share a border with `target`? */
  touches(c: Company, target: number): boolean {
    for (const b of c.border) {
      for (const n of neighbors4(this.map, b, this.nb)) if (this.owner[n] === target) return true;
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

  closeCompany(c: Company, why: string): void {
    if (!c.alive) return;
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
    if (old === newOwner || old === WATER) return;
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
    for (const n of neighbors4(this.map, tile, this.nb2)) this.refreshBorder(n);
    this.ownershipVersion++;
  }

  /** An area is on its owner's border if any neighbour is neutral or a rival. */
  isBorder(tile: number): boolean {
    const o = this.owner[tile];
    if (o < 0) return false;
    for (const n of neighbors4(this.map, tile, this.nb)) {
      const no = this.owner[n];
      if (no !== o && no !== WATER) return true;
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

  private placeSpawns(): void {
    const { width: w, height: h } = this.map;
    const spots: [number, number][] = [];
    let minDist = 45;
    let attempts = 0;
    while (spots.length < this.companies.length) {
      attempts++;
      if (attempts % 400 === 0) minDist *= 0.85;
      const x = this.rng.int(8, w - 8);
      const y = this.rng.int(6, h - 6);
      const i = y * w + x;
      // Start in the suburbs, not downtown.
      if (this.map.isWater[i] || this.map.demand[i] > CONFIG.map.customersPerStreet * 1.6) continue;
      if (spots.some(([sx, sy]) => (sx - x) * (sx - x) + (sy - y) * (sy - y) < minDist * minDist)) continue;
      spots.push([x, y]);
    }
    const r = CONFIG.start.radius;
    spots.forEach(([sx, sy], id) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const i = (sy + dy) * w + (sx + dx);
          if (this.owner[i] === NEUTRAL) this.setOwner(i, id);
        }
      }
    });
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
    price: s.personality === 'discounter' ? 'low' : s.personality === 'premium' ? 'high' : 'medium',
    buildings: { branch: 0, warehouse: 0, adAgency: 0, legalDept: 0 },
    buildingSpend: 0,
    push: 0,
    tiles: 0,
    customers: 0,
    spend: 0,
    border: new Set(),
    pnl: emptyPnl(),
    avgProfit: 0,
    churnCarry: 0,
    negativeCashDays: 0,
    peakTiles: 0,
    peakValuation: 0,
    closedDay: null,
  };
}
