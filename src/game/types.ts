export type Vec = { x: number; y: number };

export type Planet = {
  x: number; y: number;
  /** Drawn and collision radius, wu. Handoff sizes: 18 / 40 / 62. */
  r: number;
  /** Gravitational parameter (G·M), wu³/s². */
  gm: number;
  ring?: boolean;
};

export type Singularity = {
  x: number; y: number;
  /** Black disc radius, wu (visual only). */
  r: number;
  /** Event horizon radius, wu. Crossing it fails the run. */
  horizon: number;
  /** Radius where its pull begins, wu. No pull outside it. */
  pull: number;
  gm: number;
};

export type Gate = {
  x1: number; y1: number; x2: number; y2: number;
  /** Cycle length, open time and phase offset, in simulation ticks. */
  period: number;
  open: number;
  phase: number;
};

export type StageDef = {
  /** '01'…'06' for stages, 'daily' for the daily challenge. */
  id: string;
  name: string;
  mechanic: string;
  difficulty: number;
  /** Tank size, fuel units. */
  fuel: number;
  /** Target Debt Score. */
  par: number;
  coords: string;
  pad: Vec;
  beacon: Vec & { r: number };
  planets: Planet[];
  singularities: Singularity[];
  gates: Gate[];
  /** Launch-angle limits and starting aim, integer tenths of a degree / integer percent. */
  aim: { min: number; max: number; angle: number; power: number };
  /** Seconds after launch before the run times out. */
  timeLimit: number;
};

export type BurstDir = 0 | 1 | 2 | 3; // up, right, down, left (screen/world axes)
export const DIRS: readonly BurstDir[] = [0, 1, 2, 3];
export const DIR_NAMES = ['up', 'right', 'down', 'left'] as const;
export type DirName = (typeof DIR_NAMES)[number];

export type Phase = 'aim' | 'flight' | 'ended';

export type FailCause = 'PLANET' | 'SINGULARITY' | 'GATE' | 'DRIFT' | 'TIME';

export type Outcome = {
  status: 'complete' | 'failed';
  ticks: number;
  /** Seconds since launch. */
  time: number;
  /** Fuel spent, units (exact multiple of the burst cost). */
  fuel: number;
  /** Debt Score; null for failed runs. */
  score: number | null;
  cause: FailCause | null;
};

/** The complete input log of one run: enough to re-simulate it exactly. */
export type RunInputs = {
  v: number;          // rules version
  stage: string;      // '01'…'06' or 'daily'
  seed: number;       // 0 for stages; UTC YYYYMMDD for the daily
  angle: number;      // launch angle, integer tenths of a degree
  power: number;      // launch power, integer percent
  bursts: [tick: number, dir: BurstDir][];
};
