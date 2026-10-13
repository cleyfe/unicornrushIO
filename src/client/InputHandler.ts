import type { MapMouseEvent } from 'maplibre-gl';
import type { CityData } from '@unicornrush/engine-api/game/City';
import { NEUTRAL } from '@unicornrush/engine-api/game/GameMap';
import { CONFIG } from '@unicornrush/engine-lib/configuration/Config';
import { LOCAL_EVENT_INFO } from '@unicornrush/engine-lib/configuration/MarketEvents';
import { money } from '@unicornrush/engine-lib/Format';
import type { GameImpl } from '@unicornrush/engine/game/GameImpl';
import type { ClientGameRunner } from './ClientGameRunner';
import type { CityMapView } from './render/CityMapView';

export type ClickMode = 'expand' | 'ad' | 'guard' | 'buy';

/**
 * Clicking a street (or a building on it) launches a campaign; hovering explains it.
 * In guard mode, clicking one of your streets posts an account team there instead.
 */
export class InputHandler {
  /** What the next click on the map does: expand (default), aim an ad, or guard an area. */
  private mode: ClickMode = 'expand';
  /** The street under the mouse, or -1. */
  private hoverSeg = -1;
  onModeChange: (mode: ClickMode) => void = () => {};
  /** Command hotkeys (letters); returns true if the key was used. */
  onHotkey: (key: string) => boolean = () => false;
  onEscape: () => void = () => {};

  constructor(
    private client: ClientGameRunner,
    private view: CityMapView,
    private city: CityData,
    private tooltip: HTMLElement,
    private onSpeedKey: (speed: number) => void,
    private onFirstMove: () => void,
    /** Before the first move, clicking far from your streets moves your start there. */
    private isStarted: () => boolean = () => true,
  ) {}

