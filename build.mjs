import fs from 'node:fs/promises';
import path from 'node:path';

const root = new URL('.', import.meta.url);
const dist = new URL('./dist/', root);
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(new URL('./assets/', dist), { recursive: true });
await fs.copyFile(new URL('./index.html', root), new URL('./index.html', dist));
for (const file of ['app.css', 'app.js', 'solver-core.js', 'analysis-worker-BEjpoe4U.js']) {
  await fs.copyFile(new URL(`./assets/${file}`, root), new URL(`./assets/${file}`, dist));
}
console.log('built dist/');
