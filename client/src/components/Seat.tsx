import type { PlayerId, PublicPlayerView, SeatView, TimerView } from '@rcoi/shared';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from './Avatar';

interface SeatProps {
  seat: SeatView;
  stats: PublicPlayerView | undefined;
  isMe: boolean;
  isCurrent: boolean;
  timer: TimerView | null;
  /** What this player is doing right now (e.g. "choosing a card to give"). */
  status?: string | null;
  selectable?: boolean;
  selected?: boolean;
  onClick?: (id: PlayerId) => void;
  style?: CSSProperties;
  /** Shown to the right of the portrait (the local player's prompts and confirmations). */
  aside?: ReactNode;
}

export function Seat({ seat, stats, isMe, isCurrent, timer, status, selectable, selected, onClick, style, aside }: SeatProps) {
  const cls = [
    'seat',
    isMe && 'seat--me',
    isCurrent && 'is-current',
    !seat.connected && 'is-offline',
    selectable && 'is-selectable',
    selected && 'is-selected',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      style={{ ...style, ['--pc' as string]: seat.color }}
      data-anchor={isMe ? 'seat-me' : `seat-${seat.playerId}`}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-label={`${seat.name}${isMe ? ' (you)' : ''}: ${stats?.bluffCount ?? 0} bluffing cards, ${stats?.abilityCount ?? 0} ability cards`}
      onClick={selectable ? () => onClick?.(seat.playerId) : undefined}
      onKeyDown={selectable ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.(seat.playerId) : undefined}
    >
      <Avatar avatar={seat.avatar} color={seat.color} name={seat.name} timer={timer} dim={!seat.connected} />
      <div className="seat__plate">
        <div className="seat__name">
          {seat.isHost && (
            <span className="seat__crown" title="Host" aria-label="Host">
              ♛
            </span>
          )}
          <span className="seat__label">{isMe ? `${seat.name} (you)` : seat.name}</span>
        </div>
        <div className="seat__counts">
          <span className="count count--bluff" title="Bluffing cards">
            <i aria-hidden="true" />
            {stats?.bluffCount ?? 0}
          </span>
          <span className="count count--ability" title="Ability cards">
            <i aria-hidden="true" />
            {stats?.abilityCount ?? 0}
          </span>
        </div>
        {!seat.connected && <div className="seat__status is-offline">disconnected</div>}
        {seat.connected && status && <div className="seat__status">{status}</div>}
      </div>
      {aside && <div className="seat__aside">{aside}</div>}
    </div>
  );
}
