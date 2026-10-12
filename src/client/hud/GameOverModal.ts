import type { GameResult } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { rgb } from './dom';

/** End-of-match report: who won, why, and what to learn from it. */
export function showGameOver(game: GameImpl, r: GameResult, onAgain: () => void): void {
  const me = game.player;
  const won = r.winnerId === 0;
  const winner = r.winnerId === null ? null : game.companies[r.winnerId];
  const who = winner?.isBot ? winner.name : 'You';
  const headline = won
    ? r.reason === 'unicorn'
      ? '🦄 You built a unicorn!'
      : '🏆 You won!'
    : r.reason === 'playerBankrupt'
      ? '💸 Your company closed'
      : `${winner?.name ?? 'Nobody'} wins`;
  const why: Record<GameResult['reason'], string> = {
    unicorn: `${who} reached a $1B valuation on day ${Math.floor(r.day)}.`,
    time: `After ${CONFIG.matchDays} days, ${who === 'You' ? 'you' : who} had the most valuable company.`,
    lastStanding: `${who} outlasted every rival.`,
    playerBankrupt: `On day ${Math.floor(r.day)} you ${me.tiles === 0 ? 'lost every customer' : 'ran out of cash'}.`,
  };

  // Lessons drawn from what actually happened in this match.
  const lessons: string[] = [];
  const winnerC = winner ?? me;
  const margin = (c: typeof me) => (c.pnl.revenue > 0 ? c.pnl.profit / c.pnl.revenue : 0);
  if (!me.alive && me.debt > 0) lessons.push('Debt made you fragile: interest kept running when revenue fell.');
  if (!me.alive && me.debt === 0) lessons.push('You ran out of cash. Cash is what keeps a company alive, even when it looks profitable on paper.');
  if (me.alive && me.peakTiles > me.tiles * 1.6) lessons.push('You grew big but lost much of it. Growth needs operations capacity to keep the customers you win.');
  if (winnerC !== me && margin(winnerC) > margin(me) + 0.05) {
    lessons.push(`${winnerC.name} kept a ${pct(margin(winnerC))} profit margin vs your ${pct(margin(me))}: valuation follows profit, not just size.`);
  } else if (winnerC !== me && winnerC.peakTiles > me.peakTiles * 2) {
    lessons.push(`${winnerC.name} reached ${winnerC.peakTiles} streets vs your ${me.peakTiles}: scale matters when it stays profitable.`);
  }
  if (me.oneOff.legalFees < 0 && me.oneOff.damages + me.oneOff.legalFees < 0) {
    lessons.push(`Lawsuits cost you ${money(-(me.oneOff.damages + me.oneOff.legalFees))} net: legal battles are expensive bets.`);
  }
  if (me.debt === 0 && me.alive && !won) lessons.push('You never borrowed. Debt can speed up growth when each new customer earns more than the interest.');
  lessons.push(`Valuation = cash − debt + ${CONFIG.valuation.earningsMultiple}× yearly profit.`);

  const rows = [...game.companies]
    .sort((a, b) => b.peakValuation - a.peakValuation)
    .map(
      (c) => `<tr><td><i style="background:${rgb(c.color)}"></i>${c.name}</td>
        <td>${c.alive ? money(game.valuation(c).total) : 'closed'}</td><td>${money(c.peakValuation)}</td><td>${c.peakTiles}</td></tr>`,
    )
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="card result">
    <h1>${headline}</h1>
    <p class="lead">${why[r.reason]}</p>
    <table class="final"><tr><th>Company</th><th>Final value</th><th>Peak value</th><th>Peak streets</th></tr>${rows}</table>
    <h3>What to take away</h3>
    <ul>${lessons.map((l) => `<li>${l}</li>`).join('')}</ul>
    <button class="primary" id="again">Play again</button>
  </div>`;
  document.body.append(overlay);
  overlay.querySelector('#again')!.addEventListener('click', () => {
    overlay.remove();
    onAgain();
  });
}
