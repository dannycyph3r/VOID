// Leaderboard REST API. Transport-agnostic so it can be tested without sockets.
//
// Trust model: the browser is never trusted. A submission carries the full
// input log; the server re-simulates it with the shared rules (src/game) and
// stores the score *it* computed. The claimed score must match exactly.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RULES_VERSION } from '../src/game/constants.ts';
import { seedForDate } from '../src/game/daily.ts';
import { resolveStage } from '../src/game/registry.ts';
import { simulateRun } from '../src/game/replay.ts';
import type { RunInputs } from '../src/game/types.ts';
import type { Db } from './db.ts';

export type ApiRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  token: string | null;
  body: unknown;
  ip: string;
};
export type ApiResponse = { status: number; body: unknown };

const CALLSIGN = /^[A-Z0-9_-]{3,12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAGE_IDS = new Set(['01', '02', '03', '04', '05', '06', 'daily']);
const BOARD_LIMIT = 50;

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const err = (status: number, error: string): ApiResponse => ({ status, body: { error } });

/** Fixed-window rate limiter keyed by bucket + client. In-memory: per server process. */
export function createLimiter(now: () => number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key: string, limit: number, windowMs: number): boolean => {
    const t = now();
    const h = hits.get(key);
    if (!h || h.reset <= t) {
      if (hits.size > 50_000) hits.clear();
      hits.set(key, { count: 1, reset: t + windowMs });
      return true;
    }
    h.count++;
    return h.count <= limit;
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Daily runs are accepted for today (UTC) and, as a grace period, yesterday. */
export function acceptedDailySeeds(now: number): number[] {
  return [seedForDate(new Date(now)), seedForDate(new Date(now - 86_400_000))];
}

export function createApi(db: Db, now: () => number = Date.now) {
  const limit = createLimiter(now);

  function auth(token: string | null) {
    if (!token || token.length > 128) return undefined;
    return db.playerByTokenHash(hashToken(token));
  }

  function registerPlayer(req: ApiRequest): ApiResponse {
    if (!limit(`player:${req.ip}`, 5, 3_600_000)) return err(429, 'too many registrations, try later');
    if (!isRecord(req.body) || typeof req.body.callsign !== 'string') return err(400, 'callsign required');
    const callsign = req.body.callsign.trim().toUpperCase();
    if (!CALLSIGN.test(callsign)) return err(400, 'callsign must be 3–12 characters: A–Z, 0–9, _ or -');
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    db.createPlayer(id, callsign, hashToken(token), now());
    return { status: 201, body: { playerId: id, callsign, token } };
  }

  function leaderboard(req: ApiRequest): ApiResponse {
    if (!limit(`read:${req.ip}`, 120, 60_000)) return err(429, 'slow down');
    const stage = req.query.get('stage') ?? '';
    const seed = stage === 'daily' ? Number(req.query.get('seed')) : 0;
    if (!STAGE_IDS.has(stage) || !resolveStage(stage, seed)) return err(400, 'unknown stage or seed');
    const rows = db.board(stage, seed, RULES_VERSION);
    const me = auth(req.token);
    const mine = me ? rows.find((r) => r.playerId === me.id) : undefined;
    // Never expose player ids publicly.
    const pub = (r: (typeof rows)[number]) => ({ rank: r.rank, callsign: r.callsign, score: r.score, ticks: r.ticks, fuelTenths: r.fuelTenths });
    return {
      status: 200,
      body: {
        stage, seed, rulesVersion: RULES_VERSION, total: rows.length,
        rows: rows.slice(0, BOARD_LIMIT).map(pub),
        you: mine ? pub(mine) : null,
      },
    };
  }

  function submitRun(req: ApiRequest): ApiResponse {
    const me = auth(req.token);
    if (!me) return err(401, 'unknown player');
    if (!limit(`run:${me.id}`, 30, 60_000) || !limit(`runip:${req.ip}`, 60, 60_000)) return err(429, 'too many submissions, try later');
    const b = req.body;
    if (!isRecord(b) || typeof b.runId !== 'string' || !UUID.test(b.runId) || !isRecord(b.inputs) || !isRecord(b.claimed)) {
      return err(400, 'malformed submission');
    }
    const runId = b.runId;

    // Idempotent: re-sending a confirmed run returns the same confirmation.
    const existing = db.runById(runId);
    if (existing) {
      if (existing.playerId !== me.id) return err(409, 'run id already used');
      return { status: 200, body: confirmation(existing.stage, existing.seed, me.id, existing) };
    }

    const inputs = b.inputs as RunInputs;
    if (typeof inputs.stage !== 'string' || !STAGE_IDS.has(inputs.stage) || !Number.isInteger(inputs.seed)) return err(400, 'unknown stage');
    if (inputs.stage === 'daily' ? !acceptedDailySeeds(now()).includes(inputs.seed) : inputs.seed !== 0) {
      return err(400, 'daily challenge closed or seed invalid');
    }
    const stage = resolveStage(inputs.stage, inputs.seed);
    if (!stage) return err(400, 'unknown stage');
    const result = simulateRun(stage, inputs);
    if (!result.ok) return err(422, `invalid input log: ${result.error}`);
    const o = result.outcome;
    if (o.status !== 'complete' || o.score === null) return err(422, 'run does not reach the beacon');
    const claimed = b.claimed;
    const fuelTenths = Math.round(o.fuel * 10);
    if (claimed.score !== o.score || claimed.ticks !== o.ticks || claimed.fuelTenths !== fuelTenths) {
      return err(422, 'claimed result does not match verification');
    }
    const run = { id: runId, playerId: me.id, stage: inputs.stage, seed: inputs.seed, score: o.score, ticks: o.ticks, fuelTenths };
    db.insertRun({ ...run, rulesVersion: RULES_VERSION, inputs: JSON.stringify(inputs), createdAt: now() });
    return { status: 201, body: confirmation(inputs.stage, inputs.seed, me.id, run) };
  }

  function confirmation(stage: string, seed: number, playerId: string, run: { score: number; ticks: number; fuelTenths: number; id: string }) {
    const rows = db.board(stage, seed, RULES_VERSION);
    const mine = rows.find((r) => r.playerId === playerId);
    return {
      status: 'confirmed', runId: run.id, score: run.score, ticks: run.ticks, fuelTenths: run.fuelTenths,
      rank: mine?.rank ?? null, best: mine ? mine.score === run.score && mine.ticks === run.ticks && mine.fuelTenths === run.fuelTenths : false,
      total: rows.length,
    };
  }

  return function handle(req: ApiRequest): ApiResponse {
    if (req.method === 'GET' && req.path === '/api/health') return { status: 200, body: { ok: true, rulesVersion: RULES_VERSION } };
    if (req.method === 'POST' && req.path === '/api/players') return registerPlayer(req);
    if (req.method === 'GET' && req.path === '/api/leaderboard') return leaderboard(req);
    if (req.method === 'POST' && req.path === '/api/runs') return submitRun(req);
    return err(404, 'not found');
  };
}
