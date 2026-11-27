/**
 * Local action composition: pick an action, pick its targets, then confirm or cancel.
 * Pure helpers derive highlights and the confirmation text from the server's LegalActions,
 * so the client never decides legality on its own.
 */
import {
  ABILITY_CARDS,
  type AbilityOption,
  type CardId,
  type PileId,
  type PlayerAction,
  type PlayerId,
  type PlayerView,
  cardName,
} from '@rcoi/shared';
import { create } from 'zustand';

export type Mode =
  | { kind: 'idle' }
  | { kind: 'play'; cardId: CardId | null; pileId: PileId | null }
  | { kind: 'challenge'; pileId: PileId | null; cardId: CardId | null }
  | { kind: 'ability'; abilityId: CardId; targetPlayer: PlayerId | null; cardId: CardId | null }
  | { kind: 'give'; cardId: CardId | null };

export const useTurnUI = create<{ mode: Mode }>(() => ({ mode: { kind: 'idle' } }));
export const setMode = (mode: Mode) => useTurnUI.setState({ mode });
export const resetMode = () => useTurnUI.setState({ mode: { kind: 'idle' } });

/**
 * A selection can go stale when a new view arrives (e.g. Mahamantri swapped your hand while you were
 * choosing). Anything that no longer exists, or an action that is no longer awaited, falls back to idle.
 */
export function sanitizeMode(v: PlayerView, mode: Mode): Mode {
  const legal = v.legal;
  const inHand = (id: CardId | null) => id === null || v.hand.some((c) => c.id === id);
  const pileOk = (id: PileId | null) => id === null || v.piles.some((p) => p.id === id);
  if (legal.awaiting === 'give') {
    return mode.kind === 'give' && inHand(mode.cardId) ? mode : { kind: 'give', cardId: null };
  }
  if (legal.awaiting !== 'turn') return { kind: 'idle' };
  switch (mode.kind) {
    case 'play':
    case 'challenge':
      return inHand(mode.cardId) && pileOk(mode.pileId) ? mode : { kind: 'idle' };
    case 'ability':
      return v.abilities.some((a) => a.id === mode.abilityId) && inHand(mode.cardId) ? mode : { kind: 'idle' };
    case 'give':
      return { kind: 'idle' };
    default:
      return mode;
  }
}

const handType = (v: PlayerView, id: CardId | null) => v.hand.find((c) => c.id === id)?.type;
const pileType = (v: PlayerView, id: PileId | null) => v.piles.find((p) => p.id === id)?.type;

export function abilityOption(v: PlayerView, abilityId: CardId): AbilityOption | undefined {
  return v.legal.abilities.find((a) => a.abilityId === abilityId);
}

// ---------------------------------------------------------------------------
// Clicks
// ---------------------------------------------------------------------------

export type Notice = (text: string) => void;

export function clickHandCard(v: PlayerView, mode: Mode, cardId: CardId, notice: Notice): void {
  const legal = v.legal;
  // Tapping the selected card again deselects it.
  if (legal.awaiting === 'give') {
    return setMode({ kind: 'give', cardId: mode.kind === 'give' && mode.cardId === cardId ? null : cardId });
  }
  if (legal.awaiting !== 'turn') return;

  if (mode.kind === 'challenge') {
    if (!mode.pileId) return notice('First choose the card you want to challenge (a top card with a meeple).');
    return setMode({ ...mode, cardId: mode.cardId === cardId ? null : cardId });
  }
  if (mode.kind === 'ability') {
    const opt = abilityOption(v, mode.abilityId);
    if (opt?.needs === 'ownBluffCard') {
      if (opt.cardIds?.includes(cardId)) return setMode({ ...mode, cardId: mode.cardId === cardId ? null : cardId });
      return notice(opt.reason ?? 'That card cannot open a new pile (its type already has a pile, or it is Vidushaka).');
    }
  }
  if (mode.kind === 'play' && mode.cardId === cardId) return resetMode();
  const option = legal.play.find((o) => o.cardId === cardId);
  if (!option || option.pileIds.length === 0) return notice(legal.playNotice ?? 'That card cannot be played now.');
  setMode({ kind: 'play', cardId, pileId: null });
}

