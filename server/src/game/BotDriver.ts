import {
  type BotDifficulty,
  type BotMemory,
  type GameConfig,
  type GameEvent,
  type PlayerId,
  awaiting,
  decideBotAction,
  filterEvents,
  newBotMemory,
  observeEvents,
  toPlayerView,
} from '@rcoi/shared';
import { chooseBotAction } from '@rcoi/shared/testing';
import type { GameSession } from './GameSession';

/**
 * Plays for the bot seats of one game. A bot only ever sees toPlayerView(state, bot) and its own
 * filtered events - the same information a human in that seat gets - and acts through
 * GameSession.act like any player, so all normal validation, timers and reveal holds apply.
 */
export class BotDriver {
  private memories = new Map<PlayerId, BotMemory>();
  private handle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private session: GameSession,
    /** Current difficulty of each bot seat (read live). */
    private bots: () => Map<PlayerId, BotDifficulty>,
    private config: GameConfig,
  ) {}

  /** Feed new events to each bot's memory, then schedule the next bot move if a bot is awaited. */
  onCommit(events: GameEvent[]): void {
    for (const id of this.bots().keys()) {
      const memory = this.memories.get(id) ?? newBotMemory();
      this.memories.set(id, memory);
      observeEvents(memory, filterEvents(events, id), id);
    }
    this.tick();
  }

  tick(): void {
    if (this.stopped) return;
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
    const aw = awaiting(this.session.state);
    if (!aw || !this.bots().has(aw.player)) return;
    const { botMinMs, botMaxMs } = this.config.timers;
    const think = botMinMs + Math.random() * Math.max(0, botMaxMs - botMinMs);
    const wait = Math.max(think, this.session.holdUntil - Date.now() + 150);
    const version = this.session.state.version;
    this.handle = setTimeout(() => this.act(aw.player, version), wait);
  }

  stop(): void {
    this.stopped = true;
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
  }

  private act(id: PlayerId, version: number): void {
    this.handle = null;
    if (this.stopped || this.session.state.version !== version) return;
    const level = this.bots().get(id);
    if (!level) return;
    const memory = this.memories.get(id) ?? newBotMemory();
    this.memories.set(id, memory);
    const view = toPlayerView(this.session.state, id);
    const action = decideBotAction(view, level, memory, Math.random);
    if (action && this.session.act(id, action).ok) return;
    // Should not happen; fall back to any legal move. If even that fails, the turn timer takes over.
    const fallback = chooseBotAction(view.legal, Math.random);
    if (fallback && this.session.act(id, fallback).ok) return;
    if (this.session.state.version === version) this.handle = setTimeout(() => this.tick(), 500);
  }
}
