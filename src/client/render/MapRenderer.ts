import { NEUTRAL, Terrain, WATER } from '@unicornrush/engine-api/game/GameMap';
import { buildingKind } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';

type RGB = [number, number, number];

const CELL = 8; // pixels per tile
const STREET = 4; // pixels of street between blocks
const RES = 2; // canvas pixels per map pixel, so zooming in stays sharp

const ASPHALT = '#16191e';
const LANE = '#5a5236';
const SIDEWALK = '#3a3f48';
const RIVER = '#1d4e72';
const RIVER_LIGHT = '#2a6590';
const PARK = '#2d5a37';
const TREE = '#3f7d4c';
const BRIDGE = '#545a64';
const COURT_GOLD: RGB = [241, 196, 15];

// Untapped buildings are drawn in muted colours.
const NEUTRAL_COLOR: Record<'house' | 'shop' | 'tower', RGB> = {
  house: [104, 96, 86],
  shop: [92, 99, 110],
  tower: [112, 121, 136],
};

const css = ([r, g, b]: RGB) => `rgb(${r | 0},${g | 0},${b | 0})`;
const scale = ([r, g, b]: RGB, k: number): RGB => [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k)];
const lift = ([r, g, b]: RGB, k: number): RGB => [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k];

/**
 * Draws the market as a city seen from above: blocks of houses, shops and
 * towers separated by streets. Each building takes its owner's colour.
 */
