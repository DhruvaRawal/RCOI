import { afterEach, describe, expect, it } from 'vitest';
import type { RcoiServer } from '../src/app';
import { TestClient, makeRoom, sleep, startServer } from './helpers';

let server: RcoiServer;
let clients: TestClient[] = [];

afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
});

async function setup(n: number) {
  const s = await startServer();
  server = s.server;
  clients = await makeRoom(s.url, n);
  return s.url;
}

describe('rooms and lobby', () => {
  it('creates a room with a code; others join; seats get unique colours and avatars', async () => {
    await setup(5);
    const room = clients[0].room!;
    expect(room.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(room.seats).toHaveLength(5);
    expect(new Set(room.seats.map((s) => s.color)).size).toBe(5);
    expect(new Set(room.seats.map((s) => s.avatar)).size).toBe(5);
    expect(room.seats[0].isHost).toBe(true);
    // The room view never contains other players' secrets.
    const json = JSON.stringify(clients[1].received);
    for (const c of clients) {
      if (c === clients[1]) continue;
      expect(json).not.toContain(c.session!.token);
      expect(json).not.toContain(c.session!.rejoinCode);
    }
  });

  it('refuses a 6th player, duplicate names and unknown codes', async () => {
    const url = await setup(5);
    const sixth = new TestClient(url);
    clients.push(sixth);
    expect(await sixth.join(clients[0].room!.code, 'Sixth')).toMatchObject({ ok: false, error: /full/ });
    const dup = new TestClient(url);
    clients.push(dup);
    expect(await dup.join('ZZZZZ', 'X')).toMatchObject({ ok: false, error: /No room/ });
  });

  it('refuses duplicate names', async () => {
    const url = await setup(2);
    const dup = new TestClient(url);
    clients.push(dup);
    expect(await dup.join(clients[0].room!.code, 'host')).toMatchObject({ ok: false, error: /name/ });
  });

  it('only the host can start, and only with 2-5 players', async () => {
    const url = await setup(1);
    expect(await clients[0].request('room:start')).toMatchObject({ ok: false, error: /2-5/ });
    const p2 = new TestClient(url);
    clients.push(p2);
    await p2.join(clients[0].room!.code, 'Two');
    expect(await p2.request('room:start')).toMatchObject({ ok: false, error: /host/ });
    expect(await clients[0].request('room:start')).toMatchObject({ ok: true });
    await p2.waitFor(() => !!p2.game, 2000, 'game update');
    expect(p2.room!.status).toBe('playing');
    expect(p2.game!.view.hand).toHaveLength(7);
    // Joining a running game is refused.
    const late = new TestClient(url);
    clients.push(late);
    expect(await late.join(clients[0].room!.code, 'Late')).toMatchObject({ ok: false, error: /started/ });
  });

  it('a disconnected player rejoins the same seat with their token and sees their hand', async () => {
    const url = await setup(3);
    await clients[0].request('room:start');
    await clients[1].waitFor(() => !!clients[1].game, 2000, 'game');
    const before = clients[1].game!.view.hand.map((c) => c.id).sort();
    const session = clients[1].session!;
    clients[1].close();
    await clients[0].waitFor(() => clients[0].room!.seats[1].connected === false, 2000, 'disconnect shown');

    const back = new TestClient(url);
    clients.push(back);
    await back.connected();
    const res = await back.request('room:resume', { token: session.token });
    expect(res).toMatchObject({ ok: true, session: { playerId: session.playerId } });
    await back.waitFor(() => !!back.game, 2000, 'snapshot');
    expect(back.game!.snapshot).toBe(true);
    expect(back.game!.view.you).toBe(session.playerId);
    // The hand can only have grown (timeouts draw), never lost cards it had.
    const after = back.game!.view.hand.map((c) => c.id);
    for (const id of before) {
      if (!after.includes(id)) {
        // only possible if they played/gave it, which they can't while offline
        throw new Error('card lost while offline');
      }
    }
    expect(back.game!.events.length).toBeGreaterThan(0); // log history restored
    await clients[0].waitFor(() => clients[0].room!.seats[1].connected === true, 2000, 'reconnect shown');
  });

  it('a seat can move to another device with the room code + rejoin code; the old tab is closed', async () => {
    const url = await setup(2);
    const { code, rejoinCode } = clients[1].session!;
    const other = new TestClient(url);
    clients.push(other);
    await other.connected();
    expect(await other.request('room:resume', { code, rejoinCode: 'WRONG1' })).toMatchObject({ ok: false });
    expect(await other.request('room:resume', { code, rejoinCode })).toMatchObject({ ok: true });
    await clients[1].waitFor(() => clients[1].closedReason !== null, 2000, 'old tab closed');
  });

  it('limits rejoin-code guesses per connection', async () => {
    const url = await setup(2);
    const guesser = new TestClient(url);
    clients.push(guesser);
    await guesser.connected();
    for (let i = 0; i < 8; i++) await guesser.request('room:resume', { code: clients[0].room!.code, rejoinCode: `BAD${i}XX` });
    const res = await guesser.request('room:resume', { code: clients[0].room!.code, rejoinCode: clients[1].session!.rejoinCode });
    expect(res).toMatchObject({ ok: false, error: /Too many/ });
  });

  it('leaving the lobby frees the seat and moves the host role', async () => {
    await setup(3);
    await clients[0].request('room:leave');
    await clients[1].waitFor(() => clients[1].room!.seats.length === 2, 2000, 'seat freed');
    expect(clients[1].room!.seats[0].isHost).toBe(true);
  });

  it('host can end a running game with no winner, then start a rematch', async () => {
    await setup(2);
    await clients[0].request('room:start');
    await clients[1].waitFor(() => clients[1].room?.status === 'playing', 2000, 'playing');
    expect(await clients[1].request('room:end')).toMatchObject({ ok: false });
    expect(await clients[0].request('room:end')).toMatchObject({ ok: true });
    await clients[1].waitFor(() => clients[1].room?.status === 'finished', 2000, 'finished');
    expect(clients[1].room!.endedByHost).toBe(true);
    const firstGameVersion = clients[1].game!.view.version;
    expect(await clients[0].request('room:rematch')).toMatchObject({ ok: true });
    await clients[1].waitFor(() => clients[1].room?.status === 'playing' && clients[1].game!.view.version === 0, 2000, 'rematch');
    expect(clients[1].game!.view.hand).toHaveLength(7);
    expect(firstGameVersion).toBeGreaterThanOrEqual(0);
  });

  it('rejects malformed actions and actions from the wrong player', async () => {
    await setup(2);
    await clients[0].request('room:start');
    await clients[0].waitFor(() => !!clients[0].game, 2000, 'game');
    await sleep(50);
    expect(await clients[0].request('game:action', { type: 'NUKE' })).toMatchObject({ ok: false, error: 'Invalid action.' });
    const current = clients[0].game!.view.currentPlayer;
    const notCurrent = clients.find((c) => c.session!.playerId !== current)!;
    expect(await notCurrent.request('game:action', { type: 'DRAW' })).toMatchObject({ ok: false, error: /not your turn/ });
  });
});
