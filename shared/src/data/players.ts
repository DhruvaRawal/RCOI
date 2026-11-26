/** Seat colours (also the meeple colour). Unique within a room. */
export const PLAYER_COLORS = [
  { id: 'crimson', name: 'Crimson', hex: '#d8434b' },
  { id: 'peacock', name: 'Peacock', hex: '#1c9bb0' },
  { id: 'emerald', name: 'Emerald', hex: '#3aa655' },
  { id: 'saffron', name: 'Saffron', hex: '#f2a516' },
  { id: 'amethyst', name: 'Amethyst', hex: '#9a6cd0' },
  { id: 'rose', name: 'Rose', hex: '#e46aa0' },
] as const;

/** Number of original avatar portraits in the client (client/src/avatars). */
export const AVATAR_COUNT = 10;
