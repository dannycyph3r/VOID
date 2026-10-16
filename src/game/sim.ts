// The VOID simulation: a fixed-step (120 Hz) point-mass probe moving through
// static gravity sources. Pure and DOM-free; shared by the browser engine, the
// predicted-trajectory preview, the test suite, the solver and the server-side
// verifier, so there is exactly one implementation of the rules.
import { PHYSICS } from './constants.ts';
import { dirFromTenths, segmentsCross, smoothstep } from './math.ts';
import { debtScore } from './score.ts';
import type { BurstDir, FailCause, Gate, Outcome, Phase, StageDef } from './types.ts';

export type SimState = {
  phase: Phase;
  /** Simulation steps since launch. */
  tick: number;
  x: number; y: number;
  vx: number; vy: number;
  /** Position before the last step (render interpolation, gate crossing). */
  px: number; py: number;
  fuelTenths: number;
  spentTenths: number;
  /** Direction of the burst in progress, or -1. */
  burstDir: BurstDir | -1;
  burstEnd: number;
  /** Every burst actually fired: the replayable input log. */
  bursts: [number, BurstDir][];
  gatesCleared: boolean[];
  outcome: Outcome | null;
};

export type StepEvent =
  | { type: 'gate'; index: number }
  | { type: 'end'; outcome: Outcome };

// Unit thrust vectors for up, right, down, left (world y grows downward).
const THRUST_X = [0, 1, 0, -1];
const THRUST_Y = [-1, 0, 1, 0];

export function createSim(stage: StageDef): SimState {
  return {
    phase: 'aim',
    tick: 0,
    x: stage.pad.x, y: stage.pad.y,
    vx: 0, vy: 0,
    px: stage.pad.x, py: stage.pad.y,
    fuelTenths: stage.fuel * 10,
    spentTenths: 0,
    burstDir: -1,
    burstEnd: 0,
    bursts: [],
    gatesCleared: stage.gates.map(() => false),
    outcome: null,
  };
}

export function cloneSim(s: SimState): SimState {
  return { ...s, bursts: s.bursts.slice(), gatesCleared: s.gatesCleared.slice() };
}

export function clampAim(stage: StageDef, angle: number, power: number): { angle: number; power: number } {
  return {
    angle: Math.min(stage.aim.max, Math.max(stage.aim.min, Math.round(angle))),
    power: Math.min(PHYSICS.powerMax, Math.max(PHYSICS.powerMin, Math.round(power))),
  };
}

/** Launch velocity for an aim, wu/s. */
export function launchVelocity(angle: number, power: number): { vx: number; vy: number } {
  const d = dirFromTenths(angle);
  const speed = (PHYSICS.launchSpeedMax * power) / 100;
  return { vx: d.x * speed, vy: d.y * speed };
}

/** Leave the pad. Angle/power must already be valid integers (see clampAim). */
export function launch(s: SimState, angle: number, power: number): void {
  if (s.phase !== 'aim') return;
  const v = launchVelocity(angle, power);
  s.vx = v.vx;
  s.vy = v.vy;
  s.phase = 'flight';
  s.tick = 0;
}

/** Fire one burst now. Returns false if not allowed (not in flight, burst active, not enough fuel). */
export function startBurst(s: SimState, dir: BurstDir): boolean {
  if (s.phase !== 'flight' || s.burstDir !== -1 || s.fuelTenths < PHYSICS.burstCostTenths) return false;
  s.fuelTenths -= PHYSICS.burstCostTenths;
  s.spentTenths += PHYSICS.burstCostTenths;
  s.burstDir = dir;
  s.burstEnd = s.tick + PHYSICS.burstTicks;
  s.bursts.push([s.tick, dir]);
  return true;
}

export function gateOpen(g: Gate, tick: number): boolean {
  return (tick + g.phase) % g.period < g.open;
}

/** Fraction of the current open window still remaining (0 when closed). Drives the cycle bar. */
export function gateOpenRemaining(g: Gate, tick: number): number {
  const t = (tick + g.phase) % g.period;
  return t < g.open ? 1 - t / g.open : 0;
}

