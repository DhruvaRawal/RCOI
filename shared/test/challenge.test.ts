import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/engine/legal';
import { toPlayerView } from '../src/engine/view';
import { buildScenario, handCard, handTypes } from '../src/testing/scenario';
import { act, eventTypes, pile, player, reject, top } from './helpers';

/**
 * B has played onto the Raja pile. `target` is the type B played.
 * A (current) challenges. C is a bystander.
 */
function setup(target: 'RAJA' | 'YODHA' | 'RANI', aHand: ('RAJA' | 'RANI' | 'YODHA' | 'SENAPATI' | 'VIDUSHAKA')[] = ['RAJA', 'SENAPATI']) {
  return buildScenario({
    players: [
      { id: 'A', hand: aHand },
      { id: 'B', hand: ['GAJADHYAKSHA', 'YUVARAJA', 'YODHA'] },
      { id: 'C', hand: ['RANI', 'RANI'] },
    ],
    piles: [
      { type: 'RAJA', stack: [{ type: 'SENAPATI', owner: 'C' }, { type: target, owner: 'B' }] },
      { type: 'RANI' },
      { type: 'SENAPATI' },
      { type: 'YODHA' },
    ],
    current: 'A',
  });
}

describe('challenger loses (target matches its pile)', () => {
  it('challenger keeps their card, draws 1, and receives a card chosen by the challenged player', () => {
    const s = setup('RAJA');
    const challengerCard = handCard(s, 'A', 'SENAPATI');
    const deckTop = s.bluffDeck[s.bluffDeck.length - 1];
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: challengerCard });
    expect(player(r.state, 'A').hand).toContain(challengerCard);
    expect(player(r.state, 'A').hand).toContain(deckTop);
    expect(r.state.pending).toMatchObject({ kind: 'give', from: 'B', to: 'A', step: 'challengedGives' });
    expect(getLegalActions(r.state, 'B')).toMatchObject({ awaiting: 'give', give: { to: 'A' } });
    expect(getLegalActions(r.state, 'A').awaiting).toBeNull();

    // Only B may decide now.
    expect(reject(r.state, 'A', { type: 'DRAW' })).toBe('NOT_YOUR_DECISION');
    const given = handCard(r.state, 'B', 'YUVARAJA');
    r = act(r.state, 'B', { type: 'GIVE', cardId: given });
    expect(player(r.state, 'A').hand).toHaveLength(4);
    expect(player(r.state, 'A').hand).toContain(given);
    expect(player(r.state, 'B').hand).toHaveLength(2);
    expect(r.state.currentPlayer).toBe('B'); // next clockwise after the challenger
    const giveEv = r.events.find((e) => e.type === 'CARD_GIVEN')!;
    expect(Object.keys(giveEv.secret!).sort()).toEqual(['A', 'B']); // only giver and receiver see it
  });

  it('the revealed target stays face up without a meeple and can never be challenged again there', () => {
    const s = setup('RAJA');
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'SENAPATI') });
    r = act(r.state, 'B', { type: 'GIVE', cardId: handCard(r.state, 'B', 'YODHA') });
    expect(top(r.state, 'p1')).toMatchObject({ owner: 'B', faceUp: true, challenged: true });
    const v = toPlayerView(r.state, 'C').piles[0].cards[1];
    expect(v).toMatchObject({ faceUp: true, type: 'RAJA', meeple: false, challengeable: false });
    // C (next player after B... B is current) - B can't challenge own; move to C:
    r = act(r.state, 'B', { type: 'DRAW' });
    expect(getLegalActions(r.state, 'C').challenge.pileIds).not.toContain('p1');
    expect(reject(r.state, 'C', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(r.state, 'C', 'RANI') })).toBe(
      'NOT_CHALLENGEABLE',
    );
  });

  it('a revealed card stays face up when later covered', () => {
    const s = setup('RAJA');
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'SENAPATI') });
    r = act(r.state, 'B', { type: 'GIVE', cardId: handCard(r.state, 'B', 'YODHA') });
    r = act(r.state, 'B', { type: 'PLAY', cardId: handCard(r.state, 'B', 'GAJADHYAKSHA'), pileId: 'p1' });
    const cards = toPlayerView(r.state, 'C').piles[0].cards;
    expect(cards[1]).toMatchObject({ faceUp: true, type: 'RAJA', isTop: false, meeple: false });
    expect(cards[2]).toMatchObject({ faceUp: false, type: null, isTop: true, meeple: true });
  });
});

