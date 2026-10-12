// All tunable numbers live here. Money is in dollars, time is in game days.
// 1 game day = 1 real second at 1x speed.
import type { PriceLevel } from '@unicornrush/engine-api/game/Game';

export const CONFIG = {
  ticksPerDay: 10,
  matchDays: 900, // ~2.5 years, 15 minutes at 1x

  // The synthetic grid city used by tests and as a fallback; real cities come
  // from OpenStreetMap (scripts/build-city.ts).
  gridCity: {
    width: 161, // multiples of streetEvery + 1, so the city is framed by streets
    height: 101,
    streetEvery: 5, // blocks are 4×4 tiles with a street all around
    downtowns: 5,
    parkShare: 0.08, // share of blocks that are parks
    bridgeEveryAvenues: 4,
    customersPerStreet: 2.5, // customers on an average suburban street
  },

  // Richer streets have fewer customers, but each spends more. Serving a
  // customer costs the same everywhere, so rich streets have fat margins.
  // pushCost: sales push per customer to win them (rich customers are harder to win).
  // priceSensitivity: how much price matters to them, both for how much they buy
  // (price elasticity) and for how easily a cheaper rival can steal them.
  // prestige: how much a high price helps (and a low price hurts) loyalty.
  wealth: [
    { label: 'Budget', spend: 0.7, pushCost: 0.63, density: 1.2, priceSensitivity: 1.3, prestige: 0.9 },
    { label: 'Middle', spend: 1.0, pushCost: 1.0, density: 1.0, priceSensitivity: 1.0, prestige: 1.0 },
    { label: 'Upscale', spend: 1.5, pushCost: 1.69, density: 0.8, priceSensitivity: 0.6, prestige: 1.25 },
    { label: 'Luxury', spend: 2.2, pushCost: 2.79, density: 0.6, priceSensitivity: 0.3, prestige: 1.6 },
  ],

  start: { cash: 60_000, employees: 10, customers: 90, salesShare: 0.5, push: 60 }, // starting territory: about this many customers

  staff: {
    salaryPerDay: 100,
    hireCost: 500, // recruiting + onboarding, paid once
    fireCost: 300, // severance
    trainingDays: 8, // new hires are paid but not productive yet
    customersPerOps: 20, // customers one operations employee can serve
  },

  // Revenue per customer per day, before the street's wealth multiplier.
  prices: {
  // volume: price elasticity of demand. Cheaper prices make customers buy more.
    low: { revenue: 28, volume: 1.4, push: 1.2, loyalty: 1.25, label: 'Low' },
    medium: { revenue: 40, volume: 1.0, push: 1.0, loyalty: 1.0, label: 'Medium' },
    high: { revenue: 55, volume: 0.8, push: 0.9, loyalty: 0.9, label: 'High' },
  } satisfies Record<PriceLevel, { revenue: number; volume: number; push: number; loyalty: number; label: string }>,

  variableCostPerCustomer: 5, // per customer per day

  sales: {
    pushPerRepPerDay: 0.38,
    // Diminishing returns: a sales force of this size works at half efficiency
    // (coordination overhead, the easy customers are already won).
    salesScale: 200,
    maxPushDaysStored: 30, // push pool caps at sales reps × this
    neutralTileCost: 2, // × customers × wealth push factor
    rivalTileCost: 5, // × customers × wealth push factor × defense multiplier
    campaignShare: 0.5, // share of the push pool committed per click
    // Defence: stockpiled push protects customers (account managers). Each
    // point of push per street adds this much to the cost of stealing it,
    // and the defender loses this share of the attacker's cost from its pool.
    retentionPerPush: 0.15,
    maxRetention: 2, // a push reserve can at most double the cost of stealing a street
    retentionDrain: 0.3,
    // Advertising: buy sales push with cash. Each purchase makes the next one
    // pricier (the cheapest ad slots go first); the extra cost fades over time.
    adPackShare: 0.4, // push bought per purchase, as a share of your push cap (min 20)
    adCostPerPush: 5000,
    adPriceStep: 0.5, // +50% per recent purchase
    adHeatDecayPerDay: 0.03,
    maxAdPushMult: 2, // ads can fill the push pool up to twice its normal cap
    maxServiceLevel: 1.5, // spare operations capacity makes customers loyal, up to this
  },

  churn: { ratePerDay: 0.05 }, // share of over-capacity areas lost per day

  bankruptcyGraceDays: 10,

  bank: { loanChunk: 25_000, maxDebtRevenueDays: 60, interestPerYear: 0.24 },

  // The unfair-competition lawsuit: an expensive strike that hits a rival's
  // customers all over its territory, unless the court dismisses the case.
  lawsuit: {
    cost: 250_000, // legal fees, paid when filing
    courtDays: 30, // time until the ruling: the defendant can prepare
    customerLoss: 0.15, // share of the defendant's customers driven away by bad press
    clusters: 12, // the loss is spread over this many places
    // Evidence decides the case: streets the defendant took from the plaintiff
    // recently (poaching), plus a predatory-pricing claim if it prices low.
    baseWinChance: 0.1, // with no evidence at all
    winChancePerStolenStreet: 0.04,
    predatoryPricingBonus: 0.1, // defendant charges Low prices
    maxWinChance: 0.85,
    evidenceHalfLifeDays: 70, // older grievances count less
    // Damages = the plaintiff's lost profits: daily revenue of the stolen streets at a medium price, for this many days.
    damagesDays: 45,
    dismissedCounterCost: 150_000, // plaintiff pays the defendant's costs if dismissed
  },

  // Competition authority: stops one company from swallowing the market.
  antitrust: {
    warnShare: 0.35, // share of the city's customers that triggers a warning
    actShare: 0.4, // above this for `graceDays`, the company is fined and must sell streets
    graceDays: 30,
    fineRevenueDays: 20,
    divestShare: 0.1, // share of its streets it must give up
    cooldownDays: 120,
  },

  // How bots invest at each difficulty. reserveMult: cash kept back (× their usual
  // reserve) before hiring; repDays: days of salary they want in hand per new sales
  // rep; growth: max new hires per day as a share of staff; leaderFocus: gang up on
  // a runaway leader.
  difficulty: {
    easy: { reserveMult: 3, repDays: 90, growth: 0.2, extraPushReserve: 0.2, leaderFocus: false },
    normal: { reserveMult: 2, repDays: 45, growth: 0.35, extraPushReserve: 0.1, leaderFocus: true },
    hard: { reserveMult: 1, repDays: 20, growth: 0.5, extraPushReserve: 0, leaderFocus: true },
  },

  events: { firstDay: 150, minGap: 120, maxGap: 180 },

  valuation: {
    earningsMultiple: 18, // investors pay 18x annual profit
    profitWindowDays: 30, // trailing average used for the multiple
    unicorn: 1_000_000_000,
  },
} as const;

export const PRICE_LEVELS: PriceLevel[] = ['low', 'medium', 'high'];
