import assert from 'node:assert/strict';
import { scoreGuess, filterCandidates, rankCandidates } from './assets/solver-core.js';

assert.deepEqual(scoreGuess('allee', 'apple'), ['g', 'y', 'b', 'b', 'g']);
assert.deepEqual(scoreGuess('civic', 'vivid'), ['b', 'g', 'g', 'g', 'b']);

const words = ['slate', 'stale', 'least', 'crane'];
const filtered = filterCandidates(words, [{ guess: 'slate', pattern: ['g', 'y', 'g', 'y', 'g'] }]);
assert.deepEqual(filtered, ['stale']);

const ranked = rankCandidates(['slate', 'crane'], words);
assert.equal(ranked.length, 4);
assert.equal(ranked[0].word.length, 5);

console.log('ok');
