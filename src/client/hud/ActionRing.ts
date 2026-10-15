import type { CityData } from '@unicornrush/engine-api/game/City';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import type { Intent } from '@unicornrush/engine-api/Intents';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { money, pct } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { el } from './dom';

type RingAction = 'ads' | 'guard' | 'sue' | 'poach' | 'buy';

/** What one ring button would do on this street: whether it can, and what it costs. */
interface Option {
  ok: boolean;
  /** One short line: the cost and effect, or why not. */
  info: string;
  intent?: Intent;
}

const ACTIONS: { id: RingAction; icon: string; name: string; key: string }[] = [
  { id: 'ads', icon: '📢', name: 'Ads', key: 'A' },
  { id: 'guard', icon: '🛡', name: 'Guard', key: 'G' },
  { id: 'sue', icon: '⚖️', name: 'Sue', key: 'S' },
  { id: 'poach', icon: '🕵️', name: 'Poach', key: 'T' },
  { id: 'buy', icon: '🏢', name: 'Buy', key: 'B' },
];

/** Actions that cost money ask for a second tap on touch screens, since there's no hover to read the price first. */
const COSTLY = new Set<RingAction>(['ads', 'sue', 'poach', 'buy']);

/**
 * The contextual ring: right-click (or hold) a street and the actions that make
 * sense there appear around it, each aimed at that street or its owner.
 */
export class ActionRing {
  readonly root: HTMLElement;
  private seg = -1;
  private armed: RingAction | null = null;
  /** Set once the player has used the ring (for the coach). */
  used = false;

