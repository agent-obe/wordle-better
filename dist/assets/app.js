import { STATE_ORDER, filterCandidates, rankCandidates, rationale } from './solver-core.js';

const app = document.querySelector('#app');

const state = {
  words: [],
  history: [],
  guess: '',
  pattern: ['b', 'b', 'b', 'b', 'b'],
};

const el = document.createElement('main');
el.className = 'shell';
el.innerHTML = `
  <div class="stack">
    <section class="card hero">
      <p class="label">Best next guess</p>
      <h1 class="best-word" id="best-word">…</h1>
      <p class="rationale" id="rationale">Loading word list…</p>
      <div class="count" id="count"></div>
    </section>

    <section class="alts" id="alts"></section>

    <section class="card input-card">
      <div class="input-row">
        <input id="guess" class="guess" type="text" inputmode="text" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="5" placeholder="guess" />
        <div class="feedback" id="feedback"></div>
        <button id="submit" class="primary">Submit</button>
      </div>
      <div class="actions">
        <button id="undo" class="compact">Undo</button>
        <button id="reset" class="compact">Reset</button>
      </div>
    </section>

    <details class="details">
      <summary>History</summary>
      <div class="history-list" id="history"></div>
      <div class="quiet hidden" id="history-empty">No guesses yet.</div>
    </details>

    <details class="details">
      <summary>Candidate list</summary>
      <div class="quiet" id="candidates"></div>
    </details>

    <details class="details">
      <summary>Solver detail</summary>
      <div class="quiet" id="solver-detail"></div>
    </details>
  </div>
`;
app.append(el);

const guessInput = el.querySelector('#guess');
const feedbackEl = el.querySelector('#feedback');
const bestWordEl = el.querySelector('#best-word');
const rationaleEl = el.querySelector('#rationale');
const countEl = el.querySelector('#count');
const altsEl = el.querySelector('#alts');
const historyEl = el.querySelector('#history');
const historyEmptyEl = el.querySelector('#history-empty');
const candidatesEl = el.querySelector('#candidates');
const solverDetailEl = el.querySelector('#solver-detail');

function normalizeGuess(value) {
  return value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
}

function renderTiles() {
  feedbackEl.innerHTML = '';
  state.pattern.forEach((mark, index) => {
    const btn = document.createElement('button');
    btn.className = `tile ${mark === 'b' ? 'c0' : mark === 'y' ? 'c1' : 'c2'}`;
    btn.type = 'button';
    btn.textContent = state.guess[index] ? state.guess[index].toUpperCase() : ' ';
    btn.addEventListener('click', () => {
      state.pattern[index] = STATE_ORDER[(STATE_ORDER.indexOf(state.pattern[index]) + 1) % STATE_ORDER.length];
      render();
    });
    feedbackEl.append(btn);
  });
}

function computeView() {
  const candidates = filterCandidates(state.words, state.history);
  const ranked = rankCandidates(candidates, state.words);
  return { candidates, ranked, best: ranked[0], alternates: ranked.slice(1, 5) };
}

function render() {
  renderTiles();
  guessInput.value = state.guess;
  const { candidates, ranked, best, alternates } = computeView();
  bestWordEl.textContent = best?.word || '—';
  rationaleEl.textContent = rationale(best?.word, candidates);
  countEl.textContent = `${candidates.length} remaining candidate${candidates.length === 1 ? '' : 's'}`;

  altsEl.innerHTML = '';
  while (alternates.length < 4) alternates.push({ word: '—', score: 0 });
  alternates.slice(0, 4).forEach((item, index) => {
    const node = document.createElement('article');
    node.className = 'alt';
    node.innerHTML = `<div class="alt-word">${item.word}</div><div class="alt-meta">Alt ${index + 1}</div>`;
    altsEl.append(node);
  });

  historyEl.innerHTML = '';
  historyEmptyEl.classList.toggle('hidden', state.history.length > 0);
  for (const [index, entry] of state.history.entries()) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<div class="history-top"><span>#${index + 1}</span><span class="word">${entry.guess}</span><span>${entry.pattern.join('').toUpperCase()}</span></div>`;
    const row = document.createElement('div');
    row.className = 'feedback';
    entry.pattern.forEach((mark, i) => {
      const tile = document.createElement('div');
      tile.className = `tile ${mark === 'b' ? 'c0' : mark === 'y' ? 'c1' : 'c2'}`;
      tile.textContent = entry.guess[i].toUpperCase();
      row.append(tile);
    });
    item.append(row);
    historyEl.append(item);
  }

  candidatesEl.textContent = candidates.slice(0, 40).join(', ') + (candidates.length > 40 ? ` … (+${candidates.length - 40} more)` : '');
  solverDetailEl.textContent = `Human-first ranking on ${state.words.length} allowed guesses; visible suggestions are capped to one primary card plus four alternates.`;
}

function submitGuess() {
  const guess = normalizeGuess(state.guess);
  if (guess.length !== 5 || !state.words.includes(guess)) return;
  state.history.push({ guess, pattern: [...state.pattern] });
  state.guess = '';
  state.pattern = ['b', 'b', 'b', 'b', 'b'];
  render();
  guessInput.focus();
}

function undo() {
  state.history.pop();
  render();
}

function reset() {
  state.history = [];
  state.guess = '';
  state.pattern = ['b', 'b', 'b', 'b', 'b'];
  render();
}

async function loadWords() {
  const response = await fetch('./assets/analysis-worker-BEjpoe4U.js');
  const text = await response.text();
  const match = text.match(/const\s+g\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error('Could not load word list');
  state.words = JSON.parse(match[1].replace(/'/g, '"'));
}

el.querySelector('#submit').addEventListener('click', submitGuess);
el.querySelector('#undo').addEventListener('click', undo);
el.querySelector('#reset').addEventListener('click', reset);
guessInput.addEventListener('input', (event) => {
  state.guess = normalizeGuess(event.target.value);
  renderTiles();
});
guessInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') submitGuess();
});

loadWords().then(() => render()).catch((error) => {
  bestWordEl.textContent = 'Error';
  rationaleEl.textContent = error.message;
});

renderTiles();
