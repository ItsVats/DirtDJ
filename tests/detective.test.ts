import { describe, expect, it } from 'vitest';
import { CLUES, claimDiscovery, createDetective, judgeSound, nextClue, parseDetective, startAttempt, swapClue } from '../src/detective';

describe('Sound Detective rules', () => {
  it('makes repeatable varied cases with four distinct supported clues', () => {
    for (let seed = 0; seed < 20; seed++) {
      const game = createDetective(seed);
      expect(game.clueIds).toEqual(createDetective(seed).clueIds);
      expect(new Set(game.clueIds).size).toBe(4);
      expect(game.clueIds.every(id => CLUES.some(c => c.id === id))).toBe(true);
    }
    expect(createDetective(1).clueIds).not.toEqual(createDetective(2).clueIds);
  });
  it('accepts a strong matching label but refuses weak, ambiguous or unrelated evidence', () => {
    expect(judgeSound('steps', [{ label: 'Walk, footsteps', score: 0.6 }]).kind).toBe('match');
    expect(judgeSound('bird', [{ label: 'Bird', score: 0.08 }]).kind).toBe('uncertain');
    expect(judgeSound('bird', [{ label: 'Speech', score: 0.8 }, { label: 'Bird', score: 0.14 }]).kind).toBe('uncertain');
    expect(judgeSound('whistle', [{ label: 'Train whistle', score: 0.9 }]).kind).toBe('uncertain');
    expect(judgeSound('hum', [{ label: 'Mains hum', score: 0.8 }]).kind).toBe('uncertain');
    expect(judgeSound('bird', [{ label: 'Bird', score: NaN }]).kind).toBe('uncertain');
    expect(judgeSound('clap', []).kind).toBe('uncertain');
  });
  it('only awards saved evidence, keeps self-confirmation separate, and blocks stale or duplicate claims', () => {
    let game = createDetective(4);
    expect(claimDiscovery(game, 'unsaved', true)).toBe(game);
    expect(startAttempt(game, 2, 'wrong-turn')).toBe(game);
    game = startAttempt(game, 0, 'first');
    expect(claimDiscovery(game, 'other', true)).toBe(game);
    game = claimDiscovery(game, 'first', false);
    expect(game.discoveries[0]).toEqual({ sampleId: 'first', verified: false });
    expect(claimDiscovery(game, 'first', true)).toBe(game);
    expect(startAttempt(game, 1, 'first')).toBe(game);
    for (let i = 1; i < 4; i++) game = claimDiscovery(startAttempt(game, i, `sound-${i}`), `sound-${i}`, true);
    expect(nextClue(game)).toBe(-1);
    expect(game.discoveries.filter(d => d?.verified)).toHaveLength(3);
    expect(parseDetective(JSON.stringify(game))).toEqual(game);
  });
  it('swaps an unavailable clue without awarding it or changing earlier discoveries', () => {
    let game = createDetective(5); game = claimDiscovery(startAttempt(game, 0, 'found'), 'found', true);
    const updated = swapClue(startAttempt(game, 1, 'uncertain'));
    expect(updated.clueIds[1]).not.toBe(game.clueIds[1]);
    expect(new Set(updated.clueIds).size).toBe(4);
    expect(updated.discoveries).toEqual(game.discoveries);
    expect(updated.attempt).toBeNull();
  });
  it('rejects corrupt, duplicate and obsolete adventure state', () => {
    const game = createDetective(2);
    expect(parseDetective('{oops')).toBeUndefined();
    for (const patch of [{ clueIds: ['bird', 'bird', 'bird', 'bird'] }, { discoveries: [null] }, { attempt: { index: 8, sampleId: 'x' } }, { attempt: { index: 2, sampleId: 'x' } }, { searchUntil: 'tomorrow' }, { version: 2 }]) expect(parseDetective(JSON.stringify({ ...game, ...patch }))).toBeUndefined();
  });
});
