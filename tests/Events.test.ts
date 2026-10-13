import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { quietSetup, runDays } from './util/Setup';

describe('market events', () => {
  it('are forecast before they start', () => {
    const r = quietSetup();
    const E = CONFIG.events;
    runDays(r, E.firstDay - E.warningDays + 1);
    expect(r.game.forecasts).toHaveLength(1);
    expect(r.game.events).toHaveLength(0);
    expect(r.game.log.some((l) => l.text.startsWith('🔮'))).toBe(true);
    const kind = r.game.forecasts[0].kind;
    runDays(r, E.warningDays);
    expect(r.game.forecasts).toHaveLength(0);
    expect(r.game.events.map((e) => e.kind)).toEqual([kind]);
  });
});

describe('local events', () => {
  it('are announced, change the area, and keep owners totals right', () => {
    const r = quietSetup(3);
    const g = r.game;
    const E = CONFIG.localEvents;
    runDays(r, E.firstDay + 1);
    expect(g.localEvents).toHaveLength(1);
    const e = g.localEvents[0];
    expect(e.active).toBe(false);
    expect(e.streets.length).toBeGreaterThan(0);
    const spendBefore = e.streets.reduce((s, t) => s + g.map.spend[t], 0);
    runDays(r, E.warningDays);
    expect(e.active).toBe(true);
    const spendDuring = e.streets.reduce((s, t) => s + g.map.spend[t], 0);
    const fx = E[e.kind];
    expect(spendDuring).toBeCloseTo(spendBefore * fx.demand * fx.spend, 0);
    // Every company's totals still match its streets.
    for (const c of g.companies) {
      let spend = 0;
      for (let t = 0; t < g.map.size; t++) if (g.owner[t] === c.id) spend += g.map.spend[t];
      expect(c.spend).toBeCloseTo(spend, 1);
    }
  });

  it('undo temporary changes when they end', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = quietSetup(seed);
      const g = r.game;
      const E = CONFIG.localEvents;
      runDays(r, E.firstDay + 1);
      const e = g.localEvents[0];
      if (e.endsDay === null) continue;
      const before = e.streets.map((t) => g.map.spend[t]);
      runDays(r, e.endsDay - g.day + 1);
      e.streets.forEach((t, i) => expect(g.map.spend[t]).toBeCloseTo(before[i], 3));
      return;
    }
    throw new Error('no temporary event found');
  });
});
