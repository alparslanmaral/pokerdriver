import { HAND_REWARDS, HandKind, RewardEffect } from '../config/rewards';

/**
 * What a reward can do to the race. The Race implements this; rewards stay pure data.
 * A future AI card-user could implement the same interface for a rival.
 */
export interface RewardTarget {
  addMoney(amount: number): void;
  addNitro(seconds: number): void;
  startOil(seconds: number): void;
  addShield(seconds: number): void;
  slowRivals(factor: number, seconds: number): void;
}

export function applyEffect(effect: RewardEffect, target: RewardTarget): void {
  switch (effect.type) {
    case 'money':
      target.addMoney(effect.amount);
      break;
    case 'nitro':
      target.addNitro(effect.seconds);
      break;
    case 'oil':
      target.startOil(effect.seconds);
      break;
    case 'shield':
      target.addShield(effect.seconds);
      break;
    case 'slowRivals':
      target.slowRivals(effect.factor, effect.seconds);
      break;
  }
}

export function applyHandReward(kind: HandKind, target: RewardTarget): void {
  for (const effect of HAND_REWARDS[kind].effects) applyEffect(effect, target);
}
