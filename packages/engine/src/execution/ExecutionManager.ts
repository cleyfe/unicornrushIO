import type { Intent } from '@unicornrush/engine-api/Intents';
import { CampaignExecution } from './CampaignExecution';
import {
  AdvertiseExecution,
  BorrowExecution,
  FireExecution,
  GuardExecution,
  HireExecution,
  RepayExecution,
  SetPriceExecution,
  SetSalesShareExecution,
} from './CompanyActionExecutions';
import type { Execution } from './Execution';
import { LawsuitExecution } from './LawsuitExecution';
import { PickCardExecution } from './OpportunityExecution';

/** Turns an intent (from a player or a bot) into the execution that applies it. */
export function createExecution(intent: Intent): Execution {
  switch (intent.type) {
    case 'campaign':
      return new CampaignExecution(intent.companyId, intent.tile);
    case 'setSalesShare':
      return new SetSalesShareExecution(intent.companyId, intent.share);
    case 'setPrice':
      return new SetPriceExecution(intent.companyId, intent.price);
    case 'hire':
      return new HireExecution(intent.companyId, intent.count);
    case 'fire':
      return new FireExecution(intent.companyId, intent.count);
    case 'borrow':
      return new BorrowExecution(intent.companyId);
    case 'repay':
      return new RepayExecution(intent.companyId);
    case 'advertise':
      return new AdvertiseExecution(intent.companyId, intent.tile);
    case 'guard':
      return new GuardExecution(intent.companyId, intent.tile);
    case 'lawsuit':
      return new LawsuitExecution(intent.companyId, intent.targetId);
    case 'pickCard':
      return new PickCardExecution(intent.companyId, intent.index);
  }
}
