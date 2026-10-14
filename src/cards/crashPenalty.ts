import { Rng } from '../core/rng';
import { Card } from './types';
import { CardSystem } from './CardSystem';

export interface CrashPenaltyResult {
  card: Card | null;
  from: 'hand' | 'deck' | 'none';
}

/**
 * THE crash penalty. Called on every hard crash (unless shielded). Swap this single function
 * to change the rule (e.g. lose several cards, lose the best card, ...).
 *
 * Default: one random card is knocked off the table. If the hand is empty the card is taken
 * from the draw pile instead (the HUD flashes); if that is empty too, nothing happens.
 */
export function applyCrashPenalty(cards: CardSystem, rng: Rng): CrashPenaltyResult {
  if (cards.hand.length > 0) {
    const card = cards.hand[Math.floor(rng.next() * cards.hand.length)];
    cards.removeFromHand([card]);
    cards.gone.push(card);
    cards.events.emit('knockedOff', card, 'hand');
    cards.events.emit('changed');
    return { card, from: 'hand' };
  }
  if (cards.drawPile.length > 0) {
    const index = Math.floor(rng.next() * cards.drawPile.length);
    const card = cards.removeFromPile(index);
    cards.events.emit('knockedOff', card, 'deck');
    cards.events.emit('changed');
    return { card, from: 'deck' };
  }
  cards.events.emit('knockedOff', null, 'none');
  return { card: null, from: 'none' };
}
