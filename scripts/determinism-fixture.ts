// Writes e2e/determinism/fixture.json: the replay results Node computes for the
// cross-engine determinism cases. The Playwright suite asserts every browser
// produces exactly these values.
//
//   npm run e2e:fixture
//
// Regenerate after any change to the rules (and bump RULES_VERSION).
import { writeFileSync } from 'node:fs';
import { RULES_VERSION } from '../src/game/constants.ts';
import { runAll } from '../e2e/determinism/cases.ts';

const out = new URL('../e2e/determinism/fixture.json', import.meta.url);
const cases = runAll();
writeFileSync(out, `${JSON.stringify({ rulesVersion: RULES_VERSION, node: process.version, cases }, null, 2)}\n`);
const ok = cases.filter((c) => c.ok);
console.log(`${cases.length} cases (${ok.length} replayed, ${ok.filter((c) => c.outcome?.status === 'complete').length} complete) → ${out.pathname}`);
for (const c of cases) console.log(`  ${c.name.padEnd(28)} ${c.ok ? `${c.outcome!.status.padEnd(8)} ${String(c.outcome!.cause ?? '').padEnd(11)} ticks ${c.outcome!.ticks} bursts ${c.inputs.bursts.length}` : `ERROR ${c.error}`}`);
