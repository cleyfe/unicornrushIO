import type { CityData } from '@unicornrush/engine-api/game/City';

/**
 * Compact on-disk form of a city (public/cities/<id>.json), about 4× smaller than
 * CityData before gzip. Coordinates are whole steps of 1/QUANT degree (about 1 m)
 * from the city's south-west corner, delta-encoded along each line; building
 * outlines are simplified to that precision; street names are stored once.
 */
export interface CityFile {
  v: 2;
  id: string;
  name: string;
  center: [number, number];
  bounds: [number, number, number, number];
  attribution: string;
  segments: {
    /** Points per polyline, then all polylines' [dLon, dLat] steps, flattened. */
    lens: number[];
    coords: number[];
    nameTable: string[];
    names: number[];
    /** Neighbour count per segment (adjStart is their running sum). */
    degree: number[];
    adj: number[];
    x: number[];
    y: number[];
    customers: number[];
    wealth: number[];
  };
  buildings: { lens: number[]; rings: number[]; segment: number[] };
}

const QUANT = 100_000;

function packLines(lines: [number, number][][], west: number, south: number) {
  const lens: number[] = [];
  const out: number[] = [];
  for (const line of lines) {
    lens.push(line.length);
    let px = 0;
    let py = 0;
    for (const [lon, lat] of line) {
      const x = Math.round((lon - west) * QUANT);
      const y = Math.round((lat - south) * QUANT);
      out.push(x - px, y - py);
      px = x;
      py = y;
    }
  }
  return { lens, out };
}

function unpackLines(lens: number[], flat: number[], west: number, south: number): [number, number][][] {
  const lines: [number, number][][] = [];
  let k = 0;
  for (const n of lens) {
    const line: [number, number][] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += flat[k++];
      y += flat[k++];
      line.push([west + x / QUANT, south + y / QUANT]);
    }
    lines.push(line);
  }
  return lines;
}

/** Drops points within `tol` quantised steps of the line through their neighbours (Ramer–Douglas–Peucker). */
function simplify(ring: [number, number][], tol: number, west: number, south: number): [number, number][] {
  const q = ring.map(([lon, lat]) => [Math.round((lon - west) * QUANT), Math.round((lat - south) * QUANT)] as const);
  const keep = new Uint8Array(q.length);
  keep[0] = keep[q.length - 1] = 1;
  const stack: [number, number][] = [[0, q.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let worstD = tol;
    const [ax, ay] = q[a];
    const [bx, by] = q[b];
    const len = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const [px, py] = q[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > worstD) (worstD = d), (worst = i);
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

export function encodeCity(city: CityData): CityFile {
  const [west, south] = city.bounds;
  const s = city.segments;
  const seg = packLines(s.coords, west, south);
  const rings = packLines(
    city.buildings.rings.map((r) => simplify(r, 0.8, west, south)),
    west,
    south,
  );
  const nameTable = [...new Set(s.names)];
  const nameIndex = new Map(nameTable.map((n, i) => [n, i]));
  return {
    v: 2,
    id: city.id,
    name: city.name,
    center: city.center,
    bounds: city.bounds,
    attribution: city.attribution,
    segments: {
      lens: seg.lens,
      coords: seg.out,
      nameTable,
      names: s.names.map((n) => nameIndex.get(n)!),
      degree: s.adjStart.slice(1).map((end, i) => end - s.adjStart[i]),
      adj: s.adj,
      x: s.x,
      y: s.y,
      customers: s.customers,
      wealth: s.wealth,
    },
    buildings: { lens: rings.lens, rings: rings.out, segment: city.buildings.segment },
  };
}

/** Accepts the compact file or a plain CityData (older files, tests). */
export function decodeCity(file: CityFile | CityData): CityData {
  if (!('v' in file)) return file;
  const [west, south] = file.bounds;
  const s = file.segments;
  const adjStart = [0];
  for (const d of s.degree) adjStart.push(adjStart[adjStart.length - 1] + d);
  return {
    id: file.id,
    name: file.name,
    center: file.center,
    bounds: file.bounds,
    attribution: file.attribution,
    segments: {
      coords: unpackLines(s.lens, s.coords, west, south),
      names: s.names.map((i) => s.nameTable[i]),
      adjStart,
      adj: s.adj,
      x: s.x,
      y: s.y,
      customers: s.customers,
      wealth: s.wealth,
    },
    buildings: { rings: unpackLines(file.buildings.lens, file.buildings.rings, west, south), segment: file.buildings.segment },
  };
}
