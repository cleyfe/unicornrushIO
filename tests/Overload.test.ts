import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { act, quietSetup, runDays } from './util/Setup';

describe('overloaded companies', () => {
  it("keep their streets: customers don't leave on their own", () => {
    const r = quietSetup();
    const me = r.game.player;
    me.cash = 1e7;
    act(r, { type: 'setSalesShare', companyId: 0, share: 1 }); // nobody in Ops
    const tiles = me.tiles;
    runDays(r, 30);
    expect(r.game.coverage(me)).toBeLessThan(1);
    expect(me.tiles).toBeGreaterThanOrEqual(tiles);
  });

  it('are much easier to steal from: defence falls with the square of service', () => {
    const r = quietSetup();
    const g = r.game;
    const me = g.player;
    act(r, { type: 'setSalesShare', companyId: 0, share: 0 });
    me.push = 0;
    const served = g.defence(me);
    act(r, { type: 'setSalesShare', companyId: 0, share: 1 });
    const s = g.serviceLevel(me);
    expect(s).toBeLessThan(1);
    expect(g.serviceDefence(me)).toBeCloseTo(Math.max(CONFIG.sales.minServiceDefence, s * s));
    expect(g.defence(me)).toBeLessThan(served * 0.5);
  });
});
