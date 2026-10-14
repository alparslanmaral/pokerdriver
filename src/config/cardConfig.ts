/** Card system constants. Later upgradeable (e.g. extra cards in the deck, larger hand). */

/** Number of cards in the deck at race start. 52 = standard deck. */
export const DECK_SIZE = 52;
export const HAND_SIZE_START = 7;
export const HAND_SIZE_MAX = 7;
export const MAX_SELECTED = 5;

/** Card boxes on the track. */
export const BOXES = {
  cardsPerPickup: 2,
  respawnSeconds: 6,
  pickupRadius: 1.9,
  /** Number of box clusters per lap (approx; scaled by track length). */
  clusterSpacing: 420,
  boxSize: 1.5,
  hoverHeight: 1.35,
  /** Cluster layouts: lateral offsets (m) across the road width. */
  layouts: [
    [-6.5, -3.25, 0, 3.25, 6.5],
    [-5, 0, 5],
    [-6, -2, 2, 6],
    [-4.5, -1.5, 1.5, 4.5],
  ] as number[][],
};
