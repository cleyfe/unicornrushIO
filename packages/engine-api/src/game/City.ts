/**
 * A playable city, built offline from OpenStreetMap by `scripts/build-city.ts`
 * and loaded as a static file, so every player gets exactly the same map.
 *
 * Territory is street segments (a street between two intersections). Buildings
 * belong to their nearest segment and only matter for drawing.
 */
export interface CityData {
  id: string;
  name: string;
  /** Map centre and bounds, in [lon, lat]. */
  center: [number, number];
  bounds: [number, number, number, number]; // west, south, east, north
  attribution: string;
  segments: {
    /** Polyline per segment, [lon, lat] pairs. */
    coords: [number, number][][];
    /** Street name per segment (may be empty). */
    names: string[];
    /** Neighbours in CSR form: segment i touches adj[adjStart[i]..adjStart[i+1]). */
    adjStart: number[];
    adj: number[];
    /** Segment midpoint in metres from the city centre (east, north). */
    x: number[];
    y: number[];
    /** Customers along the segment. */
    customers: number[];
    /** Wealth level (0 Budget … 3 Luxury). */
    wealth: number[];
  };
  buildings: {
    /** Footprint outline per building, [lon, lat] pairs. */
    rings: [number, number][][];
    /** Index of the segment each building belongs to. */
    segment: number[];
  };
}
