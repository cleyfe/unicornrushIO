import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { act, quietSetup, runDays } from './util/Setup';

/** A passive match where company 1 has a big sales team worth poaching. */
function setupWithBigRival() {
  const r = quietSetup();
  const g = r.game;
  const [me, rival, other] = g.companies;
  me.cash = 1_000_000;
  other.cash = 1_000_000;
  rival.employees = 400;
  rival.salesShare = 0.5; // 200 in sales, 200 in ops
  rival.push = 0;
  rival.cash = 1e8; // 400 salaries on a tiny business: keep it afloat while the test waits
  return { r, g, me, rival, other };
}

describe('poaching', () => {
  it("moves part of a rival's sales team to you, trained, with its push", () => {
    const { r, g, me, rival } = setupWithBigRival();
    rival.push = 100;
    const offer = g.poachOffer(me, rival);
    expect(offer.blocked).toBe('');
    expect(offer.people).toBeGreaterThan(0);
    const mySales = g.salesStaff(me);
    const rivalOps = g.opsStaff(rival);
    act(r, { type: 'poach', companyId: me.id, targetId: rival.id });
    expect(g.salesStaff(me)).toBe(mySales + offer.people);
    expect(g.opsStaff(rival)).toBe(rivalOps); // only Sales walks out
    expect(g.salesStaff(rival)).toBe(200 - offer.people);
    expect(rival.push).toBeLessThan(100);
    expect(me.oneOff.poaching).toBe(-offer.cost);
  });

  it('takes fewer people from a well-defended company', () => {
    const { g, me, rival } = setupWithBigRival();
    const open = g.poachOffer(me, rival).people;
    rival.push = 1e6; // a big push reserve doubles its defence
    expect(g.poachOffer(me, rival).people).toBeLessThan(open);
  });

  it('has a cooldown for the poacher and a breather for the target', () => {
    const { r, g, me, rival, other } = setupWithBigRival();
    act(r, { type: 'poach', companyId: me.id, targetId: rival.id });
    expect(g.poachOffer(me, rival).blocked).toMatch(/busy/);
    expect(g.poachOffer(other, rival).blocked).toMatch(/retention/);
    runDays(r, CONFIG.poach.immunityDays + 1);
    expect(g.poachOffer(other, rival).blocked).toBe('');
    runDays(r, CONFIG.poach.cooldownDays);
    expect(g.poachWait(me)).toBe(0);
  });

  it('refuses when you can’t pay', () => {
    const { r, g, me, rival } = setupWithBigRival();
    me.cash = 10;
    const before = g.salesStaff(rival);
    act(r, { type: 'poach', companyId: me.id, targetId: rival.id });
    expect(g.salesStaff(rival)).toBe(before);
  });
});
