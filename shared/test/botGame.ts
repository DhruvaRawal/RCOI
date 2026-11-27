import { type BotDifficulty, decideBotAction, newBotMemory, observeEvents } from '../src/bots/strategy';
import { assertInvariants } from '../src/engine/invariants';
import { awaiting } from '../src/engine/legal';
import { applyAction, applyTimeout } from '../src/engine/reducer';
import { createGame } from '../src/engine/setup';
import type { GameEvent } from '../src/engine/types';
import { filterEvents, toPlayerView } from '../src/engine/view';
import { mulberry32 } from '../src/testing/bot';

/** Play a whole game where every seat is a bot that only sees its own view. Returns the winner's index. */
export function botGame(levels: BotDifficulty[], seed: number): { winner: number | null; steps: number } {
  const ids = levels.map((_, i) => `B${i}`);
  const g = createGame({ players: ids, seed: `bots-${seed}` });
  let state = g.state;
  const memories = ids.map(() => newBotMemory());
  const feed = (events: GameEvent[]) => ids.forEach((id, i) => observeEvents(memories[i], filterEvents(events, id), id));
  feed(g.events);
  const rand = mulberry32(seed);
  let steps = 0;
  for (; steps < 3000 && !state.winner; steps++) {
    const aw = awaiting(state)!;
    const i = ids.indexOf(aw.player);
    const action = decideBotAction(toPlayerView(state, aw.player), levels[i], memories[i], rand);
    const r = action ? applyAction(state, aw.player, action) : applyTimeout(state);
    if (!r.ok) throw new Error(`${levels[i]} bot made an illegal move: ${r.error.message} (${JSON.stringify(action)})`);
    assertInvariants(r.state);
    feed(r.events);
    state = r.state;
  }
  return { winner: state.winner ? ids.indexOf(state.winner.player) : null, steps };
}

