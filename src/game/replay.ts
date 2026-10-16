// Input-log validation and re-simulation. The server uses this to verify ranked
// runs; the client uses it to build the input log it submits.
import { MAX_BURSTS, PHYSICS, RULES_VERSION } from './constants.ts';
import { createSim, launch, startBurst, step } from './sim.ts';
import type { Outcome, RunInputs, StageDef } from './types.ts';

export type ReplayResult =
  | { ok: true; outcome: Outcome; path: number[] }
  | { ok: false; error: string };

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Structural checks that need no simulation. Returns an error message or null. */
export function checkInputs(stage: StageDef, inputs: RunInputs): string | null {
  if (inputs.v !== RULES_VERSION) return 'rules version mismatch';
  if (!isInt(inputs.angle) || inputs.angle < stage.aim.min || inputs.angle > stage.aim.max) return 'angle out of range';
  if (!isInt(inputs.power) || inputs.power < PHYSICS.powerMin || inputs.power > PHYSICS.powerMax) return 'power out of range';
  if (!Array.isArray(inputs.bursts) || inputs.bursts.length > MAX_BURSTS) return 'too many bursts';
  const maxTick = stage.timeLimit * PHYSICS.hz;
  let next = 0;
  for (const b of inputs.bursts) {
    if (!Array.isArray(b) || b.length !== 2) return 'malformed burst';
    const [tick, dir] = b;
    if (!isInt(tick) || tick < next || tick >= maxTick) return 'burst tick out of order';
    if (dir !== 0 && dir !== 1 && dir !== 2 && dir !== 3) return 'bad burst direction';
    next = tick + PHYSICS.burstTicks;
  }
  if (inputs.bursts.length * PHYSICS.burstCostTenths > stage.fuel * 10) return 'bursts exceed tank';
  return null;
}

/**
 * Re-run a recorded input log from the pad. Fails if any recorded burst could
 * not have been fired at its tick, or if input remains after the run ended.
 * `pathStride` > 0 also records the flown path every n steps.
 */
export function simulateRun(stage: StageDef, inputs: RunInputs, pathStride = 0): ReplayResult {
  const err = checkInputs(stage, inputs);
  if (err) return { ok: false, error: err };
  const s = createSim(stage);
  launch(s, inputs.angle, inputs.power);
  const path: number[] = pathStride > 0 ? [s.x, s.y] : [];
  let bi = 0;
  while (s.phase === 'flight') {
    if (bi < inputs.bursts.length && inputs.bursts[bi][0] === s.tick) {
      if (!startBurst(s, inputs.bursts[bi][1])) return { ok: false, error: 'burst not possible at recorded tick' };
      bi++;
    }
    step(stage, s);
    if (pathStride > 0 && (s.tick % pathStride === 0 || s.phase !== 'flight')) path.push(s.x, s.y);
  }
  if (bi < inputs.bursts.length) return { ok: false, error: 'input after run ended' };
  return { ok: true, outcome: s.outcome!, path };
}

export function makeInputs(stage: StageDef, seed: number, angle: number, power: number, bursts: RunInputs['bursts']): RunInputs {
  return { v: RULES_VERSION, stage: stage.id, seed, angle, power, bursts: bursts.map(([t, d]) => [t, d]) };
}
