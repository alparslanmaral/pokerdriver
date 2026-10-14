import { TABLE_DOM } from '../config/cabinConfig';
import { HAND_SIZE_MAX, MAX_SELECTED } from '../config/cardConfig';
import { describeReward, HAND_REWARDS } from '../config/rewards';
import { CardSystem } from '../cards/CardSystem';
import { Card, SUIT_SYMBOL, isRed, rankLabel } from '../cards/types';
import { clamp } from '../core/math';
import { el } from './dom';

const CARD_W = 64;
const CARD_H = 92;
const DRAG_THRESHOLD = 6;

interface Pose {
  x: number;
  y: number;
  scale: number;
  rot: number;
}

export interface CardTableHooks {
  /** PLAY button pressed. */
  onPlay(): void;
  /** Client-space Y of the dashboard line: dropping above it throws the card out of the window. */
  getDropLineY(): number;
  onSelectSound(on: boolean): void;
  onDiscardSound(): void;
}

interface DragState {
  id: number;
  node: HTMLElement;
  card: Card;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  clone: HTMLElement | null;
  lastX: number;
  tilt: number;
}

function poseTransform(p: Pose): string {
  return `translate(${p.x - CARD_W / 2}px, ${p.y - CARD_H / 2}px) rotate(${p.rot}deg) scale(${p.scale})`;
}

export function createCardElement(card: Card): HTMLElement {
  const node = el('div', `card ${isRed(card.suit) ? 'red' : 'black'}`);
  const label = rankLabel(card.rank);
  const sym = SUIT_SYMBOL[card.suit];
  node.innerHTML = `<div class="c-corner tl"><b>${label}</b><i>${sym}</i></div><div class="c-pip">${sym}</div><div class="c-corner br"><b>${label}</b><i>${sym}</i></div>`;
  return node;
}

/**
 * The DOM card table glued to the 3D center console. Renders the hand, handles click-to-select,
 * drag-to-discard (window zone), the PLAY button and all card fly animations.
 */
export class CardTableUI {
  readonly root: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly rewardEl: HTMLElement;
  private readonly deckEl: HTMLElement;
  private readonly selEl: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly cardsLayer: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly nodes = new Map<number, HTMLElement>();
  private readonly pendingEntries = new Map<number, { x: number; y: number; delay: number }>();
  private readonly unsubs: Array<() => void> = [];
  private drag: DragState | null = null;
  private scale = 1;
  private enabled = false;
  private drawOrigin: { x: number; y: number } | null = null;

  constructor(
    parent: HTMLElement,
    private readonly cards: CardSystem,
    private readonly hooks: CardTableHooks,
  ) {
    this.zone = el('div', 'dropzone', parent);
    el('div', 'dropzone-label', this.zone, 'DROP HERE TO THROW THE CARD OUT OF THE WINDOW');

    this.root = el('div', 'ct', parent);
    this.root.style.width = `${TABLE_DOM.width}px`;
    this.root.style.height = `${TABLE_DOM.height}px`;
    this.root.style.visibility = 'hidden';

    const info = el('div', 'ct-info', this.root);
    this.nameEl = el('div', 'ct-name', info);
    this.rewardEl = el('div', 'ct-reward', info);

    const felt = el('div', 'ct-felt', this.root);
    this.cardsLayer = el('div', 'ct-cards', felt);
    this.flash = el('div', 'ct-flash', felt);

    const bar = el('div', 'ct-bar', this.root);
    this.deckEl = el('div', 'ct-deck', bar);
    this.playBtn = el('button', 'ct-play', bar, 'PLAY');
    this.selEl = el('div', 'ct-sel', bar);
    this.playBtn.addEventListener('mousedown', (e) => e.preventDefault()); // never keep keyboard focus
    this.playBtn.addEventListener('click', () => {
      if (this.enabled && this.cards.selectedCards.length > 0) this.hooks.onPlay();
    });

    this.unsubs.push(
      cards.events.on('changed', () => this.render()),
      cards.events.on('drawn', (drawn, source) => this.onDrawn(drawn, source)),
      cards.events.on('played', (played) => this.onPlayed(played)),
      cards.events.on('knockedOff', (card, from) => this.onKnocked(card, from)),
    );
    this.render();
  }

