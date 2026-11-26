import {
  type BluffType,
  C2S,
  type CardKind,
  type CardType,
  type ChallengeReason,
  DEFAULT_CONFIG,
  type GameUpdate,
  type PlayerAction,
  type PlayerId,
  type PlayerView,
  type RoomView,
  S2C,
  type SessionInfo,
  type TimerView,
  type VisibleEvent,
} from '@rcoi/shared';
import { create } from 'zustand';
import { type LogEntry, describeEvent, setPileTypes } from '../game/describe';
import { nameStore, request, sessionStore, socket } from './socket';

export interface Flight {
  id: number;
  kind: CardKind;
  type: CardType | null;
  from: DOMRect;
  to: DOMRect;
  delay: number;
  duration: number;
  /** Fade out at the destination (destroyed cards). */
  vanish?: boolean;
}

export interface RevealInfo {
  key: number;
  challenger: PlayerId;
  challenged: PlayerId;
  pileType: BluffType;
  targetType: BluffType;
  matched: boolean;
  challengerWon: boolean;
  reason: ChallengeReason;
  /** Public only when it decided the result; the challenger always sees their own. */
  challengerCardType: BluffType | null;
  durationMs: number;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface Store {
  connected: boolean;
  session: SessionInfo | null;
  room: RoomView | null;
  view: PlayerView | null;
  timer: TimerView | null;
  /** serverNow - Date.now() */
  clockOffset: number;
  log: LogEntry[];
  flights: Flight[];
  reveal: RevealInfo | null;
  finalCard: { type: BluffType; player: PlayerId } | null;
  animating: boolean;
  toasts: Toast[];
  closedReason: string | null;
  peekOwn: boolean;
  busy: boolean;
}

export const useStore = create<Store>(() => ({
  connected: false,
  session: null,
  room: null,
  view: null,
  timer: null,
  clockOffset: 0,
  log: [],
  flights: [],
  reveal: null,
  finalCard: null,
  animating: false,
  toasts: [],
  closedReason: null,
  peekOwn: false,
  busy: false,
}));

const set = useStore.setState;
const get = useStore.getState;

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastId = 1;
export function toast(text: string, tone: Toast['tone'] = 'info') {
  const id = toastId++;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 4500 : 3200);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export function nameOf(id: PlayerId): string {
  return get().room?.seats.find((s) => s.playerId === id)?.name ?? 'Someone';
}

export function seatOf(id: PlayerId) {
  return get().room?.seats.find((s) => s.playerId === id);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function adoptSession(session: SessionInfo) {
  sessionStore.save({ token: session.token, code: session.code });
  set({ session, closedReason: null });
}

async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
  set({ busy: true });
  try {
    return await fn();
  } finally {
    set({ busy: false });
  }
}

export const commands = {
  async create(name: string) {
    nameStore.save(name);
    const res = await withBusy(() => request<{ session: SessionInfo }>(C2S.create, { name }));
    if (res.ok) adoptSession(res.session);
    return res;
  },
  async join(code: string, name: string) {
    nameStore.save(name);
    const res = await withBusy(() => request<{ session: SessionInfo }>(C2S.join, { code, name }));
    if (res.ok) adoptSession(res.session);
    return res;
  },
  async resumeWithCode(code: string, rejoinCode: string) {
    const res = await withBusy(() => request<{ session: SessionInfo }>(C2S.resume, { code, rejoinCode }));
    if (res.ok) adoptSession(res.session);
    return res;
  },
  async leave() {
    await request(C2S.leave);
    sessionStore.clear();
    resetGame();
    set({ session: null, room: null });
  },
  async start() {
    const res = await request(C2S.start);
    if (!res.ok) toast(res.error, 'error');
  },
  async rematch() {
    const res = await request(C2S.rematch);
    if (!res.ok) toast(res.error, 'error');
  },
  async endGame() {
    const res = await request(C2S.endGame);
    if (!res.ok) toast(res.error, 'error');
  },
  async act(action: PlayerAction): Promise<boolean> {
    const res = await request(C2S.action, action);
    if (!res.ok) toast(res.error, 'error');
    return res.ok;
  },
  togglePeek() {
    set((s) => ({ peekOwn: !s.peekOwn }));
  },
};

function resetGame() {
  queue.length = 0;
  set({ view: null, timer: null, log: [], flights: [], reveal: null, finalCard: null, animating: false });
}

// ---------------------------------------------------------------------------
// Socket wiring
// ---------------------------------------------------------------------------

async function tryResume() {
  const saved = sessionStore.load();
  if (!saved) return;
  const res = await request<{ session: SessionInfo }>(C2S.resume, { token: saved.token });
  if (res.ok) adoptSession(res.session);
  else {
    sessionStore.clear();
    set({ session: null, room: null });
    resetGame();
  }
}

socket.on('connect', () => {
  set({ connected: true });
  void tryResume();
});
socket.on('disconnect', () => set({ connected: false }));

socket.on(S2C.room, (room: RoomView) => {
  const prev = get().room;
  if (prev && prev.status !== 'playing' && room.status === 'playing') resetGame();
  set({ room });
});

socket.on(S2C.kicked, ({ reason }: { reason: string }) => {
  sessionStore.clear();
  resetGame();
  set({ session: null, room: null, closedReason: reason });
});

socket.on(S2C.game, (u: GameUpdate) => enqueue(u));

// ---------------------------------------------------------------------------
// Update queue: animate each update's events, then show its view.
// ---------------------------------------------------------------------------

const queue: GameUpdate[] = [];
let pumping = false;

function enqueue(u: GameUpdate) {
  set({ clockOffset: u.serverNow - Date.now() });
  if (u.snapshot) {
    queue.length = 0;
    const me = u.view.you;
    setPileTypes(Object.fromEntries(u.view.piles.map((p) => [p.id, p.type])));
    const log = u.events.map((e) => describeEvent(e, me, nameOf)).filter((x): x is LogEntry => !!x);
    set({ view: u.view, timer: u.timer, log: log.slice(-300), reveal: null, flights: [], finalCard: null });
    return;
  }
  queue.push(u);
  if (!pumping) void pump();
}

async function pump() {
  pumping = true;
  set({ animating: true });
  try {
    while (queue.length) {
      const u = queue.shift()!;
      // Catch up quickly if updates pile up or the tab is hidden.
      const fast = queue.length > 4 || document.hidden;
      for (const e of u.events) {
        addLog(e, u.view.you);
        if (!fast) await animateEvent(e, u);
      }
      setPileTypes(Object.fromEntries(u.view.piles.map((p) => [p.id, p.type])));
      set({ view: u.view, timer: u.timer });
    }
  } finally {
    pumping = false;
    set({ animating: false });
  }
}

function addLog(e: VisibleEvent, me: PlayerId) {
  const entry = describeEvent(e, me, nameOf);
  if (entry) set((s) => ({ log: [...s.log.slice(-299), entry] }));
}

// ---------------------------------------------------------------------------
// Event animations
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let flightId = 1;

function rectOf(anchor: string): DOMRect | null {
  const el = document.querySelector(`[data-anchor="${anchor}"]`);
  return el ? el.getBoundingClientRect() : null;
}

function seatAnchor(id: PlayerId, me: PlayerId) {
  return id === me ? 'hand' : `seat-${id}`;
}

/** Launch flights and resolve when they are done. */
async function fly(specs: FlightSpec[]): Promise<void> {
  const flights: Flight[] = [];
  for (const s of specs) {
    const from = rectOf(s.from);
    const to = rectOf(s.to);
    if (!from || !to) continue;
    flights.push({ ...s, id: flightId++, from, to });
  }
  if (!flights.length) return;
  set((st) => ({ flights: [...st.flights, ...flights] }));
  const total = Math.max(...flights.map((f) => f.delay + f.duration));
  await sleep(total + 40);
  const ids = new Set(flights.map((f) => f.id));
  set((st) => ({ flights: st.flights.filter((f) => !ids.has(f.id)) }));
}

type FlightSpec = { from: string; to: string; kind: CardKind; type: CardType | null; delay: number; duration: number; vanish?: boolean };

async function animateEvent(e: VisibleEvent, u: GameUpdate): Promise<void> {
  const me = u.view.you;
  const specs: FlightSpec[] = [];
  switch (e.type) {
    case 'GAME_STARTED': {
      const n = e.players.length;
      for (let r = 0; r < e.handSize; r++) {
        e.players.forEach((p, i) =>
          specs.push({ from: 'deck-bluff', to: seatAnchor(p, me), kind: 'bluff', type: null, delay: (r * n + i) * 55, duration: 380 }),
        );
      }
      const after = e.handSize * n * 55 + 200;
      e.piles.forEach((p, i) =>
        specs.push({ from: 'deck-bluff', to: `pile-${p.pileId}-open`, kind: 'bluff', type: p.type, delay: after + i * 140, duration: 480 }),
      );
      break;
    }
    case 'CARD_PLAYED':
      specs.push({
        from: seatAnchor(e.player, me),
        to: `pile-${e.pileId}-next`,
        kind: 'bluff',
        type: e.faceUp ? (e.cardType ?? null) : null,
        delay: 0,
        duration: 520,
      });
      break;
    case 'CARDS_DRAWN':
      for (let i = 0; i < e.count; i++) {
        specs.push({
          from: e.deck === 'ability' ? 'deck-ability' : 'deck-bluff',
          to: seatAnchor(e.player, me),
          kind: e.deck,
          type: null,
          delay: i * 140,
          duration: 440,
        });
      }
      break;
    case 'CARD_GIVEN':
      specs.push({
        from: seatAnchor(e.from, me),
        to: seatAnchor(e.to, me),
        kind: 'bluff',
        type: e.mine?.cards?.[0]?.type ?? null,
        delay: 0,
        duration: 650,
      });
      break;
    case 'CARD_TAKEN_BACK':
      specs.push({ from: `pile-${e.pileId}-top`, to: seatAnchor(e.player, me), kind: 'bluff', type: e.cardType, delay: 0, duration: 600 });
      break;
    case 'ABILITY_USED':
      specs.push({
        from: seatAnchor(e.player, me),
        to: e.ability === 'RAJ_BHANDARI' ? 'piles' : 'discard-ability',
        kind: 'ability',
        type: e.ability,
        delay: 0,
        duration: 650,
        vanish: e.ability === 'RAJ_BHANDARI',
      });
      break;
    case 'HANDS_EXCHANGED':
      specs.push({ from: seatAnchor(e.a, me), to: seatAnchor(e.b, me), kind: 'bluff', type: null, delay: 0, duration: 700 });
      specs.push({ from: seatAnchor(e.b, me), to: seatAnchor(e.a, me), kind: 'bluff', type: null, delay: 0, duration: 700 });
      break;
    case 'PILE_CREATED':
      specs.push({ from: seatAnchor(e.player, me), to: 'piles', kind: 'bluff', type: e.pileType, delay: 0, duration: 600 });
      break;
    case 'BLUFF_DECK_RESHUFFLED': {
      const piles = (get().view?.piles ?? []).filter((p) => p.count > 1);
      piles.forEach((p, i) =>
        specs.push({ from: `pile-${p.id}-top`, to: 'deck-bluff', kind: 'bluff', type: null, delay: i * 120, duration: 500 }),
      );
      break;
    }
    case 'ABILITY_DECK_RESHUFFLED':
      specs.push({ from: 'discard-ability', to: 'deck-ability', kind: 'ability', type: null, delay: 0, duration: 500 });
      break;
    case 'CHALLENGE': {
      const hold = Math.max(1500, u.holdUntil - u.serverNow);
      const mineCard = e.challenger === me ? (e.mine?.cards?.[0]?.type as BluffType | undefined) : undefined;
      set({
        reveal: {
          key: e.seq,
          challenger: e.challenger,
          challenged: e.challenged,
          pileType: e.pileType,
          targetType: e.targetType,
          matched: e.matched,
          challengerWon: e.challengerWon,
          reason: e.reason,
          challengerCardType: e.challengerCardType ?? mineCard ?? null,
          durationMs: hold,
        },
      });
      await sleep(hold);
      set({ reveal: null });
      return;
    }
    case 'GAME_WON': {
      // Show a face-up last card to everyone before the winner screen.
      const played = u.events.find((x) => x.type === 'CARD_PLAYED' && x.faceUp);
      if (played && played.type === 'CARD_PLAYED' && played.cardType) {
        set({ finalCard: { type: played.cardType, player: played.player } });
        await sleep(2600);
        set({ finalCard: null });
      }
      return;
    }
    default:
      return;
  }
  await fly(specs);
}

/** Default reveal length if the server didn't say (shared config). */
export const REVEAL_MS = DEFAULT_CONFIG.timers.revealHoldMs;
