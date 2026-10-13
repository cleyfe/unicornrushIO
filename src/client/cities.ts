/**
 * Playable cities, listed in public/cities/index.json. That file is generated
 * from scripts/cities.json by `npm run build-city` / `npm run city-index`, so
 * adding a city needs no client change.
 */
export interface CityInfo {
  id: string;
  flag: string;
  city: string;
  area: string;
  /** Share of streets at each wealth level: Budget, Middle, Upscale, Luxury. */
  mix: number[];
  streets: number;
}

let index: Promise<CityInfo[]> | null = null;

export function loadCityIndex(): Promise<CityInfo[]> {
  index ??= fetch('cities/index.json').then((r) => {
    if (!r.ok) throw new Error(`Could not load the city list (${r.status}).`);
    return r.json() as Promise<CityInfo[]>;
  });
  return index;
}
