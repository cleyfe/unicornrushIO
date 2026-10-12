export type PriceLevel = 'low' | 'medium' | 'high';
export type BuildingType = 'branch' | 'warehouse' | 'adAgency' | 'legalDept';
export type Personality = 'discounter' | 'balanced' | 'premium';

export interface CompanySpec {
  name: string;
  color: [number, number, number];
  isBot: boolean;
  personality?: Personality;
}

export interface Pnl {
  revenue: number;
  variableCost: number;
  salaries: number;
  rent: number;
  interest: number;
  profit: number;
}

export interface Company {
  id: number;
  name: string;
  color: [number, number, number];
  isBot: boolean;
  personality: Personality;
  alive: boolean;

  cash: number;
  debt: number;
  employees: number; // productive staff
  trainees: { count: number; readyDay: number }[];
  salesShare: number; // 0..1 of productive staff in sales
  price: PriceLevel;
  buildings: Record<BuildingType, number>;
  buildingSpend: number;

  push: number;

  tiles: number;
  customers: number; // customers on owned streets
  spend: number; // customers × wealth multiplier: drives revenue
  border: Set<number>;

  pnl: Pnl; // per day, latest
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
}

export type MarketEventKind = 'recession' | 'supplierHike' | 'boom';

export interface ActiveEvent {
  kind: MarketEventKind;
  endsDay: number;
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
  assets: number;
  earnings: number;
  total: number;
}
