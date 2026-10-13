// The city picker's list (public/cities/index.json) and a small street-map thumbnail
// per city (public/cities/thumbs/<id>.svg), made from scripts/cities.json and the
// built city files. Used by `npm run city-index` and `npm run build-city`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodeCity } from '@unicornrush/engine-lib/game/CityCodec';

export interface CityIndexEntry {
  id: string;
  flag: string;
  city: string;
  area: string;
  /** Share of streets at each wealth level: Budget, Middle, Upscale, Luxury. */
  mix: number[];
  streets: number;
}

const THUMB_WIDTH = 200;
// Street colours by wealth, as on the night map.
const THUMB_COLORS = ['#56606e', '#8a8470', '#c29a45', '#fcd34d'];

/** A street map in a few kilobytes: one path per wealth level, whole-pixel steps. */
function thumbnail(id: string): string {
  const city = decodeCity(JSON.parse(readFileSync(`public/cities/${id}.json`, 'utf8')));
  const [west, south, east, north] = city.bounds;
  const kx = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const scale = THUMB_WIDTH / ((east - west) * kx);
  const height = Math.round((north - south) * scale);
  const px = ([lon, lat]: [number, number]) => [Math.round((lon - west) * kx * scale), Math.round((north - lat) * scale)];
  const paths = ['', '', '', ''];
  city.segments.coords.forEach((line, i) => {
    let d = '';
    let [x0, y0] = px(line[0]);
    d += `M${x0} ${y0}`;
    for (const p of line.slice(1)) {
      const [x, y] = px(p);
      if (x === x0 && y === y0) continue;
      d += `l${x - x0} ${y - y0}`;
      (x0 = x), (y0 = y);
    }
    if (d.includes('l')) paths[city.segments.wealth[i]] += d;
  });
  const body = paths
    .map((d, w) => (d ? `<path stroke="${THUMB_COLORS[w]}" stroke-width="${w >= 2 ? 1.1 : 0.8}" d="${d}"/>` : ''))
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${THUMB_WIDTH} ${height}" fill="none" stroke-linecap="round">${body}</svg>`;
}

export function writeCityIndex(): CityIndexEntry[] {
  const configs: Record<string, { flag: string; city: string; area: string; wealthShares?: number[] }> = JSON.parse(
    readFileSync('scripts/cities.json', 'utf8'),
  );
  mkdirSync('public/cities/thumbs', { recursive: true });
  const index: CityIndexEntry[] = [];
  for (const [id, c] of Object.entries(configs)) {
    if (!existsSync(`public/cities/${id}.json`)) continue; // listed but not built yet
    const svg = thumbnail(id);
    writeFileSync(`public/cities/thumbs/${id}.svg`, svg);
    const data = JSON.parse(readFileSync(`public/cities/${id}.json`, 'utf8'));
    const wealth: number[] = data.segments.wealth;
    const mix = [0, 1, 2, 3].map((w) => Math.round((wealth.filter((x) => x === w).length / wealth.length) * 100) / 100);
    index.push({ id, flag: c.flag, city: c.city, area: c.area, mix, streets: wealth.length });
  }
  writeFileSync('public/cities/index.json', JSON.stringify(index, null, 1));
  return index;
}
