import type { Intent } from '@unicornrush/engine-api/Intents';
import { CampaignExecution } from './CampaignExecution';
import {
  BorrowExecution,
  BuildExecution,
  FireExecution,
  HireExecution,
  RepayExecution,
  SetPriceExecution,
  SetSalesShareExecution,
} from './CompanyActionExecutions';
import type { Execution } from './Execution';
import { LawsuitExecution } from './LawsuitExecution';

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
    case 'build':
      return new BuildExecution(intent.companyId, intent.building);
    case 'borrow':
      return new BorrowExecution(intent.companyId);
    case 'repay':
      return new RepayExecution(intent.companyId);
    case 'lawsuit':
      return new LawsuitExecution(intent.companyId, intent.targetId);
  }
}
