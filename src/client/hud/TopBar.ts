import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { EVENT_INFO, LOCAL_EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import { pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, el } from './dom';

/** City, date, market events, speed and help. */
export class TopBar {
  readonly root: HTMLElement;

  constructor(
    private game: GameImpl,
    cityName: string,
    private onSpeed: (speed: number) => void,
    onHelp: () => void,
    private onZone: (street: number) => void = () => {},
    private theme: 'light' | 'dark' = 'light',
    onTheme: (theme: 'light' | 'dark') => void = () => {},
    onHome: () => void = () => {},
  ) {
    this.root = el(
      'header',
      'topbar glass',
      `<div class="brand">🦄 Unicorn<b>Rush</b></div>
      <div class="city">${cityName}</div>
      <div class="clock" title="1 game day = 1 second at 1× speed. The match ends after ${CONFIG.matchDays} days.">
        <span data-v="day"></span><div class="timebar"><div data-v="timeFill"></div></div>
      </div>
      <div class="events" data-v="events"></div>
      <div class="speed" title="Space = pause / play">
        <button data-speed="0" aria-label="Pause">⏸</button><button data-speed="1" aria-label="Play">▶</button>
      </div>
      <button class="theme-btn" aria-label="Switch between the day and night map"></button>
      <button class="help-btn home-btn" aria-label="Main menu" title="Main menu">🏠</button>
      <button class="help-btn" aria-label="How to play">?</button>`,
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => this.onSpeed(Number(b.dataset.speed))),
    );
    $(this.root, '.help-btn:not(.home-btn)').addEventListener('click', onHelp);
    $(this.root, '.home-btn').addEventListener('click', onHome);
    const themeBtn = $<HTMLButtonElement>(this.root, '.theme-btn');
    const showTheme = () => {
      themeBtn.textContent = this.theme === 'light' ? '🌙' : '☀️';
      themeBtn.title = this.theme === 'light' ? 'Night map' : 'Day map';
    };
    showTheme();
    themeBtn.addEventListener('click', () => {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      showTheme();
      onTheme(this.theme);
      themeBtn.blur();
    });
    this.root.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-zone]');
      if (chip) this.onZone(Number(chip.dataset.zone));
    });
  }

  update(speed: number): void {
    const g = this.game;
    const day = Math.floor(g.day);
    $(this.root, '[data-v="day"]').textContent = `Day ${day} · Year ${Math.floor(day / 365) + 1}`;
    $(this.root, '[data-v="timeFill"]').style.width = pct(g.day / CONFIG.matchDays);
    const events = g.events.map((e) => {
      const info = EVENT_INFO[e.kind];
      return `<span class="chip ${e.kind}" title="${info.text}">${info.title} · ${Math.ceil(e.endsDay - g.day)}d</span>`;
    });
    const suits = g.lawsuits.map(
      (l) =>
        `<span class="chip lawsuit" title="Unfair-competition lawsuit: ruling in ${Math.ceil(l.rulingDay - g.day)} days">⚖️ ${g.companies[l.plaintiff].name} v. ${g.companies[l.defendant].name} · ${Math.ceil(l.rulingDay - g.day)}d</span>`,
    );
    const forecasts = g.forecasts.map((f) => {
      const info = EVENT_INFO[f.kind];
      return `<span class="chip forecast" title="Forecast: ${info.text} Prepare now.">🔮 ${info.title} in ${Math.ceil(f.startsDay - g.day)}d</span>`;
    });
    const local = g.localEvents.map((e) => {
      const info = LOCAL_EVENT_INFO[e.kind];
      const when = !e.active && g.day < e.startsDay ? ` in ${Math.ceil(e.startsDay - g.day)}d` : e.endsDay !== null ? ` · ${Math.ceil(e.endsDay - g.day)}d` : ' · open';
      const place = g.placeName(e.center);
      return `<span class="chip zone-${e.kind}" data-zone="${e.center}" title="${info.title} ${place}: ${info.effect} Click to see it on the map.">${info.icon} ${info.title}${when}</span>`;
    });
    const me = g.player;
    const status: string[] = [];
    if (g.day < me.strikeUntil) {
      status.push(
        g.onStrike(me)
          ? `<span class="chip strike" title="Your operations run short: keep spare Ops staff or hire.">✊ Strike · ${Math.ceil(me.strikeUntil - g.day)}d</span>`
          : `<span class="chip strike" title="Hire spare operations staff now, so customers stay served.">✊ Strike in ${Math.ceil(me.strikeFrom - g.day)}d</span>`,
      );
    }
    if (g.day < me.supplierDealUntil) status.push(`<span class="chip perk" title="Your variable costs are lower">📦 Supplier deal · ${Math.ceil(me.supplierDealUntil - g.day)}d</span>`);
    const html = [...status, ...forecasts, ...events, ...local, ...suits].join('');
    const box = $(this.root, '[data-v="events"]');
    if (box.dataset.html !== html) {
      box.dataset.html = html;
      box.innerHTML = html;
    }
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-speed]')
      .forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
  }
}
