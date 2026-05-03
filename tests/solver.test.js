import { describe, expect, it } from 'vitest';
import { filterCandidates, rankGuesses, scoreGuess } from '../src/solver.js';

describe('scoreGuess', () => {
  it('handles duplicate letters correctly', () => {
    expect(scoreGuess('allee', 'apple')).toBe('gybbg');
    expect(scoreGuess('sassy', 'class')).toBe('yybgb');
  });
});

describe('filterCandidates', () => {
  it('keeps only words that reproduce the exact feedback', () => {
    const candidates = ['cigar', 'rebut', 'sissy', 'humph'];
    const history = [{ guess: 'civic', feedback: scoreGuess('civic', 'cigar') }];
    expect(filterCandidates(candidates, history)).toEqual(['cigar']);
  });
});

describe('rankGuesses', () => {
  it('prefers high-information probes when many candidates remain', () => {
    const candidates = ['cigar', 'rebut', 'sissy', 'humph', 'awake'];
    const ranked = rankGuesses(candidates, candidates, 3);
    expect(ranked[0].entropy).toBeGreaterThanOrEqual(ranked[1].entropy);
    expect(ranked).toHaveLength(3);
  });

  it('prefers answer candidates when the set is tiny', () => {
    const candidates = ['cigar', 'rebut'];
    const ranked = rankGuesses(candidates, ['cigar', 'rebut', 'sissy'], 3);
    expect(ranked[0].isCandidate).toBe(true);
    expect(candidates).toContain(ranked[0].word);
  });
});
