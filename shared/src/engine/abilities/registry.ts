import type { AbilityType } from '../../data/cards';
import { chikitsaka } from './chikitsaka';
import { dandanayaka } from './dandanayaka';
import { mahamantri } from './mahamantri';
import { rajBhandari } from './rajBhandari';
import type { AbilityHandler } from './types';

/**
 * One handler per ability card. To add a card: add its type + data in data/cards.ts,
 * write a handler file next to this one and register it here. The turn logic does not change.
 */
export const ABILITY_REGISTRY: Record<AbilityType, AbilityHandler> = {
  CHIKITSAKA: chikitsaka,
  MAHAMANTRI: mahamantri,
  DANDANAYAKA: dandanayaka,
  RAJ_BHANDARI: rajBhandari,
};

export function getAbilityHandler(type: AbilityType): AbilityHandler {
  return ABILITY_REGISTRY[type];
}
