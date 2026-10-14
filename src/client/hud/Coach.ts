import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { el } from './dom';

interface Step {
  id: string;
  /** CSS selector of the element the tip points at. */
  anchor: string;
  text: string;
  /** Shows the tip when this becomes true. */
  when: (g: GameImpl) => boolean;
  /** Hides it for good when this becomes true. */
  done: (g: GameImpl) => boolean;
}

const STORAGE_KEY = 'unicornrush.coach';

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Storage can be unavailable (private mode); the tips just show again next time.
  }
}

/**
 * Teaches the game while you play: one short tip at a time, pointing at the
 * control it's about, shown only when it becomes relevant.
 */
export class Coach {
  readonly root: HTMLElement;
  private seen = loadSeen();
  private current: Step | null = null;
  private shownAt = 0;
  private startTiles: number;
  private startEmployees: number;
  private steps: Step[];

  constructor(private game: GameImpl) {
    this.root = el('div', 'coach', '');
    this.root.hidden = true;
    this.startTiles = game.player.tiles;
    this.startEmployees = game.player.employees;
    this.steps = [
      {
        id: 'expand',
        anchor: '.action-bar .push',
        text: '👋 You are <b>blue</b>. Click a <b>glowing street</b> to grow.',
        when: () => true,
        done: (g) => g.player.tiles > this.startTiles + 2,
      },
      {
        id: 'overload',
        anchor: '.action-bar .team',
        text: '⚙️ <b>Overloaded</b>: unserved customers don\'t pay, and your streets are easy to steal. Turn on <b>Auto</b> or hire.',
        when: (g) => g.coverage(g.player) < 0.97,
        done: (g) => g.coverage(g.player) >= 1,
      },
      {
        id: 'hire',
        anchor: '.action-bar .team',
        text: '💼 Spare cash: <b>hire</b>.',
        when: (g) => g.day > 25 && g.player.cash > 20_000 && g.player.employees + g.traineeCount(g.player) <= this.startEmployees,
        done: (g) => g.player.employees + g.traineeCount(g.player) > this.startEmployees,
      },
      {
        id: 'ads',
        anchor: '.action-bar .push',
        text: '📢 Idle cash? Try <b>Ads</b>.',
        when: (g) => g.day > 90 && g.player.cash > g.adOffer(g.player).cost * 3,
        done: (g) => g.player.oneOff.advertising < 0,
      },
      {
        id: 'cards',
        anchor: '.card-picker',
        text: '🎁 Pick a card. Behind = bigger cards.',
        when: (g) => g.player.offer !== null,
        done: (g) => g.player.offer === null,
      },
      {
        id: 'wealth',
        anchor: '.wealth-legend',
        text: '💎 <b>Gold</b> buildings = customers who spend more.',
        when: (g) => g.day > 45,
        done: () => false,
      },
      {
        id: 'race',
        anchor: '.race',
        text: '🦄 Valuation follows profit more than size.',
        when: (g) => g.day > 80,
        done: () => false,
      },
    ];
  }

  update(now: number): void {
    const g = this.game;
    if (this.current) {
      const expired = !['expand', 'overload'].includes(this.current.id) && now - this.shownAt > 14_000;
      if (this.current.done(g) || expired) this.dismiss();
      else this.position();
      return;
    }
    const next = this.steps.find((s) => !this.seen.has(s.id) && s.when(g) && !s.done(g));
    if (next) this.show(next, now);
  }

  private show(step: Step, now: number): void {
    this.current = step;
    this.shownAt = now;
    this.root.innerHTML = `<div class="coach-text">${step.text}</div><button class="link">Got it</button>`;
    this.root.querySelector('button')!.addEventListener('click', () => this.dismiss());
    this.root.hidden = false;
    this.position();
  }

  private dismiss(): void {
    if (this.current) this.seen.add(this.current.id);
    saveSeen(this.seen);
    this.current = null;
    this.root.hidden = true;
  }

  /** Places the tip next to its anchor, inside the screen. */
  private position(): void {
    const anchor = this.current ? document.querySelector<HTMLElement>(this.current.anchor) : null;
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    const w = 300;
    const above = a.top > window.innerHeight / 2;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, a.left + a.width / 2 - w / 2));
    this.root.style.left = `${left}px`;
    this.root.style.width = `${w}px`;
    this.root.style.top = above ? '' : `${a.bottom + 12}px`;
    this.root.style.bottom = above ? `${window.innerHeight - a.top + 12}px` : '';
    this.root.classList.toggle('above', above);
  }
}
