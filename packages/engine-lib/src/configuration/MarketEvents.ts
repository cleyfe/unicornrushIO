import type { MarketEventKind } from '@unicornrush/engine-api/game/Game';

export const EVENT_INFO: Record<MarketEventKind, { title: string; days: number; text: string }> = {
  recession: { title: 'Recession', days: 60, text: 'Customers spend less: revenue −30%.' },
  supplierHike: { title: 'Supplier price hike', days: 45, text: 'Variable costs ×2.' },
  boom: { title: 'Consumer boom', days: 60, text: 'Customers spend more: revenue +25%.' },
};
