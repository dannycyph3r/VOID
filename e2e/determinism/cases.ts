// Cross-engine determinism cases. The same module runs in Node (to write
// fixture.json, see scripts/determinism-fixture.ts) and in every browser (the
// page next to this file), so both sides build identical input logs and
// replay them with the shared rules. Any divergence shows up as a different
// result object.
import { PHYSICS } from '../../src/game/constants.ts';
import { DAILY_TEMPLATES, dailyStage, seedForDate, templateIndexForSeed } from '../../src/game/daily.ts';
import { mulberry32 } from '../../src/game/math.ts';
import { makeInputs, simulateRun } from '../../src/game/replay.ts';
import { createSim, launch, startBurst, step } from '../../src/game/sim.ts';
import { DAILY_SOLUTIONS, STAGE_SOLUTIONS } from '../../src/game/solutions.ts';
import { STAGES, stageById } from '../../src/game/stages.ts';
import type { BurstDir, Outcome, RunInputs, StageDef } from '../../src/game/types.ts';

export type Case = { name: string; inputs: RunInputs };

export type CaseResult = {
  name: string;
  inputs: RunInputs;
  /** Daily cases: the template the seed picked (exercises mulberry32). */
  template: number | null;
  ok: boolean;
  error: string | null;
  outcome: Outcome | null;
  /** Final probe position, plus its exact IEEE-754 bit pattern. */
  x: number | null;
  y: number | null;
  xBits: string | null;
  yBits: string | null;
  /** Every simulated position (stride 1), hashed over its float64 bytes. */
  pathPoints: number;
  pathHash: string | null;
};

const bits = (n: number): string => {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, n);
  return v.getBigUint64(0).toString(16).padStart(16, '0');
};

/** 32-bit FNV-1a over the big-endian float64 bytes of `xs`. */
function hashFloats(xs: number[]): string {
  const v = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  for (const x of xs) {
    v.setFloat64(0, x);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ v.getUint8(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** First daily seed on or after 2026-01-01 that picks each template. */
function seedForTemplate(index: number): number {
  for (let d = 0; d < 3650; d++) {
    const seed = seedForDate(new Date(Date.UTC(2026, 0, 1 + d)));
    if (templateIndexForSeed(seed) === index) return seed;
  }
  throw new Error(`no seed picks daily template ${index}`);
}

function stageFor(inputs: RunInputs): StageDef {
  const stage = inputs.stage === 'daily' ? dailyStage(inputs.seed) : stageById(inputs.stage);
  if (!stage) throw new Error(`unknown stage ${inputs.stage}`);
  return stage;
}

/**
 * Fly a stage live, firing seeded random bursts while the probe is in flight,
 * and return the input log the sim recorded, like the browser engine does.
 */
function recordLive(stage: StageDef, seed: number, rand: () => number): RunInputs {
  const { min, max } = stage.aim;
  const angle = min + Math.floor(rand() * (max - min + 1));
  const power = PHYSICS.powerMin + Math.floor(rand() * (PHYSICS.powerMax - PHYSICS.powerMin + 1));
  const s = createSim(stage);
  launch(s, angle, power);
  while (s.phase === 'flight') {
    if (s.burstDir === -1 && rand() < 0.02) startBurst(s, Math.floor(rand() * 4) as BurstDir);
    step(stage, s);
  }
  return makeInputs(stage, seed, angle, power, s.bursts);
}

export function buildCases(): Case[] {
  const cases: Case[] = [];
  for (const stage of STAGES) {
    const ref = STAGE_SOLUTIONS[stage.id];
    cases.push({ name: `stage ${stage.id} reference`, inputs: makeInputs(stage, 0, ref.angle, ref.power, ref.bursts) });
  }
  DAILY_TEMPLATES.forEach((_, i) => {
    const seed = seedForTemplate(i);
    const ref = DAILY_SOLUTIONS[i];
    cases.push({ name: `daily ${i} reference (seed ${seed})`, inputs: makeInputs(dailyStage(seed), seed, ref.angle, ref.power, ref.bursts) });
  });
  // Reference aims plus an early, opposed pair of bursts: completed runs that
  // spend fuel. Takes the first pair that still completes.
  for (const stage of STAGES) {
    const ref = STAGE_SOLUTIONS[stage.id];
    const withPair = (a: BurstDir, b: BurstDir) =>
      makeInputs(stage, 0, ref.angle, ref.power, [[60, a], [60 + PHYSICS.burstTicks, b], ...ref.bursts]);
    const pairs: [BurstDir, BurstDir][] = [[0, 2], [2, 0], [1, 3], [3, 1]];
    const pick = pairs.find(([a, b]) => {
      const r = simulateRun(stage, withPair(a, b));
      return r.ok && r.outcome.status === 'complete';
    }) ?? pairs[0];
    cases.push({ name: `stage ${stage.id} ref + pair ${pick.join('/')}`, inputs: withPair(...pick) });
  }
  // Seeded live runs with bursts: crashes, drifts and timeouts.
  const rand = mulberry32(0x5eed);
  for (const stage of STAGES) {
    for (let k = 0; k < 3; k++) cases.push({ name: `stage ${stage.id} bursts #${k}`, inputs: recordLive(stage, 0, rand) });
  }
  DAILY_TEMPLATES.forEach((_, i) => {
    const seed = seedForTemplate(i);
    cases.push({ name: `daily ${i} bursts (seed ${seed})`, inputs: recordLive(dailyStage(seed), seed, rand) });
  });
  return cases;
}

export function runCase(c: Case): CaseResult {
  const stage = stageFor(c.inputs);
  const r = simulateRun(stage, c.inputs, 1);
  const template = c.inputs.stage === 'daily' ? templateIndexForSeed(c.inputs.seed) : null;
  if (!r.ok) {
    return { name: c.name, inputs: c.inputs, template, ok: false, error: r.error, outcome: null, x: null, y: null, xBits: null, yBits: null, pathPoints: 0, pathHash: null };
  }
  const x = r.path[r.path.length - 2], y = r.path[r.path.length - 1];
  return {
    name: c.name, inputs: c.inputs, template, ok: true, error: null, outcome: r.outcome,
    x, y, xBits: bits(x), yBits: bits(y), pathPoints: r.path.length / 2, pathHash: hashFloats(r.path),
  };
}

export const runAll = (): CaseResult[] => buildCases().map(runCase);
