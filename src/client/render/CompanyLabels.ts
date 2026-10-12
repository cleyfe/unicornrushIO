import type { CityData } from '@unicornrush/engine-api/game/City';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { Map as MapLibreMap } from 'maplibre-gl';

interface Label {
  root: HTMLElement;
  value: HTMLElement;
  pops: HTMLElement;
  at: [number, number] | null; // [lon, lat]
  lastDay: number;
}

/**
 * Floating labels over each company's territory: its name, its valuation,
 * and "+$" sales popping up as money comes in.
 */
export class CompanyLabels {
  readonly root: HTMLElement;
  private labels: Label[];
  private mids: [number, number][];
  private lastPlace = 0;
  private lastPop = 0;

  constructor(
    private game: GameImpl,
    city: CityData,
    private map: MapLibreMap,
  ) {
    // A point on each segment to anchor labels on.
    this.mids = city.segments.coords.map((c) => c[Math.floor(c.length / 2)]);
    this.root = document.createElement('div');
    this.root.className = 'company-labels';
    this.labels = game.companies.map((c) => {
      const root = document.createElement('div');
      root.className = `company-label${c.isBot ? '' : ' me'}`;
      root.style.setProperty('--company', `rgb(${c.color.join(',')})`);
      root.innerHTML = `<div class="pops"></div><div class="name"><i></i>${c.isBot ? c.name : `${c.name} (you)`}</div><div class="value"></div>`;
      this.root.append(root);
      return {
        root,
        value: root.querySelector<HTMLElement>('.value')!,
        pops: root.querySelector<HTMLElement>('.pops')!,
        at: null,
        lastDay: 0,
      };
    });
  }

  /** Called every frame: re-anchors labels, updates values and pops sales. */
  update(now: number): void {
    const g = this.game;
    if (now - this.lastPlace > 500) {
      this.lastPlace = now;
      this.place();
    }
    const pop = now - this.lastPop > 1000;
    if (pop) this.lastPop = now;
    g.companies.forEach((c, i) => {
      const l = this.labels[i];
      if (!c.alive || !l.at) {
        l.root.hidden = true;
        return;
      }
      l.root.hidden = false;
      const p = this.map.project(l.at);
      l.root.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const v = g.valuation(c).total;
      l.value.textContent = `${money(v)}${v >= CONFIG.valuation.unicorn * 0.5 ? ' 🦄' : ''}`;
      if (pop) this.popMoney(l, c.pnl.revenue * (g.day - l.lastDay), c.pnl.profit * (g.day - l.lastDay));
      if (pop) l.lastDay = g.day;
    });
  }

  /** Puts each label on the owned street nearest the territory's centre. */
  private place(): void {
    const g = this.game;
    const n = g.companies.length;
    const sx = new Float64Array(n);
    const sy = new Float64Array(n);
    const count = new Float64Array(n);
    for (let t = 0; t < g.owner.length; t++) {
      const o = g.owner[t];
      if (o < 0) continue;
      sx[o] += this.mids[t][0];
      sy[o] += this.mids[t][1];
      count[o]++;
    }
    const best = new Float64Array(n).fill(Infinity);
    const cx = Array.from(sx, (v, i) => v / Math.max(1, count[i]));
    const cy = Array.from(sy, (v, i) => v / Math.max(1, count[i]));
    for (let t = 0; t < g.owner.length; t++) {
      const o = g.owner[t];
      if (o < 0) continue;
      const [x, y] = this.mids[t];
      const d = (x - cx[o]) * (x - cx[o]) + (y - cy[o]) * (y - cy[o]);
      if (d < best[o]) {
        best[o] = d;
        this.labels[o].at = this.mids[t];
      }
    }
    g.companies.forEach((c, i) => count[i] === 0 && c.alive && (this.labels[i].at = null));
  }

  /** Sales pop up in green; a company losing money shows its loss in red instead. */
  private popMoney(l: Label, sales: number, profit: number): void {
    const losing = profit < 0;
    const amount = losing ? -profit : sales;
    if (amount < 1) return;
    const el = document.createElement('div');
    el.className = `pop${losing ? ' losing' : ''}`;
    el.textContent = `${losing ? '−' : '+'}${money(amount)}`;
    el.title = losing ? 'Losing money' : 'Sales';
    // Bigger sales, bigger numbers.
    el.style.fontSize = `${Math.min(18, 10 + Math.log10(amount) * 1.6)}px`;
    l.pops.append(el);
    el.addEventListener('animationend', () => el.remove());
  }
}
