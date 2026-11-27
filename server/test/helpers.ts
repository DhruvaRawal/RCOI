import { type DeepPartial, type GameConfig, type GameUpdate, type RoomView, type SessionInfo, makeConfig } from '@rcoi/shared';
import { type Socket, io as connect } from 'socket.io-client';
import { type RcoiServer, createRcoiServer } from '../src/app';

export const FAST: DeepPartial<GameConfig> = {
  timers: { turnMs: 400, followUpMs: 300, revealHoldMs: 30, disconnectedGraceMs: 300, disconnectedTurnMs: 60, botMinMs: 5, botMaxMs: 20 },
};

export async function startServer(partial: DeepPartial<GameConfig> = FAST): Promise<{ server: RcoiServer; url: string }> {
  const server = createRcoiServer({ config: makeConfig(partial), staticDir: null });
  const port = await server.listen(0, '127.0.0.1');
  return { server, url: `http://127.0.0.1:${port}` };
}

/** A test client that records every message it receives. */
export class TestClient {
  socket: Socket;
  received: { event: string; payload: unknown }[] = [];
  room: RoomView | null = null;
  game: GameUpdate | null = null;
  session: SessionInfo | null = null;
  closedReason: string | null = null;
  private listeners: (() => void)[] = [];

  constructor(url: string) {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.onAny((event, payload) => {
      this.received.push({ event, payload });
      if (event === 'room:state') this.room = payload;
      if (event === 'game:update') this.game = payload;
      if (event === 'room:closed') this.closedReason = payload.reason;
      for (const l of this.listeners) l();
    });
  }

  async connected(): Promise<void> {
    if (this.socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', reject);
    });
  }

  request<T = any>(event: string, payload?: unknown): Promise<T> {
    return new Promise((resolve) => this.socket.emit(event, payload ?? {}, (res: T) => resolve(res)));
  }

  async create(name: string) {
    await this.connected();
    const res = await this.request('room:create', { name });
    if (res.ok) this.session = res.session;
    return res;
  }

  async join(code: string, name: string) {
    await this.connected();
    const res = await this.request('room:join', { code, name });
    if (res.ok) this.session = res.session;
    return res;
  }

  /** Resolve when the predicate holds (checked on every message). */
  waitFor(pred: () => boolean, timeoutMs = 5000, label = 'condition'): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== check);
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeoutMs);
      const check = () => {
        if (!pred()) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== check);
        resolve();
      };
      this.listeners.push(check);
    });
  }

  close() {
    this.socket.close();
  }
}

/** Create a room with n players; returns clients in seat order. */
export async function makeRoom(url: string, n: number): Promise<TestClient[]> {
  const host = new TestClient(url);
  const res = await host.create('Host');
  if (!res.ok) throw new Error(res.error);
  const clients = [host];
  for (let i = 1; i < n; i++) {
    const c = new TestClient(url);
    const r = await c.join(res.session.code, `P${i + 1}`);
    if (!r.ok) throw new Error(r.error);
    clients.push(c);
  }
  await host.waitFor(() => host.room?.seats.length === n, 2000, 'all seats');
  return clients;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
