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
let refs;

worker.onmessage = (event) => {
  const { requestId, candidates, suggestions, solved, durationMs } = event.data;
  if (requestId !== analysisRequestId) return;
  state.analysis = { candidates, suggestions, solved, loading: false, durationMs, error: '' };
  if (!state.history.length) {
    state.message = 'Ready. Start with a strong opener or enter your real Wordle history.';
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
  setMessage(nextMode === 'assistant' ? 'Assistant mode reset.' : 'Fresh simulator round. Hidden answer loaded. Very mysterious.');
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
  const active = state.draftGuess.includes(letter) ? ' key--active' : '';
  return `<button class="key key--${status}${active}" data-letter="${letter}">${letter}</button>`;
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

function renderFrame() {
  const intro = state.mode === 'assistant'
    ? 'Paste your real Wordle attempts here: type the guess, click tiles to set gray / yellow / green, submit, repeat.'
    : 'Simulator mode grades guesses for you against a hidden answer, so you can test the solver without juggling feedback.';

  app.innerHTML = `
    <main class="shell">
      <section class="hero card">
        <div>
          <p class="eyebrow">Wordle Better</p>
          <h1>Fast solver, less sludge.</h1>
          <p class="subtle hero-copy">Entropy-ranked suggestions, exact duplicate-letter handling, and a UI that stops making your browser do cardio on every keystroke.</p>
          <p class="helper helper--hero" id="intro-copy">${intro}</p>
        </div>
        <div class="hero-side">
          <div class="mode-switch" id="mode-switch"></div>
          <div class="status-badge" id="status-badge"></div>
        </div>
      </section>

      <section class="grid">
        <div class="stack">
          <section class="card card--input">
            <div class="card-head">
              <h2 id="input-title"></h2>
              <div class="actions">
                <button class="ghost" data-action="undo">Undo</button>
                <button class="ghost" data-action="reset">Reset</button>
                <span id="reveal-slot"></span>
              </div>
            </div>
            <label class="field-label" for="guess-input">Guess</label>
            <input id="guess-input" class="guess-input" maxlength="5" placeholder="slate" autocomplete="off" autocapitalize="none" spellcheck="false" />
            <div class="tile-row tile-row--interactive" id="draft-tiles"></div>
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
            <div class="card-head"><h2>History</h2><span id="history-count"></span></div>
            <div class="history-list" id="history-list"></div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Keyboard</h2><span id="keyboard-count"></span></div>
            <div class="keyboard" id="keyboard"></div>
          </section>
        </div>

        <div class="stack">
          <section class="card stats-grid" id="stats-grid"></section>

          <section class="card">
            <div class="card-head"><h2>Top suggestions</h2><span id="suggestion-count"></span></div>
            <div id="suggestions"></div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Candidate snapshot</h2><span id="candidate-count"></span></div>
            <div id="candidate-panel"></div>
          </section>
        </div>
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
    historyCount: app.querySelector('#history-count'),
    historyList: app.querySelector('#history-list'),
    keyboardCount: app.querySelector('#keyboard-count'),
    keyboard: app.querySelector('#keyboard'),
    statsGrid: app.querySelector('#stats-grid'),
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
    ? 'Paste your real Wordle attempts here: type the guess, click tiles to set gray / yellow / green, submit, repeat.'
    : 'Simulator mode grades guesses for you against a hidden answer, so you can test the solver without juggling feedback.';
  refs.introCopy.textContent = intro;
  refs.modeSwitch.innerHTML = `
    <button class="pill ${state.mode === 'assistant' ? 'pill--active' : ''}" data-mode="assistant">Assistant</button>
    <button class="pill ${state.mode === 'simulator' ? 'pill--active' : ''}" data-mode="simulator">Simulator</button>`;
  refs.inputTitle.textContent = state.mode === 'assistant' ? 'Enter guess + feedback' : 'Play against hidden answer';
  refs.revealSlot.innerHTML = state.mode === 'simulator' ? '<button class="ghost" data-action="reveal">Reveal</button>' : '';
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
    const label = state.mode === 'assistant' ? `${feedbackLabel[state.draftFeedback[index]]}. Click to change.` : 'Simulator mode auto-grades.';
    return `<button class="${tileClass(status)}" data-index="${index}" ${state.mode === 'assistant' ? '' : 'disabled'} aria-label="${label}">${letter}</button>`;
  }).join('');
}

function renderHistory() {
  refs.historyCount.textContent = `${state.history.length} turns`;
  refs.historyList.innerHTML = state.history.length
    ? state.history.map(historyRow).join('')
    : '<div class="empty-state">No guesses yet. Start with something broad like SLATE, CRANE, or your usual ritual sacrifice.</div>';
}

function renderKeyboard() {
  const { candidates } = state.analysis;
  refs.keyboardCount.textContent = `${candidates.length.toLocaleString()} matches`;
  refs.keyboard.innerHTML = `${['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row) => `<div class="keyboard-row">${row.split('').map((letter) => keyboardKey(letter, candidates)).join('')}</div>`).join('')}
    <div class="keyboard-row keyboard-row--actions"><button class="key key--wide" data-action="backspace">⌫</button><button class="key key--wide key--enter" data-action="submit">Enter</button></div>`;
}

function renderAnalysis() {
  refs.statsGrid.innerHTML = statsMarkup();
  refs.suggestionCount.textContent = state.analysis.loading ? 'updating' : `${state.analysis.suggestions.length} shown`;
  refs.suggestions.innerHTML = suggestionsMarkup();
  refs.candidateCount.textContent = `${Math.min(state.analysis.candidates.length, 24)} previewed`;
  refs.candidatePanel.innerHTML = candidateMarkup();
  renderKeyboard();
}

function renderStaticState() {
  renderModeControls();
  renderStatus();
  renderDraft();
  renderHistory();
  renderKeyboard();
}

function bindEvents() {
  refs.guessInput.addEventListener('input', (event) => updateDraftGuess(event.target.value));

  app.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    if (target.dataset.index) {
      cycleFeedback(Number(target.dataset.index));
      return;
    }
    if (target.dataset.mode) {
      resetGame(target.dataset.mode);
      return;
    }
    if (target.dataset.letter) {
      updateDraftGuess(state.draftGuess + target.dataset.letter);
      focusGuessInput(true);
      return;
    }
    if (target.dataset.fill) {
      setDraftGuess(target.dataset.fill);
      return;
    }

    switch (target.dataset.action) {
      case 'backspace':
        updateDraftGuess(state.draftGuess.slice(0, -1));
        focusGuessInput(true);
        break;
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