/** Playing needs no confirmation: choosing the pile sends the move. */
export function clickPile(v: PlayerView, mode: Mode, pileId: PileId, notice: Notice, send: (a: PlayerAction) => void): void {
  const legal = v.legal;
  if (legal.awaiting !== 'turn') return;
  if (mode.kind === 'play') {
    if (!mode.cardId) return notice('First choose a card from your hand.');
    const option = legal.play.find((o) => o.cardId === mode.cardId);
    if (!option?.pileIds.includes(pileId)) return notice(legal.playNotice ?? 'That card cannot go on this pile.');
    return send({ type: 'PLAY', cardId: mode.cardId, pileId });
  }
  if (mode.kind === 'challenge' || mode.kind === 'idle') {
    if (legal.challenge.pileIds.includes(pileId)) {
      return setMode({ kind: 'challenge', pileId, cardId: mode.kind === 'challenge' ? mode.cardId : null });
    }
    if (mode.kind === 'challenge') {
      return notice('Only a top card with a meeple, placed by another player, can be challenged.');
    }
  }
}

export function clickSeat(v: PlayerView, mode: Mode, playerId: PlayerId, notice: Notice): void {
  if (mode.kind !== 'ability') return;
  const opt = abilityOption(v, mode.abilityId);
  if (opt?.needs !== 'otherPlayer') return;
  if (!opt.targetPlayers?.includes(playerId)) return notice('Choose another player.');
  setMode({ ...mode, targetPlayer: playerId });
}

export function clickAbility(v: PlayerView, mode: Mode, abilityId: CardId, notice: Notice): void {
  const opt = abilityOption(v, abilityId);
  if (!opt) return;
  if (v.legal.awaiting !== 'turn') return notice(opt.reason ?? 'Abilities are used on your turn.');
  if (!opt.usable) return notice(opt.reason ?? 'That ability cannot be used now.');
  if (mode.kind === 'ability' && mode.abilityId === abilityId) return resetMode(); // tap again to cancel
  setMode({ kind: 'ability', abilityId, targetPlayer: null, cardId: null });
}

// ---------------------------------------------------------------------------
// Prompt + confirmation
// ---------------------------------------------------------------------------

export interface Step {
  /** What to do next (shown when the action is not complete yet). */
  prompt: string | null;
  /** Ready to send: confirmation text and the action. */
  confirm: { text: string; action: PlayerAction; tone?: 'danger' } | null;
}