  // ------------------------------------------------------------------ external control

  /** Place the panel: centre in client pixels and uniform scale. */
  setAnchor(cx: number, cy: number, scale: number): void {
    this.scale = scale;
    this.root.style.visibility = 'visible';
    this.root.style.transform = `translate(${cx - TABLE_DOM.width / 2}px, ${cy - TABLE_DOM.height / 2}px) scale(${scale})`;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.classList.toggle('disabled', !enabled);
    if (!enabled) this.cancelDrag();
    this.updatePlayButton();
  }

  /** Where newly drawn cards should fly in from (client pixels), e.g. the projected card box. */
  setDrawOrigin(x: number, y: number): void {
    this.drawOrigin = { x, y };
  }

  /** Brief highlight around the table (e.g. when a hand pays out). */
  pulse(kind: 'good' | 'bad'): void {
    this.flash.className = 'ct-flash';
    void this.flash.offsetWidth;
    this.flash.className = `ct-flash on ${kind}`;
  }

  get busyDragging(): boolean {
    return this.drag?.dragging ?? false;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.cancelDrag();
    this.root.remove();
    this.zone.remove();
    document.querySelectorAll('.card.fly').forEach((n) => n.remove());
  }

  // ------------------------------------------------------------------ rendering

  private render(): void {
    const hand = this.cards.hand;
    const ids = new Set(hand.map((c) => c.id));
    for (const [id, node] of this.nodes) {
      if (!ids.has(id)) {
        node.remove();
        this.nodes.delete(id);
      }
    }
    if (this.drag && !ids.has(this.drag.id)) this.cancelDrag();

    const n = hand.length;
    const feltW = TABLE_DOM.width - 30;
    const step = n > 1 ? Math.min(68, (feltW - CARD_W) / (n - 1)) : 0;
    const total = (n - 1) * step + CARD_W;
    const startX = (feltW - total) / 2;
    const result = this.cards.evaluateSelection();
    const scoring = new Set(result?.scoring.map((c) => c.id));

    hand.forEach((card, i) => {
      let node = this.nodes.get(card.id);
      const fresh = !node;
      if (!node) {
        node = this.createHandNode(card);
        this.nodes.set(card.id, node);
      }
      const mid = (i - (n - 1) / 2) * 1;
      const selected = this.cards.isSelected(card.id);
      node.style.left = `${startX + i * step}px`;
      node.style.transform = `translateY(${Math.abs(mid) * Math.abs(mid) * 1.6 + (selected ? -20 : 4)}px) rotate(${mid * 3.2}deg)`;
      node.style.zIndex = String(i + (selected ? 30 : 0));
      node.classList.toggle('selected', selected);
      node.classList.toggle('scoring', selected && scoring.has(card.id));
      if (fresh) {
        this.cardsLayer.appendChild(node);
        const entry = this.pendingEntries.get(card.id);
        if (entry) {
          this.pendingEntries.delete(card.id);
          node.style.visibility = 'hidden';
          node.style.transition = 'none';
          const r = node.getBoundingClientRect();
          const to: Pose = { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: this.scale, rot: (i - (n - 1) / 2) * 3.2 };
          void node.offsetWidth;
          node.style.transition = '';
          void this.flyClone(card, { x: entry.x, y: entry.y, scale: this.scale * 0.35, rot: -25 }, to, {
            duration: 520,
            delay: entry.delay,
            easing: 'cubic-bezier(.2,.9,.25,1.1)',
            fadeIn: true,
          }).then(() => {
            if (this.nodes.get(card.id) === node) node!.style.visibility = '';
          });
        }
      }
    });

    // Info readout
    const sel = this.cards.selectedCards;
    if (sel.length === 0) {
      this.nameEl.textContent = 'Select 1-5 cards';
      this.nameEl.className = 'ct-name idle';
      this.rewardEl.textContent = hand.length === 0 ? 'Hand empty: find card boxes' : 'then press PLAY';
    } else if (result) {
      this.nameEl.textContent = HAND_REWARDS[result.kind].label;
      this.nameEl.className = `ct-name kind-${result.kind}`;
      this.rewardEl.textContent = describeReward(result.kind);
    }
    this.deckEl.innerHTML = `DECK <b>${this.cards.drawPile.length}</b>`;
    this.selEl.innerHTML = `HAND <b>${hand.length}/${HAND_SIZE_MAX}</b> &middot; SEL <b>${sel.length}/${MAX_SELECTED}</b>`;
    this.updatePlayButton();
  }

