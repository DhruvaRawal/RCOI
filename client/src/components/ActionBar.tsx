import type { PlayerAction, PlayerView } from '@rcoi/shared';
import { type Mode, type Step, resetMode, setMode } from '../game/turnUI';
import { toast } from '../net/store';

interface ActionButtonsProps {
  view: PlayerView;
  mode: Mode;
  waitingText: string | null;
  locked: boolean;
  sending: boolean;
  sendNow: (action: PlayerAction) => void;
}

/** The four turn actions (play, challenge, draw, ability). Disabled actions say why. Lives in the bottom bar. */
export function ActionButtons({ view, mode, waitingText, locked, sending, sendNow }: ActionButtonsProps) {
  const legal = view.legal;
  const myTurn = legal.awaiting === 'turn';
  const canPlay = legal.play.some((o) => o.pileIds.length > 0);
  const usableAbilities = legal.abilities.filter((a) => a.usable);

  const playReason = canPlay ? null : (legal.playNotice ?? 'No card can be played.');
  const abilityReason = usableAbilities.length
    ? null
    : legal.abilities.length
      ? (legal.abilities[0].reason ?? 'No ability can be used now.')
      : 'You hold no ability cards.';

  return (
    <div className="actionbar" aria-live="polite">
      {myTurn && (
        <div className="actionbar__buttons" role="group" aria-label="Your turn actions">
          <ActionButton
            label="Play"
            icon="🂠"
            active={mode.kind === 'play'}
            disabled={locked || !canPlay}
            reason={playReason}
            onClick={() => setMode({ kind: 'play', cardId: null, pileId: null })}
          />
          <ActionButton
            label="Challenge"
            icon="⚔"
            active={mode.kind === 'challenge'}
            disabled={locked || legal.challenge.pileIds.length === 0}
            reason={legal.challenge.reason}
            onClick={() => setMode({ kind: 'challenge', pileId: null, cardId: null })}
          />
          <ActionButton
            label="Draw"
            icon="⇩"
            active={false}
            disabled={locked || sending || !legal.draw.allowed}
            reason={legal.draw.reason}
            onClick={() => sendNow({ type: 'DRAW' })}
          />
          <ActionButton
            label="Ability"
            icon="✦"
            active={mode.kind === 'ability'}
            disabled={locked || usableAbilities.length === 0}
            reason={abilityReason}
            onClick={() => {
              if (usableAbilities.length === 1) {
                setMode({ kind: 'ability', abilityId: usableAbilities[0].abilityId, targetPlayer: null, cardId: null });
              } else {
                setMode({ kind: 'idle' });
                toast('Tap the ability card you want to use (glowing cards can be used now).');
              }
            }}
            hint={usableAbilities.length > 1 ? 'Tap an ability card in your hand' : undefined}
          />
        </div>
      )}
      {!myTurn && !legal.awaiting && waitingText && <div className="waiting">{waitingText}</div>}
    </div>
  );
}

interface ActionPromptProps {
  view: PlayerView;
  mode: Mode;
  step: Step;
  locked: boolean;
  sending: boolean;
  sendNow: (action: PlayerAction) => void;
}

/**
 * What to do next, and Confirm / Cancel. Shown beside the local player's portrait on the table.
 * Renders nothing when there is nothing to say.
 */
export function ActionPrompt({ view, mode, step, locked, sending, sendNow }: ActionPromptProps) {
  const legal = view.legal;
  const myTurn = legal.awaiting === 'turn';
  const showCancel = !step.confirm && mode.kind !== 'idle' && myTurn;
  const idleHint = myTurn && mode.kind === 'idle' && !legal.playNotice;
  if (!legal.awaiting || legal.awaiting === 'reaction') return null;
  if (!step.prompt && !step.confirm && !legal.playNotice && !idleHint && !showCancel) return null;

  return (
    <div className="seat-prompt" aria-live="polite" onClick={(e) => e.stopPropagation()}>
      {legal.playNotice && myTurn && <div className="notice notice--lastcard">{legal.playNotice}</div>}
      {step.prompt && <div className="prompt">{step.prompt}</div>}
      {idleHint && <div className="prompt prompt--soft">Your turn: choose one action.</div>}
      {step.confirm && (
        <div className="confirm">
          <span className="confirm__text">{step.confirm.text}</span>
          <span className="confirm__buttons">
            <button className="btn btn--gold" onClick={() => sendNow(step.confirm!.action)} disabled={sending || locked}>
              Confirm
            </button>
            {myTurn && (
              <button className="btn btn--ghost" onClick={resetMode} disabled={sending}>
                Cancel
              </button>
            )}
          </span>
        </div>
      )}
      {showCancel && (
        <button className="btn btn--ghost btn--small seat-prompt__cancel" onClick={resetMode}>
          Cancel
        </button>
      )}
    </div>
  );
}

function ActionButton(props: {
  label: string;
  icon: string;
  active: boolean;
  disabled: boolean;
  reason: string | null;
  hint?: string;
  onClick: () => void;
}) {
  const title = props.disabled ? (props.reason ?? '') : (props.hint ?? props.label);
  return (
    <button className={`btn action-btn${props.active ? ' is-active' : ''}`} disabled={props.disabled} onClick={props.onClick} title={title}>
      <span className="action-btn__icon" aria-hidden="true">
        {props.icon}
      </span>
      {props.label}
      {props.disabled && props.reason && <span className="sr-only">: {props.reason}</span>}
    </button>
  );
}
