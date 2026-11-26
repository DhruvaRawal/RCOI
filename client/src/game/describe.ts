/**
 * Turns (already filtered) events into log lines. Events reaching the client never contain
 * other players' secrets, so the log can't leak them either.
 */
import { type BluffType, type ChallengeReason, type PlayerId, type VisibleEvent, cardName } from '@rcoi/shared';

export type LogTone = 'info' | 'good' | 'bad' | 'private' | 'turn' | 'win';

export interface LogEntry {
  seq: number;
  turn: number;
  text: string;
  tone: LogTone;
}

export type NameOf = (id: PlayerId) => string;

export function challengeVerdict(
  reason: ChallengeReason,
  target: BluffType,
  challengerCard: BluffType | null | undefined,
  pileType: BluffType,
): string {
  const t = cardName(target);
  const c = challengerCard ? cardName(challengerCard) : 'the challenger card';
  switch (reason) {
    case 'MATCHED':
      return `It really was a ${t} on the ${cardName(pileType)} pile, so the challenger loses.`;
    case 'BEATS':
      return `It was a bluff, and ${c} beats ${t}: the challenger wins.`;
    case 'TIE':
      return `It was a bluff, but ${c} only ties with ${t}. Ties go to the target: the challenger loses.`;
    case 'DOES_NOT_BEAT':
      return `It was a bluff, but ${c} doesn't beat ${t}: the challenger loses.`;
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeEvent(e: VisibleEvent, me: PlayerId, nameOf: NameOf): LogEntry | null {
  const who = (id: PlayerId) => (id === me ? 'You' : nameOf(id));
  const whose = (id: PlayerId) => (id === me ? 'your' : `${nameOf(id)}'s`);
  const mineCards = e.mine?.cards?.map((c) => cardName(c.type)).join(', ');
  const base = { seq: e.seq, turn: e.turn };
  switch (e.type) {
    case 'GAME_STARTED':
      return {
        ...base,
        tone: 'info',
        text: `The court is in session. Open piles: ${e.piles.map((p) => cardName(p.type)).join(', ')}.`,
      };
    case 'TURN_STARTED':
      return { ...base, tone: 'turn', text: e.player === me ? 'Your turn' : `${nameOf(e.player)}'s turn` };
    case 'TURN_PASSED':
      return {
        ...base,
        tone: 'info',
        text:
          e.reason === 'noLegalAction'
            ? `${who(e.player)} had no legal action, so the turn passed.`
            : `${who(e.player)} could not draw, so the turn passed.`,
      };
    case 'TIMED_OUT':
      return {
        ...base,
        tone: 'info',
        text:
          e.decision === 'turn'
            ? `${who(e.player)} ran out of time.`
            : e.decision === 'give'
              ? `${who(e.player)} ran out of time: a random card was given.`
              : `${who(e.player)} ran out of time and accepted the penalty.`,
      };
    case 'CARD_PLAYED':
      if (e.faceUp && e.cardType) {
        return { ...base, tone: 'win', text: `${who(e.player)} played the last card face up: ${cardName(e.cardType)}.` };
      }
      return {
        ...base,
        tone: 'info',
        text: `${who(e.player)} played a card face down on the ${pileLabel(e.pileId)} pile${e.player === me && mineCards ? ` (your ${mineCards})` : ''}.`,
      };
    case 'CARDS_DRAWN': {
      if (e.count === 0) {
        return {
          ...base,
          tone: 'info',
          text: `${who(e.player)} could not draw: no ${e.deck === 'ability' ? 'ability' : 'bluffing'} cards are left.`,
        };
      }
      const what = e.deck === 'ability' ? plural(e.count, 'ability card') : plural(e.count, 'card');
      return {
        ...base,
        tone: e.player === me ? 'private' : 'info',
        text: `${who(e.player)} drew ${what}${mineCards ? `: ${mineCards}` : ''}.`,
      };
    }
    case 'BLUFF_DECK_RESHUFFLED':
      return { ...base, tone: 'info', text: `The bluffing deck ran out: ${plural(e.count, 'covered card')} were shuffled into a new deck.` };
    case 'ABILITY_DECK_RESHUFFLED':
      return { ...base, tone: 'info', text: `The ability deck ran out: the discard pile (${e.count}) was shuffled into a new deck.` };
    case 'CHALLENGE': {
      const head = `${who(e.challenger)} challenged ${whose(e.challenged)} card on the ${cardName(e.pileType)} pile: it was a ${cardName(e.targetType)}.`;
      const cc = e.challengerCardType ?? (e.challenger === me ? (e.mine?.cards?.[0]?.type as BluffType) : null);
      return {
        ...base,
        tone: e.challenger === me ? (e.challengerWon ? 'good' : 'bad') : e.challenged === me ? (e.challengerWon ? 'bad' : 'good') : 'info',
        text: `${head} ${challengeVerdict(e.reason, e.targetType, cc, e.pileType)}`,
      };
    }
    case 'CARD_GIVEN':
      return {
        ...base,
        tone: mineCards ? 'private' : 'info',
        text: `${who(e.from)} gave ${e.to === me ? 'you' : nameOf(e.to)} a card${mineCards ? ` (${mineCards})` : ''}.`,
      };
    case 'CARD_TAKEN_BACK':
      return { ...base, tone: 'info', text: `${who(e.player)} took the ${cardName(e.cardType)} back.` };
    case 'REACTION_DECLINED':
      return { ...base, tone: 'info', text: `${who(e.player)} accepted the penalty.` };
    case 'ABILITY_USED':
      return {
        ...base,
        tone: 'info',
        text: `${who(e.player)} used ${cardName(e.ability)}${e.targetPlayer ? ` on ${e.targetPlayer === me ? 'you' : nameOf(e.targetPlayer)}` : ''}.`,
      };
    case 'HANDS_EXCHANGED':
      return { ...base, tone: 'info', text: `${who(e.a)} and ${e.b === me ? 'you' : nameOf(e.b)} exchanged bluffing hands.` };
    case 'PILE_CREATED':
      return { ...base, tone: 'info', text: `${who(e.player)} opened a new ${cardName(e.pileType)} pile.` };
    case 'GAME_WON':
      return {
        ...base,
        tone: 'win',
        text: `${who(e.player)} ${e.player === me ? 'win' : 'wins'} the court! ${winReasonText(e.reason)}`,
      };
  }
}

export function winReasonText(reason: string): string {
  switch (reason) {
    case 'LAST_CARD_PLAYED':
      return 'The last card was played face up.';
    case 'GAVE_LAST_CARD':
      return 'The last card was given away after a challenge.';
    case 'RAJ_BHANDARI':
      return 'The last card became a new open pile with Raj Bhandari.';
    default:
      return 'No bluffing cards left.';
  }
}

/** Filled in by the store so log lines can name piles by type. */
let pileTypes: Record<string, BluffType> = {};
export function setPileTypes(map: Record<string, BluffType>) {
  pileTypes = map;
}
function pileLabel(pileId: string): string {
  const t = pileTypes[pileId];
  return t ? cardName(t) : pileId;
}
