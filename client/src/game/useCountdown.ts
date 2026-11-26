import type { TimerView } from '@rcoi/shared';
import { useEffect, useState } from 'react';
import { useStore } from '../net/store';

/** Remaining fraction (1 -> 0) of a server deadline, corrected for clock offset. */
export function useCountdown(timer: TimerView | null | undefined) {
  const offset = useStore((s) => s.clockOffset);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!timer) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 90) {
        last = t;
        setNow(Date.now() + offset);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timer, offset]);
  if (!timer) return { fraction: 0, seconds: 0, waiting: false };
  const total = Math.max(1, timer.deadline - timer.startsAt);
  const waiting = now < timer.startsAt;
  const left = Math.max(0, timer.deadline - Math.max(now, timer.startsAt));
  return { fraction: Math.min(1, left / total), seconds: Math.ceil(left / 1000), waiting };
}
