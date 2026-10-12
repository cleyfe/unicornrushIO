import type { GameResult } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
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

  const lessons: string[] = [];
  if (me.debt > 0 && !me.alive) lessons.push('Debt made you fragile: interest kept running when revenue fell.');
  if (me.alive && me.peakTiles > me.tiles * 2) {
    lessons.push('You grew big but lost much of it. Growth needs capacity to serve customers.');
  }
  if (me.price === 'low') lessons.push('Low prices win market share, but thin margins make valuation hard to grow.');
  if (me.buildings.warehouse === 0) lessons.push('A Warehouse cuts variable costs: scale makes each customer cheaper to serve.');
  if (me.buildings.legalDept === 0) lessons.push('Without a Legal Dept, every lawsuit against you sticks. Compliance is insurance.');
  lessons.push('Valuation = cash − debt + assets + 10× yearly profit. Profit drives value more than size does.');

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
    <table class="final"><tr><th>Company</th><th>Final value</th><th>Peak value</th><th>Peak buildings</th></tr>${rows}</table>
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
