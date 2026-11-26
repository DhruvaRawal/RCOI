/**
 * Card definitions as data. Counts, names and rules text live here;
 * behaviour for ability cards lives in engine/abilities (one handler per card).
 */

export const BLUFF_TYPES = [
  'RAJA',
  'RANI',
  'YUVARAJA',
  'SENAPATI',
  'GAJADHYAKSHA',
  'YODHA',
  'VIDUSHAKA',
] as const;
export type BluffType = (typeof BLUFF_TYPES)[number];

export const ABILITY_TYPES = ['CHIKITSAKA', 'MAHAMANTRI', 'DANDANAYAKA', 'RAJ_BHANDARI'] as const;
export type AbilityType = (typeof ABILITY_TYPES)[number];

export type CardKind = 'bluff' | 'ability';
export type CardType = BluffType | AbilityType;

export interface BluffCardDef {
  type: BluffType;
  name: string;
  count: number;
  /** Whether this card type can ever be an open pile. Vidushaka never can. */
  canOpenPile: boolean;
}

export interface AbilityCardDef {
  type: AbilityType;
  name: string;
  count: number;
  /** Short effect text shown on the card tooltip and the rules panel. */
  effect: string;
}

export const BLUFF_CARDS: Record<BluffType, BluffCardDef> = {
  RAJA: { type: 'RAJA', name: 'Raja', count: 7, canOpenPile: true },
  RANI: { type: 'RANI', name: 'Rani', count: 7, canOpenPile: true },
  YUVARAJA: { type: 'YUVARAJA', name: 'Yuvaraja', count: 7, canOpenPile: true },
  SENAPATI: { type: 'SENAPATI', name: 'Senapati', count: 7, canOpenPile: true },
  GAJADHYAKSHA: { type: 'GAJADHYAKSHA', name: 'Gajadhyaksha', count: 7, canOpenPile: true },
  YODHA: { type: 'YODHA', name: 'Yodha', count: 7, canOpenPile: true },
  VIDUSHAKA: { type: 'VIDUSHAKA', name: 'Vidushaka', count: 7, canOpenPile: false },
};

export const ABILITY_CARDS: Record<AbilityType, AbilityCardDef> = {
  CHIKITSAKA: {
    type: 'CHIKITSAKA',
    name: 'Chikitsaka',
    count: 5,
    effect:
      'Play when your bluff is caught: take your card back but skip the draw and the card from the challenger.',
  },
  MAHAMANTRI: {
    type: 'MAHAMANTRI',
    name: 'Mahamantri',
    count: 2,
    effect: 'Your turn: exchange bluffing hands with any player.',
  },
  DANDANAYAKA: {
    type: 'DANDANAYAKA',
    name: 'Dandanayaka',
    count: 5,
    effect: 'Your turn: another player draws 2 bluffing cards.',
  },
  RAJ_BHANDARI: {
    type: 'RAJ_BHANDARI',
    name: 'Raj Bhandari',
    count: 1,
    effect:
      'Your turn: place a card from your hand face up as a new open pile (a type with no pile yet, never Vidushaka). Destroyed after use.',
  },
};

export function isBluffType(t: string): t is BluffType {
  return (BLUFF_TYPES as readonly string[]).includes(t);
}

export function isAbilityType(t: string): t is AbilityType {
  return (ABILITY_TYPES as readonly string[]).includes(t);
}

export function cardName(t: CardType): string {
  return isBluffType(t) ? BLUFF_CARDS[t].name : ABILITY_CARDS[t].name;
}

export const TOTAL_BLUFF_CARDS = BLUFF_TYPES.reduce((n, t) => n + BLUFF_CARDS[t].count, 0);
export const TOTAL_ABILITY_CARDS = ABILITY_TYPES.reduce((n, t) => n + ABILITY_CARDS[t].count, 0);
