/** Owner value for the untapped market. */
export const NEUTRAL = -1;

/** How wealthy a street's customers are; indexes `CONFIG.wealth`. */
export const Wealth = { Budget: 0, Middle: 1, Upscale: 2, Luxury: 3 } as const;
export type Wealth = (typeof Wealth)[keyof typeof Wealth];

/**
 * The market as a graph of street segments. Every segment can be owned;
 * two segments are neighbours when they meet at an intersection.
 */
export interface GameMap {
  size: number;
  /** Neighbours in CSR form: tile i touches adj[adjStart[i]..adjStart[i+1]). */
  adjStart: Int32Array;
  adj: Int32Array;
  /** Segment midpoint in metres (east, north). */
  x: Float32Array;
  y: Float32Array;
  /** Customers along each segment. */
  demand: Float32Array;
  /** Wealth level of each segment's neighbourhood. */
  wealth: Uint8Array;
  /** Customers × how much each spends: what revenue is based on. */
  spend: Float32Array;
}
