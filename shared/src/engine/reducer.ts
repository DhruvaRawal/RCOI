/**
 * The pure rules engine entry point:  (state, action) -> new state + events.
 * The input state is never mutated. All randomness comes from state.rng.
 */
import { applyBlufferPenalty, completeGive, startChallenge } from './challenge';
import { Ctx } from './context';
import { getAbilityHandler } from './abilities/registry';
import { awaiting, playOptions } from './legal';
import {
  abilityTypeOf,
  bluffTypeOf,
  canDrawBluff,
  checkWin,
  drawBluff,
  getPile,
  getPlayer,
  removeAbilityCard,
  removeFromHand,
  requireInHand,
  topOf,
  visibleCard,
} from './ops';
import { randomInt } from './rng';
import { endTurn } from './turn';
import {
  type CardId,
  type EngineResult,
  type GameState,
  type PileId,
  type PlayerAction,
  type PlayerId,
  RuleError,
  fail,
} from './types';

function run(state: GameState, fn: (ctx: Ctx) => void): EngineResult {
  if (state.winner) return { ok: false, error: { code: 'GAME_OVER', message: 'The game is over.' } };
  const draft = structuredClone(state);
  const ctx = new Ctx(draft);
  try {
    fn(ctx);
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: { code: e.code, message: e.message } };
    throw e;
  }
  // Safety net: the first player with zero bluffing cards wins (checked after every state change).
  if (!draft.winner) for (const p of draft.players) if (checkWin(ctx, p.id, 'EMPTY_HAND')) break;
  draft.version++;
  return { ok: true, state: draft, events: ctx.events };
}

/** Apply a player's action. Returns an error (and no state change) if it is illegal. */
export function applyAction(state: GameState, playerId: PlayerId, action: PlayerAction): EngineResult {
  return run(state, (ctx) => dispatch(ctx, playerId, action));
}

/**
 * Ruling 11: the awaited player ran out of time.
 *  - turn: draw a card (even with one card left); if that's impossible, pass.
 *  - give: a random bluffing card is given.
 *  - reaction: the reaction card is not used.
 */
export function applyTimeout(state: GameState): EngineResult {
  return run(state, (ctx) => {
    const s = ctx.s;
    const aw = awaiting(s)!;
    ctx.emit({ type: 'TIMED_OUT', player: aw.player, decision: aw.kind });
    if (s.pending?.kind === 'give') {
      const hand = getPlayer(s, s.pending.from).hand;
      const p = s.pending;
      completeGive(ctx, p.challenge, p.from, p.to, p.step, hand[randomInt(s.rng, hand.length)], true);
    } else if (s.pending?.kind === 'reaction') {
      const p = s.pending;
      s.pending = null;
      ctx.emit({ type: 'REACTION_DECLINED', player: p.player });
      applyBlufferPenalty(ctx, p.challenge);
    } else {
      if (canDrawBluff(s)) drawBluff(ctx, aw.player, 1, 'timeout');
      else ctx.emit({ type: 'TURN_PASSED', player: aw.player, reason: 'timeout' });
      endTurn(ctx);
    }
  });
}

function dispatch(ctx: Ctx, playerId: PlayerId, action: PlayerAction): void {
  const s = ctx.s;
  getPlayer(s, playerId);
  const aw = awaiting(s)!;

  if (s.pending) {
    if (aw.player !== playerId) fail('NOT_YOUR_DECISION', 'Waiting for another player to decide.');
    if (s.pending.kind === 'give' && action.type === 'GIVE') return doGive(ctx, playerId, action.cardId);
    if (s.pending.kind === 'reaction' && action.type === 'REACT') return doReact(ctx, playerId, action.abilityId);
    fail('DECISION_REQUIRED', s.pending.kind === 'give' ? 'Choose a card to give.' : 'Decide whether to react.');
  }

  if (s.currentPlayer !== playerId) fail('NOT_YOUR_TURN', 'It is not your turn.');
  switch (action.type) {
    case 'PLAY':
      return doPlay(ctx, playerId, action.cardId, action.pileId);
    case 'DRAW':
      if (!canDrawBluff(s)) fail('CANNOT_DRAW', 'There are no bluffing cards left to draw.');
      drawBluff(ctx, playerId, 1, 'draw');
      return endTurn(ctx);
    case 'CHALLENGE':
      return startChallenge(ctx, playerId, action.pileId, action.cardId);
    case 'USE_ABILITY':
      return doUseAbility(ctx, playerId, action.abilityId, { targetPlayer: action.targetPlayer, cardId: action.cardId });
    default:
      fail('BAD_ACTION', 'That action is not available now.');
  }
}

