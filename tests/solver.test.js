import { describe, expect, it } from 'vitest';
import { analyzePuzzle, clearAnalysisCache, createHistoryKey, filterCandidates, rankGuesses, scoreGuess } from '../src/solver.js';
import { WORDS } from '../src/data/words.js';

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
  it('still allows information probes in broad early-game states', () => {
    const candidates = ['right', 'think', 'three', 'years', 'place', 'sound', 'great', 'again', 'still', 'every', 'small', 'found', 'those', 'never', 'under'];
    const ranked = rankGuesses(candidates, [...candidates, 'slate', 'crane', 'adieu', 'irons'], 3);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].isCandidate).toBe(false);
    expect(ranked[0].word).toBe('irons');
  });

  it('prefers answer candidates when the set is tiny', () => {
    const candidates = ['cigar', 'rebut'];
    const ranked = rankGuesses(candidates, ['cigar', 'rebut', 'sissy'], 3);
    expect(ranked[0].isCandidate).toBe(true);
    expect(candidates).toContain(ranked[0].word);
  });

  it('prefers viable st*** answers for constrained stale/ggbbb states', () => {
    const history = [{ guess: 'stale', feedback: 'ggbbb' }];
    const candidates = filterCandidates(WORDS, history);
    const ranked = rankGuesses(candidates, WORDS, 8, { history });

    expect(candidates.length).toBeGreaterThan(10);
    expect(ranked[0].isCandidate).toBe(true);
    expect(candidates).toContain(ranked[0].word);
    expect(ranked.slice(0, 5).every((entry) => entry.isCandidate)).toBe(true);
    expect(ranked[0].word.startsWith('st')).toBe(true);
  });

  it('stays on candidate answers once two positions are locked and the pool is modest', () => {
    const candidates = ['stone', 'stony', 'stork', 'storm', 'story', 'store'];
    const allowed = [...candidates, 'irons', 'ikons', 'adieu'];
    const ranked = rankGuesses(candidates, allowed, 5);

    expect(ranked[0].isCandidate).toBe(true);
    expect(ranked.every((entry) => candidates.includes(entry.word))).toBe(true);
  });

  it('keeps yellow letters in play for human-first suggestions', () => {
    const history = [{ guess: 'crate', feedback: 'bbyyb' }];
    const candidates = filterCandidates(WORDS, history);
    const ranked = rankGuesses(candidates, WORDS, 8, { history });

    expect(ranked[0].isCandidate).toBe(true);
    expect(ranked.slice(0, 5).every((entry) => entry.isCandidate)).toBe(true);
    expect(ranked.slice(0, 5).every((entry) => entry.word.includes('a') && entry.word.includes('t'))).toBe(true);
  });

  it('analyzePuzzle defaults to candidate suggestions once feedback reveals present letters', () => {
    const history = [{ guess: 'crate', feedback: 'bbyyb' }];
    const { candidates, suggestions } = analyzePuzzle(history, { limit: 6, answers: WORDS, allowed: WORDS });

    expect(candidates.length).toBeGreaterThan(20);
    expect(suggestions.every((entry) => candidates.includes(entry.word))).toBe(true);
    expect(suggestions.slice(0, 5).every((entry) => entry.word.includes('a') && entry.word.includes('t'))).toBe(true);
  });
});

describe('analysis caching', () => {
  it('creates stable history keys', () => {
    expect(createHistoryKey([])).toBe('root');
    expect(createHistoryKey([{ guess: 'slate', feedback: 'bbygb' }])).toBe('slate:bbygb');
  });

  it('reuses cached analysis for identical history', () => {
    clearAnalysisCache();
    const history = [{ guess: 'cigar', feedback: 'bbbbb' }];
    const first = analyzePuzzle(history, { limit: 4, answers: ['rebut', 'humph', 'awake'], allowed: ['rebut', 'humph', 'awake'] });
    const second = analyzePuzzle(history, { limit: 4, answers: ['rebut', 'humph', 'awake'], allowed: ['rebut', 'humph', 'awake'] });
    expect(second).toBe(first);
  });
});
