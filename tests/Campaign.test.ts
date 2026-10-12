import { describe, expect, it } from 'vitest';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { neighbors } from '@unicornrush/engine-lib/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { act, lastMessage, neutralNeighbour, quietSetup, runDays } from './util/Setup';

describe('sales campaigns', () => {
  it('win neighbouring untapped customers with sales push', () => {
    const r = quietSetup();
    const me = r.game.player;
    act(r, { type: 'setSalesShare', companyId: 0, share: 0.6 });
    runDays(r, 20);
    const tiles = me.tiles;
    const pushBefore = me.push;
    act(r, { type: 'campaign', companyId: 0, tile: neutralNeighbour(r) });
    expect(me.push).toBeLessThan(pushBefore);
    runDays(r, 2);
    expect(me.tiles).toBeGreaterThan(tiles);
  });

  it('are rejected for markets that are not adjacent', () => {
    const r = quietSetup();
    const far = r.game.companies[3].border.values().next().value!;
    r.game.player.push = 100;
    act(r, { type: 'campaign', companyId: 0, tile: far });
    expect(r.game.player.push).toBeGreaterThanOrEqual(100); // nothing spent
    expect(lastMessage(r)).toMatch(/next to yours/);
  });

  it('find cheap, well-served rivals harder to beat than high-priced ones', () => {
    const r = quietSetup();
    const g = r.game;
    const rival = g.companies[1];
    const tile = rival.border.values().next().value!;
    rival.price = 'low';
    const cheap = g.tileCost(g.player, rival.id, tile);
    rival.price = 'high';
    const pricey = g.tileCost(g.player, rival.id, tile);
    expect(cheap).toBeGreaterThan(pricey);
  });
});

describe('defending customers', () => {
  const rivalTile = (r: ReturnType<typeof quietSetup>) => r.game.companies[1].border.values().next().value!;

  it('makes streets dearer to steal when the defender holds retention push', () => {
    const r = quietSetup();
    const g = r.game;
    const tile = rivalTile(r);
    g.companies[1].push = 0;
    const undefended = g.tileCost(g.player, 1, tile);
    g.companies[1].push = 300;
    expect(g.tileCost(g.player, 1, tile)).toBeGreaterThan(undefended * 1.5);
  });

  it('rewards spare operations staff with more loyal customers', () => {
    const r = quietSetup();
    const g = r.game;
    const def = g.companies[1];
    const tile = rivalTile(r);
    def.salesShare = 0.5;
    const normal = g.tileCost(g.player, 1, tile);
    def.salesShare = 0; // everyone in operations: service level above 1
    expect(g.serviceLevel(def)).toBeGreaterThan(1);
    expect(g.tileCost(g.player, 1, tile)).toBeGreaterThan(normal);
  });

  it('drains the defender’s push as it loses streets', () => {
    const r = quietSetup();
    const g = r.game;
    const me = g.player;
    const def = g.companies[1];
    // Put the rival right next to us by giving it a street on our border.
    const nb: number[] = [];
    let target = -1;
    for (const b of me.border) {
      for (const n of neighbors(g.map, b, nb)) if (g.owner[n] === NEUTRAL) target = n;
      if (target >= 0) break;
    }
    g.setOwner(target, def.id);
    def.push = 200;
    me.push = 1e6;
    me.salesShare = 0.5;
    act(r, { type: 'campaign', companyId: 0, tile: target });
    runDays(r, 1);
    expect(g.owner[target]).toBe(0);
    expect(def.push).toBeLessThan(200);
  });
});

describe('explaining losses', () => {
  it('tells the player which rival stole their streets', () => {
    const r = quietSetup();
    const g = r.game;
    const me = g.player;
    const rival = g.companies[1];
    // Hand the rival one of our border streets' neighbours so we touch, then let it attack us.
    const nb: number[] = [];
    let target = -1;
    for (const b of me.border) {
      for (const n of neighbors(g.map, b, nb)) if (g.owner[n] === NEUTRAL) target = n;
      if (target >= 0) break;
    }
    g.setOwner(target, rival.id);
    me.push = 0;
    rival.push = 120;
    const ours = [...me.border][0];
    act(r, { type: 'campaign', companyId: rival.id, tile: ours });
    runDays(r, 11);
    expect(r.game.log.some((l) => l.recipient === 0 && l.text.includes(`${rival.name} stole`))).toBe(true);
  });

  it('starts every company with enough push for a first expansion', () => {
    const g = quietSetup().game;
    for (const c of g.companies) expect(c.push).toBe(CONFIG.start.push);
  });
});
