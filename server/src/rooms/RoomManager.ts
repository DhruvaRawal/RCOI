import { type GameConfig, ROOM_CONFIG } from '@rcoi/shared';
import { randomCode } from './identity';
import { Room, type Seat } from './Room';

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(
    private config: GameConfig,
    private emit: (socketId: string, event: string, payload: unknown) => void,
  ) {}

  create(): Room {
    let code: string;
    do code = randomCode(ROOM_CONFIG.roomCodeLength);
    while (this.rooms.has(code));
    const room = new Room(code, {
      config: this.config,
      emit: this.emit,
      onDispose: (r) => this.rooms.delete(r.code),
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  findByToken(token: string): { room: Room; seat: Seat } | null {
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s.token === token);
      if (seat) return { room, seat };
    }
    return null;
  }

  findByRejoinCode(code: string, rejoinCode: string): { room: Room; seat: Seat } | null {
    const room = this.get(code);
    const seat = room?.seats.find((s) => s.rejoinCode === rejoinCode.trim().toUpperCase());
    return room && seat ? { room, seat } : null;
  }

  get size(): number {
    return this.rooms.size;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.dispose();
  }
}
