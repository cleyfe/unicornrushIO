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
const NEUTRAL_STREET = '#7d8796';

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
  private buildingsOf: number[][];

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
      minZoom: 13,
      maxZoom: 18.5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    this.map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: `Game map: ${city.attribution}` }),
    );
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
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
    map.addLayer({
      id: 'buildings',
      type: 'fill',
      source: 'buildings',
      paint: {
        'fill-color': expr(['case', owned, this.ownerColor(), wealthColor]),
        'fill-opacity': expr(['case', owned, 0.7, 0.85]),
        'fill-outline-color': 'rgba(0,0,0,0.35)',
      },
    });

    // Border streets glow brighter; streets of a company being sued turn white.
    const borderColor = [
      'match',
      ['coalesce', ['feature-state', 'owner'], NEUTRAL],
      ...this.game.companies.flatMap((c) => [c.id, lighten(c.color, c.id === 0 ? 0.3 : 0.2)]),
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
          '#ffffff',
          ['boolean', ['feature-state', 'border'], false],
          borderColor,
          owned,
          this.ownerColor(),
          NEUTRAL_STREET,
        ]),
        'line-width': expr([
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          ['case', owned, 2.5, 1],
          16,
          ['case', owned, 6, 2.5],
          18,
          ['case', owned, 12, 5],
        ]),
        'line-opacity': expr(['case', owned, 1, 0.55]),
      },
    });
    // A wide invisible line makes streets easy to click.
    map.addLayer({ id: 'streets-hit', type: 'line', source: 'streets', paint: { 'line-width': 16, 'line-opacity': 0 } });
    this.ready = true;
    this.update();
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
        { owner: o, border: border === 1, court: o >= 0 && defendants.has(o) },
      );
      if (ownerChanged) {
        for (const b of this.buildingsOf[i]) this.map.setFeatureState({ source: 'buildings', id: b }, { owner: o });
      }
    }
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
