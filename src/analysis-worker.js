import { analyzePuzzle } from './solver.js';

self.onmessage = (event) => {
  const { requestId, history, limit } = event.data;
  const startedAt = performance.now();
  const result = analyzePuzzle(history, { limit });
  self.postMessage({
    requestId,
    ...result,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  });
};
