/**
 * Challenge flow:
 *   declare -> reveal -> (challenger lost)  challenger draws 1, challenged gives 1 card
 *                     -> (challenger won)   [reaction window] -> challenger gives 1 card,
 *                                            challenged takes target back + draws 1, challenger draws 1 ability
 * Each step that needs a choice sets state.pending and stops; the reducer resumes it.
 */
import { cardName } from '../data/cards';
import type { Ctx } from './context';
import { challengeTargets, needsReactionWindow } from './legal';
import {
  bluffTypeOf,
  checkWin,
  drawAbility,
  drawBluff,
  getPile,
  getPlayer,
  giveCard,
  requireInHand,
  returnTargetToOwner,
  topOf,
  visibleCard,
} from './ops';
import { isChallengerCardPublic, judgeChallenge } from './rulings';
import { endTurn } from './turn';
import { type CardId, type ChallengeRecord, type GiveStep, type PileId, type PlayerId, fail } from './types';

export function startChallenge(ctx: Ctx, challenger: PlayerId, pileId: PileId, cardId: CardId): void {
  const s = ctx.s;
  const pile = getPile(s, pileId);
  if (!challengeTargets(s, challenger).includes(pileId)) {
    const top = topOf(pile);
    if (!top) fail('NOTHING_TO_CHALLENGE', `The ${cardName(pile.type)} pile has no played card.`);
    if (top.owner === challenger) fail('OWN_CARD', 'You cannot challenge your own card.');
    fail('NOT_CHALLENGEABLE', 'That card cannot be challenged (it has been challenged or covered before).');
  }
  requireInHand(getPlayer(s, challenger), cardId);

  const top = topOf(pile)!;
  const targetType = bluffTypeOf(s, top.card);
  const challengerCardType = bluffTypeOf(s, cardId);
  const verdict = judgeChallenge(s.config, pile.type, targetType, challengerCardType);

  // Reveal: the target is now face up and can never be challenged again in this placement.
  top.faceUp = true;
  top.challenged = true;

  const rec: ChallengeRecord = {
    id: s.nextChallengeId++,
    challenger,
    challenged: top.owner,
    pileId,
    pileType: pile.type,
    placementId: top.id,
    target: top.card,
    targetType,
    challengerCard: cardId,
    challengerCardType,
    ...verdict,
  };
  s.lastChallenge = rec;

  ctx.emit(
    {
      type: 'CHALLENGE',
      challengeId: rec.id,
      challenger,
      challenged: rec.challenged,
      pileId,
      pileType: pile.type,
      placementId: top.id,
      targetType,
      matched: rec.matched,
      challengerWon: rec.challengerWon,
      reason: rec.reason,
      ...(isChallengerCardPublic(rec) ? { challengerCardType } : {}),
    },
    { [challenger]: { cards: [visibleCard(s, cardId)] } },
  );

  if (!rec.challengerWon) {
    // Challenger loses: keeps their card, draws 1, then receives a card chosen by the challenged player.
    drawBluff(ctx, challenger, 1, 'challengeLost');
    requestGive(ctx, rec, rec.challenged, rec.challenger, 'challengedGives');
    return;
  }

  // Challenger wins: the caught bluffer may get a reaction window (Chikitsaka).
  if (needsReactionWindow(s, rec.challenged, 'LOST_CHALLENGE_AS_BLUFFER')) {
    s.pending = { kind: 'reaction', player: rec.challenged, trigger: 'LOST_CHALLENGE_AS_BLUFFER', challenge: rec };
    return;
  }
  applyBlufferPenalty(ctx, rec);
}

/** The normal penalty for a caught bluffer: starts with the challenger giving them a card. */
export function applyBlufferPenalty(ctx: Ctx, rec: ChallengeRecord): void {
  requestGive(ctx, rec, rec.challenger, rec.challenged, 'challengerGives');
}

function requestGive(ctx: Ctx, rec: ChallengeRecord, from: PlayerId, to: PlayerId, step: GiveStep): void {
  const s = ctx.s;
  const hand = getPlayer(s, from).hand;
  if (hand.length === 0) throw new Error('Invariant: a player with no bluffing cards should already have won');
  if (hand.length === 1 && s.config.rulings.autoResolveForcedGive) {
    completeGive(ctx, rec, from, to, step, hand[0], true);
    return;
  }
  s.pending = { kind: 'give', from, to, step, challenge: rec };
}

/** Called by the reducer (player choice / timeout) and by requestGive (forced choice). */
export function completeGive(
  ctx: Ctx,
  rec: ChallengeRecord,
  from: PlayerId,
  to: PlayerId,
  step: GiveStep,
  cardId: CardId,
  auto: boolean,
): void {
  const s = ctx.s;
  s.pending = null;
  giveCard(ctx, from, to, cardId, auto);
  // Ruling 7: giving away your last bluffing card wins immediately.
  if (checkWin(ctx, from, 'GAVE_LAST_CARD')) return;

  if (step === 'challengerGives') {
    returnTargetToOwner(ctx, rec);
    drawBluff(ctx, rec.challenged, 1, 'caughtBluffing');
    drawAbility(ctx, rec.challenger, 'wonChallenge');
  }
  endTurn(ctx);
}
