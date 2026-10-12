import type { PriceLevel } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '../game/GameImpl';
import { InstantExecution } from './Execution';

export class SetSalesShareExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private share: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    game.companies[this.companyId].salesShare = Math.min(1, Math.max(0, this.share));
  }
}

export class SetPriceExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private price: PriceLevel,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    if (c.price === this.price || !(this.price in CONFIG.prices)) return;
    c.price = this.price;
    if (!c.isBot) game.message(c.id, `You set prices to ${CONFIG.prices[this.price].label}.`, 'info');
  }
}

export class HireExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private count: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    const n = Math.floor(this.count);
    if (n <= 0) return;
    const cost = n * CONFIG.staff.hireCost;
    if (c.cash < cost) return game.message(c.id, 'Not enough cash to hire.');
    c.cash -= cost;
    c.oneOff.hiring -= cost;
    c.trainees.push({ count: n, readyDay: game.day + CONFIG.staff.trainingDays });
  }
}

export class FireExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private count: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    const n = Math.min(Math.floor(this.count), c.employees - 1);
    if (n <= 0) return game.message(c.id, 'You need at least one employee.');
    c.employees -= n;
    c.cash -= n * CONFIG.staff.fireCost;
    c.oneOff.severance -= n * CONFIG.staff.fireCost;
    game.message(c.id, `You let ${n} ${n === 1 ? 'person' : 'people'} go (${money(n * CONFIG.staff.fireCost)} severance).`, 'info');
  }
}

export class BorrowExecution extends InstantExecution {
  constructor(private companyId: number) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    const amount = Math.min(CONFIG.bank.loanChunk, game.maxDebt(c) - c.debt);
    if (amount < 1000) return game.message(c.id, 'The bank will not lend more: grow revenue first.');
    c.debt += amount;
    c.cash += amount;
  }
}

export class RepayExecution extends InstantExecution {
  constructor(private companyId: number) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    const amount = Math.min(CONFIG.bank.loanChunk, c.debt, Math.max(0, c.cash));
    if (amount <= 0) return game.message(c.id, c.debt <= 0 ? 'You have no debt.' : 'Not enough cash to repay.');
    c.debt -= amount;
    c.cash -= amount;
  }
}
