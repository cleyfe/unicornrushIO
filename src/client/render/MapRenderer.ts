import { Terrain, Wealth, WATER } from '@unicornrush/engine-api/game/GameMap';
import { nearestStreet } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';

type RGB = [number, number, number];

const CELL = 8; // map pixels per tile
const RES = 2; // canvas pixels per map pixel, so zooming in stays sharp

const STREET = '#5b6470';
const RIVER = '#1e4f78';
const PARK = '#2f5a3a';
const COURT: RGB = [255, 255, 255];

/**
 * Block colour by wealth: one warm hue from dark (budget) to gold (luxury),
 * so richer neighbourhoods read as brighter at a glance.
 */
export const WEALTH_COLORS: Record<Wealth, string> = {
  [Wealth.Budget]: '#1f242b',
  [Wealth.Middle]: '#3f3c2f',
  [Wealth.Upscale]: '#6b5a2c',
  [Wealth.Luxury]: '#a8842a',
};

const css = ([r, g, b]: RGB) => `rgb(${r | 0},${g | 0},${b | 0})`;
const lift = ([r, g, b]: RGB, k: number): RGB => [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k];

/**
 * Draws the city as a flat map. Blocks show neighbourhood wealth, streets show
 * who owns them, and a block whose streets mostly belong to one company is
 * tinted that company's colour so territories read as areas.
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

  /** Everything that never changes: blocks, parks, river and unowned streets. */
  private drawBackground(): HTMLCanvasElement {
    const { width: w, height: h, terrain, wealth } = this.game.map;
    const bg = document.createElement('canvas');
    bg.width = this.w * RES;
    bg.height = this.h * RES;
    const ctx = bg.getContext('2d')!;
    ctx.scale(RES, RES);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = terrain[i];
        ctx.fillStyle =
          t === Terrain.River
            ? RIVER
            : t === Terrain.Park
              ? PARK
              : t === Terrain.Block
                ? WEALTH_COLORS[wealth[i] as Wealth]
                : STREET;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    return bg;
  }

  draw(): void {
    const g = this.game;
    // Companies being sued blink white while the case runs.
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    const inCourt = new Set(blink ? g.lawsuits.map((l) => l.defendant) : []);
    const key = `${g.ownershipVersion}|${[...inCourt].join(',')}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    const ctx = this.ctx;
    ctx.drawImage(this.background, 0, 0, this.w, this.h);
    this.tintBlocks();
    const w = g.map.width;
    for (let i = 0; i < g.owner.length; i++) {
      const o = g.owner[i];
      if (o < 0 || o === WATER) continue;
      const c = g.companies[o];
      let fill: RGB = c.color;
      if (c.border.has(i)) fill = inCourt.has(o) ? COURT : o === 0 ? lift(c.color, 0.5) : lift(c.color, 0.25);
      ctx.fillStyle = css(fill);
      ctx.fillRect((i % w) * CELL, ((i / w) | 0) * CELL, CELL, CELL);
    }
  }

  /** A block whose streets mostly belong to one company is tinted its colour. */
  private tintBlocks(): void {
    const g = this.game;
    const { width: w, height: h, streetEvery: se, terrain } = g.map;
    const ctx = this.ctx;
    const counts = new Map<number, number>();
    ctx.globalAlpha = 0.4;
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
          // Tint only the block's land, not river or park inside it.
          ctx.fillStyle = css(g.companies[o].color);
          for (let y = by * se + 1; y < (by + 1) * se; y++)
            for (let x = bx * se + 1; x < (bx + 1) * se; x++)
              if (terrain[y * w + x] === Terrain.Block) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
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
