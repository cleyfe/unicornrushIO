import './styles/main.css';
import type { CityData } from '@unicornrush/engine-api/game/City';
import type { Wealth } from '@unicornrush/engine-api/game/GameMap';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { ClientGameRunner } from './ClientGameRunner';
import { ControlPanel } from './hud/ControlPanel';
import { showGameOver } from './hud/GameOverModal';
import { showIntro } from './hud/IntroModal';
import { Leaderboard } from './hud/Leaderboard';
import { toast } from './hud/Toast';
import { TopBar } from './hud/TopBar';
import { InputHandler } from './InputHandler';
import { CityMapView, WEALTH_COLORS } from './render/CityMapView';
import { CompanyLabels } from './render/CompanyLabels';

const app = document.getElementById('app')!;
const CITY_ID = 'paris-opera';

async function loadCity(id: string): Promise<CityData> {
  const res = await fetch(`cities/${id}.json`);
  if (!res.ok) throw new Error(`Could not load the city (${res.status}).`);
  return res.json();
}

async function startGame(name: string): Promise<void> {
  app.innerHTML = `<div class="overlay"><div class="card"><h2>Loading the city…</h2></div></div>`;
  let city: CityData;
  try {
    city = await loadCity(CITY_ID);
  } catch (e) {
    app.innerHTML = `<div class="overlay"><div class="card"><h2>Couldn't load the city</h2><p>${(e as Error).message}</p></div></div>`;
    return;
  }

  const client = new ClientGameRunner(Math.floor(Math.random() * 1e9), defaultCompanies(name), city);
  const game = client.game;
  const setSpeed = (s: number) => (client.speed = s);

  app.innerHTML = '';
  const top = new TopBar(game, setSpeed);
  const panel = new ControlPanel(game, (i) => client.send(i));
  const board = new Leaderboard(game);

  const mapWrap = document.createElement('div');
  mapWrap.className = 'map-wrap';
  const mapEl = document.createElement('div');
  mapEl.className = 'map';
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  const legend = document.createElement('div');
  legend.className = 'wealth-legend';
  legend.innerHTML =
    `<b>${city.name}</b>` +
    CONFIG.wealth
      .map((t, i) => `<span><i style="background:${WEALTH_COLORS[i as Wealth]}"></i>${'$'.repeat(i + 1)} ${t.label} ×${t.spend}</span>`)
      .join('');
  legend.title = 'Neighbourhood wealth (building colour): how much each customer spends';
  mapWrap.append(mapEl, tooltip, legend);
  const left = document.createElement('div');
  left.className = 'left';
  left.append(mapWrap, board.root);
  const main = document.createElement('main');
  main.append(left, panel.root);
  app.append(top.root, main);

  const view = new CityMapView(mapEl, game, city);
  const labels = new CompanyLabels(game, city, view.map);
  mapWrap.append(labels.root);
  const detach = new InputHandler(client, view, city, tooltip, setSpeed).attach();

  let last = performance.now();
  let uiTimer = Infinity;
  let drawnVersion = -1;
  const frame = (now: number) => {
    const elapsed = now - last;
    last = now;
    client.advance(elapsed);
    if (game.ownershipVersion !== drawnVersion || game.lawsuits.length > 0) {
      drawnVersion = game.ownershipVersion;
      view.update();
    }
    labels.update(now);
    for (const l of client.newLogEntries()) if (l.recipient === 0 && l.tone === 'error') toast(l.text);
    uiTimer += elapsed;
    if (uiTimer > 120 || game.result) {
      uiTimer = 0;
      top.update(client.speed);
      panel.update();
      board.update();
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
