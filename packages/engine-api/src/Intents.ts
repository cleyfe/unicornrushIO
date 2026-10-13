import type { PriceLevel } from './game/Game';

/**
 * Everything a company can decide. Players and bots both act only through
 * intents, so they play by exactly the same rules; in multiplayer these are
 * what gets sent over the wire.
 */
export type Intent =
  | { type: 'campaign'; companyId: number; tile: number }
  | { type: 'setSalesShare'; companyId: number; share: number }
  /** Share of the push pool each click commits, from 10% to 100%. */
  | { type: 'setCampaignShare'; companyId: number; share: number }
  /** Buys a block of a rival's streets around `tile` (next to yours), paying the rival. */
  | { type: 'buyStreets'; companyId: number; tile: number }
  | { type: 'setPrice'; companyId: number; price: PriceLevel }
  | { type: 'hire'; companyId: number; count: number }
  | { type: 'fire'; companyId: number; count: number }
  | { type: 'borrow'; companyId: number }
  | { type: 'repay'; companyId: number }
  /** An ad campaign aimed at a street: its push wins streets toward it until spent. */
  | { type: 'advertise'; companyId: number; tile: number }
  /** Posts a dedicated account team on the neighbourhood around one of your streets. */
  | { type: 'guard'; companyId: number; tile: number }
  | { type: 'lawsuit'; companyId: number; targetId: number }
  /** Takes card `index` of the current offer; -1 passes. */
  | { type: 'pickCard'; companyId: number; index: number };

export type IntentType = Intent['type'];
