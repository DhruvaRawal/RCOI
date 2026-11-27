import type { GameUpdate } from '@rcoi/shared';
import { chooseBotAction, mulberry32 } from '@rcoi/shared/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { RcoiServer } from '../src/app';
import { TestClient, makeRoom, startServer } from './helpers';

let server: RcoiServer | null = null;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = null;
});

describe('bots in rooms', () => {
  it('the host adds bots named "BOT {name}" (medium by default), changes difficulty and removes them', async () => {
    const s = await startServer();
    server = s.server;
    clients = await makeRoom(s.url, 2);
    const [host, guest] = clients;

    expect(await guest.request('room:addBot')).toMatchObject({ ok: false, error: /host/ });
    expect(await host.request('room:addBot')).toMatchObject({ ok: true });
    expect(await host.request('room:addBot')).toMatchObject({ ok: true });
    await guest.waitFor(() => guest.room!.seats.length === 4, 2000, 'bots visible to everyone');

    const bots = guest.room!.seats.filter((x) => x.bot);
    expect(bots).toHaveLength(2);
    for (const b of bots) {
      expect(b.name).toMatch(/^BOT [A-Z][a-z]+$/);
      expect(b.bot).toBe('medium');
      expect(b.connected).toBe(true);
      expect(b.isHost).toBe(false);
    }
    expect(new Set(guest.room!.seats.map((x) => x.name)).size).toBe(4);

    const target = bots[0].playerId;
    expect(await guest.request('room:botDifficulty', { playerId: target, difficulty: 'hard' })).toMatchObject({ ok: false });
    expect(await host.request('room:botDifficulty', { playerId: target, difficulty: 'impossible' })).toMatchObject({ ok: false });
    expect(await host.request('room:botDifficulty', { playerId: target, difficulty: 'hard' })).toMatchObject({ ok: true });
    await guest.waitFor(() => guest.room!.seats.find((x) => x.playerId === target)?.bot === 'hard', 2000, 'difficulty');

    // Bot commands never touch human seats.
    expect(await host.request('room:removeBot', { playerId: guest.session!.playerId })).toMatchObject({ ok: false });
    expect(await host.request('room:removeBot', { playerId: target })).toMatchObject({ ok: true });
    await guest.waitFor(() => guest.room!.seats.length === 3, 2000, 'bot removed');

    // Room limit applies to bots too.
    expect(await host.request('room:addBot')).toMatchObject({ ok: true });
    expect(await host.request('room:addBot')).toMatchObject({ ok: true });
    expect(await host.request('room:addBot')).toMatchObject({ ok: false, error: /full/ });
  });

  it('a human plays a full game against easy, medium and hard bots', async () => {
    const s = await startServer();
    server = s.server;
    clients = await makeRoom(s.url, 1);
    const [host] = clients;
    for (const level of ['easy', 'medium', 'hard'] as const) {
      expect(await host.request('room:addBot')).toMatchObject({ ok: true });
      await host.waitFor(() => host.room!.seats.filter((x) => x.bot).length >= 1, 2000, 'bot');
      const newest = host.room!.seats.filter((x) => x.bot && x.bot === 'medium').at(-1)!;
      await host.request('room:botDifficulty', { playerId: newest.playerId, difficulty: level });
    }
    await host.waitFor(() => host.room!.seats.filter((x) => x.bot).length === 3, 2000, 'three bots');

    const rand = mulberry32(7);
    host.socket.on('game:update', (u: GameUpdate) => {
      if (u.view.winner || !u.view.legal.awaiting) return;
      setTimeout(() => {
        if (host.game?.view.version !== u.view.version) return;
        const a = chooseBotAction(u.view.legal, rand);
        if (a) host.request('game:action', a);
      }, Math.max(0, u.holdUntil - u.serverNow) + 2);
    });
    expect(await host.request('room:start')).toMatchObject({ ok: true });
    await host.waitFor(() => host.room?.status === 'finished', 60_000, 'game end');

    // Every bot took real turns (not just timeouts).
    const state = s.server.rooms.get(host.room!.code)!.session!.state;
    expect(state.winner).not.toBeNull();
    const botIds = host.room!.seats.filter((x) => x.bot).map((x) => x.playerId);
    const played = new Set<string>();
    for (const { event, payload } of host.received) {
      if (event !== 'game:update') continue;
      for (const e of (payload as GameUpdate).events) {
        if ((e.type === 'CARD_PLAYED' || e.type === 'CHALLENGE' || e.type === 'ABILITY_USED') && 'player' in e) played.add(e.player);
        if (e.type === 'CHALLENGE') played.add(e.challenger);
        if (e.type === 'TIMED_OUT') expect(botIds).not.toContain(e.player);
      }
    }
    for (const id of botIds) expect(played.has(id)).toBe(true);
  });

  it('a room with only bots left is closed', async () => {
    const s = await startServer();
    server = s.server;
    clients = await makeRoom(s.url, 1);
    await clients[0].request('room:addBot');
    await clients[0].request('room:addBot');
    expect(s.server.rooms.size).toBe(1);
    await clients[0].request('room:leave');
    expect(s.server.rooms.size).toBe(0);
  });
});
