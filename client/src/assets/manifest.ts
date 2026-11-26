/**
 * The ONE place that maps card types to images.
 * To swap art, replace the file or change the import here. Missing art falls back to a
 * clearly labelled placeholder (see Card.tsx) - set an entry to null to see it.
 */
import type { AbilityType, BluffType, CardKind } from '@rcoi/shared';

import chikitsaka from './cards/ability/chikitsaka.jpg';
import dandanayaka from './cards/ability/dandanayaka.jpg';
import mahamantri from './cards/ability/mahamantri.jpg';
import rajBhandari from './cards/ability/raj-bhandari.jpg';
import abilityBack from './cards/ability/back.jpg';
import gajadhyaksha from './cards/bluff/gajadhyaksha.jpg';
import raja from './cards/bluff/raja.jpg';
import rani from './cards/bluff/rani.jpg';
import senapati from './cards/bluff/senapati.jpg';
import vidushaka from './cards/bluff/vidushaka.jpg';
import yodha from './cards/bluff/yodha.jpg';
import yuvaraja from './cards/bluff/yuvaraja.jpg';
import bluffBack from './cards/bluff/back.jpg';

export const CARD_FRONTS: Record<BluffType | AbilityType, string | null> = {
  RAJA: raja,
  RANI: rani,
  YUVARAJA: yuvaraja, // art file was "Yuvaraj.jpg"
  SENAPATI: senapati,
  GAJADHYAKSHA: gajadhyaksha,
  YODHA: yodha,
  VIDUSHAKA: vidushaka,
  CHIKITSAKA: chikitsaka,
  MAHAMANTRI: mahamantri,
  DANDANAYAKA: dandanayaka,
  RAJ_BHANDARI: rajBhandari, // resized from "Raj Bhandari.png" (1057x1488) to 728x1024
};

export const CARD_BACKS: Record<CardKind, string | null> = {
  bluff: bluffBack,
  ability: abilityBack,
};

/** Width / height of the card art (728 x 1024). */
export const CARD_RATIO = 728 / 1024;

export const ALL_CARD_IMAGES = [...Object.values(CARD_FRONTS), ...Object.values(CARD_BACKS)].filter(
  (x): x is string => !!x,
);
