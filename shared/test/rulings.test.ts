import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/engine/legal';
import { toPlayerView } from '../src/engine/view';
import { abilityCard, buildScenario, handCard, handTypes, pileOf } from '../src/testing/scenario';
import { act, eventTypes, player, reject, timeout, top } from './helpers';

const BASE_PILES = [{ type: 'RANI' as const }, { type: 'SENAPATI' as const }, { type: 'YODHA' as const }];

describe('ruling 1: ties', () => {
  const tie = (tieWinner?: 'target' | 'challenger') =>
    buildScenario({
      players: [{ id: 'A', hand: ['YODHA', 'RANI'] }, { id: 'B', hand: ['RANI', 'RANI'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
      config: tieWinner ? { rulings: { tieWinner } } : {},
    });

  it('same type as a mismatched target: challenger loses', () => {
    const s = tie();
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'YODHA') });
    expect(r.events.find((e) => e.type === 'CHALLENGE')).toMatchObject({ reason: 'TIE', challengerWon: false });
  });

  it('is switchable in config', () => {
    const s = tie('challenger');
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'YODHA') });
    expect(r.events.find((e) => e.type === 'CHALLENGE')).toMatchObject({ reason: 'TIE', challengerWon: true });
  });
});

describe('ruling 2: Mahamantri', () => {
  const s = buildScenario({
    players: [
      { id: 'A', hand: ['RAJA'], abilities: ['MAHAMANTRI', 'DANDANAYAKA'] },
      { id: 'B', hand: ['RANI', 'YODHA', 'YODHA'], abilities: ['CHIKITSAKA'] },
      { id: 'C', hand: ['SENAPATI'] },
    ],
    piles: [{ type: 'RAJA' }, ...BASE_PILES],
    current: 'A',
  });

  it('is a turn action that exchanges only bluffing cards; ability cards stay', () => {
    const r = act(s, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s, 'A', 'MAHAMANTRI'), targetPlayer: 'B' });
    expect(handTypes(r.state, 'A')).toEqual(['RANI', 'YODHA', 'YODHA']);
    expect(handTypes(r.state, 'B')).toEqual(['RAJA']);
    expect(player(r.state, 'A').abilities.map((c) => r.state.cards[c].type)).toEqual(['DANDANAYAKA']);
    expect(player(r.state, 'B').abilities.map((c) => r.state.cards[c].type)).toEqual(['CHIKITSAKA']);
    expect(r.state.currentPlayer).toBe('B');
    const ex = r.events.find((e) => e.type === 'HANDS_EXCHANGED')!;
    expect(Object.keys(ex.secret!).sort()).toEqual(['A', 'B']);
    expect(r.state.abilityDiscard.map((c) => r.state.cards[c].type)).toEqual(['MAHAMANTRI']);
  });

  it('can exchange ability cards too when configured', () => {
    const s2 = structuredClone(s);
    s2.config.rulings.mahamantriExchangesAbilities = true;
    const r = act(s2, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s2, 'A', 'MAHAMANTRI'), targetPlayer: 'B' });
    expect(player(r.state, 'A').abilities.map((c) => r.state.cards[c].type)).toEqual(['CHIKITSAKA']);
  });

  it('needs another player as the target', () => {
    expect(reject(s, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s, 'A', 'MAHAMANTRI'), targetPlayer: 'A' })).toBe(
      'BAD_ABILITY_TARGET',
    );
    expect(reject(s, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s, 'A', 'MAHAMANTRI') })).toBe('BAD_ABILITY_TARGET');
  });
});