function doPlay(ctx: Ctx, playerId: PlayerId, cardId: CardId, pileId: PileId): void {
  const s = ctx.s;
  const p = getPlayer(s, playerId);
  requireInHand(p, cardId);
  const pile = getPile(s, pileId);
  const { options, notice } = playOptions(s, playerId);
  const option = options.find((o) => o.cardId === cardId);
  if (!option || !option.pileIds.includes(pileId)) fail('ILLEGAL_PLAY', notice ?? 'That card cannot be played there.');

  const faceUp = option.faceUp;
  removeFromHand(p, cardId);
  const prevTop = topOf(pile);
  if (prevTop) prevTop.covered = true; // the covered card loses its meeple permanently
  const placementId = s.nextPlacementId++;
  pile.stack.push({ id: placementId, card: cardId, owner: playerId, faceUp, challenged: false, covered: false, lastCard: faceUp });
  const cardType = bluffTypeOf(s, cardId);
  ctx.emit(
    { type: 'CARD_PLAYED', player: playerId, pileId, placementId, faceUp, ...(faceUp ? { cardType } : {}) },
    { [playerId]: { cards: [visibleCard(s, cardId)] } },
  );
  if (checkWin(ctx, playerId, 'LAST_CARD_PLAYED')) return;
  endTurn(ctx);
}

function doUseAbility(
  ctx: Ctx,
  playerId: PlayerId,
  abilityId: CardId,
  params: { targetPlayer?: PlayerId; cardId?: CardId },
): void {
  const s = ctx.s;
  const p = getPlayer(s, playerId);
  if (!p.abilities.includes(abilityId)) fail('ABILITY_NOT_HELD', 'You do not hold that ability card.');
  const type = abilityTypeOf(s, abilityId);
  const h = getAbilityHandler(type);
  if (h.timing !== 'turn') fail('NOT_A_TURN_ABILITY', h.idleReason);
  const avail = h.availability(s, playerId);
  if (!avail.usable) fail('ABILITY_UNAVAILABLE', avail.reason ?? 'That ability cannot be used now.');
  const err = h.validate(s, playerId, params);
  if (err) fail('BAD_ABILITY_TARGET', err);

  ctx.emit({
    type: 'ABILITY_USED',
    player: playerId,
    ability: type,
    ...(params.targetPlayer && h.needs === 'otherPlayer' ? { targetPlayer: params.targetPlayer } : {}),
  });
  spendAbilityCard(ctx, playerId, abilityId, h.afterUse);
  h.apply(ctx, playerId, params);
  if (s.winner) return;
  endTurn(ctx);
}

function doReact(ctx: Ctx, playerId: PlayerId, abilityId: CardId | null): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending?.kind !== 'reaction') fail('NO_REACTION', 'There is nothing to react to.');
  if (abilityId === null) {
    s.pending = null;
    ctx.emit({ type: 'REACTION_DECLINED', player: playerId });
    return applyBlufferPenalty(ctx, pending.challenge);
  }
  if (!getPlayer(s, playerId).abilities.includes(abilityId)) fail('ABILITY_NOT_HELD', 'You do not hold that ability card.');
  const type = abilityTypeOf(s, abilityId);
  const h = getAbilityHandler(type);
  if (h.timing !== 'reaction' || h.trigger !== pending.trigger) {
    fail('NOT_A_REACTION', 'That card cannot be played now.');
  }
  s.pending = null;
  ctx.emit({ type: 'ABILITY_USED', player: playerId, ability: type });
  spendAbilityCard(ctx, playerId, abilityId, h.afterUse);
  const outcome = h.apply(ctx, playerId, pending);
  if (s.winner) return;
  if (outcome === 'resolved') return endTurn(ctx);
  applyBlufferPenalty(ctx, pending.challenge);
}

function doGive(ctx: Ctx, playerId: PlayerId, cardId: CardId): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending?.kind !== 'give') fail('NO_GIVE', 'There is nothing to give.');
  requireInHand(getPlayer(s, playerId), cardId);
  completeGive(ctx, pending.challenge, pending.from, pending.to, pending.step, cardId, false);
}

/** Used ability cards go to the face-up discard pile, or are removed from the game (Raj Bhandari). */
function spendAbilityCard(ctx: Ctx, playerId: PlayerId, abilityId: CardId, afterUse: 'discard' | 'destroy'): void {
  const s = ctx.s;
  removeAbilityCard(getPlayer(s, playerId), abilityId);
  if (afterUse === 'destroy') s.destroyed.push(abilityId);
  else s.abilityDiscard.push(abilityId);
}
