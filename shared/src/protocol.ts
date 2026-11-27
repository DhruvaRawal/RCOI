/**
 * Network protocol shared by server and client.
 * Client -> server payload schemas live in schemas.ts (server only), so zod stays out of the client bundle.
 */
import type { BotDifficulty } from './bots/strategy';
import type { PlayerId, VisibleEvent } from './engine/types';
import type { PlayerView } from './engine/view';

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

export const C2S = {
  create: 'room:create',
  join: 'room:join',
  resume: 'room:resume',
  leave: 'room:leave',
  start: 'room:start',
  rematch: 'room:rematch',
  endGame: 'room:end',
  action: 'game:action',
  addBot: 'room:addBot',
  removeBot: 'room:removeBot',
  setBotDifficulty: 'room:botDifficulty',
} as const;

export const S2C = {
  room: 'room:state',
  game: 'game:update',
  kicked: 'room:closed',
} as const;

// ---------------------------------------------------------------------------
// Server -> client payloads
// ---------------------------------------------------------------------------

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface SessionInfo {
  code: string;
  playerId: PlayerId;
  /** Secret: lets this browser tab resume its seat. */
  token: string;
  /** Short secret code to move this seat to another device. */
  rejoinCode: string;
}

export interface SeatView {
  playerId: PlayerId;
  name: string;
  color: string;
  avatar: number;
  connected: boolean;
  isHost: boolean;
  /** Set for computer players (server-side bots). */
  bot: BotDifficulty | null;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomView {
  code: string;
  status: RoomStatus;
  hostId: PlayerId;
  seats: SeatView[];
  you: PlayerId;
  minPlayers: number;
  maxPlayers: number;
  /** Set when the host ended the game without a winner. */
  endedByHost: boolean;
}

export interface TimerView {
  player: PlayerId;
  kind: 'turn' | 'give' | 'reaction';
  /** Server time (ms) when the countdown starts (after any reveal hold). */
  startsAt: number;
  deadline: number;
}

export interface GameUpdate {
  view: PlayerView;
  /** Events since the previous update, filtered for this player. */
  events: VisibleEvent[];
  timer: TimerView | null;
  /** Server time when this update was sent (for clock-offset correction). */
  serverNow: number;
  /** Actions are refused until this server time (challenge reveal hold). */
  holdUntil: number;
  /** True for the first update after (re)joining: the client should not animate history. */
  snapshot: boolean;
}
