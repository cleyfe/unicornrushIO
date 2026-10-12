import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { act, lastMessage, quietSetup, runDays } from './util/Setup';

const L = CONFIG.lawsuit;

function suingSetup(seed = 42, stolenStreets = 0) {
  const r = quietSetup(seed);
  const me = r.game.player;
  me.cash = 1e7;
  // Evidence: rival 1 took this many of our streets (each worth 5 in spend).
  for (let i = 0; i < stolenStreets; i++) r.game.recordTaking(1, 0, 5);
  return r;
}

describe('lawsuits', () => {
  it('need enough cash for the legal fees', () => {
    const r = quietSetup();
    r.game.player.cash = L.cost - 1;
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    expect(r.game.lawsuits).toHaveLength(0);
    expect(lastMessage(r)).toMatch(/Legal fees/);
  });

  it('charge legal fees and go to court', () => {
    const r = suingSetup();
    const cash = r.game.player.cash;
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    expect(r.game.lawsuits).toHaveLength(1);
    expect(r.game.player.cash).toBeCloseTo(cash - L.cost, -3);
  });

  it('allow only one case at a time per plaintiff', () => {
    const r = suingSetup();
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    act(r, { type: 'lawsuit', companyId: 0, targetId: 2 });
    expect(r.game.lawsuits).toHaveLength(1);
    expect(lastMessage(r)).toMatch(/busy/);
  });

  it('cost a losing defendant customers all over its territory, plus damages', () => {
    const r = suingSetup(42, 30); // strong case: 85% chance
    const d = r.game.companies[1];
    runDays(r, 5);
    const tiles = d.tiles;
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    runDays(r, L.courtDays + 1);
    expect(r.game.lawsuits).toHaveLength(0);
    expect(d.tiles).toBeLessThanOrEqual(Math.ceil(tiles * (1 - L.customerLoss)) + 1);
    expect(r.game.log.some((l) => l.text.includes('lost the lawsuit'))).toBe(true);
    expect(r.game.player.oneOff.damages).toBeGreaterThan(0);
  });

  it('are decided by evidence: more streets taken, better odds', () => {
    const g = suingSetup(42).game;
    const none = g.lawsuitWinChance(0, 1);
    for (let i = 0; i < 10; i++) g.recordTaking(1, 0, 5);
    const some = g.lawsuitWinChance(0, 1);
    expect(none).toBeLessThan(0.25);
    expect(some).toBeGreaterThan(none + 0.3);
    expect(g.lawsuitWinChance(0, 2)).toBe(L.baseWinChance); // rival 2 took nothing and doesn't price low
  });

  it('award the plaintiff its lost profits on the stolen streets', () => {
    const g = suingSetup(42, 4).game;
    const perDay = 4 * 5 * (CONFIG.prices.medium.revenue - CONFIG.variableCostPerCustomer);
    expect(g.lawsuitDamages(0, 1)).toBeCloseTo(perDay * L.damagesDays);
  });

  it('let old grievances fade', () => {
    const r = suingSetup(42, 10);
    const before = r.game.streetsTaken(1, 0);
    runDays(r, L.evidenceHalfLifeDays);
    expect(r.game.streetsTaken(1, 0)).toBeCloseTo(before / 2, 0);
  });

  it('are sometimes dismissed by the court', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const r = suingSetup(seed, 8); // a middling case
      act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
      runDays(r, L.courtDays + 1);
      outcomes.add(r.game.log.some((l) => l.text.includes('dismissed')) ? 'dismissed' : 'lost');
    }
    expect(outcomes).toEqual(new Set(['dismissed', 'lost']));
  });

  it('end when a party closes', () => {
    const r = suingSetup();
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    r.game.closeCompany(r.game.companies[1], 'ran out of cash');
    runDays(r, 1);
    expect(r.game.lawsuits).toHaveLength(0);
  });
});