describe('ruling 3: Dandanayaka', () => {
  it('is a turn action: the target draws 2 bluffing cards', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'RANI'], abilities: ['DANDANAYAKA'] }, { id: 'B', hand: ['RANI'] }],
      piles: [{ type: 'RAJA' }, ...BASE_PILES],
      current: 'A',
    });
    const r = act(s, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s, 'A', 'DANDANAYAKA'), targetPlayer: 'B' });
    expect(player(r.state, 'B').hand).toHaveLength(3);
    expect(r.events.find((e) => e.type === 'CARDS_DRAWN')).toMatchObject({ player: 'B', count: 2, reason: 'dandanayaka' });
    expect(r.events.find((e) => e.type === 'ABILITY_USED')).toMatchObject({ ability: 'DANDANAYAKA', targetPlayer: 'B' });
  });

  it('is disabled with a reason when nothing can be drawn', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'RANI'], abilities: ['DANDANAYAKA'] }, { id: 'B', hand: ['RANI'] }],
      piles: [{ type: 'RAJA' }, ...BASE_PILES],
      leftoverBluff: { hand: 'B' },
      current: 'A',
    });
    const opt = getLegalActions(s, 'A').abilities[0];
    expect(opt.usable).toBe(false);
    expect(opt.reason).toMatch(/no bluffing cards left/);
  });
});

describe('ruling 4: Chikitsaka', () => {
  const caught = (bAbilities: ('CHIKITSAKA' | 'DANDANAYAKA')[], window?: 'anyAbility' | 'holdersOnly') =>
    buildScenario({
      players: [
        { id: 'A', hand: ['RAJA', 'SENAPATI'] },
        { id: 'B', hand: ['RANI', 'RANI'], abilities: bAbilities },
      ],
      piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
      config: window ? { rulings: { reactionWindow: window } } : {},
    });

  it('cancels the penalty: card back, no draw, no card from the challenger; challenger still draws an ability', () => {
    const s = caught(['CHIKITSAKA']);
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    expect(r.state.pending).toMatchObject({ kind: 'reaction', player: 'B' });
    expect(getLegalActions(r.state, 'B').reaction!.abilityIds).toHaveLength(1);
    r = act(r.state, 'B', { type: 'REACT', abilityId: abilityCard(r.state, 'B', 'CHIKITSAKA') });
    expect(handTypes(r.state, 'B')).toEqual(['RANI', 'RANI', 'YODHA']); // only the card back
    expect(handTypes(r.state, 'A')).toEqual(['RAJA', 'SENAPATI']); // kept everything
    expect(player(r.state, 'A').abilities).toHaveLength(1);
    expect(player(r.state, 'B').abilities).toHaveLength(0);
    expect(r.state.abilityDiscard.map((c) => r.state.cards[c].type)).toEqual(['CHIKITSAKA']);
    expect(r.state.currentPlayer).toBe('B');
  });

  it('declining applies the normal penalty', () => {
    const s = caught(['CHIKITSAKA']);
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    r = act(r.state, 'B', { type: 'REACT', abilityId: null });
    expect(r.state.pending).toMatchObject({ kind: 'give', from: 'A', to: 'B' });
  });

  it('the decision window also opens when the bluffer holds any other ability card (hides who holds Chikitsaka)', () => {
    const s = caught(['DANDANAYAKA']);
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    expect(r.state.pending).toMatchObject({ kind: 'reaction', player: 'B' });
    expect(getLegalActions(r.state, 'B').reaction!.abilityIds).toEqual([]);
    expect(reject(r.state, 'B', { type: 'REACT', abilityId: abilityCard(r.state, 'B', 'DANDANAYAKA') })).toBe('NOT_A_REACTION');
    // Others see the same pending view either way.
    const withChik = act(caught(['CHIKITSAKA']), 'A', {
      type: 'CHALLENGE',
      pileId: 'p1',
      cardId: handCard(caught(['CHIKITSAKA']), 'A', 'RAJA'),
    });
    expect(toPlayerView(r.state, 'A').pending).toEqual(toPlayerView(withChik.state, 'A').pending);
  });

  it('no window when the bluffer holds no ability cards', () => {
    const s = caught([]);
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    expect(r.state.pending).toMatchObject({ kind: 'give', from: 'A' });
  });

  it("'holdersOnly' window mode skips players without a reaction card", () => {
    const s = caught(['DANDANAYAKA'], 'holdersOnly');
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    expect(r.state.pending).toMatchObject({ kind: 'give', from: 'A' });
  });

  it('cannot be used when the challenger loses, nor as a turn action', () => {
    const s = buildScenario({
      players: [
        { id: 'A', hand: ['RAJA', 'SENAPATI'], abilities: ['CHIKITSAKA'] },
        { id: 'B', hand: ['RANI', 'RANI'] },
      ],
      piles: [{ type: 'RAJA', stack: [{ type: 'RAJA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
    });
    expect(getLegalActions(s, 'A').abilities[0]).toMatchObject({ type: 'CHIKITSAKA', usable: false });
    expect(reject(s, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s, 'A', 'CHIKITSAKA') })).toBe('NOT_A_TURN_ABILITY');
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'SENAPATI') });
    expect(r.state.pending).toMatchObject({ kind: 'give', from: 'B', to: 'A' }); // no reaction for the challenger
  });
});

