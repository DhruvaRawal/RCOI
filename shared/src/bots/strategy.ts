/**
 * Computer players. They decide ONLY from their own PlayerView (plus what they remember of their own
 * plays), exactly the information a human in that seat has, so bots can never cheat.
 *
 *  easy   - random legal moves
 *  medium - plays honestly when it can, saves Vidushaka for last, challenges players close to winning,
 *           uses abilities sensibly, gives away its least useful card
 *  hard   - medium + counts the cards it can account for to estimate how likely a played card is a bluff
 *           and which challenger card most likely wins
 */
import { BLUFF_CARDS, BLUFF_TYPES, type BluffType } from '../data/cards';
import { beats } from '../data/winMatrix';
import type { CardId, PlayerAction, PlayerId, VisibleEvent } from '../engine/types';
import type { PlayerView } from '../engine/view';
import { chooseBotAction } from '../testing/bot';

export const BOT_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

/** What a bot remembers between turns: the type of each card it played face down. */
export interface BotMemory {
  ownDown: Record<number, BluffType>;
}

export function newBotMemory(): BotMemory {
  return { ownDown: {} };
}

/** Feed the bot the (already filtered) events it received. */
export function observeEvents(memory: BotMemory, events: VisibleEvent[], me: PlayerId): void {
  for (const e of events) {
    if (e.type === 'CARD_PLAYED' && e.player === me && !e.faceUp) {
      const t = e.mine?.cards?.[0]?.type;
      if (t) memory.ownDown[e.placementId] = t as BluffType;
    }
  }
}

export function decideBotAction(
  view: PlayerView,
  difficulty: BotDifficulty,
  memory: BotMemory,
  rand: () => number,
): PlayerAction | null {
  if (difficulty === 'easy') return chooseBotAction(view.legal, rand);
  return smartAction(view, difficulty === 'hard', memory, rand) ?? chooseBotAction(view.legal, rand);
}

// ---------------------------------------------------------------------------

const TOTAL_PER_TYPE = 7;

/** Hard-bot knobs (exported so tests can measure each one). */
export const HARD_TUNING = {
  // Tuned by measurement: challenging is usually a losing move, so hard only challenges confident bluffs
  // and players about to win (beats medium ~76%, easy ~93% over 400 seeded games).
  challengeThreshold: 0.55,
  endgame: false, // keep-a-finisher planning: measured no gain, off by default
  safeBluff: true,
  /** 'count' = estimate from unaccounted cards; 'fixed' = medium's constant guess. */
  bluffModel: 'count' as 'count' | 'fixed',
  urgency: 1,
};

/** How many copies of each type are still unaccounted for, from this player's point of view. */
function unknownCopies(view: PlayerView, memory: BotMemory): Record<BluffType, number> {
  const known = Object.fromEntries(BLUFF_TYPES.map((t) => [t, 0])) as Record<BluffType, number>;
  for (const c of view.hand) known[c.type]++;
  const present = new Set<number>();
  for (const pile of view.piles) {
    known[pile.type]++; // open card
    for (const c of pile.cards) {
      present.add(c.pid);
      if (c.faceUp && c.type) known[c.type]++;
      else if (c.owner === view.you && memory.ownDown[c.pid]) known[memory.ownDown[c.pid]]++;
    }
  }
  // Forget own cards that left the piles (taken back or reshuffled).
  for (const pid of Object.keys(memory.ownDown)) if (!present.has(Number(pid))) delete memory.ownDown[Number(pid)];
  return Object.fromEntries(BLUFF_TYPES.map((t) => [t, Math.max(0, TOTAL_PER_TYPE - known[t])])) as Record<BluffType, number>;
}

/** How much we want to keep a card (higher = keep). */
function keepValue(view: PlayerView, t: BluffType): number {
  const pileTypes = new Set(view.piles.map((p) => p.type));
  if (!BLUFF_CARDS[t].canOpenPile) return 3; // Vidushaka: a guaranteed last card, playable face up on any pile
  return (pileTypes.has(t) ? 2 : 0) + BLUFF_TYPES.filter((x) => beats(t, x)).length * 0.1;
}

function cardType(view: PlayerView, id: CardId): BluffType {
  return view.hand.find((c) => c.id === id)!.type;
}