  private updatePlayButton(): void {
    this.playBtn.disabled = !this.enabled || this.cards.selectedCards.length === 0;
  }

  private createHandNode(card: Card): HTMLElement {
    const node = createCardElement(card);
    node.dataset.id = String(card.id);
    node.addEventListener('pointerdown', (e) => this.onPointerDown(e, card, node));
    node.addEventListener('pointermove', (e) => this.onPointerMove(e));
    node.addEventListener('pointerup', (e) => this.onPointerUp(e));
    node.addEventListener('pointercancel', () => this.cancelDrag());
    return node;
  }

  // ------------------------------------------------------------------ pointer / drag

  private onPointerDown(e: PointerEvent, card: Card, node: HTMLElement): void {
    if (!this.enabled || e.button !== 0 || this.drag) return;
    e.preventDefault();
    e.stopPropagation();
    node.setPointerCapture(e.pointerId);
    this.drag = {
      id: card.id,
      node,
      card,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      clone: null,
      lastX: e.clientX,
      tilt: 0,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.dragging) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.dragging = true;
      d.node.classList.add('ghost');
      d.clone = createCardElement(d.card);
      d.clone.classList.add('fly', 'dragging');
      document.body.appendChild(d.clone);
      this.zone.classList.add('active');
    }
    d.tilt = clamp((e.clientX - d.lastX) * 1.2 + d.tilt * 0.6, -22, 22);
    d.lastX = e.clientX;
    if (d.clone) d.clone.style.transform = poseTransform({ x: e.clientX, y: e.clientY, scale: this.scale * 1.15, rot: d.tilt });
    const line = this.hooks.getDropLineY();
    this.zone.style.height = `${line}px`;
    this.zone.classList.toggle('hot', e.clientY < line);
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    try {
      d.node.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d.dragging) {
      // plain click = toggle selection
      const wasSelected = this.cards.isSelected(d.id);
      const now = this.cards.toggleSelect(d.id);
      if (!wasSelected && !now) {
        d.node.classList.remove('deny');
        void d.node.offsetWidth;
        d.node.classList.add('deny');
      } else {
        this.hooks.onSelectSound(now);
      }
      this.drag = null;
      return;
    }

    const line = this.hooks.getDropLineY();
    const inWindow = e.clientY < line;
    const clone = d.clone;
    const card = d.card;
    this.endDragVisuals();
    this.drag = null;
    if (clone) clone.remove();

