import type { Company, Personality } from '@unicornrush/engine-api/game/Game';
import { NEUTRAL, WATER } from '@unicornrush/engine-api/game/GameMap';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { neighbors4 } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '../../game/GameImpl';
import type { Execution } from '../Execution';
import { createExecution } from '../ExecutionManager';

interface Persona {
  maxSales: number; // highest share of staff in sales
  salesRatio: number; // sales reps wanted per operations employee while growing
  reserveDays: number; // days of fixed costs kept as a cash buffer
  borrows: boolean;
  aggression: number; // 0..1 appetite for stealing rivals' customers
  litigious: number; // 0..1 appetite for suing the market leader
}

const PERSONAS: Record<Personality, Persona> = {
  discounter: { maxSales: 0.7, salesRatio: 1.0, reserveDays: 8, borrows: true, aggression: 1, litigious: 1 },
  balanced: { maxSales: 0.6, salesRatio: 0.7, reserveDays: 12, borrows: true, aggression: 0.6, litigious: 0.5 },
  premium: { maxSales: 0.5, salesRatio: 0.5, reserveDays: 18, borrows: false, aggression: 0.3, litigious: 0.3 },
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
    const b = CONFIG.buildings;
    const id = c.id;
    const fixedPerDay = c.pnl.salaries + c.pnl.rent + c.pnl.interest;
    const reserve = Math.max(5_000, fixedPerDay * p.reserveDays);
    // Track what this day's decisions will spend so they don't overlap.
    let cash = c.cash;

    // 1. Staff split: enough operations to serve every customer, the rest sells.
    const branchCap = c.buildings.branch * b.branch.capacity;
    const opsNeeded = Math.ceil(Math.max(0, c.tiles * 1.08 - branchCap) / s.tilesPerOps);
    const share = c.employees > 0 ? 1 - opsNeeded / c.employees : 0;
    this.act(g, { type: 'setSalesShare', companyId: id, share: Math.min(p.maxSales, Math.max(0.05, share)) });

    // Growth only makes sense while there are customers worth winning.
    const f = this.scanFrontier(g);
    const canGrow = f.neutral > 0 || f.cheapestRival <= this.rivalThreshold();
    // Reinvest surplus cash in sales staff (about 3 months of salary each).
    const surplusReps = Math.floor(Math.max(0, cash - reserve * 3) / (s.salaryPerDay * 90));
    const salesWanted = canGrow
      ? Math.max(4, Math.ceil(opsNeeded * p.salesRatio), Math.min(surplusReps, opsNeeded * 2 + 10))
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

    // 3. Legal: defend when sued, and keep lawyers if planning to sue.
    const sued = g.lawsuits.some((l) => l.defendant === id);
    const wantsLawyers = sued || (p.litigious >= 0.5 && cash > b.legalDept.cost + CONFIG.lawsuit.cost + reserve);
    if (wantsLawyers && c.buildings.legalDept < (sued ? b.legalDept.max : 1) && cash > b.legalDept.cost + reserve) {
      this.act(g, { type: 'build', companyId: id, building: 'legalDept' });
      cash -= b.legalDept.cost;
    }
    const target = this.lawsuitTarget(g);
    if (target !== null && cash > CONFIG.lawsuit.cost + reserve * 2) {
      this.act(g, { type: 'lawsuit', companyId: id, targetId: target });
      cash -= CONFIG.lawsuit.cost;
    }

    // 4. Buildings, when they pay for themselves.
    const varCost = c.customers * CONFIG.variableCostPerCustomer * g.variableCostMult(c);
    const warehouseSaves = varCost * (1 - b.warehouse.variableCostMult);
    if (c.buildings.warehouse < b.warehouse.max && warehouseSaves > b.warehouse.rentPerDay * 2.5 && cash > b.warehouse.cost + reserve) {
      this.act(g, { type: 'build', companyId: id, building: 'warehouse' });
      cash -= b.warehouse.cost;
    } else if (g.coverage(c) < 1 && c.tiles > 80 && c.buildings.branch < b.branch.max && cash > b.branch.cost + reserve) {
      this.act(g, { type: 'build', companyId: id, building: 'branch' });
      cash -= b.branch.cost;
    } else if (g.salesStaff(c) >= 20 && c.buildings.adAgency < b.adAgency.max && cash > b.adAgency.cost + reserve * 1.5) {
      this.act(g, { type: 'build', companyId: id, building: 'adAgency' });
      cash -= b.adAgency.cost;
    }

    // 5. Hiring, from surplus cash only, up to the staff the business needs.
    if (staff < wanted && cash > reserve + s.hireCost * 2) {
      const affordable = Math.floor((cash - reserve) / (s.hireCost + s.salaryPerDay * 20));
      const n = Math.min(affordable, wanted - staff, Math.ceil(c.employees * 0.2) + 1);
      if (n > 0) this.act(g, { type: 'hire', companyId: id, count: n });
    }

    // 6. Sales campaigns.
    if (c.push >= Math.max(5, g.maxPush(c) * 0.3)) {
      let tile = -1;
      if (f.neutral > 8 || (f.neutral > 0 && f.cheapestRivalTile < 0)) tile = f.bestNeutral;
      else if (f.cheapestRival <= this.rivalThreshold()) tile = f.cheapestRivalTile;
      else if (f.neutral > 0) tile = f.bestNeutral;
      if (tile >= 0) this.act(g, { type: 'campaign', companyId: id, tile });
    }
  }

  /** Sue the market leader when it is pulling away, now and then. */
  private lawsuitTarget(g: GameImpl): number | null {
    const c = this.c;
    if (c.buildings.legalDept === 0 || g.activeLawsuitBy(c)) return null;
    const leader = g.leaderId();
    if (leader === null || leader === c.id) return null;
    if (g.valuation(g.companies[leader]).total < g.valuation(c).total * 1.3) return null;
    return g.rng.chance(this.p.litigious * 0.02) ? leader : null;
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
      for (const n of neighbors4(g.map, tile, this.nb)) {
        const o = g.owner[n];
        if (o === WATER || o === c.id) continue;
        if (o === NEUTRAL) {
          f.neutral++;
          if (seen++ < 60) {
            // Prefer streets with big spenders.
            const d = g.map.spend[n] + g.rng.next();
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
      const cost = g.tileCost(c, owner, tile) / g.map.spend[tile];
      if (cost < f.cheapestRival) {
        f.cheapestRival = cost;
        f.cheapestRivalTile = tile;
      }
    }
    return f;
  }
}
