import { type PileView, type PlayerId, cardName } from '@rcoi/shared';
import { Card } from './Card';

interface PileProps {
  pile: PileView;
  colorOf: (id: PlayerId) => string;
  nameOf: (id: PlayerId) => string;
  /** Show the viewer's own face-down top card (private peek toggle). */
  peekOwn: boolean;
  selectable: boolean;
  selected: boolean;
  challengeTarget: boolean;
  challengeSelected?: boolean;
  /** Covered cards shown as strips; older ones are summarised as "+n". */
  maxStrips: number;
  onClick?: () => void;
  /** The top card can be tapped to challenge it. */
  topChallengeable?: boolean;
  /** Returns true if the tap was handled. */
  onTopClick?: () => boolean;
}

/**
 * One open pile: its open card on top, the played cards below it (newest at the bottom,
 * covering the previous one), and how many cards have been played there.
 */
export function Pile({
  pile,
  colorOf,
  nameOf,
  peekOwn,
  selectable,
  selected,
  challengeTarget,
  challengeSelected,
  maxStrips,
  onClick,
  topChallengeable,
  onTopClick,
}: PileProps) {
  const cards = pile.cards;
  const top = cards[cards.length - 1];
  const covered = cards.slice(0, -1);
  const shownCovered = maxStrips > 0 ? covered.slice(-maxStrips) : [];
  const hiddenCovered = covered.length - shownCovered.length;
  const name = cardName(pile.type);
  const clickable = selectable || challengeTarget;

  const cls = [
    'pile',
    selectable && 'is-selectable',
    selected && 'is-selected',
    challengeTarget && 'is-challenge-target',
    challengeSelected && 'is-challenge-selected',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={`${name} pile, ${pile.count} played`}
      onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.() : undefined}
    >
      <div className="pile__tag" title={name}>
        {name}
        {pile.origin === 'ability' && (
          <span className="pile__new" title={`Opened with Raj Bhandari by ${pile.createdBy ? nameOf(pile.createdBy) : 'a player'}`}>
            ✦
          </span>
        )}
      </div>
      <div className="pile__open" data-anchor={`pile-${pile.id}-open`}>
        <Card kind="bluff" type={pile.type} width="var(--pc-w)" title={`Open card: ${name}`} />
      </div>
      <div
        className="pile__stack"
        data-anchor={`pile-${pile.id}-next`}
        style={{ ['--strips' as string]: shownCovered.length }}
      >
        {!top && <div className="slot slot--pile" aria-hidden="true" />}
        {hiddenCovered > 0 && <span className="pile__more">+{hiddenCovered}</span>}
        {shownCovered.map((c, i) => (
          <div key={c.pid} className="pile__strip" style={{ ['--i' as string]: i }}>
            <Card kind="bluff" type={c.type} width="var(--pc-w)" previewable={c.faceUp} title={c.faceUp ? `${cardName(c.type!)} (covered)` : 'Covered card'} />
          </div>
        ))}
        {top && (
          // Keyed by placement: a newly played card mounts fresh (already face down) instead of reusing the
          // previous top card's element, which would visibly flip from that card's face to the new back.
          <div
            key={top.pid}
            className={`pile__top${topChallengeable && !challengeSelected ? ' is-challengeable' : ''}`}
            data-anchor={`pile-${pile.id}-top`}
            style={{ ['--i' as string]: shownCovered.length }}
            role={topChallengeable ? 'button' : undefined}
            tabIndex={topChallengeable ? 0 : undefined}
            aria-label={topChallengeable ? `Challenge ${nameOf(top.owner)}'s card on the ${name} pile` : undefined}
            onClick={(e) => {
              if (topChallengeable && onTopClick?.()) e.stopPropagation();
            }}
            onKeyDown={(e) => {
              if (topChallengeable && (e.key === 'Enter' || e.key === ' ') && onTopClick?.()) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <Card
              kind="bluff"
              type={top.faceUp ? top.type : peekOwn && top.ownType ? top.ownType : null}
              width="var(--pc-w)"
              className={!top.faceUp && peekOwn && top.ownType ? 'is-peek' : undefined}
              badge={!top.faceUp && peekOwn && top.ownType ? <span title="Only you can see this">your card</span> : undefined}
              meepleColor={top.meeple ? colorOf(top.owner) : null}
              meepleLabel={`${nameOf(top.owner)}'s meeple`}
              highlight={challengeSelected ? null : challengeTarget ? 'target' : null}
              selected={challengeSelected}
              title={
                top.faceUp
                  ? `${cardName(top.type!)} played by ${nameOf(top.owner)}${top.challengeable ? '' : ' (cannot be challenged)'}`
                  : `Face-down card played by ${nameOf(top.owner)}${top.challengeable ? '' : ' (cannot be challenged)'}`
              }
            />
          </div>
        )}
      </div>
      <div className="pile__count" aria-hidden="true">
        {pile.count} played
      </div>
    </div>
  );
}
