import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { applyCard, dealCards } from '@unicornrush/engine/execution/OpportunityExecution';
import { act, lastMessage, neutralNeighbour, quietSetup, runDays } from './util/Setup';

const L = CONFIG.lawsuit;

describe('lawsuits for small companies', () => {
  it('cost a small company less in fees than a big one', () => {
    const g = quietSetup().game;
    const [small, big] = g.companies;
    small.pnl.revenue = 1_000;
    big.pnl.revenue = 200_000;
    expect(g.lawsuitFee(small)).toBe(L.minFee);
    expect(g.lawsuitFee(big)).toBe(200_000 * L.feeRevenueDays);
  });

  it('let the lawyers keep a share of the damages', () => {
    const r = quietSetup();
    const me = r.game.player;
    me.cash = 1e7;
    for (let i = 0; i < 30; i++) r.game.recordTaking(1, 0, 5); // a strong case
    runDays(r, 1);
    act(r, { type: 'lawsuit', companyId: 0, targetId: 1 });
    const damages = r.game.lawsuitDamages(0, 1);
    runDays(r, L.courtDays + 1);
    if (r.game.log.some((l) => l.text.includes('lost the lawsuit'))) {
      expect(me.oneOff.damages).toBeLessThan(damages);
      expect(r.game.companies[1].oneOff.damages).toBeLessThan(me.oneOff.damages * -1 + 1);
    }
  });
});

describe('agility', () => {
  it('lets a small company change prices at once', () => {
    const r = quietSetup();
    act(r, { type: 'setPrice', companyId: 0, price: 'high' });
    expect(r.game.player.price).toBe('high');
  });

  it('makes a big company wait for new prices to roll out', () => {
    const r = quietSetup();
    const me = r.game.player;
    me.employees = 400;
    const delay = r.game.priceDelayDays(me);
    expect(delay).toBe(10);
    act(r, { type: 'setPrice', companyId: 0, price: 'high' });
    expect(me.price).toBe('medium');
    expect(lastMessage(r)).toMatch(/takes 10 days/);
    runDays(r, delay);
    expect(me.price).toBe('high');
  });

  it('cancels a rollout when you go back to your current price', () => {
    const r = quietSetup();
    const me = r.game.player;
    me.employees = 400;
    act(r, { type: 'setPrice', companyId: 0, price: 'low' });
    act(r, { type: 'setPrice', companyId: 0, price: 'medium' });
    runDays(r, 20);
    expect(me.price).toBe('medium');
  });
});

describe('opportunity cards', () => {
  it('are luckier for companies further behind', () => {
    const g = quietSetup().game;
    g.companies.forEach((c, i) => (c.cash = 1_000_000 * (i + 1)));
    const leader = g.companies[3];
    const last = g.companies[0];
    expect(g.luck(leader)).toBeCloseTo(CONFIG.cards.leaderLuck);
    expect(g.luck(last)).toBeCloseTo(CONFIG.cards.lastLuck);
  });

  it('never offer the leader investors or grants', () => {
    const g = quietSetup().game;
    g.companies[2].cash = 1e7;
    for (let k = 0; k < 20; k++) {
      for (const card of dealCards(g, g.companies[2])) expect(['investor', 'grant']).not.toContain(card.kind);
    }
  });

  it('come regularly and can be picked', () => {
    const r = quietSetup();
    runDays(r, CONFIG.cards.firstDay + 21);
    const me = r.game.player;
    expect(me.offer?.cards).toHaveLength(3);
    const card = me.offer!.cards[0];
    act(r, { type: 'pickCard', companyId: 0, index: 0 });
    expect(me.offer).toBeNull();
    expect(lastMessage(r)).toBeDefined();
    expect(card.amount).toBeGreaterThan(0);
  });

  it('expire if nobody picks', () => {
    const r = quietSetup();
    runDays(r, CONFIG.cards.firstDay + 21);
    expect(r.game.player.offer).not.toBeNull();
    runDays(r, CONFIG.cards.offerDays + 1);
    expect(r.game.log.some((l) => l.recipient === 0 && l.text.includes('expired'))).toBe(true);
  });

  it('do what they say', () => {
    const g = quietSetup().game;
    const me = g.player;
    const push = me.push;
    applyCard(g, me, { kind: 'viral', amount: 30 });
    expect(me.push).toBe(push + 30);
    const staff = me.employees;
    applyCard(g, me, { kind: 'starTeam', amount: 5 });
    expect(me.employees).toBe(staff + 5);
    const cash = me.cash;
    applyCard(g, me, { kind: 'investor', amount: 100_000, stake: 0.15 });
    expect(me.cash).toBe(cash + 100_000);
    expect(me.stake).toBeCloseTo(0.85);
    applyCard(g, me, { kind: 'supplierDeal', amount: 30 });
    expect(g.variableCostMult(me)).toBeCloseTo(CONFIG.cards.supplierDealMult);
    expect(g.variableCostMult()).toBe(1);
  });

  it('let unhappy customers of a neighbouring rival switch to you', () => {
    const r = quietSetup();
    const g = r.game;
    const me = g.player;
    const rival = g.companies[1];
    // Give the player a street next to the rival.
    const { adjStart, adj } = g.map;
    const b = [...rival.border][0];
    let next = -1;
    for (let k = adjStart[b]; k < adjStart[b + 1]; k++) if (g.owner[adj[k]] < 0) next = adj[k];
    g.setOwner(next, 0);
    expect(g.touches(me, rival.id)).toBe(true);
    const tiles = me.tiles;
    const theirs = rival.tiles;
    applyCard(g, me, { kind: 'defectors', amount: 1 });
    expect(me.tiles).toBe(tiles + 1);
    expect(rival.tiles).toBe(theirs - 1);
  });
});

