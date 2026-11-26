import type { CardKind, CardType } from '@rcoi/shared';
import { cardName } from '@rcoi/shared';
import { type CSSProperties, type ReactNode, forwardRef, useRef } from 'react';
import { CARD_BACKS, CARD_FRONTS } from '../assets/manifest';
import { usePreview } from '../game/preview';
import { Meeple } from './Meeple';

export interface CardProps {
  kind: CardKind;
  /** Card type when the face is known to this player; null/undefined shows the back. */
  type?: CardType | null;
  /** Force the back even if the type is known (e.g. own face-down cards with the peek toggle off). */
  faceDown?: boolean;
  /** Width in px or a CSS length; height follows the art ratio. */
  width?: number | string;
  selected?: boolean;
  /** Visual emphasis: 'legal' = can be picked, 'target' = suggested target, 'danger' = destructive. */
  highlight?: 'legal' | 'target' | 'danger' | null;
  disabled?: boolean;
  dimmed?: boolean;
  meepleColor?: string | null;
  meepleLabel?: string;
  /** Small corner label (e.g. "yours"). */
  badge?: ReactNode;
  /** Show a large preview on hover / long-press (only for face-up cards). */
  previewable?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The single card component used for hands, piles, reveals, decks and the discard pile.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    kind,
    type,
    faceDown,
    width,
    selected,
    highlight,
    disabled,
    dimmed,
    meepleColor,
    meepleLabel,
    badge,
    previewable = true,
    onClick,
    title,
    className,
    style,
  },
  ref,
) {
  const showFace = !!type && !faceDown;
  const front = type ? CARD_FRONTS[type] : null;
  const back = CARD_BACKS[kind];
  const label = title ?? (showFace && type ? cardName(type) : kind === 'ability' ? 'Face-down ability card' : 'Face-down card');
  const { bind } = usePreview();
  const localRef = useRef<HTMLDivElement | null>(null);
  const previewBind = previewable && showFace && type ? bind(type, localRef) : {};

  const classes = [
    'card',
    `card--${kind}`,
    showFace ? 'card--up' : 'card--down',
    selected && 'is-selected',
    highlight && `is-${highlight}`,
    disabled && 'is-disabled',
    dimmed && 'is-dimmed',
    onClick && !disabled && 'is-clickable',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const cssWidth = typeof width === 'number' ? `${width}px` : width;

  return (
    <div
      ref={(el) => {
        localRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={classes}
      style={{ ...(cssWidth ? ({ '--w': cssWidth } as CSSProperties) : {}), ...style }}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-label={label}
      aria-pressed={onClick ? !!selected : undefined}
      aria-disabled={disabled || undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      {...previewBind}
    >
      <div className="card__inner">
        <div className="card__face card__front">
          {front ? (
            <img src={front} alt="" draggable={false} />
          ) : type ? (
            <div className="card__placeholder">
              <span>{cardName(type)}</span>
              <small>placeholder art</small>
            </div>
          ) : null}
        </div>
        <div className="card__face card__back">
          {back ? <img src={back} alt="" draggable={false} /> : <div className="card__placeholder"><span>RCOI</span></div>}
        </div>
      </div>
      {meepleColor && (
        <span className="card__meeple">
          <Meeple color={meepleColor} label={meepleLabel} />
        </span>
      )}
      {badge && <span className="card__badge">{badge}</span>}
    </div>
  );
});
