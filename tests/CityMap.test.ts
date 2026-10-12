import { describe, expect, it } from 'vitest';
import { Terrain, Wealth } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { generateMap, nearestStreet, neighbors4 } from '@unicornrush/engine-lib/game/GameMap';
import { PseudoRandom } from '@unicornrush/engine-lib/PseudoRandom';
import { act, quietSetup, runDays } from './util/Setup';

describe('street map', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`connects every street through bridges (seed ${seed})`, () => {
      const map = generateMap(new PseudoRandom(seed));
      const streets = [...map.isWater.keys()].filter((i) => !map.isWater[i]);
      const seen = new Uint8Array(map.isWater.length);
      const queue = [streets[0]];
      seen[streets[0]] = 1;
      const nb: number[] = [];
      while (queue.length) {
        for (const n of neighbors4(map, queue.pop()!, nb)) {
          if (!seen[n] && !map.isWater[n]) {
            seen[n] = 1;
            queue.push(n);
          }
        }
      }
      expect(streets.filter((i) => !seen[i])).toHaveLength(0);
    });
  }

  it('only lets companies own streets and bridges', () => {
    const map = generateMap(new PseudoRandom(9));
    for (let i = 0; i < map.terrain.length; i++) {
      const ownable = map.terrain[i] === Terrain.Street || map.terrain[i] === Terrain.Bridge;
      expect(map.isWater[i] === 0).toBe(ownable);
    }
  });

  it('has every wealth level, and richer streets spend more per customer', () => {
    const map = generateMap(new PseudoRandom(9));
    const levels = new Set<number>();
    for (let i = 0; i < map.terrain.length; i++) {
      if (map.terrain[i] !== Terrain.Street) continue;
      levels.add(map.wealth[i]);
      expect(map.spend[i]).toBeCloseTo(map.demand[i] * CONFIG.wealth[map.wealth[i]].spend);
    }
    expect(levels).toEqual(new Set([Wealth.Budget, Wealth.Middle, Wealth.Upscale, Wealth.Luxury]));
  });

  it('snaps clicks inside a block to the nearest street', () => {
    const map = generateMap(new PseudoRandom(9));
    const se = map.streetEvery;
    const t = nearestStreet(map, se + 1, se + 2); // one tile right of an avenue
    expect(t).toBe((se + 2) * map.width + se);
  });
});

describe('wealth economics', () => {
  it('bases revenue on customer spend and costs on customer count', () => {
    const r = quietSetup();
    const me = r.game.player;
    act(r, { type: 'setSalesShare', companyId: 0, share: 0 }); // serve everyone
    runDays(r, 1);
    const p = me.pnl;
    expect(p.revenue).toBeCloseTo(me.spend * CONFIG.prices[me.price].revenue, 0);
    expect(p.variableCost).toBeCloseTo(me.customers * CONFIG.variableCostPerCustomer, 0);
  });

  it('makes luxury customers cost more push to win than budget ones', () => {
    const r = quietSetup();
    const g = r.game;
    const find = (w: number) => {
      for (let i = 0; i < g.owner.length; i++) if (g.owner[i] === -1 && g.map.wealth[i] === w && g.map.demand[i] > 0) return i;
      return -1;
    };
    const lux = find(Wealth.Luxury);
    const bud = find(Wealth.Budget);
    const perCustomer = (t: number) => g.tileCost(g.player, -1, t) / g.map.demand[t];
    expect(perCustomer(lux)).toBeGreaterThan(perCustomer(bud));
  });
});
