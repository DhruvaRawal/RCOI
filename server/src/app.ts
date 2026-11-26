import { existsSync } from 'node:fs';
import { type Server as HttpServer, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { DEFAULT_CONFIG, type GameConfig } from '@rcoi/shared';
import express from 'express';
import { Server } from 'socket.io';
import { registerHandlers } from './net/handlers';
import { RoomManager } from './rooms/RoomManager';

export interface RcoiServerOptions {
  config?: GameConfig;
  /** Folder with the built client (client/dist). Served with an SPA fallback when it exists. */
  staticDir?: string | null;
}

export interface RcoiServer {
  httpServer: HttpServer;
  io: Server;
  rooms: RoomManager;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export function createRcoiServer(opts: RcoiServerOptions = {}): RcoiServer {
  const app = express();
  const httpServer = createServer(app);
  // Same-origin in production; the Vite dev server proxies /socket.io, so no CORS is needed.
  const io = new Server(httpServer, { serveClient: false });
  const rooms = new RoomManager(opts.config ?? DEFAULT_CONFIG, (socketId, event, payload) =>
    io.to(socketId).emit(event, payload),
  );
  registerHandlers(io, rooms);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });
  const dir = opts.staticDir;
  if (dir && existsSync(path.join(dir, 'index.html'))) {
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  }

  return {
    httpServer,
    io,
    rooms,
    listen: (port, host = '0.0.0.0') =>
      new Promise((resolve) => {
        httpServer.listen(port, host, () => resolve((httpServer.address() as AddressInfo).port));
      }),
    close: async () => {
      rooms.closeAll();
      await io.close();
    },
  };
}
