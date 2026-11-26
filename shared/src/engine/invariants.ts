import { ABILITY_CARDS, BLUFF_CARDS, TOTAL_ABILITY_CARDS, TOTAL_BLUFF_CARDS } from '../data/cards';
import { isChallengeable } from './rulings';
import type { CardId, GameState } from './types';

/**
 * Throws if the state breaks a structural rule. Used by tests after every action:
 * card conservation (nothing lost or duplicated, counting the destroyed Raj Bhandari),
 * pile rules and meeple rules.
 */
export function assertInvariants(s: GameState): void {
  const fail = (msg: string): never => {
    throw new Error(`Invariant violated: ${msg}`);
  };

  // --- Bluffing cards: every one exactly once across hands, deck, open cards and stacks.
  const bluffSeen = new Map<CardId, string>();
  const see = (id: CardId, where: string) => {
    if (s.cards[id]?.kind !== 'bluff') fail(`${where} holds non-bluff card ${id}`);
    if (bluffSeen.has(id)) fail(`card ${id} is in ${where} and ${bluffSeen.get(id)}`);
    bluffSeen.set(id, where);
  };
  for (const p of s.players) p.hand.forEach((id) => see(id, `hand:${p.id}`));
  s.bluffDeck.forEach((id) => see(id, 'bluffDeck'));
  for (const pile of s.piles) {
    see(pile.openCard, `open:${pile.id}`);
    pile.stack.forEach((pl) => see(pl.card, `stack:${pile.id}`));
  }
  if (bluffSeen.size !== TOTAL_BLUFF_CARDS) fail(`expected ${TOTAL_BLUFF_CARDS} bluffing cards, found ${bluffSeen.size}`);

  // --- Ability cards: hands, deck, discard, destroyed.
  const abilitySeen = new Map<CardId, string>();
  const seeA = (id: CardId, where: string) => {
    if (s.cards[id]?.kind !== 'ability') fail(`${where} holds non-ability card ${id}`);
    if (abilitySeen.has(id)) fail(`ability ${id} is in ${where} and ${abilitySeen.get(id)}`);
    abilitySeen.set(id, where);
  };
  for (const p of s.players) p.abilities.forEach((id) => seeA(id, `abilities:${p.id}`));
  s.abilityDeck.forEach((id) => seeA(id, 'abilityDeck'));
  s.abilityDiscard.forEach((id) => seeA(id, 'abilityDiscard'));
  s.destroyed.forEach((id) => seeA(id, 'destroyed'));
  if (abilitySeen.size !== TOTAL_ABILITY_CARDS) {
    fail(`expected ${TOTAL_ABILITY_CARDS} ability cards, found ${abilitySeen.size}`);
  }
  for (const id of s.destroyed) if (s.cards[id].type !== 'RAJ_BHANDARI') fail('only Raj Bhandari can be destroyed');
  for (const id of s.abilityDiscard) if (s.cards[id].type === 'RAJ_BHANDARI') fail('Raj Bhandari in discard');

  // --- Card definitions match the data counts.
  const counts = new Map<string, number>();
  for (const id of Object.keys(s.cards)) counts.set(s.cards[id].type, (counts.get(s.cards[id].type) ?? 0) + 1);
  for (const [t, def] of Object.entries({ ...BLUFF_CARDS, ...ABILITY_CARDS })) {
    if ((counts.get(t) ?? 0) !== def.count) fail(`card type ${t} count ${counts.get(t)} != ${def.count}`);
  }

  // --- Piles.
  const pileTypes = new Set<string>();
  for (const pile of s.piles) {
    if (!BLUFF_CARDS[pile.type].canOpenPile) fail(`pile ${pile.id} has type ${pile.type}`);
    if (s.cards[pile.openCard].type !== pile.type) fail(`pile ${pile.id} open card does not match its type`);
    if (pileTypes.has(pile.type)) fail(`two piles of type ${pile.type}`);
    pileTypes.add(pile.type);
    pile.stack.forEach((pl, i) => {
      const isTop = i === pile.stack.length - 1;
      if (!isTop && !pl.covered && !(pl.lastCard && s.winner)) fail(`covered card ${pl.id} not marked covered`);
      if (!isTop && isChallengeable(s, pl, false)) fail(`covered card ${pl.id} is challengeable`);
      if (pl.lastCard && !pl.faceUp) fail('last card must be face up');
    });
  }

  // --- Turn / pending / winner.
  if (!s.players.some((p) => p.id === s.currentPlayer)) fail('current player missing');
  if (s.winner) {
    const w = s.players.find((p) => p.id === s.winner!.player);
    if (!w || w.hand.length !== 0) fail('winner must have zero bluffing cards');
    if (s.pending) fail('pending decision after game over');
  } else {
    for (const p of s.players) if (p.hand.length === 0) fail(`${p.id} has no cards but nobody won`);
  }
}
