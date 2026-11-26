import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/engine/legal';
import { toPlayerView } from '../src/engine/view';
import { buildScenario, handCard } from '../src/testing/scenario';
import { act, reject, timeout, top } from './helpers';

const PILES = [
  { type: 'RAJA' as const, stack: [{ type: 'YODHA' as const, owner: 'B' }] },
  { type: 'RANI' as const },
  { type: 'SENAPATI' as const },
  { type: 'YODHA' as const },
];

function lastCard(card: 'RAJA' | 'VIDUSHAKA' | 'GAJADHYAKSHA', abilities: ('MAHAMANTRI' | 'DANDANAYAKA')[] = []) {
  return buildScenario({
    players: [
      { id: 'A', hand: [card], abilities },
      { id: 'B', hand: ['RANI', 'YODHA', 'RAJA'] },
    ],
    piles: PILES,
    current: 'A',
  });
}

describe('last card', () => {
  it('matching pile: only a face-up play on that pile is allowed', () => {
    const s = lastCard('RAJA');
    const legal = getLegalActions(s, 'A');
    expect(legal.play).toEqual([{ cardId: handCard(s, 'A', 'RAJA'), pileIds: ['p1'], faceUp: true }]);
    expect(legal.playNotice).toMatch(/face up on the Raja pile/);
    expect(reject(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: 'p2' })).toBe('ILLEGAL_PLAY');
  });

  it('matching pile: the face-up card covers the top, gets a meeple, adds to the count, and wins', () => {
    const s = lastCard('RAJA');
    const r = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: 'p1' });
    expect(top(r.state, 'p1')).toMatchObject({ owner: 'A', faceUp: true, lastCard: true });
    expect(r.state.piles[0].stack[0].covered).toBe(true);
    const v = toPlayerView(r.state, 'B').piles[0];
    expect(v.count).toBe(2);
    expect(v.cards[1]).toMatchObject({ type: 'RAJA', faceUp: true, meeple: true, challengeable: false });
    expect(r.state.winner).toEqual({ player: 'A', reason: 'LAST_CARD_PLAYED' });
    const played = r.events.find((e) => e.type === 'CARD_PLAYED')!;
    expect(played).toMatchObject({ faceUp: true, cardType: 'RAJA' }); // shown to everyone
    expect(reject(r.state, 'B', { type: 'DRAW' })).toBe('GAME_OVER');
  });

  it('Vidushaka: face up on any pile, then wins', () => {
    const s = lastCard('VIDUSHAKA');
    const legal = getLegalActions(s, 'A');
    expect(legal.play[0]).toMatchObject({ pileIds: ['p1', 'p2', 'p3', 'p4'], faceUp: true });
    expect(legal.playNotice).toMatch(/any pile/);
    const r = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'VIDUSHAKA'), pileId: 'p3' });
    expect(top(r.state, 'p3')).toMatchObject({ faceUp: true, lastCard: true });
    expect(r.state.winner?.player).toBe('A');
  });

  it('no matching pile: cannot be played, other actions stay available and the reason is explained', () => {
    const s = lastCard('GAJADHYAKSHA', ['DANDANAYAKA']);
    const legal = getLegalActions(s, 'A');
    expect(legal.play[0].pileIds).toEqual([]);
    expect(legal.playNotice).toMatch(/no open pile matches your Gajadhyaksha/);
    expect(legal.challenge.pileIds).toEqual(['p1']);
    expect(legal.draw.allowed).toBe(true);
    expect(legal.abilities[0]).toMatchObject({ type: 'DANDANAYAKA', usable: true });
    for (const pileId of ['p1', 'p2', 'p3', 'p4']) {
      expect(reject(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'GAJADHYAKSHA'), pileId })).toBe('ILLEGAL_PLAY');
    }
  });

  it('may still challenge using the last card as the challenger card', () => {
    const s = lastCard('GAJADHYAKSHA');
    // Target is a Yodha on the Raja pile (bluff); Gajadhyaksha beats Yodha.
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'GAJADHYAKSHA') });
    // A wins the challenge and must give a card: the only one is forced -> A empties their hand and wins.
    expect(r.state.winner).toEqual({ player: 'A', reason: 'GAVE_LAST_CARD' });
  });

  it('may still draw, and a timeout draws even with one card left (ruling 11)', () => {
    const s = lastCard('GAJADHYAKSHA');
    expect(act(s, 'A', { type: 'DRAW' }).state.players[0].hand).toHaveLength(2);
    const t = timeout(s);
    expect(t.state.players[0].hand).toHaveLength(2);
    expect(t.state.currentPlayer).toBe('B');
  });

  it('can never be played face down even with only one pile choice', () => {
    const s = lastCard('RAJA');
    const r = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: 'p1' });
    expect(top(r.state, 'p1').faceUp).toBe(true);
  });
});
