import { HandKind } from '../config/rewards';
import { Card } from './types';

export interface HandResult {
  kind: HandKind;
  /** Cards that make up the hand (for display). */
  scoring: Card[];
}

/**
 * Evaluate the best poker hand among 1..5 cards. Fewer than five cards can still form
 * high card / pair / two pair / three / four of a kind; straights and flushes need all five.
 * The ace counts high or low in straights (A-2-3-4-5 and 10-J-Q-K-A).
 */
export function evaluateHand(cards: readonly Card[]): HandResult | null {
  if (cards.length === 0) return null;

  const counts = new Map<number, Card[]>();
  for (const c of cards) {
    const list = counts.get(c.rank) ?? [];
    list.push(c);
    counts.set(c.rank, list);
  }
  const groups = [...counts.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);

  const isFive = cards.length === 5;
  const flush = isFive && cards.every((c) => c.suit === cards[0].suit);
  const straight = isFive && isStraight(cards.map((c) => c.rank));

  const make = (kind: HandKind, scoring: Card[]): HandResult => ({ kind, scoring });

  if (straight && flush) return make('straightFlush', [...cards]);
  if (groups[0].length === 4) return make('fourKind', groups[0]);
  if (groups[0].length === 3 && groups[1] && groups[1].length === 2) return make('fullHouse', [...cards]);
  if (flush) return make('flush', [...cards]);
  if (straight) return make('straight', [...cards]);
  if (groups[0].length === 3) return make('threeKind', groups[0]);
  if (groups[0].length === 2 && groups[1] && groups[1].length === 2) return make('twoPair', [...groups[0], ...groups[1]]);
  if (groups[0].length === 2) return make('pair', groups[0]);

  const high = [...cards].sort((a, b) => b.rank - a.rank)[0];
  return make('highCard', [high]);
}

function isStraight(ranks: number[]): boolean {
  const set = new Set(ranks);
  if (set.size !== 5) return false;
  const sorted = [...set].sort((a, b) => a - b);
  if (sorted[4] - sorted[0] === 4) return true;
  // Ace low: A,2,3,4,5
  return sorted[4] === 14 && sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5;
}
