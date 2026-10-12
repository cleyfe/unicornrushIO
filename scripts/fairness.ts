// Controlled experiments to find where an advantage comes from.
// Usage: npm run fairness -- [matches per experiment] [city id, e.g. paris-opera]
import { readFileSync } from 'node:fs';
import type { CityData } from '@unicornrush/engine-api/game/City';
import type { CompanySpec, Personality, PriceLevel } from '@unicornrush/engine-api/game/Game';
import { GameRunner } from '@unicornrush/engine/GameRunner';

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
