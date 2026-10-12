# UnicornRush.io 🦄

A real-time business strategy game that teaches how a company makes (and loses) money.
Inspired by territory games like [OpenFront](https://github.com/openfrontio/OpenFrontIO), but the map is a **market**, territory is
**customers**, and you win on **valuation**, not land. All code here is original.

```bash
npm install
npm run dev       # play at http://localhost:5173
npm test          # rules tests
npm run balance   # simulate bot-only matches
npm run fairness  # controlled balance experiments
```

## How to win

- 🦄 **Become the first unicorn**: the first company valued at **$1B** wins instantly.
- 🏆 Otherwise, the **most valuable company after 900 days** (~2.5 years, 15 minutes at 1×) wins.
- 💸 If your cash stays below zero for 10 days, or you lose every customer, your company closes.

**Valuation = Cash − Debt + 13 × yearly profit**

Investors pay for profit, so a smaller, profitable company can beat a big one that's losing money.

## Rules (v0)

1 game day = 1 second at 1× speed.

| Lever | What it does | What it teaches |
|---|---|---|
| **Ops / Sales split** | Ops staff serve 6 streets each. Sales staff generate *push* to win new streets. | Resource allocation, opportunity cost |
| **Hire / Fire** | $500 to hire, $100/day salary, 8 days of training before new hires are productive. $300 severance. | Hiring is an investment that pays back over time |
| **Price** (Low / Medium / High) | $25 / $40 / $55 per customer per day. Lower prices win customers faster and keep them loyal. | Price elasticity, margin vs volume |
| **Campaigns** | Click a street next to yours to spend half your push winning it and its neighbours. | Customer acquisition cost |
| **Bank loan** | $25K at a time, 24%/year interest, credit limit = 60 days of revenue | Leverage and risk |
| **Lawsuit** ⚖️ | $250K to sue a rival. See below. | Legal risk |

### The city

The map is a grid of **streets**, and streets are what companies fight over. Blocks are
coloured by how wealthy the neighbourhood is, from dark (budget) to gold (luxury):

| Wealth | Customers spend | Customers per street | Price sensitivity | Prestige |
|---|---|---|---|---|
| $ Budget | ×0.7 | many | high: undercutting works | cheap brands do fine |
| $$ Middle | ×1.0 | normal | normal | normal |
| $$$ Upscale | ×1.5 | fewer | low | premium brands hold customers better |
| $$$$ Luxury | ×2.2 | few | very low: price barely matters | premium brands are sticky; cheap ones look cheap |

Serving a customer costs the same everywhere, so rich streets have much fatter margins.
They also cost more sales push to win. Luxury clusters along the river and next to parks;
downtown streets are packed with middle-income customers.

### Every day

```
Revenue  = customers served × their street's spend multiplier × price
Costs    = variable cost ($5 / customer) + salaries + interest
Profit   = Revenue − Costs  → added to Cash
```

- If you have more customers than your Ops staff can serve, the unserved ones bring in no revenue **and start leaving**.

### Defending your customers

Stealing a rival's street costs more when the rival:
- **holds sales push in reserve** (account managers working to keep customers). Each street it
  loses drains some of that reserve, so a well-defended company can't be steamrolled for free.
- **has spare operations staff** (better service makes customers loyal, up to 1.5×).
- **charges what its street's customers want** (cheap on budget streets, premium on luxury ones).

### Class action lawsuits ⚖️

The big weapon: sue a rival for **$250K** in legal fees. The case takes **30 days**, and
everyone sees it coming. Courts dismiss **35%** of cases, and then you pay the defendant's
$50K costs. Otherwise the defendant loses **25% of its customers in clusters all over its
territory** and pays you **20 days of its revenue** in damages. One case at a time per company.

### Market events (every ~4–6 months)

- **Recession**: revenue −30% for 60 days
- **Supplier price hike**: variable costs ×2 for 45 days
- **Consumer boom**: revenue +25% for 60 days

### Rivals

All three are equally competent; they differ in style.

- **BudgetMart**: low prices, goes for streets with many customers, attacks rivals
- **Steady & Co**: medium prices, balanced
- **Luxe Ltd**: high prices, goes for rich streets and defends them with good service

## Code layout

```
packages/
  engine-api/   contract: intents and game types
  engine-lib/   config, map generation, PRNG, deterministic math, formatting
  engine/       the simulation: GameImpl, executions, bots, GameRunner
src/client/     canvas renderer, HUD, input, game loop
tests/          rules tests + layer-boundary checks (vitest)
scripts/        headless balance simulation
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

- **Code:** [GNU AGPL v3](LICENSE), with additional terms (keep the "© UnicornRush and Contributors" notice; don't present forks as the official UnicornRush).
- **Assets:** [CC BY-SA 4.0](LICENSE-ASSETS).
- The UnicornRush name, unicornrush.io domain and logos are not licensed.

See [LICENSING.md](LICENSING.md) for details, and the [Terms of Service](public/terms-of-service.html) and [Privacy Policy](public/privacy-policy.html) for the hosted game.
