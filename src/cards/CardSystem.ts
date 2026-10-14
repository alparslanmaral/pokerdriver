import { HAND_SIZE_MAX, HAND_SIZE_START, MAX_SELECTED } from '../config/cardConfig';
import { Emitter } from '../core/emitter';
import { Rng } from '../core/rng';
import { createDeck } from './Deck';
import { evaluateHand, HandResult } from './PokerEval';
import { Card } from './types';

export interface CardEvents {
  /** Hand / selection / pile changed: re-render. */
  changed: [];
  /** Cards were drawn (from a box pickup or the opening deal). */
  drawn: [cards: Card[], source: 'deal' | 'box'];
  played: [cards: Card[], result: HandResult];
  discarded: [card: Card];
  /** A card was knocked off the table (crash). `from` says where it came from. */
  knockedOff: [card: Card | null, from: 'hand' | 'deck' | 'none'];
}

/**
 * Pure card-state logic (no DOM, no rendering). Draw pile, hand, selection and the
 * "gone for this race" pile. UI and FX subscribe to `events`.
 */
export class CardSystem {
  readonly events = new Emitter<CardEvents>();
  drawPile: Card[] = [];
  hand: Card[] = [];
  private selected = new Set<number>();
  /** Played + discarded + knocked-off cards: never return during the race. */
  gone: Card[] = [];

  constructor(rng: Rng) {
    this.drawPile = createDeck(rng);
  }

  /** Opening hand. */
  deal(count = HAND_SIZE_START): void {
    const cards = this.take(Math.min(count, HAND_SIZE_MAX));
    this.hand.push(...cards);
    this.events.emit('drawn', cards, 'deal');
    this.events.emit('changed');
  }

  get handSpace(): number {
    return Math.max(0, HAND_SIZE_MAX - this.hand.length);
  }

  /** Draw up to `count` cards from the pile into the hand (only as many as fit). */
  drawFromBox(count: number): Card[] {
    const n = Math.min(count, this.handSpace, this.drawPile.length);
    if (n <= 0) return [];
    const cards = this.take(n);
    this.hand.push(...cards);
    this.events.emit('drawn', cards, 'box');
    this.events.emit('changed');
    return cards;
  }

  private take(n: number): Card[] {
    return this.drawPile.splice(0, n);
  }

  isSelected(id: number): boolean {
    return this.selected.has(id);
  }

  get selectedCards(): Card[] {
    return this.hand.filter((c) => this.selected.has(c.id));
  }

  /** Returns true if the card is now selected. */
  toggleSelect(id: number): boolean {
    if (!this.hand.some((c) => c.id === id)) return false;
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      if (this.selected.size >= MAX_SELECTED) {
        this.events.emit('changed');
        return false;
      }
      this.selected.add(id);
    }
    this.events.emit('changed');
    return this.selected.has(id);
  }

  clearSelection(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.events.emit('changed');
  }

  /** Best hand among the currently selected cards. */
  evaluateSelection(): HandResult | null {
    return evaluateHand(this.selectedCards);
  }

  /** Play the selected cards: they are all consumed. */
  playSelected(): { cards: Card[]; result: HandResult } | null {
    const cards = this.selectedCards;
    const result = evaluateHand(cards);
    if (!result) return null;
    this.removeFromHand(cards);
    this.gone.push(...cards);
    this.events.emit('played', cards, result);
    this.events.emit('changed');
    return { cards, result };
  }

  discard(id: number): Card | null {
    const card = this.hand.find((c) => c.id === id);
    if (!card) return null;
    this.removeFromHand([card]);
    this.gone.push(card);
    this.events.emit('discarded', card);
    this.events.emit('changed');
    return card;
  }

  /** Remove a specific card from the hand (used by the crash penalty). */
  removeFromHand(cards: Card[]): void {
    const ids = new Set(cards.map((c) => c.id));
    this.hand = this.hand.filter((c) => !ids.has(c.id));
    for (const id of ids) this.selected.delete(id);
  }

  /** Remove a card from the draw pile (crash penalty with an empty hand). */
  removeFromPile(index: number): Card | null {
    if (index < 0 || index >= this.drawPile.length) return null;
    const [card] = this.drawPile.splice(index, 1);
    this.gone.push(card);
    return card;
  }
}
