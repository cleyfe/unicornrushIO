import type { LocalEventKind, MarketEventKind } from '@unicornrush/engine-api/game/Game';
import { CONFIG } from './Config';

const L = CONFIG.localEvents;
const pctChange = (m: number) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;

export const EVENT_INFO: Record<MarketEventKind, { title: string; days: number; text: string }> = {
  recession: { title: 'Recession', days: 60, text: 'Customers spend less: revenue −30%.' },
  supplierHike: { title: 'Supplier price hike', days: 45, text: 'Variable costs ×2.' },
  boom: { title: 'Consumer boom', days: 60, text: 'Customers spend more: revenue +25%.' },
};

export const LOCAL_EVENT_INFO: Record<
  LocalEventKind,
  { icon: string; title: string; announced: string; started: string; ended: string; effect: string }
> = {
  metro: {
    icon: '🚇',
    title: 'New metro station',
    announced: 'A new metro station opens',
    started: 'The new metro station is open',
    ended: 'The metro station opened',
    effect: `${pctChange(L.metro.demand)} customers on nearby streets, for good.`,
  },
  roadworks: {
    icon: '🚧',
    title: 'Roadworks',
    announced: 'Roadworks start',
    started: 'Roadworks started',
    ended: 'Roadworks are over',
    effect: `customers on nearby streets spend ${pctChange(L.roadworks.spend)} for ${L.roadworks.days} days.`,
  },
  festival: {
    icon: '🎪',
    title: 'Street festival',
    announced: 'A street festival starts',
    started: 'The street festival is on',
    ended: 'The street festival is over',
    effect: `customers on nearby streets spend ${pctChange(L.festival.spend)} for ${L.festival.days} days.`,
  },
};
