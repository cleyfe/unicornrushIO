import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { act, lastMessage, quietSetup, runDays } from './util/Setup';

const L = CONFIG.lawsuit;

function suingSetup(seed = 42) {
  const r = quietSetup(seed);
  const me = r.game.player;
  me.cash = 1e7;
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

  it('are sometimes dismissed by the court', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const r = suingSetup(seed);
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
