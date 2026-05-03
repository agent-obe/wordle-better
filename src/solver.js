import { WORDS } from './data/words.js';

export const ANSWERS = WORDS;
export const ALLOWED_GUESSES = WORDS;
export const FEEDBACK = {
  ABSENT: 'b',
  PRESENT: 'y',
  CORRECT: 'g',
};

const analysisCache = new Map();

export function normalizeWord(value = '') {
  return value.trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
}

export function scoreGuess(guess, answer) {
  const marks = Array(5).fill(FEEDBACK.ABSENT);
  const remaining = {};

  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      marks[i] = FEEDBACK.CORRECT;
    } else {
      remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (marks[i] !== FEEDBACK.ABSENT) continue;
    const letter = guess[i];
    if ((remaining[letter] || 0) > 0) {
      marks[i] = FEEDBACK.PRESENT;
      remaining[letter] -= 1;
    }
  }

  return marks.join('');
}

export function filterCandidates(candidates, history) {
  if (!history.length) return [...candidates];
  return candidates.filter((word) => history.every(({ guess, feedback }) => scoreGuess(guess, word) === feedback));
}

function patternDistribution(guess, candidates) {
  const distribution = new Map();
  for (const candidate of candidates) {
    const pattern = scoreGuess(guess, candidate);
    distribution.set(pattern, (distribution.get(pattern) || 0) + 1);
  }
  return distribution;
}

