import './styles.css';
import { ALLOWED_GUESSES, ANSWERS, FEEDBACK, filterCandidates, normalizeWord, pickDailyAnswer, rankGuesses, scoreGuess, summarizeSuggestion } from './solver.js';

const state = {
  mode: 'assistant',
  answer: pickDailyAnswer(),
  draftGuess: '',
  draftFeedback: Array(5).fill(FEEDBACK.ABSENT),
  history: [],
  message: 'Enter a guess, set feedback, and submit.',
};

const feedbackCycle = {
  [FEEDBACK.ABSENT]: FEEDBACK.PRESENT,
  [FEEDBACK.PRESENT]: FEEDBACK.CORRECT,
  [FEEDBACK.CORRECT]: FEEDBACK.ABSENT,
};

const feedbackLabel = {
  [FEEDBACK.ABSENT]: 'Absent',
  [FEEDBACK.PRESENT]: 'Present',
  [FEEDBACK.CORRECT]: 'Correct',
};

const app = document.querySelector('#app');

function computeViewModel() {
  const candidates = filterCandidates(ANSWERS, state.history);
  const suggestions = rankGuesses(candidates, ALLOWED_GUESSES, 10);
  const solved = state.history.at(-1)?.feedback === 'ggggg';
  return { candidates, suggestions, solved };
}

function setMessage(text) {
  state.message = text;
}

function resetGame(nextMode = state.mode) {
  state.mode = nextMode;
  state.answer = pickDailyAnswer(Date.now() + Math.random() * 1e9);
  state.draftGuess = '';
  state.draftFeedback = Array(5).fill(FEEDBACK.ABSENT);
  state.history = [];
  setMessage(nextMode === 'assistant' ? 'Assistant mode reset.' : 'Simulator mode reset with a new hidden answer.');
  render();
}

function updateDraftGuess(raw) {
  state.draftGuess = normalizeWord(raw);
  render();
}

function cycleFeedback(index) {
  state.draftFeedback[index] = feedbackCycle[state.draftFeedback[index]];
  render();
}

function addEntry() {
  const guess = normalizeWord(state.draftGuess);
  if (guess.length !== 5) {
    setMessage('Guess must be a 5-letter word.');
    return render();
  }
  if (!ALLOWED_GUESSES.includes(guess)) {
    setMessage('That word is not in the built-in dictionary.');
    return render();
  }

  const feedback = state.mode === 'assistant' ? state.draftFeedback.join('') : scoreGuess(guess, state.answer);
  state.history.push({ guess, feedback });
  state.draftGuess = '';
  state.draftFeedback = Array(5).fill(FEEDBACK.ABSENT);

  if (feedback === 'ggggg') {
    setMessage(state.mode === 'assistant' ? `Solved in ${state.history.length} turns.` : `Solved! The hidden word was ${guess.toUpperCase()}.`);
  } else if (state.mode === 'simulator') {
    setMessage(`Feedback applied automatically for ${guess.toUpperCase()}.`);
  } else {
    setMessage(`Added ${guess.toUpperCase()} with feedback ${feedback.toUpperCase()}.`);
  }

  render();
}

function revealAnswer() {
  setMessage(`Hidden answer: ${state.answer.toUpperCase()}.`);
  render();
}

function keyHandler(event) {
  if (event.target.closest('input, textarea')) return;
  if (/^[a-zA-Z]$/.test(event.key)) updateDraftGuess(state.draftGuess + event.key);
  else if (event.key === 'Backspace') updateDraftGuess(state.draftGuess.slice(0, -1));
  else if (event.key === 'Enter') addEntry();
}

document.addEventListener('keydown', keyHandler);

function tileClass(letterState) {
  return `tile tile--${letterState}`;
}

function historyRow(entry) {
  return `<div class="history-row">${entry.guess.split('').map((letter, index) => `<button class="tile tile--${entry.feedback[index]}" disabled>${letter}</button>`).join('')}</div>`;
}

function keyboardKey(letter, candidates) {
  let status = 'unused';
  for (const entry of state.history) {
    for (let i = 0; i < 5; i += 1) {
      if (entry.guess[i] !== letter) continue;
      if (entry.feedback[i] === FEEDBACK.CORRECT) status = 'correct';
      else if (entry.feedback[i] === FEEDBACK.PRESENT && status !== 'correct') status = 'present';
      else if (entry.feedback[i] === FEEDBACK.ABSENT && status === 'unused') status = 'absent';
    }
  }
  if (status === 'unused' && candidates.some((word) => word.includes(letter))) status = 'hint';
  return `<button class="key key--${status}" data-letter="${letter}">${letter}</button>`;
}

