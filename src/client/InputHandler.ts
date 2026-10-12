import type { MapMouseEvent } from 'maplibre-gl';
import type { CityData } from '@unicornrush/engine-api/game/City';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
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
    private onFirstMove: () => void,
  ) {}

  attach(): () => void {
    const map = this.view.map;
    map.on('click', (e: MapMouseEvent) => {
      const seg = this.view.segmentAt(e.point);
      if (seg < 0) return;
      this.client.send({ type: 'campaign', companyId: 0, tile: seg });
      this.onFirstMove();
      // A ripple where you clicked: instant feedback before the street changes hands.
      const ripple = document.createElement('div');
      ripple.className = `ripple${this.view.isFrontier(seg) ? '' : ' far'}`;
      ripple.style.left = `${e.point.x}px`;
      ripple.style.top = `${e.point.y}px`;
      map.getContainer().append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
    map.on('mousemove', (e: MapMouseEvent) => {
      const seg = this.view.segmentAt(e.point);
      map.getCanvas().style.cursor = seg >= 0 ? 'pointer' : '';
      this.view.setHover(seg);
      if (seg < 0) {
        this.tooltip.style.display = 'none';
        return;
      }
      this.tooltip.innerHTML = describeSegment(this.client.game, this.city, seg, this.view.isFrontier(seg));
      const w = this.tooltip.offsetWidth || 260;
      const box = map.getContainer().getBoundingClientRect();
      const x = e.point.x + 16 + w > box.width ? e.point.x - w - 16 : e.point.x + 16;
      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.top = `${Math.min(e.point.y + 16, box.height - 140)}px`;
      this.tooltip.style.display = 'block';
    });
    map.on('mouseout', () => {
      this.tooltip.style.display = 'none';
      this.view.setHover(-1);
    });

    const onKey = (ev: KeyboardEvent) => {
      // Typing a name shouldn't pause the game; sliders and buttons can keep focus.
      const t = ev.target;
      if ((t instanceof HTMLInputElement && t.type === 'text') || t instanceof HTMLSelectElement) return;
      const speeds: Record<string, number> = { ' ': 0, '1': 1, '2': 2, '3': 4 };
      if (ev.key in speeds) {
        ev.preventDefault();
        this.onSpeedKey(ev.key === ' ' && this.client.speed === 0 ? 1 : speeds[ev.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    // A focused button would also be "clicked" by Space; drop focus after clicks.
    const blurButtons = (e: MouseEvent) => (e.target as HTMLElement).closest('button')?.blur();
    window.addEventListener('click', blurButtons, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', blurButtons, true);
    };
  }
}

/** The hover card: what a street is worth and whether you can take it now. */
export function describeSegment(g: GameImpl, city: CityData, seg: number, reachable: boolean): string {
  const level = g.map.wealth[seg];
  const tier = CONFIG.wealth[level];
  const o = g.owner[seg];
  const me = g.player;
  const street = city.segments.names[seg] || 'Unnamed street';
  const vol = g.volume(me, level);
  const perDay =
    vol * (g.map.spend[seg] * CONFIG.prices[me.price].revenue * g.revenueMult() - g.map.demand[seg] * CONFIG.variableCostPerCustomer * g.variableCostMult());
  const owner =
    o === NEUTRAL ? 'Untapped' : o === 0 ? 'Yours' : `<i style="background:rgb(${g.companies[o].color.join(',')})"></i>${g.companies[o].name}`;
  let action = '';
  if (o !== 0) {
    const cost = g.tileCost(me, o, seg);
    if (!reachable) action = '<div class="hc-action muted">Not next to your streets yet</div>';
    else if (me.push * CONFIG.sales.campaignShare >= cost) action = `<div class="hc-action ok">✓ Click to win it · ${cost.toFixed(0)} push</div>`;
    else action = `<div class="hc-action wait">Needs ${cost.toFixed(0)} push · your next click spends ${Math.floor(me.push * CONFIG.sales.campaignShare)}</div>`;
  }
  return `<div class="hc-title">${street}</div>
    <div class="hc-row"><span class="w${level}">${'$'.repeat(level + 1)} ${tier.label}</span><span>${owner}</span></div>
    <div class="hc-row"><span>${g.map.demand[seg].toFixed(1)} customers × ${tier.spend} spend</span><span>≈ ${money(perDay)} profit/day</span></div>
    ${action}`;
}
