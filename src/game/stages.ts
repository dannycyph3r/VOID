// Stage definitions. Geometry follows the handoff's stage diagrams
// (source/Missions.dc.html) scaled to the 1150 × 720 wu field. Every stage has a
// reference solution in solutions.ts that the test suite replays.
//
// Pars are calibrated against the real simulation with `npm run solve`
// (median winning score + two bursts, rounded up to 50). The prototype's pars
// were written against its faked clock and are not reachable targets here.
import { PHYSICS } from './constants.ts';
import { dirFromTenths } from './math.ts';
import type { Gate, Planet, Singularity, StageDef } from './types.ts';

const HZ = PHYSICS.hz;

/** Planet presets by handoff radius (18 / 40 / 62 wu). */
export const planet = (x: number, y: number, size: 'S' | 'M' | 'L', ring = false): Planet => {
  const presets = { S: { r: 18, gm: 20_000 }, M: { r: 40, gm: 68_000 }, L: { r: 62, gm: 130_000 } };
  return { x, y, ...presets[size], ring };
};

export const singularity = (x: number, y: number, pull = 170): Singularity =>
  ({ x, y, r: 20, horizon: 48, pull, gm: 240_000 });

/**
 * A gate centred on (cx, cy), `length` wu long, rotated `angle` tenths of a
 * degree. Endpoints use the deterministic trig so every engine agrees.
 */
export const gate = (cx: number, cy: number, angle: number, length: number, periodS: number, openS: number, phaseS = 0): Gate => {
  const d = dirFromTenths(angle);
  const h = length / 2;
  return {
    x1: cx - d.x * h, y1: cy - d.y * h, x2: cx + d.x * h, y2: cy + d.y * h,
    period: Math.round(periodS * HZ), open: Math.round(openS * HZ), phase: Math.round(phaseS * HZ),
  };
};

export const STAGES: readonly StageDef[] = [
  {
    id: '01', name: 'First Light', mechanic: 'WELL', difficulty: 1, fuel: 120, par: 350, coords: 'RA 02h · DEC +14',
    pad: { x: 140, y: 600 }, beacon: { x: 990, y: 150, r: 20 },
    planets: [planet(575, 380, 'L', true)], singularities: [], gates: [],
    aim: { min: 0, max: 900, angle: 450, power: 60 }, timeLimit: 60,
  },
  {
    id: '02', name: 'Slingshot', mechanic: 'ASSIST', difficulty: 2, fuel: 100, par: 400, coords: 'RA 07h · DEC −03',
    pad: { x: 110, y: 610 }, beacon: { x: 1040, y: 150, r: 20 },
    planets: [planet(430, 410, 'L'), planet(800, 250, 'S', true)], singularities: [], gates: [],
    aim: { min: 0, max: 900, angle: 160, power: 64 }, timeLimit: 75,
  },
  {
    id: '03', name: 'Narrows', mechanic: 'GATES', difficulty: 3, fuel: 90, par: 400, coords: 'RA 11h · DEC +41',
    pad: { x: 92, y: 590 }, beacon: { x: 1035, y: 130, r: 20 },
    planets: [planet(368, 288, 'M'), planet(782, 446, 'M')], singularities: [],
    gates: [gate(575, 367, 1220, 96, 4, 2.4)],
    aim: { min: 0, max: 900, angle: 300, power: 60 }, timeLimit: 90,
  },
  {
    id: '04', name: 'Singularity', mechanic: 'BLACK HOLE', difficulty: 4, fuel: 80, par: 500, coords: 'RA 16h · DEC −22',
    pad: { x: 115, y: 634 }, beacon: { x: 1012, y: 202, r: 20 },
    planets: [planet(345, 245, 'M')], singularities: [singularity(690, 418)], gates: [],
    aim: { min: 0, max: 900, angle: 400, power: 60 }, timeLimit: 90,
  },
  {
    id: '05', name: 'Binary', mechanic: 'TWIN WELLS', difficulty: 4, fuel: 80, par: 400, coords: 'RA 19h · DEC +08',
    pad: { x: 92, y: 144 }, beacon: { x: 1035, y: 605, r: 20 },
    planets: [planet(470, 320, 'L'), planet(700, 430, 'M', true)], singularities: [], gates: [],
    aim: { min: -900, max: 0, angle: -200, power: 60 }, timeLimit: 90,
  },
  {
    id: '06', name: 'Deep Field', mechanic: 'ALL', difficulty: 5, fuel: 70, par: 750, coords: 'RA 23h · DEC −61',
    pad: { x: 92, y: 648 }, beacon: { x: 1060, y: 90, r: 20 },
    planets: [planet(300, 240, 'M'), planet(820, 330, 'L')], singularities: [singularity(520, 480, 160)],
    gates: [gate(985, 205, 900, 96, 5, 3)],
    aim: { min: 0, max: 900, angle: 450, power: 60 }, timeLimit: 120,
  },
];

/** Stages 01–03 are open from the start; each later stage opens when the previous one is cleared. */
export const ALWAYS_OPEN = 3;

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export function isUnlocked(id: string, cleared: ReadonlySet<string>): boolean {
  const i = STAGES.findIndex((s) => s.id === id);
  if (i < 0) return false;
  return i < ALWAYS_OPEN || cleared.has(STAGES[i - 1].id);
}
