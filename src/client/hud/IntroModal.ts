import { apiUrl } from '../net/api';
import type { Difficulty } from '@unicornrush/engine-api/game/Game';
import { ROOM_CODE_PATTERN, type RoomListing } from '@unicornrush/engine-api/net/Protocol';
import { type CityInfo, loadCityIndex } from '../cities';
import { openDocs } from './DocsOverlay';

const SOURCE_URL = 'https://github.com/cleyfe/unicornrushIO';

/** Copyright notice and links required by the license terms (AGPL §13 source link). */
export const LEGAL_FOOTER = `<p class="legal">© UnicornRush and Contributors · <a href="${SOURCE_URL}" target="_blank" rel="noopener">Source (AGPL)</a> · <a href="terms-of-service.html">Terms</a> · <a href="privacy-policy.html">Privacy</a> · Maps © OpenStreetMap contributors</p>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const WEALTH_LABELS = ['Budget', 'Middle', 'Upscale', 'Luxury'];
const STORAGE_KEY = 'unicornrush.setup';

interface Setup {
  name: string;
  city: string;
  difficulty: Difficulty;
  rivals: number;
}

function loadSetup(): Setup {
  const fallback: Setup = { name: 'Your Co', city: 'paris-opera', difficulty: 'normal', rivals: 3 };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

function saveSetup(s: Setup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the menu starts from the defaults next time.
  }
}

/** The city's wealth mix as a tiny stacked bar. */
const mixBar = (mix: number[]) =>
  `<span class="mix" title="${mix.map((m, i) => `${WEALTH_LABELS[i]} ${Math.round(m * 100)}%`).join(' · ')}">${mix
    .map((m, i) => `<i class="w${i}" style="flex:${m}"></i>`)
    .join('')}</span>`;

const cityCard = (c: CityInfo, active: boolean) =>
  `<button class="city-card${active ? ' active' : ''}" data-city="${c.id}" data-search="${`${c.city} ${c.area}`.toLowerCase()}">
    <img src="cities/thumbs/${c.id}.svg" alt="" loading="lazy" />
    <span class="city-name"><span class="flag">${c.flag}</span><b>${c.city}</b></span>
    <small>${c.area}</small>${mixBar(c.mix)}</button>`;

/** Title screen: settings on the left, cities on the right. */
export function showIntro(
  container: HTMLElement,
  onStart: (name: string, city: CityInfo, difficulty: Difficulty, rivals: number) => void,
  /** Online: `code` is a room to join, or null to create one. */
  onOnline: (name: string, code: string | null) => void,
): void {
  const setup = loadSetup();
  container.innerHTML = `
    <div class="overlay intro-bg"><div class="menu">
      <aside class="menu-side">
        <h1 class="logo">🦄 Unicorn<b>Rush</b></h1>
        <p class="tagline">Race to <b>$1B</b> on real city streets.</p>
        <label class="field"><span>Company</span><input id="name" maxlength="16" value="" /></label>
        <div class="field"><span>Rivals</span><div class="seg difficulty">
          ${(['easy', 'normal', 'hard'] as const).map((d) => `<button data-difficulty="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}
        </div></div>
        <div class="field"><span>Players</span><div class="seg rival-count">
          ${[3, 7, 11, 19].map((n) => `<button data-rivals="${n}">${n + 1}</button>`).join('')}
        </div></div>
        <button id="start" class="primary play">Play ▶</button>
        <div class="field online"><span>Online</span>
          <div class="online-row">
            <button id="create-room" type="button">Create room</button>
            <input id="room-code" maxlength="5" placeholder="Code" aria-label="Room code" autocapitalize="characters" />
            <button id="join-room" type="button">Join</button>
          </div>
          <div class="open-games" data-v="open-games" hidden></div>
        </div>
        <button class="docs-link link" type="button">How to play</button>
        ${LEGAL_FOOTER}
      </aside>
      <section class="menu-cities">
        <div class="menu-cities-head">
          <h3>City</h3>
          <input id="city-search" type="search" placeholder="Search" aria-label="Search cities" />
        </div>
        <div class="city-grid"><p class="muted">Loading cities…</p></div>
      </section>
    </div></div>`;

  const $ = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
  const input = $<HTMLInputElement>('#name');
  input.value = setup.name;
  const pick = (attr: string, value: string) =>
    container.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((b) => b.classList.toggle('active', b.getAttribute(attr) === value));
  pick('data-difficulty', setup.difficulty);
  pick('data-rivals', String(setup.rivals));
  container.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((b) =>
    b.addEventListener('click', () => pick('data-difficulty', (setup.difficulty = b.dataset.difficulty as Difficulty))),
  );
  container.querySelectorAll<HTMLButtonElement>('[data-rivals]').forEach((b) =>
    b.addEventListener('click', () => {
      setup.rivals = Number(b.dataset.rivals);
      pick('data-rivals', b.dataset.rivals!);
    }),
  );

  let cities: CityInfo[] = [];
  const grid = $('.city-grid');
  loadCityIndex().then(
    (list) => {
      cities = list;
      if (!list.some((c) => c.id === setup.city)) setup.city = list[0]?.id ?? '';
      grid.innerHTML = list.map((c) => cityCard(c, c.id === setup.city)).join('');
      grid.querySelectorAll<HTMLButtonElement>('.city-card').forEach((b) => {
        b.addEventListener('click', () => pick('data-city', (setup.city = b.dataset.city!)));
        b.addEventListener('dblclick', start);
      });
    },
    (e: Error) => (grid.innerHTML = `<p class="muted">${e.message}</p>`),
  );
  $<HTMLInputElement>('#city-search').addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    grid.querySelectorAll<HTMLElement>('.city-card').forEach((b) => (b.hidden = !!q && !b.dataset.search!.includes(q)));
  });

  function start(): void {
    const city = cities.find((c) => c.id === setup.city);
    if (!city) return;
    setup.name = input.value.trim() || 'Your Co';
    saveSetup(setup);
    onStart(setup.name, city, setup.difficulty, setup.rivals);
  }
  $('#start').addEventListener('click', start);
  $('.docs-link').addEventListener('click', () => void openDocs());
  const playerName = () => {
    setup.name = input.value.trim() || 'Your Co';
    saveSetup(setup);
    return setup.name;
  };
  const code = $<HTMLInputElement>('#room-code');
  const join = () => {
    const c = code.value.trim().toUpperCase();
    if (ROOM_CODE_PATTERN.test(c)) onOnline(playerName(), c);
    else code.focus();
  };
  $('#create-room').addEventListener('click', () => onOnline(playerName(), null));
  $('#join-room').addEventListener('click', join);
  code.addEventListener('keydown', (e) => e.key === 'Enter' && join());

  // Open games: rooms waiting for players, refreshed while the menu is up.
  const openGames = $('[data-v="open-games"]');
  openGames.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-room]');
    if (b) onOnline(playerName(), b.dataset.room!);
  });
  const refresh = async () => {
    if (!openGames.isConnected) return;
    try {
      const [rooms, index] = await Promise.all([fetch(apiUrl('api/rooms')).then((r) => (r.ok ? (r.json() as Promise<RoomListing[]>) : [])), loadCityIndex()]);
      const city = (id: string) => index.find((c) => c.id === id);
      openGames.hidden = false;
      openGames.innerHTML = rooms.length
        ? rooms
            .slice(0, 6)
            .map(
              (r) =>
                `<button class="open-game" data-room="${r.code}"><span><b>${esc(r.host)}</b> · ${city(r.cityId)?.flag ?? ''} ${city(r.cityId)?.city ?? ''}<small>${r.players}/${r.maxPlayers} players${r.bots ? ` · ${r.bots} bots` : ''}</small></span><span class="join">Join</span></button>`,
            )
            .join('')
        : '<p class="muted">No open games right now. Create one!</p>';
    } catch {
      // No server (offline build): just the local game.
      openGames.hidden = true;
    }
    window.setTimeout(refresh, 5000);
  };
  void refresh();
  input.addEventListener('keydown', (e) => e.key === 'Enter' && start());
}
