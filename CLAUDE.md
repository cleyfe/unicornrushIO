# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # all tests (Vitest)
npm run typecheck  # tsc
npm run build      # typecheck + production build to dist/
npm run balance -- 16   # simulate 16 bot-only matches and print outcomes
npm run fairness -- 48  # controlled experiments: seat bias, price only, AI only, default lineup
```

Run one test file: `npx vitest run tests/Lawsuit.test.ts`.

## Architecture

UnicornRush is a real-time business strategy game. The code is split into a
deterministic **engine** (packages) and a **client** (`src/client`).

| Package | Directory | Contents |
| --- | --- | --- |
| `@unicornrush/engine-api` | `packages/engine-api` | The contract: `Intent` types and game data types (`Company`, `Lawsuit`, …), plus a few constants (`Terrain`, `NEUTRAL`). |
| `@unicornrush/engine-lib` | `packages/engine-lib` | Code that runs outside the simulation too: `Config` (all tunable numbers), map generation, `PseudoRandom`, `DetMath`, formatting. |
| `@unicornrush/engine` | `packages/engine` | The simulation: `GameImpl`, executions, bots, `GameRunner`. |

Import them as `@unicornrush/<pkg>/<path>` (aliases in `tsconfig.json` and
`vite.config.ts`). `tests/LayerBoundaries.test.ts` enforces:

- `engine-api` imports nothing; `engine-lib` adds `engine-api`; `engine` adds `engine-lib`.
- Engine packages never use `Math.random`, `Date.now`, `new Date`, `Math.exp`/`Math.pow`,
  `**` with an exponent other than 2, or the DOM. Use `game.rng` and `engine-lib/DetMath`.
  This keeps every match replayable from its seed (and ready for lockstep multiplayer).
- `src/client` loads the engine at runtime only through `@unicornrush/engine/GameRunner`
  (type-only imports of engine classes are fine).

### Simulation flow (Intent → Execution)

1. A player action (or a bot decision) creates an **Intent** (`engine-api/Intents.ts`).
2. `GameRunner` collects intents and applies them as one turn on the next tick.
3. `ExecutionManager.createExecution` turns each intent into an **Execution**.
4. `GameImpl.executeNextTick()` inits new executions, then ticks every active one.
5. The client reads `GameImpl` state to render.

Bots act only through intents, so they follow exactly the same rules as players.
Rejected actions report back with `game.message(companyId, text)`; the client shows
the player's errors as toasts.

Long-running executions: `CompanyExecution` (per company: staff, churn, P&L,
solvency), `MarketEventExecution`, `BotExecution`, `WinCheckExecution`.
Intent executions: `CampaignExecution` (winning customers), `LawsuitExecution`
(class action), and the instant ones in `CompanyActionExecutions.ts`.

### Adding a new action

1. Add the intent to `packages/engine-api/src/Intents.ts`.
2. Write `XxxExecution` in `packages/engine/src/execution/` and map it in `ExecutionManager.ts`.
3. Put any numbers in `packages/engine-lib/src/configuration/Config.ts`.
4. Add a test in `tests/`, a control in `src/client/hud/ControlPanel.ts`, and
   check balance (below).

### Balance checks

Run `npm run fairness -- 48` after any rule or AI change. Each experiment rotates
setups across seats, so 48 matches with 4 setups means ~12 wins each is perfectly fair.

- **Seat bias** (identical companies): no seat far from 12. A gap means spawn or update-order bias.
- **Price only** (same AI, different prices): no price should dominate. This tests the rules.
- **AI only** (same price, different personalities): personalities should be equally
  competent and differ in style. A dominant one means a rule rewards one behaviour too much.
- **Default lineup**: every company should win sometimes; unicorns around day 350–700.

Bot-only matches don't end when company 0 closes (only a human player's bankruptcy ends
the match), so results aren't skewed by whoever happens to lead that day.

Engine changes must include tests.
