import { type Ack, C2S, type PlayerId, S2C, type SessionInfo } from '@rcoi/shared';
import {
  BotDifficultySchema,
  BotTargetSchema,
  CreateRoomSchema,
  JoinRoomSchema,
  PlayerActionSchema,
  ResumeSchema,
} from '@rcoi/shared/schemas';
import type { Server, Socket } from 'socket.io';
import type { Room, Seat } from '../rooms/Room';
import type { RoomManager } from '../rooms/RoomManager';

type AckFn<T = object> = (res: Ack<T>) => void;

/** Failed rejoin-code attempts allowed per socket (stops brute-forcing someone's seat). */
const MAX_RESUME_FAILURES = 8;

export function registerHandlers(io: Server, rooms: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    let bound: { room: Room; playerId: PlayerId } | null = null;
    let resumeFailures = 0;

    const safeAck = (ack: unknown): AckFn<any> => (typeof ack === 'function' ? (ack as AckFn<any>) : () => {});

    const bind = (room: Room, seat: Seat) => {
      unbind();
      bound = { room, playerId: seat.playerId };
      const replaced = room.connect(seat, socket.id);
      if (replaced) {
        // The same seat was opened somewhere else: the old tab is disconnected.
        io.to(replaced).emit(S2C.kicked, { reason: 'This seat was opened in another tab or device.' });
        io.in(replaced).disconnectSockets(true);
      }
    };

    const unbind = () => {
      if (!bound) return;
      bound.room.disconnect(bound.playerId, socket.id);
      bound = null;
    };

    socket.on(C2S.create, (payload: unknown, ack: unknown) => {
      const reply = safeAck(ack) as AckFn<{ session: SessionInfo }>;
      const p = CreateRoomSchema.safeParse(payload);
      if (!p.success) return reply({ ok: false, error: p.error.issues[0]?.message ?? 'Invalid name.' });
      const room = rooms.create();
      const seat = room.addSeat(p.data.name);
      if (typeof seat === 'string') return reply({ ok: false, error: seat });
      reply({ ok: true, session: room.sessionInfo(seat) });
      bind(room, seat);
    });

    socket.on(C2S.join, (payload: unknown, ack: unknown) => {
      const reply = safeAck(ack) as AckFn<{ session: SessionInfo }>;
      const p = JoinRoomSchema.safeParse(payload);
      if (!p.success) return reply({ ok: false, error: p.error.issues[0]?.message ?? 'Invalid request.' });
      const room = rooms.get(p.data.code);
      if (!room) return reply({ ok: false, error: 'No room with that code.' });
      const seat = room.addSeat(p.data.name);
      if (typeof seat === 'string') return reply({ ok: false, error: seat });
      reply({ ok: true, session: room.sessionInfo(seat) });
      bind(room, seat);
    });

    socket.on(C2S.resume, (payload: unknown, ack: unknown) => {
      const reply = safeAck(ack) as AckFn<{ session: SessionInfo }>;
      if (resumeFailures >= MAX_RESUME_FAILURES) return reply({ ok: false, error: 'Too many attempts.' });
      const p = ResumeSchema.safeParse(payload);
      if (!p.success) return reply({ ok: false, error: 'Invalid request.' });
      const found =
        'token' in p.data ? rooms.findByToken(p.data.token) : rooms.findByRejoinCode(p.data.code, p.data.rejoinCode);
      if (!found) {
        if (!('token' in p.data)) resumeFailures++;
        return reply({ ok: false, error: 'That seat could not be found.' });
      }
      reply({ ok: true, session: found.room.sessionInfo(found.seat) });
      bind(found.room, found.seat);
    });

    socket.on(C2S.leave, (_payload: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      if (bound) {
        const { room, playerId } = bound;
        bound = null;
        room.leave(playerId);
      }
      reply({ ok: true });
    });

    const hostCommand = (fn: (room: Room, playerId: PlayerId) => string | null) => (_p: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      if (!bound) return reply({ ok: false, error: 'You are not in a room.' });
      const err = fn(bound.room, bound.playerId);
      reply(err ? { ok: false, error: err } : { ok: true });
    };
    socket.on(C2S.start, hostCommand((room, id) => room.start(id)));
    socket.on(C2S.rematch, hostCommand((room, id) => room.rematch(id)));
    socket.on(C2S.endGame, hostCommand((room, id) => room.endGame(id)));

    // Bots (host only; the room enforces it).
    socket.on(C2S.addBot, hostCommand((room, id) => room.addBot(id)));
    socket.on(C2S.removeBot, (payload: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const p = BotTargetSchema.safeParse(payload);
      if (!bound) return reply({ ok: false, error: 'You are not in a room.' });
      if (!p.success) return reply({ ok: false, error: 'Invalid request.' });
      const err = bound.room.removeBot(bound.playerId, p.data.playerId);
      reply(err ? { ok: false, error: err } : { ok: true });
    });
    socket.on(C2S.setBotDifficulty, (payload: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      const p = BotDifficultySchema.safeParse(payload);
      if (!bound) return reply({ ok: false, error: 'You are not in a room.' });
      if (!p.success) return reply({ ok: false, error: 'Invalid request.' });
      const err = bound.room.setBotDifficulty(bound.playerId, p.data.playerId, p.data.difficulty);
      reply(err ? { ok: false, error: err } : { ok: true });
    });

    socket.on(C2S.action, (payload: unknown, ack: unknown) => {
      const reply = safeAck(ack);
      if (!bound?.room.session || bound.room.status !== 'playing') {
        return reply({ ok: false, error: 'No game is running.' });
      }
      const p = PlayerActionSchema.safeParse(payload);
      if (!p.success) return reply({ ok: false, error: 'Invalid action.' });
      reply(bound.room.session.act(bound.playerId, p.data));
    });

    socket.on('disconnect', () => unbind());
  });
}
