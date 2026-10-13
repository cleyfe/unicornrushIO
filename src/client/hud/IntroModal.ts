import type { Difficulty } from '@unicornrush/engine-api/game/Game';
import { CITIES, type CityId } from '../cities';

const SOURCE_URL = 'https://github.com/cleyfe/unicornrushIO';

/** Copyright notice and links required by the license terms (AGPL §13 source link). */
export const LEGAL_FOOTER = `<p class="legal">© UnicornRush and Contributors · <a href="${SOURCE_URL}" target="_blank" rel="noopener">Source (AGPL)</a> · <a href="terms-of-service.html">Terms</a> · <a href="privacy-policy.html">Privacy</a> · Maps © OpenStreetMap contributors</p>`;

/** Title screen: pick a city and a company name. */
export function showIntro(container: HTMLElement, onStart: (name: string, city: CityId, difficulty: Difficulty) => void): void {
  let city: CityId = CITIES[0].id;
  let difficulty: Difficulty = 'normal';
  container.innerHTML = `
    <div class="overlay intro-bg"><div class="card intro">
      <h1>🦄 Unicorn<b>Rush</b></h1>
      <p class="lead">Build a company on real city streets. Win customers, watch your cash, and race your rivals to a <b>$1B valuation</b>.</p>
      <div class="steps">
        <div><span>1</span><b>Expand</b>Click streets next to yours to win their customers.</div>
        <div><span>2</span><b>Run it</b>Balance sales and operations staff, set your price, hire.</div>
        <div><span>3</span><b>Get rich</b>Profit raises your valuation. First to $1B wins.</div>
      </div>
      <h3>Choose a city</h3>
      <div class="cities">
        ${CITIES.map(
          (c, i) => `<button class="city-card${i === 0 ? ' active' : ''}" data-city="${c.id}" title="${c.blurb}">
            <span class="flag">${c.flag}</span><b>${c.name}</b><small>${c.area}</small></button>`,
        ).join('')}
      </div>
      <p class="city-blurb" data-v="blurb">${CITIES[0].blurb}</p>
      <h3>Rivals</h3>
      <div class="difficulty seg">
        <button data-difficulty="easy" title="Cautious rivals: good for learning the game">Easy<small>learning</small></button>
        <button data-difficulty="normal" class="active" title="Rivals that grow steadily">Normal<small>a fair fight</small></button>
        <button data-difficulty="hard" title="Rivals that invest like a skilled player">Hard<small>for experts</small></button>
      </div>
      <div class="intro-actions">
        <input id="name" maxlength="16" placeholder="Your company name" value="Your Co" aria-label="Company name" />
        <button id="start" class="primary">Start company ▶</button>
      </div>
      <p class="rivals">Your rivals: <b style="color:#ef4444">BudgetMart</b> (cheap, aggressive) · <b style="color:#22c55e">Steady &amp; Co</b> (balanced) · <b style="color:#a855f7">Luxe Ltd</b> (premium)</p>
      ${LEGAL_FOOTER}
    </div></div>`;
  container.querySelectorAll<HTMLButtonElement>('.city-card').forEach((b) =>
    b.addEventListener('click', () => {
      city = b.dataset.city as CityId;
      container.querySelectorAll('.city-card').forEach((x) => x.classList.toggle('active', x === b));
      container.querySelector('[data-v="blurb"]')!.textContent = CITIES.find((c) => c.id === city)!.blurb;
    }),
  );
  container.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((b) =>
    b.addEventListener('click', () => {
      difficulty = b.dataset.difficulty as Difficulty;
      container.querySelectorAll('[data-difficulty]').forEach((x) => x.classList.toggle('active', x === b));
    }),
  );
  const input = container.querySelector<HTMLInputElement>('#name')!;
  const start = () => onStart(input.value.trim() || 'Your Co', city, difficulty);
  container.querySelector('#start')!.addEventListener('click', start);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && start());
}
