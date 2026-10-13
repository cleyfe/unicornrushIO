export type PriceLevel = 'low' | 'medium' | 'high';
export type Personality = 'discounter' | 'balanced' | 'premium';
/** How well bots play: easy bots invest cautiously, hard ones like a skilled player. */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface CompanySpec {
  name: string;
  color: [number, number, number];
  isBot: boolean;
  personality?: Personality;
  difficulty?: Difficulty;
  /** Starting price; defaults to the personality's usual price. */
  price?: PriceLevel;
}

export interface OneOffFlows {
  hiring: number; // recruiting costs paid (negative)
  severance: number; // firing costs paid (negative)
  legalFees: number; // lawsuit fees and costs paid (negative)
  advertising: number; // ad purchases (negative)
  damages: number; // lawsuit damages received (+) or paid (−)
}

export interface Pnl {
  revenue: number;
  variableCost: number;
  salaries: number;
  interest: number;
  profit: number;
}

export interface Company {
  id: number;
  name: string;
  color: [number, number, number];
  isBot: boolean;
  personality: Personality;
  difficulty: Difficulty;
  alive: boolean;

  cash: number;
  debt: number;
  employees: number; // productive staff
  trainees: { count: number; readyDay: number }[];
  salesShare: number; // 0..1 of productive staff in sales
  price: PriceLevel;
  /** A price change still rolling out: big companies take longer to change. */
  pendingPrice: { price: PriceLevel; day: number } | null;
  /** Share of the company the founders still own (investors buy the rest). */
  stake: number;
  /** An opportunity to pick from, if any. */
  offer: Offer | null;
  /** Temporary perks and troubles, as the day they end. */
  supplierDealUntil: number;
  /** A strike, announced in advance: operations run short from strikeFrom to strikeUntil. */
  strikeFrom: number;
  strikeUntil: number;

  push: number;
  /** Push committed to campaigns still running. */
  pushCommitted: number;
  /** Recent advertising (makes the next ad pricier). */
  adHeat: number;

  tiles: number;
  customers: number; // customers on owned streets
  spend: number; // customers × wealth multiplier: drives revenue
  /** Customers and spend per wealth level, for price elasticity that depends on wealth. */
  tierCustomers: number[];
  tierSpend: number[];
  border: Set<number>;

  pnl: Pnl; // per day, latest
  /** One-off cash flows since the start, outside the daily P&L. */
  oneOff: OneOffFlows;
  avgProfit: number; // trailing average per day
  churnCarry: number;
  negativeCashDays: number;

  peakTiles: number;
  peakValuation: number;
  closedDay: number | null;
}

export interface Lawsuit {
  plaintiff: number;
  defendant: number;
  filedDay: number;
  rulingDay: number;
  /** Legal fees the plaintiff paid; a dismissed case also costs it a share of this. */
  fee: number;
}

export type MarketEventKind = 'recession' | 'supplierHike' | 'boom';

export interface ActiveEvent {
  kind: MarketEventKind;
  endsDay: number;
}

/** A market event announced in advance, so players can prepare. */
export interface Forecast {
  kind: MarketEventKind;
  startsDay: number;
}

/** Something happening in one part of the city. */
export type LocalEventKind = 'metro' | 'roadworks' | 'festival';

export interface LocalEvent {
  kind: LocalEventKind;
  /** The street at the centre of the area, and the area's radius in metres. */
  center: number;
  radius: number;
  streets: number[];
  startsDay: number;
  /** null for permanent changes (a new metro station stays). */
  endsDay: number | null;
  active: boolean;
}

/**
 * Opportunity cards: every so often a company is offered three and picks one.
 * Companies further behind get them more often, and bigger ones.
 */
export type CardKind = 'viral' | 'starTeam' | 'supplierDeal' | 'investor' | 'grant' | 'defectors';

export interface Card {
  kind: CardKind;
  /** Push, people, days, dollars or streets, depending on the kind. */
  amount: number;
  /** For an investor: the share of the company they buy. */
  stake?: number;
}

export interface Offer {
  cards: Card[];
  expiresDay: number;
}

export type MessageTone = 'info' | 'good' | 'bad' | 'error';

export interface LogEntry {
  id: number;
  day: number;
  text: string;
  tone: MessageTone;
  /** Set for private messages (e.g. rejected actions); otherwise public news. */
  recipient?: number;
}

export type WinReason = 'unicorn' | 'time' | 'lastStanding' | 'playerBankrupt';

export interface GameResult {
  winnerId: number | null;
  reason: WinReason;
  day: number;
}

export interface ValuationBreakdown {
  cash: number;
  debt: number;
  earnings: number;
  total: number;
}
