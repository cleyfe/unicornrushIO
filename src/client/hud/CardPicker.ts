import type { Intent } from '@unicornrush/engine-api/Intents';
import { CARD_INFO, describeCard } from '@unicornrush/engine-lib/configuration/Cards';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import { $, el } from './dom';

/** Above the action bar: an opportunity offer, three cards to pick from. */
export class CardPicker {
  readonly root: HTMLElement;
  private shown = '';

  constructor(
    private game: GameImpl,
    private sendIntent: (intent: Intent) => void,
  ) {
    this.root = el('section', 'card-picker glass', '');
    this.root.hidden = true;
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (!b) return;
      this.sendIntent({ type: 'pickCard', companyId: 0, index: Number(b.dataset.card) });
      (b as HTMLButtonElement).blur();
    });
  }

  update(): void {
    const g = this.game;
    const offer = g.player.offer;
    this.root.hidden = !offer;
    if (!offer) {
      this.shown = '';
      return;
    }
    const key = JSON.stringify(offer.cards);
    if (key !== this.shown) {
      this.shown = key;
      const luck = g.luck(g.player);
      const luckNote = luck > 1.05 ? '🍀 Behind: bigger offers' : '';
      this.root.innerHTML = `<div class="cp-head"><b>🎁 Pick one</b><span data-v="expires"></span></div>
        <div class="cp-cards">${offer.cards
          .map((c, i) => {
            const info = CARD_INFO[c.kind];
            return `<button class="cp-card" data-card="${i}"><span class="cp-icon">${info.icon}</span><b>${info.title}</b><span>${describeCard(c)}</span></button>`;
          })
          .join('')}</div>
        <div class="cp-foot"><small>${luckNote}</small><button class="link" data-card="-1">Pass</button></div>`;
    }
    $(this.root, '[data-v="expires"]').textContent = `expires in ${Math.max(0, Math.ceil(offer.expiresDay - g.day))}d`;
  }
}
