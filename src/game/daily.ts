// Daily challenge.
//
// Identity: the UTC calendar date as an integer seed YYYYMMDD (e.g. 20261015).
// Everyone gets the same challenge from 00:00 to 24:00 UTC regardless of their
// timezone. The seed deterministically picks one of a fixed set of curated,
// solver-validated templates (see solutions.ts), so a daily can never be an
// impossible random layout.
import { mulberry32 } from './math.ts';
import { gate, planet, singularity } from './stages.ts';
import type { StageDef } from './types.ts';

type Template = Omit<StageDef, 'id' | 'coords'>;

const base = { mechanic: 'DAILY', difficulty: 3, fuel: 90, timeLimit: 90 } as const;

export const DAILY_TEMPLATES: readonly StageDef[] = ([
  {
    ...base, name: 'Tidewater', par: 350,
    pad: { x: 115, y: 360 }, beacon: { x: 1035, y: 590, r: 20 },
    planets: [planet(644, 259, 'L')], singularities: [singularity(380, 580, 150)],
    gates: [gate(860, 520, 900, 96, 4, 2.6)],
    aim: { min: -450, max: 600, angle: 150, power: 60 },
  },
  {
    ...base, name: 'Perihelion', par: 400,
    pad: { x: 120, y: 600 }, beacon: { x: 1030, y: 610, r: 20 },
    planets: [planet(575, 540, 'L', true)], singularities: [], gates: [],
    aim: { min: 0, max: 900, angle: 300, power: 60 },
  },
  {
    ...base, name: 'Quiet Shear', par: 400,
    pad: { x: 100, y: 120 }, beacon: { x: 1050, y: 130, r: 20 },
    planets: [planet(400, 300, 'M'), planet(760, 300, 'M')], singularities: [singularity(580, 600, 160)], gates: [],
    aim: { min: -900, max: 300, angle: -150, power: 60 },
  },
  {
    ...base, name: 'Lagrange', par: 400,
    pad: { x: 100, y: 600 }, beacon: { x: 1060, y: 360, r: 20 },
    planets: [planet(400, 220, 'M'), planet(420, 520, 'M'), planet(760, 370, 'L')], singularities: [], gates: [],
    aim: { min: -300, max: 900, angle: 200, power: 60 },
  },
  {
    ...base, name: 'Lantern', par: 550,
    pad: { x: 110, y: 360 }, beacon: { x: 1040, y: 360, r: 20 },
    planets: [planet(520, 200, 'M', true)], singularities: [singularity(800, 380, 160)], gates: [],
    aim: { min: -600, max: 600, angle: 150, power: 60 },
  },
  {
    ...base, name: 'Spindle', par: 450,
    pad: { x: 100, y: 620 }, beacon: { x: 1050, y: 100, r: 20 },
    planets: [planet(575, 360, 'L')],
    singularities: [],
    gates: [gate(330, 330, 900, 96, 4, 2.4), gate(820, 200, 900, 96, 4, 2.4, 2)],
    aim: { min: 0, max: 900, angle: 450, power: 60 },
  },
  {
    ...base, name: 'Low Tide', par: 400,
    pad: { x: 100, y: 110 }, beacon: { x: 1050, y: 620, r: 20 },
    planets: [planet(420, 420, 'L')], singularities: [singularity(760, 230, 160)], gates: [],
    aim: { min: -900, max: 300, angle: -200, power: 60 },
  },
] satisfies Template[]).map((t) => ({ ...t, id: 'daily', coords: '' }));

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** UTC calendar date → seed YYYYMMDD. */
export function seedForDate(date: Date): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

/** Parse a seed back into its UTC midnight, or null if it is not a real date. */
export function dateForSeed(seed: number): Date | null {
  if (!Number.isInteger(seed)) return null;
  const y = Math.floor(seed / 10000), m = Math.floor(seed / 100) % 100, d = seed % 100;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 2020 && y < 2100 ? date : null;
}

export function templateIndexForSeed(seed: number): number {
  return Math.floor(mulberry32(seed)() * DAILY_TEMPLATES.length);
}

/** The daily stage for a seed. Same seed → same stage, on every device. */
export function dailyStage(seed: number): StageDef {
  const t = DAILY_TEMPLATES[templateIndexForSeed(seed)];
  return { ...t, coords: `SEED ${seed}` };
}

/** "15 OCT" label for a seed. */
export function dailyLabel(seed: number): string {
  return `${String(seed % 100).padStart(2, '0')} ${MONTHS[(Math.floor(seed / 100) % 100) - 1]}`;
}

/** Milliseconds until the next 00:00 UTC. */
export function msUntilUtcMidnight(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}
