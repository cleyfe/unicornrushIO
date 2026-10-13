import './styles/main.css';
import type { CityData } from '@unicornrush/engine-api/game/City';
import type { Difficulty } from '@unicornrush/engine-api/game/Game';
import type { Wealth } from '@unicornrush/engine-api/game/GameMap';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import type { CityInfo } from './cities';
import { ClientGameRunner } from './ClientGameRunner';
import { ActionBar } from './hud/ActionBar';
import { CardPicker } from './hud/CardPicker';
import { Coach } from './hud/Coach';
import { openDocs } from './hud/DocsOverlay';
import { Drawer } from './hud/Drawer';
import { el } from './hud/dom';
import { showGameOver } from './hud/GameOverModal';
import { showIntro } from './hud/IntroModal';
import { NewsFeed } from './hud/NewsFeed';
import { RaceBoard } from './hud/RaceBoard';
import { toast } from './hud/Toast';
import { decodeCity } from '@unicornrush/engine-lib/game/CityCodec';
import { TopBar } from './hud/TopBar';
import { YouCard } from './hud/YouCard';
import { History } from './History';
import { InputHandler } from './InputHandler';
import { CityMapView, type MapTheme, wealthColors } from './render/CityMapView';
import { CompanyLabels } from './render/CompanyLabels';
import { GuardMarkers } from './render/GuardMarkers';

const app = document.getElementById('app')!;

async function loadCity(id: string): Promise<CityData> {
  const res = await fetch(`cities/${id}.json`);
  if (!res.ok) throw new Error(`Could not load the city (${res.status}).`);
  return decodeCity(await res.json());
}

async function startGame(name: string, info: CityInfo, difficulty: Difficulty, rivals: number): Promise<void> {
  app.innerHTML = `<div class="overlay intro-bg"><div class="card loading"><h2>${info.flag} ${info.city}</h2><p>Loading…</p></div></div>`;
  let city: CityData;
  try {
    city = await loadCity(info.id);
  } catch (e) {
    app.innerHTML = `<div class="overlay"><div class="card"><h2>Couldn't load the city</h2><p>${(e as Error).message}</p></div></div>`;
    return;
  }

  const client = new ClientGameRunner(Math.floor(Math.random() * 1e9), defaultCompanies(name, false, difficulty, rivals), city);
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

  // Light (daytime) or dark (night) map: the player's choice, remembered between matches.
  let theme: MapTheme = 'light';
  try {
    if (localStorage.getItem('unicornrush.theme') === 'dark') theme = 'dark';
  } catch {
    // Storage blocked: keep the default.
  }
  const view = new CityMapView(mapEl, game, city, theme);
  // Keep a loading screen up until the map has drawn, instead of a black screen.
  const loading = el('div', 'overlay intro-bg', `<div class="card loading"><h2>${info.flag} ${info.city}</h2><p>Drawing the map…</p></div>`);
  app.append(loading);
  view.onReady = () => loading.remove();
  const labels = new CompanyLabels(game, city, view.map);
  const guards = new GuardMarkers(game, view.map, (s) => view.zoneCenter(s));
  const history = new History(game);
  const drawer = new Drawer(game, (i) => client.send(i), history);
  // Drawers don't pause the game: a multiplayer match can't stop for one player either.
  const top = new TopBar(
    game,
    `${info.flag} ${info.city} · ${info.area}`,
    setSpeed,
    () => void openDocs(),
    (street) => view.map.flyTo({ center: view.zoneCenter(street), zoom: 15, duration: 1200 }),
    theme,
    (t) => {
      theme = t;
      view.setTheme(t);
      const open = legend.open;
      legend.innerHTML = legendHtml();
      legend.open = open;
      try {
        localStorage.setItem('unicornrush.theme', t);
      } catch {
        // Storage blocked: the choice lasts for this match only.
      }
    },
  );
  const you = new YouCard(game, () => view.focusOnPlayer(), (i) => client.send(i));
  const race = new RaceBoard(game);
  const actions = new ActionBar(game, (i) => client.send(i), (d) => drawer.toggle(d));
  const cards = new CardPicker(game, (i) => client.send(i));
  const news = new NewsFeed(() => drawer.toggle('news'));
  const coach = new Coach(game);
  const legendHtml = () =>
    '<summary>🗺 Key</summary>' +
    CONFIG.wealth
      .map((t, i) => `<span><i style="background:${wealthColors(theme)[i as Wealth]}"></i>${'$'.repeat(i + 1)} ${t.label} ×${t.spend}</span>`)
      .join('') +
      `<span><i class="rim"></i>Owned: brighter = richer</span>` +
      `<span class="legend-sep"><i class="line frontier"></i>You can win</span><span><i class="line court"></i>On trial</span>`;
  const legend = el('details', 'wealth-legend glass', legendHtml());
  const paused = el('div', 'paused-badge', 'Click a glowing street to start · elsewhere to move');
  const guardBanner = el('div', 'guard-banner', '');
  stage.append(guards.root, labels.root, top.root, you.root, race.root, legend, actions.root, cards.root, news.root, drawer.root, coach.root, paused, guardBanner);
  const input = new InputHandler(client, view, city, tooltip, setSpeed, firstMove, () => started);
  const detach = input.attach();
  actions.onAim = (mode) => input.toggleMode(mode);
  const banners = {
    ad: '📢 Aim at a street · Esc',
    guard: '🛡 Pick one of your streets · Esc',
    buy: "🏢 Pick a rival's street next to yours · Esc",
  };
  input.onModeChange = (mode) => {
    guardBanner.textContent = mode === 'expand' ? '' : banners[mode];
  };
  input.onHotkey = (key) => actions.hotkey(key);
  input.onEscape = () => drawer.close();

  // Dev builds only: lets scripts (trailer capture, screenshots) drive a match.
  if (import.meta.env.DEV) Object.assign(window, { __unicornrush: { client, game, view, setSpeed, drawer, CONFIG } });

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
    guards.update();
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
      input.refreshHover();
      view.updateZones();
      view.update(); // guards expire over time
      drawer.update();
      coach.update(now);
      paused.hidden = started;
    }
    if (game.result) {
      detach();
      const again = () => {
        stage.remove();
        showIntro(app, startGame);
      };
      // After closing, you can watch the rest of the match.
      showGameOver(game, game.result, again, history, () => {
        game.keepWatching();
        stage.classList.add('spectating');
        client.speed = Math.max(1, client.speed);
        last = performance.now();
        requestAnimationFrame(frame);
      });
    } else {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
}

showIntro(app, startGame);