export function currentStep(v: PlayerView, mode: Mode, nameOf: (id: PlayerId) => string): Step {
  const legal = v.legal;
  if (legal.awaiting === 'give' && legal.give) {
    const to = nameOf(legal.give.to);
    const cardId = mode.kind === 'give' ? mode.cardId : null;
    if (!cardId) return { prompt: `Choose a bluffing card to give to ${to}.`, confirm: null };
    return {
      prompt: null,
      confirm: { text: `Give your ${cardName(handType(v, cardId)!)} to ${to}?`, action: { type: 'GIVE', cardId } },
    };
  }
  if (legal.awaiting !== 'turn') return { prompt: null, confirm: null };

  switch (mode.kind) {
    case 'idle':
      return { prompt: null, confirm: null };
    case 'play': {
      if (!mode.cardId) return { prompt: 'Choose a card from your hand.', confirm: null };
      const option = legal.play.find((o) => o.cardId === mode.cardId);
      const card = cardName(handType(v, mode.cardId)!);
      return {
        prompt: option?.faceUp
          ? `Tap the ${option.pileIds.length === 1 ? cardName(pileType(v, option.pileIds[0])!) : 'pile you want'} pile to play your last card, ${card}, face up.`
          : `Tap any open pile to play your ${card} face down.`,
        confirm: null,
      };
    }
    case 'challenge': {
      if (!mode.pileId) return { prompt: 'Choose a top card with a meeple to challenge.', confirm: null };
      if (!mode.cardId) return { prompt: 'Now choose your challenger card from your hand.', confirm: null };
      const pile = v.piles.find((p) => p.id === mode.pileId)!;
      const top = pile.cards[pile.cards.length - 1];
      return {
        prompt: null,
        confirm: {
          text: `Challenge ${nameOf(top.owner)}'s card on the ${cardName(pile.type)} pile with your ${cardName(handType(v, mode.cardId)!)}?`,
          action: { type: 'CHALLENGE', pileId: mode.pileId, cardId: mode.cardId },
        },
      };
    }
    case 'ability': {
      const opt = abilityOption(v, mode.abilityId);
      if (!opt) return { prompt: null, confirm: null };
      const name = ABILITY_CARDS[opt.type].name;
      if (opt.needs === 'otherPlayer' && !mode.targetPlayer) {
        return { prompt: `${name}: choose a player at the table.`, confirm: null };
      }
      if (opt.needs === 'ownBluffCard' && !mode.cardId) {
        return { prompt: `${name}: choose a card from your hand to open a new pile.`, confirm: null };
      }
      const target = mode.targetPlayer ? nameOf(mode.targetPlayer) : '';
      const text =
        opt.type === 'MAHAMANTRI'
          ? `Use Mahamantri to exchange bluffing hands with ${target}?`
          : opt.type === 'DANDANAYAKA'
            ? `Use Dandanayaka to make ${target} draw 2 cards?`
            : opt.type === 'RAJ_BHANDARI'
              ? `Use Raj Bhandari to open a new ${cardName(handType(v, mode.cardId)!)} pile? Raj Bhandari is then destroyed.`
              : `Use ${name}?`;
      return {
        prompt: null,
        confirm: {
          text,
          action: {
            type: 'USE_ABILITY',
            abilityId: mode.abilityId,
            ...(mode.targetPlayer ? { targetPlayer: mode.targetPlayer } : {}),
            ...(mode.cardId ? { cardId: mode.cardId } : {}),
          },
        },
      };
    }
    default:
      return { prompt: null, confirm: null };
  }
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

export function handCardUI(v: PlayerView, mode: Mode, cardId: CardId) {
  const legal = v.legal;
  if (legal.awaiting === 'give') {
    const selected = mode.kind === 'give' && mode.cardId === cardId;
    return { clickable: true, selected, highlight: selected ? null : ('legal' as const) };
  }
  if (legal.awaiting !== 'turn') return { clickable: false, selected: false, highlight: null };
  if (mode.kind === 'challenge') {
    return {
      clickable: !!mode.pileId,
      selected: mode.cardId === cardId,
      highlight: mode.pileId && mode.cardId !== cardId ? ('legal' as const) : null,
    };
  }
  if (mode.kind === 'ability') {
    const opt = abilityOption(v, mode.abilityId);
    if (opt?.needs === 'ownBluffCard') {
      const ok = !!opt.cardIds?.includes(cardId);
      return { clickable: ok, selected: mode.cardId === cardId, highlight: ok && mode.cardId !== cardId ? ('legal' as const) : null, dimmed: !ok };
    }
    return { clickable: false, selected: false, highlight: null };
  }
  const option = legal.play.find((o) => o.cardId === cardId);
  const playable = !!option && option.pileIds.length > 0;
  return {
    clickable: true,
    selected: mode.kind === 'play' && mode.cardId === cardId,
    highlight: null,
    dimmed: !playable && legal.play.length === 1,
  };
}

export interface PileUI {
  selectable: boolean;
  selected: boolean;
  challengeTarget: boolean;
  challengeSelected: boolean;
  /** Tapping the top card starts (or retargets) a challenge. */
  topChallengeable: boolean;
}

export function pileUI(v: PlayerView, mode: Mode, pileId: PileId): PileUI {
  const legal = v.legal;
  const none: PileUI = { selectable: false, selected: false, challengeTarget: false, challengeSelected: false, topChallengeable: false };
  if (legal.awaiting !== 'turn') return none;
  const canChallenge = legal.challenge.pileIds.includes(pileId);
  if (mode.kind === 'play' && mode.cardId) {
    // A chosen card goes onto whichever pile is tapped, so the top card isn't a challenge shortcut here.
    const option = legal.play.find((o) => o.cardId === mode.cardId);
    return { ...none, selectable: !!option?.pileIds.includes(pileId), selected: mode.pileId === pileId };
  }
  if (mode.kind === 'challenge') {
    return { ...none, challengeTarget: canChallenge, challengeSelected: mode.pileId === pileId, topChallengeable: canChallenge };
  }
  return { ...none, topChallengeable: canChallenge };
}

/**
 * Tapping a pile's top card: if it can be challenged, start a challenge against it.
 * Returns true when the tap was handled (so the pile itself doesn't also react).
 */
export function clickTopCard(v: PlayerView, mode: Mode, pileId: PileId): boolean {
  if (v.legal.awaiting !== 'turn') return false;
  if (mode.kind === 'play' && mode.cardId) return false;
  if (!v.legal.challenge.pileIds.includes(pileId)) return false;
  // Tapping the card already being challenged cancels the challenge.
  if (mode.kind === 'challenge' && mode.pileId === pileId) {
    resetMode();
    return true;
  }
  setMode({ kind: 'challenge', pileId, cardId: mode.kind === 'challenge' ? mode.cardId : null });
  return true;
}

export function seatSelectable(v: PlayerView, mode: Mode, playerId: PlayerId) {
  if (mode.kind !== 'ability') return { selectable: false, selected: false };
  const opt = abilityOption(v, mode.abilityId);
  return {
    selectable: opt?.needs === 'otherPlayer' && !!opt.targetPlayers?.includes(playerId),
    selected: mode.targetPlayer === playerId,
  };
}
