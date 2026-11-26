import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../src/engine/invariants';
import { awaiting, getLegalActions } from '../src/engine/legal';
import { applyAction, applyTimeout } from '../src/engine/reducer';
import { createGame } from '../src/engine/setup';
import type { GameState, PlayerAction, PlayerId } from '../src/engine/types';
import { chooseBotAction, mulberry32 } from '../src/testing/bot';

type Step = { kind: 'action'; player: PlayerId; action: PlayerAction } | { kind: 'timeout' };

/** Play a whole game with random legal moves and occasional timeouts. */
export function playRandomGame(players: number, seed: number, maxSteps = 4000) {
  const ids = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  let { state } = createGame({ players: ids, seed: `fuzz-${players}-${seed}` });
  const rand = mulberry32(seed * 7919 + players);
  const steps: Step[] = [];
  assertInvariants(state);
  for (let i = 0; i < maxSteps && !state.winner; i++) {
    const aw = awaiting(state)!;
    let step: Step;
    if (rand() < 0.05) step = { kind: 'timeout' };
    else {
      const action = chooseBotAction(getLegalActions(state, aw.player), rand);
      step = action ? { kind: 'action', player: aw.player, action } : { kind: 'timeout' };
    }
    const r = step.kind === 'timeout' ? applyTimeout(state) : applyAction(state, step.player, step.action);
    if (!r.ok) throw new Error(`Legal move rejected at step ${i}: ${r.error.code} ${r.error.message}`);
    assertInvariants(r.state);
    // No other player may act while someone else is awaited.
    for (const id of ids) {
      if (id !== awaiting(r.state)?.player && !r.state.winner) {
        expect(getLegalActions(r.state, id).awaiting).toBeNull();
      }
    }
    steps.push(step);
    state = r.state;
  }
  return { state, steps, ids };
}

function replay(players: number, seed: number, steps: Step[]): GameState {
  const ids = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  let { state } = createGame({ players: ids, seed: `fuzz-${players}-${seed}` });
  for (const st of steps) {
    const r = st.kind === 'timeout' ? applyTimeout(state) : applyAction(state, st.player, st.action);
    if (!r.ok) throw new Error('replay diverged');
    state = r.state;
  }
  return state;
}

describe('random full games (card conservation and invariants after every step)', () => {
  for (const players of [2, 3, 4, 5]) {
    it(`${players} players x 60 games`, () => {
      let finished = 0;
      const reasons = new Map<string, number>();
      for (let seed = 1; seed <= 60; seed++) {
        const { state } = playRandomGame(players, seed);
        if (state.winner) {
          finished++;
          reasons.set(state.winner.reason, (reasons.get(state.winner.reason) ?? 0) + 1);
        }
      }
      expect(finished).toBe(60);
      expect(reasons.size).toBeGreaterThan(0);
    });
  }

  it('random games exercise every mechanic', () => {
    const seen = new Set<string>();
    // Half the games use challenge-heavy bots so games run long enough to empty both decks.
    const styles = [undefined, { play: 2, challenge: 8, draw: 1, ability: 1 }];
    for (const players of [2, 3, 4, 5]) {
      for (let seed = 1; seed <= 40; seed++) {
        const style = styles[seed % 2];
        const ids = Array.from({ length: players }, (_, i) => `P${i + 1}`);
        let { state } = createGame({ players: ids, seed: `cov-${players}-${seed}` });
        const rand = mulberry32(seed);
        for (let i = 0; i < 4000 && !state.winner; i++) {
          const aw = awaiting(state)!;
          const action = rand() < 0.05 ? null : chooseBotAction(getLegalActions(state, aw.player), rand, style);
          const r = action ? applyAction(state, aw.player, action) : applyTimeout(state);
          if (!r.ok) throw new Error(r.error.message);
          for (const e of r.events) {
            seen.add(e.type);
            if (e.type === 'ABILITY_USED') seen.add(`ability:${e.ability}`);
            if (e.type === 'CHALLENGE') seen.add(`challenge:${e.reason}`);
            if (e.type === 'GAME_WON') seen.add(`win:${e.reason}`);
            if (e.type === 'TIMED_OUT') seen.add(`timeout:${e.decision}`);
          }
          state = r.state;
        }
      }
    }
    for (const k of [
      'BLUFF_DECK_RESHUFFLED',
      'ABILITY_DECK_RESHUFFLED',
      'HANDS_EXCHANGED',
      'PILE_CREATED',
      'CARD_TAKEN_BACK',
      'REACTION_DECLINED',
      'ability:CHIKITSAKA',
      'ability:MAHAMANTRI',
      'ability:DANDANAYAKA',
      'ability:RAJ_BHANDARI',
      'challenge:MATCHED',
      'challenge:BEATS',
      'challenge:TIE',
      'challenge:DOES_NOT_BEAT',
      'win:LAST_CARD_PLAYED',
      'win:GAVE_LAST_CARD',
      'timeout:turn',
      'timeout:give',
      'timeout:reaction',
    ]) {
      expect(seen, k).toContain(k);
    }
  });

  it('is deterministic: replaying the same actions gives the same state', () => {
    const { state, steps } = playRandomGame(4, 42);
    expect(replay(4, 42, steps)).toEqual(state);
  });

  it('never mutates the input state', () => {
    const { state } = createGame({ players: ['A', 'B', 'C'], seed: 'immut' });
    const frozen = JSON.stringify(state);
    const legal = getLegalActions(state, state.currentPlayer);
    applyAction(state, state.currentPlayer, chooseBotAction(legal, mulberry32(1))!);
    applyTimeout(state);
    expect(JSON.stringify(state)).toBe(frozen);
  });
});
