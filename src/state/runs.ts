// Local run history (this device only). Every finished run is saved here first;
// online submission state is tracked per run and is never assumed.
import { useSyncExternalStore } from 'react';
import { RULES_VERSION } from '../game/constants.ts';
import { compareRuns } from '../game/score.ts';
import type { FailCause, Outcome, RunInputs, StageDef } from '../game/types.ts';
import { isObject, load, save } from './storage.ts';

export type RemoteState =
  | { state: 'local' }
  | { state: 'pending' }
  | { state: 'confirmed'; rank: number | null; total: number }
  | { state: 'failed'; error: string }      // network / server trouble: can retry
  | { state: 'rejected'; error: string };   // the server refused the run: retrying won't help

export type LocalRun = {
  id: string;
  stage: string;        // '01'…'06' | 'daily'
  seed: number;
  name: string;
  status: Outcome['status'];
  cause: FailCause | null;
  ticks: number;
  fuelTenths: number;
  score: number | null;
  at: number;
  rulesVersion: number;
  /** Input log, kept for completed runs so they can be verified and submitted later. */
  inputs: RunInputs | null;
  remote: RemoteState;
};

const KEEP = 300;

const validRun = (v: unknown): v is LocalRun =>
  isObject(v) && typeof v.id === 'string' && typeof v.stage === 'string' && typeof v.seed === 'number' &&
  (v.status === 'complete' || v.status === 'failed') && typeof v.ticks === 'number' && typeof v.fuelTenths === 'number' &&
  typeof v.at === 'number' && isObject(v.remote);
const validRuns = (v: unknown): v is LocalRun[] => Array.isArray(v);

let runs: LocalRun[] = load('runs', [] as LocalRun[], validRuns)
  .filter(validRun)
  // A request in flight when the page closed has an unknown result; resubmitting is idempotent.
  .map((r) => (r.remote.state === 'pending' ? { ...r, remote: { state: 'local' } } : r));
let saveFailed = false;
const listeners = new Set<() => void>();

function commit(next: LocalRun[]) {
  runs = next;
  saveFailed = !save('runs', prune(runs));
  listeners.forEach((l) => l());
}

/** Keep the newest runs plus every personal best, so pruning never loses a best. */
function prune(all: LocalRun[]): LocalRun[] {
  if (all.length <= KEEP) return all;
  const keepIds = new Set(all.slice(-KEEP).map((r) => r.id));
  const bests = new Map<string, LocalRun>();
  for (const r of all) {
    if (r.status !== 'complete' || r.score === null) continue;
    const k = `${r.stage}:${r.seed}:${r.rulesVersion}`;
    const b = bests.get(k);
    if (!b || compareRuns(rankable(r), rankable(b)) < 0) bests.set(k, r);
  }
  bests.forEach((r) => keepIds.add(r.id));
  return all.filter((r) => keepIds.has(r.id));
}

const rankable = (r: LocalRun) => ({ score: r.score ?? Infinity, ticks: r.ticks, fuelTenths: r.fuelTenths, at: r.at });

export function newRunId(): string {
  return crypto.randomUUID();
}

export function recordRun(stage: StageDef, outcome: Outcome, inputs: RunInputs): LocalRun {
  const run: LocalRun = {
    id: newRunId(),
    stage: stage.id,
    seed: inputs.seed,
    name: stage.name,
    status: outcome.status,
    cause: outcome.cause,
    ticks: outcome.ticks,
    fuelTenths: Math.round(outcome.fuel * 10),
    score: outcome.score,
    at: Date.now(),
    rulesVersion: RULES_VERSION,
    inputs: outcome.status === 'complete' ? inputs : null,
    remote: { state: 'local' },
  };
  commit([...runs, run]);
  return run;
}

export function setRemote(id: string, remote: RemoteState): void {
  commit(runs.map((r) => (r.id === id ? { ...r, remote } : r)));
}

export function getRuns(): readonly LocalRun[] {
  return runs;
}

export function storageAvailable(): boolean {
  return !saveFailed;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRuns(): readonly LocalRun[] {
  return useSyncExternalStore(subscribe, getRuns, getRuns);
}

// ------------------------------------------------------------- derived views

/** Best completed run for a stage (and daily seed) under the current rules. */
export function personalBest(all: readonly LocalRun[], stage: string, seed = 0): LocalRun | null {
  let best: LocalRun | null = null;
  for (const r of all) {
    if (r.stage !== stage || r.seed !== seed || r.status !== 'complete' || r.score === null || r.rulesVersion !== RULES_VERSION) continue;
    if (!best || compareRuns(rankable(r), rankable(best)) < 0) best = r;
  }
  return best;
}

/** Completed runs for a stage, best first (the local-only ranking). */
export function localRanking(all: readonly LocalRun[], stage: string, seed = 0): LocalRun[] {
  return all
    .filter((r) => r.stage === stage && r.seed === seed && r.status === 'complete' && r.score !== null && r.rulesVersion === RULES_VERSION)
    .sort((a, b) => compareRuns(rankable(a), rankable(b)));
}

export function clearedStages(all: readonly LocalRun[]): Set<string> {
  return new Set(all.filter((r) => r.status === 'complete' && r.stage !== 'daily').map((r) => r.stage));
}

export function totals(all: readonly LocalRun[]) {
  let ticks = 0, fuelTenths = 0;
  for (const r of all) {
    ticks += r.ticks;
    fuelTenths += r.fuelTenths;
  }
  return { runs: all.length, ticks, fuelTenths };
}
