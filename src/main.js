import './styles.css';
import { ALLOWED_GUESSES, ANSWERS, FEEDBACK, normalizeWord, pickDailyAnswer, scoreGuess, summarizeSuggestion } from './solver.js';

const state = {
  mode: 'assistant',
  answer: pickDailyAnswer(),
  draftGuess: '',
  draftFeedback: Array(5).fill(FEEDBACK.ABSENT),
  history: [],
  message: 'Type a guess, mark the colors, then submit.',
  analysis: {
    candidates: ANSWERS.slice(),
    suggestions: [],
    solved: false,
    loading: true,
    durationMs: 0,
    error: '',
  },
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

const worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
const app = document.querySelector('#app');
let analysisRequestId = 0;
let lastRenderedMarkup = '';

worker.onmessage = (event) => {
  const { requestId, candidates, suggestions, solved, durationMs } = event.data;
  if (requestId !== analysisRequestId) return;
  state.analysis = { candidates, suggestions, solved, loading: false, durationMs, error: '' };
  if (!state.history.length) {
    state.message = 'Ready. Start with a strong opener or enter your real Wordle history.';
  }
  render();
};

worker.onerror = () => {
  state.analysis = {
    ...state.analysis,
    loading: false,
    error: 'Suggestion engine tripped over its own shoelaces. Reset and try again.',
  };
  render();
};

function requestAnalysis() {
  analysisRequestId += 1;
  state.analysis = { ...state.analysis, loading: true, error: '' };
  render();
  worker.postMessage({ requestId: analysisRequestId, history: state.history, limit: 8 });
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
  setMessage(nextMode === 'assistant' ? 'Assistant mode reset.' : 'Fresh simulator round. Hidden answer loaded. Very mysterious.');
  requestAnalysis();
}

function updateDraftGuess(raw) {
  state.draftGuess = normalizeWord(raw);
  render();
}

function setDraftGuess(word) {
  state.draftGuess = normalizeWord(word);
  render();
}

function cycleFeedback(index) {
  if (state.mode !== 'assistant') return;
  state.draftFeedback[index] = feedbackCycle[state.draftFeedback[index]];
  render();
}

function addEntry() {
  const guess = normalizeWord(state.draftGuess);
  if (guess.length !== 5) {
    setMessage('Guess must be a 5-letter word. Wordle remains annoyingly strict.');
    return render();
  }
  if (!ALLOWED_GUESSES.includes(guess)) {
    setMessage('That word is not in the built-in dictionary.');
    return render();
  }

  const feedback = state.mode === 'assistant' ? state.draftFeedback.join('') : scoreGuess(guess, state.answer);
  state.history = [...state.history, { guess, feedback }];
  state.draftGuess = '';
  state.draftFeedback = Array(5).fill(FEEDBACK.ABSENT);

  if (feedback === 'ggggg') {
    setMessage(state.mode === 'assistant' ? `Solved in ${state.history.length} turns.` : `Solved. The hidden word was ${guess.toUpperCase()}.`);
  } else if (state.mode === 'simulator') {
    setMessage(`Applied live feedback for ${guess.toUpperCase()}.`);
  } else {
    setMessage(`Logged ${guess.toUpperCase()} · ${feedback.toUpperCase()}.`);
  }

  requestAnalysis();
}

function undoEntry() {
  if (!state.history.length) {
    setMessage('Nothing to undo. A rare mercy.');
    return render();
  }
  const removed = state.history.at(-1);
  state.history = state.history.slice(0, -1);
  state.draftGuess = removed.guess;
  state.draftFeedback = removed.feedback.split('');
  setMessage(`Removed ${removed.guess.toUpperCase()}. Draft restored.`);
  requestAnalysis();
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

function historyRow(entry, index) {
  return `
    <article class="history-card">
      <div>
        <span class="history-index">#${index + 1}</span>
        <strong>${entry.guess.toUpperCase()}</strong>
      </div>
      <div class="history-row">${entry.guess.split('').map((letter, letterIndex) => `<button class="tile tile--${entry.feedback[letterIndex]}" disabled>${letter}</button>`).join('')}</div>
    </article>`;
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

function statsMarkup() {
  const { candidates, suggestions, loading, durationMs } = state.analysis;
  const best = suggestions[0];
  const items = [
    ['Remaining', candidates.length.toLocaleString()],
    ['Turns', String(state.history.length)],
    ['Best info', best ? `${best.entropy.toFixed(2)} bits` : '—'],
    ['Think time', loading ? '...' : `${durationMs.toFixed(1)} ms`],
  ];
  return items.map(([label, value]) => `<div class="stat"><span class="stat-label">${label}</span><strong>${value}</strong></div>`).join('');
}

function suggestionsMarkup() {
  const { candidates, suggestions, loading, error } = state.analysis;
  if (error) return `<div class="empty-state empty-state--error">${error}</div>`;
  if (loading) return '<div class="empty-state">Re-ranking suggestions…</div>';
  if (!suggestions.length) return '<div class="empty-state">No suggestions yet. Add a valid guess to narrow the field.</div>';
  return `
    <div class="suggestion-list">
      ${suggestions.map((entry, index) => `
        <article class="suggestion ${index === 0 ? 'suggestion--best' : ''}">
          <div class="suggestion-top">
            <div>
              <div class="suggestion-word">${entry.word}</div>
              <div class="suggestion-meta">${entry.entropy.toFixed(2)} bits · avg ${entry.expectedRemaining.toFixed(2)} left · ${entry.isCandidate ? 'candidate' : 'probe'}</div>
            </div>
            <button class="ghost ghost--small" data-fill="${entry.word}">Use</button>
          </div>
          <p>${summarizeSuggestion(entry, candidates.length)}</p>
        </article>`).join('')}
    </div>`;
}

function candidateMarkup() {
  const { candidates, loading } = state.analysis;
  if (loading && !state.history.length) return '<div class="empty-state">Loading candidate set…</div>';
  if (!candidates.length) return '<div class="empty-state empty-state--error">No answers match this history. Check the feedback pattern.</div>';
  const preview = candidates.slice(0, 24);
  return `
    <div class="candidate-summary">
      <p><strong>${candidates.length.toLocaleString()}</strong> matching answers.</p>
      <p class="subtle">Showing the first ${preview.length}. Use the ranked list first; do not drown in chips.</p>
    </div>
    <div class="candidate-list">${preview.map((word) => `<span>${word}</span>`).join('')}</div>`;
}

function render() {
  const { candidates, solved, loading } = state.analysis;
  const intro = state.mode === 'assistant'
    ? 'Paste your real Wordle attempts here: type the guess, click tiles to set gray / yellow / green, submit, repeat.'
    : 'Simulator mode grades guesses for you against a hidden answer, so you can test the solver without juggling feedback.';

  const markup = `
    <main class="shell">
      <section class="hero card">
        <div>
          <p class="eyebrow">Wordle Better</p>
          <h1>Fast solver, less sludge.</h1>
          <p class="subtle hero-copy">Entropy-ranked suggestions, exact duplicate-letter handling, and a UI that stops making your browser do cardio on every keystroke.</p>
          <p class="helper helper--hero">${intro}</p>
        </div>
        <div class="hero-side">
          <div class="mode-switch">
            <button class="pill ${state.mode === 'assistant' ? 'pill--active' : ''}" data-mode="assistant">Assistant</button>
            <button class="pill ${state.mode === 'simulator' ? 'pill--active' : ''}" data-mode="simulator">Simulator</button>
          </div>
          <div class="status-badge ${solved ? 'status-badge--good' : ''}">${loading ? 'Thinking…' : state.message}</div>
        </div>
      </section>

      <section class="grid">
        <div class="stack">
          <section class="card card--input">
            <div class="card-head">
              <h2>${state.mode === 'assistant' ? 'Enter guess + feedback' : 'Play against hidden answer'}</h2>
              <div class="actions">
                <button class="ghost" data-action="undo">Undo</button>
                <button class="ghost" data-action="reset">Reset</button>
                ${state.mode === 'simulator' ? '<button class="ghost" data-action="reveal">Reveal</button>' : ''}
              </div>
            </div>
            <label class="field-label" for="guess-input">Guess</label>
            <input id="guess-input" class="guess-input" maxlength="5" value="${state.draftGuess}" placeholder="slate" autocomplete="off" autocapitalize="none" spellcheck="false" />
            <div class="tile-row tile-row--interactive">
              ${Array.from({ length: 5 }, (_, index) => {
                const letter = state.draftGuess[index] || '';
                const status = state.mode === 'assistant' ? state.draftFeedback[index] : (letter ? FEEDBACK.ABSENT : 'empty');
                const label = state.mode === 'assistant' ? `${feedbackLabel[state.draftFeedback[index]]}. Click to change.` : 'Simulator mode auto-grades.';
                return `<button class="${tileClass(status)}" data-index="${index}" ${state.mode === 'assistant' ? '' : 'disabled'} aria-label="${label}">${letter}</button>`;
              }).join('')}
            </div>
            <div class="feedback-legend">
              <span><i class="legend-swatch legend-swatch--b"></i>Absent</span>
              <span><i class="legend-swatch legend-swatch--y"></i>Present</span>
              <span><i class="legend-swatch legend-swatch--g"></i>Correct</span>
            </div>
            <div class="actions actions--bottom">
              <button class="primary" data-action="submit">Submit guess</button>
              <p class="helper">Keyboard works: type letters, Backspace deletes, Enter submits.</p>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>History</h2><span>${state.history.length} turns</span></div>
            <div class="history-list">${state.history.length ? state.history.map(historyRow).join('') : '<div class="empty-state">No guesses yet. Start with something broad like SLATE, CRANE, or your usual ritual sacrifice.</div>'}</div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Keyboard</h2><span>${candidates.length.toLocaleString()} matches</span></div>
            <div class="keyboard">
              ${['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row) => `<div class="keyboard-row">${row.split('').map((letter) => keyboardKey(letter, candidates)).join('')}</div>`).join('')}
              <div class="keyboard-row keyboard-row--actions"><button class="key key--wide" data-action="backspace">⌫</button><button class="key key--wide key--enter" data-action="submit">Enter</button></div>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="card stats-grid">${statsMarkup()}</section>

          <section class="card">
            <div class="card-head"><h2>Top suggestions</h2><span>${loading ? 'updating' : `${state.analysis.suggestions.length} shown`}</span></div>
            ${suggestionsMarkup()}
          </section>

          <section class="card">
            <div class="card-head"><h2>Candidate snapshot</h2><span>${Math.min(state.analysis.candidates.length, 24)} previewed</span></div>
            ${candidateMarkup()}
          </section>
        </div>
      </section>
    </main>`;

  if (markup === lastRenderedMarkup) return;
  lastRenderedMarkup = markup;
  app.innerHTML = markup;

  app.querySelector('#guess-input').addEventListener('input', (event) => updateDraftGuess(event.target.value));
  app.querySelectorAll('[data-index]').forEach((button) => button.addEventListener('click', () => cycleFeedback(Number(button.dataset.index))));
  app.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => resetGame(button.dataset.mode)));
  app.querySelectorAll('[data-letter]').forEach((button) => button.addEventListener('click', () => updateDraftGuess(state.draftGuess + button.dataset.letter)));
  app.querySelectorAll('[data-fill]').forEach((button) => button.addEventListener('click', () => setDraftGuess(button.dataset.fill)));
  app.querySelectorAll('[data-action="backspace"]').forEach((button) => button.addEventListener('click', () => updateDraftGuess(state.draftGuess.slice(0, -1))));
  app.querySelectorAll('[data-action="submit"]').forEach((button) => button.addEventListener('click', addEntry));
  app.querySelectorAll('[data-action="reset"]').forEach((button) => button.addEventListener('click', () => resetGame()));
  app.querySelectorAll('[data-action="undo"]').forEach((button) => button.addEventListener('click', undoEntry));
  app.querySelectorAll('[data-action="reveal"]').forEach((button) => button.addEventListener('click', revealAnswer));
}

requestAnalysis();
render();
