import { otherPlayers } from '../ops';
import { exchangeHands } from '../rulings';
import type { TurnAbilityHandler } from './types';

/** Mahamantri: exchange bluffing hands with any other player (ruling 2). */
export const mahamantri: TurnAbilityHandler = {
  type: 'MAHAMANTRI',
  timing: 'turn',
  afterUse: 'discard',
  needs: 'otherPlayer',

  availability(s, player) {
    const targets = otherPlayers(s, player);
    return targets.length
      ? { usable: true, reason: null, targetPlayers: targets }
      : { usable: false, reason: 'There is no other player to exchange hands with.' };
  },

  validate(s, player, params) {
    if (!params.targetPlayer || !otherPlayers(s, player).includes(params.targetPlayer)) {
      return 'Choose another player to exchange hands with.';
    }
    return null;
  },

  apply(ctx, player, params) {
    exchangeHands(ctx, player, params.targetPlayer!);
  },
};
