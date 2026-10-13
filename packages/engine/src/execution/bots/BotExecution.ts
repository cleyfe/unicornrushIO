import type { Company, Personality } from '@unicornrush/engine-api/game/Game';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { neighbors } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '../../game/GameImpl';
import type { Execution } from '../Execution';
import { createExecution } from '../ExecutionManager';
import { cardValue } from '../OpportunityExecution';

interface Persona {
  maxSales: number; // highest share of staff in sales
  salesRatio: number; // sales reps wanted per operations employee while growing
  reserveDays: number; // days of fixed costs kept as a cash buffer
  borrows: boolean;
  aggression: number; // 0..1 appetite for stealing rivals' customers
  litigious: number; // 0..1 appetite for suing the market leader
  service: number; // operations capacity kept per street (above 1 = better service)
  pushReserve: number; // share of max push kept back for defence before attacking
  taste: 'volume' | 'mixed' | 'wealth'; // which streets it goes after
}

const PERSONAS: Record<Personality, Persona> = {
  // Equally competent players with different styles: they only differ in
  // price, which streets they want, and how they balance attack and defence.
  discounter: { maxSales: 0.65, salesRatio: 0.9, reserveDays: 10, borrows: true, aggression: 0.8, litigious: 1, service: 1.05, pushReserve: 0.15, taste: 'volume' },
  balanced: { maxSales: 0.6, salesRatio: 0.8, reserveDays: 10, borrows: true, aggression: 0.6, litigious: 0.5, service: 1.1, pushReserve: 0.2, taste: 'mixed' },
  premium: { maxSales: 0.6, salesRatio: 0.8, reserveDays: 10, borrows: true, aggression: 0.5, litigious: 0.3, service: 1.15, pushReserve: 0.25, taste: 'wealth' },
};

interface Frontier {
  neutral: number;
  bestNeutral: number;
  cheapestRival: number; // push per customer
  cheapestRivalTile: number;
}

/**
 * Rule-based rival company. Decides once per game day and acts only through
 * intents, so it plays by exactly the same rules as a human.
 */
export class BotExecution implements Execution {
  private c!: Company;
  private p!: Persona;
  private nb: number[] = [];
  private lastGuardDay = -Infinity;
  private lastCampaignDay = -Infinity;

  constructor(private companyId: number) {}

  init(game: GameImpl): void {
    this.c = game.companies[this.companyId];
    this.p = PERSONAS[this.c.personality];
  }

  isActive(): boolean {
    return this.c.alive;
  }

  tick(game: GameImpl): void {
    if (game.isNewDay()) this.decide(game);
  }

  private act(game: GameImpl, intent: Intent): void {
    game.addExecution(createExecution(intent));
  }

  private decide(g: GameImpl): void {
    const c = this.c;
    const p = this.p;
    const s = CONFIG.staff;
    const id = c.id;
    const fixedPerDay = c.pnl.salaries + c.pnl.interest;
    const reserve = Math.max(5_000, fixedPerDay * p.reserveDays);
    // Track what this day's decisions will spend so they don't overlap.
    let cash = c.cash;

    // 1. Staff split: enough operations to serve every customer, the rest sells.
    const opsNeeded = Math.ceil((c.customers * p.service) / s.customersPerOps);
    const share = c.employees > 0 ? 1 - opsNeeded / c.employees : 0;
    this.act(g, { type: 'setSalesShare', companyId: id, share: Math.min(p.maxSales, Math.max(0.05, share)) });

    // Growth only makes sense while there are customers worth winning.
    const f = this.scanFrontier(g);
    const canGrow = f.neutral > 0 || f.cheapestRival <= this.rivalThreshold();
    // Reinvest surplus cash in sales staff: recruiting plus about three weeks of salary each.
    const level = CONFIG.difficulty[c.difficulty];
    const surplusReps = Math.floor(Math.max(0, cash - reserve * level.reserveMult) / (s.hireCost + s.salaryPerDay * level.repDays));
    const salesWanted = canGrow
      ? Math.max(4, Math.ceil(opsNeeded * p.salesRatio), Math.min(surplusReps, opsNeeded * 4 + 20))
      : 2;
    const wanted = opsNeeded + salesWanted;
    const staff = c.employees + g.traineeCount(c);

    // 2. Cash management.
    if (p.borrows && canGrow && cash < reserve && c.debt + CONFIG.bank.loanChunk <= g.maxDebt(c) * 0.6) {
      this.act(g, { type: 'borrow', companyId: id });
      cash += CONFIG.bank.loanChunk;
    }
    if (c.debt > 0 && cash > reserve * 2 + CONFIG.bank.loanChunk) {
      this.act(g, { type: 'repay', companyId: id });
      cash -= CONFIG.bank.loanChunk;
    }
    if (staff > wanted * 1.3 && c.employees > 6) {
      this.act(g, { type: 'fire', companyId: id, count: Math.ceil((staff - wanted) * 0.25) });
    } else if (cash < reserve * 0.25 && c.avgProfit < 0 && c.employees > 6) {
      this.act(g, { type: 'fire', companyId: id, count: Math.ceil(c.employees * 0.1) });
    }

    // 3. Sue the leader now and then.
    const target = this.lawsuitTarget(g);
    const fee = g.lawsuitFee(c);
    if (target !== null && cash > fee + reserve * 2) {
      this.act(g, { type: 'lawsuit', companyId: id, targetId: target });
      cash -= fee;
    }

    // 3b. Guard the front line against a rival that keeps taking our streets.
    const front = this.frontToGuard(g);
    if (front >= 0) {
      const offer = g.guardOffer(c, front);
      if (cash > offer.cost + reserve * 2) {
        this.act(g, { type: 'guard', companyId: id, tile: front });
        cash -= offer.cost;
        this.lastGuardDay = g.day;
      }
    }

    // 4. Hiring, from surplus cash only, up to the staff the business needs.
    if (staff < wanted && cash > reserve + s.hireCost * 2) {
      const affordable = Math.floor((cash - reserve) / (s.hireCost + s.salaryPerDay * 20));
      const n = Math.min(affordable, wanted - staff, Math.ceil(c.employees * level.growth) + 3);
      if (n > 0) this.act(g, { type: 'hire', companyId: id, count: n });
    }

    // 5. Advertising: turn idle cash into an ad campaign aimed at the best street, while it pays back.
    const ad = g.adOffer(c);
    const adTarget = f.neutral > 0 ? f.bestNeutral : f.cheapestRivalTile;
    if (canGrow && adTarget >= 0 && c.push < g.maxPush(c) * 0.5 && cash > ad.cost + reserve * 1.5 * level.reserveMult) {
      this.act(g, { type: 'advertise', companyId: id, tile: adTarget });
      cash -= ad.cost;
    }

    // 6. Opportunity cards: take the one worth the most.
    if (c.offer) {
      const values = c.offer.cards.map((card) => cardValue(c, card));
      this.act(g, { type: 'pickCard', companyId: id, index: values.indexOf(Math.max(...values)) });
    }

    // 7. Sales campaigns.
    const rested = g.day - this.lastCampaignDay >= level.expandEveryDays;
    if (rested && c.push >= Math.max(5, g.maxPush(c) * (p.pushReserve + level.extraPushReserve))) {
      let tile = -1;
      if (f.neutral > 8 || (f.neutral > 0 && f.cheapestRivalTile < 0)) tile = f.bestNeutral;
      else if (f.cheapestRival <= this.rivalThreshold()) tile = f.cheapestRivalTile;
      else if (f.neutral > 0) tile = f.bestNeutral;
      if (tile >= 0) {
        this.act(g, { type: 'campaign', companyId: id, tile });
        this.lastCampaignDay = g.day;
      }
    }
  }

