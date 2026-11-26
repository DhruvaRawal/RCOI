import {
  AVATAR_COUNT,
  type GameConfig,
  type GameUpdate,
  PLAYER_COLORS,
  type PlayerId,
  ROOM_CONFIG,
  type RoomStatus,
  type RoomView,
  S2C,
  type SessionInfo,
} from '@rcoi/shared';
import { GameSession } from '../game/GameSession';
import { randomCode, randomPlayerId, randomSeed, randomToken, shuffled } from './identity';

export interface Seat {
  playerId: PlayerId;
  name: string;
  token: string;
  rejoinCode: string;
  color: string;
  avatar: number;
  socketId: string | null;
  disconnectedAt: number | null;
}

export interface RoomDeps {
  config: GameConfig;
  /** Deliver a message to one socket. */
  emit(socketId: string, event: string, payload: unknown): void;
  /** Called when the room has had nobody connected for a while, or no seats at all. */
  onDispose(room: Room): void;
}

export class Room {
  hostId: PlayerId = '';
  seats: Seat[] = [];
  status: RoomStatus = 'lobby';
  session: GameSession | null = null;
  endedByHost = false;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    readonly code: string,
    private deps: RoomDeps,
  ) {}

  // ---------------------------------------------------------------------------
  // Seats
  // ---------------------------------------------------------------------------

  addSeat(name: string): Seat | string {
    if (this.status === 'playing') return 'This game has already started.';
    if (this.seats.length >= this.deps.config.maxPlayers) return 'This room is full.';
    const clean = name.trim();
    if (this.seats.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
      return 'Someone in this room already uses that name.';
    }
    const usedColors = new Set(this.seats.map((s) => s.color));
    const usedAvatars = new Set(this.seats.map((s) => s.avatar));
    const seat: Seat = {
      playerId: randomPlayerId(),
      name: clean,
      token: randomToken(),
      rejoinCode: randomCode(ROOM_CONFIG.rejoinCodeLength),
      color: PLAYER_COLORS.find((c) => !usedColors.has(c.hex))!.hex,
      avatar: shuffled(Array.from({ length: AVATAR_COUNT }, (_, i) => i)).find((a) => !usedAvatars.has(a))!,
      socketId: null,
      disconnectedAt: Date.now(),
    };
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.playerId;
    return seat;
  }

  seat(playerId: PlayerId): Seat | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  sessionInfo(seat: Seat): SessionInfo {
    return { code: this.code, playerId: seat.playerId, token: seat.token, rejoinCode: seat.rejoinCode };
  }

  /** Bind a socket to a seat. Returns the socket id that was replaced, if any. */
  connect(seat: Seat, socketId: string): string | null {
    const previous = seat.socketId && seat.socketId !== socketId ? seat.socketId : null;
    seat.socketId = socketId;
    seat.disconnectedAt = null;
    this.clearTimer(`seat:${seat.playerId}`);
    this.clearTimer('dispose');
    this.broadcastRoom();
    if (this.session) this.session.sendSnapshot(seat.playerId);
    return previous;
  }

  disconnect(playerId: PlayerId, socketId: string): void {
    const seat = this.seat(playerId);
    if (!seat || seat.socketId !== socketId) return;
    seat.socketId = null;
    seat.disconnectedAt = Date.now();
    const { lobbySeatGraceMs, emptyRoomTtlMs } = ROOM_CONFIG;
    if (this.status === 'playing') {
      // After the grace period: shorten their timers and hand the host role on.
      this.setTimer(`seat:${playerId}`, this.deps.config.timers.disconnectedGraceMs, () => {
        this.session?.refreshTimer();
        if (this.hostId === playerId) this.transferHost();
        this.broadcastRoom();
      });
    } else {
      this.setTimer(`seat:${playerId}`, lobbySeatGraceMs, () => this.removeSeat(playerId));
    }
    if (this.seats.every((s) => !s.socketId)) {
      this.setTimer('dispose', emptyRoomTtlMs, () => this.dispose());
    }
    this.broadcastRoom();
  }

  /** Leaving the lobby or the winner screen frees the seat. During a game the seat stays. */
  leave(playerId: PlayerId): void {
    const seat = this.seat(playerId);
    if (!seat) return;
    if (this.status === 'playing') {
      if (seat.socketId) this.disconnect(playerId, seat.socketId);
      return;
    }
    this.removeSeat(playerId);
  }

  private removeSeat(playerId: PlayerId): void {
    this.clearTimer(`seat:${playerId}`);
    this.seats = this.seats.filter((s) => s.playerId !== playerId);
    if (this.seats.length === 0) return this.dispose();
    if (this.hostId === playerId) this.transferHost();
    this.broadcastRoom();
  }

  private transferHost(): void {
    const next = this.seats.find((s) => s.socketId) ?? this.seats[0];
    if (next) this.hostId = next.playerId;
  }

  // ---------------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------------

  start(by: PlayerId): string | null {
    if (by !== this.hostId) return 'Only the host can start the game.';
    if (this.status === 'playing') return 'The game is already running.';
    const { minPlayers, maxPlayers } = this.deps.config;
    if (this.seats.length < minPlayers || this.seats.length > maxPlayers) {
      return `You need ${minPlayers}-${maxPlayers} players to start.`;
    }
    this.session?.stop();
    this.status = 'playing';
    this.endedByHost = false;
    this.broadcastRoom();
    this.session = new GameSession(
      {
        sendGame: (id, update) => this.sendGame(id, update),
        disconnectedFor: (id) => {
          const at = this.seat(id)?.disconnectedAt;
          return at ? Date.now() - at : 0;
        },
        onGameOver: () => {
          this.status = 'finished';
          this.broadcastRoom();
        },
      },
      this.seats.map((s) => s.playerId),
      this.deps.config,
      randomSeed(),
    );
    return null;
  }

  rematch(by: PlayerId): string | null {
    if (this.status !== 'finished') return 'The game is still running.';
    return this.start(by);
  }

  endGame(by: PlayerId): string | null {
    if (by !== this.hostId) return 'Only the host can end the game.';
    if (this.status !== 'playing') return 'No game is running.';
    this.session?.stop();
    this.status = 'finished';
    this.endedByHost = true;
    this.broadcastRoom();
    return null;
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  viewFor(playerId: PlayerId): RoomView {
    const { minPlayers, maxPlayers } = this.deps.config;
    return {
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      you: playerId,
      minPlayers,
      maxPlayers,
      endedByHost: this.endedByHost,
      seats: this.seats.map((s) => ({
        playerId: s.playerId,
        name: s.name,
        color: s.color,
        avatar: s.avatar,
        connected: !!s.socketId,
        isHost: s.playerId === this.hostId,
      })),
    };
  }

  broadcastRoom(): void {
    for (const s of this.seats) if (s.socketId) this.deps.emit(s.socketId, S2C.room, this.viewFor(s.playerId));
  }

  private sendGame(playerId: PlayerId, update: GameUpdate): void {
    const seat = this.seat(playerId);
    if (seat?.socketId) this.deps.emit(seat.socketId, S2C.game, update);
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.session?.stop();
    for (const s of this.seats) if (s.socketId) this.deps.emit(s.socketId, S2C.kicked, { reason: 'The room was closed.' });
    this.deps.onDispose(this);
  }

  private setTimer(key: string, ms: number, fn: () => void): void {
    this.clearTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        fn();
      }, ms),
    );
  }

  private clearTimer(key: string): void {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }
}
