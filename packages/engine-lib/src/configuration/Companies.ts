import type { CompanySpec } from '@unicornrush/engine-api/game/Game';

export const RIVALS: CompanySpec[] = [
  { name: 'BudgetMart', color: [231, 76, 60], isBot: true, personality: 'discounter' },
  { name: 'Steady & Co', color: [46, 204, 113], isBot: true, personality: 'balanced' },
  { name: 'Luxe Ltd', color: [155, 89, 182], isBot: true, personality: 'premium' },
];

/** The player (company 0) plus the three rivals. */
export function defaultCompanies(playerName = 'You', playerIsBot = false): CompanySpec[] {
  return [{ name: playerName, color: [52, 152, 219], isBot: playerIsBot, personality: 'balanced' }, ...RIVALS];
}
