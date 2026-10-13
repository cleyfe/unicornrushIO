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
    campaignShare: 0.5, // default share of the push pool committed per click (each company sets its own)
    minCampaignShare: 0.1,
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
    // Legal fees scale with the plaintiff's size: lawyers charge a small company
    // little up front and take a share of the damages instead (a contingency fee).
    minFee: 25_000,
    feeRevenueDays: 10, // fee = this many days of the plaintiff's revenue, at least minFee
    lawyerShare: 0.3, // share of the damages the lawyers keep
    courtDays: 10, // time until the ruling
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
    dismissedCostShare: 0.6, // if dismissed, the plaintiff also pays the defendant's costs: this share of its own fee
  },

  // Acquisitions: buy a whole rival. Its owners want a premium over its valuation;
  // you take over its streets, staff, cash and debt. The competition authority
  // blocks a deal that would leave the buyer with too much of the market.
  acquisition: {
    premium: 1.3,
    minPrice: 100_000,
  },

  // Guard: a dedicated account team for one neighbourhood. Your streets around
  // the chosen one cost rivals more push to steal, for a while.
  guard: {
    radius: 250, // metres
    days: 60,
    defenceMult: 1.6,
    costPerCustomer: 250, // per customer you own in the area
    minCost: 5_000,
  },

  // Big companies are slower: a price change takes a day per this many employees to roll out.
  agility: { employeesPerDelayDay: 40, maxDelayDays: 15 },

  // Opportunity cards, Mario Kart style: companies further behind get offers
  // more often, and bigger ones. luck goes from leaderLuck (1st) to lastLuck (last).
  cards: {
    firstDay: 30,
    minGap: 70,
    maxGap: 110,
    offerDays: 30, // time to pick before the offer expires
    leaderLuck: 0.6,
    lastLuck: 1.6,
    viralPushShare: 0.35, // × push cap × luck
    starTeamShare: 0.05, // × staff × luck, trained and ready (at least 3)
    supplierDealDays: 30, // × luck; variable costs × supplierDealMult
    supplierDealMult: 0.6,
    investorValuationShare: 0.1, // cash = valuation × this × luck, between investorMin and investorMax
    investorMin: 100_000,
    investorMax: 500_000,
    investorStake: 0.15,
    grantRevenueDays: 5, // × daily revenue × luck (at least grantMin); only for small companies
    grantMin: 30_000,
    grantMax: 100_000,
    defectorStreets: 4, // × luck: a rival's customers next to you switch to you
  },

  // The press, unions and hackers go after the biggest company.
  scrutiny: {
    firstDay: 120,
    minGap: 70,
    maxGap: 110,
    minLead: 1.4, // only when the leader is worth this many times the runner-up
    strikeWarningDays: 7,
    strikeDays: 8,
    strikeCapacity: 0.6, // operations capacity during a strike
    pressStreetShare: 0.05, // streets lost to an exposé
    breachRevenueDays: 5, // fine for a data breach
  },

  // Things happening in one part of the city, announced in advance.
  localEvents: {
    firstDay: 60,
    minGap: 50,
    maxGap: 90,
    warningDays: 15,
    radiusShare: 0.09, // of the city's width
    metro: { demand: 1.4, spend: 1.4, days: null }, // a new metro station: permanent
    roadworks: { demand: 1, spend: 0.6, days: 40 },
    festival: { demand: 1, spend: 1.5, days: 20 },
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
  // expandEveryDays: days between two sales campaigns; salesMult: size of the sales team
  // they aim for; serviceBonus: extra operations staff kept (costly); streetJudgement:
  // 1 = picks streets by value per push like a pro, 0 = picks any street nearby;
  // aggressionMult: appetite for taking rivals' streets.
  difficulty: {
    easy: { reserveMult: 3, repDays: 90, growth: 0.1, extraPushReserve: 0.2, leaderFocus: false, expandEveryDays: 3, salesMult: 0.4, serviceBonus: 0.5, streetJudgement: 1, aggressionMult: 1 },
    normal: { reserveMult: 2, repDays: 45, growth: 0.35, extraPushReserve: 0.1, leaderFocus: true, expandEveryDays: 1, salesMult: 1, serviceBonus: 0, streetJudgement: 1, aggressionMult: 1 },
    hard: { reserveMult: 1, repDays: 20, growth: 0.5, extraPushReserve: 0, leaderFocus: true, expandEveryDays: 1, salesMult: 1, serviceBonus: 0.1, streetJudgement: 1, aggressionMult: 1 },
  },

  events: { firstDay: 150, minGap: 120, maxGap: 180, warningDays: 10 },

  valuation: {
    earningsMultiple: 18, // investors pay 18x annual profit
    profitWindowDays: 30, // trailing average used for the multiple
    unicorn: 1_000_000_000,
  },
} as const;

export const PRICE_LEVELS: PriceLevel[] = ['low', 'medium', 'high'];
