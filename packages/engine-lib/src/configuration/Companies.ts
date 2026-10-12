import type { CompanySpec } from '@unicornrush/engine-api/game/Game';

export const RIVALS: CompanySpec[] = [
  { name: 'BudgetMart', color: [239, 68, 68], isBot: true, personality: 'discounter' },
  { name: 'Steady & Co', color: [34, 197, 94], isBot: true, personality: 'balanced' },
  { name: 'Luxe Ltd', color: [168, 85, 247], isBot: true, personality: 'premium' },
];

/** The player (company 0) plus the three rivals. */
export function defaultCompanies(playerName = 'You', playerIsBot = false): CompanySpec[] {
  return [{ name: playerName, color: [59, 130, 246], isBot: playerIsBot, personality: 'balanced' }, ...RIVALS];
}
