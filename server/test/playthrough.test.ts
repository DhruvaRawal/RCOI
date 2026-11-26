/**
 * Full games over real sockets with random-move bots. Every payload each player receives is
 * recorded and checked for hidden information.
 */
import { type GameUpdate, assertInvariants } from '@rcoi/shared';
import { chooseBotAction, mulberry32 } from '@rcoi/shared/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { RcoiServer } from '../src/app';
import { type TestClient, makeRoom, startServer } from './helpers';

let server: RcoiServer | null = null;
let clients: TestClient[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await server?.close();
  server = null;
});

async function playBotGame(n: number, seed: number) {
  const s = await startServer({
    timers: { turnMs: 3000, followUpMs: 3000, revealHoldMs: 5, disconnectedGraceMs: 60_000, disconnectedTurnMs: 100 },
  });
  server = s.server;
  clients = await makeRoom(s.url, n);
  const rand = mulberry32(seed);

  for (const c of clients) {
    c.socket.on('game:update', (u: GameUpdate) => {
      if (u.view.winner || !u.view.legal.awaiting) return;
      const wait = Math.max(0, u.holdUntil - u.serverNow) + 2;
      setTimeout(() => {
        if (c.game?.view.version !== u.view.version) return; // stale
        const action = chooseBotAction(u.view.legal, rand);
        if (action) c.request('game:action', action);
      }, wait);
    });
  }
  expect(await clients[0].request('room:start')).toMatchObject({ ok: true });
  for (const c of clients) await c.waitFor(() => c.room?.status === 'finished', 120_000, 'game end');

  const room = s.server.rooms.get(clients[0].room!.code)!;
  const state = room.session!.state;
  assertInvariants(state);
  expect(state.winner).not.toBeNull();
  return { state, room };
}

function checkNoLeaks(state: { cards: Record<string, unknown> }) {
  const allIds = new Set(Object.keys(state.cards));
  for (const c of clients) {
    const me = c.session!.playerId;
    const known = new Set<string>();
    let updates = 0;
    for (const { event, payload } of c.received) {
      const json = JSON.stringify(payload);
      // Nobody else's session secrets, ever.
      for (const other of clients) {
        if (other === c) continue;
        expect(json).not.toContain(other.session!.token);
        expect(json).not.toContain(other.session!.rejoinCode);
      }
      expect(json).not.toMatch(/"(rng|seed|bluffDeck|abilityDeck|secret)"/);
      if (event !== 'game:update') continue;
      updates++;
      const u = payload as GameUpdate;
      expect(u.view.you).toBe(me);
      u.view.hand.forEach((h) => known.add(h.id));
      u.view.abilities.forEach((h) => known.add(h.id));
      u.events.forEach((e) => e.mine?.cards?.forEach((m) => known.add(m.id)));
      // Every card id in the payload is one this player holds or has held.
      JSON.stringify(u, (_k, v) => {
        if (typeof v === 'string' && allIds.has(v)) expect(known.has(v), `${me} got foreign id ${v}`).toBe(true);
        return v;
      });
      // Other players appear only as counts.
      for (const p of u.view.players) expect(Object.keys(p).sort()).toEqual(['abilityCount', 'bluffCount', 'id']);
      for (const pile of u.view.piles) {
        for (const card of pile.cards) {
          if (!card.faceUp) expect(card.type).toBeNull();
          if (card.ownType) expect(card.owner === me && card.isTop && !card.faceUp).toBe(true);
        }
      }
      if (u.view.lastChallenge && u.view.lastChallenge.matched && u.view.lastChallenge.challenger !== me) {
        expect(u.view.lastChallenge.challengerCardType).toBeNull();
      }
    }
    expect(updates).toBeGreaterThan(3);
  }
}

describe('full games over the network', () => {
  for (const [n, seed] of [
    [2, 1],
    [2, 2],
    [2, 3],
    [5, 4],
    [5, 5],
    [5, 6],
  ] as const) {
    it(`${n}-player bot game #${seed} finishes and nobody receives hidden information`, async () => {
      const { state } = await playBotGame(n, seed);
      checkNoLeaks(state);
      // Every client saw the same winner.
      for (const c of clients) expect(c.game!.view.winner).toEqual(state.winner);
    });
  }
});