    if (inWindow) {
      this.hooks.onDiscardSound();
      const from: Pose = { x: e.clientX, y: e.clientY, scale: this.scale * 1.15, rot: d.tilt };
      const side = e.clientX > window.innerWidth / 2 ? 1 : -1;
      const to: Pose = { x: e.clientX + side * 160, y: -140, scale: this.scale * 0.2, rot: side * 420 };
      void this.flyClone(card, from, to, { duration: 650, easing: 'cubic-bezier(.4,0,.9,.6)', fadeOut: true });
      this.cards.discard(card.id); // emits changed -> removes the node
    } else {
      // dropped back on the table: fly home
      const r = d.node.getBoundingClientRect();
      const from: Pose = { x: e.clientX, y: e.clientY, scale: this.scale * 1.15, rot: d.tilt };
      const to: Pose = { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: this.scale, rot: 0 };
      void this.flyClone(card, from, to, { duration: 220, easing: 'ease-out' }).then(() => d.node.classList.remove('ghost'));
    }
  }

  private endDragVisuals(): void {
    this.zone.classList.remove('active', 'hot');
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    d.clone?.remove();
    d.node.classList.remove('ghost');
    this.endDragVisuals();
    this.drag = null;
  }

  // ------------------------------------------------------------------ card events -> animations

  private onDrawn(drawn: Card[], source: 'deal' | 'box'): void {
    const o = this.drawOrigin ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
    this.drawOrigin = null;
    drawn.forEach((c, i) => {
      if (source === 'deal') {
        this.pendingEntries.set(c.id, { x: o.x, y: window.innerHeight + 80, delay: i * 70 });
      } else {
        this.pendingEntries.set(c.id, { x: o.x, y: o.y, delay: i * 140 });
      }
    });
  }

  private onPlayed(played: Card[]): void {
    this.pulse('good');
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.3;
    played.forEach((c, i) => {
      const node = this.nodes.get(c.id);
      if (!node) return;
      const r = node.getBoundingClientRect();
      const from: Pose = { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: this.scale, rot: 0 };
      const spread = (i - (played.length - 1) / 2) * 62;
      const mid: Pose = { x: cx + spread, y: cy, scale: 1.25, rot: (i - (played.length - 1) / 2) * 6 };
      void this.flyClone(c, from, mid, { duration: 360, delay: i * 40, easing: 'cubic-bezier(.2,.8,.3,1)' }).then(() => {
        void this.flyClone(c, mid, { ...mid, y: cy - 40, scale: 1.5 }, { duration: 520, easing: 'ease-out', fadeOut: true, glow: true });
      });
    });
  }

  private onKnocked(card: Card | null, from: 'hand' | 'deck' | 'none'): void {
    this.pulse('bad');
    if (!card || from !== 'hand') return;
    const node = this.nodes.get(card.id);
    if (!node) return;
    const r = node.getBoundingClientRect();
    const start: Pose = { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: this.scale, rot: 0 };
    const dir = Math.random() < 0.5 ? -1 : 1;
    const end: Pose = { x: start.x + dir * (90 + Math.random() * 140), y: window.innerHeight + 140, scale: this.scale * 0.9, rot: dir * (160 + Math.random() * 200) };
    void this.flyClone(card, start, end, { duration: 780, easing: 'cubic-bezier(.35,.05,.85,.45)', fadeOut: true });
  }

  // ------------------------------------------------------------------ animation helper

  private flyClone(
    card: Card,
    from: Pose,
    to: Pose,
    opts: { duration: number; delay?: number; easing?: string; fadeIn?: boolean; fadeOut?: boolean; glow?: boolean },
  ): Promise<void> {
    return new Promise((resolve) => {
      const clone = createCardElement(card);
      clone.classList.add('fly');
      if (opts.glow) clone.classList.add('glow');
      clone.style.transform = poseTransform(from);
      document.body.appendChild(clone);
      const anim = clone.animate(
        [
          { transform: poseTransform(from), opacity: opts.fadeIn ? 0.2 : 1 },
          { transform: poseTransform(to), opacity: opts.fadeOut ? 0 : 1 },
        ],
        { duration: opts.duration, delay: opts.delay ?? 0, easing: opts.easing ?? 'ease-out', fill: 'both' },
      );
      const done = (): void => {
        clone.remove();
        resolve();
      };
      anim.onfinish = done;
      anim.oncancel = done;
    });
  }
}
