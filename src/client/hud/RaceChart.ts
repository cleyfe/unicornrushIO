import { money } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { History } from '../History';
import { el, rgb } from './dom';

const W = 560;
const H = 240;
const L = 52; // room for axis labels
const R = 10;
const T = 10;
const B = 22;
const LO = 1e5; // the axis runs from $100K…
const HI = 1e9; // …to the unicorn line, on a log scale (each step ×10)

/**
 * Everyone's valuation over time, one line per company in its colour.
 * Log scale, so the early race is readable and $1B is the top line.
 */
export class RaceChart {
  readonly root: HTMLElement;
  private svg: SVGSVGElement;
  private readout: HTMLElement;
  private hoverIndex = -1;

  constructor(
    private game: GameImpl,
    private history: History,
  ) {
    this.root = el(
      'div',
      'race-chart',
      `<div class="rc-legend">${game.companies
        .map((c) => `<span><i style="background:${rgb(c.color)}"></i>${c.isBot ? c.name : `${c.name} (you)`}</span>`)
        .join('')}</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Valuation of every company over time"></svg>
      <div class="rc-readout"></div>`,
    );
    this.svg = this.root.querySelector('svg')!;
    this.readout = this.root.querySelector('.rc-readout')!;
    this.svg.addEventListener('mousemove', (e) => {
      const r = this.svg.getBoundingClientRect();
      const t = ((e.clientX - r.left) / r.width) * W;
      const n = this.history.race.length;
      this.hoverIndex = n < 2 ? -1 : Math.round(Math.min(1, Math.max(0, (t - L) / (W - L - R))) * (n - 1));
      this.draw();
    });
    this.svg.addEventListener('mouseleave', () => {
      this.hoverIndex = -1;
      this.draw();
    });
  }

  private y(v: number): number {
    const k = (Math.log10(Math.min(HI, Math.max(LO, v))) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO));
    return T + (1 - k) * (H - T - B);
  }

  draw(): void {
    const rows = this.history.race;
    const n = rows.length;
    const x = (i: number) => L + (n < 2 ? 0 : (i / (n - 1)) * (W - L - R));
    const grid = [1e5, 1e6, 1e7, 1e8, 1e9]
      .map((v) => `<line class="rc-grid${v === HI ? ' unicorn' : ''}" x1="${L}" x2="${W - R}" y1="${this.y(v)}" y2="${this.y(v)}"/><text class="rc-axis" x="${L - 6}" y="${this.y(v) + 4}" text-anchor="end">${v === HI ? '🦄 $1B' : money(v)}</text>`)
      .join('');
    const lastDay = n ? rows[n - 1].day : 0;
    const days = `<text class="rc-axis" x="${L}" y="${H - 6}">day 0</text><text class="rc-axis" x="${W - R}" y="${H - 6}" text-anchor="end">day ${lastDay}</text>`;
    // The player's line goes on top.
    const order = this.game.companies.map((c) => c.id).sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    const lines = order
      .map((id) => {
        const c = this.game.companies[id];
        let d = '';
        let pen = false;
        rows.forEach((row, i) => {
          const v = row.values[id];
          if (v === null) return void (pen = false);
          d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${this.y(v).toFixed(1)}`;
          pen = true;
        });
        return `<path d="${d}" fill="none" stroke="${rgb(c.color)}" stroke-width="${id === 0 ? 2.5 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      })
      .join('');
    let marker = '';
    let readout = '';
    const i = this.hoverIndex >= 0 && this.hoverIndex < n ? this.hoverIndex : n - 1;
    if (i >= 0) {
      const row = rows[i];
      if (this.hoverIndex >= 0) {
        marker =
          `<line class="rc-cross" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}"/>` +
          row.values
            .map((v, id) => (v === null ? '' : `<circle cx="${x(i)}" cy="${this.y(v)}" r="4" fill="${rgb(this.game.companies[id].color)}" class="rc-dot"/>`))
            .join('');
      }
      readout =
        `<b>Day ${row.day}</b>` +
        row.values
          .map((v, id) => ({ v, c: this.game.companies[id] }))
          .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
          .map(({ v, c }) => `<span><i style="background:${rgb(c.color)}"></i>${c.name} ${v === null ? 'closed' : money(v)}</span>`)
          .join('');
    }
    this.svg.innerHTML = grid + days + lines + marker;
    this.readout.innerHTML = readout;
  }
}
