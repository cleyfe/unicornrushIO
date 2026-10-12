// All tunable numbers live here. Money is in dollars, time is in game days.
// 1 game day = 1 real second at 1x speed.
import type { BuildingType, PriceLevel } from '@unicornrush/engine-api/game/Game';

export const CONFIG = {
  ticksPerDay: 10,
  matchDays: 900, // ~2.5 years, 15 minutes at 1x

  map: { width: 160, height: 100, blockSize: 4, downtowns: 6, parkShare: 0.07, bridgeEveryBlocks: 5 },

  start: { cash: 60_000, employees: 10, radius: 3, salesShare: 0.5 },

  staff: {
    salaryPerDay: 100,
    hireCost: 500, // recruiting + onboarding, paid once
    fireCost: 300, // severance
    trainingDays: 8, // new hires are paid but not productive yet
    tilesPerOps: 10, // customer areas one operations employee can serve
  },

  // Revenue is per customer (tile demand) per day.
  prices: {
    low: { revenue: 25, push: 1.3, loyalty: 1.5, label: 'Low' },
    medium: { revenue: 40, push: 1.0, loyalty: 1.0, label: 'Medium' },
    high: { revenue: 55, push: 0.75, loyalty: 0.7, label: 'High' },
  } satisfies Record<PriceLevel, { revenue: number; push: number; loyalty: number; label: string }>,

  variableCostPerCustomer: 15, // per customer per day

  sales: {
    pushPerRepPerDay: 0.35,
    maxPushDaysStored: 30, // push pool caps at sales reps × this
    neutralTileCost: 2, // × tile demand
    rivalTileCost: 6, // × tile demand × defense multiplier
    campaignShare: 0.5, // share of the push pool committed per click
  },

  churn: { ratePerDay: 0.05 }, // share of over-capacity areas lost per day

  bankruptcyGraceDays: 10,

  bank: { loanChunk: 25_000, maxDebtRevenueDays: 60, interestPerYear: 0.24 },

  buildings: {
    branch: { cost: 20_000, rentPerDay: 150, label: 'Branch', max: 20, capacity: 30 },
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
