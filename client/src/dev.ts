/**
 * Development-only helpers (never included in a production build):
 *   __rcoi.autoplay(true)  - this tab plays random legal moves (handy when testing alone)
 *   __rcoi.state()         - the current store state
 */
import { PLAYER_COLORS, applyAction, toPlayerView } from '@rcoi/shared';
import { type ScenarioSpec, buildScenario, chooseBotAction, mulberry32 } from '@rcoi/shared/testing';
import { socket } from './net/socket';
import { commands, useStore } from './net/store';

let timer: ReturnType<typeof setInterval> | null = null;

function autoplay(on = true, delayMs = 900) {
  if (timer) clearInterval(timer);
  timer = null;
  if (!on) return 'autoplay off';
  const rand = mulberry32(Date.now());
  let lastVersion = -1;
  timer = setInterval(() => {
    const s = useStore.getState();
    const v = s.view;
    if (!v || v.winner || s.animating || s.reveal || !v.legal.awaiting || v.version === lastVersion) return;
    lastVersion = v.version;
    const action = chooseBotAction(v.legal, rand);
    if (action) void commands.act(action);
  }, delayMs);
  return 'autoplay on';
}

/**
 * Visual QA only: render the table for an exact engine scenario (no server involved).
 *   __rcoi.sandbox('lastcard' | 'nomatch' | 'reaction' | 'give' | 'abilities')
 */
function sandbox(kind: string) {
  const others = ['b', 'c', 'd'];
  const piles = [{ type: 'RAJA' as const, stack: [{ type: 'YODHA' as const, owner: 'b' }] }, { type: 'RANI' as const }, { type: 'SENAPATI' as const }, { type: 'YODHA' as const }];
  const specs: Record<string, ScenarioSpec> = {
    lastcard: { players: [{ id: 'me', hand: ['RAJA'] }, ...others.map((id) => ({ id, hand: ['RANI' as const, 'YODHA' as const] }))], piles, current: 'me' },
    nomatch: { players: [{ id: 'me', hand: ['GAJADHYAKSHA'], abilities: ['DANDANAYAKA'] }, ...others.map((id) => ({ id, hand: ['RANI' as const] }))], piles, current: 'me' },
    abilities: {
      players: [{ id: 'me', hand: ['GAJADHYAKSHA', 'RAJA', 'VIDUSHAKA'], abilities: ['MAHAMANTRI', 'DANDANAYAKA', 'RAJ_BHANDARI', 'CHIKITSAKA'] }, ...others.map((id) => ({ id, hand: ['RANI' as const] }))],
      piles,
      current: 'me',
    },
    reaction: { players: [{ id: 'b', hand: ['RAJA', 'SENAPATI'] }, { id: 'me', hand: ['RANI', 'RANI'], abilities: ['CHIKITSAKA'] }, { id: 'c', hand: ['YODHA'] }], piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'me' }] }, ...piles.slice(1)], current: 'b' },
    give: { players: [{ id: 'b', hand: ['RAJA', 'SENAPATI'] }, { id: 'me', hand: ['RANI', 'YODHA', 'VIDUSHAKA'] }, { id: 'c', hand: ['YODHA'] }], piles: [{ type: 'RAJA', stack: [{ type: 'RAJA', owner: 'me' }] }, ...piles.slice(1)], current: 'b' },
  };
  const spec = specs[kind];
  if (!spec) return `unknown scenario; try ${Object.keys(specs).join(', ')}`;
  let state = buildScenario(spec);
  if (kind === 'reaction' || kind === 'give') {
    const card = state.players[0].hand.find((c) => state.cards[c].type === (kind === 'reaction' ? 'RAJA' : 'SENAPATI'))!;
    const r = applyAction(state, 'b', { type: 'CHALLENGE', pileId: 'p1', cardId: card });
    if (r.ok) state = r.state;
  }
  socket.disconnect();
  const ids = state.players.map((p) => p.id);
  const names: Record<string, string> = { me: 'You', b: 'Arjun', c: 'Meera', d: 'Kabir' };
  const now = Date.now();
  useStore.setState({
    connected: true,
    session: { code: 'SANDBOX', playerId: 'me', token: 'x', rejoinCode: 'XXXXXX' },
    room: {
      code: 'SANDBOX',
      status: 'playing',
      hostId: 'me',
      you: 'me',
      minPlayers: 2,
      maxPlayers: 5,
      endedByHost: false,
      seats: ids.map((id, i) => ({ playerId: id, name: names[id], color: PLAYER_COLORS[i].hex, avatar: i * 2, connected: true, isHost: id === 'me', bot: null })),
    },
    view: toPlayerView(state, 'me'),
    timer: { player: 'me', kind: kind === 'reaction' ? 'reaction' : kind === 'give' ? 'give' : 'turn', startsAt: now, deadline: now + 45_000 },
    log: [],
  });
  return `sandbox: ${kind}`;
}

(window as unknown as Record<string, unknown>).__rcoi = { autoplay, sandbox, state: () => useStore.getState(), commands };
