import { game, PHYSICS } from './constants.ts';

/**
 * Debt Score = round(seconds × perSecond + fuel units × perFuelUnit). Lower is better.
 * Computed from integer ticks and integer fuel tenths so the result is exact.
 */
export function debtScore(ticks: number, fuelTenths: number): number {
  return Math.round((ticks * game.score.perSecond) / PHYSICS.hz + (fuelTenths * game.score.perFuelUnit) / 10);
}

export type RankedRun = { score: number; ticks: number; fuelTenths: number; at: number };

/**
 * Ranking order for completed runs: lower score, then shorter time, then less
 * fuel, then the earlier run. Failed runs are never ranked.
 */
export function compareRuns(a: RankedRun, b: RankedRun): number {
  return a.score - b.score || a.ticks - b.ticks || a.fuelTenths - b.fuelTenths || a.at - b.at;
}

export function ticksToSeconds(ticks: number): number {
  return ticks / PHYSICS.hz;
}

/** "38.42 s" style (results, tables). Truncated, never rounded up past the real time. */
export function formatSeconds(ticks: number): string {
  return (Math.floor((ticks * 100) / PHYSICS.hz) / 100).toFixed(2);
}

/** "00:38.4" style (HUD clock). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = Math.floor((s - m * 60) * 10) / 10;
  return `${String(m).padStart(2, '0')}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

export function formatFuel(units: number): string {
  return units.toFixed(1);
}

export function formatScore(score: number | null): string {
  return score === null ? '—' : score.toLocaleString('en-US');
}
