/**
 * Build an exact, valid game state for tests. Every one of the 62 cards is always placed
 * somewhere, so card-conservation checks stay meaningful.
 */
import { type DeepPartial, type GameConfig, makeConfig } from '../config';
import {
  ABILITY_CARDS,
  ABILITY_TYPES,
  type AbilityType,
  BLUFF_CARDS,
  BLUFF_TYPES,
  type BluffType,
  type CardType,
} from '../data/cards';
import { assertInvariants } from '../engine/invariants';
import { createRng, randomId } from '../engine/rng';
import type { CardId, CardInfo, GameState, Pile, PileId, PlayerId } from '../engine/types';

export interface StackCardSpec {
  type: BluffType;
  owner: PlayerId;
  faceUp?: boolean;
  challenged?: boolean;
  /** Defaults to true for every card except the top one. */
  covered?: boolean;
}

export interface ScenarioSpec {
  players: { id: PlayerId; hand: BluffType[]; abilities?: AbilityType[] }[];
  piles: { type: BluffType; stack?: StackCardSpec[] }[];
  current?: PlayerId;
  /** Explicit top of the bluffing deck (last element = top). Leftover cards go below unless redirected. */
  bluffDeck?: BluffType[];
  /**
   * Where unassigned bluffing cards go:
   *  'deck' (default) - bottom of the bluffing deck
   *  { coveredOn: pileIndex, owner } - as covered face-down cards at the bottom of that pile
   *  { hand: playerId } - into that player's hand
   */
  leftoverBluff?: 'deck' | { coveredOn: number; owner: PlayerId } | { hand: PlayerId };
  abilityDeck?: AbilityType[];
  abilityDiscard?: AbilityType[];
  destroyed?: AbilityType[];
  /** Where unassigned ability cards go: 'deck' (default) or 'discard'. */
  leftoverAbility?: 'deck' | 'discard';
  config?: DeepPartial<GameConfig>;
  seed?: string;
}

export function buildScenario(spec: ScenarioSpec): GameState {
  const config = makeConfig(spec.config ?? {});
  const rng = createRng(spec.seed ?? 'scenario');
  const cards: Record<CardId, CardInfo> = {};
  const pool = new Map<CardType, CardId[]>();
  const add = (kind: 'bluff' | 'ability', type: CardType) => {
    let id: CardId;
    do id = randomId(rng); while (cards[id]);
    cards[id] = { kind, type };
    pool.set(type, [...(pool.get(type) ?? []), id]);
  };
  for (const t of BLUFF_TYPES) for (let i = 0; i < BLUFF_CARDS[t].count; i++) add('bluff', t);
  for (const t of ABILITY_TYPES) for (let i = 0; i < ABILITY_CARDS[t].count; i++) add('ability', t);

  const take = (t: CardType): CardId => {
    const arr = pool.get(t);
    if (!arr?.length) throw new Error(`Scenario uses more ${t} cards than exist`);
    return arr.shift()!;
  };

  const players = spec.players.map((p) => ({
    id: p.id,
    hand: p.hand.map(take),
    abilities: (p.abilities ?? []).map(take),
  }));

  let placementId = 1;
  const piles: Pile[] = spec.piles.map((ps, i) => {
    const openCard = take(ps.type);
    const stackSpec = ps.stack ?? [];
    return {
      id: `p${i + 1}`,
      type: ps.type,
      openCard,
      origin: 'setup',
      stack: stackSpec.map((c, j) => ({
        id: placementId++,
        card: take(c.type),
        owner: c.owner,
        faceUp: c.faceUp ?? false,
        challenged: c.challenged ?? false,
        covered: c.covered ?? j < stackSpec.length - 1,
        lastCard: false,
      })),
    };
  });

  const explicitDeck = (spec.bluffDeck ?? []).map(take);
  const abilityDiscard = (spec.abilityDiscard ?? []).map(take);
  const destroyed = (spec.destroyed ?? []).map(take);
  const explicitAbilityDeck = (spec.abilityDeck ?? []).map(take);

  const leftoverBluff = BLUFF_TYPES.flatMap((t) => pool.get(t) ?? []);
  const leftoverAbility = ABILITY_TYPES.flatMap((t) => pool.get(t) ?? []);

  let bluffDeck = explicitDeck;
  const lb = spec.leftoverBluff ?? 'deck';
  if (lb === 'deck') bluffDeck = [...leftoverBluff, ...explicitDeck];
  else if ('hand' in lb) players.find((p) => p.id === lb.hand)!.hand.push(...leftoverBluff);
  else {
    const pile = piles[lb.coveredOn];
    const covered = leftoverBluff.map((card) => ({
      id: placementId++,
      card,
      owner: lb.owner,
      faceUp: false,
      challenged: false,
      covered: true,
      lastCard: false,
    }));
    pile.stack.unshift(...covered);
    // Re-number placements so ids stay increasing bottom-to-top.
    for (const p of piles) for (const pl of p.stack) pl.id = placementId++;
  }

  let abilityDeck = explicitAbilityDeck;
  if ((spec.leftoverAbility ?? 'deck') === 'deck') abilityDeck = [...leftoverAbility, ...explicitAbilityDeck];
  else abilityDiscard.unshift(...leftoverAbility);

  const state: GameState = {
    version: 0,
    config,
    rng,
    cards,
    players,
    bluffDeck,
    abilityDeck,
    abilityDiscard,
    destroyed,
    piles,
    currentPlayer: spec.current ?? players[0].id,
    turn: 1,
    pending: null,
    lastChallenge: null,
    winner: null,
    nextSeq: 1,
    nextPlacementId: placementId,
    nextPileNumber: piles.length + 1,
    nextChallengeId: 1,
  };
  assertInvariants(state);
  return state;
}

/** First card of a type in a player's hand. */
export function handCard(s: GameState, player: PlayerId, type: BluffType): CardId {
  const id = s.players.find((p) => p.id === player)!.hand.find((c) => s.cards[c].type === type);
  if (!id) throw new Error(`${player} has no ${type}`);
  return id;
}

/** First ability card of a type held by a player. */
export function abilityCard(s: GameState, player: PlayerId, type: AbilityType): CardId {
  const id = s.players.find((p) => p.id === player)!.abilities.find((c) => s.cards[c].type === type);
  if (!id) throw new Error(`${player} has no ${type}`);
  return id;
}

export function pileOf(s: GameState, type: BluffType): PileId {
  const pile = s.piles.find((p) => p.type === type);
  if (!pile) throw new Error(`no ${type} pile`);
  return pile.id;
}

export function handTypes(s: GameState, player: PlayerId): CardType[] {
  return s.players.find((p) => p.id === player)!.hand.map((c) => s.cards[c].type).sort();
}
