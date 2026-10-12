import { Terrain, Wealth, type GameMap } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '../configuration/Config';
import { exp } from '../DetMath';
import type { PseudoRandom } from '../PseudoRandom';

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth 1D noise in [0, 1] sampled at `n` points. */
function noise1d(rng: PseudoRandom, n: number, cell: number): Float32Array {
  const knots = Array.from({ length: Math.ceil(n / cell) + 2 }, () => rng.next());
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g = i / cell;
    const k = Math.floor(g);
    const t = smooth(g - k);
    out[i] = knots[k] * (1 - t) + knots[k + 1] * t;
  }
  return out;
}

/** Smooth 2D noise in [0, 1]. */
function noise2d(rng: PseudoRandom, w: number, h: number, cell: number): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh).map(() => rng.next());
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const gy = y / cell;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0];
      const d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

export function isStreetLine(map: { streetEvery: number }, x: number, y: number): boolean {
  return x % map.streetEvery === 0 || y % map.streetEvery === 0;
}

/**
 * A city of streets. Companies own street tiles (the shops along them);
 * the blocks in between are scenery. Each neighbourhood has a wealth level:
 * rich streets near the river and parks, budget streets elsewhere, and dense
 * downtowns with many customers.
 */
export function generateMap(rng: PseudoRandom): GameMap {
  const cfg = CONFIG.map;
  const { width: w, height: h, streetEvery: se } = cfg;
  const n = w * h;
  const terrain = new Uint8Array(n);
  const demand = new Float32Array(n);
  const wealth = new Uint8Array(n);
  const spend = new Float32Array(n);
  const isWater = new Uint8Array(n);

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) terrain[y * w + x] = isStreetLine(cfg, x, y) ? Terrain.Street : Terrain.Block;

  // River: meanders across the city, crossed by bridges on some avenues.
  const centre = noise1d(rng, w, 40);
  const width = noise1d(rng, w, 25);
  const riverMid = rng.range(0.35, 0.65) * h;
  const riverY = new Float32Array(w);
  const riverHalf = new Float32Array(w);
  const bridgeOffset = rng.int(0, cfg.bridgeEveryAvenues);
  for (let x = 0; x < w; x++) {
    riverY[x] = riverMid + (centre[x] - 0.5) * h * 0.45;
    riverHalf[x] = 1.5 + width[x];
    const bridge = x % se === 0 && (x / se) % cfg.bridgeEveryAvenues === bridgeOffset;
    for (let y = Math.floor(riverY[x] - riverHalf[x]); y <= Math.ceil(riverY[x] + riverHalf[x]); y++) {
      if (y < 0 || y >= h) continue;
      terrain[y * w + x] = bridge ? Terrain.Bridge : Terrain.River;
    }
  }

  // Parks: whole blocks away from the river.
  const blocksX = Math.floor(w / se);
  const blocksY = Math.floor(h / se);
  const parkBlock = new Uint8Array(blocksX * blocksY);
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (!rng.chance(cfg.parkShare)) continue;
      let dry = true;
      for (let y = by * se; y <= (by + 1) * se; y++)
        for (let x = bx * se; x <= (bx + 1) * se; x++) {
          const t = terrain[y * w + x];
          if (t === Terrain.River || t === Terrain.Bridge) dry = false;
        }
      if (!dry) continue;
      parkBlock[by * blocksX + bx] = 1;
      for (let y = by * se + 1; y < (by + 1) * se; y++)
        for (let x = bx * se + 1; x < (bx + 1) * se; x++) terrain[y * w + x] = Terrain.Park;
    }
  }
  const nearPark = (x: number, y: number) => {
    const bx = Math.floor(x / se);
    const by = Math.floor(y / se);
    for (let dy = -1; dy <= 0; dy++)
      for (let dx = -1; dx <= 0; dx++) {
        // A street tile on a block's edge touches the blocks on either side.
        const cx = x % se === 0 ? bx + dx : bx;
        const cy = y % se === 0 ? by + dy : by;
        if (cx >= 0 && cy >= 0 && cx < blocksX && cy < blocksY && parkBlock[cy * blocksX + cx]) return true;
      }
    return false;
  };

  // Wealth: smooth neighbourhoods, richer by the river and by parks.
  const field = noise2d(rng, w, h, 28);
  const centres = Array.from({ length: cfg.downtowns }, () => ({
    x: rng.range(15, w - 15),
    y: rng.range(12, h - 12),
    r: rng.range(7, 13),
    peak: rng.range(1.5, 3),
  }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const riverDist = Math.abs(y - riverY[x]) - riverHalf[x];
      let v = field[i];
      if (riverDist < 5) v += 0.25 * (1 - Math.max(0, riverDist) / 5);
      if (nearPark(x, y)) v += 0.2;
      wealth[i] = v < 0.38 ? Wealth.Budget : v < 0.6 ? Wealth.Middle : v < 0.8 ? Wealth.Upscale : Wealth.Luxury;

      const t = terrain[i];
      if (t === Terrain.Street || t === Terrain.Bridge) {
        let density = 1;
        for (const c of centres) {
          const dist2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
          density += c.peak * exp(-dist2 / (2 * c.r * c.r));
        }
        const tier = CONFIG.wealth[wealth[i]];
        const base = t === Terrain.Bridge ? 0.3 : cfg.customersPerStreet * density * tier.density;
        demand[i] = Math.round(base * 4) / 4;
        spend[i] = demand[i] * tier.spend;
      } else {
        isWater[i] = 1;
      }
    }
  }
  return { width: w, height: h, streetEvery: se, terrain, demand, wealth, spend, isWater };
}

export function neighbors4(map: GameMap, i: number, out: number[]): number[] {
  out.length = 0;
  const x = i % map.width;
  const y = (i / map.width) | 0;
  if (x > 0) out.push(i - 1);
  if (x < map.width - 1) out.push(i + 1);
  if (y > 0) out.push(i - map.width);
  if (y < map.height - 1) out.push(i + map.width);
  return out;
}

/** The street tile nearest to (x, y): blocks snap to the street around them. */
export function nearestStreet(map: GameMap, x: number, y: number): number {
  const se = map.streetEvery;
  if (isStreetLine(map, x, y)) return y * map.width + x;
  const sx = Math.round(x / se) * se;
  const sy = Math.round(y / se) * se;
  return Math.abs(sx - x) <= Math.abs(sy - y) ? y * map.width + Math.min(map.width - 1, sx) : Math.min(map.height - 1, sy) * map.width + x;
}
