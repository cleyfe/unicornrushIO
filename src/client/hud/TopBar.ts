import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { pct } from '@unicornrush/engine-lib/Format';
import { EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $ } from './dom';
import { LEGAL_FOOTER } from './IntroModal';

/** Time, speed controls, and active market events. */
export class TopBar {
  readonly root: HTMLElement;

  constructor(
    private game: GameImpl,
    private onSpeed: (speed: number) => void,
  ) {
    this.root = document.createElement('header');
    this.root.className = 'topbar';
    this.root.innerHTML = `
      <div class="brand">Unicorn<b>Rush</b></div>
      <div class="clock"><span data-v="day"></span><div class="timebar"><div data-v="timeFill"></div></div></div>
      <div class="events" data-v="events"></div>
      <div class="speed" title="Space = pause, 1/2/3 = speed">
        <button data-speed="0">⏸</button><button data-speed="1">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button>
      </div>
      ${LEGAL_FOOTER}`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => this.onSpeed(Number(b.dataset.speed))),
    );
  }

  update(speed: number): void {
    const g = this.game;
    const day = Math.floor(g.day);
    $(this.root, '[data-v="day"]').textContent = `Day ${day} · Year ${Math.floor(day / 365) + 1}`;
    $(this.root, '[data-v="timeFill"]').style.width = pct(g.day / CONFIG.matchDays);
    const events = g.events.map((e) => {
      const info = EVENT_INFO[e.kind];
      return `<span class="event ${e.kind}" title="${info.text}">${info.title} · ${Math.ceil(e.endsDay - g.day)}d</span>`;
    });
    const suits = g.lawsuits.map(
      (l) =>
        `<span class="event lawsuit">⚖️ ${g.companies[l.plaintiff].name} v. ${g.companies[l.defendant].name} · ${Math.ceil(l.rulingDay - g.day)}d</span>`,
    );
    $(this.root, '[data-v="events"]').innerHTML = [...events, ...suits].join('');
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-speed]')
      .forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
  }
}