describe('ruling 5: Raj Bhandari', () => {
  const rb = (hand: ('RAJA' | 'VIDUSHAKA' | 'GAJADHYAKSHA' | 'RANI')[]) =>
    buildScenario({
      players: [{ id: 'A', hand, abilities: ['RAJ_BHANDARI'] }, { id: 'B', hand: ['RANI', 'RANI'] }],
      piles: [{ type: 'RAJA' }, { type: 'RANI' }, { type: 'SENAPATI' }, { type: 'YODHA' }],
      current: 'A',
    });

  it('creates a 5th open pile from a hand card of a type with no pile, then is destroyed', () => {
    const s = rb(['GAJADHYAKSHA', 'RAJA']);
    const opt = getLegalActions(s, 'A').abilities[0];
    expect(opt).toMatchObject({ type: 'RAJ_BHANDARI', usable: true, cardIds: [handCard(s, 'A', 'GAJADHYAKSHA')] });
    const card = handCard(s, 'A', 'GAJADHYAKSHA');
    const r = act(s, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s, 'A', 'RAJ_BHANDARI'), cardId: card });
    expect(r.state.piles).toHaveLength(5);
    expect(r.state.piles[4]).toMatchObject({ type: 'GAJADHYAKSHA', openCard: card, stack: [], origin: 'ability' });
    expect(r.state.destroyed.map((c) => r.state.cards[c].type)).toEqual(['RAJ_BHANDARI']);
    expect(r.state.abilityDiscard).toHaveLength(0);
    // The new open card is never challengeable; the pile works like any other.
    expect(getLegalActions(r.state, 'B').play[0].pileIds).toContain(r.state.piles[4].id);
  });

  it('rejects Vidushaka and types that already have a pile; disables itself with a reason', () => {
    const s = rb(['VIDUSHAKA', 'RAJA']);
    const opt = getLegalActions(s, 'A').abilities[0];
    expect(opt.usable).toBe(false);
    expect(opt.reason).toMatch(/never Vidushaka/);
    expect(
      reject(s, 'A', { type: 'USE_ABILITY', abilityId: abilityCard(s, 'A', 'RAJ_BHANDARI'), cardId: handCard(s, 'A', 'RAJA') }),
    ).toBe('ABILITY_UNAVAILABLE');
  });

  it('using your last bluffing card wins immediately', () => {
    const s = rb(['GAJADHYAKSHA']);
    const r = act(s, 'A', {
      type: 'USE_ABILITY',
      abilityId: abilityCard(s, 'A', 'RAJ_BHANDARI'),
      cardId: handCard(s, 'A', 'GAJADHYAKSHA'),
    });
    expect(r.state.winner).toEqual({ player: 'A', reason: 'RAJ_BHANDARI' });
  });
});

describe('ruling 6: card removed from the top', () => {
  it('can be switched to restore the meeple', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI', 'RANI'] }, { id: 'C', hand: ['RANI'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'C' }, { type: 'YODHA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
      config: { rulings: { uncoveredCardRegainsMeeple: true } },
    });
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    r = act(r.state, 'A', { type: 'GIVE', cardId: handCard(r.state, 'A', 'SENAPATI') });
    expect(toPlayerView(r.state, 'B').piles[0].cards[0]).toMatchObject({ owner: 'C', meeple: true, challengeable: true });
  });
});

