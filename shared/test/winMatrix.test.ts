import { describe, expect, it } from 'vitest';
import { BLUFF_TYPES, type BluffType } from '../src/data/cards';
import { BEATS, beats } from '../src/data/winMatrix';
import { buildScenario, handCard } from '../src/testing/scenario';
import { act } from './helpers';

const PILEABLE = BLUFF_TYPES.filter((t) => t !== 'VIDUSHAKA');

describe('win table', () => {
  it('is exactly the table from the rules', () => {
    expect(BEATS).toEqual({
      RAJA: ['RANI', 'YUVARAJA', 'SENAPATI', 'GAJADHYAKSHA', 'YODHA'],
      RANI: ['YUVARAJA', 'SENAPATI', 'GAJADHYAKSHA', 'YODHA'],
      YUVARAJA: ['SENAPATI', 'GAJADHYAKSHA', 'YODHA', 'VIDUSHAKA'],
      SENAPATI: ['GAJADHYAKSHA', 'YODHA', 'VIDUSHAKA'],
      GAJADHYAKSHA: ['YODHA', 'VIDUSHAKA'],
      YODHA: ['VIDUSHAKA'],
      VIDUSHAKA: ['RAJA', 'RANI'],
    });
  });

  it('is not a linear ranking (Vidushaka beats Raja, Raja does not beat Vidushaka)', () => {
    expect(beats('VIDUSHAKA', 'RAJA')).toBe(true);
    expect(beats('RAJA', 'VIDUSHAKA')).toBe(false);
    expect(beats('YODHA', 'VIDUSHAKA')).toBe(true);
    expect(beats('VIDUSHAKA', 'YODHA')).toBe(false);
  });

  it('no card beats itself', () => {
    for (const t of BLUFF_TYPES) expect(beats(t, t)).toBe(false);
  });
});

/** A challenges B's top card (type `target`) on a pile of type `pileType` using `challenger`. */
function challenge(pileType: BluffType, target: BluffType, challenger: BluffType) {
  const others = PILEABLE.filter((t) => t !== pileType).slice(0, 3);
  const s = buildScenario({
    players: [
      { id: 'A', hand: [challenger, 'YODHA'] },
      { id: 'B', hand: ['RAJA', 'RANI'] },
    ],
    piles: [{ type: pileType, stack: [{ type: target, owner: 'B' }] }, ...others.map((t) => ({ type: t }))],
    current: 'A',
  });
  const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', challenger) });
  const ev = r.events.find((e) => e.type === 'CHALLENGE')!;
  return { r, ev: ev as Extract<typeof ev, { type: 'CHALLENGE' }> };
}

describe('all 49 challenger/target pairings', () => {
  for (const target of BLUFF_TYPES) {
    for (const challenger of BLUFF_TYPES) {
      it(`${challenger} vs ${target} on a MATCHING pile -> challenger loses`, () => {
        if (target === 'VIDUSHAKA') {
          // There is never a Vidushaka pile, so a Vidushaka target can never match.
          expect(() =>
            buildScenario({ players: [{ id: 'A', hand: ['RAJA'] }, { id: 'B', hand: ['RANI'] }], piles: [{ type: 'VIDUSHAKA' }] }),
          ).toThrow();
          return;
        }
        const { r, ev } = challenge(target, target, challenger);
        expect(ev.matched).toBe(true);
        expect(ev.challengerWon).toBe(false);
        expect(ev.reason).toBe('MATCHED');
        expect(ev.challengerCardType).toBeUndefined(); // ruling 10: not decisive, not shown
        expect(r.state.pending).toMatchObject({ kind: 'give', from: 'B', to: 'A' });
      });

      it(`${challenger} vs ${target} on a MISMATCHED pile -> ${beats(challenger, target) ? 'challenger wins' : 'challenger loses'}`, () => {
        const pileType = PILEABLE.find((t) => t !== target)!;
        const { r, ev } = challenge(pileType, target, challenger);
        const wins = beats(challenger, target);
        expect(ev.matched).toBe(false);
        expect(ev.challengerWon).toBe(wins);
        expect(ev.reason).toBe(challenger === target ? 'TIE' : wins ? 'BEATS' : 'DOES_NOT_BEAT');
        expect(ev.challengerCardType).toBe(challenger); // ruling 10: decisive, shown to everyone
        expect(r.state.pending).toMatchObject(
          wins ? { kind: 'give', from: 'A', to: 'B' } : { kind: 'give', from: 'B', to: 'A' },
        );
      });
    }
  }
});
