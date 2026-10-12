import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
import { LEGAL_FOOTER } from './IntroModal';
import { el } from './dom';

/** The rules in one screen, available any time from the "?" button. */
export function showHelp(onClose: () => void): void {
  const overlay = el(
    'div',
    'overlay',
    `<div class="card help">
      <button class="close" aria-label="Close">✕</button>
      <h2>How to play</h2>
      <ol class="rules">
        <li><b>🎯 Goal:</b> be the first company valued at <b>$1B</b> (a unicorn), or the most valuable after ${CONFIG.matchDays} days.</li>
        <li><b>🗺️ Expand:</b> click a glowing street next to yours to win its customers. It spends half your <b>sales push</b>.</li>
        <li><b>👥 Team:</b> sales staff build push; operations staff serve customers (${CONFIG.staff.customersPerOps} each). Unserved customers leave.</li>
        <li><b>🏷️ Price:</b> low wins customers fast and keeps them; high earns more per customer but is easier to steal, except on rich streets.</li>
        <li><b>💎 Wealth:</b> golden buildings are rich streets: customers spend up to ×${CONFIG.wealth[3].spend} more.</li>
        <li><b>💰 Every day:</b> revenue − costs = profit, added to cash. Below zero for ${CONFIG.bankruptcyGraceDays} days = bankrupt.</li>
        <li><b>🏦 Bank:</b> borrow to grow faster; interest is due every day.</li>
        <li><b>⚖️ Sue:</b> ${money(CONFIG.lawsuit.cost)} to hit a rival's customers all over the city, unless the court dismisses it.</li>
      </ol>
      <p class="tip">Keys: Space pauses · 1, 2, 3 change speed · scroll to zoom · drag to move the map.</p>
      ${LEGAL_FOOTER}
    </div>`,
  );
  const close = () => {
    overlay.remove();
    onClose();
  };
  overlay.querySelector('.close')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => e.target === overlay && close());
  document.body.append(overlay);
}
