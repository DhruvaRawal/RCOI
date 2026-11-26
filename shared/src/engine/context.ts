import type { EventBody, EventSecret, GameEvent, GameState, PlayerId } from './types';

/** A mutable draft of the state plus the events produced while applying one action. */
export class Ctx {
  readonly events: GameEvent[] = [];

  constructor(public readonly s: GameState) {}

  emit(body: EventBody, secret?: Record<PlayerId, EventSecret>): void {
    const ev: GameEvent = { ...body, seq: this.s.nextSeq++, turn: this.s.turn };
    if (secret && Object.keys(secret).length > 0) ev.secret = secret;
    this.events.push(ev);
  }
}