  attach(): () => void {
    const map = this.view.map;
    map.on('click', (e: MapMouseEvent) => {
      const seg = this.view.segmentAt(e.point);
      if (seg < 0) return;
      if (this.mode === 'guard') {
        if (this.client.game.owner[seg] === 0) {
          this.client.send({ type: 'guard', companyId: 0, tile: seg });
          this.setMode('expand');
        }
        return;
      }
      if (this.mode === 'buy') {
        const g = this.client.game;
        if (g.owner[seg] > 0 && g.borders(g.player, seg)) {
          this.client.send({ type: 'buyStreets', companyId: 0, tile: seg });
          this.setMode('expand');
        }
        return;
      }
      if (this.mode === 'ad') {
        if (this.client.game.owner[seg] !== 0) {
          this.client.send({ type: 'advertise', companyId: 0, tile: seg });
          this.onFirstMove();
          this.setMode('expand');
        }
        return;
      }
      const g = this.client.game;
      if (!this.isStarted() && g.owner[seg] === NEUTRAL && !this.view.isFrontier(seg)) {
        this.client.send({ type: 'relocate', companyId: 0, tile: seg });
        return;
      }
      this.client.send({ type: 'campaign', companyId: 0, tile: seg });
      this.onFirstMove();
      // A ripple where you clicked: instant feedback before the street changes hands.
      const ripple = document.createElement('div');
      ripple.className = `ripple${this.view.isFrontier(seg) ? '' : ' far'}`;
      ripple.style.left = `${e.point.x}px`;
      ripple.style.top = `${e.point.y}px`;
      map.getContainer().append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
    map.on('mousemove', (e: MapMouseEvent) => {
      const seg = this.view.segmentAt(e.point);
      map.getCanvas().style.cursor = seg >= 0 ? 'pointer' : '';
      this.view.setHover(seg);
      if (seg < 0) {
        this.hoverSeg = -1;
        this.tooltip.style.display = 'none';
        return;
      }
      this.hoverSeg = seg;
      this.refreshHover();
      const w = this.tooltip.offsetWidth || 260;
      const box = map.getContainer().getBoundingClientRect();
      const x = e.point.x + 16 + w > box.width ? e.point.x - w - 16 : e.point.x + 16;
      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.top = `${Math.min(e.point.y + 16, box.height - 140)}px`;
      this.tooltip.style.display = 'block';
    });
    map.on('mouseout', () => {
      this.hoverSeg = -1;
      this.tooltip.style.display = 'none';
      this.view.setHover(-1);
    });

    const onKey = (ev: KeyboardEvent) => {
      // Typing a name shouldn't pause the game; sliders and buttons can keep focus.
      const t = ev.target;
      if ((t instanceof HTMLInputElement && t.type === 'text') || t instanceof HTMLSelectElement) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const speeds: Record<string, number> = { ' ': 0 };
      if (ev.key in speeds) {
        ev.preventDefault();
        this.onSpeedKey(ev.key === ' ' && this.client.speed === 0 ? 1 : speeds[ev.key]);
      } else if (ev.key === 'Escape') {
        if (this.mode !== 'expand') this.setMode('expand');
        else this.onEscape();
      } else if (ev.key.length === 1 && this.onHotkey(ev.key)) {
        ev.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    // A focused button would also be "clicked" by Space; drop focus after clicks.
    const blurButtons = (e: MouseEvent) => (e.target as HTMLElement).closest('button')?.blur();
    window.addEventListener('click', blurButtons, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', blurButtons, true);
    };
  }

  /** Redraws the hover card for the street under the mouse (called as the game runs, so it stays current). */
  refreshHover(): void {
    const seg = this.hoverSeg;
    if (seg < 0) return;
    const g = this.client.game;
    const html =
      this.mode === 'guard'
        ? describeGuard(g, seg)
        : this.mode === 'ad'
          ? describeAd(g, this.city, seg)
          : this.mode === 'buy'
            ? describeDeal(g, seg)
            : describeSegment(g, this.city, seg, this.view.isFrontier(seg), !this.isStarted());
    if (html !== this.tooltip.innerHTML) this.tooltip.innerHTML = html;
  }

  /** Sets what the next map click does; pressing the same command again cancels it. */
  setMode(mode: ClickMode): void {
    this.mode = mode;
    document.body.dataset.mode = mode;
    this.onModeChange(mode);
  }

  toggleMode(mode: ClickMode): void {
    this.setMode(this.mode === mode ? 'expand' : mode);
  }
}

/** The hover card in ad mode: where the campaign will head, and what it buys. */
function describeAd(g: GameImpl, city: CityData, seg: number): string {
  const offer = g.adOffer(g.player);
  const ok = g.player.cash >= offer.cost;
  const name = city.segments.names[seg] || 'this street';
  if (g.owner[seg] === 0) return '<div class="hc-title">📢 Ad campaign</div><div class="hc-action muted">Aim at a street that isn\'t yours</div>';
  return `<div class="hc-title">📢 Ad campaign toward ${name}</div>
    <div class="hc-row"><span>+${offer.push} push, spent winning streets on the way</span></div>
    <div class="hc-action ${ok ? 'ok' : 'wait'}">${ok ? `Click to launch · ${money(offer.cost)}` : `Costs ${money(offer.cost)}: not enough cash`}</div>`;
}

/** The hover card in buy mode: which rival streets you'd get, and the price. */
function describeDeal(g: GameImpl, seg: number): string {
  const me = g.player;
  if (g.owner[seg] > 0 && g.dealLocked(seg)) {
    return `<div class="hc-title">🏢 Under contract</div><div class="hc-action muted">Can't be bought for ${Math.ceil(g.dealLockUntil[seg] - g.day)} more days</div>`;
  }
  const deal = g.streetDeal(me, seg);
  if (!deal) return '<div class="hc-title">🏢 Buy streets</div><div class="hc-action muted">Pick a rival\'s street</div>';
  const seller = g.companies[deal.seller];
  if (!g.borders(me, seg)) return `<div class="hc-title">🏢 Buy from ${seller.name}</div><div class="hc-action muted">Only streets next to yours</div>`;
  const ok = me.cash >= deal.cost;
  return `<div class="hc-title">🏢 Buy ${deal.streets.length} streets from ${seller.name}</div>
    <div class="hc-row"><span>Instant · under contract ${CONFIG.streetDeal.lockDays} days</span></div>
    <div class="hc-action ${ok ? 'ok' : 'wait'}">${ok ? `Click to buy · ${money(deal.cost)}` : `Costs ${money(deal.cost)}: not enough cash`}</div>`;
}

/** The hover card in guard mode: which streets a guard would cover, and the price. */
function describeGuard(g: GameImpl, seg: number): string {
  if (g.owner[seg] !== 0) return '<div class="hc-title">🛡 Guard</div><div class="hc-action muted">Pick one of your streets</div>';
  const offer = g.guardOffer(g.player, seg);
  const ok = g.player.cash >= offer.cost;
  return `<div class="hc-title">🛡 Guard this area</div>
    <div class="hc-row"><span>${offer.streets.length} of your streets · ${CONFIG.guard.days} days</span><span>×${CONFIG.guard.defenceMult} defence</span></div>
    <div class="hc-action ${ok ? 'ok' : 'wait'}">${ok ? `Click to guard · ${money(offer.cost)}` : `Costs ${money(offer.cost)}: not enough cash`}</div>`;
}

/** The parts of a defence worth naming in the hover card. */
const DEFENCE_PARTS = [
  ['service', 'service'],
  ['loyalty', 'loyal customers'],
  ['reserve', 'push reserve'],
  ['priceGap', 'your price'],
  ['guard', 'guarded'],
] as const;

/**
 * Roughly how many streets a click on `seg` wins: the campaign keeps taking
 * streets of the same owner around it until its budget runs out.
 */
function estimateCampaign(g: GameImpl, seg: number, budget: number): number {
  const me = g.player;
  const owner = g.owner[seg];
  const seen = new Set([seg]);
  const queue = [seg];
  let spent = 0;
  let won = 0;
  while (queue.length > 0 && won < 500) {
    const t = queue.shift()!;
    const cost = g.tileCost(me, owner, t);
    if (spent + cost > budget) break;
    spent += cost;
    won++;
    for (let k = g.map.adjStart[t]; k < g.map.adjStart[t + 1]; k++) {
      const n = g.map.adj[k];
      if (!seen.has(n) && g.owner[n] === owner) (seen.add(n), queue.push(n));
    }
  }
  return won;
}

/** The hover card: what a street is worth and whether you can take it now. Kept to 3–4 short lines. */
export function describeSegment(g: GameImpl, city: CityData, seg: number, reachable: boolean, beforeStart = false): string {
  const level = g.map.wealth[seg];
  const o = g.owner[seg];
  const me = g.player;
  const street = city.segments.names[seg] || 'Unnamed street';
  const vol = g.volume(me, level);
  const perDay =
    vol * (g.map.spend[seg] * CONFIG.prices[me.price].revenue * g.revenueMult() - g.map.demand[seg] * CONFIG.variableCostPerCustomer * g.variableCostMult(me));
  const customers = Math.max(1, Math.round(g.map.demand[seg]));
  const owner = o === NEUTRAL ? 'Untapped' : o === 0 ? 'Yours' : `<i style="background:rgb(${g.companies[o].color.join(',')})"></i>${g.companies[o].name}`;
  const lines: string[] = [];
  // Rivals' streets: how well defended, in one line.
  if (o > 0) {
    const s = g.streetCost(me, o, seg);
    const why = DEFENCE_PARTS.filter(([k]) => s[k] > 1.1).map(([, label]) => label);
    lines.push(`<div class="hc-cost">🛡 ×${s.defence.toFixed(1)}${why.length ? ` · ${why.join(', ')}` : ''}</div>`);
  }
  if (o === 0 && g.isGuarded(seg, 0)) lines.push(`<div class="hc-cost">🛡 Guarded · ${Math.ceil(g.guardUntil[seg] - g.day)}d</div>`);
  for (const e of g.localEvents.filter((ev) => ev.streets.includes(seg))) {
    const info = LOCAL_EVENT_INFO[e.kind];
    const when = !e.active && g.day < e.startsDay ? ` in ${Math.ceil(e.startsDay - g.day)}d` : '';
    lines.push(`<div class="hc-cost" title="${info.effect}">${info.icon} ${info.title}${when}</div>`);
  }
  if (beforeStart && o === NEUTRAL && !reachable) {
    lines.push('<div class="hc-action ok">📍 Click to start here</div>');
  } else if (o !== 0) {
    const cost = g.tileCost(me, o, seg);
    const budget = me.push * me.campaignShare;
    if (!reachable) lines.push('<div class="hc-action muted">Not next to your streets</div>');
    else if (budget >= cost) {
      const est = estimateCampaign(g, seg, budget);
      lines.push(`<div class="hc-action ok">✓ Click · ≈${est} street${est === 1 ? '' : 's'} · ${Math.floor(budget)} push</div>`);
    } else lines.push(`<div class="hc-action wait">Needs ${Math.ceil(cost)} push (you commit ${Math.floor(budget)})</div>`);
  }
  return `<div class="hc-title">${street} <span class="w${level}" title="${CONFIG.wealth[level].label}: customers spend ×${CONFIG.wealth[level].spend}">${'$'.repeat(level + 1)}</span></div>
    <div class="hc-row"><span>${owner} · ${customers} customer${customers === 1 ? '' : 's'}</span><span class="pos">${o === 0 ? '' : '≈ '}+${money(perDay)}/day</span></div>
    ${lines.join('')}`;
}