  /** Sue the rival with the best case (evidence × damages), when it's worth the fees. */
  private lawsuitTarget(g: GameImpl): number | null {
    const c = this.c;
    if (g.activeLawsuitBy(c)) return null;
    let best: number | null = null;
    let bestValue = 0;
    for (const r of g.companies) {
      if (!r.alive || r.id === c.id) continue;
      if (g.lawsuitWinChance(c.id, r.id) < 0.45) continue;
      // Expected payoff: our share of damages if we win, minus their costs if we lose, minus fees.
      const value = g.lawsuitValue(c.id, r.id);
      if (value > bestValue) (bestValue = value), (best = r.id);
    }
    return best !== null && g.rng.chance(0.1 + this.p.litigious * 0.2) ? best : null;
  }


  /** A border street facing the rival that took most of our streets lately, if it's worth guarding. */
  private frontToGuard(g: GameImpl): number {
    const c = this.c;
    if (g.day - this.lastGuardDay < CONFIG.guard.days * 0.75) return -1;
    let attacker = -1;
    let most = 3; // at least this many streets lost recently
    for (const r of g.companies) {
      if (!r.alive || r.id === c.id) continue;
      const n = g.streetsTaken(r.id, c.id);
      if (n > most) (most = n), (attacker = r.id);
    }
    if (attacker < 0) return -1;
    for (const b of c.border) {
      if (g.isGuarded(b, c.id)) continue;
      for (const n of neighbors(g.map, b, this.nb)) if (g.owner[n] === attacker) return b;
    }
    return -1;
  }

  /** How much this company wants an untapped street, given its style. */
  private streetAppeal(g: GameImpl, tile: number): number {
    const wealth = g.map.wealth[tile];
    switch (this.p.taste) {
      case 'volume':
        return g.map.demand[tile]; // many customers, whatever they spend
      case 'wealth':
        return g.map.spend[tile] * (wealth >= 2 ? 1.5 : 0.6); // rich streets suit high prices
      default:
        return g.map.spend[tile];
    }
  }

  private rivalThreshold(): number {
    return CONFIG.sales.rivalTileCost * (0.5 + this.p.aggression * 0.9);
  }

  private scanFrontier(g: GameImpl): Frontier {
    const c = this.c;
    const sample = new Map<number, number>();
    const f: Frontier = { neutral: 0, bestNeutral: -1, cheapestRival: Infinity, cheapestRivalTile: -1 };
    let bestDemand = -1;
    let seen = 0;
    for (const tile of c.border) {
      for (const n of neighbors(g.map, tile, this.nb)) {
        const o = g.owner[n];
        if (o === c.id) continue;
        if (o === NEUTRAL) {
          f.neutral++;
          if (seen++ < 120) {
            // Value per push spent, like a good player, with a little variety.
            const d = (this.streetAppeal(g, n) / g.tileCost(c, NEUTRAL, n)) * (0.85 + 0.3 * g.rng.next());
            if (d > bestDemand) {
              bestDemand = d;
              f.bestNeutral = n;
            }
          }
        } else if (!sample.has(o) || g.rng.next() < 0.1) {
          sample.set(o, n);
        }
      }
    }
    for (const [owner, tile] of sample) {
      let cost = g.tileCost(c, owner, tile) / g.map.spend[tile];
      // Competitors focus on a runaway leader, as real rivals do.
      const leader = g.leaderId();
      if (CONFIG.difficulty[c.difficulty].leaderFocus && owner === leader && g.valuation(g.companies[owner]).total > g.valuation(c).total * 1.5) cost *= 0.6;
      if (cost < f.cheapestRival) {
        f.cheapestRival = cost;
        f.cheapestRivalTile = tile;
      }
    }
    return f;
  }
}
