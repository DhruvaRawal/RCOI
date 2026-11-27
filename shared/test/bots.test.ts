import { describe, expect, it } from 'vitest';
import type { BotDifficulty } from '../src/bots/strategy';
import { botGame } from './botGame';

function winRate(a: BotDifficulty, b: BotDifficulty, games: number): number {
  let wins = 0;
  for (let s = 0; s < games; s++) {
    // Alternate seats so neither level always benefits from seat order.
    const levels: BotDifficulty[] = s % 2 ? [a, b] : [b, a];
    const { winner } = botGame(levels, 1000 + s);
    if (winner !== null && levels[winner] === a) wins++;
  }
  return wins / games;
}

describe('bots', () => {
  it.each(['easy', 'medium', 'hard'] as const)('%s bots only make legal moves and finish games (2-5 players)', (level) => {
    for (const n of [2, 3, 4, 5]) {
      for (let s = 0; s < 12; s++) {
        const { winner } = botGame(Array(n).fill(level), n * 100 + s);
        expect(winner).not.toBeNull();
      }
    }
  });

  it('mixed tables finish', () => {
    for (let s = 0; s < 20; s++) expect(botGame(['easy', 'medium', 'hard', 'medium', 'easy'], s).winner).not.toBeNull();
  });

  it('harder bots beat easier ones more often than not', () => {
    const mediumVsEasy = winRate('medium', 'easy', 300);
    const hardVsEasy = winRate('hard', 'easy', 300);
    const hardVsMedium = winRate('hard', 'medium', 300);
    console.log({ mediumVsEasy, hardVsEasy, hardVsMedium });
    expect(mediumVsEasy).toBeGreaterThan(0.55);
    expect(hardVsEasy).toBeGreaterThan(0.55);
    expect(hardVsMedium).toBeGreaterThan(0.6);
  });
});
