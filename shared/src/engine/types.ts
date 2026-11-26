import type { GameConfig } from '../config';
import type { AbilityType, BluffType, CardKind, CardType } from '../data/cards';
import type { RngState } from './rng';

export type PlayerId = string;
/** Opaque, random per game. Never encodes the card type. */
export type CardId = string;
export type PileId = string;

export interface CardInfo {
  kind: CardKind;
  type: CardType;
}

/** One card played onto a pile. Challenge eligibility belongs to the placement, not the card. */
export interface Placement {
  /** Public sequence number for this placement. Not linked to the card's identity. */
  id: number;
  card: CardId;
  owner: PlayerId;
  faceUp: boolean;
  /** Has been challenged while in this placement. */
  challenged: boolean;
  /** Has ever been covered while in this placement. */
  covered: boolean;
  /** Played face up as the owner's last bluffing card (ends the game). */
  lastCard: boolean;
}

export interface Pile {
  id: PileId;
  type: BluffType;
  openCard: CardId;
  /** Played cards, oldest first. The last entry is the top card. */
  stack: Placement[];
  origin: 'setup' | 'ability';
  createdBy?: PlayerId;
}

export interface PlayerState {
  id: PlayerId;
  hand: CardId[];
  abilities: CardId[];
}

export type ChallengeReason = 'MATCHED' | 'BEATS' | 'TIE' | 'DOES_NOT_BEAT';

export interface ChallengeRecord {
  id: number;
  challenger: PlayerId;
  challenged: PlayerId;
  pileId: PileId;
  pileType: BluffType;
  placementId: number;
  target: CardId;
  targetType: BluffType;
  challengerCard: CardId;
  challengerCardType: BluffType;
  matched: boolean;
  challengerWon: boolean;
  reason: ChallengeReason;
}

export type ReactionTrigger = 'LOST_CHALLENGE_AS_BLUFFER';

export type GiveStep = 'challengedGives' | 'challengerGives';

export type Pending =
  | { kind: 'reaction'; player: PlayerId; trigger: ReactionTrigger; challenge: ChallengeRecord }
  | { kind: 'give'; from: PlayerId; to: PlayerId; step: GiveStep; challenge: ChallengeRecord };

export type WinReason = 'LAST_CARD_PLAYED' | 'GAVE_LAST_CARD' | 'RAJ_BHANDARI' | 'EMPTY_HAND';

