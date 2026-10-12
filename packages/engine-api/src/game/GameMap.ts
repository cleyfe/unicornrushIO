/** Owner value for tiles nobody can own (blocks, river, parks). */
export const WATER = -2;
/** Owner value for the untapped market. */
export const NEUTRAL = -1;

/** What is on a tile of the city. Only streets and bridges can be owned. */
export const Terrain = {
  Street: 0, // a stretch of street with shops and customers
  River: 1,
  Park: 2, // the inside of a park block
  Bridge: 3, // a street crossing the river; few customers
  Block: 4, // the inside of a city block: homes and offices, scenery only
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** How wealthy a street's customers are; indexes `CONFIG.wealth`. */
export const Wealth = { Budget: 0, Middle: 1, Upscale: 2, Luxury: 3 } as const;
export type Wealth = (typeof Wealth)[keyof typeof Wealth];

export interface GameMap {
  width: number;
  height: number;
  /** A street runs along every row and column that is a multiple of this. */
  streetEvery: number;
  terrain: Uint8Array;
  /** Customers on each street tile (0 elsewhere). */
  demand: Float32Array;
  /** Wealth level of each tile's neighbourhood. */
  wealth: Uint8Array;
  /** Customers × how much each spends: what revenue is based on. */
  spend: Float32Array;
  /** 1 where nobody can own the tile. */
  isWater: Uint8Array;
}
