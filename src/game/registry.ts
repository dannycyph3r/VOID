import { dailyStage, dateForSeed } from './daily.ts';
import { stageById } from './stages.ts';
import type { StageDef } from './types.ts';

/** Resolve a stage id ('01'…'06' or 'daily') plus seed to its definition. */
export function resolveStage(id: string, seed: number): StageDef | null {
  if (id === 'daily') return dateForSeed(seed) ? dailyStage(seed) : null;
  return seed === 0 ? stageById(id) ?? null : null;
}