export interface GameState {
  /** Increments on every applied action or timeout. */
  version: number;
  config: GameConfig;
  rng: RngState;
  cards: Record<CardId, CardInfo>;
  /** Seat order. Turns go through this array in order (clockwise). */
  players: PlayerState[];
  /** Bluffing deck; the last element is the top. */
  bluffDeck: CardId[];
  abilityDeck: CardId[];
  /** Face-up stack; the last element is the visible top. */
  abilityDiscard: CardId[];
  /** Removed from the game (Raj Bhandari after use). */
  destroyed: CardId[];
  piles: Pile[];
  currentPlayer: PlayerId;
  turn: number;
  pending: Pending | null;
  lastChallenge: ChallengeRecord | null;
  winner: { player: PlayerId; reason: WinReason } | null;
  nextSeq: number;
  nextPlacementId: number;
  nextPileNumber: number;
  nextChallengeId: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type PlayerAction =
  | { type: 'PLAY'; cardId: CardId; pileId: PileId }
  | { type: 'CHALLENGE'; pileId: PileId; cardId: CardId }
  | { type: 'DRAW' }
  | { type: 'USE_ABILITY'; abilityId: CardId; targetPlayer?: PlayerId; cardId?: CardId }
  | { type: 'REACT'; abilityId: CardId | null }
  | { type: 'GIVE'; cardId: CardId };

export interface AbilityParams {
  targetPlayer?: PlayerId;
  cardId?: CardId;
}

// ---------------------------------------------------------------------------
// Events. `secret` holds per-player extras; filterEvent() strips it per viewer.
// ---------------------------------------------------------------------------

export interface VisibleCard {
  id: CardId;
  type: CardType;
}

export interface EventSecret {
  /** Cards this viewer may see because of this event (drawn, received, own play, own challenger card). */
  cards?: VisibleCard[];
}

export type DrawReason =
  | 'draw'
  | 'timeout'
  | 'challengeLost'
  | 'caughtBluffing'
  | 'wonChallenge'
  | 'dandanayaka';

export type EventBody =
  | {
      type: 'GAME_STARTED';
      players: PlayerId[];
      firstPlayer: PlayerId;
      piles: { pileId: PileId; type: BluffType }[];
      handSize: number;
    }
  | { type: 'TURN_STARTED'; player: PlayerId }
  | { type: 'TURN_PASSED'; player: PlayerId; reason: 'noLegalAction' | 'timeout' }
  | { type: 'TIMED_OUT'; player: PlayerId; decision: 'turn' | 'give' | 'reaction' }
  | {
      type: 'CARD_PLAYED';
      player: PlayerId;
      pileId: PileId;
      placementId: number;
      faceUp: boolean;
      /** Only present when played face up (last card). */
      cardType?: BluffType;
    }
  | {
      type: 'CARDS_DRAWN';
      player: PlayerId;
      deck: CardKind;
      count: number;
      requested: number;
      reason: DrawReason;
    }
  | { type: 'BLUFF_DECK_RESHUFFLED'; count: number }
  | { type: 'ABILITY_DECK_RESHUFFLED'; count: number }
  | {
      type: 'CHALLENGE';
      challengeId: number;
      challenger: PlayerId;
      challenged: PlayerId;
      pileId: PileId;
      pileType: BluffType;
      placementId: number;
      targetType: BluffType;
      matched: boolean;
      challengerWon: boolean;
      reason: ChallengeReason;
      /** Only present when the challenger card decided the result (mismatched target). */
      challengerCardType?: BluffType;
    }
  | { type: 'CARD_GIVEN'; from: PlayerId; to: PlayerId; auto: boolean }
  | { type: 'CARD_TAKEN_BACK'; player: PlayerId; pileId: PileId; placementId: number; cardType: BluffType }
  | { type: 'REACTION_DECLINED'; player: PlayerId }
  | { type: 'ABILITY_USED'; player: PlayerId; ability: AbilityType; targetPlayer?: PlayerId }
  | { type: 'HANDS_EXCHANGED'; a: PlayerId; b: PlayerId; aCount: number; bCount: number }
  | { type: 'PILE_CREATED'; player: PlayerId; pileId: PileId; pileType: BluffType }
  | { type: 'GAME_WON'; player: PlayerId; reason: WinReason };

export type GameEvent = EventBody & {
  seq: number;
  turn: number;
  secret?: Record<PlayerId, EventSecret>;
};

/** What a single player receives for an event. */
export type VisibleEvent = EventBody & { seq: number; turn: number; mine?: EventSecret };

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface EngineError {
  code: string;
  message: string;
}

export type EngineResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: EngineError };

export class RuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function fail(code: string, message: string): never {
  throw new RuleError(code, message);
}

// ---------------------------------------------------------------------------
// Legal actions (computed by the engine, sent to the player who may act)
// ---------------------------------------------------------------------------

export interface PlayOption {
  cardId: CardId;
  pileIds: PileId[];
  faceUp: boolean;
}

export interface AbilityOption {
  abilityId: CardId;
  type: AbilityType;
  timing: 'turn' | 'reaction';
  needs: 'otherPlayer' | 'ownBluffCard' | 'none';
  usable: boolean;
  reason: string | null;
  targetPlayers?: PlayerId[];
  cardIds?: CardId[];
}

export type AwaitingKind = 'turn' | 'reaction' | 'give';

export interface LegalActions {
  /** What this player is being asked to do right now, if anything. */
  awaiting: AwaitingKind | null;
  play: PlayOption[];
  /** Explains a last-card restriction, if any. */
  playNotice: string | null;
  challenge: { pileIds: PileId[]; reason: string | null };
  draw: { allowed: boolean; reason: string | null };
  /** One entry per ability card held (usable now or not, with the reason). */
  abilities: AbilityOption[];
  give: { to: PlayerId; cardIds: CardId[] } | null;
  /** Reaction window: usable reaction cards (may be empty: the player can only decline). */
  reaction: { abilityIds: CardId[] } | null;
}
