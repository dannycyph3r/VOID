// Cross-engine determinism: every browser must replay the reference solutions
// and seeded burst runs to exactly the values Node computed (fixture.json).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { RULES_VERSION } from '../src/game/constants.ts';
import { runAll, type CaseResult } from './determinism/cases.ts';

type Fixture = { rulesVersion: number; node: string; cases: CaseResult[] };
const fixture: Fixture = JSON.parse(readFileSync(new URL('./determinism/fixture.json', import.meta.url), 'utf8'));

/** Fields that must match bit for bit, as printable "field: node → browser" lines. */
function divergences(want: CaseResult, got: CaseResult | undefined): string[] {
  if (!got) return [`${want.name}: missing in browser`];
  const fields: [string, unknown, unknown][] = [
    ['inputs', JSON.stringify(want.inputs), JSON.stringify(got.inputs)],
    ['template', want.template, got.template],
    ['ok', want.ok, got.ok],
    ['error', want.error, got.error],
    ['status', want.outcome?.status, got.outcome?.status],
    ['cause', want.outcome?.cause, got.outcome?.cause],
    ['ticks', want.outcome?.ticks, got.outcome?.ticks],
    ['time', want.outcome?.time, got.outcome?.time],
    ['score', want.outcome?.score, got.outcome?.score],
    ['fuel', want.outcome?.fuel, got.outcome?.fuel],
    ['x', `${want.x} (${want.xBits})`, `${got.x} (${got.xBits})`],
    ['y', `${want.y} (${want.yBits})`, `${got.y} (${got.yBits})`],
    ['pathPoints', want.pathPoints, got.pathPoints],
    ['pathHash', want.pathHash, got.pathHash],
  ];
  return fields.filter(([, a, b]) => !Object.is(a, b)).map(([f, a, b]) => `${want.name}: ${f} node=${a} browser=${b}`);
}

test('fixture is current: Node still computes fixture.json', () => {
  expect(fixture.rulesVersion, 'RULES_VERSION changed: run `npm run e2e:fixture`').toBe(RULES_VERSION);
  expect(JSON.stringify(runAll()), 'rules changed since fixture.json was written: run `npm run e2e:fixture`')
    .toBe(JSON.stringify(fixture.cases));
});

test('browser replays match Node bit for bit', async ({ page, browserName }, testInfo) => {
  await page.goto('/e2e/determinism/index.html');
  await expect(page.locator('body[data-ready]')).toBeAttached();
  const json = await page.evaluate(() => window.voidDeterminism());
  const got: CaseResult[] = JSON.parse(json);
  const engine = await page.evaluate(() => navigator.userAgent);

  const report = [
    ...fixture.cases.flatMap((want, i) => divergences(want, got[i])),
    ...(got.length > fixture.cases.length ? [`browser produced ${got.length - fixture.cases.length} extra cases`] : []),
  ];
  await testInfo.attach(`determinism-${browserName}.json`, { body: json, contentType: 'application/json' });
  if (report.length) {
    await testInfo.attach(`divergences-${browserName}.txt`, { body: `${engine}\n${report.join('\n')}\n`, contentType: 'text/plain' });
  }
  expect(report, `${browserName} (${engine}) diverged from Node ${fixture.node}`).toEqual([]);
  // Byte-identical, not just equal after parsing.
  expect(json).toBe(JSON.stringify(fixture.cases));
});
