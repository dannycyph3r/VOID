import { describe, expect, it } from 'vitest';
import { MAX_BURSTS, PHYSICS, RULES_VERSION, game } from './constants.ts';
import { DAILY_TEMPLATES, dailyLabel, dailyStage, dateForSeed, formatCountdown, msUntilUtcMidnight, seedForDate, templateIndexForSeed } from './daily.ts';
import { dirFromTenths, segmentsCross } from './math.ts';
import { resolveStage } from './registry.ts';
import { checkInputs, makeInputs, simulateRun } from './replay.ts';
import { compareRuns, debtScore, formatSeconds } from './score.ts';
import { createSim, gateOpen, gravityAt, launch, launchVelocity, predictLaunch, startBurst, step } from './sim.ts';
import { DAILY_SOLUTIONS, STAGE_SOLUTIONS } from './solutions.ts';
import { STAGES, isUnlocked, planet, singularity, gate } from './stages.ts';
import type { RunInputs, StageDef } from './types.ts';

/** An empty test field: pad at the centre, beacon far away, nothing else. */
function field(over: Partial<StageDef> = {}): StageDef {
  return {
    id: 'T', name: 'Test', mechanic: '', difficulty: 1, fuel: 100, par: 0, coords: '',
    pad: { x: 575, y: 360 }, beacon: { x: 1100, y: 40, r: 20 },
    planets: [], singularities: [], gates: [],
    aim: { min: -1800, max: 1800, angle: 0, power: 50 }, timeLimit: 60,
    ...over,
  };
}

function runUntilEnd(stage: StageDef, angle: number, power: number) {
  const s = createSim(stage);
  launch(s, angle, power);
  while (s.phase === 'flight') step(stage, s);
  return s;
}

describe('deterministic math', () => {
  it('matches Math.sin/cos to within 4e-15 across the circle', () => {
    for (let t = -3600; t <= 3600; t += 7) {
      const d = dirFromTenths(t);
      const rad = (t / 10) * Math.PI / 180;
      expect(Math.abs(d.x - Math.cos(rad))).toBeLessThan(4e-15);
      expect(Math.abs(d.y + Math.sin(rad))).toBeLessThan(4e-15);
    }
  });

  it('is exact at the axes and symmetric', () => {
    expect(dirFromTenths(0)).toEqual({ x: 1, y: -0 });
    expect(dirFromTenths(900).x).toBeCloseTo(0, 15);
    expect(dirFromTenths(900).y).toBe(-1);
    expect(dirFromTenths(-300).y).toBe(-dirFromTenths(300).y);
  });

  it('detects segment crossings once', () => {
    expect(segmentsCross(0, -1, 0, 1, -1, 0, 1, 0)).toBe(true);
    expect(segmentsCross(0, -1, 0, -0.5, -1, 0, 1, 0)).toBe(false);
    expect(segmentsCross(2, -1, 2, 1, -1, 0, 1, 0)).toBe(false);
    // Ending exactly on the line, then leaving: counted on exactly one of the two steps.
    const a = segmentsCross(0, -1, 0, 0, -1, 0, 1, 0);
    const b = segmentsCross(0, 0, 0, 1, -1, 0, 1, 0);
    expect(Number(a) + Number(b)).toBe(1);
  });
});

describe('gravity', () => {
  it('pulls toward a planet and falls off with distance', () => {
    const st = field({ planets: [planet(575, 360, 'L')] });
    const near = gravityAt(st, 575 + 100, 360);
    const far = gravityAt(st, 575 + 200, 360);
    expect(near.ax).toBeLessThan(0);
    expect(Math.abs(near.ay)).toBe(0);
    // Softened inverse square: close to 4x weaker at double distance.
    expect(near.ax / far.ax).toBeGreaterThan(3.9);
    expect(near.ax / far.ax).toBeLessThan(4.01);
  });

  it('stays finite at the centre of a body', () => {
    const st = field({ planets: [planet(575, 360, 'L')] });
    const g = gravityAt(st, 575, 360);
    expect(Number.isFinite(g.ax) && Number.isFinite(g.ay)).toBe(true);
  });

  it('has no singularity pull outside its pull radius', () => {
    const h = singularity(575, 360, 160);
    const st = field({ singularities: [h] });
    expect(gravityAt(st, 575 + 161, 360)).toEqual({ ax: 0, ay: 0 });
    expect(gravityAt(st, 575 + 100, 360).ax).toBeLessThan(0);
  });
});

