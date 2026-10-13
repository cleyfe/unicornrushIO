import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { neighbors } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '../game/GameImpl';
import type { Execution } from './Execution';

/** An ad campaign's target: any street that isn't ours. */
const ANY = -2;

/**
 * A sales campaign: spends part of the push pool to win the customer areas
 * of one target (the untapped market or a rival), nearest the aim point first.
 *
 * An ad campaign brings its own budget instead: it can be aimed anywhere and
 * wins every kind of street (untapped or a rival's) on the way there.
 */
export class CampaignExecution implements Execution {
  private active = true;
  private target = NEUTRAL;
  private budget = 0;
  private aimX = 0;
  private aimY = 0;
  private nb: number[] = [];

  /** For an ad campaign: the push it brings, and that it takes any street on its way. */
  private adBudget: number | null;

  constructor(
    private companyId: number,
    private tile: number,
    adBudget?: number,
  ) {
    this.adBudget = adBudget ?? null;
  }

  init(game: GameImpl): void {
    const c = game.companies[this.companyId];
    const fail = (msg: string) => {
      game.message(c.id, msg);
      this.active = false;
    };
    if (!c.alive) return fail('Your company is closed.');
    if (this.tile < 0 || this.tile >= game.owner.length) return fail('That is off the map.');
    this.aimX = game.map.x[this.tile];
    this.aimY = game.map.y[this.tile];
    if (this.adBudget !== null) {
      this.target = ANY;
      this.budget = this.adBudget;
      c.pushCommitted += this.budget;
      return;
    }
    const target = game.owner[this.tile];
    if (target === c.id) return fail('Those are already your customers.');
    if (!game.touches(c, target)) return fail('You can only expand into markets next to yours.');
    const budget = c.push * c.campaignShare;
    if (budget < 1) return fail('Not enough sales push yet: put more staff in Sales.');
    c.push -= budget;
    c.pushCommitted += budget;
    this.target = target;
    this.budget = budget;
  }

  isActive(): boolean {
    return this.active;
  }

  tick(game: GameImpl): void {
    const c = game.companies[this.companyId];
    if (!c.alive) {
      this.active = false;
      return;
    }
    if (this.target >= 0 && !game.companies[this.target].alive) this.target = NEUTRAL;
    if (this.advance(game)) {
      // Unspent push goes back to the pool.
      c.push = Math.min(Math.max(game.maxPush(c), c.push), c.push + this.budget);
      c.pushCommitted = Math.max(0, c.pushCommitted - this.budget);
      this.active = false;
    }
  }

  /** Returns true when the campaign is finished. */
  private advance(game: GameImpl): boolean {
    const c = game.companies[this.companyId];
    const { x, y } = game.map;
    const seen = new Set<number>();
    const candidates: { tile: number; score: number }[] = [];
    for (const b of c.border) {
      for (const n of neighbors(game.map, b, this.nb)) {
        const o = game.owner[n];
        if (o === c.id || (this.target !== ANY && o !== this.target) || seen.has(n)) continue;
        seen.add(n);
        const dx = x[n] - this.aimX;
        const dy = y[n] - this.aimY;
        // Nearest the aim first (metres), with a little randomness for an organic front.
        candidates.push({ tile: n, score: Math.sqrt(dx * dx + dy * dy) + game.rng.next() * 60 });
      }
    }
    if (candidates.length === 0) return true;
    candidates.sort((a, b) => a.score - b.score);
    const perTick = Math.max(2, Math.ceil(candidates.length / 12));
    let won = 0;
    for (let i = 0; i < candidates.length && won < perTick; i++) {
      const tile = candidates[i].tile;
      const owner = game.owner[tile];
      const cost = game.tileCost(c, owner, tile);
      if (this.budget < cost) {
        // An ad goes around streets it can't afford; a campaign stops at the first one.
        if (this.target === ANY) continue;
        return true;
      }
      won++;
      this.budget -= cost;
      c.pushCommitted = Math.max(0, c.pushCommitted - cost);
      if (owner >= 0) {
        // The defender's retention effort is spent fighting back.
        const def = game.companies[owner];
        def.push = Math.max(0, def.push - cost * CONFIG.sales.retentionDrain);
        game.recordLoss(owner, c.id);
        game.recordTaking(c.id, owner, game.map.spend[tile]);
      }
      game.setOwner(tile, c.id);
    }
    return won === 0;
  }
}
