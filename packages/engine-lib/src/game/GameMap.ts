import { Terrain, type GameMap } from '@unicornrush/engine-api/game/GameMap';
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

/**
 * A city: blocks of buildings separated by streets, a river crossed by
 * bridges, a few parks, and dense downtowns where most customers live.
 */
export function generateMap(rng: PseudoRandom): GameMap {
  const { width: w, height: h, blockSize: bs, downtowns, parkShare, bridgeEveryBlocks } = CONFIG.map;
  const terrain = new Uint8Array(w * h);
  const demand = new Float32Array(w * h);
  const isWater = new Uint8Array(w * h);

  // River: meanders across the city, 3–4 tiles wide.
  const centre = noise1d(rng, w, 40);
  const width = noise1d(rng, w, 25);
  const riverMid = rng.range(0.35, 0.65) * h;
  const bridgeOffset = rng.int(0, bridgeEveryBlocks);
  for (let x = 0; x < w; x++) {
    const cy = riverMid + (centre[x] - 0.5) * h * 0.45;
    const half = 1.5 + width[x];
    const block = Math.floor(x / bs);
    const isBridge = block % bridgeEveryBlocks === bridgeOffset && x % bs >= 1 && x % bs <= 2;
    for (let y = Math.floor(cy - half); y <= Math.ceil(cy + half); y++) {
      if (y < 0 || y >= h) continue;
      terrain[y * w + x] = isBridge ? Terrain.Bridge : Terrain.River;
    }
  }

  // Parks: whole blocks away from the river.
  for (let by = 0; by < h / bs; by++) {
    for (let bx = 0; bx < w / bs; bx++) {
      if (!rng.chance(parkShare)) continue;
      let dry = true;
      for (let y = by * bs; y < (by + 1) * bs; y++)
        for (let x = bx * bs; x < (bx + 1) * bs; x++) if (terrain[y * w + x] !== Terrain.Lot) dry = false;
      if (!dry) continue;
      for (let y = by * bs; y < (by + 1) * bs; y++)
        for (let x = bx * bs; x < (bx + 1) * bs; x++) terrain[y * w + x] = Terrain.Park;
    }
  }

  // Customers: suburbs everywhere, towers downtown.
  const centres = Array.from({ length: downtowns }, () => ({
    x: rng.range(12, w - 12),
    y: rng.range(10, h - 10),
    r: rng.range(6, 12),
    peak: rng.range(2, 4),
  }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = terrain[i];
      if (t === Terrain.River || t === Terrain.Park) {
        isWater[i] = 1;
        continue;
      }
      if (t === Terrain.Bridge) {
        demand[i] = 0.25;
        continue;
      }
      let d = 1;
      for (const c of centres) {
        const dist2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
        d += c.peak * exp(-dist2 / (2 * c.r * c.r));
      }
      demand[i] = Math.round(d * 4) / 4;
    }
  }
  return { width: w, height: h, blockSize: bs, demand, terrain, isWater };
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

/** What a lot looks like, from how many customers it has. */
export function buildingKind(demand: number): 'house' | 'shop' | 'tower' {
  return demand < 1.75 ? 'house' : demand < 2.75 ? 'shop' : 'tower';
}