describe('challenger wins (bluff caught)', () => {
  it('challenger gives a card, bluffer takes the target back and draws 1, challenger draws an ability card', () => {
    const s = setup('YODHA'); // Yodha on the Raja pile: bluff. Raja beats Yodha.
    const challengerCard = handCard(s, 'A', 'RAJA');
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: challengerCard });
    expect(r.state.pending).toMatchObject({ kind: 'give', from: 'A', to: 'B', step: 'challengerGives' });
    const targetCard = top(s, 'p1').card;

    // The challenger may give the challenger card itself.
    r = act(r.state, 'A', { type: 'GIVE', cardId: challengerCard });
    expect(player(r.state, 'A').hand).toHaveLength(1);
    expect(player(r.state, 'A').abilities).toHaveLength(1);
    const b = player(r.state, 'B');
    expect(b.hand).toContain(targetCard);
    expect(b.hand).toContain(challengerCard);
    expect(b.hand).toHaveLength(3 + 3); // own 3 + target + given + drawn
    expect(eventTypes(r.events)).toEqual([
      'CARD_GIVEN',
      'CARD_TAKEN_BACK',
      'CARDS_DRAWN',
      'CARDS_DRAWN',
      'TURN_STARTED',
    ]);
    expect(r.state.currentPlayer).toBe('B');
  });

  it('the card underneath becomes the top again with no meeple (ruling 6) and has no legal target', () => {
    const s = setup('YODHA');
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    r = act(r.state, 'A', { type: 'GIVE', cardId: handCard(r.state, 'A', 'SENAPATI') });
    expect(pile(r.state, 'p1').stack).toHaveLength(1);
    const v = toPlayerView(r.state, 'B').piles[0];
    expect(v.count).toBe(1);
    expect(v.cards[0]).toMatchObject({ owner: 'C', isTop: true, meeple: false, challengeable: false });
    expect(getLegalActions(r.state, 'B').challenge.pileIds).not.toContain('p1');
    // A new card on the pile is challengeable again.
    r = act(r.state, 'B', { type: 'PLAY', cardId: handCard(r.state, 'B', 'GAJADHYAKSHA'), pileId: 'p1' });
    expect(getLegalActions(r.state, 'C').challenge.pileIds).toContain('p1');
  });

  it('a challenged card that returns to a hand is a fresh card when played again', () => {
    const s = setup('YODHA');
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    const target = top(s, 'p1').card;
    r = act(r.state, 'A', { type: 'GIVE', cardId: handCard(r.state, 'A', 'SENAPATI') });
    expect(player(r.state, 'B').hand).toContain(target);
    r = act(r.state, 'B', { type: 'PLAY', cardId: target, pileId: 'p2' });
    expect(top(r.state, 'p2')).toMatchObject({ card: target, challenged: false, faceUp: false });
    expect(getLegalActions(r.state, 'C').challenge.pileIds).toContain('p2');
  });
});

describe('challenge eligibility', () => {
  it('only the top card, never your own, never an empty pile', () => {
    const s = setup('RAJA');
    expect(getLegalActions(s, 'A').challenge.pileIds).toEqual(['p1']);
    expect(reject(s, 'A', { type: 'CHALLENGE', pileId: 'p2', cardId: handCard(s, 'A', 'RAJA') })).toBe(
      'NOTHING_TO_CHALLENGE',
    );
    const own = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'RANI'] }, { id: 'B', hand: ['RANI'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'RANI', owner: 'A' }] }, { type: 'RANI' }, { type: 'YODHA' }, { type: 'SENAPATI' }],
      current: 'A',
    });
    expect(reject(own, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(own, 'A', 'RAJA') })).toBe('OWN_CARD');
  });

  it('a card that was covered can never be challenged, even after it becomes the top again', () => {
    const s = setup('YODHA');
    expect(pile(s, 'p1').stack[0].covered).toBe(true);
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    r = act(r.state, 'A', { type: 'GIVE', cardId: handCard(r.state, 'A', 'SENAPATI') });
    // C's Senapati is the top again but was covered: B can't challenge it.
    expect(reject(r.state, 'B', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(r.state, 'B', 'YODHA') })).toBe(
      'NOT_CHALLENGEABLE',
    );
  });

  it('the challenger must use a card from their own hand', () => {
    const s = setup('RAJA');
    expect(reject(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'C', 'RANI') })).toBe(
      'CARD_NOT_IN_HAND',
    );
  });

  it('only the challenger card type is public when it decided the result', () => {
    const lose = act(setup('RAJA'), 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(setup('RAJA'), 'A', 'SENAPATI') });
    expect(toPlayerView(lose.state, 'C').lastChallenge!.challengerCardType).toBeNull();
    expect(toPlayerView(lose.state, 'A').lastChallenge!.challengerCardType).toBe('SENAPATI');
    const s = setup('YODHA');
    const win = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    expect(toPlayerView(win.state, 'C').lastChallenge!.challengerCardType).toBe('RAJA');
  });

  it('hand types after a lost challenge add up', () => {
    const s = setup('RAJA', ['RAJA', 'SENAPATI']);
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    r = act(r.state, 'B', { type: 'GIVE', cardId: handCard(r.state, 'B', 'GAJADHYAKSHA') });
    expect(handTypes(r.state, 'A')).toContain('GAJADHYAKSHA');
    expect(handTypes(r.state, 'A')).toContain('RAJA');
  });
});