describe('simulation', () => {
  it('launches at the configured speed and direction', () => {
    const v = launchVelocity(0, 100);
    expect(v.vx).toBeCloseTo(PHYSICS.launchSpeedMax, 12);
    expect(v.vy).toBeCloseTo(0, 12);
    const up = launchVelocity(900, 50);
    expect(up.vy).toBeCloseTo(-PHYSICS.launchSpeedMax / 2, 12);
  });

  it('moves in a straight line with no bodies (fixed step, dt = 1/120)', () => {
    const st = field();
    const s = createSim(st);
    launch(s, 0, 50);
    for (let i = 0; i < PHYSICS.hz; i++) step(st, s);
    expect(s.tick).toBe(120);
    expect(s.x - st.pad.x).toBeCloseTo(PHYSICS.launchSpeedMax / 2, 9);
    expect(s.y).toBe(st.pad.y);
  });

  it('is deterministic: identical inputs give bit-identical state', () => {
    const st = STAGES[1];
    const a = runUntilEnd(st, 620, 78);
    const b = runUntilEnd(st, 620, 78);
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.outcome).toEqual(b.outcome);
  });

  it('fires a burst: exact fuel cost, duration and delta-v', () => {
    const st = field();
    const s = createSim(st);
    launch(s, 0, 50);
    expect(startBurst(s, 0)).toBe(true);
    expect(s.fuelTenths).toBe(1000 - 24);
    expect(s.spentTenths / 10).toBe(game.burst.cost);
    expect(startBurst(s, 1)).toBe(false); // one burst at a time
    for (let i = 0; i < PHYSICS.burstTicks; i++) step(st, s);
    expect(s.burstDir).toBe(-1);
    expect(-s.vy).toBeCloseTo(PHYSICS.thrustAccel * PHYSICS.burstTicks / PHYSICS.hz, 9);
    expect(PHYSICS.burstTicks / PHYSICS.hz).toBeCloseTo(game.burst.duration, 2);
  });

  it('cannot burst in aim, after the run, or with too little fuel', () => {
    const st = field({ fuel: 4 });
    const s = createSim(st);
    expect(startBurst(s, 0)).toBe(false);
    launch(s, 0, 50);
    expect(startBurst(s, 0)).toBe(true);
    for (let i = 0; i < PHYSICS.burstTicks; i++) step(st, s);
    expect(s.fuelTenths).toBe(16);
    expect(startBurst(s, 0)).toBe(false); // 1.6 u < 2.4 u
  });

  it('fails on planet impact', () => {
    const st = field({ planets: [planet(800, 360, 'M')] });
    expect(runUntilEnd(st, 0, 60).outcome).toMatchObject({ status: 'failed', cause: 'PLANET', score: null });
  });

  it('fails inside an event horizon', () => {
    const st = field({ singularities: [singularity(800, 360)] });
    expect(runUntilEnd(st, 0, 40).outcome?.cause).toBe('SINGULARITY');
  });

  it('fails when the probe drifts out of the field', () => {
    expect(runUntilEnd(field(), 1800, 100).outcome?.cause).toBe('DRIFT');
  });

  it('fails when the time limit runs out', () => {
    // Circular orbit around a heavy planet never leaves and never lands.
    const p = planet(575, 360, 'L');
    const r = 150;
    const st = field({ pad: { x: 575 + r, y: 360 }, planets: [p], timeLimit: 5 });
    const s = createSim(st);
    launch(s, 900, 50);
    s.vx = 0;
    s.vy = -Math.sqrt(p.gm / r);
    while (s.phase === 'flight') step(st, s);
    expect(s.outcome).toMatchObject({ cause: 'TIME', ticks: 5 * PHYSICS.hz });
  });

  it('completes at the beacon with a Debt Score', () => {
    const st = field({ beacon: { x: 700, y: 360, r: 20 } });
    const s = runUntilEnd(st, 0, 50);
    expect(s.outcome?.status).toBe('complete');
    expect(s.outcome?.score).toBe(debtScore(s.tick, 0));
  });

  it('needs every gate before the beacon counts, and closed gates are solid', () => {
    const open = gate(650, 360, 900, 80, 4, 4); // always open
    const st = field({ beacon: { x: 900, y: 360, r: 20 }, gates: [open] });
    const s = runUntilEnd(st, 0, 60);
    expect(s.outcome?.status).toBe('complete');
    expect(s.gatesCleared).toEqual([true]);

    const missed = field({ beacon: { x: 900, y: 360, r: 20 }, gates: [gate(650, 100, 900, 80, 4, 4)] });
    expect(runUntilEnd(missed, 0, 60).outcome?.status).not.toBe('complete');

    // Open for the first second of every four; the probe arrives at ~2.4 s.
    const closed = field({ gates: [gate(650, 360, 900, 80, 4, 1)] });
    expect(gateOpen(closed.gates[0], 0)).toBe(true);
    expect(gateOpen(closed.gates[0], 2 * PHYSICS.hz)).toBe(false);
    expect(runUntilEnd(closed, 0, 60).outcome?.cause).toBe('GATE');
  });

  it('predicts the same path the simulation flies', () => {
    const st = STAGES[0];
    const path = predictLaunch(st, 450, 60, 1);
    const s = createSim(st);
    launch(s, 450, 60);
    for (let i = 0; i < PHYSICS.hz; i++) step(st, s);
    expect(path[path.length - 2]).toBe(s.x);
    expect(path[path.length - 1]).toBe(s.y);
  });
});

