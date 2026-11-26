import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { BLUFF_TYPES, TOTAL_ABILITY_CARDS, TOTAL_BLUFF_CARDS } from '../src/data/cards';
import { assertInvariants } from '../src/engine/invariants';
import { createGame } from '../src/engine/setup';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

describe('setup', () => {
  it('has 49 bluffing and 13 ability cards (62 total)', () => {
    expect(TOTAL_BLUFF_CARDS).toBe(49);
    expect(TOTAL_ABILITY_CARDS).toBe(13);
  });

  it('matches the 4-player check: 28 in hands, 4 piles, 17 in deck, 13 ability cards', () => {
    const { state } = createGame({ players: ids(4), seed: 'four' });
    expect(state.players.reduce((n, p) => n + p.hand.length, 0)).toBe(28);
    expect(state.piles).toHaveLength(4);
    expect(state.bluffDeck).toHaveLength(17);
    expect(state.abilityDeck).toHaveLength(13);
    expect(state.players.every((p) => p.abilities.length === 0)).toBe(true);
  });

  it.each([2, 3, 4, 5])('deals a valid %i-player game', (n) => {
    for (let seed = 0; seed < 30; seed++) {
      const { state } = createGame({ players: ids(n), seed: `n${n}-${seed}` });
      assertInvariants(state);
      expect(state.players.every((p) => p.hand.length === DEFAULT_CONFIG.handSize)).toBe(true);
      expect(state.bluffDeck).toHaveLength(49 - 7 * n - 4);
      const types = state.piles.map((p) => p.type);
      expect(new Set(types).size).toBe(4);
      expect(types).not.toContain('VIDUSHAKA');
      for (const p of state.piles) {
        expect(state.cards[p.openCard].type).toBe(p.type);
        expect(p.stack).toHaveLength(0);
      }
    }
  });

  it('rejects fewer than 2 or more than 5 players', () => {
    expect(() => createGame({ players: ids(1), seed: 'x' })).toThrow();
    expect(() => createGame({ players: ids(6), seed: 'x' })).toThrow();
  });

  it('picks the first player at random', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 400; seed++) {
      const { state } = createGame({ players: ids(4), seed: `first-${seed}` });
      counts.set(state.currentPlayer, (counts.get(state.currentPlayer) ?? 0) + 1);
    }
    expect(counts.size).toBe(4);
    for (const c of counts.values()) expect(c).toBeGreaterThan(60);
  });

  it('every open-pile type appears across seeds and Vidushaka never does', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      createGame({ players: ids(3), seed: `piles-${seed}` }).state.piles.forEach((p) => seen.add(p.type));
    }
    expect([...seen].sort()).toEqual(BLUFF_TYPES.filter((t) => t !== 'VIDUSHAKA').sort());
  });

  it('is deterministic for a seed', () => {
    const a = createGame({ players: ids(3), seed: 'same' });
    const b = createGame({ players: ids(3), seed: 'same' });
    expect(a).toEqual(b);
    expect(createGame({ players: ids(3), seed: 'other' }).state.cards).not.toEqual(a.state.cards);
  });

  it('card IDs are opaque: same shape for every type and unrelated to the type', () => {
    const { state } = createGame({ players: ids(2), seed: 'opaque' });
    const all = Object.keys(state.cards);
    expect(new Set(all).size).toBe(62);
    for (const id of all) expect(id).toMatch(/^[a-z2-9]{10}$/);
    // Sorting ids must not group cards by type (ids are not issued in type order).
    const sortedTypes = [...all].sort().map((id) => state.cards[id].type);
    const runs = sortedTypes.filter((t, i) => i > 0 && t !== sortedTypes[i - 1]).length;
    expect(runs).toBeGreaterThan(30);
    // The same card type gets different ids in different games.
    const other = createGame({ players: ids(2), seed: 'opaque-2' }).state;
    expect(Object.keys(other.cards).filter((id) => state.cards[id])).toHaveLength(0);
  });

  it('emits GAME_STARTED with each hand only in that player\'s secret', () => {
    const { state, events } = createGame({ players: ids(3), seed: 'events' });
    const start = events[0];
    expect(start.type).toBe('GAME_STARTED');
    for (const p of state.players) {
      expect(start.secret![p.id].cards!.map((c) => c.id)).toEqual(p.hand);
    }
    expect(events[1]).toMatchObject({ type: 'TURN_STARTED', player: state.currentPlayer });
  });
});
