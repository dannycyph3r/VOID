// SQLite persistence for players and verified runs (node:sqlite, no dependencies).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Ordered migrations; PRAGMA user_version records how many have run. */
const MIGRATIONS: string[] = [
  `CREATE TABLE players (
     id TEXT PRIMARY KEY,
     callsign TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE runs (
     id TEXT PRIMARY KEY,
     player_id TEXT NOT NULL REFERENCES players(id),
     stage TEXT NOT NULL,
     seed INTEGER NOT NULL,
     rules_version INTEGER NOT NULL,
     score INTEGER NOT NULL,
     ticks INTEGER NOT NULL,
     fuel_tenths INTEGER NOT NULL,
     inputs TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX runs_board ON runs (stage, seed, rules_version, score, ticks, fuel_tenths, created_at);
   CREATE INDEX runs_player ON runs (player_id, stage, seed, rules_version);`,
];

export type Player = { id: string; callsign: string };
export type BoardRow = { rank: number; callsign: string; score: number; ticks: number; fuelTenths: number; playerId: string };
export type StoredRun = { id: string; playerId: string; stage: string; seed: number; score: number; ticks: number; fuelTenths: number };

export type Db = ReturnType<typeof openDb>;

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const insertPlayer = db.prepare('INSERT INTO players (id, callsign, token_hash, created_at) VALUES (?, ?, ?, ?)');
  const playerByToken = db.prepare('SELECT id, callsign FROM players WHERE token_hash = ?');
  const runById = db.prepare('SELECT id, player_id AS playerId, stage, seed, score, ticks, fuel_tenths AS fuelTenths FROM runs WHERE id = ?');
  const insertRun = db.prepare(
    'INSERT INTO runs (id, player_id, stage, seed, rules_version, score, ticks, fuel_tenths, inputs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // Best run per player (score, then time, then fuel, then earliest), then ranked the same way.
  const board = db.prepare(`
    WITH best AS (
      SELECT r.*, ROW_NUMBER() OVER (
        PARTITION BY r.player_id ORDER BY r.score, r.ticks, r.fuel_tenths, r.created_at
      ) AS n
      FROM runs r WHERE r.stage = ? AND r.seed = ? AND r.rules_version = ?
    )
    SELECT ROW_NUMBER() OVER (ORDER BY b.score, b.ticks, b.fuel_tenths, b.created_at) AS rank,
           p.callsign, b.score, b.ticks, b.fuel_tenths AS fuelTenths, b.player_id AS playerId
    FROM best b JOIN players p ON p.id = b.player_id
    WHERE b.n = 1
    ORDER BY rank`);

  return {
    raw: db,
    createPlayer(id: string, callsign: string, tokenHash: string, now: number): void {
      insertPlayer.run(id, callsign, tokenHash, now);
    },
    playerByTokenHash(hash: string): Player | undefined {
      return playerByToken.get(hash) as Player | undefined;
    },
    runById(id: string): StoredRun | undefined {
      return runById.get(id) as StoredRun | undefined;
    },
    insertRun(r: StoredRun & { rulesVersion: number; inputs: string; createdAt: number }): void {
      insertRun.run(r.id, r.playerId, r.stage, r.seed, r.rulesVersion, r.score, r.ticks, r.fuelTenths, r.inputs, r.createdAt);
    },
    /** Full ranked board (best run per player). Callers slice for display. */
    board(stage: string, seed: number, rulesVersion: number): BoardRow[] {
      return board.all(stage, seed, rulesVersion) as BoardRow[];
    },
    close(): void {
      db.close();
    },
  };
}