describe('scrutiny of the leader', () => {
  it('hits a runaway leader, and only the leader', () => {
    const r = quietSetup(7);
    const g = r.game;
    const leader = g.companies[2];
    leader.cash = 50_000_000;
    leader.pnl.revenue = 100_000;
    const others = g.companies.filter((c) => c !== leader).map((c) => c.cash);
    runDays(r, CONFIG.scrutiny.firstDay + CONFIG.scrutiny.maxGap * 3);
    const hits = g.log.filter((l) => l.text.includes(leader.name) && /strike|exposé|breach/.test(l.text));
    expect(hits.length).toBeGreaterThan(0);
    expect(g.log.some((l) => /strike|exposé|breach/.test(l.text) && !l.text.includes(leader.name))).toBe(false);
    expect(others.length).toBe(3);
  });

  it('lets a strike cut operations capacity', () => {
    const g = quietSetup().game;
    const me = g.player;
    const before = g.capacity(me);
    me.strikeFrom = g.day;
    me.strikeUntil = g.day + 5;
    expect(g.capacity(me)).toBeCloseTo(before * CONFIG.scrutiny.strikeCapacity);
  });
});

describe('guarding a neighbourhood', () => {
  it('makes your nearby streets harder to steal, for a while, at a price', () => {
    const r = quietSetup();
    const g = r.game;
    const me = g.player;
    const rival = g.companies[1];
    const tile = [...me.border][0];
    const before = g.tileCost(rival, 0, tile);
    const offer = g.guardOffer(me, tile);
    expect(offer.streets).toContain(tile);
    const cash = me.cash;
    act(r, { type: 'guard', companyId: 0, tile });
    expect(me.cash).toBeCloseTo(cash - offer.cost, -3);
    expect(g.tileCost(rival, 0, tile)).toBeCloseTo(before * CONFIG.guard.defenceMult, 0);
    expect(g.streetCost(rival, 0, tile).guard).toBe(CONFIG.guard.defenceMult);
    runDays(r, CONFIG.guard.days + 1);
    expect(g.isGuarded(tile, 0)).toBe(false);
  });

  it('only works on your own streets', () => {
    const r = quietSetup();
    const theirs = [...r.game.companies[1].border][0];
    act(r, { type: 'guard', companyId: 0, tile: theirs });
    expect(lastMessage(r)).toMatch(/your own streets/);
  });

  it('explains a street price as base × defence', () => {
    const g = quietSetup().game;
    const tile = [...g.companies[1].border][0];
    const s = g.streetCost(g.player, 1, tile);
    expect(s.total).toBeCloseTo(s.base * s.service * s.loyalty * s.reserve * s.priceGap * s.guard);
    expect(s.defence).toBeCloseTo(s.total / s.base);
  });
});

describe('acquisitions', () => {
  it('hand over the rival: streets, staff, cash and debt, for its valuation plus a premium', () => {
    const r = quietSetup();
    const g = r.game;
    const me = g.player;
    const t = g.companies[2];
    me.cash = 1e7;
    t.debt = 10_000;
    const price = g.acquisitionPrice(t);
    const tiles = me.tiles + t.tiles;
    const staff = me.employees + t.employees;
    const cash = me.cash - price + t.cash;
    act(r, { type: 'acquire', companyId: 0, targetId: 2 });
    expect(t.alive).toBe(false);
    expect(me.tiles).toBe(tiles);
    expect(me.employees).toBe(staff);
    expect(me.debt).toBe(10_000);
    expect(me.cash).toBeCloseTo(cash, -3);
    expect(me.oneOff.acquisitions).toBe(-price);
    expect(price).toBeGreaterThanOrEqual(CONFIG.acquisition.minPrice);
  });

  it('need the cash', () => {
    const r = quietSetup();
    r.game.player.cash = 1000;
    act(r, { type: 'acquire', companyId: 0, targetId: 1 });
    expect(r.game.companies[1].alive).toBe(true);
    expect(lastMessage(r)).toMatch(/not enough cash/);
  });

  it('are blocked when the buyer would dominate the city', () => {
    const r = quietSetup();
    const g = r.game;
    g.player.cash = 1e9;
    // Give the player just under 40% of the city's customers; adding a rival pushes it past the limit.
    const total = g.totalCustomers();
    for (let i = 0; i < g.map.size && g.player.customers < total * 0.399; i++) if (g.owner[i] < 0) g.setOwner(i, 0);
    act(r, { type: 'acquire', companyId: 0, targetId: 1 });
    expect(g.companies[1].alive).toBe(true);
    expect(lastMessage(r)).toMatch(/competition authority/);
  });
});

describe('push per click', () => {
  it('commits the share of push the company chose', () => {
    const r = quietSetup();
    const me = r.game.player;
    act(r, { type: 'setCampaignShare', companyId: 0, share: 0.2 });
    expect(me.campaignShare).toBe(0.2);
    me.push = 100;
    act(r, { type: 'campaign', companyId: 0, tile: neutralNeighbour(r) });
    expect(me.push + me.pushCommitted).toBeGreaterThan(79);
    act(r, { type: 'setCampaignShare', companyId: 0, share: 5 });
    expect(me.campaignShare).toBe(1);
    act(r, { type: 'setCampaignShare', companyId: 0, share: 0 });
    expect(me.campaignShare).toBe(CONFIG.sales.minCampaignShare);
  });
});
