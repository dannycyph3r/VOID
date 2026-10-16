// Determinism page: replays every case in this browser's JS engine. The spec
// calls window.voidDeterminism() and compares the JSON with fixture.json.
import { runAll } from './cases.ts';

declare global {
  interface Window { voidDeterminism: () => string }
}

window.voidDeterminism = () => JSON.stringify(runAll());
document.body.dataset.ready = 'true';
