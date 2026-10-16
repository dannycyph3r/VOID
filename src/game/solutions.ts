// Reference solutions found by `npm run solve` (the median winning aim, not the
// best one). The test suite replays every one of them to prove each stage and
// daily template can be completed under the current rules; the Stages screen
// draws the resulting route as the dashed preview line. Regenerate after any
// change to physics or geometry, and bump RULES_VERSION.
import type { RunInputs } from './types.ts';

export type Reference = Pick<RunInputs, 'angle' | 'power' | 'bursts'>;

export const STAGE_SOLUTIONS: Record<string, Reference> = {
  '01': { angle: 20, power: 74, bursts: [] },
  '02': { angle: 620, power: 78, bursts: [] },
  '03': { angle: 180, power: 66, bursts: [] },
  '04': { angle: 755, power: 53, bursts: [] },
  '05': { angle: -635, power: 67, bursts: [] },
  '06': { angle: 280, power: 28, bursts: [[4800, 0]] },
};

/** Indexed like DAILY_TEMPLATES. */
export const DAILY_SOLUTIONS: Reference[] = [
  { angle: -185, power: 78, bursts: [] },
  { angle: 385, power: 56, bursts: [] },
  { angle: 225, power: 63, bursts: [] },
  { angle: 720, power: 72, bursts: [] },
  { angle: 470, power: 44, bursts: [] },
  { angle: 500, power: 72, bursts: [[1800, 0]] },
  { angle: -665, power: 72, bursts: [] },
];
