import './styles/main.css';
import type { CityData } from '@unicornrush/engine-api/game/City';
import type { Difficulty } from '@unicornrush/engine-api/game/Game';
import type { Wealth } from '@unicornrush/engine-api/game/GameMap';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { ROOM_CODE_PATTERN } from '@unicornrush/engine-api/net/Protocol';
import { type CityInfo, loadCityIndex } from './cities';
import { ClientGameRunner } from './ClientGameRunner';
import { ActionBar } from './hud/ActionBar';
import { CardPicker } from './hud/CardPicker';
import { Coach } from './hud/Coach';
import { openDocs } from './hud/DocsOverlay';
import { Drawer } from './hud/Drawer';
import { el } from './hud/dom';
import { showGameOver } from './hud/GameOverModal';
import { showIntro } from './hud/IntroModal';
import { showLobby } from './hud/LobbyScreen';
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
import { NetGameRunner } from './net/NetGameRunner';
import { trackSolo, trackVisit } from './net/Analytics';
import { createRoom, RoomClient } from './net/RoomClient';

const app = document.getElementById('app')!;

async function loadCity(id: string): Promise<CityData> {
  const res = await fetch(`cities/${id}.json`);
  if (!res.ok) throw new Error(`Could not load the city (${res.status}).`);
  return decodeCity(await res.json());
}

/** Loads a city for a match, showing progress; null (with an error on screen) if it fails. */
async function loadCityFor(info: CityInfo): Promise<CityData | null> {
  app.innerHTML = `<div class="overlay intro-bg"><div class="card loading"><h2>${info.flag} ${info.city}</h2><p>Loading…</p></div></div>`;
  try {
    return await loadCity(info.id);
  } catch (e) {
    app.innerHTML = `<div class="overlay"><div class="card"><h2>Couldn't load the city</h2><p>${(e as Error).message}</p></div></div>`;
    return null;
  }
}

