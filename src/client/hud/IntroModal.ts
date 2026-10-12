import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';

const SOURCE_URL = 'https://github.com/cleyfe/unicornrushIO';

/** Copyright notice and links required by the license terms (AGPL §13 source link). */
export const LEGAL_FOOTER = `<p class="legal">© UnicornRush and Contributors · <a href="${SOURCE_URL}" target="_blank" rel="noopener">Source (AGPL)</a> · <a href="terms-of-service.html">Terms</a> · <a href="privacy-policy.html">Privacy</a></p>`;

/** Title screen with the rules in a nutshell. Resolves with the company name. */
export function showIntro(container: HTMLElement, onStart: (name: string) => void): void {
  container.innerHTML = `
    <div class="overlay"><div class="card intro">
      <h1>Unicorn<b>Rush</b></h1>
      <p class="lead">Run a company. Win customers. Don't run out of cash.</p>
      <ol>
        <li>🏙️ The map is a real city and you fight over its <b>streets</b>. Grey streets are untapped; colours are companies. Streets with big buildings have the most customers.</li>
        <li>💎 Golden buildings are richer neighbourhoods: Budget, Middle, Upscale, Luxury. Rich customers spend up to ×${CONFIG.wealth[3].spend} more, and cost the same to serve.</li>
        <li>🤝 Staff in <b>Sales</b> build up <b>push</b>. Click a street (or a building on it) next to yours to win its customers.</li>
        <li>⚙️ Staff in <b>Operations</b> serve customers. Each serves ${CONFIG.staff.customersPerOps} customers. Overloaded companies lose customers.</li>
        <li>🏷️ <b>Price</b> trades margin for growth and loyalty.</li>
        <li>📊 Every day: <b>Revenue − Costs = Profit</b>, added to cash. Cash below zero for ${CONFIG.bankruptcyGraceDays} days means bankruptcy.</li>
        <li>⚖️ You can <b>sue</b> a rival (${money(CONFIG.lawsuit.cost)}): it loses customers everywhere, unless the court dismisses the case.</li>
        <li>🦄 First company valued at <b>$1B</b> wins. Otherwise the most valuable company after ${CONFIG.matchDays} days wins.</li>
      </ol>
      <div class="intro-actions">
        <input id="name" maxlength="16" placeholder="Your company name" value="Your Co" />
        <button id="start" class="primary">Start company</button>
      </div>
      <p class="tip">Rivals: <b style="color:#ef4444">BudgetMart</b> (cheap &amp; aggressive), <b style="color:#22c55e">Steady &amp; Co</b> (balanced), <b style="color:#a855f7">Luxe Ltd</b> (premium). Keys: Space pauses, 1/2/3 change speed.</p>
      ${LEGAL_FOOTER}
    </div></div>`;
  const input = container.querySelector<HTMLInputElement>('#name')!;
  const start = () => onStart(input.value.trim() || 'Your Co');
  container.querySelector('#start')!.addEventListener('click', start);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && start());
}
