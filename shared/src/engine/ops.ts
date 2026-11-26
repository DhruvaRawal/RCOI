/**
 * Low-level state operations shared by the reducer, the challenge flow and ability handlers.
 * They mutate a draft (Ctx.s) and emit events. They never decide whose turn it is.
 */
import { type AbilityType, type BluffType, type CardType, cardName } from '../data/cards';
import type { Ctx } from './context';
import { refillAbilityDeck, refillBluffDeck } from './rulings';
import {
  type CardId,
  type ChallengeRecord,
  type DrawReason,
  type GameState,
  type Pile,
  type PileId,
  type Placement,
  type PlayerId,
  type PlayerState,
  type VisibleCard,
  type WinReason,
  fail,
} from './types';

export function getPlayer(s: GameState, id: PlayerId): PlayerState {
  const p = s.players.find((pl) => pl.id === id);
  if (!p) fail('UNKNOWN_PLAYER', 'That player is not in this game.');
  return p;
}

export function otherPlayers(s: GameState, id: PlayerId): PlayerId[] {
  return s.players.filter((p) => p.id !== id).map((p) => p.id);
}

export function typeOfCard(s: GameState, id: CardId): CardType {
  const c = s.cards[id];
  if (!c) fail('UNKNOWN_CARD', 'Unknown card.');
  return c.type;
}

export function bluffTypeOf(s: GameState, id: CardId): BluffType {
  const c = s.cards[id];
  if (!c || c.kind !== 'bluff') fail('NOT_A_BLUFF_CARD', 'That is not a bluffing card.');
  return c.type as BluffType;
}

export function abilityTypeOf(s: GameState, id: CardId): AbilityType {
  const c = s.cards[id];
  if (!c || c.kind !== 'ability') fail('NOT_AN_ABILITY_CARD', 'That is not an ability card.');
  return c.type as AbilityType;
}

export function visibleCard(s: GameState, id: CardId): VisibleCard {
  return { id, type: s.cards[id].type };
}

export function getPile(s: GameState, pileId: PileId): Pile {
  const pile = s.piles.find((p) => p.id === pileId);
  if (!pile) fail('UNKNOWN_PILE', 'That pile does not exist.');
  return pile;
}

export function topOf(pile: Pile): Placement | undefined {
  return pile.stack[pile.stack.length - 1];
}

export function pileName(pile: Pile): string {
  return cardName(pile.type);
}

export function requireInHand(p: PlayerState, cardId: CardId): void {
  if (!p.hand.includes(cardId)) fail('CARD_NOT_IN_HAND', 'That card is not in your hand.');
}

export function removeFromHand(p: PlayerState, cardId: CardId): void {
  const i = p.hand.indexOf(cardId);
  if (i < 0) fail('CARD_NOT_IN_HAND', 'That card is not in your hand.');
  p.hand.splice(i, 1);
}

export function removeAbilityCard(p: PlayerState, cardId: CardId): void {
  const i = p.abilities.indexOf(cardId);
  if (i < 0) fail('ABILITY_NOT_HELD', 'You do not hold that ability card.');
  p.abilities.splice(i, 1);
}

/** Cards that ruling 8 could reshuffle: every played card that is not a pile's top card. */
export function coveredCardCount(s: GameState): number {
  return s.piles.reduce((n, pile) => n + Math.max(0, pile.stack.length - 1), 0);
}

/** Can a bluffing card be drawn right now (directly or after a ruling-8 reshuffle)? */
export function canDrawBluff(s: GameState): boolean {
  if (s.bluffDeck.length > 0) return true;
  return s.config.rulings.reshuffleCoveredCards && coveredCardCount(s) > 0;
}

/** Draw up to n bluffing cards. Skips draws that are impossible (ruling 8). */
export function drawBluff(ctx: Ctx, playerId: PlayerId, n: number, reason: DrawReason): CardId[] {
  const s = ctx.s;
  const p = getPlayer(s, playerId);
  const drawn: CardId[] = [];
  for (let i = 0; i < n; i++) {
    if (s.bluffDeck.length === 0) refillBluffDeck(ctx);
    const card = s.bluffDeck.pop();
    if (card === undefined) break;
    p.hand.push(card);
    drawn.push(card);
  }
  ctx.emit(
    { type: 'CARDS_DRAWN', player: playerId, deck: 'bluff', count: drawn.length, requested: n, reason },
    drawn.length ? { [playerId]: { cards: drawn.map((c) => visibleCard(s, c)) } } : undefined,
  );
  return drawn;
}

/** Draw one ability card. Reshuffles the discard pile if needed; skips if none exist (ruling 9). */
export function drawAbility(ctx: Ctx, playerId: PlayerId, reason: DrawReason): CardId | null {
  const s = ctx.s;
  const p = getPlayer(s, playerId);
  if (s.abilityDeck.length === 0) refillAbilityDeck(ctx);
  const card = s.abilityDeck.pop() ?? null;
  if (card) p.abilities.push(card);
  ctx.emit(
    { type: 'CARDS_DRAWN', player: playerId, deck: 'ability', count: card ? 1 : 0, requested: 1, reason },
    card ? { [playerId]: { cards: [visibleCard(s, card)] } } : undefined,
  );
  return card;
}

/** The first player with zero bluffing cards wins immediately. Returns true if the game is over. */
export function checkWin(ctx: Ctx, playerId: PlayerId, reason: WinReason): boolean {
  const s = ctx.s;
  if (s.winner) return true;
  if (getPlayer(s, playerId).hand.length > 0) return false;
  s.winner = { player: playerId, reason };
  s.pending = null;
  ctx.emit({ type: 'GAME_WON', player: playerId, reason });
  return true;
}

/** Move a bluffing card between hands. Only giver and receiver learn which card it was. */
export function giveCard(ctx: Ctx, from: PlayerId, to: PlayerId, cardId: CardId, auto: boolean): void {
  const s = ctx.s;
  const giver = getPlayer(s, from);
  removeFromHand(giver, cardId);
  getPlayer(s, to).hand.push(cardId);
  const card = [visibleCard(s, cardId)];
  ctx.emit({ type: 'CARD_GIVEN', from, to, auto }, { [from]: { cards: card }, [to]: { cards: card } });
}

/**
 * The caught bluffer takes the revealed target back into their hand.
 * The card underneath becomes the top again (ruling 6 decides whether it is challengeable).
 */
export function returnTargetToOwner(ctx: Ctx, rec: ChallengeRecord): void {
  const s = ctx.s;
  const pile = getPile(s, rec.pileId);
  const top = topOf(pile);
  if (!top || top.id !== rec.placementId) {
    throw new Error('Invariant: challenged card is no longer the top card');
  }
  pile.stack.pop();
  getPlayer(s, rec.challenged).hand.push(top.card);
  ctx.emit({
    type: 'CARD_TAKEN_BACK',
    player: rec.challenged,
    pileId: pile.id,
    placementId: top.id,
    cardType: rec.targetType,
  });
}