describe('Debt Score and ranking', () => {
  it('uses game.config weights: round(s × 10 + u × 25)', () => {
    expect(game.score).toEqual({ perSecond: 10, perFuelUnit: 25 });
    // Handoff example: 38.42 s, 21.6 u (9 bursts) → 924.
    expect(debtScore(Math.round(38.42 * PHYSICS.hz), 9 * 24)).toBe(924);
    expect(debtScore(0, 0)).toBe(0);
    expect(debtScore(PHYSICS.hz, 0)).toBe(10);
    expect(debtScore(0, 24)).toBe(60);
  });

  it('formats time without rounding up', () => {
    expect(formatSeconds(Math.round(38.42 * PHYSICS.hz))).toBe('38.41');
    expect(formatSeconds(PHYSICS.hz * 2)).toBe('2.00');
  });

  it('ranks by score, then time, then fuel, then earliest', () => {
    const runs = [
      { id: 'a', score: 500, ticks: 3000, fuelTenths: 48, at: 3 },
      { id: 'b', score: 480, ticks: 3100, fuelTenths: 24, at: 4 },
      { id: 'c', score: 500, ticks: 2900, fuelTenths: 72, at: 5 },
      { id: 'd', score: 500, ticks: 3000, fuelTenths: 24, at: 6 },
      { id: 'e', score: 500, ticks: 3000, fuelTenths: 24, at: 1 },
    ];
    expect(runs.sort(compareRuns).map((r) => r.id)).toEqual(['b', 'c', 'e', 'd', 'a']);
  });
});