describe('ruling 7: emptying your hand by giving', () => {
  it('the challenged player gives away their last card and wins', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'RAJA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
    });
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'SENAPATI') });
    expect(r.state.winner).toEqual({ player: 'B', reason: 'GAVE_LAST_CARD' });
    expect(eventTypes(r.events).slice(-2)).toEqual(['CARD_GIVEN', 'GAME_WON']);
  });

  it('a give choice with several cards is not automatic', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI', 'YODHA'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'RAJA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
    });
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'SENAPATI') });
    expect(r.state.pending?.kind).toBe('give');
  });
});

describe('ruling 8: empty bluffing deck', () => {
  it('disables Draw and passes a player with no legal action', () => {
    // B holds every remaining card. A's last card is a Gajadhyaksha with no pile: no play, no draw,
    // no challenge target, no ability -> A's turn is passed automatically.
    const s = buildScenario({
      players: [{ id: 'A', hand: ['GAJADHYAKSHA'] }, { id: 'B', hand: ['RANI', 'RANI'] }],
      piles: [{ type: 'RAJA' }, ...BASE_PILES],
      leftoverBluff: { hand: 'B' },
      current: 'B',
    });
    expect(getLegalActions(s, 'B').draw.allowed).toBe(false);
    const r = timeout(s); // B times out and can't draw either
    expect(eventTypes(r.events)).toEqual(['TIMED_OUT', 'TURN_PASSED', 'TURN_STARTED', 'TURN_PASSED', 'TURN_STARTED']);
    expect(r.events[3]).toMatchObject({ player: 'A', reason: 'noLegalAction' });
    expect(r.state.currentPlayer).toBe('B');
    // Once B plays a card, A can challenge it again, so A's turn is no longer skipped.
    const r2 = act(r.state, 'B', { type: 'PLAY', cardId: handCard(r.state, 'B', 'RANI'), pileId: pileOf(s, 'RANI') });
    expect(r2.state.currentPlayer).toBe('A');
  });

  it('a draw with nothing to draw is skipped (e.g. challenger penalty)', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI', 'YODHA'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'RAJA', owner: 'B' }] }, ...BASE_PILES],
      leftoverBluff: { hand: 'B' },
      current: 'A',
    });
    const r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'SENAPATI') });
    expect(r.events.find((e) => e.type === 'CARDS_DRAWN')).toMatchObject({ player: 'A', count: 0, requested: 1 });
    expect(player(r.state, 'A').hand).toHaveLength(2);
  });
});

describe('ruling 9: no ability card available', () => {
  it('reshuffles the discard pile into a new ability deck', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI', 'RANI'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'B' }] }, ...BASE_PILES],
      destroyed: ['RAJ_BHANDARI'],
      leftoverAbility: 'discard',
      current: 'A',
    });
    expect(s.abilityDeck).toHaveLength(0);
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    r = act(r.state, 'A', { type: 'GIVE', cardId: handCard(r.state, 'A', 'SENAPATI') });
    expect(eventTypes(r.events)).toContain('ABILITY_DECK_RESHUFFLED');
    expect(player(r.state, 'A').abilities).toHaveLength(1);
    expect(r.state.abilityDiscard).toHaveLength(0);
    expect(r.state.abilityDeck).toHaveLength(11);
  });

  it('skips the draw when there are none in the deck or the discard pile', () => {
    const s = buildScenario({
      players: [
        { id: 'A', hand: ['RAJA', 'SENAPATI'] },
        { id: 'B', hand: ['RANI', 'RANI'], abilities: ['CHIKITSAKA', 'CHIKITSAKA', 'CHIKITSAKA', 'CHIKITSAKA', 'CHIKITSAKA', 'MAHAMANTRI', 'MAHAMANTRI'] },
        { id: 'C', hand: ['RANI'], abilities: ['DANDANAYAKA', 'DANDANAYAKA', 'DANDANAYAKA', 'DANDANAYAKA', 'DANDANAYAKA'] },
      ],
      piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'B' }] }, ...BASE_PILES],
      destroyed: ['RAJ_BHANDARI'],
      current: 'A',
    });
    let r = act(s, 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(s, 'A', 'RAJA') });
    r = act(r.state, 'B', { type: 'REACT', abilityId: null });
    r = act(r.state, 'A', { type: 'GIVE', cardId: handCard(r.state, 'A', 'SENAPATI') });
    expect(r.events.find((e) => e.type === 'CARDS_DRAWN' && e.deck === 'ability')).toMatchObject({ count: 0 });
    expect(player(r.state, 'A').abilities).toHaveLength(0);
  });
});

