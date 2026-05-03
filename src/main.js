import './styles.css';
import { ALLOWED_GUESSES, ANSWERS, FEEDBACK, normalizeWord, pickDailyAnswer, scoreGuess, summarizeSuggestion } from './solver.js';

const state = {
  mode: 'assistant',
  answer: pickDailyAnswer(),
  draftGuess: '',
  draftFeedback: Array(5).fill(FEEDBACK.ABSENT),
  history: [],
  message: 'Type a guess, tap the tiles, submit.',
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
let refs;

worker.onmessage = (event) => {
  const { requestId, candidates, suggestions, solved, durationMs } = event.data;
  if (requestId !== analysisRequestId) return;
  state.analysis = { candidates, suggestions, solved, loading: false, durationMs, error: '' };
  if (!state.history.length) {
    state.message = 'Ready. Start with a strong opener or enter your real history.';
  }
  renderAnalysis();
  renderStatus();
};

worker.onerror = () => {
  state.analysis = {
    ...state.analysis,
    loading: false,
    error: 'Suggestion engine tripped over its own shoelaces. Reset and try again.',
  };
  renderAnalysis();
  renderStatus();
};

function requestAnalysis() {
  analysisRequestId += 1;
  state.analysis = { ...state.analysis, loading: true, error: '' };
  renderAnalysis();
  renderStatus();
  worker.postMessage({ requestId: analysisRequestId, history: state.history, limit: 8 });
}

function setMessage(text) {
  state.message = text;
}

function focusGuessInput(moveCaretToEnd = false) {
  const input = refs?.guessInput;
  if (!input) return;
  input.focus({ preventScroll: true });
  if (moveCaretToEnd) {
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }
}

function resetGame(nextMode = state.mode) {
  state.mode = nextMode;
  state.answer = pickDailyAnswer(Date.now() + Math.random() * 1e9);
  state.draftGuess = '';
  state.draftFeedback = Array(5).fill(FEEDBACK.ABSENT);
  state.history = [];
  setMessage(nextMode === 'assistant' ? 'Assistant reset.' : 'Fresh simulator round loaded. The secret word is behaving.' );
  renderStaticState();
  requestAnalysis();
  focusGuessInput();
}

function updateDraftGuess(raw) {
  state.draftGuess = normalizeWord(raw);
  renderDraft();
}

function setDraftGuess(word) {
  state.draftGuess = normalizeWord(word);
  renderDraft();
  focusGuessInput(true);
}

function cycleFeedback(index) {
  if (state.mode !== 'assistant') return;
  state.draftFeedback[index] = feedbackCycle[state.draftFeedback[index]];
  renderDraft();
  focusGuessInput(true);
}

function addEntry() {
  const guess = normalizeWord(state.draftGuess);
  if (guess.length !== 5) {
    setMessage('Guess must be a 5-letter word. Wordle remains annoyingly strict.');
    renderStatus();
    return;
  }
  if (!ALLOWED_GUESSES.includes(guess)) {
    setMessage('That word is not in the built-in dictionary.');
    renderStatus();
    return;
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

  renderStaticState();
  requestAnalysis();
  focusGuessInput();
}

function undoEntry() {
  if (!state.history.length) {
    setMessage('Nothing to undo. A rare mercy.');
    renderStatus();
    return;
  }
  const removed = state.history.at(-1);
  state.history = state.history.slice(0, -1);
  state.draftGuess = removed.guess;
  state.draftFeedback = removed.feedback.split('');
  setMessage(`Removed ${removed.guess.toUpperCase()}. Draft restored.`);
  renderStaticState();
  requestAnalysis();
  focusGuessInput(true);
}

function revealAnswer() {
  setMessage(`Hidden answer: ${state.answer.toUpperCase()}.`);
  renderStatus();
}

function keyHandler(event) {
  if (event.target.closest('input, textarea')) return;
  if (/^[a-zA-Z]$/.test(event.key)) {
    updateDraftGuess(state.draftGuess + event.key);
    focusGuessInput(true);
  } else if (event.key === 'Backspace') {
    updateDraftGuess(state.draftGuess.slice(0, -1));
    focusGuessInput(true);
  } else if (event.key === 'Enter') {
    addEntry();
  }
}

document.addEventListener('keydown', keyHandler);

document.addEventListener('dblclick', (event) => {
  if (event.target.closest('[data-index]')) {
    event.preventDefault();
  }
});

function tileClass(letterState) {
  return `tile tile--${letterState}`;
}

function historyRow(entry, index) {
  return `
    <article class="history-row-card">
      <div class="history-row-head">
        <span class="history-index">${index + 1}</span>
        <strong>${entry.guess.toUpperCase()}</strong>
        <span class="history-pattern">${entry.feedback.toUpperCase()}</span>
      </div>
      <div class="history-tiles">${entry.guess.split('').map((letter, letterIndex) => `<button class="tile tile--${entry.feedback[letterIndex]}" disabled>${letter}</button>`).join('')}</div>
    </article>`;
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

function heroSuggestionMarkup() {
  const { candidates, suggestions, loading, error } = state.analysis;
  if (error) return `<div class="empty-state empty-state--error">${error}</div>`;
  if (loading) return '<div class="focus-suggestion focus-suggestion--loading">Re-ranking suggestions…</div>';
  if (!suggestions.length) return '<div class="focus-suggestion focus-suggestion--loading">No suggestion yet. Add a valid guess and the list will sharpen.</div>';
  const best = suggestions[0];
  return `
    <article class="focus-suggestion">
      <div>
        <p class="focus-label">Best next guess</p>
        <div class="focus-word-row">
          <strong class="focus-word">${best.word}</strong>
          <button class="primary primary--compact" data-fill="${best.word}">Use guess</button>
        </div>
        <p class="focus-summary">${summarizeSuggestion(best, candidates.length)}</p>
      </div>
      <div class="focus-metrics">
        <span>${best.entropy.toFixed(2)} bits</span>
        <span>${best.expectedRemaining.toFixed(2)} avg left</span>
        <span>${best.isCandidate ? 'candidate' : 'probe'}</span>
      </div>
    </article>`;
}

function suggestionsMarkup() {
  const { candidates, suggestions, loading, error } = state.analysis;
  if (error) return `<div class="empty-state empty-state--error">${error}</div>`;
  if (loading) return '<div class="empty-state">Refreshing ranked list…</div>';
  if (!suggestions.length) return '<div class="empty-state">No suggestions yet.</div>';
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
    <details class="candidate-details">
      <summary>
        <span><strong>${candidates.length.toLocaleString()}</strong> matching answers</span>
        <span class="subtle">preview ${preview.length}</span>
      </summary>
      <div class="candidate-list">${preview.map((word) => `<span>${word}</span>`).join('')}</div>
    </details>`;
}

function renderFrame() {
  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Wordle Better</p>
          <h1>Suggestion first. Everything else quieter.</h1>
          <p class="subtle">A stripped-down solver with strong guesses up top, compact input below, and no plastic dashboard cosplay.</p>
        </div>
        <div class="hero-controls">
          <div class="mode-switch" id="mode-switch"></div>
          <div class="status-badge" id="status-badge"></div>
        </div>
      </section>

      <section class="layout">
        <section class="card card--suggestions">
          <div class="card-head card-head--focus">
            <div>
              <p class="section-kicker">Suggestions</p>
              <h2>Top line</h2>
            </div>
            <span id="suggestion-count"></span>
          </div>
          <div class="stats-grid" id="stats-grid"></div>
          <div id="hero-suggestion"></div>
          <div id="suggestions"></div>
        </section>

        <section class="rail">
          <section class="card card--input">
            <div class="card-head card-head--input">
              <div>
                <p class="section-kicker">Input</p>
                <h2 id="input-title"></h2>
              </div>
              <div class="actions actions--tight">
                <button class="ghost" data-action="undo">Undo</button>
                <button class="ghost" data-action="reset">Reset</button>
                <span id="reveal-slot"></span>
              </div>
            </div>
            <p class="helper" id="intro-copy"></p>
            <div class="composer">
              <input id="guess-input" class="guess-input" maxlength="5" placeholder="slate" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Guess" />
              <button class="primary" data-action="submit">Submit</button>
            </div>
            <div class="tile-row tile-row--interactive" id="draft-tiles"></div>
            <p class="helper helper--micro" id="feedback-helper"></p>
          </section>

          <section class="card card--secondary">
            <div class="card-head">
              <div>
                <p class="section-kicker">History</p>
                <h2>Guesses</h2>
              </div>
              <span id="history-count"></span>
            </div>
            <div class="history-list" id="history-list"></div>
          </section>

          <section class="card card--secondary">
            <div class="card-head">
              <div>
                <p class="section-kicker">Candidates</p>
                <h2>Details</h2>
              </div>
              <span id="candidate-count"></span>
            </div>
            <div id="candidate-panel"></div>
          </section>
        </section>
      </section>
    </main>`;

  refs = {
    introCopy: app.querySelector('#intro-copy'),
    modeSwitch: app.querySelector('#mode-switch'),
    statusBadge: app.querySelector('#status-badge'),
    inputTitle: app.querySelector('#input-title'),
    revealSlot: app.querySelector('#reveal-slot'),
    guessInput: app.querySelector('#guess-input'),
    draftTiles: app.querySelector('#draft-tiles'),
    feedbackHelper: app.querySelector('#feedback-helper'),
    historyCount: app.querySelector('#history-count'),
    historyList: app.querySelector('#history-list'),
    statsGrid: app.querySelector('#stats-grid'),
    heroSuggestion: app.querySelector('#hero-suggestion'),
    suggestionCount: app.querySelector('#suggestion-count'),
    suggestions: app.querySelector('#suggestions'),
    candidateCount: app.querySelector('#candidate-count'),
    candidatePanel: app.querySelector('#candidate-panel'),
  };
}

function renderStatus() {
  refs.statusBadge.textContent = state.analysis.loading ? 'Thinking…' : state.message;
  refs.statusBadge.className = `status-badge${state.analysis.solved ? ' status-badge--good' : ''}`;
}

function renderModeControls() {
  const intro = state.mode === 'assistant'
    ? 'Type the guess, tap tiles to cycle gray/yellow/green, press Enter to log it.'
    : 'Simulator quietly scores each guess against a hidden answer so you can test lines fast.';
  refs.introCopy.textContent = intro;
  refs.modeSwitch.innerHTML = `
    <button class="pill ${state.mode === 'assistant' ? 'pill--active' : ''}" data-mode="assistant">Assistant</button>
    <button class="pill ${state.mode === 'simulator' ? 'pill--active' : ''}" data-mode="simulator">Simulator</button>`;
  refs.inputTitle.textContent = state.mode === 'assistant' ? 'Enter guess + feedback' : 'Play against hidden answer';
  refs.revealSlot.innerHTML = state.mode === 'simulator' ? '<button class="ghost" data-action="reveal">Reveal</button>' : '';
  refs.feedbackHelper.textContent = state.mode === 'assistant'
    ? 'Tap a tile to cycle feedback. Touch actions are locked down to avoid the usual mobile zoom nonsense.'
    : 'Feedback tiles are display-only here; the simulator fills them in for you.';
}

function renderDraft() {
  if (refs.guessInput.value !== state.draftGuess) {
    const wasFocused = document.activeElement === refs.guessInput;
    refs.guessInput.value = state.draftGuess;
    if (wasFocused) focusGuessInput(true);
  }

  refs.draftTiles.innerHTML = Array.from({ length: 5 }, (_, index) => {
    const letter = state.draftGuess[index] || '';
    const status = state.mode === 'assistant' ? state.draftFeedback[index] : (letter ? FEEDBACK.ABSENT : 'empty');
    const label = state.mode === 'assistant' ? `${feedbackLabel[state.draftFeedback[index]]}. Tap to change.` : 'Simulator mode auto-grades.';
    return `<button class="${tileClass(status)}" data-index="${index}" ${state.mode === 'assistant' ? '' : 'disabled'} aria-label="${label}">${letter}</button>`;
  }).join('');
}

function renderHistory() {
  refs.historyCount.textContent = `${state.history.length} turns`;
  refs.historyList.innerHTML = state.history.length
    ? state.history.map(historyRow).join('')
    : '<div class="empty-state">No guesses yet. Open with something broad and let the solver do the fussy part.</div>';
}

function renderAnalysis() {
  refs.statsGrid.innerHTML = statsMarkup();
  refs.heroSuggestion.innerHTML = heroSuggestionMarkup();
  refs.suggestionCount.textContent = state.analysis.loading ? 'updating' : `${state.analysis.suggestions.length} ranked`;
  refs.suggestions.innerHTML = suggestionsMarkup();
  refs.candidateCount.textContent = `${state.analysis.candidates.length.toLocaleString()} live`;
  refs.candidatePanel.innerHTML = candidateMarkup();
}

function renderStaticState() {
  renderModeControls();
  renderStatus();
  renderDraft();
  renderHistory();
}

function bindEvents() {
  refs.guessInput.addEventListener('input', (event) => updateDraftGuess(event.target.value));

  app.addEventListener('pointerdown', (event) => {
    const tile = event.target.closest('[data-index]');
    if (!tile) return;
    event.preventDefault();
  });

  app.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    if (target.dataset.index !== undefined) {
      cycleFeedback(Number(target.dataset.index));
      return;
    }
    if (target.dataset.mode) {
      resetGame(target.dataset.mode);
      return;
    }
    if (target.dataset.fill) {
      setDraftGuess(target.dataset.fill);
      return;
    }

    switch (target.dataset.action) {
      case 'submit':
        addEntry();
        break;
      case 'reset':
        resetGame();
        break;
      case 'undo':
        undoEntry();
        break;
      case 'reveal':
        revealAnswer();
        break;
      default:
        break;
    }
  });
}

renderFrame();
bindEvents();
renderStaticState();
requestAnalysis();
focusGuessInput();
