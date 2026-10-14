import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { Map as MapLibreMap } from 'maplibre-gl';

/** A 🛡 badge over every company's guarded front, in its owner's colour. */
export class GuardMarkers {
  readonly root: HTMLElement;
  private badges = new Map<string, HTMLElement>();

  constructor(
    private game: GameImpl,
    private map: MapLibreMap,
    private centerOf: (street: number) => [number, number],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'guard-markers';
  }

  /** Called every frame: keeps one badge per guard, placed over its street. */
  update(): void {
    const g = this.game;
    const seen = new Set<string>();
    for (const p of g.guardPosts) {
      const key = `${p.owner}:${p.center}`;
      seen.add(key);
      let badge = this.badges.get(key);
      if (!badge) {
        const c = g.companies[p.owner];
        badge = document.createElement('div');
        badge.className = `guard-badge${p.owner === g.playerId ? ' me' : ''}`;
        badge.style.setProperty('--company', `rgb(${c.color.join(',')})`);
        badge.title = `${c.id === g.playerId ? 'Your' : `${c.name}'s`} front: its push reserve defends these streets most`;
        badge.textContent = '🛡';
        this.root.append(badge);
        this.badges.set(key, badge);
      }
      const pt = this.map.project(this.centerOf(p.center));
      badge.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
    }
    for (const [key, badge] of this.badges) {
      if (seen.has(key)) continue;
      badge.remove();
      this.badges.delete(key);
    }
  }
}
