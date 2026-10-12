// All tunable numbers live here. Money is in dollars, time is in game days.
// 1 game day = 1 real second at 1x speed.
import type { BuildingType, PriceLevel } from '@unicornrush/engine-api/game/Game';

export const CONFIG = {
  ticksPerDay: 10,
  matchDays: 900, // ~2.5 years, 15 minutes at 1x

  map: {
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
  // priceSensitivity: how much undercutting matters when fighting for them.
  // prestige: how much a high price helps (and a low price hurts) loyalty.
  wealth: [
    { label: 'Budget', spend: 0.7, density: 1.2, priceSensitivity: 1.3, prestige: 0.9 },
    { label: 'Middle', spend: 1.0, density: 1.0, priceSensitivity: 1.0, prestige: 1.0 },
    { label: 'Upscale', spend: 1.5, density: 0.8, priceSensitivity: 0.6, prestige: 1.25 },
    { label: 'Luxury', spend: 2.2, density: 0.6, priceSensitivity: 0.3, prestige: 1.6 },
  ],

  start: { cash: 60_000, employees: 10, radius: 5, salesShare: 0.5 },

  staff: {
    salaryPerDay: 100,
    hireCost: 500, // recruiting + onboarding, paid once
    fireCost: 300, // severance
    trainingDays: 8, // new hires are paid but not productive yet
    tilesPerOps: 6, // street sections one operations employee can serve
  },

  // Revenue per customer per day, before the street's wealth multiplier.
  prices: {
    low: { revenue: 25, push: 1.3, loyalty: 1.5, label: 'Low' },
    medium: { revenue: 40, push: 1.0, loyalty: 1.0, label: 'Medium' },
    high: { revenue: 55, push: 0.75, loyalty: 0.7, label: 'High' },
  } satisfies Record<PriceLevel, { revenue: number; push: number; loyalty: number; label: string }>,

  variableCostPerCustomer: 15, // per customer per day

  sales: {
    pushPerRepPerDay: 0.38,
    maxPushDaysStored: 30, // push pool caps at sales reps × this
    neutralTileCost: 2, // × customers × wealth push factor
    rivalTileCost: 6, // × customers × wealth push factor × defense multiplier
    campaignShare: 0.5, // share of the push pool committed per click
  },

  churn: { ratePerDay: 0.05 }, // share of over-capacity areas lost per day

  bankruptcyGraceDays: 10,

  bank: { loanChunk: 25_000, maxDebtRevenueDays: 60, interestPerYear: 0.24 },

  buildings: {
    branch: { cost: 20_000, rentPerDay: 150, label: 'Branch', max: 20, capacity: 18 },
    warehouse: { cost: 40_000, rentPerDay: 400, label: 'Warehouse', max: 3, variableCostMult: 0.7 },
    adAgency: { cost: 30_000, rentPerDay: 300, label: 'Ad Agency', max: 3, pushBonus: 0.5 },
    legalDept: { cost: 60_000, rentPerDay: 500, label: 'Legal Dept', max: 2, defense: 0.35 },
  } satisfies Record<BuildingType, { cost: number; rentPerDay: number; label: string; max: number; [effect: string]: number | string }>,

  // The class action lawsuit: an expensive strike that hits a rival's
  // customers all over its territory. Needs a Legal Dept to file; each Legal
  // Dept the defendant has gives it a chance to get the case dismissed.
  lawsuit: {
    cost: 250_000, // legal fees, paid when filing
    courtDays: 30, // time until the ruling: the defendant can prepare
    customerLoss: 0.25, // share of the defendant's customers lost
    clusters: 12, // the loss is spread over this many places
    damagesRevenueDays: 20, // defendant pays plaintiff this many days of revenue
    dismissedCounterCost: 50_000, // plaintiff pays defendant's costs if dismissed
  },

  events: { firstDay: 150, minGap: 120, maxGap: 180 },

  valuation: {
    assetRecovery: 0.5, // buildings resell for half their cost
    earningsMultiple: 10, // investors pay 10x annual profit
    profitWindowDays: 30, // trailing average used for the multiple
    unicorn: 1_000_000_000,
  },
} as const;

export const PRICE_LEVELS: PriceLevel[] = ['low', 'medium', 'high'];
export const BUILDING_TYPES: BuildingType[] = ['branch', 'warehouse', 'adAgency', 'legalDept'];
