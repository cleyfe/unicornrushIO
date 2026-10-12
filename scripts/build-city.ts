// Builds a playable city from OpenStreetMap data.
//
//   npm run build-city -- <id>          (a city listed in scripts/cities.json)
//   npm run build-city -- paris-opera
//
// Downloads streets, buildings, shops, parks and water for the box from the
// Overpass API (cached in .cache/osm/), and writes public/cities/<id>.json.
// The data is © OpenStreetMap contributors, available under the ODbL.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CityData } from '@unicornrush/engine-api/game/City';

const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass.kumi.systems/api/interpreter';

const STREET_TYPES =
  'primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|living_street|unclassified|pedestrian';
const LUXURY_SHOPS = new Set([
  'jewelry', 'watches', 'boutique', 'fashion', 'perfumery', 'cosmetics', 'art', 'antiques',
  'wine', 'chocolate', 'deli', 'bag', 'shoes', 'clothes', 'furniture', 'interior_decoration',
]);
const BUDGET_SHOPS = new Set(['convenience', 'discount', 'second_hand', 'pawnbroker', 'money_lender', 'mobile_phone', 'kiosk']);

// Tunables for turning buildings into customers.
const FLOOR_M2_PER_CUSTOMER = 900; // floor area that makes one customer unit
const POI_CUSTOMERS = 0.4; // extra foot traffic per shop, café or restaurant
const MAX_SEGMENT_CUSTOMERS = 45; // one giant building (a station, a mall) shouldn't make a super-street
const MAX_ASSIGN_DISTANCE = 70; // metres from a building to its street
const WEALTH_SHARES = [0.3, 0.35, 0.22, 0.13]; // Budget, Middle, Upscale, Luxury

