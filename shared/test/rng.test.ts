import { describe, expect, it } from 'vitest';
import { chachaBlock, createRng, nextUint32, randomInt, shuffleInPlace } from '../src/engine/rng';

describe('ChaCha20 random generator', () => {
  it('matches the RFC 8439 section 2.3.2 test vector', () => {
    const key = [0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514, 0x1b1a1918, 0x1f1e1d1c];
    const out = chachaBlock(key, 1, [0x09000000, 0x4a000000, 0x00000000]);
    expect(out.map((w) => w.toString(16).padStart(8, '0'))).toEqual([
      'e4e7f110', '15593bd1', '1fdd0f50', 'c47120a3',
      'c7f4d1c7', '0368c033', '9aaa2204', '4e6cd4c3',
      '466482d2', '09aa9f07', '05d7c214', 'a2028bd9',
      'd19c12b5', 'b94e16de', 'e883d0cb', '4e3c50a2',
    ]);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    const c = createRng('seed-2');
    const seqA = Array.from({ length: 40 }, () => nextUint32(a));
    const seqB = Array.from({ length: 40 }, () => nextUint32(b));
    const seqC = Array.from({ length: 40 }, () => nextUint32(c));
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('survives structuredClone mid-stream', () => {
    const a = createRng('clone');
    for (let i = 0; i < 21; i++) nextUint32(a);
    const b = structuredClone(a);
    expect(Array.from({ length: 30 }, () => nextUint32(a))).toEqual(Array.from({ length: 30 }, () => nextUint32(b)));
  });

  it('randomInt stays in range and shuffle is a permutation', () => {
    const r = createRng('range');
    for (let i = 0; i < 2000; i++) {
      const n = 1 + (i % 13);
      const v = randomInt(r, n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
    }
    const arr = Array.from({ length: 62 }, (_, i) => i);
    const shuffled = shuffleInPlace(r, [...arr]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(arr);
    expect(shuffled).not.toEqual(arr);
  });
});
