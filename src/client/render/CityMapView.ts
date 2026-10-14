import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 runs its tile work in a module worker; let Vite bundle it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { CityData } from '@unicornrush/engine-api/game/City';
import { NEUTRAL, Wealth } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';

maplibregl.setWorkerUrl(workerUrl);

export type MapTheme = 'light' | 'dark';

/** Everything that changes between the daytime and the night map. */
const THEMES: Record<
  MapTheme,
  { style: string; veil: string; neutral: string; neutralOpacity: number; frontier: string; exposed: string; hover: string; outline: string; casing: number; unowned: number; wealth: Record<Wealth, string> }
> = {
  light: {
    style: 'https://tiles.openfreemap.org/styles/liberty',
    // Washes the base map out, so the companies' colours stand out from it.
    veil: 'rgba(246,244,240,0.55)',
    casing: 0.45,
    unowned: 0.45, // opacity of buildings nobody owns yet
    neutral: '#8a94a3',
    neutralOpacity: 0.35,
    frontier: '#1d4ed8',
    exposed: '#b91c1c',
    hover: '#f59e0b',
    outline: 'rgba(0,0,0,0.18)',
    // Unowned buildings by wealth: light grey to gold.
    wealth: { [Wealth.Budget]: '#d9d6d0', [Wealth.Middle]: '#e3d6bd', [Wealth.Upscale]: '#e8c784', [Wealth.Luxury]: '#d9a43c' },
  },
  dark: {
    style: 'https://tiles.openfreemap.org/styles/dark',
    veil: 'rgba(8,10,14,0.45)',
    casing: 0.6,
    unowned: 0.6,
    neutral: '#6f7988',
    neutralOpacity: 0.5,
    frontier: '#c7d2e0',
    exposed: '#fca5a5',
    hover: '#ffffff',
    outline: 'rgba(0,0,0,0.35)',
    // Unowned buildings by wealth: dark to gold.
    wealth: { [Wealth.Budget]: '#262b33', [Wealth.Middle]: '#3f3d33', [Wealth.Upscale]: '#625533', [Wealth.Luxury]: '#93773a' },
  },
};

/** Building colours by wealth for a theme (the map key uses them too). */
export function wealthColors(theme: MapTheme): Record<Wealth, string> {
  return THEMES[theme].wealth;
}

/** A base map with nothing but a background, for when the tiles can't load. */
const plainStyle = (theme: MapTheme): maplibregl.StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': theme === 'light' ? '#ece8e1' : '#141a22' } }],
});

const COURT_STREET = '#facc15'; // a company on trial

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
/** Owned streets' opacity by age (0 = just won … 3 = regulars at their full bonus). */
const AGE_SHADE: ExpressionSpecification = ['match', ['coalesce', ['feature-state', 'age'], 3], 0, 0.55, 1, 0.7, 2, 0.85, 1];
/** Defence thresholds for the attack view's five colours, cheap to dear. */
const ATTACK_STEPS = [1.2, 1.6, 2.2, 3];
const ATTACK_COLORS = ['#16a34a', '#84cc16', '#eab308', '#f97316', '#dc2626'];