interface OsmElement {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

interface WealthHint {
  name: string;
  lat: number;
  lon: number;
  radius: number; // metres
  weight: number; // > 0 richer, < 0 more modest
}
interface CityConfig {
  name: string;
  bbox: [number, number, number, number]; // south, west, north, east
  wealthHints?: WealthHint[];
}

const id = process.argv[2];
const configs: Record<string, CityConfig> = JSON.parse(readFileSync('scripts/cities.json', 'utf8'));
const config = configs[id];
if (!config) {
  console.error(`Usage: npm run build-city -- <id>, where id is one of: ${Object.keys(configs).join(', ')}`);
  process.exit(1);
}
const { name } = config;
const [south, west, north, east] = config.bbox;
const bbox = `${south},${west},${north},${east}`;

// ---------- download ----------

const cacheDir = '.cache/osm';
mkdirSync(cacheDir, { recursive: true });
const cacheFile = `${cacheDir}/${id}.json`;
if (!existsSync(cacheFile)) {
  const query = `[out:json][timeout:180];
(
  way["highway"~"^(${STREET_TYPES})$"]["area"!="yes"](${bbox});
  way["building"](${bbox});
  node["shop"](${bbox});
  node["amenity"~"^(restaurant|cafe|bar|pub|fast_food)$"](${bbox});
  way["leisure"~"^(park|garden)$"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"="riverbank"](${bbox});
);
out geom;`;
  console.log(`Downloading OSM data for ${bbox} from ${OVERPASS} ...`);
  // curl honours the HTTPS proxy settings; Node's fetch does not.
  execFileSync('curl', ['-sS', '--fail', '-m', '300', '-o', cacheFile, '--data-urlencode', `data=${query}`, OVERPASS], {
    stdio: 'inherit',
  });
}
const elements: OsmElement[] = JSON.parse(readFileSync(cacheFile, 'utf8')).elements;
console.log(`${elements.length} OSM elements`);

// ---------- projection (local metres around the centre) ----------

const lat0 = (south + north) / 2;
const lon0 = (west + east) / 2;
const mPerLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
const mPerLat = 110_540;
const toXY = (lon: number, lat: number): [number, number] => [(lon - lon0) * mPerLon, (lat - lat0) * mPerLat];
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------- streets → segments ----------

const streetWays = elements.filter((e) => e.type === 'way' && e.tags?.highway && e.geometry && e.nodes);
const nodeUse = new Map<number, number>();
for (const w of streetWays) for (const n of w.nodes!) nodeUse.set(n, (nodeUse.get(n) ?? 0) + 1);

interface Seg {
  coords: [number, number][];
  a: number;
  b: number;
  name: string;
}
const segs: Seg[] = [];
for (const w of streetWays) {
  const nodes = w.nodes!;
  const geom = w.geometry!;
  let start = 0;
  for (let k = 1; k < nodes.length; k++) {
    const split = k === nodes.length - 1 || (nodeUse.get(nodes[k]) ?? 0) >= 2;
    if (!split) continue;
    const coords = geom.slice(start, k + 1).map((p) => [round6(p.lon), round6(p.lat)] as [number, number]);
    if (coords.length >= 2 && nodes[start] !== nodes[k]) {
      segs.push({ coords, a: nodes[start], b: nodes[k], name: w.tags?.name ?? '' });
    }
    start = k;
  }
}

// Adjacency through shared intersection nodes.
const atNode = new Map<number, number[]>();
segs.forEach((s, i) => {
  for (const n of [s.a, s.b]) {
    if (!atNode.has(n)) atNode.set(n, []);
    atNode.get(n)!.push(i);
  }
});
const neighbours = segs.map((s, i) => {
  const set = new Set<number>();
  for (const n of [s.a, s.b]) for (const j of atNode.get(n)!) if (j !== i) set.add(j);
  return [...set];
});

// Keep only the largest connected street network.
const comp = new Int32Array(segs.length).fill(-1);
let best = -1;
let bestSize = 0;
for (let i = 0, c = 0; i < segs.length; i++) {
  if (comp[i] >= 0) continue;
  const stack = [i];
  comp[i] = c;
  let size = 0;
  while (stack.length) {
    const v = stack.pop()!;
    size++;
    for (const u of neighbours[v]) if (comp[u] < 0) (comp[u] = c), stack.push(u);
  }
  if (size > bestSize) (bestSize = size), (best = c);
  c++;
}
const keep = segs.map((_, i) => comp[i] === best);
const newIndex = new Int32Array(segs.length).fill(-1);
let count = 0;
keep.forEach((k, i) => k && (newIndex[i] = count++));
const S = segs.filter((_, i) => keep[i]);
const adjOf = neighbours.filter((_, i) => keep[i]).map((ns) => ns.map((j) => newIndex[j]).filter((j) => j >= 0));
console.log(`${segs.length} street segments, ${S.length} in the main network`);

// Segment geometry in metres: midpoint and sample points for nearest-street lookups.
const mid: [number, number][] = [];
const samples: { x: number; y: number; seg: number }[] = [];
S.forEach((s, i) => {
  const pts = s.coords.map(([lon, lat]) => toXY(lon, lat));
  let len = 0;
  const lens = [0];
  for (let k = 1; k < pts.length; k++) {
    len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    lens.push(len);
  }
  // Midpoint along the polyline.
  let m = pts[0];
  for (let k = 1; k < pts.length; k++) {
    if (lens[k] >= len / 2) {
      const t = (len / 2 - lens[k - 1]) / Math.max(1e-9, lens[k] - lens[k - 1]);
      m = [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t];
      break;
    }
  }
  mid.push(m);
  for (let k = 1; k < pts.length; k++) {
    const d = lens[k] - lens[k - 1];
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let q = 0; q <= steps; q++) {
      const t = q / steps;
      samples.push({ x: pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, y: pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t, seg: i });
    }
  }
});

// Spatial grid over the sample points.
const CELL = 40;
const grid = new Map<string, number[]>();
samples.forEach((p, k) => {
  const key = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key)!.push(k);
});
function nearestSegment(x: number, y: number, maxDist: number): number {
  const r = Math.ceil(maxDist / CELL);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let bestSeg = -1;
  let bestD = maxDist * maxDist;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (const k of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const p = samples[k];
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bestD) (bestD = d), (bestSeg = p.seg);
      }
    }
  }
  return bestSeg;
}

// ---------- buildings → customers ----------

const customers = new Float64Array(S.length);
const levelsSum = new Float64Array(S.length);
const levelsN = new Float64Array(S.length);
const rings: [number, number][][] = [];
const ringSeg: number[] = [];
const defaultLevels: Record<string, number> = { house: 2, detached: 2, retail: 2, garage: 1, shed: 1, church: 3, school: 3 };

