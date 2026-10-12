import './styles/main.css';
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
import { MapRenderer, WEALTH_COLORS } from './render/MapRenderer';

const app = document.getElementById('app')!;

function startGame(name: string): void {
  const client = new ClientGameRunner(Math.floor(Math.random() * 1e9), defaultCompanies(name));
  const game = client.game;
  const setSpeed = (s: number) => (client.speed = s);

  app.innerHTML = '';
  const top = new TopBar(game, setSpeed);
  const renderer = new MapRenderer(game);
  const panel = new ControlPanel(game, (i) => client.send(i));
  const board = new Leaderboard(game);

  const mapWrap = document.createElement('div');
  mapWrap.className = 'map-wrap';
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  const hint = document.createElement('div');
  hint.className = 'map-hint';
  hint.textContent = 'Scroll to zoom · drag to pan';
  const legend = document.createElement('div');
  legend.className = 'wealth-legend';
  legend.innerHTML = CONFIG.wealth
    .map((t, i) => `<span><i style="background:${WEALTH_COLORS[i as Wealth]}"></i>${t.label} ×${t.spend}</span>`)
    .join('');
  legend.title = 'Street wealth (curb colour): how much each customer spends';
  mapWrap.append(renderer.canvas, tooltip, hint, legend);
  const left = document.createElement('div');
  left.className = 'left';
  left.append(mapWrap, board.root);
  const main = document.createElement('main');
  main.append(left, panel.root);
  app.append(top.root, main);
  const detach = new InputHandler(client, renderer, tooltip, setSpeed).attach();

  let last = performance.now();
  let uiTimer = Infinity;
  const frame = (now: number) => {
    const elapsed = now - last;
    last = now;
    client.advance(elapsed);
    renderer.draw();
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