export class CityMapView {
  readonly map: maplibregl.Map;
  private ready = false;
  private theme: MapTheme;
  private drawnOwner: Int16Array;
  private drawnBorder: Uint8Array;
  private drawnGuard: Uint8Array;
  /** How long each street has been with its owner, in 4 steps (regulars): older streets look deeper. */
  private drawnAge: Uint8Array;
  /** Streets that just changed hands between companies, and when: they flash for a moment. */
  private flashing = new Map<number, number>();
  /** After a theme switch every street is redrawn: don't flash them all. */
  private quiet = true;
  /** Hold-Space attack view: rival streets coloured by how cheap they are to take. */
  private attackOn = false;
  private attackDrawn = new Set<number>();
  private attackAt = 0;
  private exposedKey = '';
  private exposedAt = 0;
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
    theme: MapTheme = 'light',
  ) {
    this.theme = theme;
    const n = city.segments.coords.length;
    this.drawnOwner = new Int16Array(n).fill(NEUTRAL);
    this.drawnBorder = new Uint8Array(n);
    this.drawnGuard = new Uint8Array(n);
    this.drawnAge = new Uint8Array(n);
    this.buildingsOf = Array.from({ length: n }, () => []);
    city.buildings.segment.forEach((s, b) => this.buildingsOf[s].push(b));

    const [w, s, e, nth] = city.bounds;
    // Room around the city so you can zoom out to see all of it, with a margin.
    const padX = e - w;
    const padY = nth - s;
    this.map = new maplibregl.Map({
      container,
      style: THEMES[theme].style,
      bounds: [w, s, e, nth],
      maxBounds: [w - padX, s - padY, e + padX, nth + padY],
      minZoom: 12,
      maxZoom: 18.5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    // Zoom out until the whole city fits with room to spare around the panels, whatever its size and the screen's.
    const fit = this.map.cameraForBounds([w, s, e, nth]);
    if (fit?.zoom !== undefined) this.map.setMinZoom(fit.zoom - 1.5);
    this.map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: `Game map: ${city.attribution}` }),
    );
    // On phones the credits fill two lines: show them at first, then fold them into the ⓘ button
    // after a few seconds or the first touch (OpenStreetMap's guidelines allow this).
    if (window.matchMedia('(max-width: 600px)').matches) {
      const fold = () => container.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
      const timer = setTimeout(fold, 5000);
      this.map.once('dragstart', () => (clearTimeout(timer), fold()));
    }
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    // Runs on the first load and again after every theme switch (setStyle drops our layers).
    let first = true;
    this.map.on('style.load', () => {
      this.addLayers(first);
      first = false;
    });
    // If the base map can't load (tile server down, or a page that blocks it), play on a
    // plain background: the game draws its own streets and buildings.
    const fallback = () => {
      if (!first || this.offline) return;
      this.offline = true;
      this.map.setStyle(plainStyle(this.theme), { diff: false });
    };
    this.map.once('error', fallback);
    window.setTimeout(fallback, 10_000);
  }

  /** True when playing without the base map. */
  private offline = false;

  private ownerColor(): ExpressionSpecification {
    const pairs = this.game.companies.flatMap((c) => [c.id, rgb(c.color)]);
    return expr(['match', ['coalesce', ['feature-state', 'owner'], NEUTRAL], ...pairs, '#000000']);
  }

  /** Switches between the daytime and night map, keeping the game state drawn. */
  setTheme(theme: MapTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.ready = false;
    // Forget what was drawn, so every street's state is set again on the new style.
    this.drawnOwner.fill(NEUTRAL);
    this.drawnBorder.fill(0);
    this.drawnGuard.fill(0);
    this.drawnAge.fill(0);
    this.flashing.clear();
    this.quiet = true;
    this.attackDrawn.clear();
    this.exposedKey = '';
    this.drawnCourt = '';
    this.drawnZones = '';
    this.frontier = new Set();
    this.hovered = -1;
    this.map.setStyle(this.offline ? plainStyle(theme) : THEMES[theme].style, { diff: false });
  }

  private addLayers(first: boolean): void {
    const map = this.map;
    const T = THEMES[this.theme];
    // Our buildings replace the base map's; keep its roads, water, parks and labels.
    const baseLayers = map.getStyle().layers ?? [];
    for (const layer of baseLayers) {
      if (layer.id.startsWith('building') || layer.id.startsWith('poi')) map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    // A veil between the base map and its labels: streets and parks fade, names stay sharp.
    const firstLabel = baseLayers.find((l) => l.type === 'symbol')?.id;
    const [w, s, e, n] = this.city.bounds;
    map.addSource('veil', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w - 1, s - 1], [e + 1, s - 1], [e + 1, n + 1], [w - 1, n + 1], [w - 1, s - 1]]] } },
    });
    map.addLayer({ id: 'veil', type: 'fill', source: 'veil', paint: { 'fill-color': T.veil } }, firstLabel);
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
      ...Object.entries(T.wealth).flatMap(([k, v]) => [Number(k), v]),
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
        // Newly won streets look lighter; regulars (held a long time) look deep.
        'fill-opacity': expr(['case', owned, ['*', ['match', ['get', 'w'], 0, 0.8, 1, 0.88, 0.95], AGE_SHADE], T.unowned]),
        'fill-outline-color': T.outline,
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
      ...this.game.companies.flatMap((c) => [c.id, lighten(c.color, c.id === this.game.playerId ? 0.25 : 0.15)]),
      '#ffffff',
    ];
    // Guarded streets get a soft halo underneath.
    map.addLayer({
      id: 'streets-guard',
      type: 'line',
      source: 'streets',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': expr(borderColor),
        'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, 6, 16, 14, 18, 24]),
        'line-blur': 3,
        'line-opacity': expr(['case', ['boolean', ['feature-state', 'guard'], false], 0.45, 0]),
      },
    });
    // A darker edge under owned streets, so they read against any background.
    const casingColor = ['match', ['coalesce', ['feature-state', 'owner'], NEUTRAL], ...this.game.companies.flatMap((c) => [c.id, darken(c.color, T.casing)]), '#000000'];
    map.addLayer({
      id: 'streets-casing',
      type: 'line',
      source: 'streets',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': expr(casingColor),
        'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, 4, 16, 9, 18, 16]),
        'line-opacity': expr(['case', owned, 0.9, 0]),
      },
    });
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
          T.hover,
          T.neutral,
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
          owned,
          AGE_SHADE,
          ['boolean', ['feature-state', 'hover'], false],
          1,
          ['boolean', ['feature-state', 'frontier'], false],
          0,
          T.neutralOpacity,
        ]),
      },
    });
    // Streets the player can expand into: a dashed blue line, so it's clear where to click.
    map.addLayer({
      id: 'streets-frontier',
      type: 'line',
      source: 'streets',
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': T.frontier,
        'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, 2, 16, 4, 18, 7]),
        'line-dasharray': [2, 1.2],
        'line-opacity': expr([
          'case',
          ['all', ['boolean', ['feature-state', 'frontier'], false], ['!', ['boolean', ['feature-state', 'hover'], false]]],
          0.9,
          0,
        ]),
      },
    });
    // Streets that just changed hands flash: red if they were yours, the taker's colour otherwise.
    map.addLayer({
      id: 'streets-flash',
      type: 'line',
      source: 'streets',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': expr(['case', ['boolean', ['feature-state', 'lost'], false], '#ef4444', borderColor]),
        'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, 7, 16, 16, 18, 26]),
        'line-blur': 2,
        'line-opacity': expr(['match', ['coalesce', ['feature-state', 'flash'], 0], 3, 0.95, 2, 0.6, 1, 0.3, 0]),
      },
    });
    // Exposed borders (overloaded, or push reserve spent): a dashed line, an opening for attackers.
    map.addSource('exposed', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'exposed',
      type: 'line',
      source: 'exposed',
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': T.exposed,
        'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, 1.5, 16, 3, 18, 5]),
        'line-dasharray': [1, 1.4],
        'line-opacity': 0.95,
      },
    });
    // Attack view (hold Space): rival streets from green (cheap to take) to red (well defended).
    map.addLayer({
      id: 'streets-attack',
      type: 'line',
      source: 'streets',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': expr(['match', ['coalesce', ['feature-state', 'atk'], 0], ...ATTACK_COLORS.flatMap((c, i) => [i + 1, c]), '#000000']),
        'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, 4, 16, 10, 18, 18]),
        'line-opacity': expr(['case', ['==', ['coalesce', ['feature-state', 'atk'], 0], 0], 0, ['boolean', ['feature-state', 'atkNear'], false], 0.95, 0.5]),
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
    if (!first) return;
    this.onReady();
    // Start on the whole city so you see where your rivals are, then fly to you.
    window.setTimeout(() => this.focusOnPlayer(true), 1200);
  }

  /** Moves the camera to the player's territory. */
  focusOnPlayer(animate = true): void {
    this.focusOn(this.game.playerId, animate);
  }

  /** Fits the map to a company's streets. */
  focusOn(companyId: number, animate = true): void {
    const g = this.game;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (let i = 0; i < g.owner.length; i++) {
      if (g.owner[i] !== companyId) continue;
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
      { padding: this.hudPadding(), maxZoom: 15.6, duration: animate ? 1800 : 0 },
    );
  }

  /** Room left for the panels around the map: side cards on wide screens, top and bottom bars on phones. */
  private hudPadding(): { top: number; bottom: number; left: number; right: number } {
    const w = this.map.getContainer().clientWidth;
    return w < 700 ? { top: 150, bottom: 200, left: 30, right: 30 } : { top: 140, bottom: 220, left: 340, right: 320 };
  }

  /** Pushes ownership changes to the map as feature state. */
  update(): void {
    if (!this.ready) return;
    const g = this.game;
    const defendants = new Set(g.lawsuits.map((l) => l.defendant));
    const courtKey = [...defendants].join(',');
    const courtChanged = courtKey !== this.drawnCourt;
    this.drawnCourt = courtKey;
    const now = performance.now();
    const ageSteps = 3 / CONFIG.loyalty.maxBonus;
    for (let i = 0; i < g.owner.length; i++) {
      const o = g.owner[i];
      const border = o >= 0 && g.companies[o].border.has(i) ? 1 : 0;
      const guard = o >= 0 && g.isGuarded(i, o) ? 1 : 0;
      const age = o >= 0 ? Math.round(g.loyalty(i) * ageSteps) : 0;
      const was = this.drawnOwner[i];
      const ownerChanged = o !== was;
      if (!ownerChanged && border === this.drawnBorder[i] && guard === this.drawnGuard[i] && age === this.drawnAge[i] && !(courtChanged && o >= 0)) continue;
      const ageChanged = age !== this.drawnAge[i];
      this.drawnOwner[i] = o;
      this.drawnBorder[i] = border;
      this.drawnGuard[i] = guard;
      this.drawnAge[i] = age;
      // A street taken from a company (not won from the untapped market) flashes.
      const flash = ownerChanged && !this.quiet && was >= 0 && o >= 0;
      if (flash) this.flashing.set(i, now);
      this.map.setFeatureState(
        { source: 'streets', id: i },
        // Only the border of a company on trial glows, so it doesn't swamp the map.
        { owner: o, border: border === 1, court: border === 1 && defendants.has(o), guard: guard === 1, age, ...(flash ? { flash: 3, lost: was === g.playerId } : {}) },
      );
      if (ownerChanged || ageChanged) {
        for (const b of this.buildingsOf[i]) this.map.setFeatureState({ source: 'buildings', id: b }, { owner: o, age });
      }
    }
    this.quiet = false;
    // Flashes fade in three steps over about a second.
    for (const [i, start] of this.flashing) {
      const level = 3 - Math.floor((now - start) / 350);
      this.map.setFeatureState({ source: 'streets', id: i }, { flash: Math.max(0, level) });
      if (level <= 0) this.flashing.delete(i);
    }
    this.updateFrontier();
    this.updateZones();
    if (now - this.exposedAt > 500) this.updateExposed(now);
    if (this.attackOn && now - this.attackAt > 400) this.drawAttack(now);
  }

  /** Borders of companies whose defence is down (overloaded, or push reserve spent): where to attack. */
  private updateExposed(now: number): void {
    this.exposedAt = now;
    const g = this.game;
    const exposed = g.companies.filter((c) => c.alive && c.tiles > 0 && g.defence(c) < CONFIG.sales.exposedBelow);
    const key = exposed.length ? `${exposed.map((c) => c.id).join(',')}@${g.ownershipVersion}` : '';
    if (key === this.exposedKey) return;
    this.exposedKey = key;
    const features = exposed.flatMap((c) =>
      [...c.border].map((t) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: this.city.segments.coords[t] } })),
    );
    (this.map.getSource('exposed') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  /** Turns the attack view on (while Space is held) or off. */
  setAttackView(on: boolean): void {
    if (on === this.attackOn) return;
    this.attackOn = on;
    if (on) this.drawAttack(performance.now());
    else {
      for (const t of this.attackDrawn) this.map.setFeatureState({ source: 'streets', id: t }, { atk: 0, atkNear: false });
      this.attackDrawn.clear();
    }
  }

  /** Colours every rival street by its defence against you: what taking it costs per customer, compared with an untapped street. */
  private drawAttack(now: number): void {
    if (!this.ready) return;
    this.attackAt = now;
    const g = this.game;
    const me = g.player;
    const next = new Set<number>();
    for (let t = 0; t < g.owner.length; t++) {
      const o = g.owner[t];
      if (o < 0 || o === g.playerId) continue;
      const d = g.streetCost(me, o, t).defence;
      const atk = 1 + ATTACK_STEPS.filter((s) => d > s).length;
      next.add(t);
      this.map.setFeatureState({ source: 'streets', id: t }, { atk, atkNear: this.frontier.has(t) });
    }
    for (const t of this.attackDrawn) if (!next.has(t)) this.map.setFeatureState({ source: 'streets', id: t }, { atk: 0, atkNear: false });
    this.attackDrawn = next;
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
        for (let k = adjStart[b]; k < adjStart[b + 1]; k++) if (g.owner[adj[k]] !== g.playerId) next.add(adj[k]);
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