export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private background: HTMLCanvasElement;
  private drawnKey = '';
  private readonly bs: number;
  private readonly w: number;
  private readonly h: number;

  constructor(private game: GameImpl) {
    const { width, height, blockSize } = game.map;
    this.bs = blockSize;
    this.canvas = document.createElement('canvas');
    this.w = this.px(width - 1) + CELL;
    this.h = this.py(height - 1) + CELL;
    this.canvas.width = this.w * RES;
    this.canvas.height = this.h * RES;
    this.canvas.className = 'map';
    this.canvas.style.aspectRatio = `${this.w} / ${this.h}`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(RES, RES);
    this.background = this.drawBackground();
  }

  /** Left pixel of tile column x (streets add a gap after every block). */
  private px(x: number): number {
    return x * CELL + Math.floor(x / this.bs) * STREET;
  }

  private py(y: number): number {
    return y * CELL + Math.floor(y / this.bs) * STREET;
  }

  /** Streets, river, bridges and parks: everything that never changes. */
  private drawBackground(): HTMLCanvasElement {
    const { width: w, height: h, terrain } = this.game.map;
    const bg = document.createElement('canvas');
    bg.width = this.w * RES;
    bg.height = this.h * RES;
    const ctx = bg.getContext('2d')!;
    ctx.scale(RES, RES);
    ctx.fillStyle = ASPHALT;
    ctx.fillRect(0, 0, this.w, this.h);

    // Dashed lane markings down the middle of every street.
    ctx.fillStyle = LANE;
    for (let bx = 1; bx < w / this.bs; bx++) {
      const x = this.px(bx * this.bs) - STREET + 1;
      for (let y = 0; y < this.h; y += 8) ctx.fillRect(x, y, 1, 4);
    }
    for (let by = 1; by < h / this.bs; by++) {
      const y = this.py(by * this.bs) - STREET + 1;
      for (let x = 0; x < this.w; x += 8) ctx.fillRect(x, y, 4, 1);
    }

    // Sidewalk under every block, so blocks read clearly against the streets.
    ctx.fillStyle = SIDEWALK;
    for (let by = 0; by < h / this.bs; by++) {
      for (let bx = 0; bx < w / this.bs; bx++) {
        const x0 = this.px(bx * this.bs);
        const y0 = this.py(by * this.bs);
        ctx.fillRect(x0, y0, this.bs * CELL, this.bs * CELL);
      }
    }

    // River, parks and bridges fill the streets between them too, so they read as one shape.
    const fills: Record<number, string> = { [Terrain.River]: RIVER, [Terrain.Park]: PARK, [Terrain.Bridge]: BRIDGE };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = terrain[y * w + x];
        if (t === Terrain.Lot) continue;
        const same = (dx: number, dy: number) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= w || ny >= h) return false;
          const n = terrain[ny * w + nx];
          // Bridges and river merge so the water flows under the bridge.
          return n === t || (t !== Terrain.Park && n !== Terrain.Lot && n !== Terrain.Park);
        };
        const x0 = this.px(x);
        const y0 = this.py(y);
        const x1 = same(1, 0) ? this.px(x + 1) : x0 + CELL;
        const y1 = same(0, 1) ? this.py(y + 1) : y0 + CELL;
        ctx.fillStyle = t === Terrain.Bridge ? RIVER : fills[t];
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        if (t === Terrain.River && (x * 7 + y * 13) % 11 === 0) {
          ctx.fillStyle = RIVER_LIGHT;
          ctx.fillRect(x0 + 1, y0 + 3, 4, 1);
        }
        if (t === Terrain.Park && (x * 5 + y * 3) % 4 === 0) {
          ctx.fillStyle = TREE;
          ctx.beginPath();
          ctx.arc(x0 + 4, y0 + 4, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Bridge decks on top of the water, extended across the street gaps.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (terrain[y * w + x] !== Terrain.Bridge) continue;
        const x0 = this.px(x);
        const y0 = this.py(y);
        const below = y + 1 < h && terrain[(y + 1) * w + x] === Terrain.Bridge;
        ctx.fillStyle = BRIDGE;
        ctx.fillRect(x0, y0, CELL, below ? this.py(y + 1) - y0 : CELL);
      }
    }
    return bg;
  }

  draw(): void {
    const g = this.game;
    // Companies being sued get a blinking gold border while the case runs.
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    const inCourt = new Set(blink ? g.lawsuits.map((l) => l.defendant) : []);
    const key = `${g.ownershipVersion}|${[...inCourt].join(',')}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    const ctx = this.ctx;
    ctx.drawImage(this.background, 0, 0, this.w, this.h);
    const { width: w, demand, terrain } = g.map;
    for (let i = 0; i < g.owner.length; i++) {
      const o = g.owner[i];
      if (o === WATER) continue;
      const t = terrain[i];
      const x0 = this.px(i % w);
      const y0 = this.py((i / w) | 0);
      if (t === Terrain.Bridge) {
        // Owned bridges get a coloured stripe; the deck stays grey.
        if (o >= 0) {
          ctx.fillStyle = css(g.companies[o].color);
          ctx.fillRect(x0 + 3, y0, 2, CELL);
        }
        continue;
      }
      const kind = buildingKind(demand[i]);
      let body: RGB;
      if (o === NEUTRAL) {
        // A little variety between neighbouring buildings.
        body = scale(NEUTRAL_COLOR[kind], 0.9 + ((i * 2654435761) >>> 28) / 60);
      } else {
        const base = g.companies[o].color;
        body = scale(base, kind === 'house' ? 0.7 : kind === 'shop' ? 0.85 : 1);
      }
      this.drawBuilding(x0, y0, kind, body);

      if (o >= 0 && g.companies[o].border.has(i)) {
        // Your own border glows; rivals' borders are outlined darker.
        const edge = inCourt.has(o) ? COURT_GOLD : o === 0 ? lift(g.companies[o].color, 0.6) : scale(g.companies[o].color, 0.45);
        ctx.strokeStyle = css(edge);
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, CELL - 1, CELL - 1);
      }
    }
  }

  private drawBuilding(x: number, y: number, kind: 'house' | 'shop' | 'tower', body: RGB): void {
    const ctx = this.ctx;
    ctx.fillStyle = css(body);
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    if (kind === 'house') {
      // Pitched roof: darker top half.
      ctx.fillStyle = css(scale(body, 0.7));
      ctx.fillRect(x + 1, y + 1, CELL - 2, 3);
    } else if (kind === 'shop') {
      // Striped awning along the front.
      ctx.fillStyle = css(lift(body, 0.45));
      ctx.fillRect(x + 1, y + CELL - 3, 2, 2);
      ctx.fillRect(x + 4, y + CELL - 3, 2, 2);
    } else {
      // Tower: dark frame with a lit rooftop unit.
      ctx.fillStyle = css(scale(body, 0.6));
      ctx.fillRect(x + 1, y + 1, CELL - 2, 1);
      ctx.fillRect(x + 1, y + 1, 1, CELL - 2);
      ctx.fillStyle = css(lift(body, 0.5));
      ctx.fillRect(x + 3, y + 3, 2, 2);
    }
  }

  /** Converts a mouse event to a tile index (nearest building), or -1 outside the map. */
  tileAt(ev: MouseEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * this.w;
    const py = ((ev.clientY - rect.top) / rect.height) * this.h;
    const x = this.axisTile(px, this.game.map.width);
    const y = this.axisTile(py, this.game.map.height);
    if (x < 0 || y < 0) return -1;
    return y * this.game.map.width + x;
  }

  private axisTile(p: number, count: number): number {
    if (p < 0) return -1;
    const span = this.bs * CELL + STREET;
    const block = Math.floor(p / span);
    const within = Math.min(this.bs - 1, Math.floor((p - block * span) / CELL));
    const t = block * this.bs + within;
    return t < count ? t : -1;
  }
}
