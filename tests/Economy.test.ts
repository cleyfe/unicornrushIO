import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { act, lastMessage, quietSetup, runDays } from './util/Setup';

describe('profit and loss', () => {
  it('adds daily profit to cash', () => {
    const r = quietSetup();
    const me = r.game.player;
    act(r, { type: 'setSalesShare', companyId: 0, share: 0 }); // no churn, so profit stays constant
    runDays(r, 1);
    const before = me.cash;
    runDays(r, 1);
    const p = me.pnl;
    expect(p.profit).toBeCloseTo(p.revenue - p.variableCost - p.salaries - p.interest);
    expect(me.cash - before).toBeCloseTo(p.profit, 0);
  });

  it('charges salary for trainees who do not work yet', () => {
    const r = quietSetup();
    const me = r.game.player;
    act(r, { type: 'hire', companyId: 0, count: 5 });
    expect(me.trainees).toHaveLength(1);
    runDays(r, 1);
    expect(me.employees).toBe(CONFIG.start.employees);
    expect(me.pnl.salaries).toBe((CONFIG.start.employees + 5) * CONFIG.staff.salaryPerDay);
    runDays(r, CONFIG.staff.trainingDays);
    expect(me.employees).toBe(CONFIG.start.employees + 5);
  });

  it('only serves customers the operations team has capacity for', () => {
    const r = quietSetup();
    act(r, { type: 'setSalesShare', companyId: 0, share: 1 });
    runDays(r, 1);
    expect(r.game.capacity(r.game.player)).toBe(0);
    expect(r.game.player.pnl.revenue).toBe(0);
  });

  it('charges interest on debt', () => {
    const r = quietSetup();
    const me = r.game.player;
    act(r, { type: 'borrow', companyId: 0 });
    expect(me.debt).toBe(CONFIG.bank.loanChunk);
    runDays(r, 1);
    expect(me.pnl.interest).toBeCloseTo((me.debt * CONFIG.bank.interestPerYear) / 365);
  });

  it('rejects hiring without cash', () => {
    const r = quietSetup();
    r.game.player.cash = 100;
    act(r, { type: 'hire', companyId: 0, count: 10 });
    expect(r.game.player.trainees).toHaveLength(0);
    expect(lastMessage(r)).toMatch(/Not enough cash/);
  });
});

describe('valuation', () => {
  it('values a company on profit, not just cash', () => {
    const r = quietSetup();
    const me = r.game.player;
    me.avgProfit = 1000;
    const v = r.game.valuation(me);
    expect(v.earnings).toBe(1000 * 365 * CONFIG.valuation.earningsMultiple);
    expect(v.total).toBeCloseTo(v.cash - v.debt + v.earnings);
  });
});

describe('advertising', () => {
  it('turns cash into sales push', () => {
    const r = quietSetup();
    const me = r.game.player;
    me.cash = 1e6;
    me.push = 0;
    const offer = r.game.adOffer(me);
    act(r, { type: 'advertise', companyId: 0 });
    expect(me.push).toBeGreaterThanOrEqual(offer.push);
    expect(me.cash).toBeCloseTo(1e6 - offer.cost, -3);
    expect(me.oneOff.advertising).toBeCloseTo(-offer.cost);
  });

  it('gets pricier with each purchase, then cools down', () => {
    const r = quietSetup();
    const me = r.game.player;
    me.cash = 1e7;
    me.push = 0;
    const first = r.game.adOffer(me).cost;
    act(r, { type: 'advertise', companyId: 0 });
    me.push = 0;
    const second = r.game.adOffer(me).cost;
    expect(second).toBeGreaterThan(first);
    runDays(r, 60);
    me.push = 0;
    expect(r.game.adOffer(me).cost).toBeLessThan(second);
  });

  it('is refused without cash', () => {
    const r = quietSetup();
    r.game.player.cash = 10;
    act(r, { type: 'advertise', companyId: 0 });
    expect(lastMessage(r)).toMatch(/not enough cash/);
  });
});
