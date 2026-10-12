// Controlled experiments to find where an advantage comes from.
// Usage: npm run fairness -- [matches per experiment] [city id, e.g. paris-opera]
import { readFileSync } from 'node:fs';
import type { CityData } from '@unicornrush/engine-api/game/City';
import type { CompanySpec, Personality, PriceLevel } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { GameRunner } from '@unicornrush/engine/GameRunner';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';

const N = Number(process.argv[2] ?? 24);
const cityId = process.argv[3];
const city: CityData | undefined = cityId ? JSON.parse(readFileSync(`public/cities/${cityId}.json`, 'utf8')) : undefined;
console.log(`Map: ${city ? city.name : 'synthetic grid city'}`);
const COLORS: [number, number, number][] = [[52, 152, 219], [231, 76, 60], [46, 204, 113], [155, 89, 182]];

interface Outcome {
  winner: number | null;
  reason: string;
  day: number;
  closed: number[];
}

function play(seed: number, specs: CompanySpec[]): Outcome {
  const r = new GameRunner(seed, specs, city);
  const g = r.game;
  while (!g.result) r.executeNextTick();
  return {
    winner: g.result.winnerId,
    reason: g.result.reason,
    day: Math.round(g.result.day),
    closed: g.companies.filter((c) => !c.alive).map((c) => c.id),
  };
}

/** Runs N matches, rotating which seat gets which setup, and tallies wins by setup label. */
function experiment(title: string, setups: { label: string; personality: Personality; price: PriceLevel }[]): void {
  const wins: Record<string, number> = {};
  const closes: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  let days = 0;
  for (let m = 0; m < N; m++) {
    const rot = m % setups.length;
    const seats = setups.map((_, i) => setups[(i + rot) % setups.length]);
    const specs = seats.map((s, i) => ({ name: `${s.label}#${i}`, color: COLORS[i], isBot: true, personality: s.personality, price: s.price }));
    const o = play(5000 + Math.floor(m / setups.length), specs);
    const w = o.winner === null ? 'none' : seats[o.winner].label;
    wins[w] = (wins[w] ?? 0) + 1;
    for (const id of o.closed) closes[seats[id].label] = (closes[seats[id].label] ?? 0) + 1;
    reasons[o.reason] = (reasons[o.reason] ?? 0) + 1;
    days += o.day;
  }
  console.log(`\n${title}`);
  console.log(`  wins:   ${JSON.stringify(wins)}`);
  console.log(`  closed: ${JSON.stringify(closes)}`);
  console.log(`  ends:   ${JSON.stringify(reasons)}  avg day ${Math.round(days / N)}`);
}

/** Same setup in every seat: wins by seat reveal spawn or update-order bias. */
function seatBias(): void {
  const wins: number[] = [0, 0, 0, 0];
  for (let m = 0; m < N; m++) {
    const specs = COLORS.map((color, i) => ({ name: `S${i}`, color, isBot: true, personality: 'balanced' as const, price: 'medium' as const }));
    const o = play(7000 + m, specs);
    if (o.winner !== null) wins[o.winner]++;
  }
  console.log(`\nSeat bias (4 identical balanced/medium companies): wins by seat ${JSON.stringify(wins)}`);
}

seatBias();
experiment('Price only (all balanced AI, prices rotated across seats)', [
  { label: 'low', personality: 'balanced', price: 'low' },
  { label: 'medium', personality: 'balanced', price: 'medium' },
  { label: 'high', personality: 'balanced', price: 'high' },
  { label: 'medium2', personality: 'balanced', price: 'medium' },
]);
experiment('AI only (all medium price, personalities rotated)', [
  { label: 'discounterAI', personality: 'discounter', price: 'medium' },
  { label: 'balancedAI', personality: 'balanced', price: 'medium' },
  { label: 'premiumAI', personality: 'premium', price: 'medium' },
  { label: 'balancedAI2', personality: 'balanced', price: 'medium' },
]);
experiment('Default lineup, seats rotated', [
  { label: 'Bot-Player', personality: 'balanced', price: 'medium' },
  { label: 'BudgetMart', personality: 'discounter', price: 'low' },
  { label: 'Steady', personality: 'balanced', price: 'medium' },
  { label: 'Luxe', personality: 'premium', price: 'high' },
]);

/**
 * A skilled human, scripted: the strategy a strong playtester found. High
 * prices, ~75% of staff in sales, hire with every spare dollar, expand into
 * the highest-spending streets, sue the leader.
 */
function blitzTurn(r: GameRunner, g: GameImpl): void {
  const me = g.player;
  if (!me.alive || g.tick % CONFIG.ticksPerDay !== 0) return;
  const send = (i: object) => r.addIntent({ companyId: 0, ...i } as never);
  if (me.price !== 'high') send({ type: 'setPrice', price: 'high' });
  const opsNeeded = Math.ceil((me.customers * 1.05) / CONFIG.staff.customersPerOps);
  send({ type: 'setSalesShare', share: Math.min(0.75, Math.max(0.1, 1 - opsNeeded / Math.max(1, me.employees))) });
  const reserve = (me.pnl.salaries + me.pnl.interest) * 10;
  // A skilled player stops adding sales staff once extra reps barely add push.
  const wanted = opsNeeded + Math.min(Math.round(CONFIG.sales.salesScale * 1.2), opsNeeded * 3 + 10);
  const room = wanted - me.employees - g.traineeCount(me);
  const n = Math.min(room, Math.floor((me.cash - reserve) / (CONFIG.staff.hireCost + CONFIG.staff.salaryPerDay * 15)));
  if (n > 0) send({ type: 'hire', count: Math.min(n, 100) });
  if (room < -10 && me.pnl.profit < 0) send({ type: 'fire', count: Math.ceil(-room / 4) });
  if (me.push >= 10) {
    let best = -1;
    let bestScore = -Infinity;
    const { adjStart, adj } = g.map;
    for (const b of me.border) {
      for (let k = adjStart[b]; k < adjStart[b + 1]; k++) {
        const t = adj[k];
        if (g.owner[t] === 0) continue;
        const score = g.map.spend[t] / g.tileCost(me, g.owner[t], t);
        if (score > bestScore) (bestScore = score), (best = t);
      }
    }
    if (best >= 0) send({ type: 'campaign', tile: best });
  }
  const leader = g.leaderId();
  if (leader !== null && leader !== 0 && !g.activeLawsuitBy(me) && me.cash > CONFIG.lawsuit.cost * 3) {
    send({ type: 'lawsuit', targetId: leader });
  }
}

function skilledHuman(): void {
  let wins = 0;
  let days = 0;
  let unicornDays = 0;
  let unicorns = 0;
  for (let m = 0; m < N; m++) {
    const specs = defaultCompanies('Blitz');
    const r = new GameRunner(9000 + m, specs, city);
    const g = r.game;
    while (!g.result) {
      blitzTurn(r, g);
      r.executeNextTick();
    }
    if (g.result.winnerId === 0) wins++;
    if (g.result.reason === 'unicorn') (unicorns++, (unicornDays += g.result.day));
    days += g.result.day;
  }
  console.log(`\nSkilled human (scripted blitz) vs default bots: wins ${wins}/${N}, unicorns ${unicorns} at avg day ${Math.round(unicornDays / Math.max(1, unicorns))}, avg end day ${Math.round(days / N)}`);
}
skilledHuman();
