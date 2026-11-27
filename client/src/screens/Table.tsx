import { type PlayerAction, type PlayerId, type PlayerView, type RoomView, cardName } from '@rcoi/shared';
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CARD_RATIO } from '../assets/manifest';
import { ActionButtons, ActionPrompt } from '../components/ActionBar';
import { CardStack } from '../components/CardStack';
import { ChallengeReveal, FinalCardReveal } from '../components/ChallengeReveal';
import { FlyLayer } from '../components/FlyLayer';
import { Hand } from '../components/Hand';
import { Modal } from '../components/Modal';
import { GameLog, MiniWinTable, PreviewLayer, ReactionPrompt, RulesPanel } from '../components/Panels';
import { Pile } from '../components/Pile';
import { Seat } from '../components/Seat';
import {
  clickAbility,
  clickHandCard,
  clickPile,
  clickTopCard,
  clickSeat,
  currentStep,
  pileUI,
  resetMode,
  sanitizeMode,
  seatSelectable,
  setMode,
  useTurnUI,
} from '../game/turnUI';
import { commands, nameOf, toast, useStore } from '../net/store';
import { Winner } from './Winner';

/** Seats evenly around the table, the local player always at the bottom, turns clockwise. */
export function seatPosition(relIndex: number, n: number): { left: string; top: string } {
  const angle = ((90 + (relIndex * 360) / n) * Math.PI) / 180;
  return { left: `${50 + 45 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` };
}

/** Short screens (phones in landscape) use a compact pile layout. Keep in sync with game.css. */
const COMPACT_QUERY = '(max-height: 560px)';
export const PILE_LAYOUT = {
  normal: { maxStrips: 4, overlap: 0 },
  compact: { maxStrips: 2, overlap: 0.3 },
};
const STRIP = 0.17; // covered-card strip, as a fraction of the card height

export function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

/**
 * Fit pile cards to the centre area. Width: deck column + piles. Height: tag, open card,
 * the played stack (top card + strips, optionally tucked under the open card) and the count.
 */
function useCenterFit(cols: number, compact: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(80);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { maxStrips, overlap } = compact ? PILE_LAYOUT.compact : PILE_LAYOUT.normal;
    const measure = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const gap = Math.max(6, Math.min(16, W * 0.012));
      const byWidth = (W - gap * (cols + 1)) / (cols + 0.45);
      const fixed = compact ? 30 : 44; // tag + gaps + count line
      const heights = 2 + maxStrips * STRIP - overlap;
      const byHeight = ((H - fixed) / heights) * CARD_RATIO;
      setW(Math.max(30, Math.min(118, Math.floor(Math.min(byWidth, byHeight)))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, compact]);
  return { ref, w };
}

function statusFor(view: PlayerView, id: PlayerId): string | null {
  if (view.winner) return view.winner.player === id ? 'winner!' : null;
  if (view.pending?.kind === 'give' && view.pending.from === id) return `choosing a card for ${view.pending.to === view.you ? 'you' : nameOf(view.pending.to)}`;
  if (view.pending?.kind === 'reaction' && view.pending.player === id) return 'deciding…';
  if (!view.pending && view.currentPlayer === id) return 'taking a turn';
  return null;
}

