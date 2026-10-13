import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameMap } from '@unicornrush/engine-api/game/GameMap';
import { Wealth } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { generateGridCity, mapFromCity, neighbors } from '@unicornrush/engine-lib/game/GameMap';
import { decodeCity, encodeCity } from '@unicornrush/engine-lib/game/CityCodec';
import { PseudoRandom } from '@unicornrush/engine-lib/PseudoRandom';
import { GameRunner } from '@unicornrush/engine/GameRunner';
import { act, loadCity, quietSetup, runDays } from './util/Setup';

function unreachable(map: GameMap): number {
  const seen = new Uint8Array(map.size);
  const stack = [0];
  seen[0] = 1;
  const nb: number[] = [];
  while (stack.length) {
    for (const n of neighbors(map, stack.pop()!, nb)) if (!seen[n]) (seen[n] = 1), stack.push(n);
  }
  return seen.filter((v) => !v).length;
}

function checkSymmetric(map: GameMap): void {
  const nb: number[] = [];
  const back: number[] = [];
  for (let i = 0; i < map.size; i++) {
    for (const n of neighbors(map, i, nb)) expect(neighbors(map, n, back)).toContain(i);
  }
}

describe('grid city', () => {
  for (const seed of [1, 2, 3]) {
    it(`connects every street through bridges (seed ${seed})`, () => {
      expect(unreachable(generateGridCity(new PseudoRandom(seed)))).toBe(0);
    });
  }

  it('has every wealth level, and richer streets spend more per customer', () => {
    const map = generateGridCity(new PseudoRandom(9));
    expect(new Set(map.wealth)).toEqual(new Set([Wealth.Budget, Wealth.Middle, Wealth.Upscale, Wealth.Luxury]));
    for (let i = 0; i < map.size; i++) expect(map.spend[i]).toBeCloseTo(map.demand[i] * CONFIG.wealth[map.wealth[i]].spend);
    checkSymmetric(map);
  });
});

describe('real city (Paris · Opéra & Monceau)', () => {
  const city = loadCity('paris-opera');
  const map = mapFromCity(city);

  it('is one connected street network with symmetric neighbours', () => {
    expect(map.size).toBeGreaterThan(1000);
    expect(unreachable(map)).toBe(0);
    checkSymmetric(map);
  });

  it('has geometry for every segment and buildings on real segments', () => {
    expect(city.segments.coords).toHaveLength(map.size);
    expect(city.buildings.rings.length).toBe(city.buildings.segment.length);
    for (const s of city.buildings.segment) expect(s).toBeLessThan(map.size);
  });

  it('starts every company with about the same customers', () => {
    const r = new GameRunner(4, defaultCompanies('Tester'), city);
    for (const c of r.game.companies) {
      expect(c.customers).toBeGreaterThan(CONFIG.start.customers * 0.8);
      expect(c.customers).toBeLessThanOrEqual(CONFIG.start.customers * 1.1);
      // Nobody starts overloaded.
      expect(r.game.coverage(c)).toBe(1);
    }
  });

  it('replays identically from the same seed', () => {
    const a = new GameRunner(11, defaultCompanies('Bot', true), city);
    const b = new GameRunner(11, defaultCompanies('Bot', true), city);
    for (let i = 0; i < 2000; i++) {
      a.executeNextTick();
      b.executeNextTick();
    }
    expect(Array.from(a.game.owner)).toEqual(Array.from(b.game.owner));
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
      for (let i = 0; i < g.owner.length; i++) if (g.owner[i] === -1 && g.map.wealth[i] === w) return i;
      return -1;
    };
    const perCustomer = (t: number) => g.tileCost(g.player, -1, t) / g.map.demand[t];
    expect(perCustomer(find(Wealth.Luxury))).toBeGreaterThan(perCustomer(find(Wealth.Budget)));
  });
});

describe('city file format', () => {
  it('round-trips a city: same graph and customers, coordinates within a metre', () => {
    const city = loadCity('geneva');
    const back = decodeCity(JSON.parse(JSON.stringify(encodeCity(city))));
    expect(back.segments.adj).toEqual(city.segments.adj);
    expect(back.segments.adjStart).toEqual(city.segments.adjStart);
    expect(back.segments.names).toEqual(city.segments.names);
    expect(back.segments.customers).toEqual(city.segments.customers);
    expect(back.segments.wealth).toEqual(city.segments.wealth);
    expect(back.buildings.segment).toEqual(city.buildings.segment);
    const a = city.segments.coords[100];
    const b = back.segments.coords[100];
    expect(b).toHaveLength(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(a[i][0] - b[i][0])).toBeLessThan(2e-5);
      expect(Math.abs(a[i][1] - b[i][1])).toBeLessThan(2e-5);
    }
  });
});

describe('city list', () => {
  it('lists every built city once, each with a thumbnail and a valid map', () => {
    const dir = join(__dirname, '..', 'public', 'cities');
    const index: { id: string; mix: number[] }[] = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    const built = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.replace('.json', ''));
    expect(index.map((c) => c.id).sort()).toEqual(built.sort());
    for (const c of index) {
      expect(existsSync(join(dir, 'thumbs', `${c.id}.svg`))).toBe(true);
      expect(c.mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 1);
      const map = mapFromCity(loadCity(c.id));
      expect(unreachable(map)).toBe(0);
    }
  });
});
