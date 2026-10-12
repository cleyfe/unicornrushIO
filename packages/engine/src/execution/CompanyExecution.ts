import type { Company } from '@unicornrush/engine-api/game/Game';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

const DT = 1 / CONFIG.ticksPerDay;

/** Runs one company's day-to-day business: staff, churn, P&L and cash. */
export class CompanyExecution implements Execution {
  private c!: Company;

  constructor(private companyId: number) {}

  init(game: GameImpl): void {
    this.c = game.companies[this.companyId];
  }

  isActive(): boolean {
    return this.c.alive;
  }

  tick(game: GameImpl): void {
    const c = this.c;
    this.graduateTrainees(game);
    // Sales staff fill the pool up to its cap; ads can push it higher, and that isn't clawed back.
    const cap = game.maxPush(c);
    if (c.push < cap) c.push = Math.min(cap, c.push + game.pushPerDay(c) * DT);
    c.adHeat *= 1 - CONFIG.sales.adHeatDecayPerDay * DT;
    this.churn(game);
    this.economy(game);
    c.peakTiles = Math.max(c.peakTiles, c.tiles);
    c.peakValuation = Math.max(c.peakValuation, game.valuation(c).total);
    this.checkSolvency(game);
    if (game.tick % (CONFIG.ticksPerDay * 10) === 0) game.reportLosses(c.id);
  }

  private graduateTrainees(game: GameImpl): void {
    const c = this.c;
    if (c.trainees.length === 0) return;
    c.trainees = c.trainees.filter((t) => {
      if (t.readyDay > game.day) return true;
      c.employees += t.count;
      return false;
    });
  }

  /** Customers the operations team cannot serve drift away. */
  private churn(game: GameImpl): void {
    const c = this.c;
    // Unserved customers, expressed in streets.
    const excessCustomers = c.customers - game.capacity(c);
    const excess = c.tiles > 0 ? (excessCustomers * c.tiles) / c.customers : 0;
    if (excess <= 0) {
      c.churnCarry = 0;
      return;
    }
    c.churnCarry += Math.max(0.5, excess * CONFIG.churn.ratePerDay) * DT;
    if (c.churnCarry < 1) return;
    const lose = Math.floor(c.churnCarry);
    c.churnCarry -= lose;
    const border = [...c.border];
    for (let i = 0; i < lose && border.length > 0; i++) {
      const j = game.rng.int(0, border.length);
      const tile = border[j];
      border[j] = border[border.length - 1];
      border.pop();
      if (game.owner[tile] === c.id) {
        game.recordLoss(c.id, 'churn');
        game.setOwner(tile, NEUTRAL);
      }
    }
  }

  private economy(game: GameImpl): void {
    const c = this.c;
    const coverage = game.coverage(c);
    const price = CONFIG.prices[c.price];
    // Revenue depends on how much customers spend; serving them costs the same everywhere.
    // Price elasticity: cheaper prices make each customer buy more (and cost more to
    // serve), more so for price-sensitive budget customers than for luxury ones.
    let soldSpend = 0;
    let soldUnits = 0;
    for (let t = 0; t < 4; t++) {
      const v = game.volume(c, t);
      soldSpend += c.tierSpend[t] * v;
      soldUnits += c.tierCustomers[t] * v;
    }
    const p = {
      revenue: soldSpend * coverage * price.revenue * game.revenueMult(),
      variableCost: soldUnits * coverage * CONFIG.variableCostPerCustomer * game.variableCostMult(),
      salaries: (c.employees + game.traineeCount(c)) * CONFIG.staff.salaryPerDay,
      interest: (c.debt * CONFIG.bank.interestPerYear) / 365,
      profit: 0,
    };
    p.profit = p.revenue - p.variableCost - p.salaries - p.interest;
    c.pnl = p;
    c.cash += p.profit * DT;
    // Trailing average of daily profit; it starts at the first day's profit instead of ramping up from zero.
    if (game.tick === 1) c.avgProfit = p.profit;
    else c.avgProfit += (p.profit - c.avgProfit) * (DT / CONFIG.valuation.profitWindowDays);
  }

  private checkSolvency(game: GameImpl): void {
    const c = this.c;
    if (c.tiles === 0) {
      game.closeCompany(c, 'lost every customer');
      return;
    }
    if (c.cash >= 0) {
      c.negativeCashDays = 0;
      return;
    }
    if (c.negativeCashDays === 0) {
      if (c.isBot) game.news(`${c.name} is out of cash!`, 'bad');
      else game.message(c.id, `You are out of cash! Fix it within ${CONFIG.bankruptcyGraceDays} days.`, 'bad');
    }
    c.negativeCashDays += DT;
    if (c.negativeCashDays >= CONFIG.bankruptcyGraceDays) game.closeCompany(c, 'ran out of cash');
  }
}
