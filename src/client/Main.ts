import './styles/main.css';
import type { CityData } from '@unicornrush/engine-api/game/City';
import type { Difficulty } from '@unicornrush/engine-api/game/Game';
import type { Wealth } from '@unicornrush/engine-api/game/GameMap';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { CITIES, type CityId } from './cities';
import { ClientGameRunner } from './ClientGameRunner';
import { ActionBar } from './hud/ActionBar';
import { CardPicker } from './hud/CardPicker';
import { Coach } from './hud/Coach';
import { Drawer } from './hud/Drawer';
import { el } from './hud/dom';
import { showGameOver } from './hud/GameOverModal';
import { showHelp } from './hud/HelpModal';
import { showIntro } from './hud/IntroModal';
import { NewsFeed } from './hud/NewsFeed';
import { RaceBoard } from './hud/RaceBoard';
import { toast } from './hud/Toast';
import { TopBar } from './hud/TopBar';
import { YouCard } from './hud/YouCard';
import { History } from './History';
import { InputHandler } from './InputHandler';
import { CityMapView, WEALTH_COLORS } from './render/CityMapView';
import { CompanyLabels } from './render/CompanyLabels';

const app = document.getElementById('app')!;

async function loadCity(id: CityId): Promise<CityData> {
  const res = await fetch(`cities/${id}.json`);
  if (!res.ok) throw new Error(`Could not load the city (${res.status}).`);
  return res.json();
}

async function startGame(name: string, cityId: CityId, difficulty: Difficulty): Promise<void> {
  const info = CITIES.find((c) => c.id === cityId)!;
  app.innerHTML = `<div class="overlay intro-bg"><div class="card loading"><h2>${info.flag} Loading ${info.name}…</h2><p>Mapping streets and buildings</p></div></div>`;
  let city: CityData;
  try {
    city = await loadCity(cityId);
  } catch (e) {
    app.innerHTML = `<div class="overlay"><div class="card"><h2>Couldn't load the city</h2><p>${(e as Error).message}</p></div></div>`;
    return;
  }

  const client = new ClientGameRunner(Math.floor(Math.random() * 1e9), defaultCompanies(name, false, difficulty), city);
  const game = client.game;
  // The match starts paused; your first move (or the play button) starts the clock.
  client.speed = 0;
  let started = false;
  const setSpeed = (s: number) => {
    started = true;
    client.speed = s;
  };
  const firstMove = () => {
    if (!started) setSpeed(1);
  };

  app.innerHTML = '';
  const stage = el('div', 'stage', '');
  const mapEl = el('div', 'map', '');
  const tooltip = el('div', 'hovercard', '');
  stage.append(mapEl, tooltip);
  app.append(stage);

  const view = new CityMapView(mapEl, game, city);
  // Keep a loading screen up until the map has drawn, instead of a black screen.
  const loading = el('div', 'overlay intro-bg', `<div class="card loading"><h2>${info.flag} Loading ${info.name}…</h2><p>Drawing streets and buildings</p></div>`);
  app.append(loading);
  view.onReady = () => loading.remove();
  const labels = new CompanyLabels(game, city, view.map);
  const history = new History(game);
  const drawer = new Drawer(game, (i) => client.send(i), history);
  // Drawers don't pause the game: a multiplayer match can't stop for one player either.
  let speedBeforeHelp = 1;
  const top = new TopBar(
    game,
    `${info.flag} ${info.name} · ${info.area}`,
    setSpeed,
    () => {
      speedBeforeHelp = client.speed;
      client.speed = 0;
      showHelp(() => (client.speed = started ? speedBeforeHelp : 0));
    },
    (street) => view.map.flyTo({ center: view.zoneCenter(street), zoom: 15, duration: 1200 }),
  );
  const you = new YouCard(
    game,
    () => drawer.toggle('finances'),
    () => view.focusOnPlayer(),
  );
  const race = new RaceBoard(game);
  const actions = new ActionBar(game, (i) => client.send(i), (d) => drawer.toggle(d));
  const cards = new CardPicker(game, (i) => client.send(i));
  const news = new NewsFeed();
  const coach = new Coach(game);
  const legend = el(
    'details',
    'wealth-legend glass',
    '<summary>🗺 Map key</summary>' +
    CONFIG.wealth
      .map((t, i) => `<span><i style="background:${WEALTH_COLORS[i as Wealth]}"></i>${'$'.repeat(i + 1)} ${t.label} ×${t.spend}</span>`)
      .join('') +
      `<span title="Owned buildings take the owner's colour: brighter on richer streets, with a gold rim on the richest"><i class="rim"></i>Owned: brighter = richer</span>` +
      `<span class="legend-sep"><i class="line frontier"></i>Streets you can win</span><span><i class="line court"></i>Company on trial</span>`,
  );
  legend.title = 'Building colour = neighbourhood wealth: how much each customer spends. Owned buildings take the owner colour, brighter on richer streets, and rich ones get a gold rim.';
  const paused = el('div', 'paused-badge', '⏸ Paused: click a glowing street to start');
  const guardBanner = el('div', 'guard-banner', '🛡 Click one of your streets to guard its neighbourhood · Esc to cancel');
  stage.append(labels.root, top.root, you.root, race.root, legend, actions.root, cards.root, news.root, drawer.root, coach.root, paused, guardBanner);
  const input = new InputHandler(client, view, city, tooltip, setSpeed, firstMove);
  const detach = input.attach();
  actions.onAim = (mode) => input.toggleMode(mode);
  const banners = {
    ad: '📢 Click a street to aim your ad campaign · Esc to cancel',
    guard: '🛡 Click one of your streets to guard its neighbourhood · Esc to cancel',
    buy: "🏢 Click a rival's street next to yours to buy that block · Esc to cancel",
  };
  input.onModeChange = (mode) => {
    guardBanner.textContent = mode === 'expand' ? '' : banners[mode];
  };
  input.onHotkey = (key) => actions.hotkey(key);
  input.onEscape = () => drawer.close();

  let last = performance.now();
  let uiTimer = Infinity;
  let drawnVersion = -1;
  let drawnGuards = -1;
  const frame = (now: number) => {
    const elapsed = now - last;
    last = now;
    client.advance(elapsed);
    if (game.ownershipVersion !== drawnVersion || game.lawsuits.length > 0 || game.guardVersion !== drawnGuards) {
      drawnVersion = game.ownershipVersion;
      drawnGuards = game.guardVersion;
      view.update();
    }
    labels.update(now);
    history.update();
    const fresh = client.newLogEntries();
    // When a lawsuit involves you, show your personal message instead of the public one.
    const personalSuit = fresh.some((l) => l.recipient === 0 && l.text.startsWith('⚖️'));
    for (const l of fresh) {
      if (l.recipient === 0 && l.tone === 'error') toast(l.text);
      else if (l.recipient === 0) news.push(l);
      else if (l.recipient === undefined && !(personalSuit && l.text.startsWith('⚖️'))) news.push(l);
    }
    uiTimer += elapsed;
    if (uiTimer > 120 || game.result) {
      uiTimer = 0;
      top.update(client.speed);
      you.update();
      race.update();
      actions.update();
      cards.update();
      view.updateZones();
      view.update(); // guards expire over time
      drawer.update();
      coach.update(now);
      paused.hidden = started;
    }
    if (game.result) {
      detach();
      showGameOver(game, game.result, () => showIntro(app, startGame));
    } else {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
}

showIntro(app, startGame);
