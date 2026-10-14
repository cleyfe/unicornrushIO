import './docs.css';
import { CARD_INFO } from '@unicornrush/engine-lib/configuration/Cards';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { EVENT_INFO, LOCAL_EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import { money, pct } from '@unicornrush/engine-lib/Format';
import { type CityInfo, loadCityIndex } from '../client/cities';

/**
 * The rules (docs.html, and the in-game "How to play"). Every number comes from
 * CONFIG, so they always match the game. The game itself keeps text to a minimum.
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
      <p>Every city has its own mix of wealth, so the best price differs from city to city.</p>
      <p><b>⭐ Regulars:</b> customers spend more the longer their street stays yours, up to
      +${pct(C.loyalty.maxBonus)} after ${C.loyalty.fullDays} days. A street that changes hands starts over,
      so holding ground pays and taking a rival's oldest streets hurts them most.</p>`,
  },
  {
    id: 'push',
    title: '📈 Sales push & expanding',
    body: `<p>Sales staff build <b>push</b> every day (stored up to ${C.sales.maxPushDaysStored} days' worth).
      Clicking a street spends push to win it and the streets around it, cheapest first.</p>
      <ul>
        <li>The slider next to the push meter sets how much of your push one click commits (${pct(C.sales.minCampaignShare)}–100%). Unspent push comes back.</li>
        <li>An untapped street costs about ${C.sales.neutralTileCost}× its customers in push; a rival's about ${C.sales.rivalTileCost}× its customers × its defence.</li>
        <li>Hover any street to see its cost and why. Your push per click follows the cursor: green when a click wins the street.</li>
        <li>Hold <b>Space</b> for the <b>attack view</b>: every rival street from green (cheap to take) to red (well defended).</li>
      </ul>
      <p><b>Reading the map:</b> a street taken from a company flashes (red if it was yours).
      A <b>dashed red border</b> marks an <b>exposed</b> company (defence below ×${C.sales.exposedBelow}): overloaded, or its push
      reserve just spent on a big campaign. That's the moment to attack. Your newly won streets look paler and
      deepen as their customers become regulars.</p>`,
  },
  {
    id: 'defence',
    title: '🛡 Defence',
    body: `<p>A rival's street costs more to steal when its owner:</p>
      <ul>
        <li>has spare <b>Ops</b> staff: service, up to ×${C.sales.maxServiceLevel}. When overloaded, defence falls with the square of service (down to ×${C.sales.minServiceDefence}),</li>
        <li>keeps <b>unspent push</b>: push reserve, up to ×${C.sales.maxRetention},</li>
        <li>charges a price that suits the street (low on budget streets, high on rich ones),</li>
        <li>is inside the owner's <b>front</b> (🛡 Guard), where most of its push reserve is focused.</li>
      </ul>
      <p>The 🛡 number is service × push reserve. A big push reserve can show a high 🛡 while you're short of Ops,
      so watch the ⚙️ service number to know whether everyone is served.</p>`,
  },
  {
    id: 'team',
    title: '👥 Team',
    body: `<p>Staff cost ${money(C.staff.salaryPerDay)}/day each, plus ${money(C.staff.hireCost)} to hire and ${money(C.staff.fireCost)} to let go.
      New hires train for ${C.staff.trainingDays} days. The slider splits staff between:</p>
      <ul>
        <li><b>💼 Sales</b>: build push to win streets.</li>
        <li><b>⚙️ Ops</b>: serve customers, ${C.staff.customersPerOps} each. Unserved customers don't pay.</li>
      </ul>
      <p><b>Service</b> (⚙️ in the action bar) is what your Ops can serve divided by your customers.
      Below ×1, unserved customers don't pay, and your defence falls fast (×0.8 service gives ×0.64 defence), so rivals take your streets cheaply. Between ×1 and ×${C.sales.maxServiceLevel}, spare Ops make your streets
      harder to steal. Above ×${C.sales.maxServiceLevel}, extra Ops do nothing. Marks on the slider show where ×1 and
      ×${C.sales.maxServiceLevel} are. New hires don't serve anyone until they finish training.</p>
      <p><b>Auto</b> keeps service at about ×1.05: everyone served, as many people as possible in Sales.
      Take over (O and P keys, or the slider) to hold ×1.2–1.5 when rivals are attacking.</p>`,
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
        ['🛡 Guard', `Set your front: your streets within ${C.guard.radius} m share ${pct(C.guard.reserveShare)} of your push reserve's defence (up to ×${C.guard.maxRetention}); the rest of your streets share the remainder. Move it every ${C.guard.moveCooldownDays} days.`, 'Free'],
        ['🏢 Buy', `Buy a block of up to ${C.streetDeal.blockSize} rival streets next to yours, instantly. Locked for ${C.streetDeal.lockDays} days.`, `${money(C.streetDeal.dollarsPerPush)} per push it would cost, +${pct(C.streetDeal.stepShare)} per recent deal`],
        ['🕵️ Poach', `Hire away part of any rival's sales team, wherever they are: ${pct(C.poach.share)} of it, divided by their 🛡 defence (at most ${C.poach.maxPeople}). They join you trained and take their push. Once every ${C.poach.cooldownDays} days; a poached company is safe for ${C.poach.immunityDays} days.`, `${money(C.poach.costPerPerson)} per person`],
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
    id: 'online',
    title: '🌐 Online',
    body: `<ul>
      <li><b>Create room</b> on the start menu, then share the link or the 5-letter code. Friends join from the menu or by opening the link.</li>
      <li>The host picks the city, how many bots join and how strong they are, then starts. Up to 8 players and 20 companies.</li>
      <li>The match can't be paused. If you drop out, reopen the link: you get your company back where the match is now.</li>
      <li>If your company closes, the match goes on and you can watch the end.</li>
    </ul>`,
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
        ['Enter', 'Pause / play'],
        ['Space (hold)', 'Attack view: rival streets from green (cheap to take) to red (well defended)'],
        ['H', 'Hire 10'],
        ['O / P', 'Move 5% of staff to Ops / to Sales'],
        ['A', 'Aim an ad'],
        ['G', 'Guard: set your front'],
        ['B', 'Buy streets'],
        ['S', 'Sue'],
        ['T', 'Poach'],
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

/**
 * Draws the rules into `root`: the docs page itself, or an overlay inside the game
 * (pass `onClose`), which works where opening another page doesn't.
 */
export function renderDocs(root: HTMLElement, onClose?: () => void): void {
  root.classList.add('docs');
  const top = onClose
    ? '<button class="close" type="button" aria-label="Close">✕</button>'
    : '<a class="back" href="./">← Play</a>';
  root.innerHTML = `
  <header>${top}<h1>🦄 How to play <b>UnicornRush</b></h1></header>
  <div class="layout">
    <nav>${[...SECTIONS, { id: 'cities', title: '🏙 Cities' }].map((s) => `<a href="#${s.id}" data-section="${s.id}">${s.title}</a>`).join('')}</nav>
    <main>${SECTIONS.map((s) => `<section id="${s.id}"><h2>${s.title}</h2>${s.body}</section>`).join('')}<div data-v="cities"></div>
      <footer>Maps © OpenStreetMap contributors (ODbL) · <a href="terms-of-service.html">Terms</a> · <a href="privacy-policy.html">Privacy</a></footer>
    </main>
  </div>`;
  // Jump to a section by scrolling, so it works inside the overlay too.
  root.querySelector('nav')!.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-section]');
    if (!link) return;
    e.preventDefault();
    root.querySelector(`#${link.dataset.section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  if (onClose) {
    root.querySelector('.close')!.addEventListener('click', onClose);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      document.removeEventListener('keydown', onKey);
      onClose();
    };
    document.addEventListener('keydown', onKey);
  }
  loadCityIndex().then(
    (cities) => {
      const slot = root.querySelector('[data-v="cities"]');
      if (slot) slot.outerHTML = citySection(cities);
      if (!onClose && location.hash === '#cities') document.getElementById('cities')?.scrollIntoView();
    },
    () => {},
  );
}
