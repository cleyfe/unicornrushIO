import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { act, lastMessage, quietSetup, runDays } from './util/Setup';

const L = CONFIG.lawsuit;

function suingSetup(seed = 42) {
  const r = quietSetup(seed);
  const me = r.game.player;
  me.cash = 1e7;
  act(r, { type: 'build', companyId: 0, building: 'legalDept' });
  return r;
}

describe('lawsuits', () => {
  it('need a Legal Dept to file', () => {
    const r = quietSetup();
    r.game.player.cash = 1e7;
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    expect(r.game.lawsuits).toHaveLength(0);
    expect(lastMessage(r)).toMatch(/Legal Dept/);
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

  it('cost an undefended defendant customers all over its territory, plus damages', () => {
    const r = suingSetup();
    const d = r.game.companies[1];
    runDays(r, 5);
    const tiles = d.tiles;
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    runDays(r, L.courtDays + 1);
    expect(r.game.lawsuits).toHaveLength(0);
    expect(d.tiles).toBeLessThanOrEqual(Math.ceil(tiles * (1 - L.customerLoss)) + 1);
    expect(r.game.log.some((l) => l.text.includes('lost the lawsuit'))).toBe(true);
  });

  it('can be dismissed by the defendant’s legal team', () => {
    // With two Legal Depts the dismissal chance is 1 − 0.65² ≈ 58%; across
    // seeds both outcomes must occur.
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const r = suingSetup(seed);
      const d = r.game.companies[1];
      d.cash = 1e7;
      d.buildings.legalDept = 2;
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
