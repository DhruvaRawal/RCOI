/**
 * Seedable, serialisable random generator for the rules engine.
 *
 * It is a ChaCha20 keystream (RFC 8439) rather than a tiny PRNG such as mulberry32:
 * card IDs and shuffles are derived from it, and players see some of that output
 * (their own card IDs, the open piles). With a 32-bit generator a player could
 * brute-force the seed and recover the deck order; with a 256-bit ChaCha20 key they can't.
 *
 * The whole state is plain numbers so it survives structuredClone / JSON.
 */

export interface RngState {
  key: number[]; // 8 x uint32
  counter: number; // block counter
  block: number[]; // current 16-word keystream block
  idx: number; // next word in block
}

const CONSTANTS = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function rotl(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function quarterRound(x: number[], a: number, b: number, c: number, d: number): void {
  x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 16);
  x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 12);
  x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 8);
  x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 7);
}

/** One ChaCha20 block (exported for the RFC test vector). */
export function chachaBlock(key: number[], counter: number, nonce: number[] = [0, 0, 0]): number[] {
  const init = [...CONSTANTS, ...key, counter >>> 0, ...nonce];
  const x = init.slice();
  for (let i = 0; i < 10; i++) {
    quarterRound(x, 0, 4, 8, 12);
    quarterRound(x, 1, 5, 9, 13);
    quarterRound(x, 2, 6, 10, 14);
    quarterRound(x, 3, 7, 11, 15);
    quarterRound(x, 0, 5, 10, 15);
    quarterRound(x, 1, 6, 11, 12);
    quarterRound(x, 2, 7, 8, 13);
    quarterRound(x, 3, 4, 9, 14);
  }
  return x.map((v, i) => (v + init[i]) >>> 0);
}

/** Turn any seed string into a 256-bit key. 64 hex chars are used directly. */
function keyFromSeed(seed: string): number[] {
  if (/^[0-9a-fA-F]{64}$/.test(seed)) {
    const key: number[] = [];
    for (let i = 0; i < 8; i++) key.push(parseInt(seed.slice(i * 8, i * 8 + 8), 16) >>> 0);
    return key;
  }
  // Short / human seeds (tests): FNV-1a expansion. Fine for tests; the server always uses 64 hex chars.
  const key: number[] = [];
  for (let w = 0; w < 8; w++) {
    let h = 0x811c9dc5 ^ w;
    const s = `${w}:${seed}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    key.push(h >>> 0);
  }
  return key;
}

export function createRng(seed: string): RngState {
  const key = keyFromSeed(seed);
  return { key, counter: 0, block: chachaBlock(key, 0), idx: 0 };
}

export function nextUint32(r: RngState): number {
  if (r.idx >= 16) {
    r.counter = (r.counter + 1) >>> 0;
    r.block = chachaBlock(r.key, r.counter);
    r.idx = 0;
  }
  return r.block[r.idx++];
}

/** Unbiased integer in [0, n). */
export function randomInt(r: RngState, n: number): number {
  if (n <= 0 || !Number.isInteger(n)) throw new Error(`randomInt: bad range ${n}`);
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (;;) {
    const x = nextUint32(r);
    if (x < limit) return x % n;
  }
}

/** Fisher-Yates shuffle, in place. */
export function shuffleInPlace<T>(r: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(r, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickRandom<T>(r: RngState, arr: readonly T[]): T {
  return arr[randomInt(r, arr.length)];
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Random opaque identifier (used for card IDs, so it never encodes the card type). */
export function randomId(r: RngState, length = 10): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ID_ALPHABET[randomInt(r, ID_ALPHABET.length)];
  return s;
}