/** Gravitational acceleration at a point, wu/s². */
export function gravityAt(stage: StageDef, x: number, y: number): { ax: number; ay: number } {
  let ax = 0, ay = 0;
  const eps2 = PHYSICS.softening * PHYSICS.softening;
  for (const p of stage.planets) {
    const dx = p.x - x, dy = p.y - y;
    const r2 = dx * dx + dy * dy + eps2;
    const k = p.gm / (r2 * Math.sqrt(r2));
    ax += dx * k;
    ay += dy * k;
  }
  for (const h of stage.singularities) {
    const dx = h.x - x, dy = h.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= h.pull * h.pull) continue;
    const r2 = d2 + eps2;
    const r = Math.sqrt(r2);
    // Pull fades in over the outer 25% of the pull radius so there is no hard step.
    const fade = 1 - smoothstep(h.pull * 0.75, h.pull, Math.sqrt(d2));
    const k = (h.gm * fade) / (r2 * r);
    ax += dx * k;
    ay += dy * k;
  }
  return { ax, ay };
}

function end(s: SimState, status: Outcome['status'], cause: FailCause | null): Outcome {
  s.phase = 'ended';
  s.burstDir = -1;
  const outcome: Outcome = {
    status,
    ticks: s.tick,
    time: s.tick / PHYSICS.hz,
    fuel: s.spentTenths / 10,
    score: status === 'complete' ? debtScore(s.tick, s.spentTenths) : null,
    cause,
  };
  s.outcome = outcome;
  return outcome;
}

/**
 * Advance one fixed step. Semi-implicit Euler: velocity first, then position.
 * Returns events that happened during the step (gate cleared, run ended), or null.
 */
export function step(stage: StageDef, s: SimState): StepEvent[] | null {
  if (s.phase !== 'flight') return null;
  const dt = PHYSICS.dt;
  const g = gravityAt(stage, s.x, s.y);
  let ax = g.ax, ay = g.ay;
  if (s.burstDir !== -1) {
    ax += THRUST_X[s.burstDir] * PHYSICS.thrustAccel;
    ay += THRUST_Y[s.burstDir] * PHYSICS.thrustAccel;
  }
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.px = s.x;
  s.py = s.y;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.tick += 1;
  if (s.burstDir !== -1 && s.tick >= s.burstEnd) s.burstDir = -1;

  let events: StepEvent[] | null = null;
  const fail = (cause: FailCause): StepEvent[] => {
    (events ??= []).push({ type: 'end', outcome: end(s, 'failed', cause) });
    return events;
  };

  for (let i = 0; i < stage.gates.length; i++) {
    const gt = stage.gates[i];
    if (!segmentsCross(s.px, s.py, s.x, s.y, gt.x1, gt.y1, gt.x2, gt.y2)) continue;
    if (!gateOpen(gt, s.tick)) return fail('GATE');
    if (!s.gatesCleared[i]) {
      s.gatesCleared[i] = true;
      (events ??= []).push({ type: 'gate', index: i });
    }
  }

  const pr = PHYSICS.probeRadius;
  for (const p of stage.planets) {
    const dx = p.x - s.x, dy = p.y - s.y, rr = p.r + pr;
    if (dx * dx + dy * dy < rr * rr) return fail('PLANET');
  }
  for (const h of stage.singularities) {
    const dx = h.x - s.x, dy = h.y - s.y;
    if (dx * dx + dy * dy < h.horizon * h.horizon) return fail('SINGULARITY');
  }

  const b = stage.beacon;
  const bx = b.x - s.x, by = b.y - s.y, br = b.r + pr;
  if (bx * bx + by * by < br * br && s.gatesCleared.every(Boolean)) {
    (events ??= []).push({ type: 'end', outcome: end(s, 'complete', null) });
    return events;
  }

  const m = PHYSICS.boundsMargin;
  if (s.x < -m || s.y < -m || s.x > PHYSICS.field.w + m || s.y > PHYSICS.field.h + m) return fail('DRIFT');
  if (s.tick >= stage.timeLimit * PHYSICS.hz) return fail('TIME');
  return events;
}

/**
 * Sample the path the probe would follow with no further input, for the dashed
 * prediction. Uses the real step function, so it stops where the run would end.
 */
export function predictPath(stage: StageDef, from: SimState, seconds: number = PHYSICS.predictSeconds, stride = 4): number[] {
  const s = cloneSim(from);
  const out: number[] = [s.x, s.y];
  const steps = Math.round(seconds * PHYSICS.hz);
  for (let i = 1; i <= steps && s.phase === 'flight'; i++) {
    step(stage, s);
    if (i % stride === 0 || s.phase !== 'flight') out.push(s.x, s.y);
  }
  return out;
}

/** Prediction from the pad for a given aim (aim phase). */
export function predictLaunch(stage: StageDef, angle: number, power: number, seconds?: number): number[] {
  const s = createSim(stage);
  launch(s, angle, power);
  return predictPath(stage, s, seconds);
}
