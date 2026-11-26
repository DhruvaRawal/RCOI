import { applyChikitsaka } from '../rulings';
import type { ReactionAbilityHandler } from './types';

/** Chikitsaka (ruling 4): played out of turn when your bluff is caught; cancels your penalty. */
export const chikitsaka: ReactionAbilityHandler = {
  type: 'CHIKITSAKA',
  timing: 'reaction',
  trigger: 'LOST_CHALLENGE_AS_BLUFFER',
  afterUse: 'discard',
  idleReason: 'Chikitsaka can only be played when your bluff is caught in a challenge.',

  apply(ctx, _player, pending) {
    applyChikitsaka(ctx, pending.challenge);
    return 'resolved';
  },
};
