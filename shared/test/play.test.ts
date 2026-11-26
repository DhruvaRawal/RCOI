import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/engine/legal';
import { toPlayerView } from '../src/engine/view';
import { buildScenario, handCard, pileOf } from '../src/testing/scenario';
import { act, eventTypes, pile, player, reject, top } from './helpers';

const PILES = [{ type: 'RAJA' as const }, { type: 'RANI' as const }, { type: 'SENAPATI' as const }, { type: 'YODHA' as const }];

function threePlayers() {
  return buildScenario({
    players: [
      { id: 'A', hand: ['RAJA', 'VIDUSHAKA', 'YODHA'] },
      { id: 'B', hand: ['RANI', 'RANI', 'YODHA'] },
      { id: 'C', hand: ['SENAPATI', 'GAJADHYAKSHA'] },
    ],
    piles: PILES,
    current: 'A',
  });
}

describe('play a card', () => {
  it('offers every pile for every card (no hint about the honest pile)', () => {
    const s = threePlayers();
    const legal = getLegalActions(s, 'A');
    expect(legal.play).toHaveLength(3);
    for (const o of legal.play) {
      expect(o.pileIds).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(o.faceUp).toBe(false);
    }
    expect(legal.playNotice).toBeNull();
  });

  it('allows an honest play and a bluff, both face down', () => {
    let s = threePlayers();
    s = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: pileOf(s, 'RAJA') }).state;
    expect(top(s, 'p1')).toMatchObject({ owner: 'A', faceUp: false });
    s = act(s, 'B', { type: 'PLAY', cardId: handCard(s, 'B', 'YODHA'), pileId: pileOf(s, 'RAJA') }).state; // bluff
    expect(top(s, 'p1')).toMatchObject({ owner: 'B', faceUp: false });
  });

  it('allows Vidushaka (which has no pile) face down on any pile - always a bluff', () => {
    const s = threePlayers();
    const r = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'VIDUSHAKA'), pileId: 'p3' });
    expect(top(r.state, 'p3').faceUp).toBe(false);
  });

  it('puts the meeple on the new card; the covered card loses it permanently; count shows played cards', () => {
    let s = threePlayers();
    s = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: 'p1' }).state;
    let v = toPlayerView(s, 'C').piles[0];
    expect(v.count).toBe(1);
    expect(v.cards[0]).toMatchObject({ owner: 'A', meeple: true, challengeable: true, isTop: true });

    s = act(s, 'B', { type: 'PLAY', cardId: handCard(s, 'B', 'RANI'), pileId: 'p1' }).state;
    v = toPlayerView(s, 'C').piles[0];
    expect(v.count).toBe(2);
    expect(v.cards[0]).toMatchObject({ owner: 'A', meeple: false, challengeable: false, isTop: false });
    expect(v.cards[1]).toMatchObject({ owner: 'B', meeple: true, challengeable: true, isTop: true });
    expect(pile(s, 'p1').stack[0].covered).toBe(true);
  });

  it('passes the turn clockwise', () => {
    let s = threePlayers();
    s = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: 'p1' }).state;
    expect(s.currentPlayer).toBe('B');
    s = act(s, 'B', { type: 'PLAY', cardId: handCard(s, 'B', 'RANI'), pileId: 'p2' }).state;
    expect(s.currentPlayer).toBe('C');
    s = act(s, 'C', { type: 'PLAY', cardId: handCard(s, 'C', 'SENAPATI'), pileId: 'p3' }).state;
    expect(s.currentPlayer).toBe('A');
  });

  it('rejects out-of-turn plays, foreign cards and unknown piles', () => {
    const s = threePlayers();
    expect(reject(s, 'B', { type: 'PLAY', cardId: handCard(s, 'B', 'RANI'), pileId: 'p1' })).toBe('NOT_YOUR_TURN');
    expect(reject(s, 'A', { type: 'PLAY', cardId: handCard(s, 'B', 'RANI'), pileId: 'p1' })).toBe('CARD_NOT_IN_HAND');
    expect(reject(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: 'p9' })).toBe('UNKNOWN_PILE');
  });

  it('allows exactly one action per turn', () => {
    let s = threePlayers();
    s = act(s, 'A', { type: 'DRAW' }).state;
    expect(reject(s, 'A', { type: 'DRAW' })).toBe('NOT_YOUR_TURN');
  });
});

describe('draw a card', () => {
  it('draws one bluffing card and uses the whole turn', () => {
    const s = threePlayers();
    const deckBefore = s.bluffDeck.length;
    const topCard = s.bluffDeck[s.bluffDeck.length - 1];
    const r = act(s, 'A', { type: 'DRAW' });
    expect(player(r.state, 'A').hand).toHaveLength(4);
    expect(player(r.state, 'A').hand).toContain(topCard);
    expect(r.state.bluffDeck).toHaveLength(deckBefore - 1);
    expect(r.state.currentPlayer).toBe('B');
    const drawn = r.events.find((e) => e.type === 'CARDS_DRAWN')!;
    expect(drawn).toMatchObject({ player: 'A', deck: 'bluff', count: 1 });
    expect(drawn.secret!.A.cards![0].id).toBe(topCard);
    expect(Object.keys(drawn.secret!)).toEqual(['A']);
  });

  it('reshuffles covered cards when the deck is empty, leaving tops and open cards (ruling 8)', () => {
    const s = buildScenario({
      players: [
        { id: 'A', hand: ['RAJA', 'RANI'] },
        { id: 'B', hand: ['RANI', 'YODHA'] },
      ],
      piles: [
        { type: 'RAJA', stack: [{ type: 'YODHA', owner: 'B' }, { type: 'RAJA', owner: 'A' }] },
        { type: 'RANI', stack: [{ type: 'RANI', owner: 'B' }] },
        { type: 'SENAPATI' },
        { type: 'YODHA' },
      ],
      leftoverBluff: { coveredOn: 3, owner: 'A' },
      current: 'A',
    });
    expect(s.bluffDeck).toHaveLength(0);
    const topsBefore = s.piles.map((p) => p.stack[p.stack.length - 1]?.card);
    const coveredBefore = s.piles.reduce((n, p) => n + Math.max(0, p.stack.length - 1), 0);
    const r = act(s, 'A', { type: 'DRAW' });
    expect(eventTypes(r.events)).toContain('BLUFF_DECK_RESHUFFLED');
    expect(r.state.bluffDeck).toHaveLength(coveredBefore - 1);
    expect(r.state.piles.map((p) => p.stack[p.stack.length - 1]?.card)).toEqual(topsBefore);
    expect(r.state.piles.map((p) => p.openCard)).toEqual(s.piles.map((p) => p.openCard));
    for (const p of r.state.piles) expect(p.stack.length).toBeLessThanOrEqual(1);
    expect(toPlayerView(r.state, 'B').piles.map((p) => p.count)).toEqual([1, 1, 0, 1]);
  });

  it('is disabled with a reason when nothing can be drawn', () => {
    const s = buildScenario({
      players: [
        { id: 'A', hand: ['RAJA', 'RANI'] },
        { id: 'B', hand: ['RANI'] },
      ],
      piles: PILES,
      leftoverBluff: { hand: 'B' },
      current: 'A',
    });
    const legal = getLegalActions(s, 'A');
    expect(legal.draw.allowed).toBe(false);
    expect(legal.draw.reason).toMatch(/empty/);
    expect(reject(s, 'A', { type: 'DRAW' })).toBe('CANNOT_DRAW');
  });
});
