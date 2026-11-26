import type { AbilityType } from '../../data/cards';
import type { Ctx } from '../context';
import type { AbilityParams, CardId, GameState, Pending, PlayerId, ReactionTrigger } from '../types';

export interface AbilityAvailability {
  usable: boolean;
  /** Why it can't be used now (shown in the UI). */
  reason: string | null;
  targetPlayers?: PlayerId[];
  cardIds?: CardId[];
}

interface BaseHandler {
  type: AbilityType;
  /** Where the card goes after use. */
  afterUse: 'discard' | 'destroy';
}

/** An ability used as the player's whole turn action. */
export interface TurnAbilityHandler extends BaseHandler {
  timing: 'turn';
  needs: 'otherPlayer' | 'ownBluffCard' | 'none';
  availability(s: GameState, player: PlayerId): AbilityAvailability;
  /** Validate concrete parameters. Returns an error message or null. */
  validate(s: GameState, player: PlayerId, params: AbilityParams): string | null;
  /** Apply the effect. The card has already been discarded/destroyed and ABILITY_USED emitted. */
  apply(ctx: Ctx, player: PlayerId, params: AbilityParams): void;
}

export type ReactionPending = Extract<Pending, { kind: 'reaction' }>;

/** An ability played out of turn in response to a trigger. */
export interface ReactionAbilityHandler extends BaseHandler {
  timing: 'reaction';
  trigger: ReactionTrigger;
  /** Shown when the card is held but no trigger is active. */
  idleReason: string;
  /**
   * Apply the effect. Return 'resolved' if the triggering situation is fully handled
   * (the turn then ends), or 'continue' to carry on with the normal flow.
   */
  apply(ctx: Ctx, player: PlayerId, pending: ReactionPending): 'resolved' | 'continue';
}

export type AbilityHandler = TurnAbilityHandler | ReactionAbilityHandler;