  constructor(
    private game: GameImpl,
    private city: CityData,
    private map: MapLibreMap,
    private centerOf: (street: number) => [number, number],
    private send: (intent: Intent) => void,
  ) {
    this.root = el(
      'div',
      'action-ring',
      `<span class="pin"></span>${ACTIONS.map(
        (a, i) => `<button class="ring-btn" data-ring="${a.id}" style="--a:${-90 + i * 72}deg" aria-label="${a.name}"><span>${a.icon}</span><kbd>${a.key}</kbd></button>`,
      ).join('')}<div class="ring-label glass"><b data-v="title"></b><span data-v="info"></span></div>`,
    );
    this.root.hidden = true;
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.querySelectorAll<HTMLButtonElement>('.ring-btn').forEach((b) => {
      const id = b.dataset.ring as RingAction;
      b.addEventListener('pointerenter', () => this.describe(id));
      b.addEventListener('pointerleave', () => this.describe(null));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const touch = (e as PointerEvent).pointerType === 'touch' || matchMedia('(pointer: coarse)').matches;
        const opt = this.option(id);
        if (!opt.ok || !opt.intent) return this.describe(id);
        if (touch && COSTLY.has(id) && this.armed !== id) {
          this.armed = id;
          this.describe(id, 'Tap again to confirm');
          return;
        }
        this.send(opt.intent);
        this.used = true;
        this.close();
      });
    });
  }

  get isOpen(): boolean {
    return this.seg >= 0;
  }

  open(seg: number): void {
    if (!this.game.player.alive) return;
    this.seg = seg;
    this.armed = null;
    this.root.hidden = false;
    this.refresh();
    this.place();
  }

  close(): void {
    this.seg = -1;
    this.armed = null;
    this.root.hidden = true;
  }

  /** Called every frame: follows the street as the map moves, and keeps the buttons current. */
  update(): void {
    if (this.seg < 0) return;
    if (!this.game.player.alive) return this.close();
    this.place();
    this.refresh();
  }

  private place(): void {
    const p = this.map.project(this.centerOf(this.seg));
    this.root.style.transform = `translate(${p.x}px, ${p.y}px)`;
    // Near the right edge, the label goes on the left of the ring.
    this.root.classList.toggle('flip', p.x > this.map.getContainer().clientWidth - 400);
  }

  private refresh(): void {
    const g = this.game;
    const o = g.owner[this.seg];
    const owner = o === NEUTRAL ? 'Untapped' : o === g.playerId ? 'Yours' : g.companies[o].name;
    const street = this.city.segments.names[this.seg] || 'Street';
    const title = `${street} · ${owner} · ${'$'.repeat(g.map.wealth[this.seg] + 1)}`;
    const t = this.root.querySelector<HTMLElement>('[data-v="title"]')!;
    if (t.textContent !== title) t.textContent = title;
    this.root.querySelectorAll<HTMLButtonElement>('.ring-btn').forEach((b) => {
      const id = b.dataset.ring as RingAction;
      const opt = this.option(id);
      b.classList.toggle('off', !opt.ok);
      b.classList.toggle('armed', this.armed === id);
      b.title = `${ACTIONS.find((a) => a.id === id)!.name}: ${opt.info}`;
    });
    if (!this.root.querySelector('.ring-btn:hover') && !this.armed) this.describe(null);
  }

  /** Shows what a button does in the label (on hover, or while armed on touch). */
  private describe(id: RingAction | null, extra = ''): void {
    const info = this.root.querySelector<HTMLElement>('[data-v="info"]')!;
    if (!id) {
      info.textContent = 'Pick an action';
      info.className = 'muted';
      return;
    }
    const opt = this.option(id);
    info.textContent = `${ACTIONS.find((a) => a.id === id)!.name}: ${opt.info}${extra ? ` · ${extra}` : ''}`;
    info.className = opt.ok ? '' : 'muted';
  }

  /** What `action` would do on the open street. */
  private option(action: RingAction): Option {
    const g = this.game;
    const me = g.player;
    const tile = this.seg;
    const o = g.owner[tile];
    const rival = o >= 0 && o !== me.id ? g.companies[o] : null;
    const companyId = me.id;
    switch (action) {
      case 'ads': {
        if (o === me.id) return { ok: false, info: 'aim it at a street that isn’t yours' };
        const wait = g.adWait(me);
        if (wait > 0) return { ok: false, info: `next ad in ${Math.ceil(wait)}d` };
        const ad = g.adOffer(me);
        if (me.cash < ad.cost) return { ok: false, info: `${money(ad.cost)}: not enough cash` };
        return { ok: true, info: `${ad.push} push toward here for ${money(ad.cost)}`, intent: { type: 'advertise', companyId, tile } };
      }
      case 'guard': {
        if (o !== me.id) return { ok: false, info: 'pick one of your streets' };
        const offer = g.guardOffer(me, tile);
        if (offer.wait > 0) return { ok: false, info: `you can move your front in ${offer.wait}d` };
        return { ok: true, info: `make this your front: ${offer.streets.length} streets get ${pct(CONFIG.guard.reserveShare)} of your reserve · free`, intent: { type: 'guard', companyId, tile } };
      }
      case 'sue': {
        if (!rival) return { ok: false, info: 'pick a rival’s street' };
        if (g.activeLawsuitBy(me)) return { ok: false, info: 'your lawyers are busy with a case' };
        const fee = g.lawsuitFee(me);
        if (me.cash < fee) return { ok: false, info: `fees ${money(fee)}: not enough cash` };
        return { ok: true, info: `${rival.name}: ${pct(g.lawsuitWinChance(me.id, rival.id))} to win · fees ${money(fee)}`, intent: { type: 'lawsuit', companyId, targetId: rival.id } };
      }
      case 'poach': {
        if (!rival) return { ok: false, info: 'pick a rival’s street' };
        const offer = g.poachOffer(me, rival);
        if (offer.blocked) return { ok: false, info: offer.blocked };
        if (offer.people <= 0) return { ok: false, info: `${rival.name}'s sales team is too small` };
        if (me.cash < offer.cost) return { ok: false, info: `${money(offer.cost)}: not enough cash` };
        return { ok: true, info: `hire ${offer.people} of ${rival.name}'s sales staff for ${money(offer.cost)}`, intent: { type: 'poach', companyId, targetId: rival.id } };
      }
      case 'buy': {
        if (!rival) return { ok: false, info: 'pick a rival’s street' };
        if (!g.borders(me, tile)) return { ok: false, info: 'only next to your streets' };
        const deal = g.streetDeal(me, tile);
        if (!deal) return { ok: false, info: 'under contract: can’t be bought yet' };
        if (me.cash < deal.cost) return { ok: false, info: `${money(deal.cost)}: not enough cash` };
        return { ok: true, info: `${deal.streets.length} streets now for ${money(deal.cost)}`, intent: { type: 'buyStreets', companyId, tile } };
      }
    }
  }
}
