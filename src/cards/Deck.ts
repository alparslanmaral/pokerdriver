import { DECK_SIZE } from '../config/cardConfig';
import { Rng } from '../core/rng';
import { Card, SUITS } from './types';

/**
 * Build a deck of `size` cards. 52 = one of each (4 suits x 13 ranks). Larger sizes (future upgrade)
 * repeat the standard set; smaller sizes keep a random subset.
 */
export function createDeck(rng: Rng, size: number = DECK_SIZE): Card[] {
  const base: Omit<Card, 'id'>[] = [];
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) base.push({ suit, rank });

  const cards: Card[] = [];
  for (let i = 0; i < size; i++) {
    const b = base[i % base.length];
    cards.push({ id: i, suit: b.suit, rank: b.rank });
  }
  return rng.shuffle(cards);
}
