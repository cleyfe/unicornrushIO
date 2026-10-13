# UnicornRush.io 🦄

A real-time business strategy game that teaches how a company makes (and loses) money.
Inspired by territory games like [OpenFront](https://github.com/openfrontio/OpenFrontIO), but the map is a **market**, territory is
**customers**, and you win on **valuation**, not land. All code here is original.

```bash
npm install
npm run dev       # play at http://localhost:5173
npm test          # rules tests
npm run balance   # simulate bot-only matches
npm run fairness  # controlled balance experiments (add a city id to test a real city)
```

## How to win

- 🦄 **Become the first unicorn**: the first company valued at **$1B** wins instantly.
- 🏆 Otherwise, the **most valuable company after 900 days** (~2.5 years, 15 minutes at 1×) wins.
- 💸 If your cash stays below zero for 10 days, or you lose every customer, your company closes.

**Valuation = Cash − Debt + 18 × yearly profit** (yearly profit is based on the average daily profit of the last 30 days, so valuation reacts with a delay)

Investors pay for profit, so a smaller, profitable company can beat a big one that's losing money.

## Rules (v0)

1 game day = 1 second at 1× speed.

| Lever | What it does | What it teaches |
|---|---|---|
| **Ops / Sales split** | Ops staff serve 20 customers each. Sales staff generate *push* to win new streets, with diminishing returns: a huge sales force gets less push per person. | Resource allocation, opportunity cost, diminishing returns |
| **Hire / Fire** | $500 to hire, $100/day salary, 8 days of training before new hires are productive. $300 severance. | Hiring is an investment that pays back over time |
| **Price** (Low / Medium / High) | $28 / $40 / $55 per purchase. Middle-income customers buy ×1.4 / ×1 / ×0.8 as much; budget customers react more, luxury ones barely. Low prices also win and keep customers more easily. | Price elasticity of demand, margin vs volume |
| **Campaigns** | Click a street (or a building on it) next to yours: the campaign commits a share of your push (10–100%, slider next to the meter, 50% by default) and wins that street and its neighbours until the budget runs out; unspent push comes back. | Customer acquisition cost |
| **Advertising** 📢 | Aim an ad campaign at any street: 150 push that wins streets toward it. The first costs $100K, each recent one $50K more (fading over a few weeks); one campaign every 7 days. | Customer acquisition cost, diminishing returns |
| **Street deals** 🏢 | Buy a block of up to 6 rival streets next to yours, instantly, for $1,500 per push they'd cost (+25% per recent deal). You buy out the local shops' contracts, so the money leaves the game, and the streets can't be bought back with cash for 60 days. | Buying vs building, paying for speed |
| **Bank loan** | $25K at a time, 24%/year interest, credit limit = 60 days of revenue | Leverage and risk |
| **Lawsuit** ⚖️ | Sue a rival for unfair competition. Fees scale with your size (10 days of revenue, at least $25K); the court decides on evidence. See below. | Legal risk, damages as lost profits, contingency fees |
| **Guard** 🛡 | Post an account team on a neighbourhood: your streets within 250 m cost rivals ×1.6 to steal for 60 days. Price: $250 per customer covered. | Customer retention, defending market share |
| **Opportunity cards** 🎁 | Every couple of months, pick one of three cards. See below. | Fundraising and dilution, grants, supplier deals |

### The city

You play on a **real city**, built from [OpenStreetMap](https://www.openstreetmap.org). Companies
fight over **street segments** (a street between two intersections); every building belongs to its
nearest street, so winning a street wins its buildings' customers. Bigger buildings (footprint ×
floors) mean more customers. Buildings are coloured by how wealthy the neighbourhood is, from dark
(budget) to gold (luxury). Once a company owns them, they take its colour but keep showing their
wealth: darker on budget streets, brighter on rich ones, with a gold rim on upscale and luxury
buildings.

| Wealth | Customers spend | Customers | Price sensitivity | Prestige |
|---|---|---|---|---|
| $ Budget | ×0.7 | more per building | high: undercutting works, and low prices make them buy much more | cheap brands do fine |
| $$ Middle | ×1.0 | normal | normal | normal |
| $$$ Upscale | ×1.5 | fewer (bigger homes) | low | premium brands hold customers better |
| $$$$ Luxury | ×2.2 | fewest | very low: price barely changes what they buy | premium brands are sticky; cheap ones look cheap |

Serving a customer costs the same everywhere, so rich streets have much fatter margins. But rich
customers are harder to win: a luxury customer costs about 2.8× the sales push of a middle-income
one, and a budget customer about 0.6×. Every strategy (cheap on budget streets, premium on luxury
ones, or in between) earns a similar profit per unit of sales effort; they differ in risk.

**Cities:**

| City | Area |
| --- | --- |
| 🇫🇷 Paris | Opéra & Monceau: from Parc Monceau and the Golden Triangle to Pigalle |
| 🇨🇭 Genève | Centre: lakefront luxury, the Old Town, Pâquis and Plainpalais. Rich city (25% luxury): premium prices pay |
| 🇺🇸 New York | Lower Manhattan: Tribeca, SoHo and the West Village next to Chinatown and the Lower East Side |
| 🇬🇧 London | West End: Mayfair and Bond Street, Soho, Covent Garden and Holborn |
| 🇩🇪 Berlin | Mitte: Friedrichstraße and Hackescher Markt down to Kreuzberg. Budget city (45% budget): low prices win |
| 🇺🇸 San Francisco | Downtown: Nob Hill, the Financial District, SoMa and the Mission. Split city: every price can work |
| 🇨🇦 Toronto | Downtown: Yorkville, Kensington Market and the Financial District |

Each city has its own mix of budget, middle, upscale and luxury streets (`wealthShares` in
`scripts/cities.json`), so the best pricing strategy depends on where you play.

#### Adding a city

Add an entry to `scripts/cities.json` (a bounding box plus a few hand-placed wealth hints, since
OpenStreetMap has no income data), then run:

```bash
npm run build-city -- <id>   # downloads OSM data and writes public/cities/<id>.json
```

### Every day

```
Revenue  = customers served × their street's spend multiplier × how much they buy at your price × price
Costs    = variable cost ($5 / purchase) + salaries + interest
Profit   = Revenue − Costs  → added to Cash
```

- If you have more customers than your Ops staff can serve, the unserved ones bring in no revenue **and start leaving**.

### Playing

The map opens on your company, paused. Click a **glowing street** next to yours to win it (or
any building on it); hovering a street shows its customers, what it would earn you per day,
and whether you can afford it. Your card (top-left) shows valuation, cash, profit and how many
customers you serve; the race board (top-right) shows everyone's progress to $1B; the bar at
the bottom holds the levers. Finances (charts, P&L, valuation, one-off costs, bank) and lawsuits
open in a side drawer. Short tips appear the first time each mechanic matters.

### Defending your customers

Hover any street to see why it costs what it does: base × each defence factor. Your own
defence (🛡) sits in the command bar.

Stealing a rival's street costs more when the rival:
- **holds sales push in reserve** (account managers working to keep customers). Each street it
  loses drains some of that reserve, so a well-defended company can't be steamrolled for free.
- **has spare operations staff** (better service makes customers loyal, up to 1.5×).
- **charges what its street's customers want** (cheap on budget streets, premium on luxury ones).
- **has guarded the area** (🛡 Guard: ×1.6 for 60 days).

### Controls

Everything you do lives in the command bar at the bottom: Space pause · 1 2 3 speed ·
H hire 10 · A ads · G guard · S sue · Q W E price · F money · R race chart · Esc close.

### Unfair-competition lawsuits ⚖️

Sue a rival that hurt your business unfairly. Legal fees scale with **your** size: 10 days of
your revenue, at least $25K, so a small company can afford to take on a giant. In return the
lawyers keep **30% of any damages** (a contingency fee). The court decides on
**evidence**: every street the rival took from you recently counts (poaching your customers),
plus a predatory-pricing claim if it sells cheap. With no evidence you have about a 10% chance;
a strong case reaches 85%. Old grievances fade (half-life 70 days).

- **If you win:** the rival pays your **lost profits** on the streets it took (45 days' worth), and
  the bad press drives away **15% of its customers** all over its territory.
- **If you lose:** you also pay the rival's legal costs: 60% of your own fee.

The lawsuit drawer shows your case against each rival: evidence, win chance, damages and whether
it's worth it on average. Bots only sue when they have a good case. Fees and damages are listed
under one-off cash flows in Finances.

### Competition authority 🏛️

A company serving more than **35%** of the city's customers gets a warning. If it stays above
**40%** for 30 days, it is fined **20 days of revenue** and must give up **10% of its streets**,
as regulators do with monopolies. It can happen again after 120 days.

### Market events (every ~4–6 months, forecast 10 days ahead)

- **Recession**: revenue −30% for 60 days
- **Supplier price hike**: variable costs ×2 for 45 days
- **Consumer boom**: revenue +25% for 60 days

Economists announce each one 10 days before it starts, so you can prepare: save cash before a
recession, hire before a boom.

### Local events (every ~2–3 months, announced 15 days ahead)

Something happens in one part of the city, shown as a circle on the map:

- **🚇 New metro station**: +40% customers on nearby streets, for good. Race to be there first.
- **🚧 Roadworks**: customers nearby spend −40% for 40 days.
- **🎪 Street festival**: customers nearby spend +50% for 20 days.

### Opportunity cards 🎁 (catch-up, kart-race style)

Every 2–4 months each company is offered three cards and picks one within 30 days:

| Card | Effect |
| --- | --- |
| 📣 Viral review | Free sales push |
| 🌟 Star team | A few experienced people join, trained and ready |
| 📦 Supplier deal | Variable costs −40% for a few weeks |
| 💼 Investor offer | Cash for 15% of your company (not for the leader). Your stake is shown on your card |
| 🏛️ Small-business grant | Cash, for companies worth less than half the leader |
| 🧲 Unhappy customers | A few of a neighbouring rival's streets switch to you |

Like item boxes in a kart race, **companies further behind get offers more often, and bigger
ones** (×1.6 for last place, ×0.6 for the leader). A well-played leader still wins; it just has
to work for it.

### Being big

Size has costs as well as advantages:

- **Scrutiny:** when the leader is worth 1.4× the runner-up, unions, journalists and hackers come
  after it every few months: a **strike** (announced a week ahead: operations run at 60% for 8
  days, so keep spare Ops staff), a **newspaper exposé** (5% of its streets walk away), or a
  **data breach** (a fine of 5 days of revenue).
- **Slower decisions:** a price change takes one day per 40 employees to reach every shop (up to
  15 days). Small companies switch at once.

### Rivals

Pick 3, 7, 11 or 19 rivals (4 to 20 players) on the start screen. The first three are
always BudgetMart, Steady & Co and Luxe Ltd; bigger matches add more companies with the same
three styles (discount, balanced, premium). All are equally competent; they differ in style.

- **BudgetMart**: low prices, goes for streets with many customers, attacks rivals
- **Steady & Co**: medium prices, balanced
- **Luxe Ltd**: high prices, goes for rich streets and defends them with good service

## Code layout

```
packages/
  engine-api/   contract: intents and game types
  engine-lib/   config, map generation, PRNG, deterministic math, formatting
  engine/       the simulation: GameImpl, executions, bots, GameRunner
src/client/     MapLibre map, company labels, HUD, input, game loop
public/cities/  playable cities built from OpenStreetMap
tests/          rules tests + layer-boundary checks (vitest)
scripts/        city builder (OSM → game map), balance and fairness simulations
```

Every action is an **intent** turned into an **execution**, for players and bots
alike. All tunable numbers live in `packages/engine-lib/src/configuration/Config.ts`.
The engine is seeded and deterministic, so lockstep multiplayer can be added later.
See [CLAUDE.md](CLAUDE.md) for the architecture rules.

## Roadmap ideas

- Multiplayer and partnerships (non-compete deals)
- Buildings (branches, warehouses, marketing, legal), once the core is fun
- R&D and product quality
- Stock market / fundraising rounds

## License

- **City maps:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [ODbL](https://opendatacommons.org/licenses/odbl/). Base map by [OpenFreeMap](https://openfreemap.org).
- **Code:** [GNU AGPL v3](LICENSE), with additional terms (keep the "© UnicornRush and Contributors" notice; don't present forks as the official UnicornRush).
- **Assets:** [CC BY-SA 4.0](LICENSE-ASSETS).
- The UnicornRush name, unicornrush.io domain and logos are not licensed.

See [LICENSING.md](LICENSING.md) for details, and the [Terms of Service](public/terms-of-service.html) and [Privacy Policy](public/privacy-policy.html) for the hosted game.
