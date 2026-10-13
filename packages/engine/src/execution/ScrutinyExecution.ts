import type { Company } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

const S = CONFIG.scrutiny;

/**
 * The bigger you are, the more people watch you: journalists, unions and
 * hackers go after a company that is far ahead. Strikes are announced a week
 * in advance, so a well-run leader can hire spare staff and ride them out.
 */
export class ScrutinyExecution implements Execution {
  private nextDay: number = S.firstDay;
  private strikes: { company: number; startsDay: number }[] = [];

  init(): void {}

  isActive(): boolean {
    return true;
  }

  tick(game: GameImpl): void {
    if (!game.isNewDay()) return;
    this.strikes = this.strikes.filter((s) => {
      if (game.day < s.startsDay) return true;
      const c = game.companies[s.company];
      if (!c.alive) return false;
      this.tell(game, c, `✊ Strike at ${c.name}! Operations run at ${Math.round(S.strikeCapacity * 100)}% for ${S.strikeDays} days.`);
      return false;
    });
    if (game.day < this.nextDay) return;
    const [leader, second] = game.ranking();
    if (!leader || !second || game.valuation(leader).total < S.minLead * Math.max(1, game.valuation(second).total)) {
      this.nextDay = game.day + 10; // nobody is far enough ahead; look again soon
      return;
    }
    this.nextDay = game.day + game.rng.range(S.minGap, S.maxGap);
    switch (game.rng.pick(['strike', 'press', 'breach'] as const)) {
      case 'strike':
        this.strikes.push({ company: leader.id, startsDay: game.day + S.strikeWarningDays });
        leader.strikeFrom = game.day + S.strikeWarningDays;
        leader.strikeUntil = leader.strikeFrom + S.strikeDays;
        this.tell(game, leader, `✊ Unions at ${leader.name} vote to strike in ${S.strikeWarningDays} days: operations will run at ${Math.round(S.strikeCapacity * 100)}%. Spare operations staff keep customers served.`);
        return;
      case 'press': {
        const lost = game.releaseScattered(leader.id, Math.ceil(leader.tiles * S.pressStreetShare), 6);
        this.tell(game, leader, `📰 A newspaper exposé on ${leader.name}: ${lost} streets of customers walk away.`);
        return;
      }
      case 'breach': {
        const fine = leader.pnl.revenue * S.breachRevenueDays;
        leader.cash -= fine;
        leader.oneOff.legalFees -= fine;
        this.tell(game, leader, `🔓 Hackers breach ${leader.name}'s customer data: ${money(fine)} in fines and fixes.`);
        return;
      }
    }
  }

  /** Public news, plus a direct message when it's the player. */
  private tell(game: GameImpl, c: Company, text: string): void {
    if (c.isBot) game.news(text, 'info');
    else game.message(c.id, text, 'bad');
  }
}
