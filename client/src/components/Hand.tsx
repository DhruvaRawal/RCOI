import { ABILITY_TYPES, BLUFF_TYPES, type PlayerView, cardName } from '@rcoi/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { type Mode, abilityOption, handCardUI } from '../game/turnUI';
import { Card } from './Card';

interface HandProps {
  view: PlayerView;
  mode: Mode;
  onCard: (id: string) => void;
  onAbility: (id: string) => void;
}

/** Spacing so a row of cards always fits its container (overlapping when needed). */
function useFanStep(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const card = el.querySelector('.card') as HTMLElement | null;
      const cw = card?.offsetWidth ?? 80;
      if (count <= 1) return setStep(null);
      const natural = cw + 8;
      const fit = (w - cw) / (count - 1);
      setStep(fit < natural ? Math.max(14, fit) : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);
  return { ref, step };
}

const bluffOrder = (t: string) => BLUFF_TYPES.indexOf(t as never);
const abilityOrder = (t: string) => ABILITY_TYPES.indexOf(t as never);

/** The local player's hand: bluffing cards and ability cards, clearly separated. */
export function Hand({ view, mode, onCard, onAbility }: HandProps) {
  const bluff = [...view.hand].sort((a, b) => bluffOrder(a.type) - bluffOrder(b.type));
  const abilities = [...view.abilities].sort((a, b) => abilityOrder(a.type) - abilityOrder(b.type));
  const fan = useFanStep(bluff.length);
  const myTurn = view.legal.awaiting === 'turn';

  return (
    <div className="hand" data-anchor="hand">
      <section className="hand__group hand__group--bluff" aria-label="Your bluffing cards">
        <div className="hand__label">
          Bluffing cards <b>{bluff.length}</b>
        </div>
        <div className="hand__row" ref={fan.ref}>
          {bluff.map((c, i) => {
            const ui = handCardUI(view, mode, c.id);
            return (
              <div
                key={c.id}
                className="hand__slot"
                style={fan.step !== null && i > 0 ? { marginLeft: `calc(${fan.step}px - var(--hand-card-w))` } : undefined}
              >
                <Card
                  kind="bluff"
                  type={c.type}
                  width="var(--hand-card-w)"
                  selected={ui.selected}
                  highlight={ui.highlight}
                  dimmed={'dimmed' in ui ? ui.dimmed : false}
                  onClick={ui.clickable ? () => onCard(c.id) : undefined}
                  title={cardName(c.type)}
                />
              </div>
            );
          })}
          {bluff.length === 0 && <div className="hand__empty muted">No bluffing cards</div>}
        </div>
      </section>
      <div className="hand__divider" aria-hidden="true" />
      <section className="hand__group hand__group--ability" aria-label="Your ability cards">
        <div className="hand__label">
          Abilities <b>{abilities.length}</b>
        </div>
        <div className="hand__row hand__row--ability">
          {abilities.map((c) => {
            const opt = abilityOption(view, c.id);
            const active = mode.kind === 'ability' && mode.abilityId === c.id;
            const usable = myTurn && !!opt?.usable;
            return (
              <div key={c.id} className="hand__slot hand__slot--ability">
                <Card
                  kind="ability"
                  type={c.type}
                  width="calc(var(--hand-card-w) * 0.82)"
                  selected={active}
                  highlight={usable && !active && mode.kind === 'idle' ? 'legal' : null}
                  dimmed={!usable}
                  onClick={() => onAbility(c.id)}
                  title={`${cardName(c.type)}${opt?.reason ? ` - ${opt.reason}` : ''}`}
                />
              </div>
            );
          })}
          {abilities.length === 0 && <div className="hand__empty muted small">Win a challenge to draw ability cards</div>}
        </div>
      </section>
    </div>
  );
}
