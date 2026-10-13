import type { Lawsuit } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
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
    const fee = game.lawsuitFee(c);
    if (c.cash < fee) return fail(`Legal fees are ${money(fee)}: not enough cash.`);
    c.cash -= fee;
    c.oneOff.legalFees -= fee;
    this.suit = { plaintiff: c.id, defendant: d.id, filedDay: game.day, rulingDay: game.day + L.courtDays, fee };
    game.lawsuits.push(this.suit);
    const odds = Math.round(game.lawsuitWinChance(c.id, d.id) * 100);
    game.news(`⚖️ ${c.name} sued ${d.name} for unfair competition (${odds}% chance)! Ruling in ${L.courtDays} days.`, 'bad');
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
    if (!game.rng.chance(game.lawsuitWinChance(p.id, d.id))) {
      const costs = suit.fee * L.dismissedCostShare;
      p.cash -= costs;
      d.cash += costs;
      p.oneOff.legalFees -= costs;
      d.oneOff.damages += costs;
      game.news(`⚖️ Case dismissed! ${p.name} pays ${d.name}'s legal costs (${money(costs)}).`, 'info');
      game.message(p.id, `⚖️ Your lawsuit against ${d.name} was dismissed: you pay their ${money(costs)} costs.`, 'bad');
      game.message(d.id, `⚖️ ${p.name}'s lawsuit against you was dismissed! They pay you ${money(costs)}.`, 'good');
      return;
    }
    const lost = game.releaseScattered(d.id, Math.floor(d.tiles * L.customerLoss), L.clusters);
    const damages = game.lawsuitDamages(p.id, d.id);
    // The lawyers keep their share of the damages (their contingency fee).
    const kept = damages * (1 - L.lawyerShare);
    d.cash -= damages;
    p.cash += kept;
    d.oneOff.damages -= damages;
    p.oneOff.damages += kept;
    game.news(
      `⚖️ ${d.name} lost the lawsuit: the bad press drives away ${lost} streets of customers and it pays ${money(damages)} in damages to ${p.name}.`,
      'info',
    );
    game.message(p.id, `⚖️ You won the lawsuit! ${d.name} loses ${lost} streets and pays ${money(damages)} in damages: you keep ${money(kept)} after your lawyers' ${Math.round(L.lawyerShare * 100)}%.`, 'good');
    game.message(d.id, `⚖️ You lost ${p.name}'s lawsuit: the bad press drives away ${lost} streets of customers and you pay ${money(damages)}.`, 'bad');
  }
}
