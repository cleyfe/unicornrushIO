import type {
  ActiveEvent,
  Company,
  Forecast,
  LocalEvent,
  CompanySpec,
  GameResult,
  Lawsuit,
  LogEntry,
  MessageTone,
  Pnl,
  StreetCost,
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
  /** Street name per segment ('' when unknown, and on the grid city). */
  readonly streetNames: string[];
  readonly log: LogEntry[] = [];
  tick = 0;
  events: ActiveEvent[] = [];
  /** Market events announced but not started yet. */
  forecasts: Forecast[] = [];
  /** Local events, announced, running, or permanent. */
  localEvents: LocalEvent[] = [];
  lawsuits: Lawsuit[] = [];
  result: GameResult | null = null;
  /** Bumped whenever tile ownership changes, so renderers can skip redraws. */
  ownershipVersion = 0;
  /** Guarded streets: who guards each one, and until when. */
  readonly guardOwner: Int16Array;
  readonly guardUntil: Float32Array;
  /** Bumped whenever a guard is posted. */
  guardVersion = 0;
  /** Streets bought in a deal can't be bought back with cash until this day. */
  readonly dealLockUntil: Float32Array;

  /** Evidence for lawsuits: streets (and their spend) attacker took from victim, decaying over time. */
  private takenStreets = new Map<string, number>();
  private takenSpend = new Map<string, number>();
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
    this.streetNames = city ? city.segments.names : [];
    this.owner = new Int16Array(this.map.size).fill(NEUTRAL);
    this.guardOwner = new Int16Array(this.map.size).fill(NEUTRAL);
    this.guardUntil = new Float32Array(this.map.size);
    this.dealLockUntil = new Float32Array(this.map.size);
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
    if (this.isNewDay()) this.decayEvidence();
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

  onStrike(c: Company): boolean {
    return this.day >= c.strikeFrom && this.day < c.strikeUntil;
  }

  /** Customers the operations team can serve. */
  capacity(c: Company): number {
    const strike = this.onStrike(c) ? CONFIG.scrutiny.strikeCapacity : 1;
    return this.opsStaff(c) * CONFIG.staff.customersPerOps * strike;
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

  /** The next ad purchase: how much push it buys and what it costs. */
  /** Days until the agency can run another ad campaign (0 = now). */
  adWait(c: Company): number {
    return Math.max(0, c.lastAdDay + CONFIG.sales.adCooldownDays - this.day);
  }

  adOffer(c: Company): { push: number; cost: number } {
    const S = CONFIG.sales;
    return { push: S.adPush, cost: Math.round(S.adBaseCost + S.adStepCost * c.adHeat) };
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

  /** How much a customer of this wealth level buys at company c's price (price elasticity). */
  volume(c: Company, wealthLevel: number): number {
    return 1 + (CONFIG.prices[c.price].volume - 1) * CONFIG.wealth[wealthLevel].priceSensitivity;
  }

  revenueMult(): number {
    let m = 1;
    for (const e of this.events) {
      if (e.kind === 'recession') m *= 0.7;
      if (e.kind === 'boom') m *= 1.25;
    }
    return m;
  }

  /** Variable cost multiplier for everyone, or for company `c` including its own supplier deal. */
  variableCostMult(c?: Company): number {
    let m = 1;
    for (const e of this.events) if (e.kind === 'supplierHike') m *= 2;
    if (c && this.day < c.supplierDealUntil) m *= CONFIG.cards.supplierDealMult;
    return m;
  }

  /** Push needed to win one area from `target` (NEUTRAL or a company id). */
  tileCost(attacker: Company, target: number, tile: number): number {
    return this.streetCost(attacker, target, tile).total;
  }

  /** The cost of winning a street, with each part of the defender's defence. */
  streetCost(attacker: Company, target: number, tile: number): StreetCost {
    // Wealthier customers are worth more, and harder to win.
    const w = CONFIG.wealth[this.map.wealth[tile]];
    const d = this.map.demand[tile] * w.pushCost;
    if (target === NEUTRAL) {
      const base = CONFIG.sales.neutralTileCost * d;
      return { base, defence: 1, service: 1, loyalty: 1, reserve: 1, priceGap: 1, guard: 1, total: base };
    }
    const def = this.companies[target];
    // Price matters a lot to budget customers and little to luxury ones,
    // who also stick with premium brands and distrust cheap ones.
    const sens = w.priceSensitivity;
    let loyalty = 1 + (CONFIG.prices[def.price].loyalty - 1) * sens;
    if (def.price === 'high') loyalty *= w.prestige;
    if (def.price === 'low') loyalty /= w.prestige;
    const service = Math.max(0.3, this.serviceLevel(def));
    const reserve = this.retention(def);
    const ar = CONFIG.prices[attacker.price].revenue;
    const dr = CONFIG.prices[def.price].revenue;
    const priceGap = ar < dr ? 1 - 0.25 * sens : ar > dr ? 1 + 0.25 * sens : 1;
    const guard = this.isGuarded(tile, target) ? CONFIG.guard.defenceMult : 1;
    const defence = service * loyalty * reserve * priceGap * guard;
    const base = CONFIG.sales.rivalTileCost * d;
    return { base, defence, service, loyalty, reserve, priceGap, guard, total: base * defence };
  }

  /** How hard a company's streets are to steal, before street-specific factors (price fit, guards). */
  defence(c: Company): number {
    return Math.max(0.3, this.serviceLevel(c)) * this.retention(c);
  }

  isGuarded(tile: number, owner: number): boolean {
    return this.guardOwner[tile] === owner && this.day < this.guardUntil[tile];
  }

  /** Your streets near `tile` that a guard would cover, and what it costs. */
  guardOffer(c: Company, tile: number): { streets: number[]; cost: number } {
    const G = CONFIG.guard;
    const streets = this.streetsNear(tile, G.radius).filter((t) => this.owner[t] === c.id);
    const customers = streets.reduce((s, t) => s + this.map.demand[t], 0);
    return { streets, cost: Math.max(G.minCost, Math.round(customers * G.costPerCustomer)) };
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

  /** Records that `taker` won a street from `victim`, as evidence for a lawsuit. */
  recordTaking(taker: number, victim: number, spend: number): void {
    const key = `${taker}>${victim}`;
    this.takenStreets.set(key, (this.takenStreets.get(key) ?? 0) + 1);
    this.takenSpend.set(key, (this.takenSpend.get(key) ?? 0) + spend);
  }

  /** Recent streets `taker` took from `victim` (older ones count less). */
  streetsTaken(taker: number, victim: number): number {
    return this.takenStreets.get(`${taker}>${victim}`) ?? 0;
  }

  spendTaken(taker: number, victim: number): number {
    return this.takenSpend.get(`${taker}>${victim}`) ?? 0;
  }

  /** Once a day, old grievances fade (half-life `evidenceHalfLifeDays`). */
  decayEvidence(): void {
    const k = 1 - 0.693 / CONFIG.lawsuit.evidenceHalfLifeDays;
    for (const m of [this.takenStreets, this.takenSpend]) for (const [key, v] of m) m.set(key, v * k);
  }

  /** Chance `plaintiff` wins a lawsuit against `defendant`, from the evidence. */
  lawsuitWinChance(plaintiff: number, defendant: number): number {
    const L = CONFIG.lawsuit;
    let p = L.baseWinChance + L.winChancePerStolenStreet * this.streetsTaken(defendant, plaintiff);
    if (this.companies[defendant].price === 'low') p += L.predatoryPricingBonus;
    return Math.min(L.maxWinChance, p);
  }

  /** Legal fees to file a lawsuit: they scale with the plaintiff's size. */
  lawsuitFee(c: Company): number {
    const L = CONFIG.lawsuit;
    return Math.max(L.minFee, c.pnl.revenue * L.feeRevenueDays);
  }

  /** What a lawsuit is worth to `plaintiff` on average: its share of damages if it wins, minus fees and the risk of paying costs. */
  lawsuitValue(plaintiff: number, defendant: number): number {
    const L = CONFIG.lawsuit;
    const fee = this.lawsuitFee(this.companies[plaintiff]);
    const p = this.lawsuitWinChance(plaintiff, defendant);
    return p * this.lawsuitDamages(plaintiff, defendant) * (1 - L.lawyerShare) - (1 - p) * fee * L.dismissedCostShare - fee;
  }

  /** Days a price change takes to roll out: big companies are slower. */
  priceDelayDays(c: Company): number {
    const A = CONFIG.agility;
    return Math.min(A.maxDelayDays, Math.floor(c.employees / A.employeesPerDelayDay));
  }

  /** Companies alive, best valuation first. */
  ranking(): Company[] {
    return this.companies.filter((c) => c.alive).sort((a, b) => this.valuation(b).total - this.valuation(a).total || a.id - b.id);
  }

  /**
   * How lucky a company's opportunities are: from leaderLuck for the leader to
   * lastLuck for the last, like item boxes in a kart race.
   */
  luck(c: Company): number {
    const K = CONFIG.cards;
    const rank = this.ranking();
    const i = rank.indexOf(c);
    if (rank.length <= 1 || i < 0) return 1;
    return K.leaderLuck + ((K.lastLuck - K.leaderLuck) * i) / (rank.length - 1);
  }

  /**
   * Changes how many customers live on some streets and how much they spend
   * (a new metro station, roadworks…), keeping every owner's totals right.
   */
  scaleStreets(streets: number[], demandMult: number, spendMult: number): void {
    const m = this.map;
    for (const t of streets) {
      const o = this.owner[t];
      const w = m.wealth[t];
      const dd = m.demand[t] * (demandMult - 1);
      const ds = m.spend[t] * (spendMult * demandMult - 1);
      m.demand[t] += dd;
      m.spend[t] += ds;
      if (o < 0) continue;
      const c = this.companies[o];
      c.customers += dd;
      c.spend += ds;
      c.tierCustomers[w] += dd;
      c.tierSpend[w] += ds;
    }
  }

  /** Streets whose midpoint is within `radius` metres of street `center`. */
  streetsNear(center: number, radius: number): number[] {
    const m = this.map;
    const out: number[] = [];
    const r2 = radius * radius;
    for (let i = 0; i < m.size; i++) {
      const dx = m.x[i] - m.x[center];
      const dy = m.y[i] - m.y[center];
      if (dx * dx + dy * dy <= r2) out.push(i);
    }
    return out;
  }

  /** "near Rue X", or where in the city, for news about a place. */
  placeName(street: number): string {
    const name = this.streetNames[street];
    if (name) return `near ${name}`;
    const m = this.map;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < m.size; i++) (sx += m.x[i]), (sy += m.y[i]);
    const dx = m.x[street] - sx / m.size;
    const dy = m.y[street] - sy / m.size;
    const w = this.cityWidth();
    const ns = dy > w * 0.1 ? 'north' : dy < -w * 0.1 ? 'south' : '';
    const ew = dx > w * 0.1 ? 'east' : dx < -w * 0.1 ? 'west' : '';
    return ns || ew ? `in the ${[ns, ew].filter(Boolean).join('-')}` : 'downtown';
  }

  /** Width of the city in metres. */
  cityWidth(): number {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < this.map.size; i++) {
      lo = Math.min(lo, this.map.x[i]);
      hi = Math.max(hi, this.map.x[i]);
    }
    return hi - lo;
  }

  /** Damages if `plaintiff` wins: its lost profits on the streets `defendant` took. */
  lawsuitDamages(plaintiff: number, defendant: number): number {
    const L = CONFIG.lawsuit;
    const lostPerDay = this.spendTaken(defendant, plaintiff) * (CONFIG.prices.medium.revenue - CONFIG.variableCostPerCustomer);
    return Math.max(0, lostPerDay * L.damagesDays);
  }

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
    const streets = (n: number) => (n === 1 ? '1 street' : `${n} streets`);
    const parts: string[] = [];
    for (const [cause, n] of m) {
      if (cause === 'churn') parts.push(`${streets(n)} left because you were overloaded`);
      else parts.push(`${this.companies[cause].name} stole ${streets(n)}`);
    }
    this.message(companyId, `You lost streets: ${parts.join('; ')}.`, 'bad');
    m.clear();
  }

/** Releases customers in several clusters spread over the territory. */
  releaseScattered(ownerId: number, total: number, clusters: number): number {
    const game = this;
    const owned: number[] = [];
    for (let i = 0; i < game.owner.length; i++) if (game.owner[i] === ownerId) owned.push(i);
    if (owned.length === 0 || total <= 0) return 0;
    const perCluster = Math.max(1, Math.ceil(total / clusters));
    const nb: number[] = [];
    let lost = 0;
    for (let k = 0; k < clusters && lost < total; k++) {
      const start = owned[game.rng.int(0, owned.length)];
      if (game.owner[start] !== ownerId) continue;
      const queue = [start];
      let taken = 0;
      while (queue.length > 0 && taken < perCluster && lost < total) {
        const t = queue.shift()!;
        if (game.owner[t] !== ownerId) continue;
        game.setOwner(t, NEUTRAL);
        taken++;
        lost++;
        for (const n of neighbors(game.map, t, nb)) if (game.owner[n] === ownerId) queue.push(n);
      }
    }
    return lost;
  }

  /** Customers in the whole city. */
  totalCustomers(): number {
    let t = 0;
    for (let i = 0; i < this.map.size; i++) t += this.map.demand[i];
    return t;
  }

  /**
   * A block of a rival's streets `buyer` could buy around `tile`: the street
   * and its same-owner neighbours, up to blockSize, and the price.
   */
  streetDeal(buyer: Company, tile: number): { seller: number; streets: number[]; cost: number } | null {
    const D = CONFIG.streetDeal;
    const seller = this.owner[tile];
    if (seller < 0 || seller === buyer.id || !this.companies[seller].alive || this.dealLocked(tile)) return null;
    const streets: number[] = [];
    const seen = new Set([tile]);
    const queue = [tile];
    while (queue.length > 0 && streets.length < D.blockSize) {
      const t = queue.shift()!;
      streets.push(t);
      for (const n of neighbors(this.map, t, this.nb)) {
        if (!seen.has(n) && this.owner[n] === seller && !this.dealLocked(n)) (seen.add(n), queue.push(n));
      }
    }
    const push = streets.reduce((s, t) => s + this.tileCost(buyer, seller, t), 0);
    return { seller, streets, cost: Math.round(push * D.dollarsPerPush * (1 + D.stepShare * buyer.dealHeat)) };
  }

  /** Was `tile` bought in a deal recently (so it can't be bought back with cash yet)? */
  dealLocked(tile: number): boolean {
    return this.day < this.dealLockUntil[tile];
  }

  /** Is `tile` next to one of `c`'s streets? */
  borders(c: Company, tile: number): boolean {
    for (const n of neighbors(this.map, tile, this.nb2)) if (this.owner[n] === c.id) return true;
    return false;
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
      oc.tierCustomers[this.map.wealth[tile]] -= d;
      oc.tierSpend[this.map.wealth[tile]] -= this.map.spend[tile];
      oc.border.delete(tile);
    }
    this.owner[tile] = newOwner;
    if (newOwner >= 0) {
      const nc = this.companies[newOwner];
      nc.tiles++;
      nc.customers += d;
      nc.spend += this.map.spend[tile];
      nc.tierCustomers[this.map.wealth[tile]] += d;
      nc.tierSpend[this.map.wealth[tile]] += this.map.spend[tile];
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
    // Small matches start everyone in middle-income areas, so nobody gets a richer start.
    // Big matches also allow budget and upscale areas, so starts can cover the whole city.
    const startWealth = (w: number) => w === Wealth.Middle || (this.companies.length > 4 && w !== Wealth.Luxury);
    let candidates: number[] = [];
    for (let i = 0; i < m.size; i++) {
      if (inside(i) && startWealth(m.wealth[i]) && m.demand[i] <= median * 1.5) candidates.push(i);
    }
    if (candidates.length < this.companies.length) candidates = [...Array(m.size).keys()];
    // Spread the starts as evenly as possible: from a random first start, each next one
    // goes to the candidate farthest from all starts so far. Keep the best of a few tries.
    const n = this.companies.length;
    let best: number[] = [];
    let bestSpread = -1;
    const nearest = new Float64Array(candidates.length);
    for (let attempt = 0; attempt < 24; attempt++) {
      const set = [candidates[this.rng.int(0, candidates.length)]];
      nearest.fill(Infinity);
      let spread = Infinity;
      while (set.length < n) {
        const last = set[set.length - 1];
        let far = -1;
        for (let k = 0; k < candidates.length; k++) {
          const c = candidates[k];
          nearest[k] = Math.min(nearest[k], Math.hypot(m.x[c] - m.x[last], m.y[c] - m.y[last]));
          if (far < 0 || nearest[k] > nearest[far]) far = k;
        }
        spread = Math.min(spread, nearest[far]);
        set.push(candidates[far]);
      }
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

  /**
   * Before the match starts, moves company `c` to a new starting neighbourhood
   * around `tile`: same number of customers, grown along untapped streets.
   * Returns an error message, or null when it moved.
   */
  relocateStart(c: Company, tile: number): string | null {
    if (this.tick > 0) return 'You can only choose where you start before the match begins.';
    if (tile < 0 || tile >= this.map.size || this.owner[tile] !== NEUTRAL) return 'Pick an untapped street to start on.';
    const m = this.map;
    // Check there is room before giving up the old streets.
    const room: number[] = [];
    const seen = new Set([tile]);
    const queue = [tile];
    const nb: number[] = [];
    let customers = 0;
    while (queue.length > 0 && customers < CONFIG.start.customers) {
      const t = queue.shift()!;
      if (customers > 0 && customers + m.demand[t] > CONFIG.start.customers * 1.1) continue;
      room.push(t);
      customers += m.demand[t];
      for (const n of neighbors(m, t, nb)) if (!seen.has(n) && this.owner[n] === NEUTRAL) (seen.add(n), queue.push(n));
    }
    if (customers < CONFIG.start.customers * 0.8) return 'Not enough room there: pick a spot further from your rivals.';
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === c.id) this.setOwner(i, NEUTRAL);
    for (const t of room) this.setOwner(t, c.id);
    return null;
  }
}

function newCompany(id: number, s: CompanySpec): Company {
  return {
    id,
    name: s.name,
    color: s.color,
    isBot: s.isBot,
    personality: s.personality ?? 'balanced',
    difficulty: s.difficulty ?? 'normal',
    alive: true,
    cash: CONFIG.start.cash,
    debt: 0,
    employees: CONFIG.start.employees,
    trainees: [],
    salesShare: CONFIG.start.salesShare,
    price: s.price ?? (s.personality === 'discounter' ? 'low' : s.personality === 'premium' ? 'high' : 'medium'),
    pendingPrice: null,
    stake: 1,
    offer: null,
    supplierDealUntil: 0,
    strikeFrom: 0,
    strikeUntil: 0,
    push: CONFIG.start.push, // enough for a first expansion right away
    campaignShare: CONFIG.sales.campaignShare,
    pushCommitted: 0,
    adHeat: 0,
    dealHeat: 0,
    lastAdDay: -Infinity,
    tiles: 0,
    customers: 0,
    spend: 0,
    tierCustomers: [0, 0, 0, 0],
    tierSpend: [0, 0, 0, 0],
    border: new Set(),
    pnl: emptyPnl(),
    oneOff: { hiring: 0, severance: 0, legalFees: 0, damages: 0, advertising: 0, guards: 0, streetDeals: 0 },
    avgProfit: 0,
    churnCarry: 0,
    negativeCashDays: 0,
    peakTiles: 0,
    peakValuation: 0,
    closedDay: null,
  };
}
