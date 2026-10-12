// Headless balance check: runs bot-only matches and prints how they end.
// Usage: npm run balance -- [matches]
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { defaultCompanies } from '@unicornrush/engine-lib/configuration/Companies';
import { money } from '@unicornrush/engine-lib/Format';
import { GameRunner } from '@unicornrush/engine/GameRunner';

const matches = Number(process.argv[2] ?? 8);
const wins: Record<string, number> = {};
let suits = 0;
let dismissed = 0;

for (let m = 0; m < matches; m++) {
  const r = new GameRunner(1000 + m, defaultCompanies('Bot-Player', true));
  const g = r.game;
  while (!g.result) r.executeNextTick();
  const res = g.result;
  const w = res.winnerId === null ? 'none' : g.companies[res.winnerId].name;
  wins[w] = (wins[w] ?? 0) + 1;
  suits += g.log.filter((l) => l.text.includes('filed a class action')).length;
  dismissed += g.log.filter((l) => l.text.includes('dismissed')).length;
  console.log(`match ${m}: ${w} wins by ${res.reason} on day ${res.day.toFixed(0)}`);
  for (const c of g.companies) {
    console.log(
      `    ${c.name.padEnd(12)} ${c.alive ? 'alive ' : `closed d${c.closedDay?.toFixed(0)}`} areas=${c.tiles} peak=${c.peakTiles} staff=${c.employees} cash=${money(c.cash)} debt=${money(c.debt)} profit/d=${money(c.avgProfit)} peakVal=${money(c.peakValuation)}`,
    );
  }
}
console.log(`\nwins: ${JSON.stringify(wins)}  lawsuits filed: ${suits}, dismissed: ${dismissed}  (match length ${CONFIG.matchDays} days)`);
