import type { PriceLevel } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '../game/GameImpl';
import { CampaignExecution } from './CampaignExecution';
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
    if (!(this.price in CONFIG.prices)) return;
    const label = CONFIG.prices[this.price].label;
    if (c.price === this.price) {
      // Going back to the current price cancels a change still rolling out.
      if (c.pendingPrice && !c.isBot) game.message(c.id, `Price change cancelled: you stay at ${label}.`, 'info');
      c.pendingPrice = null;
      return;
    }
    // Big companies are slower: new prices take a while to reach every shop.
    const delay = game.priceDelayDays(c);
    if (delay === 0) {
      c.price = this.price;
      c.pendingPrice = null;
      if (!c.isBot) game.message(c.id, `You set prices to ${label}.`, 'info');
      return;
    }
    c.pendingPrice = { price: this.price, day: game.day + delay };
    if (!c.isBot) {
      game.message(c.id, `With ${c.employees} staff, switching to ${label} prices takes ${delay} days. Small companies move faster.`, 'info');
    }
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

/** Buys an ad campaign aimed at a street: its push wins streets toward it until spent. */
export class AdvertiseExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private tile: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    if (this.tile < 0 || this.tile >= game.owner.length) return game.message(c.id, 'Aim your ad at a street.');
    const offer = game.adOffer(c);
    const wait = game.adWait(c);
    if (wait > 0) return game.message(c.id, `Your ad agency is still busy: next campaign in ${Math.ceil(wait)} days.`);
    if (c.cash < offer.cost) return game.message(c.id, `An ad campaign costs ${money(offer.cost)}: not enough cash.`);
    c.cash -= offer.cost;
    c.oneOff.advertising -= offer.cost;
    c.adHeat += 1;
    c.lastAdDay = game.day;
    game.addExecution(new CampaignExecution(c.id, this.tile, offer.push));
  }
}

/** Posts a dedicated account team on the neighbourhood around one of your streets. */
export class GuardExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private tile: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    if (!c.alive || game.owner[this.tile] !== c.id) return game.message(c.id, 'Pick one of your own streets to guard.');
    const offer = game.guardOffer(c, this.tile);
    if (c.cash < offer.cost) return game.message(c.id, `Guarding this area costs ${money(offer.cost)}: not enough cash.`);
    c.cash -= offer.cost;
    c.oneOff.guards -= offer.cost;
    const until = game.day + CONFIG.guard.days;
    for (const t of offer.streets) {
      game.guardOwner[t] = c.id;
      game.guardUntil[t] = until;
    }
    game.guardVersion++;
    if (!c.isBot) game.message(c.id, `🛡 ${offer.streets.length} streets guarded for ${CONFIG.guard.days} days.`, 'good');
  }
}

/** Sets how much of the push pool each click commits. */
export class SetCampaignShareExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private share: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    if (!Number.isFinite(this.share)) return;
    c.campaignShare = Math.min(1, Math.max(CONFIG.sales.minCampaignShare, this.share));
  }
}

/**
 * Buys a block of a rival's streets next to yours by buying out the local shops'
 * contracts: the money leaves the game, and the streets are locked against
 * cash buybacks for a while (they can still be won with push).
 */
export class BuyStreetsExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private tile: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    if (!c.alive) return;
    if (this.tile < 0 || this.tile >= game.owner.length) return game.message(c.id, 'Pick a street.');
    if (game.dealLocked(this.tile)) {
      return game.message(c.id, `Those streets are under contract for ${Math.ceil(game.dealLockUntil[this.tile] - game.day)} more days.`);
    }
    const deal = game.streetDeal(c, this.tile);
    if (!deal) return game.message(c.id, "Pick a rival's street.");
    if (!game.borders(c, this.tile)) return game.message(c.id, 'You can only buy streets next to yours.');
    if (c.cash < deal.cost) return game.message(c.id, `These ${deal.streets.length} streets cost ${money(deal.cost)}: not enough cash.`);
    const seller = game.companies[deal.seller];
    c.cash -= deal.cost;
    c.oneOff.streetDeals -= deal.cost;
    c.dealHeat += 1;
    const lock = game.day + CONFIG.streetDeal.lockDays;
    for (const t of deal.streets) {
      game.setOwner(t, c.id);
      game.dealLockUntil[t] = lock;
    }
    const n = deal.streets.length;
    if (!c.isBot) game.message(c.id, `🏢 You bought out ${n} of ${seller.name}'s streets for ${money(deal.cost)}. They're under contract for ${CONFIG.streetDeal.lockDays} days.`, 'good');
    if (!seller.isBot) game.message(seller.id, `🏢 ${c.name} bought out ${n} of your streets' shops.`, 'bad');
  }
}

/** Before the match starts: moves the company's starting neighbourhood. */
export class RelocateExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private tile: number,
  ) {
    super();
  }
  protected apply(game: GameImpl): void {
    const error = game.relocateStart(game.companies[this.companyId], this.tile);
    if (error) game.message(this.companyId, error);
  }
}