function render() {
  const { candidates, suggestions, solved } = computeViewModel();
  const best = suggestions[0];
  const stats = {
    remaining: candidates.length,
    turns: state.history.length,
    uncertainty: best ? best.entropy.toFixed(2) : '0.00',
  };

  app.innerHTML = `
    <main class="shell">
      <section class="hero card">
        <div>
          <p class="eyebrow">Wordle Better</p>
          <h1>Sharper Wordle solving.</h1>
          <p class="subtle">Entropy-ranked hints, duplicate-letter correctness, assistant mode, and a full simulator in one static app.</p>
        </div>
        <div class="mode-switch">
          <button class="pill ${state.mode === 'assistant' ? 'pill--active' : ''}" data-mode="assistant">Assistant</button>
          <button class="pill ${state.mode === 'simulator' ? 'pill--active' : ''}" data-mode="simulator">Simulator</button>
        </div>
      </section>

      <section class="grid">
        <div class="stack">
          <section class="card">
            <div class="card-head">
              <h2>${state.mode === 'assistant' ? 'Manual feedback entry' : 'Play against hidden answer'}</h2>
              <div class="actions">
                <button class="ghost" data-action="reset">Reset</button>
                ${state.mode === 'simulator' ? '<button class="ghost" data-action="reveal">Reveal</button>' : ''}
              </div>
            </div>
            <label class="field-label">Guess</label>
            <input class="guess-input" maxlength="5" value="${state.draftGuess}" placeholder="slate" />
            <div class="tile-row">
              ${Array.from({ length: 5 }, (_, index) => {
                const letter = state.draftGuess[index] || '';
                const status = state.mode === 'assistant' ? state.draftFeedback[index] : (letter ? FEEDBACK.ABSENT : 'empty');
                const label = state.mode === 'assistant' ? ` title="${feedbackLabel[state.draftFeedback[index]]}"` : '';
                return `<button class="${tileClass(status)}" data-index="${index}" ${state.mode === 'assistant' ? '' : 'disabled'}${label}>${letter}</button>`;
              }).join('')}
            </div>
            <p class="helper">${state.mode === 'assistant' ? 'Click tiles to cycle absent → present → correct.' : 'In simulator mode feedback is computed automatically.'}</p>
            <div class="actions actions--bottom">
              <button class="primary" data-action="submit">Submit guess</button>
              <div class="status ${solved ? 'status--good' : ''}">${state.message}</div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>History</h2><span>${state.history.length} turns</span></div>
            <div class="history-list">${state.history.length ? state.history.map(historyRow).join('') : '<p class="subtle">No guesses yet.</p>'}</div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Keyboard</h2><span>Type or click</span></div>
            <div class="keyboard">
              ${['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row) => `<div class="keyboard-row">${row.split('').map((letter) => keyboardKey(letter, candidates)).join('')}</div>`).join('')}
              <div class="keyboard-row keyboard-row--actions"><button class="key key--wide" data-action="backspace">⌫</button><button class="key key--wide key--enter" data-action="submit">Enter</button></div>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="card stats-grid">
            <div><span class="stat-label">Remaining</span><strong>${stats.remaining}</strong></div>
            <div><span class="stat-label">Turns</span><strong>${stats.turns}</strong></div>
            <div><span class="stat-label">Best info</span><strong>${stats.uncertainty} bits</strong></div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Top suggestions</h2><span>${candidates.length} candidates</span></div>
            <div class="suggestion-list">
              ${suggestions.map((entry, index) => `
                <article class="suggestion ${index === 0 ? 'suggestion--best' : ''}">
                  <div>
                    <div class="suggestion-word">${entry.word}</div>
                    <div class="suggestion-meta">${entry.entropy.toFixed(2)} bits · avg ${entry.expectedRemaining.toFixed(2)} left · ${entry.isCandidate ? 'candidate' : 'probe'}</div>
                  </div>
                  <p>${summarizeSuggestion(entry, candidates.length)}</p>
                </article>
              `).join('')}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Candidate list</h2><span>${Math.min(candidates.length, 80)} shown</span></div>
            <div class="candidate-list">${candidates.slice(0, 80).map((word) => `<span>${word}</span>`).join('') || '<p class="subtle">No matches.</p>'}</div>
          </section>
        </div>
      </section>
    </main>`;

  app.querySelector('.guess-input').addEventListener('input', (event) => updateDraftGuess(event.target.value));
  app.querySelectorAll('[data-index]').forEach((button) => button.addEventListener('click', () => cycleFeedback(Number(button.dataset.index))));
  app.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => resetGame(button.dataset.mode)));
  app.querySelectorAll('[data-letter]').forEach((button) => button.addEventListener('click', () => updateDraftGuess(state.draftGuess + button.dataset.letter)));
  app.querySelectorAll('[data-action="backspace"]').forEach((button) => button.addEventListener('click', () => updateDraftGuess(state.draftGuess.slice(0, -1))));
  app.querySelectorAll('[data-action="submit"]').forEach((button) => button.addEventListener('click', addEntry));
  app.querySelectorAll('[data-action="reset"]').forEach((button) => button.addEventListener('click', () => resetGame()));
  app.querySelectorAll('[data-action="reveal"]').forEach((button) => button.addEventListener('click', revealAnswer));
}

render();
