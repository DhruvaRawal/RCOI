/**
 * Section 5 rulings, each isolated so it can be changed in one place.
 * Rulings with a simple alternative are also switchable in config.ts (GameConfig.rulings).
 */
import type { GameConfig } from '../config';
import { BLUFF_CARDS, type BluffType } from '../data/cards';
import { beats } from '../data/winMatrix';
import type { Ctx } from './context';
import { drawAbility, getPlayer, returnTargetToOwner, visibleCard } from './ops';
import { shuffleInPlace } from './rng';
import type { CardId, ChallengeReason, ChallengeRecord, GameState, Placement, PlayerId } from './types';

/**
 * Challenge resolution order:
 *  1. Target matches its pile -> challenger loses, whatever their card.
 *  2. Otherwise the challenger wins only if their card beats the target.
 *  Ruling 1: a tie (same type) goes to config.rulings.tieWinner (default: target, i.e. challenger loses).
 */
export function judgeChallenge(
  config: GameConfig,
  pileType: BluffType,
  targetType: BluffType,
  challengerType: BluffType,
): { matched: boolean; challengerWon: boolean; reason: ChallengeReason } {
  if (targetType === pileType) return { matched: true, challengerWon: false, reason: 'MATCHED' };
  if (challengerType === targetType) {
    return { matched: false, challengerWon: config.rulings.tieWinner === 'challenger', reason: 'TIE' };
  }
  if (beats(challengerType, targetType)) return { matched: false, challengerWon: true, reason: 'BEATS' };
  return { matched: false, challengerWon: false, reason: 'DOES_NOT_BEAT' };
}

/**
 * Challenge eligibility (per placement) + ruling 6.
 * Only the top card can be challenged; never a face-up card, a card already challenged in this
 * placement, or a card that has ever been covered (unless ruling 6 is switched).
 */
export function isChallengeable(s: GameState, placement: Placement, isTop: boolean): boolean {
  if (!isTop || placement.faceUp || placement.challenged || placement.lastCard) return false;
  if (placement.covered && !s.config.rulings.uncoveredCardRegainsMeeple) return false;
  return true;
}

/** Ruling 2: Mahamantri exchanges bluffing hands (and ability cards only if configured). */
export function exchangeHands(ctx: Ctx, a: PlayerId, b: PlayerId): void {
  const s = ctx.s;
  const pa = getPlayer(s, a);
  const pb = getPlayer(s, b);
  [pa.hand, pb.hand] = [pb.hand, pa.hand];
  if (s.config.rulings.mahamantriExchangesAbilities) {
    [pa.abilities, pb.abilities] = [pb.abilities, pa.abilities];
  }
  ctx.emit(
    { type: 'HANDS_EXCHANGED', a, b, aCount: pa.hand.length, bCount: pb.hand.length },
    {
      [a]: { cards: pa.hand.map((c) => visibleCard(s, c)) },
      [b]: { cards: pb.hand.map((c) => visibleCard(s, c)) },
    },
  );
}

/**
 * Ruling 4: Chikitsaka cancels the caught bluffer's penalty.
 * They still take the revealed card back, but don't draw and don't receive the challenger's card.
 * The challenger still counts as the winner and draws an ability card.
 */
export function applyChikitsaka(ctx: Ctx, rec: ChallengeRecord): void {
  returnTargetToOwner(ctx, rec);
  if (ctx.s.config.rulings.chikitsakaChallengerDrawsAbility) drawAbility(ctx, rec.challenger, 'wonChallenge');
}

/** Ruling 5: cards a player may turn into a new open pile with Raj Bhandari. */
export function rajBhandariEligibleCards(s: GameState, playerId: PlayerId): CardId[] {
  const pileTypes = new Set(s.piles.map((p) => p.type));
  return getPlayer(s, playerId).hand.filter((id) => {
    const t = s.cards[id].type as BluffType;
    return BLUFF_CARDS[t].canOpenPile && !pileTypes.has(t);
  });
}

/**
 * Ruling 8: when the bluffing deck is empty, shuffle every covered card from the played stacks
 * into a new deck. Each stack's top card and every open card stay where they are.
 */
export function refillBluffDeck(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.config.rulings.reshuffleCoveredCards) return;
  const collected: CardId[] = [];
  for (const pile of s.piles) {
    if (pile.stack.length <= 1) continue;
    const covered = pile.stack.splice(0, pile.stack.length - 1);
    for (const pl of covered) collected.push(pl.card);
  }
  if (collected.length === 0) return;
  s.bluffDeck.push(...shuffleInPlace(s.rng, collected));
  ctx.emit({ type: 'BLUFF_DECK_RESHUFFLED', count: collected.length });
}

/** Ruling 9 (and the ability rule): reshuffle the discard pile into a new ability deck when needed. */
export function refillAbilityDeck(ctx: Ctx): void {
  const s = ctx.s;
  if (s.abilityDiscard.length === 0) return;
  const cards = s.abilityDiscard.splice(0);
  s.abilityDeck.push(...shuffleInPlace(s.rng, cards));
  ctx.emit({ type: 'ABILITY_DECK_RESHUFFLED', count: cards.length });
}

/**
 * Ruling 10: the challenger card is shown to everyone only when it decided the result,
 * i.e. when the target did not match its pile.
 */
export function isChallengerCardPublic(rec: Pick<ChallengeRecord, 'matched'>): boolean {
  return !rec.matched;
}