describe('ruling 11: timeouts', () => {
  const base = () =>
    buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI', 'YODHA', 'GAJADHYAKSHA'], abilities: ['CHIKITSAKA'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
    });

  it('turn timeout draws a card for the player (never plays or challenges)', () => {
    const r = timeout(base());
    expect(eventTypes(r.events)).toEqual(['TIMED_OUT', 'CARDS_DRAWN', 'TURN_STARTED']);
    expect(player(r.state, 'A').hand).toHaveLength(3);
    expect(r.state.currentPlayer).toBe('B');
  });

  it('turn timeout passes when drawing is impossible', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI'] }],
      piles: [{ type: 'RAJA' }, ...BASE_PILES],
      leftoverBluff: { hand: 'B' },
      current: 'A',
    });
    const r = timeout(s);
    expect(eventTypes(r.events)).toEqual(['TIMED_OUT', 'TURN_PASSED', 'TURN_STARTED']);
    expect(player(r.state, 'A').hand).toHaveLength(2);
  });

  it('a Chikitsaka prompt that times out is not used', () => {
    let r = act(base(), 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(base(), 'A', 'RAJA') });
    expect(r.state.pending?.kind).toBe('reaction');
    r = timeout(r.state);
    expect(player(r.state, 'B').abilities).toHaveLength(1);
    expect(r.state.pending).toMatchObject({ kind: 'give', from: 'A' });
  });

  it('a card choice that times out gives a random bluffing card', () => {
    let r = act(base(), 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(base(), 'A', 'RAJA') });
    r = timeout(r.state); // reaction
    const aHand = [...player(r.state, 'A').hand];
    r = timeout(r.state); // give
    const given = r.events.find((e) => e.type === 'CARD_GIVEN')!;
    expect(given).toMatchObject({ from: 'A', to: 'B', auto: true });
    expect(aHand).toContain(given.secret!.A.cards![0].id);
    expect(player(r.state, 'A').hand).toHaveLength(1);
  });

  it('timeout of the give step is deterministic for the same state', () => {
    let r = act(base(), 'A', { type: 'CHALLENGE', pileId: 'p1', cardId: handCard(base(), 'A', 'RAJA') });
    r = timeout(r.state);
    expect(timeout(r.state).state).toEqual(timeout(r.state).state);
  });
});

describe('covered card handling', () => {
  it('covering a card removes its meeple for good', () => {
    const s = buildScenario({
      players: [{ id: 'A', hand: ['RAJA', 'SENAPATI'] }, { id: 'B', hand: ['RANI', 'RANI'] }],
      piles: [{ type: 'RAJA', stack: [{ type: 'YODHA', owner: 'B' }] }, ...BASE_PILES],
      current: 'A',
    });
    const r = act(s, 'A', { type: 'PLAY', cardId: handCard(s, 'A', 'RAJA'), pileId: 'p1' });
    expect(r.state.piles[0].stack[0].covered).toBe(true);
    expect(top(r.state, 'p1').owner).toBe('A');
    expect(getLegalActions(r.state, 'B').challenge.pileIds).toEqual(['p1']);
  });
});
