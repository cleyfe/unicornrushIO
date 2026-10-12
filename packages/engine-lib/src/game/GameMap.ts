import type { CityData } from '@unicornrush/engine-api/game/City';
import { Wealth, type GameMap } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '../configuration/Config';
import { exp } from '../DetMath';
import type { PseudoRandom } from '../PseudoRandom';

/** Writes the neighbours of tile i into `out` and returns it. */
export function neighbors(map: GameMap, i: number, out: number[]): number[] {
  out.length = 0;
  for (let k = map.adjStart[i]; k < map.adjStart[i + 1]; k++) out.push(map.adj[k]);
  return out;
}

function withSpend(demand: Float32Array, wealth: Uint8Array): Float32Array {
  return demand.map((d, i) => d * CONFIG.wealth[wealth[i]].spend);
}

/** A real city built from OpenStreetMap. */
export function mapFromCity(city: CityData): GameMap {
  const s = city.segments;
  const wealth = Uint8Array.from(s.wealth);
  // Wealthy homes are bigger: the same floor area holds fewer customers.
  // Real floor-area data already varies a lot, so the effect is halved.
  const demand = Float32Array.from(s.customers, (c, i) => c * (1 + (CONFIG.wealth[wealth[i]].density - 1) * 0.5));
  return {
    size: s.customers.length,
    adjStart: Int32Array.from(s.adjStart),
    adj: Int32Array.from(s.adj),
    x: Float32Array.from(s.x),
    y: Float32Array.from(s.y),
    demand,
    wealth,
    spend: withSpend(demand, wealth),
  };
}

// ---------- synthetic grid city (tests, balance runs, fallback) ----------

const Tile = { Street: 0, River: 1, Park: 2, Bridge: 3, Block: 4 } as const;
const METRES_PER_TILE = 20;

const smooth = (t: number) => t * t * (3 - 2 * t);

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

/**
 * A synthetic city on a grid: streets around 4×4 blocks, a river crossed by
 * bridges, parks, downtowns, and wealthier neighbourhoods by the river and
 * parks. Only street tiles become map tiles.
 */
export function generateGridCity(rng: PseudoRandom): GameMap {
  const cfg = CONFIG.gridCity;
  const { width: w, height: h, streetEvery: se } = cfg;
  const n = w * h;
  const tile = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) tile[y * w + x] = x % se === 0 || y % se === 0 ? Tile.Street : Tile.Block;

  // River, crossed by bridges on some avenues.
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
      if (y >= 0 && y < h) tile[y * w + x] = bridge ? Tile.Bridge : Tile.River;
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
          const t = tile[y * w + x];
          if (t === Tile.River || t === Tile.Bridge) dry = false;
        }
      if (dry) parkBlock[by * blocksX + bx] = 1;
    }
  }
  const nearPark = (x: number, y: number) => {
    const bx = Math.floor(x / se);
    const by = Math.floor(y / se);
    for (let dy = -1; dy <= 0; dy++)
      for (let dx = -1; dx <= 0; dx++) {
        const cx = x % se === 0 ? bx + dx : bx;
        const cy = y % se === 0 ? by + dy : by;
        if (cx >= 0 && cy >= 0 && cx < blocksX && cy < blocksY && parkBlock[cy * blocksX + cx]) return true;
      }
    return false;
  };

  // Wealth and customers on every street tile.
  const field = noise2d(rng, w, h, 28);
  const centres = Array.from({ length: cfg.downtowns }, () => ({
    x: rng.range(15, w - 15),
    y: rng.range(12, h - 12),
    r: rng.range(7, 13),
    peak: rng.range(1.5, 3),
  }));
  const index = new Int32Array(n).fill(-1);
  const xs: number[] = [];
  const ys: number[] = [];
  const demand: number[] = [];
  const wealth: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = tile[i];
      if (t !== Tile.Street && t !== Tile.Bridge) continue;
      const riverDist = Math.abs(y - riverY[x]) - riverHalf[x];
      let v = field[i];
      if (riverDist < 5) v += 0.25 * (1 - Math.max(0, riverDist) / 5);
      if (nearPark(x, y)) v += 0.2;
      const level = v < 0.38 ? Wealth.Budget : v < 0.6 ? Wealth.Middle : v < 0.8 ? Wealth.Upscale : Wealth.Luxury;
      let density = 1;
      for (const c of centres) {
        const dist2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
        density += c.peak * exp(-dist2 / (2 * c.r * c.r));
      }
      const base = t === Tile.Bridge ? 0.3 : cfg.customersPerStreet * density * CONFIG.wealth[level].density;
      index[i] = xs.length;
      xs.push(x * METRES_PER_TILE);
      ys.push((h - y) * METRES_PER_TILE);
      demand.push(Math.round(base * 4) / 4);
      wealth.push(level);
    }
  }

  // Adjacency between street tiles.
  const adjStart = [0];
  const adj: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (index[y * w + x] < 0) continue;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && index[ny * w + nx] >= 0) adj.push(index[ny * w + nx]);
      }
      adjStart.push(adj.length);
    }
  }
  const d = Float32Array.from(demand);
  const wl = Uint8Array.from(wealth);
  return {
    size: xs.length,
    adjStart: Int32Array.from(adjStart),
    adj: Int32Array.from(adj),
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    demand: d,
    wealth: wl,
    spend: withSpend(d, wl),
  };
}
