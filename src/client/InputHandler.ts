import type { MapMouseEvent } from 'maplibre-gl';
import type { CityData } from '@unicornrush/engine-api/game/City';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { ClientGameRunner } from './ClientGameRunner';
import type { CityMapView } from './render/CityMapView';

/** Clicking a street (or a building on it) launches a campaign; hovering explains it. */
export class InputHandler {
  constructor(
    private client: ClientGameRunner,
    private view: CityMapView,
    private city: CityData,
    private tooltip: HTMLElement,
    private onSpeedKey: (speed: number) => void,
  ) {}

  attach(): () => void {
    const map = this.view.map;
    map.on('click', (e: MapMouseEvent) => {
      const seg = this.view.segmentAt(e.point);
      if (seg >= 0) this.client.send({ type: 'campaign', companyId: 0, tile: seg });
    });
    map.on('mousemove', (e: MapMouseEvent) => {
      const seg = this.view.segmentAt(e.point);
      map.getCanvas().style.cursor = seg >= 0 ? 'pointer' : '';
      if (seg < 0) {
        this.tooltip.style.display = 'none';
        return;
      }
      this.tooltip.textContent = describeSegment(this.client.game, this.city, seg);
      this.tooltip.style.left = `${e.point.x + 14}px`;
      this.tooltip.style.top = `${e.point.y + 14}px`;
      this.tooltip.style.display = 'block';
    });
    map.on('mouseout', () => (this.tooltip.style.display = 'none'));

    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
      const speeds: Record<string, number> = { ' ': 0, '1': 1, '2': 2, '3': 4 };
      if (ev.key in speeds) {
        ev.preventDefault();
        this.onSpeedKey(ev.key === ' ' && this.client.speed === 0 ? 1 : speeds[ev.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }
}

export function describeSegment(g: GameImpl, city: CityData, seg: number): string {
  const tier = CONFIG.wealth[g.map.wealth[seg]];
  const o = g.owner[seg];
  const street = city.segments.names[seg] || 'Unnamed street';
  const who = o === NEUTRAL ? 'untapped' : o === 0 ? 'yours' : g.companies[o].name;
  let s = `${street} · ${'$'.repeat(g.map.wealth[seg] + 1)} ${tier.label} · ${g.map.demand[seg].toFixed(1)} customers · ${who}`;
  if (o !== 0) s += ` · costs ${g.tileCost(g.player, o, seg).toFixed(0)} push`;
  return s;
}
