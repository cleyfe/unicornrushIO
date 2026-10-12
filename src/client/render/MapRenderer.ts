import { Terrain, Wealth, WATER } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { nearestStreet } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';

type RGB = [number, number, number];

const CELL = 8; // map pixels per tile
const RES = 2; // canvas pixels per map pixel, so zooming in stays sharp

const ASPHALT = '#2a2e35';
const LANE = '#6b6340';
const RIVER = '#1d4e72';
const RIVER_LIGHT = '#2a6590';
const RAIL = '#9aa0a8';
const COURT_GOLD: RGB = [241, 196, 15];

/** Curb colour of each wealth level: the legend players read the map by. */
export const WEALTH_COLORS: Record<Wealth, string> = {
  [Wealth.Budget]: '#a1887f',
  [Wealth.Middle]: '#90a4ae',
  [Wealth.Upscale]: '#4db6ac',
  [Wealth.Luxury]: '#ffca28',
};

const css = ([r, g, b]: RGB) => `rgb(${r | 0},${g | 0},${b | 0})`;
const scale = ([r, g, b]: RGB, k: number): RGB => [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k)];
const lift = ([r, g, b]: RGB, k: number): RGB => [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k];

/** Small deterministic hash for visual variety. */
const hash = (a: number, b: number) => ((a * 73856093) ^ (b * 19349663)) >>> 0;

/**
 * Draws the city from above. Streets are the territory: owned streets are
 * painted in the company's colour. Blocks are scenery that shows each
 * neighbourhood's wealth, from row houses to villas with pools.
 */
