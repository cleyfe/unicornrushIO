/** Owner value for tiles nobody can own (river, parks). */
export const WATER = -2;
/** Owner value for the untapped market. */
export const NEUTRAL = -1;

/** What stands on a tile of the city. */
export const Terrain = {
  Lot: 0, // a building with customers
  River: 1,
  Park: 2,
  Bridge: 3, // crosses the river; few customers, but ownable
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface GameMap {
  width: number;
  height: number;
  /** Tiles per city block side; streets run between blocks. */
  blockSize: number;
  /** Customers per tile (0 for river and parks). */
  demand: Float32Array;
  terrain: Uint8Array;
  /** 1 where nobody can own the tile (river, parks). */
  isWater: Uint8Array;
}