function smartAction(view: PlayerView, hard: boolean, memory: BotMemory, rand: () => number): PlayerAction | null {
  const legal = view.legal;
  const me = view.you;

  if (legal.awaiting === 'reaction' && legal.reaction) {
    return { type: 'REACT', abilityId: legal.reaction.abilityIds[0] ?? null };
  }
  if (legal.awaiting === 'give' && legal.give) {
    // Hand over the card that is least useful to keep (and least useful to the receiver: no honest pile).
    const ids = [...legal.give.cardIds].sort((a, b) => keepValue(view, cardType(view, a)) - keepValue(view, cardType(view, b)));
    return { type: 'GIVE', cardId: ids[0] };
  }
  if (legal.awaiting !== 'turn') return null;

  const myCount = view.hand.length;
  const others = view.players.filter((p) => p.id !== me);
  const leader = [...others].sort((a, b) => a.bluffCount - b.bluffCount)[0];
  const unknown = hard ? unknownCopies(view, memory) : null;

  // 1. A legal face-up last card wins the game.
  const lastCard = legal.play.find((o) => o.faceUp && o.pileIds.length > 0);
  if (lastCard) return { type: 'PLAY', cardId: lastCard.cardId, pileId: lastCard.pileIds[0] };

  // 2. Raj Bhandari with the last card also wins.
  const rb = legal.abilities.find((a) => a.type === 'RAJ_BHANDARI' && a.usable);
  if (rb?.cardIds?.length && myCount === 1) return { type: 'USE_ABILITY', abilityId: rb.abilityId, cardId: rb.cardIds[0] };

  // 3. Challenge when it looks worth it.
  const ch = bestChallenge(view, unknown, rand);
  if (ch) return ch;

  // 4. Abilities.
  const maha = legal.abilities.find((a) => a.type === 'MAHAMANTRI' && a.usable);
  if (maha && leader && myCount - leader.bluffCount >= (hard ? 2 : 3) && leader.bluffCount <= 3) {
    return { type: 'USE_ABILITY', abilityId: maha.abilityId, targetPlayer: leader.id };
  }
  const danda = legal.abilities.find((a) => a.type === 'DANDANAYAKA' && a.usable);
  if (danda && leader && (leader.bluffCount <= (hard ? 3 : 2) || rand() < 0.15)) {
    return { type: 'USE_ABILITY', abilityId: danda.abilityId, targetPlayer: leader.id };
  }
  if (rb?.cardIds?.length) {
    // Open a pile for a type we hold several of, so they can be played honestly.
    const counts = new Map<BluffType, number>();
    for (const c of view.hand) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
    const pick = [...rb.cardIds].sort((a, b) => (counts.get(cardType(view, b)) ?? 0) - (counts.get(cardType(view, a)) ?? 0))[0];
    if ((counts.get(cardType(view, pick)) ?? 0) >= 2 || myCount <= 3) return { type: 'USE_ABILITY', abilityId: rb.abilityId, cardId: pick };
  }

  // 5. Play: honest if possible, otherwise bluff with the least useful card. Keep Vidushaka for last.
  const playable = legal.play.filter((o) => o.pileIds.length > 0);
  if (playable.length && unknown && (HARD_TUNING.endgame || HARD_TUNING.safeBluff)) {
    const planned = hardPlay(view, playable, unknown);
    if (planned) return planned;
  }
  if (playable.length) {
    const pileOf = new Map(view.piles.map((p) => [p.type, p.id]));
    const honest = playable
      .filter((o) => pileOf.has(cardType(view, o.cardId)))
      .sort((a, b) => keepValue(view, cardType(view, a.cardId)) - keepValue(view, cardType(view, b.cardId)));
    if (honest.length) {
      const o = honest[0];
      return { type: 'PLAY', cardId: o.cardId, pileId: pileOf.get(cardType(view, o.cardId))! };
    }
    const bluffs = [...playable].sort((a, b) => keepValue(view, cardType(view, a.cardId)) - keepValue(view, cardType(view, b.cardId)));
    const card = bluffs[0];
    // Bluff onto the pile whose type is most plausible (most copies still unaccounted for).
    const piles = [...card.pileIds];
    const pileId = unknown
      ? piles.sort((a, b) => unknown[view.piles.find((p) => p.id === b)!.type] - unknown[view.piles.find((p) => p.id === a)!.type])[0]
      : piles[Math.floor(rand() * piles.length)];
    return { type: 'PLAY', cardId: card.cardId, pileId };
  }

  // 6. Nothing better: draw.
  if (legal.draw.allowed) return { type: 'DRAW' };
  return null;
}

/** A card that can end the game as the last card: it matches a pile, or has no pile at all (Vidushaka). */
function isFinisher(view: PlayerView, t: BluffType): boolean {
  return !BLUFF_CARDS[t].canOpenPile || view.piles.some((p) => p.type === t);
}

/** Chance that a challenger beats a bluffed card of type t, given the cards still unaccounted for. */
function pBeaten(t: BluffType, unknown: Record<BluffType, number>): number {
  const total = BLUFF_TYPES.reduce((n, x) => n + unknown[x], 0) || 1;
  return BLUFF_TYPES.reduce((n, c) => n + (beats(c, t) ? unknown[c] : 0), 0) / total;
}

/**
 * Hard-bot play planning:
 *  - near the end, keep a card that can finish the game and get rid of the others first;
 *  - when bluffing, use the card least likely to be beaten, on the most plausible pile.
 */
