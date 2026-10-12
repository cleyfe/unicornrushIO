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
