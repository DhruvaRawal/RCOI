import { randomBytes, randomInt } from 'node:crypto';

/** No I, O, 0 or 1 - easy to read aloud and type. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Secret session token (lets a browser tab resume its seat). */
export function randomToken(): string {
  return randomBytes(24).toString('hex');
}

/** Public player id. */
export function randomPlayerId(): string {
  return `u_${randomBytes(6).toString('hex')}`;
}

/** 256-bit seed for the engine's ChaCha20 generator. */
export function randomSeed(): string {
  return randomBytes(32).toString('hex');
}

export function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
