import { expect } from 'vitest';
import { applyAction, applyTimeout } from '../src/engine/reducer';
import { assertInvariants } from '../src/engine/invariants';
import type { GameEvent, GameState, PlayerAction, PlayerId } from '../src/engine/types';

/** Apply an action that must succeed; checks invariants. */
export function act(s: GameState, player: PlayerId, action: PlayerAction): { state: GameState; events: GameEvent[] } {
  const r = applyAction(s, player, action);
  if (!r.ok) throw new Error(`Expected ${action.type} by ${player} to succeed: ${r.error.code} ${r.error.message}`);
  assertInvariants(r.state);
  return r;
}

/** Apply an action that must be rejected; returns the error code. */
export function reject(s: GameState, player: PlayerId, action: PlayerAction): string {
  const before = JSON.stringify(s);
  const r = applyAction(s, player, action);
  expect(r.ok, `Expected ${action.type} by ${player} to be rejected`).toBe(false);
  expect(JSON.stringify(s)).toBe(before); // input state never mutated
  return r.ok ? '' : r.error.code;
}

export function timeout(s: GameState): { state: GameState; events: GameEvent[] } {
  const r = applyTimeout(s);
  if (!r.ok) throw new Error(`Timeout failed: ${r.error.message}`);
  assertInvariants(r.state);
  return r;
}

export function player(s: GameState, id: PlayerId) {
  return s.players.find((p) => p.id === id)!;
}

export function pile(s: GameState, id: string) {
  return s.piles.find((p) => p.id === id)!;
}

export function top(s: GameState, pileId: string) {
  const p = pile(s, pileId);
  return p.stack[p.stack.length - 1];
}

export function eventTypes(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}
