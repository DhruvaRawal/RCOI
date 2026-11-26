import { BLUFF_CARDS, type BluffType } from '../../data/cards';
import { checkWin, getPlayer, removeFromHand } from '../ops';
import { rajBhandariEligibleCards } from '../rulings';
import type { TurnAbilityHandler } from './types';

/**
 * Raj Bhandari (ruling 5): place a bluffing card from your hand face up as the open card of a new pile.
 * The type must have no pile yet and can never be Vidushaka. The ability card is destroyed.
 */
export const rajBhandari: TurnAbilityHandler = {
  type: 'RAJ_BHANDARI',
  timing: 'turn',
  afterUse: 'destroy',
  needs: 'ownBluffCard',

  availability(s, player) {
    const cardIds = rajBhandariEligibleCards(s, player);
    if (cardIds.length) return { usable: true, reason: null, cardIds };
    const piles = s.piles.map((p) => BLUFF_CARDS[p.type].name).join(', ');
    return {
      usable: false,
      reason: `You need a bluffing card whose type has no open pile yet (never Vidushaka). Open piles: ${piles}.`,
    };
  },

  validate(s, player, params) {
    if (!params.cardId || !rajBhandariEligibleCards(s, player).includes(params.cardId)) {
      return 'Choose a card whose type has no open pile yet (never Vidushaka).';
    }
    return null;
  },

  apply(ctx, player, params) {
    const s = ctx.s;
    const cardId = params.cardId!;
    const type = s.cards[cardId].type as BluffType;
    removeFromHand(getPlayer(s, player), cardId);
    const pileId = `p${s.nextPileNumber++}`;
    s.piles.push({ id: pileId, type, openCard: cardId, stack: [], origin: 'ability', createdBy: player });
    ctx.emit({ type: 'PILE_CREATED', player, pileId, pileType: type });
    checkWin(ctx, player, 'RAJ_BHANDARI');
  },
};
