import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeInputs, simulateRun } from '../src/game/replay.ts';
import { dailyStage, templateIndexForSeed } from '../src/game/daily.ts';
import { DAILY_SOLUTIONS, STAGE_SOLUTIONS } from '../src/game/solutions.ts';
import { STAGES } from '../src/game/stages.ts';
import { acceptedDailySeeds, createApi, type ApiRequest } from './api.ts';
import { openDb } from './db.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z');

function setup() {
  const db = openDb(':memory:');
  let t = NOW;
  const api = createApi(db, () => t);
  const call = (method: string, path: string, opts: Partial<ApiRequest> = {}) =>
    api({ method, path, query: new URLSearchParams(), token: null, body: null, ip: '1.1.1.1', ...opts });
  const register = (callsign: string, ip = '1.1.1.1') => {
    const r = call('POST', '/api/players', { body: { callsign }, ip });
    return (r.body as { token: string }).token;
  };
  const tick = (ms: number) => { t += ms; };
  return { db, call, register, tick };
}

function referenceSubmission(stageIdx: number, bursts?: [number, 0 | 1 | 2 | 3][]) {
  const st = STAGES[stageIdx];
  const ref = STAGE_SOLUTIONS[st.id];
  const inputs = makeInputs(st, 0, ref.angle, ref.power, bursts ?? ref.bursts);
  const r = simulateRun(st, inputs);
  if (!r.ok) throw new Error(r.error);
  const o = r.outcome;
  return { runId: randomUUID(), inputs, claimed: { score: o.score, ticks: o.ticks, fuelTenths: Math.round(o.fuel * 10) } };
}

