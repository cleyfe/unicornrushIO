import type { Card, CardKind, Company } from '@unicornrush/engine-api/game/Game';
import { CARD_INFO } from '@unicornrush/engine-lib/configuration/Cards';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import { neighbors } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '../game/GameImpl';
import { InstantExecution, type Execution } from './Execution';

const K = CONFIG.cards;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Opportunity cards, like item boxes in a kart race: every so often each
 * company is offered three cards and picks one. Companies further behind get
 * offers more often, and bigger ones, so the race stays open, but a leader
 * who plays well still wins.
 */
export class OpportunityExecution implements Execution {
  private nextDay: number[] = [];
  /** Companies holding an offer, so we notice when they pick or pass. */
  private outstanding = new Set<number>();

  init(game: GameImpl): void {
    this.nextDay = game.companies.map(() => K.firstDay + game.rng.range(0, 20));
  }

  isActive(): boolean {
    return true;
  }

  tick(game: GameImpl): void {
    if (!game.isNewDay()) return;
    for (const c of game.companies) {
      if (!c.alive) continue;
      if (c.offer && game.day >= c.offer.expiresDay) {
        c.offer = null;
        if (!c.isBot) game.message(c.id, 'Your opportunity expired.', 'info');
      }
      if (c.offer) continue;
      if (this.outstanding.delete(c.id)) this.schedule(game, c); // picked, passed or expired
      if (game.day < this.nextDay[c.id]) continue;
      c.offer = { cards: dealCards(game, c), expiresDay: game.day + K.offerDays };
      this.outstanding.add(c.id);
      if (!c.isBot) game.message(c.id, '🎁 An opportunity! Pick one of three cards.', 'good');
    }
  }

  /** The next offer comes sooner for companies further behind. */
  private schedule(game: GameImpl, c: Company): void {
    const behind = (game.luck(c) - K.leaderLuck) / (K.lastLuck - K.leaderLuck); // 0 leader … 1 last
    this.nextDay[c.id] = game.day + game.rng.range(K.minGap, K.maxGap) * (1.25 - 0.5 * behind);
  }
}

/** Three different cards, sized by the company's luck (its rank). */
export function dealCards(game: GameImpl, c: Company): Card[] {
  const luck = game.luck(c);
  const rank = game.ranking();
  const leader = rank[0];
  const v = game.valuation(c).total;
  const kinds: CardKind[] = ['viral', 'starTeam', 'supplierDeal'];
  if (c !== leader && c.stake > 0.4) kinds.push('investor');
  if (c !== leader && v < game.valuation(leader).total * 0.5) kinds.push('grant');
  if (defectorSource(game, c) !== null) kinds.push('defectors');
  // Shuffle, then keep three.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = game.rng.int(0, i + 1);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.slice(0, 3).map((kind) => makeCard(game, c, kind, luck));
}

function makeCard(game: GameImpl, c: Company, kind: CardKind, luck: number): Card {
  switch (kind) {
    case 'viral':
      return { kind, amount: Math.max(20, Math.round(game.maxPush(c) * K.viralPushShare * luck)) };
    case 'starTeam':
      return { kind, amount: Math.max(3, Math.round(c.employees * K.starTeamShare * luck)) };
    case 'supplierDeal':
      return { kind, amount: Math.round(K.supplierDealDays * luck) };
    case 'investor':
      return { kind, amount: Math.round(clamp(game.valuation(c).total * K.investorValuationShare, K.investorMin, K.investorMax) * luck), stake: K.investorStake };
    case 'grant':
      return { kind, amount: Math.round(clamp(c.pnl.revenue * K.grantRevenueDays, K.grantMin, K.grantMax) * luck) };
    case 'defectors':
      return { kind, amount: Math.max(1, Math.round(K.defectorStreets * luck)) };
  }
}

/** The rival whose customers would defect to `c`: the most valuable one it borders. */
function defectorSource(game: GameImpl, c: Company): Company | null {
  let best: Company | null = null;
  for (const r of game.companies) {
    if (!r.alive || r.id === c.id || !game.touches(c, r.id)) continue;
    if (!best || game.valuation(r).total > game.valuation(best).total) best = r;
  }
  return best;
}

/** A rough dollar value of a card for company `c`, so bots (and hints) can compare them. */
export function cardValue(c: Company, card: Card): number {
  const S = CONFIG.staff;
  switch (card.kind) {
    case 'viral':
      return card.amount * (CONFIG.sales.adBaseCost / CONFIG.sales.adPush) * 0.5;
    case 'starTeam':
      return card.amount * (S.hireCost + S.salaryPerDay * (S.trainingDays + 20));
    case 'supplierDeal':
      return card.amount * Math.max(0, c.pnl.variableCost) * (1 - K.supplierDealMult);
    case 'investor':
      return card.amount * 0.7; // cash, minus the shares given away
    case 'grant':
      return card.amount;
    case 'defectors':
      return card.amount * (c.tiles > 0 ? Math.max(0, c.pnl.revenue) / c.tiles : 0) * 120;
  }
}

/** Takes one card of the current offer (or passes with index -1). */
export class PickCardExecution extends InstantExecution {
  constructor(
    private companyId: number,
    private index: number,
  ) {
    super();
  }

  protected apply(game: GameImpl): void {
    const c = game.companies[this.companyId];
    if (!c.alive || !c.offer) return;
    const card = c.offer.cards[this.index];
    c.offer = null;
    if (!card) return;
    applyCard(game, c, card);
  }
}

export function applyCard(game: GameImpl, c: Company, card: Card): void {
  const info = CARD_INFO[card.kind];
  const say = (text: string) => (c.isBot ? game.news(`${info.icon} ${c.name}: ${text}`, 'info') : game.message(c.id, `${info.icon} ${text} ${info.lesson}`, 'good'));
  switch (card.kind) {
    case 'viral':
      c.push = Math.min(c.push + card.amount, Math.max(c.push, game.maxPush(c) * CONFIG.sales.maxAdPushMult));
      return say(`a viral review brings ${card.amount} sales push.`);
    case 'starTeam':
      c.employees += card.amount;
      return say(`${card.amount} experienced people joined.`);
    case 'supplierDeal':
      c.supplierDealUntil = Math.max(c.supplierDealUntil, game.day) + card.amount;
      return say(`a supplier deal cuts variable costs for ${card.amount} days.`);
    case 'investor':
      c.cash += card.amount;
      c.stake *= 1 - (card.stake ?? 0);
      return say(`investors put in ${money(card.amount)} for ${pct(card.stake ?? 0)} of the company.`);
    case 'grant':
      c.cash += card.amount;
      return say(`a ${money(card.amount)} small-business grant.`);
    case 'defectors': {
      const from = defectorSource(game, c);
      if (!from) return;
      const won = takeStreets(game, c, from, card.amount);
      if (won > 0) game.message(from.id, `${won} of your streets' unhappy customers switched to ${c.name}.`, 'bad');
      return say(`${won} streets of ${from.name}'s unhappy customers switched over.`);
    }
  }
}

/** Moves up to `n` of `from`'s streets bordering `c` to `c`, richest first. */
function takeStreets(game: GameImpl, c: Company, from: Company, n: number): number {
  const nb: number[] = [];
  const options = new Set<number>();
  for (const b of c.border) for (const t of neighbors(game.map, b, nb)) if (game.owner[t] === from.id) options.add(t);
  const picks = [...options].sort((a, b) => game.map.spend[b] - game.map.spend[a] || a - b).slice(0, n);
  for (const t of picks) game.setOwner(t, c.id);
  return picks.length;
}
