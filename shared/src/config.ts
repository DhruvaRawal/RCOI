/**
 * Every tunable value and ruling switch lives here.
 * The server passes a GameConfig into createGame(); the engine stores it in the state.
 */

export interface RulingsConfig {
  /** Ruling 1: who wins when the challenger card is the same type as a mismatched target. */
  tieWinner: 'target' | 'challenger';
  /** Ruling 2: Mahamantri exchanges ability cards too (false = bluffing cards only). */
  mahamantriExchangesAbilities: boolean;
  /** Ruling 3: how many bluffing cards Dandanayaka makes the target draw. */
  dandanayakaDrawCount: number;
  /** Ruling 4: with Chikitsaka, the challenger still draws an ability card. */
  chikitsakaChallengerDrawsAbility: boolean;
  /**
   * Ruling 4 (window): when the bluffer loses a challenge, when do we pause for their decision?
   * 'anyAbility'   - whenever they hold any ability card (the pause reveals nothing; user's choice)
   * 'holdersOnly'  - only when they hold a reaction card (faster, but the pause reveals they hold one)
   */
  reactionWindow: 'anyAbility' | 'holdersOnly';
  /** Ruling 6: a card uncovered when the top card is removed gets its meeple back (false = it stays unchallengeable). */
  uncoveredCardRegainsMeeple: boolean;
  /** Ruling 8: when the bluffing deck is empty, shuffle covered pile cards into a new deck. */
  reshuffleCoveredCards: boolean;
  /** Ruling 8: Dandanayaka is disabled (with a reason) when nothing at all can be drawn. */
  dandanayakaNeedsDrawableCards: boolean;
  /** A "give a card" step with only one possible card resolves automatically. */
  autoResolveForcedGive: boolean;
}

export interface TimerConfig {
  /** Ruling 11: per-turn timer. */
  turnMs: number;
  /** Ruling 11: follow-up choices (give a card, Chikitsaka). */
  followUpMs: number;
  /** How long everyone sees a challenge reveal before the next timer starts. */
  revealHoldMs: number;
  /** After this long disconnected, a player's timers drop to disconnectedTurnMs. */
  disconnectedGraceMs: number;
  /** Timer used for players who have been disconnected longer than the grace period. */
  disconnectedTurnMs: number;
}

export interface GameConfig {
  minPlayers: number;
  maxPlayers: number;
  /** Bluffing cards dealt to each player. */
  handSize: number;
  /** Open piles revealed at setup. */
  openPileCount: number;
  timers: TimerConfig;
  rulings: RulingsConfig;
}

export const DEFAULT_CONFIG: GameConfig = {
  minPlayers: 2,
  maxPlayers: 5,
  handSize: 7,
  openPileCount: 4,
  timers: {
    turnMs: 45_000,
    followUpMs: 20_000,
    revealHoldMs: 4_500,
    disconnectedGraceMs: 120_000,
    disconnectedTurnMs: 5_000,
  },
  rulings: {
    tieWinner: 'target',
    mahamantriExchangesAbilities: false,
    dandanayakaDrawCount: 2,
    chikitsakaChallengerDrawsAbility: true,
    reactionWindow: 'anyAbility',
    uncoveredCardRegainsMeeple: false,
    reshuffleCoveredCards: true,
    dandanayakaNeedsDrawableCards: true,
    autoResolveForcedGive: true,
  },
};

/** Room-level settings that are not part of the rules engine. */
export const ROOM_CONFIG = {
  roomCodeLength: 5,
  rejoinCodeLength: 6,
  /** A lobby seat whose player disconnected is freed after this long. */
  lobbySeatGraceMs: 30_000,
  /** A room with nobody connected is deleted after this long. */
  emptyRoomTtlMs: 10 * 60_000,
  maxNameLength: 16,
  defaultPort: 3000,
} as const;

/** Merge a partial config over the defaults (used by tests and the server). */
export function makeConfig(partial: DeepPartial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    timers: { ...DEFAULT_CONFIG.timers, ...(partial.timers ?? {}) },
    rulings: { ...DEFAULT_CONFIG.rulings, ...(partial.rulings ?? {}) },
  } as GameConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
