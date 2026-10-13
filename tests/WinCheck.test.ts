import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { quietSetup, runDays, setup } from './util/Setup';

describe('ending the game', () => {
  it('closes a company that stays out of cash', () => {
    const r = quietSetup();
    const me = r.game.player;
    me.cash = -1e7;
    runDays(r, CONFIG.bankruptcyGraceDays + 1);
    expect(me.alive).toBe(false);
    expect(me.tiles).toBe(0);
    expect(r.game.result?.reason).toBe('playerBankrupt');
  });

  it('declares the first unicorn the winner', () => {
    const r = quietSetup();
    r.game.player.cash = CONFIG.valuation.unicorn + 1e6;
    r.executeNextTick();
    expect(r.game.result).toMatchObject({ winnerId: 0, reason: 'unicorn' });
  });

  it('keeps a bot-only match going when company 0 closes', () => {
    const r = setup(3, true);
    r.game.companies[0].cash = -1e9;
    runDays(r, CONFIG.bankruptcyGraceDays + 2);
    expect(r.game.companies[0].alive).toBe(false);
    expect(r.game.result?.reason).not.toBe('playerBankrupt');
  });

  it('finishes a bot-only match', () => {
    const r = setup(3, true);
    runDays(r, CONFIG.matchDays + 1);
    expect(r.game.result).not.toBeNull();
  });
});

describe('after a big bill', () => {
  it('the bank covers a profitable company with an overdraft instead of closing it', async () => {
    const { quietSetup, runDays } = await import('./util/Setup');
    const r = quietSetup();
    const me = r.game.player;
    runDays(r, 5);
    me.pnl.revenue = 50_000; // credit limit = 60 days of revenue
    me.cash = -200_000;
    runDays(r, 1);
    expect(me.alive).toBe(true);
    expect(me.cash).toBeGreaterThanOrEqual(0);
    expect(me.debt).toBeGreaterThan(190_000);
  });
});

describe('keep watching', () => {
  it('lets the match play on after the player closes', async () => {
    const { setup, runDays } = await import('./util/Setup');
    const r = setup(5);
    const g = r.game;
    g.closeCompany(g.player, 'ran out of cash');
    runDays(r, 1);
    expect(g.result?.reason).toBe('playerBankrupt');
    expect(g.player.closedWhy).toBe('ran out of cash');
    g.keepWatching();
    runDays(r, 30);
    expect(g.result).toBeNull();
    expect(g.day).toBeGreaterThan(30);
  });
});
