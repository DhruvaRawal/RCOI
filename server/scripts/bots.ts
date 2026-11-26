/**
 * Fill seats in a room with simple random-move bots (for testing on your own).
 *
 *   npm run bots -- --room ABCDE --count 3 [--url http://localhost:3000] [--delay 1500]
 *
 * Bots connect over Socket.IO exactly like a browser, so they only ever see their own view.
 */
import { C2S, type GameUpdate, type RoomView, S2C } from '@rcoi/shared';
import { chooseBotAction, mulberry32 } from '@rcoi/shared/testing';
import { io } from 'socket.io-client';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const room = arg('room')?.toUpperCase();
const count = Number(arg('count', '1'));
const url = arg('url', 'http://localhost:3000')!;
const delay = Number(arg('delay', '1500'));
const NAMES = ['Bhima', 'Kunti', 'Vidura', 'Karna', 'Draupadi'];

if (!room) {
  console.error('Usage: npm run bots -- --room ABCDE --count 3 [--url http://localhost:3000] [--delay 1500]');
  process.exit(1);
}

for (let i = 0; i < count; i++) {
  const name = `${NAMES[i % NAMES.length]} (bot)`;
  const rand = mulberry32(Date.now() + i * 7919);
  const socket = io(url, { transports: ['websocket'] });
  let latest: GameUpdate | null = null;

  socket.on('connect', () => {
    socket.emit(C2S.join, { code: room, name }, (res: { ok: boolean; error?: string }) => {
      console.log(res.ok ? `${name} joined ${room}` : `${name} could not join: ${res.error}`);
      if (!res.ok) socket.close();
    });
  });
  socket.on(S2C.room, (r: RoomView) => {
    if (r.status === 'finished') console.log(`${name}: game finished`);
  });
  socket.on(S2C.game, (u: GameUpdate) => {
    latest = u;
    if (u.view.winner || !u.view.legal.awaiting) return;
    const wait = Math.max(0, u.holdUntil - u.serverNow) + delay * (0.6 + rand() * 0.8);
    setTimeout(() => {
      if (latest?.view.version !== u.view.version) return;
      const action = chooseBotAction(u.view.legal, rand);
      if (action) socket.emit(C2S.action, action, () => {});
    }, wait);
  });
  socket.on(S2C.kicked, () => socket.close());
}