/** Back to the start menu. */
function menu(): void {
  if (/^#[A-Z0-9]{5}$/i.test(location.hash)) window.history.replaceState(null, '', location.pathname);
  showIntro(app, startGame, goOnline);
}

/** A match against bots, run in this browser. */
async function startGame(name: string, info: CityInfo, difficulty: Difficulty, rivals: number): Promise<void> {
  const city = await loadCityFor(info);
  if (!city) return;
  trackSolo({ type: 'solo_started', city: info.id, difficulty, bots: rivals });
  play(new ClientGameRunner(Math.floor(Math.random() * 1e9), defaultCompanies(name, false, difficulty, rivals), city), info, city);
}

/** Online: create a room (code null) or join one, then wait in its lobby until the host starts. */
async function goOnline(name: string, code: string | null): Promise<void> {
  if (!code) {
    try {
      code = await createRoom();
    } catch (e) {
      toast((e as Error).message);
      return;
    }
  }
  window.history.replaceState(null, '', `#${code}`);
  const room = new RoomClient(code, name);
  showLobby(app, room, menu);
  room.onStart = async (start, you) => {
    room.onStart = () => {}; // a reconnect re-sends the start: the match is already running
    // Turns can arrive while the city loads; keep them for the match.
    const early: [number, Intent[][]][] = [];
    room.onTurns = (from, turns) => early.push([from, turns]);
    const info = (await loadCityIndex()).find((c) => c.id === start.cityId);
    const city = info ? await loadCityFor(info) : null;
    if (!info || !city) {
      room.leave();
      return;
    }
    const client = new NetGameRunner(start, city, you, room);
    for (const [from, turns] of early) client.receive(from, turns);
    room.onTurns = (from, turns) => client.receive(from, turns);
    room.onDesync = () => toast('Your game fell out of sync with the other players. Reload to resync.');
    room.onError = (text) => toast(text);
    play(client, info, city, room);
  };
}

/** The match screen: map, HUD and the frame loop, for a local or an online match. */
function play(client: ClientGameRunner, info: CityInfo, city: CityData, room?: RoomClient): void {
  const game = client.game;
  // A local match starts paused: your first move (or the play button) starts the clock.
  // Online, the room's clock is already running.
  let started = client.online;
  if (!client.online) client.speed = 0;
  const setSpeed = (s: number) => {
    if (client.online) return;
    started = true;
    client.speed = s;
  };
  const firstMove = () => {
    if (!started) setSpeed(1);
  };

  app.innerHTML = '';
  const stage = el('div', client.online ? 'stage online' : 'stage', '');
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
  // Back to the main menu, from the 🏠 button or the results.
  let left = false;
  let reported = false;
  const leave = () => {
    const ongoing = !game.result && game.player.alive;
    if (ongoing && !window.confirm(client.online ? 'Leave this match? You can come back with the room link.' : 'Leave this match? It will be lost.')) return;
    left = true;
    detach();
    room?.leave();
    stage.remove();
    document.querySelectorAll('body > .overlay, body > .results-pill, body > .docs-overlay').forEach((e) => e.remove());
    menu();
  };
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
    leave,
  );
  const you = new YouCard(game, () => view.focusOnPlayer(), (i) => client.send(i));
  const race = new RaceBoard(game, (id) => view.focusOn(id));
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
      `<span>Paler = newly won; deep = regulars</span>` +
      `<span class="legend-sep"><i class="line frontier"></i>You can win</span><span><i class="line exposed"></i>Exposed: cheap to take</span>` +
      `<span><i class="line court"></i>On trial</span><span>Hold <b>Space</b>: attack view</span>`;
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
  // Hold Space: the attack view, with a one-line legend.
  const attackLegend = el(
    'div',
    'attack-legend glass',
    `<b>Attack view</b> ${['cheap', '', '', '', 'well defended'].map((t, i) => `<i class="a${i + 1}"></i>${t ? `<span>${t}</span>` : ''}`).join('')}`,
  );
  attackLegend.hidden = true;
  stage.append(attackLegend);
  input.onAttackView = (on) => (attackLegend.hidden = !on);

  // Dev builds only: lets scripts (trailer capture, screenshots) drive a match.
  if (import.meta.env.DEV) Object.assign(window, { __unicornrush: { client, game, view, setSpeed, drawer, CONFIG } });

  let last = performance.now();
  let uiTimer = Infinity;
  let drawnVersion = -1;
  let drawnGuards = -1;
  const frame = (now: number) => {
    if (left) return;
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
    const personalSuit = fresh.some((l) => l.recipient === game.playerId && l.text.startsWith('⚖️'));
    for (const l of fresh) {
      if (l.recipient === game.playerId && l.tone === 'error') toast(l.text);
      else if (l.recipient === game.playerId) news.push(l);
      else if (l.recipient === undefined && !(personalSuit && l.text.startsWith('⚖️'))) news.push(l);
    }
    // Online, a closed company doesn't end the match: watch the rest.
    if (client.online && !game.player.alive) stage.classList.add('spectating');
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
      // Stats: how the match ended (anonymous), once, even if you keep watching.
      const r = game.result;
      const winner = r.winnerId === null ? 'none' : game.companies[r.winnerId].isBot ? 'bot' : 'human';
      if (room && !reported) room.send({ t: 'over', day: Math.floor(r.day), reason: r.reason, winner });
      else if (!reported) trackSolo({ type: 'solo_finished', city: info.id, difficulty: game.player.difficulty, bots: game.companies.length - 1, day: Math.floor(r.day), reason: r.reason, winner });
      reported = true;
      const again = leave;
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

// An invite link (unicornrush.io/#CODE) goes straight to that room.
const invited = location.hash.slice(1).toUpperCase();
trackVisit(ROOM_CODE_PATTERN.test(invited) ? 'invite' : 'home');
if (ROOM_CODE_PATTERN.test(invited)) {
  let name = 'Player';
  try {
    name = JSON.parse(localStorage.getItem('unicornrush.setup') ?? '{}').name || name;
  } catch {
    // Storage blocked: default name.
  }
  void goOnline(name, invited);
} else {
  menu();
}
