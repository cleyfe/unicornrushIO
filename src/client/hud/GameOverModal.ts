import type { GameResult } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { History } from '../History';
import { rgb } from './dom';

/** End-of-match report: who won, why, and what to learn from it. */
const ONE_OFF_LABELS: Record<string, string> = {
  hiring: 'Recruiting',
  severance: 'Severance',
  legalFees: 'Lawsuits you filed',
  fines: 'Fines (antitrust, data breach)',
  damages: 'Lawsuit damages',
  advertising: 'Ads',
  guards: 'Guards',
  streetDeals: 'Street deals',
  poaching: 'Poaching',
};

/** "What happened": how cash, profit and streets moved over the player's last 60 days, and why. */
function whatHappened(game: GameImpl, history: History): string {
  const h = history.player;
  if (h.length < 2) return '';
  const end = h[h.length - 1];
  const start = h.find((s) => s.day >= end.day - 60) ?? h[0];
  const rows: string[] = [];
  rows.push(`<li>Day ${start.day} → ${end.day}: cash ${money(start.cash)} → <b>${money(end.cash)}</b>, profit ${money(start.profit)} → <b>${money(end.profit)}</b>/day, streets ${start.tiles} → <b>${end.tiles}</b>.</li>`);
  const costs = Object.keys(ONE_OFF_LABELS)
    .map((k) => ({ k, d: (end.oneOff[k] ?? 0) - (start.oneOff[k] ?? 0) }))
    .filter((x) => x.d <= -1)
    .sort((a, b) => a.d - b.d);
  if (costs.length) rows.push(`<li>Big one-off payments: ${costs.map((x) => `${ONE_OFF_LABELS[x.k]} <b class="neg">${money(x.d)}</b>`).join(' · ')}.</li>`);
  const me = game.player;
  const lost = Object.entries(me.lostTo).sort((a, b) => b[1] - a[1]);
  if (lost.length) {
    const who = lost.slice(0, 4).map(([k, n]) => (k === 'churn' ? `${n} left because you were overloaded` : `${game.companies[Number(k)].name} took ${n}`));
    rows.push(`<li>Streets lost over the match: ${who.join(' · ')}.</li>`);
  }
  return `<h3>What happened</h3><ul class="what">${rows.join('')}</ul>`;
}

export function showGameOver(game: GameImpl, r: GameResult, onAgain: () => void, history?: History, onWatch?: () => void): void {
  const me = game.player;
  const won = r.winnerId === game.playerId;
  const winner = r.winnerId === null ? null : game.companies[r.winnerId];
  const who = winner && winner.id !== game.playerId ? winner.name : 'You';
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
    playerBankrupt: `On day ${Math.floor(me.closedDay ?? r.day)} your company ${me.closedWhy ?? 'closed'}.`,
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
  if (me.oneOff.fines < 0) lessons.push(`Fines cost you ${money(-me.oneOff.fines)}: being the biggest draws regulators and hackers.`);
  if (me.stake < 0.999) {
    lessons.push(`You sold ${pct(1 - me.stake)} of your company to investors: you own ${pct(me.stake)}, a stake worth ${money(Math.max(0, game.valuation(me).total) * me.stake)}. Raising money speeds growth, at the price of a smaller slice.`);
  }
  if (me.debt === 0 && me.alive && !won) lessons.push('You never borrowed. Debt can speed up growth when each new customer earns more than the interest.');

  const rows = [...game.companies]
    .sort((a, b) => (b.id === r.winnerId ? 1 : 0) - (a.id === r.winnerId ? 1 : 0) || game.valuation(b).total - game.valuation(a).total)
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
    ${!me.alive && history ? whatHappened(game, history) : ''}
    ${lessons.length ? `<h3>Takeaways</h3><ul>${lessons.slice(0, 2).map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
    <div class="buttons"><button class="primary" id="again" disabled>🏠 Main menu</button><button id="explore">🗺 Explore map</button>${r.reason === 'playerBankrupt' && onWatch ? '<button id="watch">👀 Keep watching</button>' : ''}</div>
  </div>`;
  document.body.append(overlay);
  // A short delay so a click meant for the map doesn't dismiss the results.
  const again = overlay.querySelector<HTMLButtonElement>('#again')!;
  window.setTimeout(() => (again.disabled = false), 1500);
  // Explore: hide the results to pan and zoom the final map; a pill brings them back.
  const pill = document.createElement('button');
  pill.className = 'results-pill glass';
  pill.textContent = '🏁 Results';
  pill.addEventListener('click', () => {
    pill.remove();
    overlay.hidden = false;
  });
  overlay.querySelector('#explore')!.addEventListener('click', () => {
    overlay.hidden = true;
    document.body.append(pill);
  });
  again.addEventListener('click', () => {
    overlay.remove();
    pill.remove();
    onAgain();
  });
  overlay.querySelector('#watch')?.addEventListener('click', () => {
    overlay.remove();
    pill.remove();
    onWatch?.();
  });
}
