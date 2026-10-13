import { describe, expect, it } from 'vitest';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { GameRunner } from '@unicornrush/engine/GameRunner';
import { loadCity } from './util/Setup';

/** Streets the bots take from a plain human player (serves customers, expands cheaply, hires) over the first days of an Easy match. */
function streetsLost(seed: number, days: number): number {
  const r = new GameRunner(seed, defaultCompanies('Me', false, 'easy'), loadCity('paris-opera'));
  const g = r.game;
  const prev = Array.from(g.owner);
  let lost = 0;
  for (let t = 0; t < days * CONFIG.ticksPerDay && !g.result; t++) {
    if (g.tick % CONFIG.ticksPerDay === 0) {
      const me = g.player;
      const ops = Math.ceil((me.customers * 1.05) / CONFIG.staff.customersPerOps);
      r.addIntent({ type: 'setSalesShare', companyId: 0, share: Math.max(0, Math.min(0.95, 1 - ops / Math.max(1, me.employees))) });
      if (Math.floor(g.day) % 5 === 0) {
        // The cheapest street next door, rival or not.
        let tile = -1;
        let best = Infinity;
        for (const b of me.border)
          for (let k = g.map.adjStart[b]; k < g.map.adjStart[b + 1]; k++) {
            const t = g.map.adj[k];
            if (g.owner[t] === 0) continue;
            const cost = g.tileCost(me, g.owner[t], t);
            if (cost < best) (best = cost), (tile = t);
          }
        if (tile >= 0) r.addIntent({ type: 'campaign', companyId: 0, tile });
        if (Math.floor(g.day) % 10 === 0 && me.cash > 20000) r.addIntent({ type: 'hire', companyId: 0, count: 3 });
      }
    }
    r.executeNextTick();
    if (g.tick % CONFIG.ticksPerDay !== 0) continue;
    for (let i = 0; i < g.map.size; i++) {
      if (prev[i] === 0 && g.owner[i] > 0) lost++;
      prev[i] = g.owner[i];
    }
  }
  return lost;
}

/** Contact between bots and the player depends a lot on the spawns, so sum a few matches. */
const lostOverMatches = () => [304, 305, 306, 307].reduce((sum, seed) => sum + streetsLost(seed, 600), 0);

describe('easy bots', () => {
  it("mostly leave the human player's streets alone", () => {
    const easy = CONFIG.difficulty.easy as { humanCostMult: number };
    const mult = easy.humanCostMult;
    const gentle = lostOverMatches();
    easy.humanCostMult = 1;
    const rough = lostOverMatches();
    easy.humanCostMult = mult;
    expect(mult).toBeGreaterThan(1);
    expect(rough).toBeGreaterThan(20);
    expect(gentle).toBeLessThan(rough * 0.5);
  });
});
