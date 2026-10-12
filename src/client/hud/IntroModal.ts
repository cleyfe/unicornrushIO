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
        <li>🏙️ The map is a city and you fight over its <b>streets</b>. Grey streets are untapped; colours are companies. Downtown streets have the most customers.</li>
        <li>💎 The curb colour shows a street's wealth: Budget, Middle, Upscale or Luxury. Rich customers spend up to ×${CONFIG.wealth[3].spend} more, and cost the same to serve.</li>
        <li>🤝 Staff in <b>Sales</b> build up <b>push</b>. Click a street next to yours to win its customers.</li>
        <li>⚙️ Staff in <b>Operations</b> serve customers. Each serves ${CONFIG.staff.tilesPerOps} street sections. Overloaded companies lose customers.</li>
        <li>🏷️ <b>Price</b> trades margin for growth and loyalty.</li>
        <li>📊 Every day: <b>Revenue − Costs = Profit</b>, added to cash. Cash below zero for ${CONFIG.bankruptcyGraceDays} days means bankruptcy.</li>
        <li>⚖️ With a Legal Dept you can <b>sue</b> a rival (${money(CONFIG.lawsuit.cost)}): it loses customers everywhere, unless its lawyers win.</li>
        <li>🦄 First company valued at <b>$1B</b> wins. Otherwise the most valuable company after ${CONFIG.matchDays} days wins.</li>
      </ol>
      <div class="intro-actions">
        <input id="name" maxlength="16" placeholder="Your company name" value="Your Co" />
        <button id="start" class="primary">Start company</button>
      </div>
      <p class="tip">Rivals: <b style="color:#e74c3c">BudgetMart</b> (cheap &amp; aggressive), <b style="color:#2ecc71">Steady &amp; Co</b> (balanced), <b style="color:#9b59b6">Luxe Ltd</b> (premium). Keys: Space pauses, 1/2/3 change speed.</p>
      ${LEGAL_FOOTER}
    </div></div>`;
  const input = container.querySelector<HTMLInputElement>('#name')!;
  const start = () => onStart(input.value.trim() || 'Your Co');
  container.querySelector('#start')!.addEventListener('click', start);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && start());
}
