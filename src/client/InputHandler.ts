import { NEUTRAL, Terrain } from '@unicornrush/engine-api/game/GameMap';
import { buildingKind } from '@unicornrush/engine-lib/game/GameMap';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { ClientGameRunner } from './ClientGameRunner';
import type { MapRenderer } from './render/MapRenderer';

/** Map clicks launch campaigns; hovering explains what an area is worth. */
export class InputHandler {
  constructor(
    private client: ClientGameRunner,
    private renderer: MapRenderer,
    private tooltip: HTMLElement,
    private onSpeedKey: (speed: number) => void,
  ) {}

  // Camera: the map can be zoomed (wheel) and panned (drag).
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private drag: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null;

  private applyCamera(): void {
    const canvas = this.renderer.canvas;
    const vw = canvas.parentElement!.clientWidth;
    const vh = canvas.parentElement!.clientHeight;
    // Keep the map covering the view.
    this.panX = Math.min(0, Math.max(vw - vw * this.zoom, this.panX));
    this.panY = Math.min(0, Math.max(vh - vh * this.zoom, this.panY));
    canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  attach(): () => void {
    const canvas = this.renderer.canvas;
    const view = canvas.parentElement!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = view.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const next = Math.min(5, Math.max(1, this.zoom * (ev.deltaY < 0 ? 1.2 : 1 / 1.2)));
      // Zoom around the cursor.
      this.panX = mx - ((mx - this.panX) * next) / this.zoom;
      this.panY = my - ((my - this.panY) * next) / this.zoom;
      this.zoom = next;
      this.applyCamera();
    };
    const onDown = (ev: MouseEvent) => {
      this.drag = { x: ev.clientX, y: ev.clientY, panX: this.panX, panY: this.panY, moved: false };
    };
    const onDragMove = (ev: MouseEvent) => {
      if (!this.drag) return;
      const dx = ev.clientX - this.drag.x;
      const dy = ev.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.panX = this.drag.panX + dx;
      this.panY = this.drag.panY + dy;
      this.applyCamera();
    };
    const onUp = () => setTimeout(() => (this.drag = null), 0);
    const onClick = (ev: MouseEvent) => {
      if (this.drag?.moved) return;
      const tile = this.renderer.tileAt(ev);
      if (tile >= 0) this.client.send({ type: 'campaign', companyId: 0, tile });
    };
    const onMove = (ev: MouseEvent) => {
      const tile = this.renderer.tileAt(ev);
      if (tile < 0) return;
      this.tooltip.textContent = describeTile(this.client.game, tile);
      const rect = view.getBoundingClientRect();
      this.tooltip.style.left = `${ev.clientX - rect.left + 14}px`;
      this.tooltip.style.top = `${ev.clientY - rect.top + 14}px`;
      this.tooltip.style.display = 'block';
    };
    const onLeave = () => (this.tooltip.style.display = 'none');
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
      const speeds: Record<string, number> = { ' ': 0, '1': 1, '2': 2, '3': 4 };
      if (ev.key in speeds) {
        ev.preventDefault();
        this.onSpeedKey(ev.key === ' ' && this.client.speed === 0 ? 1 : speeds[ev.key]);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onUp);
    };
  }
}

const KIND_LABEL = { house: 'Houses', shop: 'Shops', tower: 'Office tower' } as const;

export function describeTile(g: GameImpl, tile: number): string {
  const t = g.map.terrain[tile];
  if (t === Terrain.River) return 'River: no customers';
  if (t === Terrain.Park) return 'Park: no customers';
  const d = g.map.demand[tile];
  const o = g.owner[tile];
  const what = t === Terrain.Bridge ? 'Bridge' : KIND_LABEL[buildingKind(d)];
  const who = o === NEUTRAL ? 'untapped' : o === 0 ? 'your customers' : g.companies[o].name;
  let s = `${what} · ${who} · ${d.toFixed(2)} customers`;
  if (o !== 0) s += ` · costs ${g.tileCost(g.player, o, tile).toFixed(1)} push`;
  return s;
}