export function Table({ room, view }: { room: RoomView; view: PlayerView }) {
  const mode = sanitizeMode(view, useTurnUI((s) => s.mode));
  const timer = useStore((s) => s.timer);
  const peekOwn = useStore((s) => s.peekOwn);
  const animating = useStore((s) => s.animating);
  const reveal = useStore((s) => s.reveal);
  const session = useStore((s) => s.session);
  const [showRules, setShowRules] = useState(false);
  const [showLog, setShowLog] = useState(() => window.innerWidth > 1100);
  const [menu, setMenu] = useState<null | 'menu' | 'end' | 'leave'>(null);

  // Any new state from the server cancels a half-built action.
  useEffect(() => {
    if (view.legal.awaiting === 'give') setMode({ kind: 'give', cardId: null });
    else resetMode();
  }, [view.version, view.legal.awaiting]);

  const seats = room.seats;
  const n = seats.length;
  const myIndex = seats.findIndex((s) => s.playerId === view.you);
  const colorOf = (id: PlayerId) => seats.find((s) => s.playerId === id)?.color ?? '#ccc';
  const compact = useCompact();
  const center = useCenterFit(view.piles.length + 1.45, compact);
  const notice = (text: string) => toast(text);
  const locked = animating || !!reveal;
  const step = currentStep(view, mode, nameOf);

  // Every action goes through here. Play (choosing the pile) and Draw (button or deck) are sent at once;
  // challenges, abilities and gives are sent from the Confirm button beside the player's portrait.
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const sendNow = async (action: PlayerAction) => {
    if (locked || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const ok = await commands.act(action);
    sendingRef.current = false;
    setSending(false);
    if (ok) resetMode();
  };
  const drawFromDeck = () => {
    if (!view.legal.draw.allowed) return notice(view.legal.draw.reason ?? 'You cannot draw now.');
    void sendNow({ type: 'DRAW' });
  };

  const current = view.pending ? (view.pending.kind === 'give' ? view.pending.from : view.pending.player) : view.currentPlayer;
  const waitingText =
    current === view.you || view.winner
      ? null
      : view.pending?.kind === 'give'
        ? `${nameOf(view.pending.from)} is choosing a card to give ${view.pending.to === view.you ? 'you' : nameOf(view.pending.to)}…`
        : view.pending?.kind === 'reaction'
          ? `${nameOf(view.pending.player)} is deciding…`
          : `Waiting for ${nameOf(view.currentPlayer)}…`;

  const turnLabel = view.winner
    ? 'Game over'
    : view.legal.awaiting === 'turn'
      ? 'Your turn'
      : view.legal.awaiting === 'give'
        ? 'Choose a card to give'
        : view.legal.awaiting === 'reaction'
          ? 'Your bluff was caught'
          : `${nameOf(current)}'s ${view.pending ? 'decision' : 'turn'}`;

  return (
    <div className={`game${showLog ? ' has-log' : ''}`} style={{ ['--pc-w' as string]: `${center.w}px` } as CSSProperties}>
      <header className="topbar">
        <div className="topbar__brand">
          <span className="display">RCOI</span>
          <span className="topbar__code" title="Room code">
            {room.code}
          </span>
        </div>
        <div className={`topbar__turn${view.legal.awaiting ? ' is-mine' : ''}`} aria-live="polite">
          {turnLabel}
        </div>
        <div className="topbar__tools">
          <button
            className={`btn btn--ghost btn--small${peekOwn ? ' is-active' : ''}`}
            onClick={commands.togglePeek}
            aria-pressed={peekOwn}
            title="Show or hide the identity of your own face-down top cards (only you see them)"
          >
            {peekOwn ? '◉' : '○'} My top cards
          </button>
          <button className={`btn btn--ghost btn--small${showLog ? ' is-active' : ''}`} onClick={() => setShowLog((v) => !v)}>
            Log
          </button>
          <button className="btn btn--ghost btn--small" onClick={() => setShowRules(true)}>
            Rules
          </button>
          <button className="btn btn--ghost btn--small" onClick={() => setMenu('menu')} aria-label="Menu">
            ☰
          </button>
        </div>
      </header>

      <main className="game__main">
        <div className="table-wrap">
          <MiniWinTable />
          <div className="table" data-n={n}>
            <div className="table__felt" aria-hidden="true" />
            {seats.map((seat, i) => {
              const rel = (i - myIndex + n) % n;
              const sel = seatSelectable(view, mode, seat.playerId);
              return (
                <Seat
                  key={seat.playerId}
                  seat={seat}
                  stats={view.players.find((p) => p.id === seat.playerId)}
                  isMe={seat.playerId === view.you}
                  isCurrent={current === seat.playerId && !view.winner}
                  timer={timer?.player === seat.playerId ? timer : null}
                  status={statusFor(view, seat.playerId)}
                  selectable={sel.selectable}
                  selected={sel.selected}
                  onClick={(id) => clickSeat(view, mode, id, notice)}
                  style={seatPosition(rel, n)}
                  aside={
                    seat.playerId === view.you ? (
                      <ActionPrompt view={view} mode={mode} step={step} locked={locked} sending={sending} sendNow={sendNow} />
                    ) : undefined
                  }
                />
              );
            })}
            <div className="table__center" ref={center.ref}>
              <div className="decks">
                <CardStack
                  kind="bluff"
                  count={view.bluffDeckCount}
                  label="Deck"
                  anchor="deck-bluff"
                  width="var(--pc-w)"
                  inviting={view.legal.awaiting === 'turn' && view.legal.draw.allowed && !locked}
                  actionLabel={view.legal.awaiting === 'turn' ? 'Draw a card (ends your turn)' : undefined}
                  onClick={view.legal.awaiting === 'turn' ? drawFromDeck : undefined}
                />
                <div className="decks__row">
                  <CardStack kind="ability" count={view.abilityDeckCount} label="Abilities" anchor="deck-ability" width="calc(var(--pc-w) * 0.62)" />
                  <CardStack
                    kind="ability"
                    count={view.abilityDiscard.count}
                    topType={view.abilityDiscard.top}
                    label="Discard"
                    anchor="discard-ability"
                    width="calc(var(--pc-w) * 0.62)"
                  />
                </div>
              </div>
              <div className="piles" data-anchor="piles">
                {view.piles.map((pile) => {
                  const ui = pileUI(view, mode, pile.id);
                  return (
                    <Pile
                      key={pile.id}
                      pile={pile}
                      colorOf={colorOf}
                      nameOf={nameOf}
                      peekOwn={peekOwn}
                      selectable={ui.selectable}
                      selected={ui.selected}
                      challengeTarget={ui.challengeTarget}
                      challengeSelected={ui.challengeSelected}
                      maxStrips={compact ? PILE_LAYOUT.compact.maxStrips : PILE_LAYOUT.normal.maxStrips}
                      onClick={() => clickPile(view, mode, pile.id, notice, sendNow)}
                      topChallengeable={ui.topChallengeable && !locked}
                      onTopClick={() => clickTopCard(view, mode, pile.id)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {showLog && <GameLog onClose={window.innerWidth <= 1100 ? () => setShowLog(false) : undefined} />}
      </main>

      <footer className="game__bottom">
        <Hand
          view={view}
          mode={mode}
          onCard={(id) => clickHandCard(view, mode, id, notice)}
          onAbility={(id) => clickAbility(view, mode, id, notice)}
        />
        <ActionButtons view={view} mode={mode} waitingText={waitingText} locked={locked} sending={sending} sendNow={sendNow} />
      </footer>

      <FlyLayer />
      <ChallengeReveal />
      <FinalCardReveal />
      <ReactionPrompt view={view} />
      <PreviewLayer />
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {room.status === 'finished' && !animating && <Winner room={room} view={view} />}

      {menu === 'menu' && (
        <Modal title="Menu" onClose={() => setMenu(null)}>
          <p className="small">
            Room code: <b className="code">{room.code}</b>
          </p>
          <p className="small">
            Your personal rejoin code: <b className="code">{session?.rejoinCode}</b>
            <br />
            <span className="muted">
              To continue on another device, choose "Rejoin a seat" on the home screen and enter both codes. Keep it
              secret: it opens your hand.
            </span>
          </p>
          <div className="modal__actions">
            {room.hostId === view.you && room.status === 'playing' && (
              <button className="btn btn--danger" onClick={() => setMenu('end')}>
                End game for everyone
              </button>
            )}
            <button className="btn btn--ghost" onClick={() => setMenu('leave')}>
              Leave table
            </button>
          </div>
        </Modal>
      )}
      {menu === 'end' && (
        <Modal
          title="End the game?"
          onClose={() => setMenu(null)}
          actions={
            <>
              <button
                className="btn btn--danger"
                onClick={() => {
                  setMenu(null);
                  void commands.endGame();
                }}
              >
                End with no winner
              </button>
              <button className="btn btn--ghost" onClick={() => setMenu(null)}>
                Keep playing
              </button>
            </>
          }
        >
          <p>The game stops for everyone and nobody wins. You can start a rematch afterwards.</p>
        </Modal>
      )}
      {menu === 'leave' && (
        <Modal
          title="Leave the table?"
          onClose={() => setMenu(null)}
          actions={
            <>
              <button
                className="btn btn--danger"
                onClick={() => {
                  setMenu(null);
                  void commands.leave();
                }}
              >
                Leave
              </button>
              <button className="btn btn--ghost" onClick={() => setMenu(null)}>
                Stay
              </button>
            </>
          }
        >
          <p>
            Your seat stays in the game and your turns will time out (drawing a card). You can come back with your
            rejoin code <b className="code">{session?.rejoinCode}</b> and the room code <b className="code">{room.code}</b>.
          </p>
        </Modal>
      )}
      <span className="sr-only" aria-live="polite">
        {view.legal.playNotice ?? ''}
        {view.piles.length > 4 ? ` A fifth pile, ${cardName(view.piles[4].type)}, is open.` : ''}
      </span>
    </div>
  );
}
