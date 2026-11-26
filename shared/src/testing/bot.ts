import type { LegalActions, PlayerAction } from '../engine/types';

/**
 * A random legal-move player, used by tests and the server play-through.
 * It only looks at LegalActions (which every client receives), so it works over the network too.
 */
export interface BotStyle {
  play: number;
  challenge: number;
  draw: number;
  ability: number;
}

export const DEFAULT_BOT_STYLE: BotStyle = { play: 6, challenge: 2, draw: 1, ability: 2 };

export function chooseBotAction(
  legal: LegalActions,
  rand: () => number,
  style: BotStyle = DEFAULT_BOT_STYLE,
): PlayerAction | null {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  if (legal.awaiting === 'give' && legal.give) return { type: 'GIVE', cardId: pick(legal.give.cardIds) };
  if (legal.awaiting === 'reaction' && legal.reaction) {
    const ids = legal.reaction.abilityIds;
    return { type: 'REACT', abilityId: ids.length && rand() < 0.7 ? pick(ids) : null };
  }
  if (legal.awaiting !== 'turn') return null;

  const plays = legal.play.filter((o) => o.pileIds.length > 0);
  const abilities = legal.abilities.filter((a) => a.usable && a.timing === 'turn');
  const options: { weight: number; make: () => PlayerAction }[] = [];

  if (plays.length) {
    options.push({
      weight: plays[0].faceUp ? 100 : style.play, // always finish with a legal last card
      make: () => {
        const o = pick(plays);
        return { type: 'PLAY', cardId: o.cardId, pileId: pick(o.pileIds) };
      },
    });
  }
  if (legal.challenge.pileIds.length) {
    const handIds = legal.play.map((o) => o.cardId);
    if (handIds.length) {
      options.push({
        weight: style.challenge,
        make: () => ({ type: 'CHALLENGE', pileId: pick(legal.challenge.pileIds), cardId: pick(handIds) }),
      });
    }
  }
  if (legal.draw.allowed) options.push({ weight: style.draw, make: () => ({ type: 'DRAW' }) });
  if (abilities.length) {
    options.push({
      weight: style.ability,
      make: () => {
        const a = pick(abilities);
        return {
          type: 'USE_ABILITY',
          abilityId: a.abilityId,
          ...(a.targetPlayers?.length ? { targetPlayer: pick(a.targetPlayers) } : {}),
          ...(a.cardIds?.length ? { cardId: pick(a.cardIds) } : {}),
        };
      },
    });
  }
  if (!options.length) return null;
  const total = options.reduce((n, o) => n + o.weight, 0);
  let r = rand() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.make();
  }
  return options[options.length - 1].make();
}

/** Small deterministic PRNG for bots (not used by the engine). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
