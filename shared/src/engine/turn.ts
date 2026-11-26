import type { Ctx } from './context';
import { hasAnyTurnAction } from './legal';

/**
 * Pass the turn clockwise. A player with no legal action is skipped automatically (ruling 8).
 * With the standard card counts at least one player can always act; the guard catches config mistakes.
 */
export function endTurn(ctx: Ctx): void {
  const s = ctx.s;
  if (s.winner) return;
  s.pending = null;
  let idx = s.players.findIndex((p) => p.id === s.currentPlayer);
  for (let i = 0; i < s.players.length; i++) {
    idx = (idx + 1) % s.players.length;
    s.currentPlayer = s.players[idx].id;
    s.turn++;
    ctx.emit({ type: 'TURN_STARTED', player: s.currentPlayer });
    if (hasAnyTurnAction(s, s.currentPlayer)) return;
    ctx.emit({ type: 'TURN_PASSED', player: s.currentPlayer, reason: 'noLegalAction' });
  }
  throw new Error('Invariant: no player has any legal action');
}
