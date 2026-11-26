import type { TimerView } from '@rcoi/shared';
import { PortraitSvg } from '../avatars/portraits';
import { useCountdown } from '../game/useCountdown';

interface AvatarProps {
  avatar: number;
  color: string;
  name: string;
  /** The timer to drain around the portrait, if this player is being waited on. */
  timer?: TimerView | null;
  size?: string;
  dim?: boolean;
}

/** Portrait in a ring of the player's colour. The ring drains while the player's timer runs. */
export function Avatar({ avatar, color, name, timer, size, dim }: AvatarProps) {
  const { fraction, seconds, waiting } = useCountdown(timer);
  const r = 46;
  const c = 2 * Math.PI * r;
  const urgent = !!timer && !waiting && fraction < 0.25;
  return (
    <div className={`avatar${dim ? ' is-dim' : ''}${timer ? ' is-timed' : ''}`} style={{ ['--avatar' as string]: size, ['--pc' as string]: color }}>
      <div className="avatar__portrait">
        <PortraitSvg index={avatar} title={name} />
      </div>
      <svg className="avatar__ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeOpacity={timer ? 0.28 : 1} strokeWidth="6" />
        {timer && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={urgent ? '#ef6a5d' : color}
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fraction)}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      {timer && !waiting && (
        <span className={`avatar__secs${urgent ? ' is-urgent' : ''}`} aria-label={`${seconds} seconds left`}>
          {seconds}
        </span>
      )}
    </div>
  );
}