describe('leaderboard API', () => {
  it('registers guest players with validated callsigns', () => {
    const { call } = setup();
    const ok = call('POST', '/api/players', { body: { callsign: 'nova_7' } });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ callsign: 'NOVA_7' });
    expect(call('POST', '/api/players', { body: { callsign: 'x' } }).status).toBe(400);
    expect(call('POST', '/api/players', { body: { callsign: '<script>' } }).status).toBe(400);
    expect(call('POST', '/api/players', { body: null }).status).toBe(400);
  });

  it('accepts a verified run and ranks it', () => {
    const { call, register } = setup();
    const token = register('ACE');
    const sub = referenceSubmission(0);
    const r = call('POST', '/api/runs', { token, body: sub });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'confirmed', rank: 1, score: sub.claimed.score, best: true });
    const board = call('GET', '/api/leaderboard', { query: new URLSearchParams({ stage: '01' }), token });
    expect(board.body).toMatchObject({ total: 1, rows: [{ rank: 1, callsign: 'ACE', score: sub.claimed.score }], you: { rank: 1 } });
    // No private identifiers in the public payload.
    expect(JSON.stringify(board.body)).not.toMatch(/playerId|token/);
  });

  it('is idempotent per run id and refuses reuse by another player', () => {
    const { call, register } = setup();
    const a = register('ALPHA');
    const b = register('BRAVO');
    const sub = referenceSubmission(0);
    expect(call('POST', '/api/runs', { token: a, body: sub }).status).toBe(201);
    const again = call('POST', '/api/runs', { token: a, body: sub });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: 'confirmed', rank: 1 });
    expect(call('POST', '/api/runs', { token: b, body: sub }).status).toBe(409);
    expect((call('GET', '/api/leaderboard', { query: new URLSearchParams({ stage: '01' }) }).body as { total: number }).total).toBe(1);
  });

  it('rejects tampered scores, failed runs, impossible inputs and unknown players', () => {
    const { call, register } = setup();
    const token = register('CHEAT');
    const sub = referenceSubmission(0);
    expect(call('POST', '/api/runs', { token: null, body: sub }).status).toBe(401);
    expect(call('POST', '/api/runs', { token: 'nope', body: sub }).status).toBe(401);
    expect(call('POST', '/api/runs', { token, body: { ...sub, claimed: { ...sub.claimed, score: 1 } } }).status).toBe(422);
    expect(call('POST', '/api/runs', { token, body: { ...sub, runId: randomUUID(), inputs: { ...sub.inputs, power: 20 } } }).status).toBe(422);
    expect(call('POST', '/api/runs', { token, body: { ...sub, runId: randomUUID(), inputs: { ...sub.inputs, angle: 5000 } } }).status).toBe(422);
    expect(call('POST', '/api/runs', { token, body: { ...sub, runId: randomUUID(), inputs: { ...sub.inputs, v: 999 } } }).status).toBe(422);
    expect(call('POST', '/api/runs', { token, body: { ...sub, runId: 'not-a-uuid' } }).status).toBe(400);
    expect(call('POST', '/api/runs', { token, body: { ...sub, runId: randomUUID(), inputs: { ...sub.inputs, stage: '99' } } }).status).toBe(400);
    expect(call('POST', '/api/runs', { token, body: { ...sub, runId: randomUUID(), inputs: { ...sub.inputs, seed: 20261015 } } }).status).toBe(400);
    expect(call('POST', '/api/runs', { token, body: 'junk' }).status).toBe(400);
  });

  it('keeps each player’s best run and orders by score, then time', () => {
    const { call, register, tick } = setup();
    const a = register('ALPHA');
    const b = register('BRAVO');
    const plain = referenceSubmission(0);
    // Find a completing variant that spends fuel, so it scores worse than the plain run.
    let withBurst: ReturnType<typeof referenceSubmission> | null = null;
    for (let t = 0; !withBurst && t < 2000; t += 20) {
      for (const d of [0, 1, 2, 3] as const) {
        try { withBurst = referenceSubmission(0, [[t, d]]); } catch { continue; }
        const r = simulateRun(STAGES[0], withBurst.inputs);
        if (r.ok && r.outcome.status === 'complete') break;
        withBurst = null;
      }
    }
    if (!withBurst) throw new Error('no burst variant found');
    expect(call('POST', '/api/runs', { token: a, body: withBurst }).status).toBe(201);
    tick(1000);
    expect(call('POST', '/api/runs', { token: b, body: plain }).status).toBe(201);
    tick(1000);
    expect(call('POST', '/api/runs', { token: a, body: { ...plain, runId: randomUUID() } }).status).toBe(201);
    const rows = (call('GET', '/api/leaderboard', { query: new URLSearchParams({ stage: '01' }) }).body as { rows: { callsign: string; rank: number }[] }).rows;
    // Same score and time: the earlier run (BRAVO) ranks first; ALPHA appears once with its best.
    expect(rows.map((r) => r.callsign)).toEqual(['BRAVO', 'ALPHA']);
  });

  it('only accepts today’s (or yesterday’s) daily seed', () => {
    const { call, register } = setup();
    const token = register('DAILY');
    const [today, yesterday] = acceptedDailySeeds(NOW);
    expect([today, yesterday]).toEqual([20261015, 20261014]);
    const submit = (seed: number) => {
      const st = dailyStage(seed);
      const ref = DAILY_SOLUTIONS[templateIndexForSeed(seed)];
      const inputs = makeInputs(st, seed, ref.angle, ref.power, ref.bursts);
      const r = simulateRun(st, inputs);
      if (!r.ok) throw new Error(r.error);
      const claimed = { score: r.outcome.score, ticks: r.outcome.ticks, fuelTenths: Math.round(r.outcome.fuel * 10) };
      return call('POST', '/api/runs', { token, body: { runId: randomUUID(), inputs, claimed } });
    };
    expect(submit(today).status).toBe(201);
    expect(submit(yesterday).status).toBe(201);
    expect(submit(20261013).status).toBe(400);
    expect(submit(20261016).status).toBe(400);
    const board = call('GET', '/api/leaderboard', { query: new URLSearchParams({ stage: 'daily', seed: String(today) }) });
    expect(board.body).toMatchObject({ total: 1 });
  });

  it('validates leaderboard queries and rate-limits registrations', () => {
    const { call } = setup();
    expect(call('GET', '/api/leaderboard', { query: new URLSearchParams({ stage: 'zz' }) }).status).toBe(400);
    expect(call('GET', '/api/leaderboard', { query: new URLSearchParams({ stage: 'daily', seed: '20261340' }) }).status).toBe(400);
    expect(call('GET', '/api/leaderboard', { query: new URLSearchParams({ stage: '03' }) }).body).toMatchObject({ rows: [], total: 0, you: null });
    const statuses = Array.from({ length: 7 }, (_, i) => call('POST', '/api/players', { body: { callsign: `PILOT${i}` }, ip: '9.9.9.9' }).status);
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses[6]).toBe(429);
  });
});
