export const STATE_ORDER = ['b', 'y', 'g'];

export function scoreGuess(guess, answer) {
  const result = Array(5).fill('b');
  const remaining = new Map();
  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      result[i] = 'g';
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) || 0) + 1);
    }
  }
  for (let i = 0; i < 5; i += 1) {
    if (result[i] === 'g') continue;
    const count = remaining.get(guess[i]) || 0;
    if (count > 0) {
      result[i] = 'y';
      remaining.set(guess[i], count - 1);
    }
  }
  return result;
}

export function filterCandidates(candidates, history) {
  return candidates.filter((word) => history.every((entry) => scoreGuess(entry.guess, word).join('') === entry.pattern.join('')));
}

export function rankCandidates(candidates, allowed = candidates) {
  const positional = Array.from({ length: 5 }, () => new Map());
  const global = new Map();
  for (const word of candidates) {
    const seen = new Set();
    for (let i = 0; i < 5; i += 1) {
      positional[i].set(word[i], (positional[i].get(word[i]) || 0) + 1);
      if (!seen.has(word[i])) {
        global.set(word[i], (global.get(word[i]) || 0) + 1);
        seen.add(word[i]);
      }
    }
  }
  return [...allowed].map((word) => {
    const unique = new Set(word);
    let score = 0;
    for (let i = 0; i < 5; i += 1) score += (positional[i].get(word[i]) || 0) * 1.4;
    for (const ch of unique) score += global.get(ch) || 0;
    score -= (5 - unique.size) * candidates.length * 0.35;
    if (candidates.includes(word)) score += candidates.length * 0.45;
    return { word, score };
  }).sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
}

export function rationale(word, candidates) {
  if (!word) return 'No valid suggestion.';
  const unique = new Set(word).size;
  if (candidates.length <= 2) return 'Nearly solved; lean into direct hits.';
  if (unique === 5) return 'Covers common letters cleanly.';
  return 'Trades a repeat for tighter confirmation.';
}
