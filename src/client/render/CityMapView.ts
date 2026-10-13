import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 runs its tile work in a module worker; let Vite bundle it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { CityData } from '@unicornrush/engine-api/game/City';
import { NEUTRAL, Wealth } from '@unicornrush/engine-api/game/GameMap';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';

maplibregl.setWorkerUrl(workerUrl);

const BASE_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const NEUTRAL_STREET = '#6f7988';
const FRONTIER_STREET = '#c7d2e0';
const COURT_STREET = '#facc15'; // a company on trial

/** Building colour by wealth when nobody owns its street: dark to gold. */
export const WEALTH_COLORS: Record<Wealth, string> = {
  [Wealth.Budget]: '#262b33',
  [Wealth.Middle]: '#3f3d33',
  [Wealth.Upscale]: '#625533',
  [Wealth.Luxury]: '#93773a',
};

/** Expressions built at runtime don't fit MapLibre's tuple types; they are checked when the layer is added. */
const expr = (e: unknown) => e as ExpressionSpecification;

const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`;
const lighten = ([r, g, b]: [number, number, number], k: number) =>
  `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
const darken = ([r, g, b]: [number, number, number], k: number) =>
  `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})`;
/** Owned buildings keep showing wealth: the company's colour, darker on budget streets and brighter on rich ones. */
const shadeByWealth = (c: [number, number, number], w: number) =>
  [darken(c, 0.55), darken(c, 0.25), lighten(c, 0.15), lighten(c, 0.45)][w];
const ZONE_COLORS = { metro: '#34d399', roadworks: '#fb923c', festival: '#f472b6' } as const;

/**
 * The real city on a MapLibre map. Streets and building footprints are drawn
 * on top of an OpenFreeMap base map and coloured by owner using feature state,
 * so ownership changes don't re-upload any geometry.
 */
export class CityMapView {
  readonly map: maplibregl.Map;
  private ready = false;
  private drawnOwner: Int16Array;
  private drawnBorder: Uint8Array;
  private drawnCourt = '';
  private frontier = new Set<number>();
  private hovered = -1;
  private buildingsOf: number[][];
  /** Called once the map has drawn its layers. */
  onReady: () => void = () => {};

