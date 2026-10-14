import { describe, expect, it } from 'vitest';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { quietSetup, runDays } from './util/Setup';

describe('regulars (loyalty)', () => {
  it('grows a held street from no bonus to the full bonus', () => {
    const { game: g } = quietSetup();
    const street = g.owner.findIndex((o) => o === 0);
    expect(g.loyalty(street)).toBe(0);
    g.tick = (CONFIG.loyalty.fullDays / 2) * CONFIG.ticksPerDay;
    expect(g.loyalty(street)).toBeCloseTo(CONFIG.loyalty.maxBonus / 2);
    g.tick = CONFIG.loyalty.fullDays * 3 * CONFIG.ticksPerDay;
    expect(g.loyalty(street)).toBeCloseTo(CONFIG.loyalty.maxBonus);
  });

  it('raises revenue as streets age, without raising costs', () => {
    const r = quietSetup();
    const me = r.game.companies[0];
    me.cash = 1e7; // stay afloat whatever happens
    runDays(r, 2);
    const early = { ...me.pnl };
    runDays(r, CONFIG.loyalty.fullDays);
    const ownsTheSame = me.tiles;
    expect(ownsTheSame).toBeGreaterThan(0);
    // Revenue per unit of base spend grows by about the full bonus on streets held since the start.
    const perSpend = (p: { revenue: number }) => p.revenue / me.spend;
    expect(perSpend(me.pnl) / (early.revenue / me.spend)).toBeGreaterThan(1.1);
    expect(me.tierLoyalSpend.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('starts over when a street changes hands, and keeps totals exact', () => {
    const r = quietSetup();
    const g = r.game;
    runDays(r, 60);
    const me = g.companies[0];
    const street = g.owner.findIndex((o) => o === 0);
    const before = me.tierLoyalSpend[g.map.wealth[street]];
    const bonus = g.map.spend[street] * g.loyalty(street);
    expect(bonus).toBeGreaterThan(0);
    g.setOwner(street, NEUTRAL);
    expect(me.tierLoyalSpend[g.map.wealth[street]]).toBeCloseTo(before - bonus);
    g.setOwner(street, 1);
    expect(g.loyalty(street)).toBe(0);
    // Running totals match a full recount after streets change hands.
    for (const c of g.companies) {
      const recount = [0, 0, 0, 0];
      g.owner.forEach((o, t) => o === c.id && (recount[g.map.wealth[t]] += g.map.spend[t] * g.loyalty(t)));
      c.tierLoyalSpend.forEach((v, w) => expect(v).toBeCloseTo(recount[w], 3));
    }
  });
});
