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
        <li><b>💎 Wealth:</b> golden buildings are rich streets: customers spend up to ×${CONFIG.wealth[3].spend} more. Once owned, they stay brighter and keep a gold rim.</li>
        <li><b>💰 Every day:</b> revenue − costs = profit, added to cash. Below zero for ${CONFIG.bankruptcyGraceDays} days = bankrupt.</li>
        <li><b>🏦 Bank:</b> borrow to grow faster; interest is due every day.</li>
        <li><b>🏢 Buy:</b> buy a block of up to ${CONFIG.streetDeal.blockSize} rival streets next to yours, instantly. It costs more than winning them with ads; they're then under contract for ${CONFIG.streetDeal.lockDays} days, so nobody can buy them back with cash.</li>
        <li><b>📢 Ads:</b> ${CONFIG.sales.adPush} push for ${money(CONFIG.sales.adBaseCost)}, then ${money(CONFIG.sales.adStepCost)} more for each recent ad (it eases off over a few weeks).</li>
        <li><b>🎯 Push per click:</b> the slider next to the push meter sets how much each click commits (10–100%). Unspent push comes back.</li>
        <li><b>🛡 Defence:</b> a rival's street costs more push than an untapped one: spare Ops staff, unspent push, a price that suits the street and a <b>Guard</b> on the area all make it harder to steal. Hover a street to see why it costs what it does.</li>
        <li><b>⚖️ Sue:</b> fees scale with your size (from ${money(CONFIG.lawsuit.minFee)}), so small companies can afford to sue the giants. Evidence decides the case.</li>
        <li><b>🎁 Opportunities:</b> every so often, pick one of three cards. The further behind you are, the more often they come and the bigger they are.</li>
        <li><b>🔮 Events:</b> recessions and booms are forecast ${CONFIG.events.warningDays} days ahead; new metro stations, roadworks and festivals ${CONFIG.localEvents.warningDays} days ahead. Prepare, or race there first.</li>
        <li><b>📰 Being big:</b> unions, journalists and hackers go after the leader, and big companies take longer to change prices.</li>
      </ol>
      <p class="tip">Keys: Space pause/play · H hire 10 · A ads · G guard · S sue · B buy · Q W E price · F money · R race · Esc close.</p>
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
