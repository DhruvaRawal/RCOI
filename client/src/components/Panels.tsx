import {
  ABILITY_CARDS,
  ABILITY_TYPES,
  BEATS,
  BLUFF_TYPES,
  type PlayerView,
  cardName,
} from '@rcoi/shared';
import { useEffect, useRef, useState } from 'react';
import { CARD_RATIO } from '../assets/manifest';
import { usePreviewStore } from '../game/preview';
import { resetMode } from '../game/turnUI';
import { useCountdown } from '../game/useCountdown';
import { commands, nameOf, useStore } from '../net/store';
import { Card } from './Card';
import { Modal } from './Modal';

// ---------------------------------------------------------------------------
// Game log
// ---------------------------------------------------------------------------

export function GameLog({ onClose }: { onClose?: () => void }) {
  const log = useStore((s) => s.log);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);
  return (
    <aside className="log panel" aria-label="Game log">
      <div className="log__head">
        <h3>Court record</h3>
        {onClose && (
          <button className="btn btn--ghost btn--icon btn--small" onClick={onClose} aria-label="Close log">
            ✕
          </button>
        )}
      </div>
      <ol className="log__list">
        {log.map((e) => (
          <li key={e.seq} className={`log__item log__item--${e.tone}`}>
            {e.text}
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function RulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Rules of the Court" onClose={onClose} wide className="rules">
      <section>
        <h3>Goal</h3>
        <p>Be the first with no bluffing cards. Ability cards don't count.</p>
      </section>
      <section>
        <h3>Your turn: exactly one action</h3>
        <ul>
          <li>
            <b>Play</b> one bluffing card face down on <i>any</i> open pile. On its matching pile it's honest; anywhere
            else it's a bluff. Vidushaka has no pile, so it is always a bluff. Your meeple marks the new card; the card
            it covers loses its meeple for good.
          </li>
          <li>
            <b>Challenge</b> the top card of a pile if it has a meeple and someone else played it. Pick it, then pick a
            challenger card from your hand.
          </li>
          <li>
            <b>Draw</b> one bluffing card.
          </li>
          <li>
            <b>Use an ability</b>: Mahamantri, Dandanayaka or Raj Bhandari.
          </li>
        </ul>
      </section>
      <section>
        <h3>Last card</h3>
        <p>
          With one bluffing card left it can never be played face down. If it matches a pile, you may play it face up
          there. Vidushaka may be played face up on any pile. Otherwise you can't play it: challenge, use an ability or
          draw instead. You can still challenge with it.
        </p>
      </section>
      <section>
        <h3>Challenges</h3>
        <ol>
          <li>If the card matches its pile, the challenger loses.</li>
          <li>If it doesn't, the challenger wins only if their card beats it (table below). Ties lose.</li>
        </ol>
        <p>
          <b>Challenger loses:</b> keeps their card, draws 1, and receives a card chosen by the challenged player. The
          revealed card stays face up and can't be challenged again.
          <br />
          <b>Challenger wins:</b> gives the bluffer 1 card (it may be the challenger card); the bluffer takes the
          revealed card back and draws 1; the challenger draws an ability card.
        </p>
      </section>
      <section>
        <h3>Who beats whom</h3>
        <WinTable />
      </section>
      <section>
        <h3>Ability cards</h3>
        <ul className="rules__abilities">
          {ABILITY_TYPES.map((t) => (
            <li key={t}>
              <Card kind="ability" type={t} width="44px" />
              <span>
                <b>
                  {ABILITY_CARDS[t].name} ×{ABILITY_CARDS[t].count}
                </b>
                : {ABILITY_CARDS[t].effect}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Ability cards are private and can never be given or exchanged. Used ones go face up on the discard pile (Raj
          Bhandari is removed from the game).
        </p>
      </section>
      <section>
        <h3>Other rulings</h3>
        <ul className="small">
          <li>A card that was ever covered can never be challenged, even if it becomes the top card again.</li>
          <li>A card that goes back to a hand or into the deck is a fresh card when played again.</li>
          <li>Giving away your last card after a challenge wins immediately.</li>
          <li>If the bluffing deck is empty, all covered cards are shuffled into a new deck.</li>
          <li>Turns: 45 s. Follow-up choices: 20 s. A turn that runs out draws a card for you.</li>
        </ul>
      </section>
    </Modal>
  );
}

/** Two-letter labels for the compact table. */
const SHORT: Record<string, string> = {
  RAJA: 'Rj',
  RANI: 'Rn',
  YUVARAJA: 'Yv',
  SENAPATI: 'Sp',
  GAJADHYAKSHA: 'Gj',
  YODHA: 'Yd',
  VIDUSHAKA: 'Vd',
};

export function WinTable({ compact = false }: { compact?: boolean }) {
  const label = (t: (typeof BLUFF_TYPES)[number]) => (compact ? SHORT[t] : cardName(t));
  return (
    <div className={`wintable-wrap${compact ? ' wintable-wrap--compact' : ''}`}>
      <table className={`wintable${compact ? ' wintable--compact' : ''}`}>
        <caption className="sr-only">Rows: challenger card. Columns: revealed target. ✓ means the challenger wins.</caption>
        <thead>
          <tr>
            <th scope="col" className="wintable__corner">
              {compact ? '↓ vs →' : 'challenger ↓ / target →'}
            </th>
            {BLUFF_TYPES.map((t) => (
              <th key={t} scope="col" title={cardName(t)}>
                {label(t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BLUFF_TYPES.map((row) => (
            <tr key={row}>
              <th scope="row" title={cardName(row)}>
                {label(row)}
              </th>
              {BLUFF_TYPES.map((col) => {
                const win = BEATS[row].includes(col);
                return (
                  <td key={col} className={win ? 'is-win' : row === col ? 'is-tie' : ''}>
                    {win ? '✓' : row === col ? '=' : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Always-visible small win table on the table; click to see it full size. */
export function MiniWinTable() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="miniwin" onClick={() => setOpen(true)} title="Who beats whom (click to enlarge)" aria-label="Show the win table full size">
        <span className="miniwin__title">Who beats whom ⤢</span>
        <WinTable compact />
      </button>
      {open && (
        <Modal title="Who beats whom" onClose={() => setOpen(false)} className="miniwin-modal">
          <p className="small muted" style={{ textAlign: 'center', marginTop: 0 }}>
            Rows: the challenger's card. Columns: the revealed card (only when it doesn't match its pile). ✓ = the
            challenger wins; ties lose.
          </p>
          <WinTable />
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Reaction (Chikitsaka) prompt
// ---------------------------------------------------------------------------

export function ReactionPrompt({ view }: { view: PlayerView }) {
  const timer = useStore((s) => s.timer);
  const reveal = useStore((s) => s.reveal);
  const [sending, setSending] = useState(false);
  const { seconds } = useCountdown(timer?.player === view.you ? timer : null);
  if (view.legal.awaiting !== 'reaction' || !view.legal.reaction || reveal) return null;
  const ids = view.legal.reaction.abilityIds;
  const lc = view.lastChallenge;
  const challenger = lc ? nameOf(lc.challenger) : 'The challenger';
  const react = async (abilityId: string | null) => {
    setSending(true);
    await commands.act({ type: 'REACT', abilityId });
    setSending(false);
    resetMode();
  };
  return (
    <Modal
      title="Your bluff was caught"
      actions={
        <>
          {ids.length > 0 && (
            <button className="btn btn--teal" disabled={sending} onClick={() => react(ids[0])}>
              Use Chikitsaka
            </button>
          )}
          <button className="btn btn--gold" disabled={sending} onClick={() => react(null)}>
            Accept the penalty
          </button>
        </>
      }
    >
      <p>
        {challenger}
        {lc?.challengerCardType ? `'s ${cardName(lc.challengerCardType)}` : ''} beat your{' '}
        {lc ? cardName(lc.targetType) : 'card'}.
      </p>
      <p className="small">
        <b>Penalty:</b> you take your card back, draw 1 card and receive a card from {challenger}.
      </p>
      {ids.length > 0 ? (
        <p className="small">
          <b>Chikitsaka:</b> you only take your card back. {challenger} still draws an ability card.
        </p>
      ) : (
        <p className="small muted">You have no Chikitsaka to cancel the penalty.</p>
      )}
      <p className="muted small">Decide within {seconds}s, or the penalty is applied.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Larger card preview (hover / long press)
// ---------------------------------------------------------------------------

export function PreviewLayer() {
  const { type, rect } = usePreviewStore();
  if (!type || !rect) return null;
  const h = Math.min(window.innerHeight * 0.62, 460);
  const w = h * CARD_RATIO;
  const spaceRight = window.innerWidth - rect.right;
  const left = spaceRight > w + 24 ? rect.right + 12 : Math.max(8, rect.left - w - 12);
  const top = Math.min(Math.max(8, rect.top + rect.height / 2 - h / 2), window.innerHeight - h - 8);
  const isBluff = (BLUFF_TYPES as readonly string[]).includes(type);
  return (
    <div className="preview" style={{ left, top, width: w }} aria-hidden="true">
      <Card kind={isBluff ? 'bluff' : 'ability'} type={type} width={`${w}px`} previewable={false} />
      <div className="preview__info">
        <b>{cardName(type)}</b>
        {isBluff ? (
          <span>
            Beats: {BEATS[type as keyof typeof BEATS].map((t) => cardName(t)).join(', ') || 'none'}
          </span>
        ) : (
          <span>{ABILITY_CARDS[type as keyof typeof ABILITY_CARDS].effect}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
