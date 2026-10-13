import './docs.css';
import { CARD_INFO } from '@unicornrush/engine-lib/configuration/Cards';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { EVENT_INFO, LOCAL_EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import { money, pct } from '@unicornrush/engine-lib/Format';
import { type CityInfo, loadCityIndex } from '../client/cities';

/**
 * The rules page (docs.html). Every number comes from CONFIG, so the page
 * always matches the game. The game itself keeps text to a minimum and links here.
 */
const C = CONFIG;
const P = C.prices;

interface Section {
  id: string;
  title: string;
  body: string;
}

const table = (head: string[], rows: (string | number)[][]) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

const SECTIONS: Section[] = [
  {
    id: 'goal',
    title: '🎯 Goal',
    body: `<p>Be the first company valued at <b>$1B</b> (a unicorn), or the most valuable after ${C.matchDays} days.</p>
      <p class="formula">Valuation = cash − debt + ${C.valuation.earningsMultiple} × yearly profit</p>
      <p>Profit counts far more than cash, so a profitable company beats a big one.
      You lose if your cash stays below zero for ${C.bankruptcyGraceDays} days.</p>`,
  },
  {
    id: 'start',
    title: '▶ First minute',
    body: `<ol>
      <li>Pick a start: click anywhere on the map to move your company before the clock starts.</li>
      <li>Click a <b>glowing street</b> next to yours to win its customers. The clock starts.</li>
      <li>Keep <b>Ops</b> high enough to serve every customer (or turn on <b>Auto</b>).</li>
      <li>Hire when cash allows. Then grow toward rich (golden) streets.</li>
    </ol>`,
  },
  {
    id: 'streets',
    title: '🗺 Streets & wealth',
    body: `<p>Territory is streets. Each street has customers, and a wealth level that sets how much they spend.
      Building colours show it: grey is budget, gold is luxury.</p>
      ${table(
        ['Wealth', 'Spend', 'Cost to win', 'Price sensitivity'],
        C.wealth.map((w) => [w.label, `×${w.spend}`, `×${w.pushCost}`, `×${w.priceSensitivity}`]),
      )}
      <p>Every city has its own mix of wealth, so the best price differs from city to city.</p>`,
  },
  {
    id: 'push',
    title: '📈 Sales push & expanding',
    body: `<p>Sales staff build <b>push</b> every day (stored up to ${C.sales.maxPushDaysStored} days' worth).
      Clicking a street spends push to win it and the streets around it, cheapest first.</p>
      <ul>
        <li>The slider next to the push meter sets how much of your push one click commits (${pct(C.sales.minCampaignShare)}–100%). Unspent push comes back.</li>
        <li>An untapped street costs about ${C.sales.neutralTileCost}× its customers in push; a rival's about ${C.sales.rivalTileCost}× its customers × its defence.</li>
        <li>Hover any street to see its cost and why.</li>
      </ul>`,
  },
  {
    id: 'defence',
    title: '🛡 Defence',
    body: `<p>A rival's street costs more to steal when its owner:</p>
      <ul>
        <li>has spare <b>Ops</b> staff (good service keeps customers loyal),</li>
        <li>keeps <b>unspent push</b> (up to ×${C.sales.maxRetention}),</li>
        <li>charges a price that suits the street (low on budget streets, high on rich ones),</li>
        <li>has a <b>Guard</b> on the area (×${C.guard.defenceMult}).</li>
      </ul>`,
  },
  {
    id: 'team',
    title: '👥 Team',
    body: `<p>Staff cost ${money(C.staff.salaryPerDay)}/day each, plus ${money(C.staff.hireCost)} to hire and ${money(C.staff.fireCost)} to let go.
      New hires train for ${C.staff.trainingDays} days. The slider splits staff between:</p>
      <ul>
        <li><b>💼 Sales</b>: build push to win streets.</li>
        <li><b>⚙️ Ops</b>: serve customers, ${C.staff.customersPerOps} each. Unserved customers leave.</li>
      </ul>
      <p><b>Auto</b> keeps just enough Ops. Keeping a few more makes your streets harder to steal.</p>`,
  },
  {
    id: 'price',
    title: '🏷 Price',
    body: `${table(
      ['Price', 'Revenue / customer', 'Demand', 'Push needed', 'Loyalty'],
      Object.values(P).map((p) => [p.label, money(p.revenue), `×${p.volume}`, `×${p.push}`, `×${p.loyalty}`]),
    )}
      <p>Low wins and keeps customers; high earns more but is easier to steal, except on rich streets.
      Big companies take longer to change price (a day per ${C.agility.employeesPerDelayDay} staff, up to ${C.agility.maxDelayDays}).</p>`,
  },
  {
    id: 'money',
    title: '💰 Money',
    body: `<p>Every day: revenue − salaries − supplies (${money(C.variableCostPerCustomer)} per customer) − interest = profit.</p>
      <ul>
        <li><b>🏦 Borrow</b> in chunks of ${money(C.bank.loanChunk)}, up to ${C.bank.maxDebtRevenueDays} days of revenue, at ${pct(C.bank.interestPerYear)} a year. Worth it when growth earns more than the interest.</li>
        <li>Out of cash: you have ${C.bankruptcyGraceDays} days to fix it before closing.</li>
      </ul>`,
  },
  {
    id: 'actions',
    title: '⚡ Actions',
    body: `${table(
      ['Action', 'What it does', 'Cost'],
      [
        ['📢 Ads', `+${C.sales.adPush} push aimed at a street: it spreads from there. One campaign every ${C.sales.adCooldownDays} days.`, `${money(C.sales.adBaseCost)}, +${money(C.sales.adStepCost)} per recent ad`],
        ['🛡 Guard', `Your streets within ${C.guard.radius} m cost rivals ×${C.guard.defenceMult} to steal, for ${C.guard.days} days.`, `${money(C.guard.costPerCustomer)} per customer (min ${money(C.guard.minCost)})`],
        ['🏢 Buy', `Buy a block of up to ${C.streetDeal.blockSize} rival streets next to yours, instantly. Locked for ${C.streetDeal.lockDays} days.`, `${money(C.streetDeal.dollarsPerPush)} per push it would cost, +${pct(C.streetDeal.stepShare)} per recent deal`],
        ['⚖️ Sue', `Unfair competition: if you win, the rival loses ${pct(C.lawsuit.customerLoss)} of its customers and pays you damages. Ruling after ${C.lawsuit.courtDays} days.`, `${C.lawsuit.feeRevenueDays} days of your revenue (min ${money(C.lawsuit.minFee)})`],
      ],
    )}`,
  },
  {
    id: 'lawsuits',
    title: '⚖️ Lawsuits',
    body: `<p>Evidence decides the case:</p>
      <ul>
        <li>${pct(C.lawsuit.baseWinChance)} with no evidence,</li>
        <li>+${pct(C.lawsuit.winChancePerStolenStreet)} per street the rival took from you recently (counts half after ${C.lawsuit.evidenceHalfLifeDays} days),</li>
        <li>+${pct(C.lawsuit.predatoryPricingBonus)} if the rival prices low,</li>
        <li>at most ${pct(C.lawsuit.maxWinChance)}.</li>
      </ul>
      <p>Damages are ${C.lawsuit.damagesDays} days of the profit you lost; lawyers keep ${pct(C.lawsuit.lawyerShare)}.
      If the case is dismissed, you also pay the rival's costs (${pct(C.lawsuit.dismissedCostShare)} of your fee).
      Fees scale with size, so small companies can afford to sue giants.</p>`,
  },
  {
    id: 'events',
    title: '🔮 Events',
    body: `<p>Market events are forecast ${C.events.warningDays} days ahead:</p>
      <ul>${Object.values(EVENT_INFO).map((e) => `<li><b>${e.title}</b> (${e.days} days): ${e.text}</li>`).join('')}</ul>
      <p>Local events are announced ${C.localEvents.warningDays} days ahead, on a circle of the map:</p>
      <ul>${Object.values(LOCAL_EVENT_INFO).map((e) => `<li>${e.icon} <b>${e.title}</b>: ${e.effect}</li>`).join('')}</ul>`,
  },
  {
    id: 'cards',
    title: '🎁 Opportunities',
    body: `<p>Every ${C.cards.minGap}–${C.cards.maxGap} days, pick one of three cards within ${C.cards.offerDays} days.
      The further behind you are, the bigger they are.</p>
      <ul>${Object.values(CARD_INFO).map((c) => `<li>${c.icon} <b>${c.title}</b>: ${c.lesson}</li>`).join('')}</ul>`,
  },
  {
    id: 'leader',
    title: '📰 Being the leader',
    body: `<p>When the leader is worth ${C.scrutiny.minLead}× the runner-up, unions, journalists and hackers go after it:
      strikes (Ops at ${pct(C.scrutiny.strikeCapacity)} for ${C.scrutiny.strikeDays} days), exposés (${pct(C.scrutiny.pressStreetShare)} of streets) and data-breach fines.</p>
      <p>Owning more than ${pct(C.antitrust.actShare)} of the city's customers for ${C.antitrust.graceDays} days brings an antitrust fine and a forced sale of streets.</p>`,
  },
  {
    id: 'difficulty',
    title: '🤖 Difficulty',
    body: `<ul>
      <li><b>Easy</b>: rivals grow slowly, rarely take your streets, and don't use ads, lawsuits, guards or deals.</li>
      <li><b>Normal</b>: rivals grow steadily and use every action.</li>
      <li><b>Hard</b>: rivals invest like a skilled player and keep spare Ops for defence.</li>
    </ul>`,
  },
  {
    id: 'keys',
    title: '⌨️ Keys',
    body: table(
      ['Key', 'Action'],
      [
        ['Space', 'Pause / play'],
        ['H', 'Hire 10'],
        ['A', 'Aim an ad'],
        ['G', 'Guard'],
        ['B', 'Buy streets'],
        ['S', 'Sue'],
        ['Q W E', 'Low / medium / high price'],
        ['F', 'Money'],
        ['R', 'Race'],
        ['N', 'News'],
        ['Esc', 'Cancel / close'],
      ],
    ),
  },
];

const WEALTH = ['Budget', 'Middle', 'Upscale', 'Luxury'];
const citySection = (cities: CityInfo[]) =>
  `<section id="cities"><h2>🏙 Cities</h2>
    <p>Real neighbourhoods from OpenStreetMap. The bar shows each city's wealth mix: more gold favours high prices, more grey favours low ones.</p>
    <div class="cities">${cities
      .map(
        (c) => `<figure><img src="cities/thumbs/${c.id}.svg" alt="" loading="lazy" /><figcaption>${c.flag} <b>${c.city}</b> · ${c.area}
          <span class="mix" title="${c.mix.map((m, i) => `${WEALTH[i]} ${Math.round(m * 100)}%`).join(' · ')}">${c.mix
            .map((m, i) => `<i class="w${i}" style="flex:${m}"></i>`)
            .join('')}</span></figcaption></figure>`,
      )
      .join('')}</div></section>`;

const root = document.getElementById('docs')!;
root.innerHTML = `
  <header><a class="back" href="./">← Play</a><h1>🦄 How to play <b>UnicornRush</b></h1></header>
  <div class="layout">
    <nav>${[...SECTIONS, { id: 'cities', title: '🏙 Cities' }].map((s) => `<a href="#${s.id}">${s.title}</a>`).join('')}</nav>
    <main>${SECTIONS.map((s) => `<section id="${s.id}"><h2>${s.title}</h2>${s.body}</section>`).join('')}<div data-v="cities"></div>
      <footer>Maps © OpenStreetMap contributors (ODbL) · <a href="terms-of-service.html">Terms</a> · <a href="privacy-policy.html">Privacy</a></footer>
    </main>
  </div>`;
loadCityIndex().then(
  (cities) => {
    root.querySelector('[data-v="cities"]')!.outerHTML = citySection(cities);
    if (location.hash === '#cities') document.getElementById('cities')?.scrollIntoView();
  },
  () => {},
);