  constructor(
    container: HTMLElement,
    private game: GameImpl,
    private city: CityData,
  ) {
    const n = city.segments.coords.length;
    this.drawnOwner = new Int16Array(n).fill(NEUTRAL);
    this.drawnBorder = new Uint8Array(n);
    this.buildingsOf = Array.from({ length: n }, () => []);
    city.buildings.segment.forEach((s, b) => this.buildingsOf[s].push(b));

    const [w, s, e, nth] = city.bounds;
    const padX = (e - w) * 0.25;
    const padY = (nth - s) * 0.25;
    this.map = new maplibregl.Map({
      container,
      style: BASE_STYLE,
      bounds: [w, s, e, nth],
      maxBounds: [w - padX, s - padY, e + padX, nth + padY],
      minZoom: 12,
      maxZoom: 18.5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    this.map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: `Game map: ${city.attribution}` }),
    );
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    this.map.on('load', () => this.addLayers());
  }

  private ownerColor(): ExpressionSpecification {
    const pairs = this.game.companies.flatMap((c) => [c.id, rgb(c.color)]);
    return expr(['match', ['coalesce', ['feature-state', 'owner'], NEUTRAL], ...pairs, '#000000']);
  }

  private addLayers(): void {
    const map = this.map;
    // Our buildings replace the base map's; keep its roads, water, parks and labels.
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.id === 'building' || layer.id.startsWith('poi')) map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    const { segments, buildings } = this.city;
    map.addSource('buildings', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: buildings.rings.map((ring, i) => ({
          type: 'Feature',
          id: i,
          properties: { seg: buildings.segment[i], w: segments.wealth[buildings.segment[i]] },
          geometry: { type: 'Polygon', coordinates: [ring] },
        })),
      },
    });
    map.addSource('streets', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: segments.coords.map((coords, i) => ({
          type: 'Feature',
          id: i,
          properties: { seg: i },
          geometry: { type: 'LineString', coordinates: coords },
        })),
      },
    });

    const owned = expr(['>=', ['coalesce', ['feature-state', 'owner'], NEUTRAL], 0]);
    const wealthColor = [
      'match',
      ['get', 'w'],
      ...Object.entries(WEALTH_COLORS).flatMap(([k, v]) => [Number(k), v]),
      '#333333',
    ];
    // Owned buildings: the owner's colour, shaded by wealth, so you still see where the money is.
    const ownedColor = [
      'match',
      ['coalesce', ['feature-state', 'owner'], NEUTRAL],
      ...this.game.companies.flatMap((c) => [
        c.id,
        ['match', ['get', 'w'], ...[0, 1, 2, 3].flatMap((w) => [w, shadeByWealth(c.color, w)]), rgb(c.color)],
      ]),
      '#000000',
    ];
    map.addLayer({
      id: 'buildings',
      type: 'fill',
      source: 'buildings',
      paint: {
        'fill-color': expr(['case', owned, ownedColor, wealthColor]),
        'fill-opacity': expr(['case', owned, ['match', ['get', 'w'], 0, 0.45, 1, 0.6, 2, 0.75, 0.9], 0.85]),
        'fill-outline-color': 'rgba(0,0,0,0.35)',
      },
    });
    // Owned rich buildings get a gold rim, so the wealth still shows under the owner's colour.
    map.addLayer({
      id: 'buildings-rich',
      type: 'line',
      source: 'buildings',
      filter: expr(['>=', ['get', 'w'], 2]),
      paint: {
        'line-color': expr(['match', ['get', 'w'], 3, '#fcd34d', '#b8964a']),
        'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, ['match', ['get', 'w'], 3, 0.8, 0.4], 17, ['match', ['get', 'w'], 3, 2, 1]]),
        'line-opacity': expr(['case', owned, 0.9, 0]),
      },
    });

    // Border streets glow brighter; streets of a company being sued turn white.
    const borderColor = [
      'match',
      ['coalesce', ['feature-state', 'owner'], NEUTRAL],
      ...this.game.companies.flatMap((c) => [c.id, lighten(c.color, c.id === 0 ? 0.25 : 0.15)]),
      '#ffffff',
    ];
    map.addLayer({
      id: 'streets',
      type: 'line',
      source: 'streets',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': expr([
          'case',
          ['boolean', ['feature-state', 'court'], false],
          COURT_STREET,
          ['boolean', ['feature-state', 'border'], false],
          borderColor,
          owned,
          this.ownerColor(),
          // Hovering an untapped street lights it up; owned streets keep their colour.
          ['boolean', ['feature-state', 'hover'], false],
          '#ffffff',
          // Streets the player can expand into glow, so it's clear where to click.
          ['boolean', ['feature-state', 'frontier'], false],
          FRONTIER_STREET,
          NEUTRAL_STREET,
        ]),
        'line-width': expr([
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          ['case', ['boolean', ['feature-state', 'hover'], false], 4, owned, 2.5, ['boolean', ['feature-state', 'frontier'], false], 2, 1],
          16,
          ['case', ['boolean', ['feature-state', 'hover'], false], 9, owned, 6, ['boolean', ['feature-state', 'frontier'], false], 4.5, 2.5],
          18,
          ['case', ['boolean', ['feature-state', 'hover'], false], 16, owned, 12, ['boolean', ['feature-state', 'frontier'], false], 8, 5],
        ]),
        'line-opacity': expr([
          'case',
          ['any', owned, ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'frontier'], false]],
          1,
          0.5,
        ]),
      },
    });
    // Local events (a new metro station, roadworks, a festival): a tinted circle over the area.
    map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'zones-fill',
      type: 'fill',
      source: 'zones',
      paint: { 'fill-color': expr(['get', 'color']), 'fill-opacity': expr(['case', ['get', 'active'], 0.16, 0.08]) },
    });
    map.addLayer({
      id: 'zones-line',
      type: 'line',
      source: 'zones',
      paint: { 'line-color': expr(['get', 'color']), 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
    });
    // A wide invisible line makes streets easy to click.
    map.addLayer({ id: 'streets-hit', type: 'line', source: 'streets', paint: { 'line-width': 16, 'line-opacity': 0 } });
    this.ready = true;
    this.update();
    this.onReady();
    // Start on the whole city so you see where your rivals are, then fly to you.
    window.setTimeout(() => this.focusOnPlayer(true), 1200);
  }

  /** Moves the camera to the player's territory. */
  focusOnPlayer(animate = true): void {
    const g = this.game;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (let i = 0; i < g.owner.length; i++) {
      if (g.owner[i] !== 0) continue;
      for (const [lon, lat] of this.city.segments.coords[i]) {
        w = Math.min(w, lon);
        e = Math.max(e, lon);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
    }
    if (!Number.isFinite(w)) return;
    this.map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: { top: 140, bottom: 220, left: 340, right: 320 }, maxZoom: 15.6, duration: animate ? 1800 : 0 },
    );
  }

  /** Pushes ownership changes to the map as feature state. */
  update(): void {
    if (!this.ready) return;
    const g = this.game;
    const defendants = new Set(g.lawsuits.map((l) => l.defendant));
    const courtKey = [...defendants].join(',');
    const courtChanged = courtKey !== this.drawnCourt;
    this.drawnCourt = courtKey;
    for (let i = 0; i < g.owner.length; i++) {
      const o = g.owner[i];
      const border = o >= 0 && g.companies[o].border.has(i) ? 1 : 0;
      const ownerChanged = o !== this.drawnOwner[i];
      if (!ownerChanged && border === this.drawnBorder[i] && !(courtChanged && o >= 0)) continue;
      this.drawnOwner[i] = o;
      this.drawnBorder[i] = border;
      this.map.setFeatureState(
        { source: 'streets', id: i },
        // Only the border of a company on trial glows, so it doesn't swamp the map.
        { owner: o, border: border === 1, court: border === 1 && defendants.has(o) },
      );
      if (ownerChanged) {
        for (const b of this.buildingsOf[i]) this.map.setFeatureState({ source: 'buildings', id: b }, { owner: o });
      }
    }
    this.updateFrontier();
    this.updateZones();
  }

  private drawnZones = '';

  /** Redraws the local-event circles when they change. */
  updateZones(): void {
    if (!this.ready) return;
    const events = this.game.localEvents;
    const key = events.map((e) => `${e.kind}${e.center}${e.active}`).join(',');
    if (key === this.drawnZones) return;
    this.drawnZones = key;
    const features = events.map((e) => {
      const [lon, lat] = this.zoneCenter(e.center);
      const dLat = e.radius / 111_320;
      const dLon = dLat / Math.cos((lat * Math.PI) / 180);
      const ring = Array.from({ length: 49 }, (_, k) => {
        const a = (k / 48) * 2 * Math.PI;
        return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat];
      });
      return {
        type: 'Feature' as const,
        properties: { color: ZONE_COLORS[e.kind], active: e.active },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    });
    (this.map.getSource('zones') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features });
  }

  /** [lon, lat] of a street's midpoint. */
  zoneCenter(street: number): [number, number] {
    const c = this.city.segments.coords[street];
    return c[Math.floor(c.length / 2)];
  }

  /** Marks the streets next to the player's territory that it could win. */
  private updateFrontier(): void {
    const g = this.game;
    const me = g.player;
    const next = new Set<number>();
    if (me.alive) {
      const { adjStart, adj } = g.map;
      for (const b of me.border) {
        for (let k = adjStart[b]; k < adjStart[b + 1]; k++) if (g.owner[adj[k]] !== 0) next.add(adj[k]);
      }
    }
    for (const t of this.frontier) if (!next.has(t)) this.map.setFeatureState({ source: 'streets', id: t }, { frontier: false });
    for (const t of next) if (!this.frontier.has(t)) this.map.setFeatureState({ source: 'streets', id: t }, { frontier: true });
    this.frontier = next;
  }

  /** Highlights the street under the cursor. */
  setHover(seg: number): void {
    if (!this.ready || seg === this.hovered) return;
    if (this.hovered >= 0) this.map.setFeatureState({ source: 'streets', id: this.hovered }, { hover: false });
    if (seg >= 0) this.map.setFeatureState({ source: 'streets', id: seg }, { hover: true });
    this.hovered = seg;
  }

  /** Can the player expand into this street right now? */
  isFrontier(seg: number): boolean {
    return this.frontier.has(seg);
  }

  /** The street segment under the cursor (a building counts as its street), or -1. */
  segmentAt(point: maplibregl.Point): number {
    if (!this.ready) return -1;
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - 4, point.y - 4],
      [point.x + 4, point.y + 4],
    ];
    const hits: MapGeoJSONFeature[] = this.map.queryRenderedFeatures(box, { layers: ['streets-hit', 'buildings'] });
    const hit = hits.find((f) => f.layer.id === 'streets-hit') ?? hits[0];
    return hit ? Number(hit.properties.seg) : -1;
  }
}
