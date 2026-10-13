import type { Card, CardKind } from '@unicornrush/engine-api/game/Game';
import { money, pct } from '../Format';
import { CONFIG } from './Config';

const K = CONFIG.cards;

/** What each opportunity card is, for news and the card picker. */
export const CARD_INFO: Record<CardKind, { icon: string; title: string; lesson: string }> = {
  viral: { icon: '📣', title: 'Viral review', lesson: 'Word of mouth is free marketing.' },
  starTeam: { icon: '🌟', title: 'Star team joins', lesson: 'Experienced hires are productive from day one.' },
  supplierDeal: { icon: '📦', title: 'Supplier deal', lesson: 'Lower variable costs raise the margin on every sale.' },
  investor: { icon: '💼', title: 'Investor offer', lesson: 'Raising money gives you cash now, but you own less of your company.' },
  grant: { icon: '🏛️', title: 'Small-business grant', lesson: 'Governments help small companies compete.' },
  defectors: { icon: '🧲', title: 'Unhappy customers', lesson: "A rival's unhappy customers are your opportunity." },
};

/** What a card says, for the card picker and news. */
export function describeCard(card: Card): string {
  switch (card.kind) {
    case 'viral':
      return `+${card.amount} sales push right now`;
    case 'starTeam':
      return `${card.amount} experienced people join, trained and ready (salaries only)`;
    case 'supplierDeal':
      return `Variable costs −${pct(1 - K.supplierDealMult)} for ${card.amount} days`;
    case 'investor':
      return `${money(card.amount)} cash for ${pct(card.stake ?? 0)} of your company`;
    case 'grant':
      return `${money(card.amount)} cash, no strings attached`;
    case 'defectors':
      return `Up to ${card.amount} of a rival's streets next to you switch to you`;
  }
}
