import type { Lawsuit } from '@unicornrush/engine-api/game/Game';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
import { neighbors } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

/**
 * An unfair-competition lawsuit: the plaintiff accuses a rival of unfair
 * practices (misleading ads, poaching, predatory pricing). It pays heavy legal
 * fees, the case goes to court, and unless it is dismissed, the defendant loses customers all over its territory and pays damages.
 */
export class LawsuitExecution implements Execution {
  private active = true;
  private suit: Lawsuit | null = null;

  constructor(
    private companyId: number,
    private targetId: number,
  ) {}

  init(game: GameImpl): void {
    const c = game.companies[this.companyId];
    const d = game.companies[this.targetId];
    const L = CONFIG.lawsuit;
    const fail = (msg: string) => {
      game.message(c.id, msg);
      this.active = false;
    };
    if (!c.alive) return fail('Your company is closed.');
    if (!d || !d.alive || d.id === c.id) return fail('Pick a rival that is still in business.');
    if (game.activeLawsuitBy(c)) return fail('Your lawyers are already busy with a case.');
    if (c.cash < L.cost) return fail(`Legal fees are ${money(L.cost)}: not enough cash.`);
    c.cash -= L.cost;
    c.oneOff.legalFees -= L.cost;
    this.suit = { plaintiff: c.id, defendant: d.id, filedDay: game.day, rulingDay: game.day + L.courtDays };
    game.lawsuits.push(this.suit);
    game.news(`⚖️ ${c.name} sued ${d.name} for unfair competition! Ruling in ${L.courtDays} days.`, 'bad');
  }

  isActive(): boolean {
    return this.active;
  }

  tick(game: GameImpl): void {
    const suit = this.suit!;
    // A party closing ends the case (closeCompany drops it from the docket).
    if (!game.lawsuits.includes(suit)) {
      this.active = false;
      return;
    }
    if (game.day < suit.rulingDay) return;
    this.rule(game, suit);
    game.lawsuits = game.lawsuits.filter((l) => l !== suit);
    this.active = false;
  }

  private rule(game: GameImpl, suit: Lawsuit): void {
    const p = game.companies[suit.plaintiff];
    const d = game.companies[suit.defendant];
    const L = CONFIG.lawsuit;
    if (game.rng.chance(L.dismissChance)) {
      p.cash -= L.dismissedCounterCost;
      d.cash += L.dismissedCounterCost;
      p.oneOff.legalFees -= L.dismissedCounterCost;
      d.oneOff.damages += L.dismissedCounterCost;
      game.news(`⚖️ Case dismissed! ${p.name} pays ${d.name}'s legal costs (${money(L.dismissedCounterCost)}).`, 'info');
      game.message(p.id, `⚖️ Your lawsuit against ${d.name} was dismissed: you pay their ${money(L.dismissedCounterCost)} costs.`, 'bad');
      game.message(d.id, `⚖️ ${p.name}'s lawsuit against you was dismissed! They pay you ${money(L.dismissedCounterCost)}.`, 'good');
      return;
    }
    const lost = this.scatterLoss(game, d.id, Math.floor(d.tiles * L.customerLoss));
    const damages = Math.max(0, d.pnl.revenue * L.damagesRevenueDays);
    d.cash -= damages;
    p.cash += damages;
    d.oneOff.damages -= damages;
    p.oneOff.damages += damages;
    game.news(
      `⚖️ ${d.name} lost the lawsuit: the bad press drives away ${lost} streets of customers and it pays ${money(damages)} in damages to ${p.name}.`,
      'info',
    );
    game.message(p.id, `⚖️ You won the lawsuit! ${d.name} loses ${lost} streets and pays you ${money(damages)}.`, 'good');
    game.message(d.id, `⚖️ You lost ${p.name}'s lawsuit: the bad press drives away ${lost} streets of customers and you pay ${money(damages)}.`, 'bad');
  }

  /** Releases customers in several clusters spread over the territory. */
  private scatterLoss(game: GameImpl, ownerId: number, total: number): number {
    const owned: number[] = [];
    for (let i = 0; i < game.owner.length; i++) if (game.owner[i] === ownerId) owned.push(i);
    if (owned.length === 0 || total <= 0) return 0;
    const perCluster = Math.max(1, Math.ceil(total / CONFIG.lawsuit.clusters));
    const nb: number[] = [];
    let lost = 0;
    for (let k = 0; k < CONFIG.lawsuit.clusters && lost < total; k++) {
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
}
