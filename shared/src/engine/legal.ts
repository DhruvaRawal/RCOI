/**
 * What a player may do right now. The reducer validates with these same functions,
 * and the server sends the result to the client so it can highlight legal targets.
 */
import { BLUFF_CARDS, cardName } from '../data/cards';
import { getAbilityHandler } from './abilities/registry';
import { abilityTypeOf, bluffTypeOf, canDrawBluff, getPlayer, topOf } from './ops';
import { isChallengeable } from './rulings';
import type {
  AbilityOption,
  AwaitingKind,
  CardId,
  GameState,
  LegalActions,
  PileId,
  PlayOption,
  PlayerId,
  ReactionTrigger,
} from './types';

export function playOptions(s: GameState, playerId: PlayerId): { options: PlayOption[]; notice: string | null } {
  const p = getPlayer(s, playerId);
  const allPiles = s.piles.map((x) => x.id);
  if (p.hand.length >= 2) {
    // Any card on any pile. Never hint at the "honest" pile.
    return { options: p.hand.map((cardId) => ({ cardId, pileIds: allPiles, faceUp: false })), notice: null };
  }
  if (p.hand.length === 0) return { options: [], notice: null };

  // Last card: never face down.
  const cardId = p.hand[0];
  const t = bluffTypeOf(s, cardId);
  const name = cardName(t);
  if (!BLUFF_CARDS[t].canOpenPile) {
    return {
      options: [{ cardId, pileIds: allPiles, faceUp: true }],
      notice: `Last card: it can't be played face down. ${name} has no pile, so you may play it face up on any pile.`,
    };
  }
  const match = s.piles.find((x) => x.type === t);
  if (match) {
    return {
      options: [{ cardId, pileIds: [match.id], faceUp: true }],
      notice: `Last card: it can't be played face down. You may play your ${name} face up on the ${name} pile.`,
    };
  }
  return {
    options: [{ cardId, pileIds: [], faceUp: true }],
    notice: `Last card: no open pile matches your ${name}, so it can't be played. You can still challenge, use an ability or draw.`,
  };
}

export function challengeTargets(s: GameState, playerId: PlayerId): PileId[] {
  if (getPlayer(s, playerId).hand.length === 0) return [];
  return s.piles
    .filter((pile) => {
      const top = topOf(pile);
      return !!top && top.owner !== playerId && isChallengeable(s, top, true);
    })
    .map((pile) => pile.id);
}

function challengeReason(s: GameState, playerId: PlayerId, targets: PileId[]): string | null {
  if (targets.length) return null;
  if (getPlayer(s, playerId).hand.length === 0) return 'You need a bluffing card to challenge with.';
  return 'No card can be challenged. Only a top card with a meeple, placed by another player, can be challenged.';
}

function drawReason(s: GameState): string | null {
  return canDrawBluff(s) ? null : 'The bluffing deck is empty and there are no covered cards to reshuffle.';
}

/** One entry per ability card held. `asTurnAction` is false when it isn't this player's turn. */
export function abilityOptions(s: GameState, playerId: PlayerId, asTurnAction: boolean): AbilityOption[] {
  const p = getPlayer(s, playerId);
  return p.abilities.map((abilityId) => {
    const type = abilityTypeOf(s, abilityId);
    const h = getAbilityHandler(type);
    if (h.timing === 'reaction') {
      return { abilityId, type, timing: 'reaction', needs: 'none', usable: false, reason: h.idleReason };
    }
    if (!asTurnAction) {
      return { abilityId, type, timing: 'turn', needs: h.needs, usable: false, reason: 'Abilities are used on your turn.' };
    }
    const a = h.availability(s, playerId);
    return {
      abilityId,
      type,
      timing: 'turn',
      needs: h.needs,
      usable: a.usable,
      reason: a.reason,
      targetPlayers: a.targetPlayers,
      cardIds: a.cardIds,
    };
  });
}

export function reactionCards(s: GameState, playerId: PlayerId, trigger: ReactionTrigger): CardId[] {
  return getPlayer(s, playerId).abilities.filter((id) => {
    const h = getAbilityHandler(abilityTypeOf(s, id));
    return h.timing === 'reaction' && h.trigger === trigger;
  });
}

/**
 * Whether to pause for a reaction. With 'anyAbility' (default) the pause happens whenever the player
 * holds any ability card, so the pause itself doesn't reveal that they hold a reaction card.
 */
export function needsReactionWindow(s: GameState, playerId: PlayerId, trigger: ReactionTrigger): boolean {
  if (s.config.rulings.reactionWindow === 'anyAbility') return getPlayer(s, playerId).abilities.length > 0;
  return reactionCards(s, playerId, trigger).length > 0;
}

export function hasAnyTurnAction(s: GameState, playerId: PlayerId): boolean {
  return (
    playOptions(s, playerId).options.some((o) => o.pileIds.length > 0) ||
    challengeTargets(s, playerId).length > 0 ||
    canDrawBluff(s) ||
    abilityOptions(s, playerId, true).some((a) => a.usable)
  );
}

/** Who must act now, and what kind of decision it is. Null when the game is over. */
export function awaiting(s: GameState): { player: PlayerId; kind: AwaitingKind } | null {
  if (s.winner) return null;
  if (s.pending?.kind === 'reaction') return { player: s.pending.player, kind: 'reaction' };
  if (s.pending?.kind === 'give') return { player: s.pending.from, kind: 'give' };
  return { player: s.currentPlayer, kind: 'turn' };
}

export function getLegalActions(s: GameState, playerId: PlayerId): LegalActions {
  const none: LegalActions = {
    awaiting: null,
    play: [],
    playNotice: null,
    challenge: { pileIds: [], reason: null },
    draw: { allowed: false, reason: null },
    abilities: s.winner ? [] : abilityOptions(s, playerId, false),
    give: null,
    reaction: null,
  };
  const aw = awaiting(s);
  if (!aw || aw.player !== playerId) return none;

  if (aw.kind === 'give' && s.pending?.kind === 'give') {
    return { ...none, awaiting: 'give', give: { to: s.pending.to, cardIds: [...getPlayer(s, playerId).hand] } };
  }
  if (aw.kind === 'reaction' && s.pending?.kind === 'reaction') {
    return { ...none, awaiting: 'reaction', reaction: { abilityIds: reactionCards(s, playerId, s.pending.trigger) } };
  }

  const play = playOptions(s, playerId);
  const targets = challengeTargets(s, playerId);
  return {
    awaiting: 'turn',
    play: play.options,
    playNotice: play.notice,
    challenge: { pileIds: targets, reason: challengeReason(s, playerId, targets) },
    draw: { allowed: canDrawBluff(s), reason: drawReason(s) },
    abilities: abilityOptions(s, playerId, true),
    give: null,
    reaction: null,
  };
}
