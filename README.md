# UnicornRush.io 🦄

A real-time business strategy game that teaches how a company makes (and loses) money.
Inspired by territory games like [OpenFront](https://github.com/openfrontio/OpenFrontIO), but the map is a **market**, territory is
**customers**, and you win on **valuation**, not land. All code here is original.

```bash
npm install
npm run dev       # play at http://localhost:5173
npm test          # rules tests
npm run balance   # simulate bot-only matches to check game balance
```

## How to win

- 🦄 **Become the first unicorn**: the first company valued at **$1B** wins instantly.
- 🏆 Otherwise, the **most valuable company after 900 days** (~2.5 years, 15 minutes at 1×) wins.
- 💸 If your cash stays below zero for 10 days, or you lose every customer, your company closes.

**Valuation = Cash − Debt + Assets (50% of building cost) + 10 × yearly profit**

Investors pay for profit, so a smaller, profitable company can beat a big one that's losing money.

## Rules

1 game day = 1 second at 1× speed.

| Lever | What it does | What it teaches |
|---|---|---|
| **Ops / Sales split** | Ops staff serve 10 areas each. Sales staff generate *push* to win new customers. | Resource allocation, opportunity cost |
| **Hire / Fire** | $500 to hire, $100/day salary, 8 days of training before new hires are productive. $300 severance. | Hiring is an investment that pays back over time |
| **Price** (Low / Medium / High) | $25 / $40 / $55 per customer per day. Lower prices grow faster and keep customers loyal. | Price elasticity, margin vs volume |
| **Campaigns** | Click the map next to your territory to spend half your push. | Customer acquisition cost |
| **Branch** 🏬 | $20K, $150/day rent, +30 serve capacity | Fixed costs and capacity |
| **Warehouse** 🏭 | $40K, $400/day rent, variable costs −30% (max 3) | Economies of scale |
| **Ad Agency** 📣 | $30K, $300/day rent, sales push +50% (max 3) | Marketing ROI |
| **Legal Dept** ⚖️ | $60K, $500/day rent. Needed to sue; each gives a 35% chance to get a suit against you dismissed (max 2) | Compliance as insurance |
| **Bank loan** | $25K at a time, 24%/year interest, credit limit = 60 days of revenue | Leverage and risk |

### Every day

```
Revenue  = customers served × price
Costs    = variable cost ($15 / customer) + salaries + rent + interest
Profit   = Revenue − Costs  → added to Cash
```

- If you have more customers than your Ops staff can serve, the unserved ones bring in no revenue **and start leaving**.
- Winning a rival's customers costs more when they charge less than you, or when they serve their customers well.

### Class action lawsuits ⚖️

The big weapon. With a Legal Dept you can sue a rival for **$250K** in legal fees.
The case takes **30 days**, and everyone sees it coming, so the defendant can hire
lawyers. If it isn't dismissed, the defendant loses **25% of its customers in clusters
all over its territory** and pays you **20 days of its revenue** in damages. If it is
dismissed, you pay the defendant's $50K costs. One case at a time per company.

### Market events (every ~4–6 months)

- **Recession**: revenue −30% for 60 days
- **Supplier price hike**: variable costs ×2 for 45 days
- **Consumer boom**: revenue +25% for 60 days

### Rivals

- **BudgetMart**: low prices, aggressive, borrows
- **Steady & Co**: balanced
- **Luxe Ltd**: premium prices, cautious, never borrows

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
- Customer segments (price-sensitive vs quality-sensitive areas)
- R&D and product quality
- Placing buildings on the map
- Stock market / fundraising rounds

## License

- **Code:** [GNU AGPL v3](LICENSE), with additional terms (keep the "© UnicornRush and Contributors" notice; don't present forks as the official UnicornRush).
- **Assets:** [CC BY-SA 4.0](LICENSE-ASSETS).
- The UnicornRush name, unicornrush.io domain and logos are not licensed.

See [LICENSING.md](LICENSING.md) for details, and the [Terms of Service](public/terms-of-service.html) and [Privacy Policy](public/privacy-policy.html) for the hosted game.
