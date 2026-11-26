import { canDrawBluff, drawBluff, otherPlayers } from '../ops';
import type { TurnAbilityHandler } from './types';

/** Dandanayaka: another player draws bluffing cards (ruling 3: 2 by default). */
export const dandanayaka: TurnAbilityHandler = {
  type: 'DANDANAYAKA',
  timing: 'turn',
  afterUse: 'discard',
  needs: 'otherPlayer',

  availability(s, player) {
    const targets = otherPlayers(s, player);
    if (!targets.length) return { usable: false, reason: 'There is no other player to target.' };
    if (s.config.rulings.dandanayakaNeedsDrawableCards && !canDrawBluff(s)) {
      return {
        usable: false,
        reason: 'There are no bluffing cards left to draw (the deck is empty and no covered cards can be reshuffled).',
      };
    }
    return { usable: true, reason: null, targetPlayers: targets };
  },

  validate(s, player, params) {
    if (!params.targetPlayer || !otherPlayers(s, player).includes(params.targetPlayer)) {
      return 'Choose another player to draw cards.';
    }
    return null;
  },

  apply(ctx, _player, params) {
    drawBluff(ctx, params.targetPlayer!, ctx.s.config.rulings.dandanayakaDrawCount, 'dandanayaka');
  },
};
