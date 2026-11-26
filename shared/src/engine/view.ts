/**
 * Per-player views. This is the ONLY way state leaves the server.
 * Rules enforced here:
 *  - other players' hands and abilities: counts only
 *  - decks: counts only (never order or contents)
 *  - face-down pile cards: no card id and no type, except the viewer's own TOP cards (ownType)
 *  - a card id is only ever sent together with a face the viewer is allowed to see
 *  - ability discard: count and the face-up top card only
 */
import type { AbilityType, BluffType } from '../data/cards';
import { getLegalActions } from './legal';
import { topOf } from './ops';
import { isChallengeable, isChallengerCardPublic } from './rulings';
import type {
  CardId,
  ChallengeReason,
  GameEvent,
  GameState,
  LegalActions,
  PileId,
  PlayerId,
  VisibleEvent,
  WinReason,
} from './types';

export interface PileCardView {
  /** Placement id (public, not linked to the card's identity). */
  pid: number;
  owner: PlayerId;
  faceUp: boolean;
  /** Set only when the card is face up. */
  type: BluffType | null;
  /** The viewer's own face-down TOP card (for the "show my top cards" toggle). Never sent to others. */
  ownType?: BluffType;
  isTop: boolean;
  meeple: boolean;
  challengeable: boolean;
  lastCard: boolean;
}

export interface PileView {
  id: PileId;
  type: BluffType;
  origin: 'setup' | 'ability';
  createdBy?: PlayerId;
  /** Played cards on this pile (not counting the open card). */
  count: number;
  cards: PileCardView[];
}

export interface PublicPlayerView {
  id: PlayerId;
  bluffCount: number;
  abilityCount: number;
}

export type PendingView = { kind: 'reaction'; player: PlayerId } | { kind: 'give'; from: PlayerId; to: PlayerId };

export interface ChallengeView {
  id: number;
  challenger: PlayerId;
  challenged: PlayerId;
  pileId: PileId;
  pileType: BluffType;
  targetType: BluffType;
  matched: boolean;
  challengerWon: boolean;
  reason: ChallengeReason;
  /** Only when it decided the result (ruling 10) - or for the challenger themself. */
  challengerCardType: BluffType | null;
}

export interface PlayerView {
  you: PlayerId;
  version: number;
  hand: { id: CardId; type: BluffType }[];
  abilities: { id: CardId; type: AbilityType }[];
  players: PublicPlayerView[];
  piles: PileView[];
  bluffDeckCount: number;
  abilityDeckCount: number;
  abilityDiscard: { count: number; top: AbilityType | null };
  destroyedCount: number;
  currentPlayer: PlayerId;
  turn: number;
  pending: PendingView | null;
  lastChallenge: ChallengeView | null;
  winner: { player: PlayerId; reason: WinReason } | null;
  legal: LegalActions;
}

export function toPlayerView(s: GameState, viewer: PlayerId): PlayerView {
  const me = s.players.find((p) => p.id === viewer);
  if (!me) throw new Error('Viewer is not in this game');

  const piles: PileView[] = s.piles.map((pile) => {
    const top = topOf(pile);
    return {
      id: pile.id,
      type: pile.type,
      origin: pile.origin,
      ...(pile.createdBy ? { createdBy: pile.createdBy } : {}),
      count: pile.stack.length,
      cards: pile.stack.map((pl): PileCardView => {
        const isTop = pl === top;
        const challengeable = isChallengeable(s, pl, isTop);
        const view: PileCardView = {
          pid: pl.id,
          owner: pl.owner,
          faceUp: pl.faceUp,
          type: pl.faceUp ? (s.cards[pl.card].type as BluffType) : null,
          isTop,
          meeple: challengeable || pl.lastCard,
          challengeable,
          lastCard: pl.lastCard,
        };
        if (isTop && !pl.faceUp && pl.owner === viewer) view.ownType = s.cards[pl.card].type as BluffType;
        return view;
      }),
    };
  });

  const lc = s.lastChallenge;
  const discardTop = s.abilityDiscard[s.abilityDiscard.length - 1];

  return {
    you: viewer,
    version: s.version,
    hand: me.hand.map((id) => ({ id, type: s.cards[id].type as BluffType })),
    abilities: me.abilities.map((id) => ({ id, type: s.cards[id].type as AbilityType })),
    players: s.players.map((p) => ({ id: p.id, bluffCount: p.hand.length, abilityCount: p.abilities.length })),
    piles,
    bluffDeckCount: s.bluffDeck.length,
    abilityDeckCount: s.abilityDeck.length,
    abilityDiscard: {
      count: s.abilityDiscard.length,
      top: discardTop ? (s.cards[discardTop].type as AbilityType) : null,
    },
    destroyedCount: s.destroyed.length,
    currentPlayer: s.currentPlayer,
    turn: s.turn,
    pending: !s.pending
      ? null
      : s.pending.kind === 'reaction'
        ? { kind: 'reaction', player: s.pending.player }
        : { kind: 'give', from: s.pending.from, to: s.pending.to },
    lastChallenge: lc
      ? {
          id: lc.id,
          challenger: lc.challenger,
          challenged: lc.challenged,
          pileId: lc.pileId,
          pileType: lc.pileType,
          targetType: lc.targetType,
          matched: lc.matched,
          challengerWon: lc.challengerWon,
          reason: lc.reason,
          challengerCardType:
            isChallengerCardPublic(lc) || lc.challenger === viewer ? lc.challengerCardType : null,
        }
      : null,
    winner: s.winner ? { ...s.winner } : null,
    legal: getLegalActions(s, viewer),
  };
}

/** Strip every other player's secrets from an event. */
export function filterEvent(e: GameEvent, viewer: PlayerId): VisibleEvent {
  const { secret, ...pub } = e;
  const mine = secret?.[viewer];
  return mine ? { ...pub, mine } : pub;
}

export function filterEvents(events: GameEvent[], viewer: PlayerId): VisibleEvent[] {
  return events.map((e) => filterEvent(e, viewer));
}
