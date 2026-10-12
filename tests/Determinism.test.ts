import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { exp } from '@unicornrush/engine-lib/DetMath';
import { runDays, setup } from './util/Setup';

describe('determinism', () => {
  it('replays the same match from the same seed', () => {
    const a = setup(7, true);
    const b = setup(7, true);
    runDays(a, 200);
    runDays(b, 200);
    expect(Array.from(a.game.owner)).toEqual(Array.from(b.game.owner));
    expect(a.game.companies.map((c) => c.cash)).toEqual(b.game.companies.map((c) => c.cash));
  });

  it('gives every company a starting territory', () => {
    const r = setup();
    for (const c of r.game.companies) {
      expect(c.tiles).toBeGreaterThan(10);
      expect(c.cash).toBe(CONFIG.start.cash);
    }
  });

  it('has an exp close to Math.exp', () => {
    for (const x of [0, -0.5, -1, -3, -8]) expect(exp(x)).toBeCloseTo(Math.exp(x), 2);
  });
});