export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private background: HTMLCanvasElement;
  private drawnKey = '';
  private readonly w: number;
  private readonly h: number;

  constructor(private game: GameImpl) {
    const { width, height } = game.map;
    this.w = width * CELL;
    this.h = height * CELL;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w * RES;
    this.canvas.height = this.h * RES;
    this.canvas.className = 'map';
    this.canvas.style.aspectRatio = `${this.w} / ${this.h}`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(RES, RES);
    this.background = this.drawBackground();
  }

  // ---------- static city ----------

  private drawBackground(): HTMLCanvasElement {
    const map = this.game.map;
    const { width: w, height: h, terrain, wealth, streetEvery: se } = map;
    const bg = document.createElement('canvas');
    bg.width = this.w * RES;
    bg.height = this.h * RES;
    const ctx = bg.getContext('2d')!;
    ctx.scale(RES, RES);
    ctx.fillStyle = ASPHALT;
    ctx.fillRect(0, 0, this.w, this.h);

    // Blocks.
    for (let by = 0; by * se + se < h; by++) {
      for (let bx = 0; bx * se + se < w; bx++) {
        const x0 = (bx * se + 1) * CELL;
        const y0 = (by * se + 1) * CELL;
        const size = (se - 1) * CELL;
        const cx = bx * se + 2;
        const cy = by * se + 2;
        const t = terrain[cy * w + cx];
        if (t === Terrain.Park) this.drawPark(ctx, x0, y0, size, bx, by);
        else if (t === Terrain.Block) this.drawBlock(ctx, x0, y0, size, wealth[cy * w + cx], this.blockDensity(bx, by), bx, by);
      }
    }

    // Riverbank where the river cuts through part of a block.
    ctx.fillStyle = '#44573c';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (terrain[y * w + x] !== Terrain.Block) continue;
        const cx = Math.floor(x / se) * se + 2;
        const cy = Math.floor(y / se) * se + 2;
        if (terrain[cy * w + cx] !== Terrain.Block) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    // River over everything it covers; bridges on top.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = terrain[y * w + x];
        if (t !== Terrain.River && t !== Terrain.Bridge) continue;
        ctx.fillStyle = RIVER;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        if (t === Terrain.River && hash(x, y) % 9 === 0) {
          ctx.fillStyle = RIVER_LIGHT;
          ctx.fillRect(x * CELL + 1, y * CELL + 3, 5, 1);
        }
        if (t === Terrain.Bridge) {
          ctx.fillStyle = ASPHALT;
          ctx.fillRect(x * CELL + 1, y * CELL, CELL - 2, CELL);
          ctx.fillStyle = RAIL;
          ctx.fillRect(x * CELL, y * CELL, 1, CELL);
          ctx.fillRect(x * CELL + CELL - 1, y * CELL, 1, CELL);
        }
      }
    }

    // Lane markings and wealth-coloured curbs along every street.
    const curb = (nx: number, ny: number) => {
      const t = terrain[ny * w + nx];
      return t === Terrain.Block || t === Terrain.Park;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (terrain[i] !== Terrain.Street) continue;
        const px = x * CELL;
        const py = y * CELL;
        const horizontal = y % se === 0;
        const vertical = x % se === 0;
        ctx.fillStyle = LANE;
        if (horizontal && !vertical) ctx.fillRect(px + 1, py + 3.5, 4, 1);
        if (vertical && !horizontal) ctx.fillRect(px + 3.5, py + 1, 1, 4);
        ctx.fillStyle = WEALTH_COLORS[wealth[i] as Wealth];
        if (y > 0 && curb(x, y - 1)) ctx.fillRect(px, py, CELL, 1);
        if (y < h - 1 && curb(x, y + 1)) ctx.fillRect(px, py + CELL - 1, CELL, 1);
        if (x > 0 && curb(x - 1, y)) ctx.fillRect(px, py, 1, CELL);
        if (x < w - 1 && curb(x + 1, y)) ctx.fillRect(px + CELL - 1, py, 1, CELL);
      }
    }
    return bg;
  }

  /** How dense a block's surroundings are, relative to a suburb (1 = suburb). */
  private blockDensity(bx: number, by: number): number {
    const { width: w, demand, wealth, streetEvery: se } = this.game.map;
    const i = by * se * w + bx * se + 2;
    const tier = CONFIG.wealth[wealth[i]];
    return demand[i] / (CONFIG.map.customersPerStreet * tier.density);
  }

  private drawPark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, bx: number, by: number): void {
    ctx.fillStyle = '#2f6b3b';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#c9b98f';
    ctx.fillRect(x, y + size / 2 - 1, size, 2); // footpath
    for (let k = 0; k < 7; k++) {
      const r = hash(bx * 7 + k, by);
      this.tree(ctx, x + 3 + (r % (size - 6)), y + 3 + ((r >> 8) % (size - 6)), 2 + (r % 2));
    }
  }

  private drawBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    tier: number,
    density: number,
    bx: number,
    by: number,
  ): void {
    const r = hash(bx, by);
    if (density > 2.1) {
      // Downtown: glass towers on a plaza.
      ctx.fillStyle = '#3a3f48';
      ctx.fillRect(x, y, size, size);
      if (density > 2.8) {
        this.tower(ctx, x + 3, y + 3, size - 7, r);
      } else {
        const s = size / 2 - 3;
        for (let k = 0; k < 4; k++) {
          this.tower(ctx, x + 2 + (k % 2) * (size / 2), y + 2 + Math.floor(k / 2) * (size / 2), s, r + k);
        }
      }
      return;
    }
    switch (tier) {
      case Wealth.Budget: {
        // Packed row houses.
        ctx.fillStyle = '#3d3a36';
        ctx.fillRect(x, y, size, size);
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 4; col++) {
            const v = 0.85 + (hash(bx * 4 + col, by * 4 + row) % 30) / 100;
            const roof: RGB = scale([134, 98, 78], v);
            ctx.fillStyle = css(roof);
            ctx.fillRect(x + col * 8 + 1, y + row * 8 + 1, 6, 6);
            ctx.fillStyle = css(scale(roof, 0.75));
            ctx.fillRect(x + col * 8 + 1, y + row * 8 + 1, 6, 3);
          }
        }
        return;
      }
      case Wealth.Middle: {
        // Family homes with small gardens.
        ctx.fillStyle = '#4b5e3f';
        ctx.fillRect(x, y, size, size);
        for (let k = 0; k < 4; k++) {
          const hx = x + 3 + (k % 2) * 16;
          const hy = y + 3 + Math.floor(k / 2) * 16;
          ctx.fillStyle = '#b8a07c';
          ctx.fillRect(hx, hy, 10, 9);
          ctx.fillStyle = '#8e7a5c';
          ctx.fillRect(hx, hy + 4, 10, 1); // roof ridge
        }
        return;
      }
      case Wealth.Upscale: {
        // Townhouses and tree-lined gardens.
        ctx.fillStyle = '#3f6b45';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#8b90a6';
        ctx.fillRect(x + 2, y + 3, size - 4, 8);
        ctx.fillRect(x + 2, y + size - 11, size - 4, 8);
        ctx.fillStyle = '#6d7289';
        for (let k = 1; k < 4; k++) {
          ctx.fillRect(x + 2 + k * 7, y + 3, 1, 8);
          ctx.fillRect(x + 2 + k * 7, y + size - 11, 1, 8);
        }
        for (let k = 0; k < 3; k++) this.tree(ctx, x + 6 + k * 10, y + size / 2, 2);
        return;
      }
      default: {
        // Luxury: a villa with a pool, lawn and hedges.
        ctx.fillStyle = '#3c7a46';
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = '#2b5e34';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
        const flip = r % 2 === 0;
        ctx.fillStyle = '#ece6d8';
        ctx.fillRect(flip ? x + 3 : x + 11, y + 4, 18, 12);
        ctx.fillStyle = '#cfc6b3';
        ctx.fillRect(flip ? x + 3 : x + 11, y + 9, 18, 1);
        ctx.fillStyle = '#4fc3f7';
        ctx.fillRect(flip ? x + 18 : x + 4, y + 20, 9, 6);
        this.tree(ctx, flip ? x + 7 : x + 25, y + 24, 3);
        this.tree(ctx, flip ? x + 27 : x + 5, y + 6, 2);
      }
    }
  }

  private tree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.fillStyle = '#4f9a5c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private tower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number): void {
    const glass: RGB = seed % 2 ? [104, 128, 160] : [128, 150, 178];
    ctx.fillStyle = css(scale(glass, 0.6));
    ctx.fillRect(x + 1, y + 1, s, s); // shadow
    ctx.fillStyle = css(glass);
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = css(lift(glass, 0.35));
    for (let k = 3; k < s - 1; k += 3) ctx.fillRect(x + k, y + 1, 1, s - 2);
    ctx.fillStyle = '#d9e3ee';
    ctx.fillRect(x + s / 2 - 1, y + s / 2 - 1, 2, 2); // rooftop unit
  }

  // ---------- ownership ----------

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
    const w = g.map.width;
    this.tintBlocks();
    for (let i = 0; i < g.owner.length; i++) {
      const o = g.owner[i];
      if (o < 0 || o === WATER) continue;
      const c = g.companies[o];
      const x = (i % w) * CELL;
      const y = ((i / w) | 0) * CELL;
      let fill: RGB = scale(c.color, 0.8);
      if (c.border.has(i)) fill = inCourt.has(o) ? COURT_GOLD : o === 0 ? lift(c.color, 0.45) : c.color;
      ctx.fillStyle = css(fill);
      // Leave the curb visible so the street's wealth still shows.
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    }
  }

  /** A block whose streets mostly belong to one company is tinted its colour. */
  private tintBlocks(): void {
    const g = this.game;
    const { width: w, height: h, streetEvery: se, terrain } = g.map;
    const ctx = this.ctx;
    const counts = new Map<number, number>();
    ctx.globalAlpha = 0.32;
    for (let by = 0; by * se + se < h; by++) {
      for (let bx = 0; bx * se + se < w; bx++) {
        counts.clear();
        let total = 0;
        const add = (x: number, y: number) => {
          const i = y * w + x;
          if (terrain[i] !== Terrain.Street && terrain[i] !== Terrain.Bridge) return;
          total++;
          const o = g.owner[i];
          if (o >= 0) counts.set(o, (counts.get(o) ?? 0) + 1);
        };
        for (let k = 0; k <= se; k++) {
          add(bx * se + k, by * se);
          add(bx * se + k, (by + 1) * se);
          if (k > 0 && k < se) {
            add(bx * se, by * se + k);
            add((bx + 1) * se, by * se + k);
          }
        }
        for (const [o, n] of counts) {
          if (n < total * 0.6) continue;
          ctx.fillStyle = css(g.companies[o].color);
          ctx.fillRect((bx * se + 1) * CELL, (by * se + 1) * CELL, (se - 1) * CELL, (se - 1) * CELL);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Converts a mouse event to the nearest street tile, or -1 outside the map. */
  tileAt(ev: MouseEvent): number {
    const map = this.game.map;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * map.width);
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * map.height);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return -1;
    return nearestStreet(map, x, y);
  }
}
