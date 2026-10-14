import type { CompanySpec, Difficulty, Personality } from '@unicornrush/engine-api/game/Game';

export const RIVALS: CompanySpec[] = [
  { name: 'BudgetMart', color: [239, 68, 68], isBot: true, personality: 'discounter' },
  { name: 'Steady & Co', color: [34, 197, 94], isBot: true, personality: 'balanced' },
  { name: 'Luxe Ltd', color: [168, 85, 247], isBot: true, personality: 'premium' },
];

/** Extra rivals for bigger matches, in the order they join. */
const MORE_RIVALS: [string, Personality][] = [
  ['QuickShop', 'discounter'],
  ['Atlas Trading', 'balanced'],
  ['Velvet & Sons', 'premium'],
  ['MegaMart', 'discounter'],
  ['Harbor Goods', 'balanced'],
  ['Maison Rivière', 'premium'],
  ['Thrift Hub', 'discounter'],
  ['Summit Supply', 'balanced'],
  ['Orchid Boutique', 'premium'],
  ['Bolt Express', 'discounter'],
  ['Hearth & Home', 'balanced'],
  ['Golden Cart', 'premium'],
  ['Pixel Market', 'discounter'],
  ['Nova Retail', 'balanced'],
  ['Ember Outfitters', 'premium'],
  ['Corner Store', 'discounter'],
  ['Cobalt & Co', 'balanced'],
  ['Grand Bazaar', 'premium'],
  ['Penny Lane', 'discounter'],
  ['Union Provisions', 'balanced'],
];

/** Most rivals a match can have. */
export const MAX_RIVALS = RIVALS.length + MORE_RIVALS.length;

const PLAYER_COLOR: [number, number, number] = [59, 130, 246];

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** A colour for extra rival `i`: spread around the colour wheel, away from the player's blue. */
function extraColor(i: number): [number, number, number] {
  let hue = (20 + i * 137.508) % 360;
  if (hue > 195 && hue < 240) hue = (hue + 50) % 360; // keep clear of the player's blue
  const light = i % 2 === 0 ? 0.6 : 0.5;
  return hsl(hue, 0.72, light);
}

/** The player (company 0) plus `rivals` rival companies (3 by default, up to MAX_RIVALS). */
export function defaultCompanies(playerName = 'You', playerIsBot = false, difficulty: Difficulty = 'normal', rivals = 3): CompanySpec[] {
  const n = Math.max(1, Math.min(MAX_RIVALS, Math.floor(rivals)));
  const all: CompanySpec[] = [
    ...RIVALS,
    ...MORE_RIVALS.map(([name, personality], i) => ({ name, color: extraColor(i), isBot: true, personality })),
  ];
  return [
    { name: playerName, color: PLAYER_COLOR, isBot: playerIsBot, personality: 'balanced', difficulty },
    ...all.slice(0, n).map((r) => ({ ...r, difficulty })),
  ];
}

/** Colours for human players online, picked to stay apart from each other and from the bots' red, green and purple. */
const HUMAN_COLORS: [number, number, number][] = [
  [59, 130, 246], // blue
  [249, 115, 22], // orange
  [6, 182, 212], // cyan
  [236, 72, 153], // pink
  [234, 179, 8], // yellow
  [20, 184, 166], // teal
  [99, 102, 241], // indigo
  [132, 204, 22], // lime
];

/** Most human players in one online match. */
export const MAX_HUMANS = HUMAN_COLORS.length;

/** An online match: the humans (in seat order), then `bots` rivals at `difficulty`. */
export function multiplayerCompanies(names: string[], difficulty: Difficulty = 'normal', bots = 0): CompanySpec[] {
  const humans = names.slice(0, MAX_HUMANS).map((name, i) => ({
    name,
    color: HUMAN_COLORS[i],
    isBot: false,
    personality: 'balanced' as const,
    difficulty,
  }));
  const rivals = Math.max(0, Math.min(MAX_RIVALS, Math.floor(bots)));
  return [...humans, ...(rivals > 0 ? defaultCompanies('', true, difficulty, rivals).slice(1) : [])];
}