for (const e of elements) {
  if (e.type !== 'way' || !e.tags?.building || !e.geometry || e.geometry.length < 4) continue;
  const pts = e.geometry.map((p) => toXY(p.lon, p.lat));
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    area += pts[k][0] * pts[k + 1][1] - pts[k + 1][0] * pts[k][1];
    cx += pts[k][0];
    cy += pts[k][1];
  }
  area = Math.abs(area) / 2;
  cx /= pts.length - 1;
  cy /= pts.length - 1;
  const seg = nearestSegment(cx, cy, MAX_ASSIGN_DISTANCE);
  if (seg < 0) continue;
  const levels = Number.parseFloat(e.tags['building:levels'] ?? '') || defaultLevels[e.tags.building] || 5;
  customers[seg] += (area * levels) / FLOOR_M2_PER_CUSTOMER;
  levelsSum[seg] += levels;
  levelsN[seg]++;
  rings.push(e.geometry.map((p) => [round6(p.lon), round6(p.lat)]));
  ringSeg.push(seg);
}

// ---------- shops, parks, water → foot traffic and wealth ----------

const wealthScore = new Float64Array(S.length);
for (const e of elements) {
  if (e.type !== 'node' || !e.tags || e.lat === undefined) continue;
  const [x, y] = toXY(e.lon!, e.lat);
  const seg = nearestSegment(x, y, 40);
  if (seg < 0) continue;
  customers[seg] += POI_CUSTOMERS;
  if (e.tags.shop && LUXURY_SHOPS.has(e.tags.shop)) wealthScore[seg] += 1;
  if (e.tags.shop && BUDGET_SHOPS.has(e.tags.shop)) wealthScore[seg] -= 0.7;
  if (e.tags.amenity === 'fast_food') wealthScore[seg] -= 0.3;
}
const greenPoints: [number, number][] = [];
for (const e of elements) {
  if (e.type !== 'way' || !e.geometry) continue;
  if (e.tags?.leisure || e.tags?.natural === 'water' || e.tags?.waterway) {
    for (const p of e.geometry) greenPoints.push(toXY(p.lon, p.lat));
  }
}
S.forEach((_, i) => {
  const [x, y] = mid[i];
  if (greenPoints.some(([gx, gy]) => (gx - x) * (gx - x) + (gy - y) * (gy - y) < 150 * 150)) wealthScore[i] += 1.2;
  if (levelsN[i] > 0) wealthScore[i] += 0.15 * (levelsSum[i] / levelsN[i] - 5);
  // OSM signals are weak, so curated hints dominate where they exist.
  wealthScore[i] *= 0.3;
  for (const h of config.wealthHints ?? []) {
    const [hx, hy] = toXY(h.lon, h.lat);
    const d = Math.hypot(hx - x, hy - y);
    if (d < h.radius) wealthScore[i] += h.weight * (1 - d / h.radius);
  }
});

// Smooth over the street network so wealth forms neighbourhoods, not single streets.
let w = Float64Array.from(wealthScore);
for (let pass = 0; pass < 6; pass++) {
  const next = new Float64Array(S.length);
  for (let i = 0; i < S.length; i++) {
    let sum = w[i] * 2;
    for (const j of adjOf[i]) sum += w[j];
    next[i] = sum / (2 + adjOf[i].length);
  }
  w = next;
}
// Wealth levels by rank, so every city has all four levels.
const order = [...w.keys()].sort((a, b) => w[a] - w[b] || a - b);
const wealth = new Array<number>(S.length);
let acc = 0;
let tier = 0;
order.forEach((i, rank) => {
  while (tier < 3 && rank >= (acc + WEALTH_SHARES[tier]) * S.length) acc += WEALTH_SHARES[tier++];
  wealth[i] = tier;
});

// ---------- write ----------

const adjStart: number[] = [0];
const adj: number[] = [];
for (const ns of adjOf) {
  adj.push(...ns);
  adjStart.push(adj.length);
}
const city: CityData = {
  id,
  name,
  center: [round6(lon0), round6(lat0)],
  bounds: [west, south, east, north],
  attribution: '© OpenStreetMap contributors (ODbL)',
  segments: {
    coords: S.map((s) => s.coords),
    names: S.map((s) => s.name),
    adjStart,
    adj,
    x: mid.map((m) => round1(m[0])),
    y: mid.map((m) => round1(m[1])),
    customers: [...customers].map((c) => Math.round(Math.min(MAX_SEGMENT_CUSTOMERS, Math.max(0.3, c)) * 100) / 100),
    wealth,
  },
  buildings: { rings, segment: ringSeg },
};
mkdirSync('public/cities', { recursive: true });
const out = `public/cities/${id}.json`;
writeFileSync(out, JSON.stringify(city));
const avg = city.segments.customers.reduce((a, b) => a + b, 0) / S.length;
console.log(`Wrote ${out}: ${S.length} segments, ${rings.length} buildings, avg ${avg.toFixed(2)} customers/segment`);
