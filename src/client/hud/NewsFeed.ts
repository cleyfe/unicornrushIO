import type { LogEntry } from '@unicornrush/engine-api/game/Game';
import { el } from './dom';

/** Bottom-left: the latest news, fading away after a while. */
export class NewsFeed {
  readonly root: HTMLElement;

  constructor() {
    this.root = el('section', 'news-feed', '');
  }

  push(entry: LogEntry): void {
    const item = el('div', `news-item ${entry.tone}`, `<span>Day ${entry.day}</span>${entry.text}`);
    this.root.append(item);
    while (this.root.children.length > 3) this.root.firstElementChild?.remove();
    window.setTimeout(() => item.classList.add('fade'), 6000);
    window.setTimeout(() => item.remove(), 7000);
  }
}