describe('stages', () => {
  it('has six stages in the handoff order with 01–03 open from the start', () => {
    expect(STAGES.map((s) => s.name)).toEqual(['First Light', 'Slingshot', 'Narrows', 'Singularity', 'Binary', 'Deep Field']);
    const none = new Set<string>();
    expect(STAGES.map((s) => isUnlocked(s.id, none))).toEqual([true, true, true, false, false, false]);
    expect(isUnlocked('04', new Set(['03']))).toBe(true);
    expect(isUnlocked('05', new Set(['03']))).toBe(false);
  });

  it('increases difficulty and shrinks the tank', () => {
    const d = STAGES.map((s) => s.difficulty);
    const f = STAGES.map((s) => s.fuel);
    for (let i = 1; i < STAGES.length; i++) {
      expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
      expect(f[i]).toBeLessThanOrEqual(f[i - 1]);
    }
  });

  it('starts every stage with a valid, safe pad and default aim', () => {
    for (const st of [...STAGES, ...DAILY_TEMPLATES]) {
      expect(st.aim.angle).toBeGreaterThanOrEqual(st.aim.min);
      expect(st.aim.angle).toBeLessThanOrEqual(st.aim.max);
      for (const p of st.planets) expect(Math.hypot(p.x - st.pad.x, p.y - st.pad.y)).toBeGreaterThan(p.r + 40);
      for (const h of st.singularities) expect(Math.hypot(h.x - st.pad.x, h.y - st.pad.y)).toBeGreaterThan(h.pull);
    }
  });

  it.each(STAGES.map((s) => [s.id, s] as const))('stage %s has a replayable reference solution that beats par', (id, st) => {
    const ref = STAGE_SOLUTIONS[id];
    const r = simulateRun(st, makeInputs(st, 0, ref.angle, ref.power, ref.bursts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.status).toBe('complete');
    expect(r.outcome.score!).toBeLessThanOrEqual(st.par);
  });

  it('gets harder across 01 → 02 → 03: fewer launch aims reach the beacon unaided', () => {
    const rate = (st: StageDef) => {
      let wins = 0, total = 0;
      for (let a = st.aim.min; a <= st.aim.max; a += 10) {
        for (let p = PHYSICS.powerMin; p <= PHYSICS.powerMax; p += 2) {
          total++;
          const r = simulateRun(st, makeInputs(st, 0, a, p, []));
          if (r.ok && r.outcome.status === 'complete') wins++;
        }
      }
      return wins / total;
    };
    const [r1, r2, r3] = [rate(STAGES[0]), rate(STAGES[1]), rate(STAGES[2])];
    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
    expect(r3).toBeGreaterThan(0);
  });
});

describe('daily challenge', () => {
  it('derives the seed from the UTC date, whatever the local timezone', () => {
    expect(seedForDate(new Date('2026-10-15T00:00:00Z'))).toBe(20261015);
    expect(seedForDate(new Date('2026-10-15T23:59:59.999Z'))).toBe(20261015);
    expect(seedForDate(new Date('2026-10-16T00:00:00Z'))).toBe(20261016);
    // 23:30 in New York on the 15th is already the 16th in UTC.
    expect(seedForDate(new Date('2026-10-15T23:30:00-05:00'))).toBe(20261016);
    // 08:00 in Tokyo on the 16th is still the 15th in UTC.
    expect(seedForDate(new Date('2026-10-16T08:00:00+09:00'))).toBe(20261015);
    expect(seedForDate(new Date('2024-12-31T23:59:59Z'))).toBe(20241231);
    expect(seedForDate(new Date('2025-01-01T00:00:00Z'))).toBe(20250101);
  });

  it('round-trips and rejects invalid seeds', () => {
    expect(dateForSeed(20261015)?.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(dateForSeed(20260230)).toBeNull();
    expect(dateForSeed(20261301)).toBeNull();
    expect(dateForSeed(2026101.5)).toBeNull();
    expect(dailyLabel(20261015)).toBe('15 OCT');
  });

  it('is the same challenge for the same seed and varies across days', () => {
    expect(dailyStage(20261015)).toEqual(dailyStage(20261015));
    expect(dailyStage(20261015).coords).toBe('SEED 20261015');
    const seen = new Set<number>();
    for (let d = new Date('2026-01-01T00:00:00Z'); d.getUTCFullYear() === 2026; d = new Date(d.getTime() + 86_400_000)) {
      seen.add(templateIndexForSeed(seedForDate(d)));
    }
    expect(seen.size).toBe(DAILY_TEMPLATES.length);
  });

  it('counts down to the next UTC midnight', () => {
    expect(msUntilUtcMidnight(new Date('2026-10-15T23:00:00Z'))).toBe(3_600_000);
    expect(formatCountdown(3_600_000 + 61_000)).toBe('01:01:01');
  });

  it.each(DAILY_TEMPLATES.map((t, i) => [t.name, i] as const))('template %s is solvable and beats its par', (_n, i) => {
    const st = DAILY_TEMPLATES[i];
    const ref = DAILY_SOLUTIONS[i];
    const r = simulateRun(st, makeInputs(st, 20261015, ref.angle, ref.power, ref.bursts));
    expect(r.ok && r.outcome.status).toBe('complete');
    expect(r.ok && r.outcome.score!).toBeLessThanOrEqual(st.par);
  });

  it('resolves stage ids and seeds strictly', () => {
    expect(resolveStage('02', 0)?.name).toBe('Slingshot');
    expect(resolveStage('02', 20261015)).toBeNull();
    expect(resolveStage('daily', 20261015)?.id).toBe('daily');
    expect(resolveStage('daily', 20261399)).toBeNull();
    expect(resolveStage('99', 0)).toBeNull();
  });
});

describe('replay validation', () => {
  const st = STAGES[0];
  const ok = (over: Partial<RunInputs>): RunInputs => ({ ...makeInputs(st, 0, 450, 60, []), ...over });

  it('rejects malformed or impossible input logs', () => {
    expect(checkInputs(st, ok({}))).toBeNull();
    expect(checkInputs(st, ok({ v: RULES_VERSION + 1 }))).toMatch(/version/);
    expect(checkInputs(st, ok({ angle: 901 }))).toMatch(/angle/);
    expect(checkInputs(st, ok({ angle: 45.5 }))).toMatch(/angle/);
    expect(checkInputs(st, ok({ power: 19 }))).toMatch(/power/);
    expect(checkInputs(st, ok({ bursts: [[10, 0], [20, 1]] }))).toMatch(/order/);
    expect(checkInputs(st, ok({ bursts: [[10, 4 as 0]] }))).toMatch(/direction/);
    expect(checkInputs(st, ok({ bursts: Array.from({ length: MAX_BURSTS + 1 }, (_, i) => [i * 40, 0] as [number, 0]) }))).toMatch(/too many/);
    expect(checkInputs(st, ok({ bursts: Array.from({ length: 51 }, (_, i) => [i * 40, 0] as [number, 0]) }))).toMatch(/tank/);
  });

  it('rejects bursts recorded after the run ended', () => {
    const ref = STAGE_SOLUTIONS['01'];
    const r = simulateRun(st, makeInputs(st, 0, ref.angle, ref.power, [[st.timeLimit * PHYSICS.hz - 1, 0]]));
    expect(r.ok).toBe(false);
  });

  it('replays a live run with bursts exactly', () => {
    const s = createSim(st);
    launch(s, 450, 60);
    while (s.phase === 'flight') {
      if (s.tick === 240 || s.tick === 600) startBurst(s, s.tick === 240 ? 1 : 0);
      step(st, s);
    }
    const r = simulateRun(st, makeInputs(st, 0, 450, 60, s.bursts));
    expect(r.ok && r.outcome).toEqual(s.outcome);
  });
});
