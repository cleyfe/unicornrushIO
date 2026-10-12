import { money } from '@unicornrush/engine-lib/Format';

export interface Sample {
  day: number;
  value: number;
}

const W = 320;
const H = 64;
const PAD = 4;

/**
 * A small single-series line chart with a zero line and a hover readout.
 * One measure per chart: valuation and profit have different scales, so they
 * get separate charts rather than a second axis.
 */
export class Sparkline {
  readonly root: HTMLElement;
  private samples: Sample[] = [];
  private svg: SVGSVGElement;
  private readout: HTMLElement;

  constructor(
    title: string,
    private color: string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'spark';
    this.root.innerHTML = `<div class="spark-head"><span>${title}</span><span class="spark-readout"></span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${title} over time"></svg>`;
    this.svg = this.root.querySelector('svg')!;
    this.readout = this.root.querySelector('.spark-readout')!;
    this.svg.addEventListener('mousemove', (e) => this.hover(e));
    this.svg.addEventListener('mouseleave', () => this.draw());
  }

  update(samples: Sample[]): void {
    this.samples = samples;
    this.draw();
  }

  private scale(): { x: (i: number) => number; y: (v: number) => number } {
    const vs = this.samples.map((s) => s.value);
    const lo = Math.min(0, ...vs);
    const hi = Math.max(1, ...vs);
    const n = Math.max(1, this.samples.length - 1);
    return {
      x: (i) => PAD + (i / n) * (W - PAD * 2),
      y: (v) => H - PAD - ((v - lo) / (hi - lo || 1)) * (H - PAD * 2),
    };
  }

  private draw(hoverIndex = -1): void {
    const s = this.samples;
    if (s.length < 2) {
      this.svg.innerHTML = '';
      this.readout.textContent = s.length ? money(s[0].value) : '';
      return;
    }
    const { x, y } = this.scale();
    const pts = s.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const zero = y(0);
    let marker = '';
    if (hoverIndex >= 0) {
      const p = s[hoverIndex];
      marker = `<line x1="${x(hoverIndex)}" x2="${x(hoverIndex)}" y1="0" y2="${H}" class="spark-cross"/>
        <circle cx="${x(hoverIndex)}" cy="${y(p.value)}" r="4" fill="${this.color}" class="spark-dot"/>`;
    }
    this.svg.innerHTML = `<line x1="0" x2="${W}" y1="${zero}" y2="${zero}" class="spark-zero"/>
      <polyline points="${pts}" fill="none" stroke="${this.color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      ${marker}`;
    const p = hoverIndex >= 0 ? s[hoverIndex] : s[s.length - 1];
    this.readout.textContent = `${money(p.value)}${hoverIndex >= 0 ? ` · day ${p.day}` : ''}`;
  }

  private hover(e: MouseEvent): void {
    if (this.samples.length < 2) return;
    const r = this.svg.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    this.draw(Math.round(t * (this.samples.length - 1)));
  }
}
