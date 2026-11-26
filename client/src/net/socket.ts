import type { Ack } from '@rcoi/shared';
import { type Socket, io } from 'socket.io-client';

/** One socket for the whole app. Same origin: Vite proxies /socket.io in dev. */
export const socket: Socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

export function request<T = object>(event: string, payload: unknown = {}, timeoutMs = 8000): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: 'Not connected to the server.' });
      return;
    }
    socket.timeout(timeoutMs).emit(event, payload, (err: unknown, res: Ack<T>) => {
      if (err) resolve({ ok: false, error: 'The server did not respond.' });
      else resolve(res);
    });
  });
}

/** Per-tab session storage, so several tabs on one machine are separate players. */
const KEY = 'rcoi.session';
export const sessionStore = {
  load(): { token: string; code: string } | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(v: { token: string; code: string }) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* private mode: resume just won't survive a reload */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Remembered display name (per browser, convenience only). */
export const nameStore = {
  load(): string {
    try {
      return localStorage.getItem('rcoi.name') ?? '';
    } catch {
      return '';
    }
  },
  save(name: string) {
    try {
      localStorage.setItem('rcoi.name', name);
    } catch {
      /* ignore */
    }
  },
};
