export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
/** 2..10, 11 = J, 12 = Q, 13 = K, 14 = A */
export type Rank = number;

export interface Card {
  /** Unique id within a deck (stable while the card lives). */
  id: number;
  suit: Suit;
  rank: Rank;
}

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    case 14:
      return 'A';
    default:
      return String(rank);
  }
}
