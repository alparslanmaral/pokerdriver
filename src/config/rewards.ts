/**
 * Data-driven hand rewards. Add / change entries here; the game never hard-codes rewards.
 * An effect is applied through RewardTarget (see cards/applyReward.ts).
 */

export type HandKind =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourKind'
  | 'straightFlush';

export type RewardEffect =
  | { type: 'money'; amount: number }
  | { type: 'nitro'; seconds: number }
  | { type: 'oil'; seconds: number }
  | { type: 'shield'; seconds: number }
  | { type: 'slowRivals'; factor: number; seconds: number };

export interface HandReward {
  label: string;
  effects: RewardEffect[];
}

/** Ordered weakest -> strongest. */
export const HAND_ORDER: HandKind[] = [
  'highCard',
  'pair',
  'twoPair',
  'threeKind',
  'straight',
  'flush',
  'fullHouse',
  'fourKind',
  'straightFlush',
];

export const HAND_REWARDS: Record<HandKind, HandReward> = {
  highCard: { label: 'High Card', effects: [{ type: 'money', amount: 40 }] },
  pair: { label: 'Pair', effects: [{ type: 'money', amount: 150 }] },
  twoPair: { label: 'Two Pair', effects: [{ type: 'money', amount: 300 }] },
  threeKind: { label: 'Three of a Kind', effects: [{ type: 'nitro', seconds: 3 }] },
  straight: { label: 'Straight', effects: [{ type: 'oil', seconds: 8 }] },
  flush: { label: 'Flush', effects: [{ type: 'nitro', seconds: 6 }] },
  fullHouse: {
    label: 'Full House',
    effects: [
      { type: 'nitro', seconds: 4 },
      { type: 'money', amount: 200 },
    ],
  },
  fourKind: { label: 'Four of a Kind', effects: [{ type: 'shield', seconds: 12 }] },
  straightFlush: {
    label: 'Straight Flush',
    effects: [
      { type: 'nitro', seconds: 10 },
      { type: 'slowRivals', factor: 0.2, seconds: 6 },
    ],
  },
};

/** Short human readable text for one effect, used by the card table preview. */
export function describeEffect(e: RewardEffect): string {
  switch (e.type) {
    case 'money':
      return `+${e.amount}$`;
    case 'nitro':
      return `${e.seconds}s nitro`;
    case 'oil':
      return `${e.seconds}s oil slicks`;
    case 'shield':
      return `${e.seconds}s shield`;
    case 'slowRivals':
      return `rivals -${Math.round(e.factor * 100)}% for ${e.seconds}s`;
  }
}

export function describeReward(kind: HandKind): string {
  return HAND_REWARDS[kind].effects.map(describeEffect).join(' + ');
}
