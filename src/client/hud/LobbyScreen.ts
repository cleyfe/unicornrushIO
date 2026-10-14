import type { Difficulty } from '@unicornrush/engine-api/game/Game';
import { type LobbyPlayer, MAX_COMPANIES, type RoomSettings } from '@unicornrush/engine-api/net/Protocol';
import { MAX_HUMANS, multiplayerCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { type CityInfo, loadCityIndex } from '../cities';
import type { RoomClient } from '../net/RoomClient';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The room before the match: who's in, the invite link, and the host's settings
 * (city, bots, bot difficulty). Everyone sees the same screen; only the host can
 * change it and start.
 */
export function showLobby(container: HTMLElement, room: RoomClient, onLeave: () => void): void {
  let cities: CityInfo[] = [];
  let last: { you: number; host: number; players: LobbyPlayer[]; settings: RoomSettings } | null = null;
  const invite = `${location.origin}${location.pathname}#${room.code}`;

  container.innerHTML = `
    <div class="overlay intro-bg"><div class="card lobby">
      <div class="lobby-head">
        <div><small>Room</small><h1 class="room-code">${room.code}</h1></div>
        <button class="link" data-act="leave">Leave</button>
      </div>
      <div class="invite">
        <input id="invite" readonly value="${esc(invite)}" aria-label="Invite link" />
        <button data-act="copy">Copy link</button>
      </div>
      <p class="status" data-v="status">Connecting…</p>
      <h3>Players <small data-v="count"></small></h3>
      <ul class="lobby-players" data-v="players"></ul>
      <h3>Match</h3>
      <div class="lobby-settings">
        <label class="field"><span>City</span><select id="lobby-city" data-host></select></label>
        <label class="field"><span>Bots</span><select id="lobby-bots" data-host></select></label>
        <label class="listed"><input type="checkbox" id="lobby-listed" data-host /> Listed in open games</label>
        <div class="field"><span>Bot level</span><div class="seg difficulty">
          ${(['easy', 'normal', 'hard'] as const).map((d) => `<button data-difficulty="${d}" data-host>${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}
        </div></div>
      </div>
      <button id="lobby-start" class="primary play">Start match ▶</button>
      <p class="hint" data-v="hint"></p>
    </div></div>`;

  const $ = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
  const citySel = $<HTMLSelectElement>('#lobby-city');
  const botsSel = $<HTMLSelectElement>('#lobby-bots');

  const isHost = () => !!last && last.you === last.host;
  const send = (patch: Partial<RoomSettings>) => last && room.setSettings({ ...last.settings, ...patch });

  function render(): void {
    if (!last) return;
    const { players, settings } = last;
    const colors = multiplayerCompanies(players.map((p) => p.name)).map((c) => `rgb(${c.color.join(',')})`);
    $('[data-v="count"]').textContent = `${players.length} / ${MAX_HUMANS}`;
    $('[data-v="players"]').innerHTML = players
      .map(
        (p) => `<li class="${p.connected ? '' : 'away'}"><i style="background:${colors[p.seat]}"></i>${esc(p.name)}${p.seat === last!.host ? ' <small>host</small>' : ''}${p.seat === last!.you ? ' <small>you</small>' : ''}</li>`,
      )
      .join('');
    // Settings: editable by the host, shown to everyone.
    if (cities.length && citySel.options.length !== cities.length) {
      citySel.innerHTML = cities.map((c) => `<option value="${c.id}">${c.flag} ${c.city} · ${c.area}</option>`).join('');
    }
    citySel.value = settings.cityId;
    $<HTMLInputElement>('#lobby-listed').checked = settings.listed;
    const maxBots = MAX_COMPANIES - players.length;
    botsSel.innerHTML = Array.from({ length: maxBots + 1 }, (_, n) => `<option value="${n}">${n}</option>`).join('');
    botsSel.value = String(Math.min(settings.bots, maxBots));
    container.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((b) => b.classList.toggle('active', b.dataset.difficulty === settings.difficulty));
    container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('[data-host]').forEach((e) => (e.disabled = !isHost()));
    const start = $<HTMLButtonElement>('#lobby-start');
    start.hidden = !isHost();
    const host = players.find((p) => p.seat === last!.host);
    $('[data-v="hint"]').textContent = isHost()
      ? players.length === 1
        ? 'Share the link, or start alone against bots.'
        : ''
      : `Waiting for ${host?.name ?? 'the host'} to start…`;
  }

  loadCityIndex().then((list) => {
    cities = list;
    render();
  }, () => {});

  room.onLobby = (lobby) => {
    last = lobby;
    $('[data-v="status"]').textContent = '';
    render();
  };
  room.onStatus = (connected) => {
    $('[data-v="status"]').textContent = connected ? '' : 'Connection lost, reconnecting…';
  };
  room.onError = (text) => {
    $('[data-v="status"]').textContent = text;
  };

  citySel.addEventListener('change', () => send({ cityId: citySel.value }));
  botsSel.addEventListener('change', () => send({ bots: Number(botsSel.value) }));
  $<HTMLInputElement>('#lobby-listed').addEventListener('change', (e) => send({ listed: (e.target as HTMLInputElement).checked }));
  container.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((b) =>
    b.addEventListener('click', () => send({ difficulty: b.dataset.difficulty as Difficulty })),
  );
  $('#lobby-start').addEventListener('click', () => room.start());
  $('[data-act="leave"]').addEventListener('click', () => {
    room.leave();
    onLeave();
  });
  $('[data-act="copy"]').addEventListener('click', async () => {
    const input = $<HTMLInputElement>('#invite');
    const btn = $<HTMLButtonElement>('[data-act="copy"]');
    try {
      await navigator.clipboard.writeText(invite);
      btn.textContent = 'Copied';
    } catch {
      input.select();
    }
  });
}
