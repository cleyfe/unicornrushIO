import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { defaultCompanies, MAX_RIVALS } from '@unicornrush/engine-lib/configuration/Companies';
import { GameRunner } from '@unicornrush/engine/GameRunner';
import { loadCity, runDays } from './util/Setup';

describe('big matches', () => {
  it('can have up to MAX_RIVALS rivals, each with its own name and colour', () => {
    const specs = defaultCompanies('Me', false, 'normal', 99);
    expect(specs).toHaveLength(MAX_RIVALS + 1);
    expect(new Set(specs.map((s) => s.name)).size).toBe(specs.length);
    expect(new Set(specs.map((s) => s.color.join(','))).size).toBe(specs.length);
  });

  it('starts 20 companies apart, each with about the same customers, and plays on', () => {
    const r = new GameRunner(3, defaultCompanies('Me', true, 'normal', 19), loadCity('geneva'));
    const g = r.game;
    expect(g.companies).toHaveLength(20);
    for (const c of g.companies) {
      expect(c.tiles).toBeGreaterThan(0);
      expect(c.customers).toBeGreaterThan(CONFIG.start.customers * 0.6);
    }
    runDays(r, 60);
    expect(g.companies.filter((c) => c.alive).length).toBeGreaterThan(15);
  });
});