function entropyFromDistribution(distribution, total) {
  let entropy = 0;
  for (const count of distribution.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function positionalFrequencies(candidates) {
  const byPos = Array.from({ length: 5 }, () => ({}));
  const overall = {};
  for (const word of candidates) {
    const seen = new Set();
    for (let i = 0; i < 5; i += 1) {
      const letter = word[i];
      byPos[i][letter] = (byPos[i][letter] || 0) + 1;
      if (!seen.has(letter)) {
        overall[letter] = (overall[letter] || 0) + 1;
        seen.add(letter);
      }
    }
  }
  return { byPos, overall };
}

function tieBreakerScore(word, frequencies) {
  const seen = new Set();
  let score = 0;
  for (let i = 0; i < 5; i += 1) {
    const letter = word[i];
    score += (frequencies.byPos[i][letter] || 0) * 0.35;
    if (!seen.has(letter)) {
      score += frequencies.overall[letter] || 0;
      seen.add(letter);
    }
  }
  return score;
}

function candidateShapeScore(word, frequencies, total) {
  if (!total) return 0;
  let score = 0;
  for (let i = 0; i < 5; i += 1) {
    score += (frequencies.byPos[i][word[i]] || 0) / total;
  }
  return score;
}

function constrainedState(candidates, frequencies) {
  const total = candidates.length;
  if (total <= 2) return true;
  if (!total) return false;

  const lockedPositions = frequencies.byPos.filter((bucket) => Object.values(bucket).some((count) => count === total)).length;
  const averagePositionalCertainty = frequencies.byPos.reduce((sum, bucket) => {
    const max = Math.max(0, ...Object.values(bucket));
    return sum + max / total;
  }, 0) / frequencies.byPos.length;

  return total <= 12
    || (total <= 24 && lockedPositions >= 1)
    || (total <= 40 && lockedPositions >= 2)
    || (total <= 60 && averagePositionalCertainty >= 0.72)
    || averagePositionalCertainty >= 0.86;
}

function extractHistorySignal(history = []) {
  const presentMinimums = {};
  let hasKnownLetter = false;

  for (const { guess, feedback } of history) {
    const counts = {};
    for (let i = 0; i < Math.min(guess.length, feedback.length, 5); i += 1) {
      if (feedback[i] === FEEDBACK.CORRECT || feedback[i] === FEEDBACK.PRESENT) {
        const letter = guess[i];
        counts[letter] = (counts[letter] || 0) + 1;
        hasKnownLetter = true;
      }
    }

    for (const [letter, count] of Object.entries(counts)) {
      presentMinimums[letter] = Math.max(presentMinimums[letter] || 0, count);
    }
  }

  return { hasKnownLetter, presentMinimums };
}

function presentLetterCoverageScore(word, presentMinimums) {
  let score = 0;
  const counts = {};
  for (const letter of word) counts[letter] = (counts[letter] || 0) + 1;

  for (const [letter, minimum] of Object.entries(presentMinimums)) {
    score += Math.min(counts[letter] || 0, minimum) * 3;
  }

  return score;
}

function candidateRankingScore(word, frequencies, total, presentMinimums) {
  if (!total) return 0;

  const seen = new Set();
  let positional = 0;
  let overall = 0;

  for (let i = 0; i < 5; i += 1) {
    const letter = word[i];
    positional += (frequencies.byPos[i][letter] || 0) / total;
    if (!seen.has(letter)) {
      overall += (frequencies.overall[letter] || 0) / total;
      seen.add(letter);
    }
  }

  const uniqueness = seen.size / 5;
  const coverage = presentLetterCoverageScore(word, presentMinimums);

  return coverage * 10 + positional * 3.2 + overall * 2.4 + uniqueness;
}

export function rankGuesses(candidates, allowed = ALLOWED_GUESSES, limit = 12, options = {}) {
  const { history = [] } = options;
  const candidateSet = new Set(candidates);
  const total = candidates.length || 1;
  const frequencies = positionalFrequencies(candidates);
  const { hasKnownLetter, presentMinimums } = extractHistorySignal(history);
  const preferCandidates = hasKnownLetter || constrainedState(candidates, frequencies);
  const pool = preferCandidates ? candidates : (candidates.length > 2 ? allowed : candidates);

  const ranked = pool.map((guess) => {
    const distribution = patternDistribution(guess, candidates);
    const entropy = entropyFromDistribution(distribution, total);
    const expectedRemaining = [...distribution.values()].reduce((sum, count) => sum + (count * count) / total, 0);
    const isCandidate = candidateSet.has(guess);
    const tieBreaker = tieBreakerScore(guess, frequencies);
    const shapeScore = candidateShapeScore(guess, frequencies, total);
    const candidateBias = preferCandidates && isCandidate ? 0.75 + shapeScore * 0.45 : 0;
    const humanScore = candidateRankingScore(guess, frequencies, total, presentMinimums);
    return {
      word: guess,
      entropy,
      expectedRemaining,
      tieBreaker,
      isCandidate,
      score: preferCandidates
        ? humanScore * 1000 - expectedRemaining * 0.35 + candidateBias + tieBreaker / 100000
        : entropy * 1000 - expectedRemaining + tieBreaker / 100000,
    };
  });

  ranked.sort((a, b) => b.score - a.score || b.entropy - a.entropy || a.expectedRemaining - b.expectedRemaining || Number(b.isCandidate) - Number(a.isCandidate) || a.word.localeCompare(b.word));
  return ranked.slice(0, limit);
}

export function summarizeSuggestion(entry, candidateCount) {
  if (!entry) return '';
  const solvesSoon = entry.isCandidate ? 'It can also be the answer.' : 'It is an information probe.';
  return `${entry.word.toUpperCase()} yields ${entry.entropy.toFixed(2)} bits of information and leaves ${entry.expectedRemaining.toFixed(2)} candidates on average from ${candidateCount}. ${solvesSoon}`;
}

export function pickDailyAnswer(seed = Date.now()) {
  const index = Math.abs(Math.floor(seed / 86400000)) % ANSWERS.length;
  return ANSWERS[index];
}

export function createHistoryKey(history = []) {
  return history.map(({ guess, feedback }) => `${guess}:${feedback}`).join('|') || 'root';
}

export function analyzePuzzle(history = [], options = {}) {
  const { limit = 12, allowed = ALLOWED_GUESSES, answers = ANSWERS } = options;
  const key = `${createHistoryKey(history)}::${limit}`;
  if (analysisCache.has(key)) return analysisCache.get(key);

  const candidates = filterCandidates(answers, history);
  const suggestions = rankGuesses(candidates, allowed, limit, { history });
  const result = { candidates, suggestions, solved: history.at(-1)?.feedback === 'ggggg' };
  analysisCache.set(key, result);
  return result;
}

export function clearAnalysisCache() {
  analysisCache.clear();
}
