import { describe, expect, it } from 'vitest';
import { Terrain } from '@unicornrush/engine-api/game/GameMap';
import { generateMap, neighbors4 } from '@unicornrush/engine-lib/game/GameMap';
import { PseudoRandom } from '@unicornrush/engine-lib/PseudoRandom';

describe('city map', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`connects every building through bridges (seed ${seed})`, () => {
      const map = generateMap(new PseudoRandom(seed));
      const land = [...map.isWater.keys()].filter((i) => !map.isWater[i]);
      const seen = new Uint8Array(map.isWater.length);
      const queue = [land[0]];
      seen[land[0]] = 1;
      const nb: number[] = [];
      while (queue.length) {
        for (const n of neighbors4(map, queue.pop()!, nb)) {
          if (!seen[n] && !map.isWater[n]) {
            seen[n] = 1;
            queue.push(n);
          }
        }
      }
      // Parks can enclose a lot or two; anything more means the river cut the city.
      const unreachable = land.filter((i) => !seen[i]).length;
      expect(unreachable).toBeLessThan(land.length * 0.01);
    });
  }

  it('has a river, bridges, parks and downtown towers', () => {
    const map = generateMap(new PseudoRandom(9));
    const count = (t: number) => map.terrain.filter((x) => x === t).length;
    expect(count(Terrain.River)).toBeGreaterThan(200);
    expect(count(Terrain.Bridge)).toBeGreaterThan(10);
    expect(count(Terrain.Park)).toBeGreaterThan(100);
    expect(Math.max(...map.demand)).toBeGreaterThan(2.75);
  });
});
