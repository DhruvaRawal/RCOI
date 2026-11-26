import type { CardKind, CardType } from '@rcoi/shared';
import { Card } from './Card';

interface CardStackProps {
  kind: CardKind;
  count: number;
  /** Face-up top card (discard pile); omit for a face-down deck. */
  topType?: CardType | null;
  label: string;
  anchor: string;
  width?: string;
  /** Tapping the stack does something (e.g. draw from the bluffing deck). */
  onClick?: () => void;
  /** Visually invite a tap (the action is available now). */
  inviting?: boolean;
  /** Tooltip / accessible label for the tap action. */
  actionLabel?: string;
}

/** A deck or discard pile: a few offset layers, the top card and a count. */
export function CardStack({ kind, count, topType, label, anchor, width, onClick, inviting, actionLabel }: CardStackProps) {
  const layers = Math.min(4, Math.max(0, count - 1));
  return (
    <div className={`stack stack--${kind}${inviting ? ' is-inviting' : ''}`} style={{ ['--w' as string]: width }}>
      <div
        className="stack__cards"
        data-anchor={anchor}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        title={actionLabel}
        aria-label={onClick ? actionLabel : undefined}
        onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      >
        {count === 0 ? (
          <div className="slot slot--empty" aria-label={`${label}: empty`}>
            <span>empty</span>
          </div>
        ) : (
          <>
            {Array.from({ length: layers }, (_, i) => (
              <div key={i} className="stack__layer" style={{ transform: `translate(${(layers - i) * 1.5}px, ${(layers - i) * -1.5}px)` }} />
            ))}
            <Card kind={kind} type={topType ?? null} width={width} title={`${label}: ${count}`} />
          </>
        )}
      </div>
      <div className="stack__label">
        <span>{label}</span>
        <b>{count}</b>
      </div>
    </div>
  );
}
