import { cardName } from '@rcoi/shared';
import { useEffect, useState } from 'react';
import { challengeVerdict } from '../game/describe';
import { type RevealInfo, nameOf, useStore } from '../net/store';
import { Card } from './Card';

/**
 * Shows both relevant cards and why that side won, long enough for everyone to follow.
 * Stages: both face down -> target flips -> challenger card flips (only if it decided) -> verdict.
 */
export function ChallengeReveal() {
  const reveal = useStore((s) => s.reveal);
  const me = useStore((s) => s.view?.you);
  if (!reveal || !me) return null;
  return <RevealStage key={reveal.key} reveal={reveal} me={me} />;
}

function RevealStage({ reveal, me }: { reveal: RevealInfo; me: string }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const d = reveal.durationMs;
    const t = [setTimeout(() => setStage(1), d * 0.14), setTimeout(() => setStage(2), d * 0.3), setTimeout(() => setStage(3), d * 0.42)];
    return () => t.forEach(clearTimeout);
  }, [reveal]);

  const who = (id: string) => (id === me ? 'You' : nameOf(id));
  const challengerShown = !reveal.matched || reveal.challenger === me;
  const winner = reveal.challengerWon ? reveal.challenger : reveal.challenged;
  const cc = challengerShown ? reveal.challengerCardType : null;

  return (
    <div className="reveal-backdrop" role="alertdialog" aria-label="Challenge reveal">
      <div className="reveal panel">
        <h2 className="reveal__title">Challenge!</h2>
        <p className="reveal__sub">
          {who(reveal.challenger)} {reveal.challenger === me ? 'challenge' : 'challenges'}{' '}
          {reveal.challenged === me ? 'your' : `${nameOf(reveal.challenged)}'s`} card on the{' '}
          <b>{cardName(reveal.pileType)}</b> pile
        </p>
        <div className="reveal__cards">
          <figure className="reveal__card">
            <Card kind="bluff" type={stage >= 1 ? reveal.targetType : null} width="var(--reveal-w)" previewable={false} />
            <figcaption>
              {reveal.challenged === me ? 'Your card' : `${nameOf(reveal.challenged)}'s card`}
              <b
                className={`tag ${reveal.matched ? 'tag--ok' : 'tag--bad'}`}
                style={{ visibility: stage >= 2 ? 'visible' : 'hidden' }}
              >
                {reveal.matched ? 'honest' : 'bluff'}
              </b>
            </figcaption>
          </figure>
          <div className="reveal__vs">vs</div>
          <figure className="reveal__card">
            <Card kind="bluff" type={stage >= 2 && cc ? cc : null} width="var(--reveal-w)" previewable={false} />
            <figcaption>
              {reveal.challenger === me ? 'Your challenger card' : `${nameOf(reveal.challenger)}'s challenger card`}
              {reveal.matched && reveal.challenger === me && <small className="muted"> (only you see this)</small>}
              {reveal.matched && reveal.challenger !== me && <small className="muted"> (not revealed: it didn't matter)</small>}
            </figcaption>
          </figure>
        </div>
        <div className={`reveal__verdict${stage >= 3 ? ' is-shown' : ''}`}>
          <p>{challengeVerdict(reveal.reason, reveal.targetType, cc, reveal.pileType)}</p>
          <p className="reveal__winner">
            {who(winner)} {winner === me ? 'win' : 'wins'} the challenge
          </p>
        </div>
      </div>
    </div>
  );
}

/** The face-up last card, shown to everyone before the winner screen. */
export function FinalCardReveal() {
  const fc = useStore((s) => s.finalCard);
  const me = useStore((s) => s.view?.you);
  if (!fc) return null;
  return (
    <div className="reveal-backdrop" role="alertdialog" aria-label="Last card">
      <div className="reveal panel reveal--final">
        <h2 className="reveal__title">The last card!</h2>
        <Card kind="bluff" type={fc.type} width="var(--reveal-w)" previewable={false} className="final-card" />
        <p className="reveal__sub">
          {fc.player === me ? 'You play' : `${nameOf(fc.player)} plays`} their last card face up: <b>{cardName(fc.type)}</b>
        </p>
      </div>
    </div>
  );
}
