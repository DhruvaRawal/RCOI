import { DEFAULT_CONFIG, type GameConfig } from '../config';
import { ABILITY_CARDS, ABILITY_TYPES, BLUFF_CARDS, BLUFF_TYPES, type BluffType } from '../data/cards';
import { Ctx } from './context';
import { visibleCard } from './ops';
import { createRng, pickRandom, randomId, shuffleInPlace } from './rng';
import type { CardId, CardInfo, GameEvent, GameState, Pile, PlayerId } from './types';

export interface CreateGameOptions {
  players: PlayerId[];
  /** Any string. The server uses 64 random hex characters. */
  seed: string;
  config?: GameConfig;
}

export function createGame(opts: CreateGameOptions): { state: GameState; events: GameEvent[] } {
  const config = opts.config ?? DEFAULT_CONFIG;
  const { players } = opts;
  if (players.length < config.minPlayers || players.length > config.maxPlayers) {
    throw new Error(`A game needs ${config.minPlayers}-${config.maxPlayers} players`);
  }
  if (new Set(players).size !== players.length) throw new Error('Player ids must be unique');
  const pileableTypes = BLUFF_TYPES.filter((t) => BLUFF_CARDS[t].canOpenPile);
  if (config.openPileCount > pileableTypes.length) throw new Error('Not enough card types for the open piles');

  const rng = createRng(opts.seed);

  // Cards get random opaque IDs so an ID never reveals the type.
  const cards: Record<CardId, CardInfo> = {};
  const newId = (): CardId => {
    let id: CardId;
    do id = randomId(rng); while (cards[id]);
    return id;
  };
  const bluffDeck: CardId[] = [];
  for (const type of BLUFF_TYPES) {
    for (let i = 0; i < BLUFF_CARDS[type].count; i++) {
      const id = newId();
      cards[id] = { kind: 'bluff', type };
      bluffDeck.push(id);
    }
  }
  const abilityDeck: CardId[] = [];
  for (const type of ABILITY_TYPES) {
    for (let i = 0; i < ABILITY_CARDS[type].count; i++) {
      const id = newId();
      cards[id] = { kind: 'ability', type };
      abilityDeck.push(id);
    }
  }
  shuffleInPlace(rng, bluffDeck);
  shuffleInPlace(rng, abilityDeck);

  // Open piles: random, all different, never Vidushaka. Set aside rejects and reshuffle them in.
  const piles: Pile[] = [];
  const setAside: CardId[] = [];
  const used = new Set<BluffType>();
  while (piles.length < config.openPileCount) {
    const id = bluffDeck.pop();
    if (!id) throw new Error('Ran out of cards while revealing open piles');
    const type = cards[id].type as BluffType;
    if (!BLUFF_CARDS[type].canOpenPile || used.has(type)) {
      setAside.push(id);
      continue;
    }
    used.add(type);
    piles.push({ id: `p${piles.length + 1}`, type, openCard: id, stack: [], origin: 'setup' });
  }
  bluffDeck.push(...setAside);
  shuffleInPlace(rng, bluffDeck);

  // Deal one card at a time, clockwise.
  const hands: CardId[][] = players.map(() => []);
  for (let round = 0; round < config.handSize; round++) {
    for (const hand of hands) hand.push(bluffDeck.pop()!);
  }

  const firstPlayer = pickRandom(rng, players);
  const state: GameState = {
    version: 0,
    config,
    rng,
    cards,
    players: players.map((id, i) => ({ id, hand: hands[i], abilities: [] })),
    bluffDeck,
    abilityDeck,
    abilityDiscard: [],
    destroyed: [],
    piles,
    currentPlayer: firstPlayer,
    turn: 1,
    pending: null,
    lastChallenge: null,
    winner: null,
    nextSeq: 1,
    nextPlacementId: 1,
    nextPileNumber: piles.length + 1,
    nextChallengeId: 1,
  };

  const ctx = new Ctx(state);
  ctx.emit(
    {
      type: 'GAME_STARTED',
      players: [...players],
      firstPlayer,
      piles: piles.map((p) => ({ pileId: p.id, type: p.type })),
      handSize: config.handSize,
    },
    Object.fromEntries(state.players.map((p) => [p.id, { cards: p.hand.map((c) => visibleCard(state, c)) }])),
  );
  ctx.emit({ type: 'TURN_STARTED', player: firstPlayer });
  return { state, events: ctx.events };
}