function hardPlay(
  view: PlayerView,
  playable: { cardId: CardId; pileIds: string[] }[],
  unknown: Record<BluffType, number>,
): PlayerAction | null {
  const pileOf = new Map(view.piles.map((p) => [p.type, p.id]));
  const typeOf = (id: CardId) => cardType(view, id);
  const finishers = view.hand.filter((c) => isFinisher(view, c.type));
  const plausiblePile = (ids: string[]) =>
    [...ids].sort((a, b) => unknown[view.piles.find((p) => p.id === b)!.type] - unknown[view.piles.find((p) => p.id === a)!.type])[0];

  // Endgame: with few cards left, never spend the last finisher early.
  if (HARD_TUNING.endgame && view.hand.length <= 3 && finishers.length >= 1 && finishers.length < view.hand.length) {
    const dump = playable
      .filter((o) => !isFinisher(view, typeOf(o.cardId)))
      .sort((a, b) => pBeaten(typeOf(a.cardId), unknown) - pBeaten(typeOf(b.cardId), unknown))[0];
    if (dump) return { type: 'PLAY', cardId: dump.cardId, pileId: plausiblePile(dump.pileIds) };
  }
  if (HARD_TUNING.endgame && view.hand.length <= 3 && finishers.length >= 2) {
    // Several finishers: play one honestly, keeping the most flexible (Vidushaka) for last.
    const honest = playable
      .filter((o) => pileOf.has(typeOf(o.cardId)))
      .sort((a, b) => keepValue(view, typeOf(a.cardId)) - keepValue(view, typeOf(b.cardId)))[0];
    if (honest) return { type: 'PLAY', cardId: honest.cardId, pileId: pileOf.get(typeOf(honest.cardId))! };
  }

  // No honest play: bluff with the card least likely to be beaten.
  const honestAvailable = playable.some((o) => pileOf.has(typeOf(o.cardId)));
  if (!honestAvailable && HARD_TUNING.safeBluff) {
    const card = [...playable].sort((a, b) => {
      const d = pBeaten(typeOf(a.cardId), unknown) - pBeaten(typeOf(b.cardId), unknown);
      return d !== 0 ? d : keepValue(view, typeOf(a.cardId)) - keepValue(view, typeOf(b.cardId));
    })[0];
    // Keep Vidushaka (a sure finisher) if anything else can be bluffed.
    const nonVid = playable.filter((o) => BLUFF_CARDS[typeOf(o.cardId)].canOpenPile);
    const pick = BLUFF_CARDS[typeOf(card.cardId)].canOpenPile || !nonVid.length ? card : nonVid[0];
    return { type: 'PLAY', cardId: pick.cardId, pileId: plausiblePile(pick.pileIds) };
  }
  return null;
}

function bestChallenge(view: PlayerView, unknown: Record<BluffType, number> | null, rand: () => number): PlayerAction | null {
  const legal = view.legal;
  if (!legal.challenge.pileIds.length || !view.hand.length) return null;
  let best: { score: number; action: PlayerAction } | null = null;

  for (const pileId of legal.challenge.pileIds) {
    const pile = view.piles.find((p) => p.id === pileId)!;
    const top = pile.cards[pile.cards.length - 1];
    const ownerCount = view.players.find((p) => p.id === top.owner)?.bluffCount ?? 7;

    // Chance the card is a bluff.
    let pBluff: number;
    if (unknown && HARD_TUNING.bluffModel === 'count') {
      const u = unknown[pile.type];
      const total = BLUFF_TYPES.reduce((n, t) => n + unknown[t], 0) || 1;
      const pHadOne = 1 - Math.pow(1 - u / total, ownerCount + 1);
      pBluff = Math.min(0.95, Math.max(0.05, 1 - pHadOne * 0.9));
    } else {
      pBluff = 0.35;
    }

    // Which of our cards most likely beats whatever non-matching card it is?
    const weights = BLUFF_TYPES.filter((t) => t !== pile.type).map((t) => ({
      t,
      w: (unknown ? unknown[t] + 0.25 : 1) * (t === 'VIDUSHAKA' ? 1.4 : 1),
    }));
    const wSum = weights.reduce((n, x) => n + x.w, 0) || 1;
    let bestCard: { id: CardId; p: number } | null = null;
    for (const c of view.hand) {
      const p = weights.reduce((n, x) => n + (beats(c.type, x.t) ? x.w : 0), 0) / wSum;
      if (!bestCard || p > bestCard.p) bestCard = { id: c.id, p };
    }
    if (!bestCard) continue;

    const urgency = (ownerCount <= 1 ? 0.3 : ownerCount <= 2 ? 0.15 : 0) * (unknown ? HARD_TUNING.urgency : 1);
    const score = pBluff * bestCard.p + urgency + (unknown ? 0 : (rand() - 0.5) * 0.2);
    if (!best || score > best.score) best = { score, action: { type: 'CHALLENGE', pileId, cardId: bestCard.id } };
  }

  const threshold = unknown ? HARD_TUNING.challengeThreshold : 0.3;
  return best && best.score >= threshold ? best.action : null;
}

/** Display names for bots: "BOT {name}". */
export const BOT_NAMES = [
  'Bhima',
  'Arjuna',
  'Karna',
  'Draupadi',
  'Kunti',
  'Vidura',
  'Shakuni',
  'Chanakya',
  'Birbal',
  'Tenali',
  'Ashoka',
  'Padmini',
  'Mirabai',
  'Prithvi',
  'Satyavati',
];

