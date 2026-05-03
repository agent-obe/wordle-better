# Wordle Better

A static Wordle solver and simulator built for GitHub Pages.

## Features

- Correct Wordle scoring, including duplicate-letter cases.
- Candidate filtering based on exact feedback reproduction.
- Entropy-ranked suggestions with average remaining-candidate estimates.
- **Assistant mode** for manually entering guess feedback from the real game.
- **Simulator mode** with an internal hidden answer and automatic scoring.
- On-screen keyboard, tile controls, guess history, candidate list, and explanation text.
- Self-contained built-in dictionary sourced from the reference repo word list.

## Local development

```bash
npm install
npm run dev
```

Open the printed local URL.

## Test and build

```bash
npm test
npm run build
```

## Algorithm notes

### Feedback correctness

`scoreGuess()` performs Wordle scoring in two passes:
1. mark greens first and count unmatched answer letters,
2. assign yellows only while unmatched copies remain.

That keeps repeated letters correct for cases like guessed doubles against single-letter answers.

### Filtering

A candidate survives only if replaying every historical guess against that candidate produces the exact same feedback pattern. This is simple and robust, and it naturally handles duplicate letters.

### Ranking

Suggestions are ranked primarily by **expected information gain (entropy)** across the current candidate set.

For each allowed guess:
- compute the feedback pattern it would produce for every remaining candidate,
- build the resulting pattern distribution,
- calculate entropy in bits,
- estimate average remaining candidates after the guess,
- break ties with position-aware and unique-letter frequency signals.

When only a couple of candidates remain, the ranker restricts itself to candidate answers instead of probe words.

## GitHub Pages deployment

This project uses Vite with `base: './'`, so the built `dist/` folder can be deployed directly to GitHub Pages.

Typical flow:

```bash
npm install
npm run build
```

Then publish the contents of `dist/` via:
- GitHub Actions Pages deployment, or
- `gh-pages`, or
- manual upload to any static host.

## Project structure

- `src/main.js` – UI and app state
- `src/solver.js` – Wordle scoring, filtering, and ranking
- `src/data/words.js` – built-in dictionary
- `tests/solver.test.js` – core solver tests
