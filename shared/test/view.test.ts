import { describe, expect, it } from 'vitest';
import { awaiting, getLegalActions } from '../src/engine/legal';
import { applyAction, applyTimeout } from '../src/engine/reducer';
import { createRng, shuffleInPlace } from '../src/engine/rng';
import { createGame } from '../src/engine/setup';
import type { CardId, GameEvent, GameState, PlayerId } from '../src/engine/types';
import { filterEvent, toPlayerView } from '../src/engine/view';
import { chooseBotAction, mulberry32 } from '../src/testing/bot';

/** Every (state, events) pair of a random game. */
function* gameSteps(players: number, seed: number) {
  const ids = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  const g = createGame({ players: ids, seed: `view-${players}-${seed}` });
  let state = g.state;
  yield { state, events: g.events };
  const rand = mulberry32(seed);
  for (let i = 0; i < 3000 && !state.winner; i++) {
    const aw = awaiting(state)!;
    const action = rand() < 0.05 ? null : chooseBotAction(getLegalActions(state, aw.player), rand);
    const r = action ? applyAction(state, aw.player, action) : applyTimeout(state);
    if (!r.ok) throw new Error(r.error.message);
    state = r.state;
    yield { state, events: r.events };
  }
}

/**
 * Re-deal every card the viewer cannot see. If the view is unchanged, the view cannot contain any
 * hidden information: other hands, deck order, face-down identities, ability holdings.
 */
function scrambleHidden(s: GameState, viewer: PlayerId, seed: string): GameState {
  const t = structuredClone(s);
  const rng = createRng(seed);
  // Cards whose identity the viewer is currently allowed to know must stay put.
  const pinned = new Set<CardId>();
  if (t.pending && t.pending.challenge.challenger !== viewer) pinned.add(t.pending.challenge.challengerCard);

  const bluffSlots: { get: () => CardId; set: (c: CardId) => void }[] = [];
  const abilitySlots: typeof bluffSlots = [];
  const slot = (arr: CardId[], i: number) => ({ get: () => arr[i], set: (c: CardId) => (arr[i] = c) });

  for (const p of t.players) {
    if (p.id === viewer) continue;
    p.hand.forEach((_, i) => bluffSlots.push(slot(p.hand, i)));
    p.abilities.forEach((_, i) => abilitySlots.push(slot(p.abilities, i)));
  }
  t.bluffDeck.forEach((_, i) => bluffSlots.push(slot(t.bluffDeck, i)));
  t.abilityDeck.forEach((_, i) => abilitySlots.push(slot(t.abilityDeck, i)));
  // Only the top of the ability discard is visible.
  t.abilityDiscard.slice(0, -1).forEach((_, i) => abilitySlots.push(slot(t.abilityDiscard, i)));
  for (const pile of t.piles) {
    pile.stack.forEach((pl, i) => {
      const isTop = i === pile.stack.length - 1;
      if (pl.faceUp) return;
      if (isTop && pl.owner === viewer) return; // viewer may see their own top card
      bluffSlots.push({ get: () => pl.card, set: (c) => (pl.card = c) });
    });
  }
  for (const slots of [bluffSlots, abilitySlots]) {
    const usable = slots.filter((x) => !pinned.has(x.get()));
    const cards = shuffleInPlace(rng, usable.map((x) => x.get()));
    usable.forEach((x, i) => x.set(cards[i]));
  }
  return t;
}

/** Card ids that appear anywhere in a JSON value. */
function idsIn(value: unknown, all: Set<string>): string[] {
  const found: string[] = [];
  JSON.stringify(value, (_k, v) => {
    if (typeof v === 'string' && all.has(v)) found.push(v);
    return v;
  });
  return found;
}

describe('player views never contain hidden information', () => {
  for (const players of [2, 3, 5]) {
    it(`${players} players: views are identical when every hidden card is re-dealt`, () => {
      let checked = 0;
      for (const seed of [1, 2, 3]) {
        let i = 0;
        for (const { state } of gameSteps(players, seed)) {
          i++;
          for (const p of state.players) {
            const a = toPlayerView(state, p.id);
            const b = toPlayerView(scrambleHidden(state, p.id, `scr-${seed}-${i}`), p.id);
            expect(b).toEqual(a);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(50);
    });
  }

  it('a player only ever receives card ids of cards they have held', () => {
    for (const seed of [11, 12]) {
      const known = new Map<PlayerId, Set<CardId>>();
      let allIds: Set<string> | null = null;
      for (const { state, events } of gameSteps(4, seed)) {
        allIds ??= new Set(Object.keys(state.cards));
        for (const p of state.players) {
          const k = known.get(p.id) ?? new Set();
          known.set(p.id, k);
          // Cards held now or ever before are known to this player.
          p.hand.forEach((c) => k.add(c));
          p.abilities.forEach((c) => k.add(c));
          const evs = events.map((e: GameEvent) => filterEvent(e, p.id));
          for (const e of evs) e.mine?.cards?.forEach((c) => k.add(c.id));
          for (const id of idsIn([toPlayerView(state, p.id), evs], allIds)) {
            expect(k.has(id), `${p.id} received unknown card id ${id}`).toBe(true);
          }
        }
      }
    }
  });

  it('events: secrets reach only their owners', () => {
    for (const { events, state } of gameSteps(3, 5)) {
      for (const e of events) {
        for (const p of state.players) {
          const f = filterEvent(e, p.id);
          expect('secret' in f).toBe(false);
          if (f.mine) expect(e.secret?.[p.id]).toBe(f.mine);
        }
        if (e.type === 'CHALLENGE' && e.matched) expect(e.challengerCardType).toBeUndefined();
        if (e.type === 'CARD_PLAYED' && !e.faceUp) expect(e.cardType).toBeUndefined();
      }
    }
  });

  it('face-down pile cards carry no type, except the viewer\'s own top cards', () => {
    for (const { state } of gameSteps(3, 9)) {
      for (const p of state.players) {
        for (const pile of toPlayerView(state, p.id).piles) {
          for (const c of pile.cards) {
            if (!c.faceUp) expect(c.type).toBeNull();
            if (c.ownType) {
              expect(c.owner).toBe(p.id);
              expect(c.isTop).toBe(true);
              expect(c.faceUp).toBe(false);
            }
            if (c.isTop && !c.faceUp && c.owner === p.id) expect(c.ownType).toBeDefined();
          }
        }
      }
    }
  });

  it('views contain no deck contents, rng state or other hands', () => {
    const { state } = createGame({ players: ['A', 'B'], seed: 'shape' });
    const v = toPlayerView(state, 'A');
    const json = JSON.stringify(v);
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('"key"');
    expect(json).not.toContain('bluffDeck"');
    for (const id of state.players[1].hand) expect(json).not.toContain(id);
    for (const id of state.bluffDeck) expect(json).not.toContain(id);
    expect(v.players.find((p) => p.id === 'B')).toEqual({ id: 'B', bluffCount: 7, abilityCount: 0 });
  });
});
