// Client for the leaderboard API (server/api.ts). Online features exist only
// when VITE_VOID_API_URL (the API base, e.g. "/api" or "https://host/api") is
// set at build time; otherwise the game is local-only and says so.
import { useSyncExternalStore } from 'react';
import type { RunInputs } from '../game/types.ts';
import { getRuns, setRemote, type LocalRun } from './runs.ts';
import { isObject, load, save } from './storage.ts';

const BASE = String(import.meta.env.VITE_VOID_API_URL ?? '').trim().replace(/\/+$/, '');

/** True when this build was configured with a leaderboard server. */
export const onlineConfigured = BASE !== '';

export type BoardRow = { rank: number; callsign: string; score: number; ticks: number; fuelTenths: number };
export type Board = { stage: string; seed: number; total: number; rows: BoardRow[]; you: BoardRow | null };
export type Player = { playerId: string; callsign: string; token: string };

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  /** 0 = network/timeout, 429/5xx = transient; other 4xx = the request itself was refused. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, signal: ctl.signal });
  } catch {
    throw new ApiError(0, 'No signal');
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through with null body
  }
  if (!res.ok) {
    const msg = isObject(body) && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

// ------------------------------------------------------------- player

const validPlayer = (v: unknown): v is Player | null =>
  v === null || (isObject(v) && typeof v.playerId === 'string' && typeof v.callsign === 'string' && typeof v.token === 'string');

let player: Player | null = load('player', null, validPlayer);
const playerListeners = new Set<() => void>();

export function usePlayer(): Player | null {
  return useSyncExternalStore(
    (l) => { playerListeners.add(l); return () => playerListeners.delete(l); },
    () => player,
    () => player,
  );
}

export async function registerPlayer(callsign: string): Promise<Player> {
  const p = await request<Player>('/players', { method: 'POST', body: JSON.stringify({ callsign }) });
  player = { playerId: p.playerId, callsign: p.callsign, token: p.token };
  save('player', player);
  playerListeners.forEach((l) => l());
  return player;
}

// ------------------------------------------------------------- reads

export function fetchBoard(stage: string, seed: number): Promise<Board> {
  const q = new URLSearchParams({ stage });
  if (stage === 'daily') q.set('seed', String(seed));
  return request<Board>(`/leaderboard?${q}`, { token: player?.token });
}

// ------------------------------------------------------------- submission

type Confirmation = { status: 'confirmed'; rank: number | null; total: number; score: number };
const inFlight = new Set<string>();

/**
 * Submit a locally saved completed run. State goes local → pending →
 * confirmed | failed | rejected; "confirmed" is set only after the server
 * verified and stored the run. Resubmitting the same run id is safe.
 */
export async function submitRun(run: LocalRun): Promise<void> {
  if (!player || !run.inputs || run.score === null || inFlight.has(run.id)) return;
  const inputs: RunInputs = run.inputs;
  inFlight.add(run.id);
  setRemote(run.id, { state: 'pending' });
  try {
    const c = await request<Confirmation>('/runs', {
      method: 'POST',
      token: player.token,
      body: JSON.stringify({ runId: run.id, inputs, claimed: { score: run.score, ticks: run.ticks, fuelTenths: run.fuelTenths } }),
    });
    setRemote(run.id, { state: 'confirmed', rank: c.rank, total: c.total });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, 'No signal');
    if (err.status === 401) {
      // The server no longer knows this player (e.g. a reset database).
      player = null;
      save('player', null);
      playerListeners.forEach((l) => l());
    }
    setRemote(run.id, err.retryable || err.status === 401 ? { state: 'failed', error: err.message } : { state: 'rejected', error: err.message });
  } finally {
    inFlight.delete(run.id);
  }
}

export function findRun(id: string): LocalRun | undefined {
  return getRuns().find((r) => r.id === id);
}
