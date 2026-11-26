import { motion } from 'motion/react';
import { CARD_RATIO } from '../assets/manifest';
import { useStore } from '../net/store';
import { Card } from './Card';

/** Cards flying between table anchors (deal, play, draw, give, take back, abilities). */
export function FlyLayer() {
  const flights = useStore((s) => s.flights);
  return (
    <div className="flylayer" aria-hidden="true">
      {flights.map((f) => {
        const w = Math.max(38, Math.min(92, Math.min(f.to.width, f.to.height * CARD_RATIO) || 60));
        const h = w / CARD_RATIO;
        const fx = f.from.left + f.from.width / 2 - w / 2;
        const fy = f.from.top + f.from.height / 2 - h / 2;
        const tx = f.to.left + f.to.width / 2 - w / 2;
        const ty = f.to.top + f.to.height / 2 - h / 2;
        return (
          <motion.div
            key={f.id}
            className="flight"
            style={{ width: w, position: 'fixed', left: 0, top: 0 }}
            initial={{ x: fx, y: fy, opacity: 0, rotate: -6, scale: 0.92 }}
            animate={{ x: tx, y: ty, opacity: f.vanish ? [1, 1, 0] : 1, rotate: 0, scale: f.vanish ? [1, 1.15, 0.6] : 1 }}
            transition={{ duration: f.duration / 1000, delay: f.delay / 1000, ease: [0.25, 0.8, 0.25, 1] }}
          >
            <Card kind={f.kind} type={f.type} width={`${w}px`} previewable={false} />
          </motion.div>
        );
      })}
    </div>
  );
}
