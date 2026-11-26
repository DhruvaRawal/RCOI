import type { BluffType } from './cards';

/**
 * Who beats whom when a challenge reveals a mismatched target.
 * This is an explicit lookup table, NOT a linear ranking
 * (e.g. Vidushaka beats Raja and Rani, but loses to everyone else).
 *
 * BEATS[challengerCard] = the target types that challenger card beats.
 */
export const BEATS: Readonly<Record<BluffType, readonly BluffType[]>> = {
  RAJA: ['RANI', 'YUVARAJA', 'SENAPATI', 'GAJADHYAKSHA', 'YODHA'],
  RANI: ['YUVARAJA', 'SENAPATI', 'GAJADHYAKSHA', 'YODHA'],
  YUVARAJA: ['SENAPATI', 'GAJADHYAKSHA', 'YODHA', 'VIDUSHAKA'],
  SENAPATI: ['GAJADHYAKSHA', 'YODHA', 'VIDUSHAKA'],
  GAJADHYAKSHA: ['YODHA', 'VIDUSHAKA'],
  YODHA: ['VIDUSHAKA'],
  VIDUSHAKA: ['RAJA', 'RANI'],
};

/** True when `attacker` beats `defender` according to the table. Ties are not wins. */
export function beats(attacker: BluffType, defender: BluffType): boolean {
  return BEATS[attacker].includes(defender);
}
