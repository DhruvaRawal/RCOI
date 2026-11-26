import {
  type GameConfig,
  type GameEvent,
  type GameState,
  type GameUpdate,
  type PlayerAction,
  type PlayerId,
  type TimerView,
  applyAction,
  applyTimeout,
  awaiting,
  createGame,
  filterEvents,
  toPlayerView,
} from '@rcoi/shared';

export interface SessionHost {
  /** Send a game update to one player (no-op if they are offline). */
  sendGame(playerId: PlayerId, update: GameUpdate): void;
  /** Milliseconds the player has been disconnected, or 0 if connected. */
  disconnectedFor(playerId: PlayerId): number;
  onGameOver(): void;
}

/**
 * Runs one game: owns the authoritative state, the timers and the per-player updates.
 * Every state change goes through the pure engine; this class only adds time.
 */
export class GameSession {
  state: GameState;
  timer: TimerView | null = null;
  /** Actions are refused until this time while a challenge reveal is shown. */
  holdUntil = 0;
  private history: GameEvent[] = [];
  private handle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private host: SessionHost,
    players: PlayerId[],
    private config: GameConfig,
    seed: string,
  ) {
    const { state, events } = createGame({ players, seed, config });
    this.state = state;
    this.commit(state, events);
  }

  get players(): PlayerId[] {
    return this.state.players.map((p) => p.id);
  }

  act(playerId: PlayerId, action: PlayerAction): { ok: true } | { ok: false; error: string } {
    if (this.stopped) return { ok: false, error: 'This game has ended.' };
    if (Date.now() < this.holdUntil) return { ok: false, error: 'Wait for the challenge reveal to finish.' };
    const r = applyAction(this.state, playerId, action);
    if (!r.ok) return { ok: false, error: r.error.message };
    this.commit(r.state, r.events);
    return { ok: true };
  }

  /** Called when a player reconnects: full view plus their filtered history (for the log). */
  sendSnapshot(playerId: PlayerId): void {
    this.host.sendGame(playerId, this.updateFor(playerId, filterEvents(this.history, playerId), true));
  }

  /** A disconnected player's grace period may have ended: shorten their running timer. */
  refreshTimer(): void {
    if (this.stopped || !this.timer) return;
    const now = Date.now();
    const shortDeadline = this.shortDeadline(this.timer.player, Math.max(now, this.timer.startsAt));
    if (shortDeadline !== null && shortDeadline < this.timer.deadline) {
      this.timer = { ...this.timer, deadline: shortDeadline };
      this.arm();
      this.broadcast([]);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
    this.timer = null;
  }

  // -------------------------------------------------------------------------

  private commit(state: GameState, events: GameEvent[]): void {
    this.state = state;
    this.history.push(...events);
    const now = Date.now();
    const revealed = events.some((e) => e.type === 'CHALLENGE');
    if (revealed) this.holdUntil = now + this.config.timers.revealHoldMs;
    this.schedule(Math.max(now, this.holdUntil));
    this.broadcast(events);
    if (state.winner) {
      this.stop();
      this.host.onGameOver();
    }
  }

  private schedule(startsAt: number): void {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
    const aw = awaiting(this.state);
    if (!aw) {
      this.timer = null;
      return;
    }
    const t = this.config.timers;
    const base = aw.kind === 'turn' ? t.turnMs : t.followUpMs;
    let deadline = startsAt + base;
    const short = this.shortDeadline(aw.player, startsAt);
    if (short !== null) deadline = Math.min(deadline, short);
    this.timer = { player: aw.player, kind: aw.kind, startsAt, deadline };
    this.arm();
  }

  /** Deadline for a player who has been disconnected longer than the grace period, else null. */
  private shortDeadline(playerId: PlayerId, from: number): number | null {
    const t = this.config.timers;
    const gone = this.host.disconnectedFor(playerId);
    return gone >= t.disconnectedGraceMs ? from + t.disconnectedTurnMs : null;
  }

  private arm(): void {
    if (this.handle) clearTimeout(this.handle);
    if (!this.timer) return;
    const version = this.state.version;
    this.handle = setTimeout(() => this.fire(version), Math.max(0, this.timer.deadline - Date.now()));
  }

  private fire(version: number): void {
    this.handle = null;
    if (this.stopped || this.state.version !== version) return;
    const r = applyTimeout(this.state);
    if (!r.ok) return;
    this.commit(r.state, r.events);
  }

  private broadcast(events: GameEvent[]): void {
    for (const id of this.players) this.host.sendGame(id, this.updateFor(id, filterEvents(events, id), false));
  }

  private updateFor(playerId: PlayerId, events: GameUpdate['events'], snapshot: boolean): GameUpdate {
    return {
      view: toPlayerView(this.state, playerId),
      events,
      timer: this.timer,
      serverNow: Date.now(),
      holdUntil: this.holdUntil,
      snapshot,
    };
  }
}
