import { afterEach, describe, expect, it } from 'vitest';
import type { RcoiServer } from '../src/app';
import { type TestClient, makeRoom, sleep, startServer } from './helpers';

let server: RcoiServer | null = null;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = null;
});

describe('server timers', () => {
  it('a turn that times out draws a card automatically and passes the turn', async () => {
    const s = await startServer();
    server = s.server;
    clients = await makeRoom(s.url, 2);
    await clients[0].request('room:start');
    const c = clients[0];
    await c.waitFor(() => !!c.game?.timer, 2000, 'timer');
    const first = c.game!.view.currentPlayer;
    expect(c.game!.timer!.deadline - c.game!.timer!.startsAt).toBe(400);
    expect(c.game!.timer!.player).toBe(first);
    await c.waitFor(() => c.game!.events.some((e) => e.type === 'TIMED_OUT'), 3000, 'timeout');
    const evs = c.game!.events;
    expect(evs.map((e) => e.type)).toEqual(['TIMED_OUT', 'CARDS_DRAWN', 'TURN_STARTED']);
    expect(c.game!.view.players.find((p) => p.id === first)!.bluffCount).toBe(8);
    expect(c.game!.view.currentPlayer).not.toBe(first);
  });

  it('a player disconnected past the grace period gets the short timer', async () => {
    const s = await startServer();
    server = s.server;
    clients = await makeRoom(s.url, 2);
    await clients[0].request('room:start');
    await clients[0].waitFor(() => !!clients[0].game, 2000, 'game');
    const leaver = clients[1];
    const leaverId = leaver.session!.playerId;
    leaver.close();
    await sleep(350); // grace = 300 ms
    const watcher = clients[0];
    await watcher.waitFor(
      () => watcher.game?.timer?.player === leaverId && watcher.game.timer.deadline - watcher.game.timer.startsAt <= 60,
      5000,
      'short timer for the disconnected player',
    );
  });

  it('refuses actions while a challenge reveal is being shown', async () => {
    const s = await startServer({
      timers: { turnMs: 5000, followUpMs: 5000, revealHoldMs: 1500, disconnectedGraceMs: 60_000, disconnectedTurnMs: 100 },
    });
    server = s.server;
    clients = await makeRoom(s.url, 2);
    await clients[0].request('room:start');
    for (const c of clients) await c.waitFor(() => !!c.game, 2000, 'game');
    const byId = (id: string) => clients.find((c) => c.session!.playerId === id)!;
    const first = byId(clients[0].game!.view.currentPlayer);
    const second = clients.find((c) => c !== first)!;
    const card = first.game!.view.hand[0].id;
    expect(await first.request('game:action', { type: 'PLAY', cardId: card, pileId: 'p1' })).toMatchObject({ ok: true });
    await second.waitFor(() => second.game!.view.legal.challenge.pileIds.includes('p1'), 2000, 'challengeable');
    const res = await second.request('game:action', {
      type: 'CHALLENGE',
      pileId: 'p1',
      cardId: second.game!.view.hand[0].id,
    });
    expect(res).toMatchObject({ ok: true });
    await first.waitFor(() => !!first.game!.view.lastChallenge, 2000, 'reveal');
    const u = first.game!;
    expect(u.holdUntil - u.serverNow).toBeGreaterThan(1000);
    expect(u.timer!.startsAt).toBe(u.holdUntil);
    const awaited = byId(u.timer!.player);
    const legal = awaited.game!.view.legal;
    const action =
      legal.awaiting === 'give'
        ? { type: 'GIVE', cardId: legal.give!.cardIds[0] }
        : legal.awaiting === 'reaction'
          ? { type: 'REACT', abilityId: null }
          : { type: 'DRAW' };
    expect(await awaited.request('game:action', action)).toMatchObject({ ok: false, error: /reveal/ });
    await sleep(1600);
    expect(await awaited.request('game:action', action)).toMatchObject({ ok: true });
  });
});
