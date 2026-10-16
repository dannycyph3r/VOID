# VOID

A minimal analog sci‑fi physics arcade game. Launch a probe, let planetary gravity bend its path, correct with short thruster bursts, and reach the beacon as fast and fuel‑efficiently as you can.

This repository holds the playable game (React + a canvas 2D engine), a small verifying leaderboard server, and the approved design handoff in [`VOID-Design-Handoff/`](VOID-Design-Handoff/README.md). The handoff is the source of truth for the design: the app imports its `tokens/tokens.css` and `tokens/game.config.ts` directly, and the product name is read only from `game.config.ts`.

## Quick start

Requires **Node 24+** (developed on Node 26). The server uses the built-in `node:sqlite` and runs TypeScript directly through Node's type stripping, so it has no runtime dependencies.

```bash
npm install
```

```bash
npm run dev
```

That starts the game at <http://localhost:5173> in **local-only mode**. Everything is playable; runs are saved in this browser's `localStorage`, and Stats says plainly that results are local.

### With the online leaderboard

Build the client against the bundled API, then start the server. The server serves both the game and the API on one origin:

```bash
VITE_VOID_API_URL=/api npm run build
```

```bash
npm start
```

Open <http://localhost:8787>. Verified runs are stored in `data/void.db` (SQLite, created on first start).

For live development with the API, run `npm run dev:server` in one terminal and `VITE_VOID_API_URL=/api npm run dev` in another. Vite proxies `/api` to port 8787.

### Environment

See [`.env.example`](.env.example).

| Variable | Used by | Meaning |
| --- | --- | --- |
| `VITE_VOID_API_URL` | client build | API base, e.g. `/api` or `https://void.example.com/api`. **Empty means local-only mode.** |
| `PORT` | server | Listen port (default `8787`). |
| `VOID_DB_PATH` | server | SQLite file (default `data/void.db`). |
| `VOID_CORS_ORIGINS` | server | Comma-separated origins allowed to call the API cross-origin. Not needed when the server also serves the client. |

No secrets are needed. Player tokens are random 256-bit values that the server issues; it stores only their SHA-256 hash.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (client only). |
| `npm run dev:server` | API + static server with `--watch`. |
| `npm run build` | Type-check, then production build to `dist/`. |
| `npm start` | Serve `dist/` and `/api` on `PORT`. |
| `npm run typecheck` | `tsc` over client, server, scripts and tokens. |
| `npm run lint` | ESLint (TypeScript + React Hooks rules). |
| `npm test` | Vitest: physics, scoring, stages, daily, replay validation, API, view transform, design tokens. |
| `npm run solve` | Brute-force solver that validates every stage and daily template and suggests pars (≈3 min). |
| `npm run check` | typecheck + lint + test + build. |
| `npm run e2e` | Playwright in Chromium, Firefox and WebKit: cross-engine determinism and user journeys (≈1 min). See [Browser E2E](#browser-e2e). |
| `npm run e2e:fixture` | Regenerate `e2e/determinism/fixture.json` from Node after a rules change. |

## How it works

```
src/
  game/        Pure rules, shared by browser, server, tests and solver (no DOM)
    constants.ts   PHYSICS tuning, RULES_VERSION; re-exports game.config
    math.ts        Deterministic trig (integer-tenths-of-a-degree, polynomial), segment test, PRNG
    sim.ts         Fixed-step simulation: launch, gravity, bursts, gates, collisions, outcome, prediction
    stages.ts      Six stages + unlock rule      daily.ts   UTC seed → curated daily template
    score.ts       Debt Score, ranking order, formatting
    replay.ts      Input-log validation and re-simulation (what the server trusts)
    solutions.ts   Solver-found reference runs, replayed by the tests
  engine/      Browser engine: Engine.ts (loop, input, contract), render.ts (canvas), view.ts (portrait rotation), audio.ts
  state/       settings (localStorage), runs (local history + submission state), api (leaderboard client)
  screens/     Home, Stages, Flight, Result, Stats, HowTo
  components/  Shared UI (Screen + CRT layers, Toggle, focus trap, …) and SVG stage diagram / flight trace
server/        node:http + node:sqlite: api.ts (routes, verification), db.ts (schema + migrations), index.ts
scripts/       solve.ts, determinism-fixture.ts
e2e/           Playwright: determinism.spec.ts, journeys.spec.ts, servers.ts (builds + servers), determinism/ (cases, page, fixture)
```

**Engine contract** (handoff `docs/04`). The engine mounts into `[data-engine-canvas="playfield"]`. UI → engine: `aim(angle, power)`, `launch()`, `burst(dir)` (plus `hold(dir, down)` for hold-to-repeat), `pause()`, `resume()`, `restart()`, `setReducedMotion(bool)`. Engine → UI: `onTelemetry({ t, fuel, spent, phase, gates, … })` at 10 Hz, `onEvent` (launch, burst, gate, low fuel, end, pause), and `onOutcome({ outcome, inputs, path })`.

**Simulation.** It runs at a fixed 120 Hz and is decoupled from the display frame rate. Rendering interpolates the probe between steps. Integration is semi-implicit Euler. Bodies are stationary point masses with softened inverse-square gravity. A singularity pulls only inside its dashed pull radius, fading in over the outer 25%. The predicted dashed line is produced by the same `step()` function, so it stops exactly where the run would end.

**Determinism.** Launch direction uses integer tenths of a degree and a polynomial sine/cosine. Bodies don't move. Fuel is integer tenths and time is integer ticks. Only IEEE-guaranteed operations (`+ − × ÷ √`) touch the physics, so the browser and the server compute bit-identical runs. Tests show identical inputs give identical state, and that a run recorded live replays to the same outcome. `npm run e2e` checks this in Chromium, Firefox and WebKit against Node (see [Browser E2E](#browser-e2e)).

## Rules

| Rule | Value | Source |
| --- | --- | --- |
| Debt Score | `round(seconds × 10 + fuel units × 25)`, lower is better, failed runs score nothing | `game.config.ts` |
| Burst | 0.28 s (34 ticks), 2.4 u, one at a time; each press fires one, holding repeats | `game.config.ts` |
| Launch | angle per stage (0.1° resolution), power 20–100% → up to 52 wu/s | `constants.ts` |
| Thrust | 30 wu/s² (≈ 8.5 wu/s per burst) | `constants.ts` |
| Fail | hit a planet (IMPACT), cross an event horizon (SINGULARITY), fly into a closed gate (GATE CLOSED), leave the field by > 70 wu (LOST SIGNAL), or run past the stage time limit (OUT OF TIME) | `sim.ts` |
| Complete | touch the beacon after passing every gate | `sim.ts` |
| Gates | open/closed on a fixed cycle measured from launch | `stages.ts` |
| Ranking | score ↑, then time ↑, then fuel ↑, then earliest run | `score.ts`, `server/db.ts` |
| Unlocks | 01–03 open from the start; 04–06 each need the previous stage cleared | `stages.ts` |
| Daily | seed = UTC date `YYYYMMDD`; `mulberry32(seed)` picks one of 7 curated, solver-validated templates; same challenge worldwide 00:00–24:00 UTC | `daily.ts` |

| Stage | Mechanic | Tank | Par | Limit |
| --- | --- | --- | --- | --- |
| 01 First Light | WELL | 120 u | 350 | 60 s |
| 02 Slingshot | ASSIST | 100 u | 400 | 75 s |
| 03 Narrows | GATES | 90 u | 400 | 90 s |
| 04 Singularity | BLACK HOLE | 80 u | 500 | 90 s |
| 05 Binary | TWIN WELLS | 80 u | 400 | 90 s |
| 06 Deep Field | ALL | 70 u | 750 | 120 s |

Every stage and daily template has a reference solution in `src/game/solutions.ts`. The test suite replays each one and asserts that it completes and beats par. A sweep over launch aims also asserts that 01 → 02 → 03 get strictly harder: fewer unaided launches reach the beacon.

## Leaderboard and trust model

- `POST /api/players {callsign}` → guest player and token. There are no accounts and no email.
- `GET /api/leaderboard?stage=02` (or `stage=daily&seed=YYYYMMDD`) returns the best run per player, ranked, top 50. It includes `you` when called with a token. Player IDs are never returned.
- `POST /api/runs {runId, inputs, claimed}` with `Authorization: Bearer <token>`. The server validates the input log (rules version, angle/power range, burst order, spacing, count and tank). It then **re-simulates the run** with the shared rules and stores the score it computed itself. The claimed score, ticks and fuel must match exactly, or the run is rejected (422). `runId` is a UUID primary key, so resending the same run is idempotent and can't create duplicates. Daily runs are accepted only for today's or yesterday's UTC seed.
- Abuse limits (in-memory, per process): 5 registrations/hour/IP, 30 submissions/min/player, 60 submissions/min/IP, 120 reads/min/IP. Request bodies are capped at 32 KB.

In the client, every finished run is saved locally first. A run's submission state is shown as **SUBMITTING… → ✓ VERIFIED · RANK n**, **NOT SENT · reason** (retryable), or **REJECTED · reason**. "Verified" appears only after the server confirms. When `VITE_VOID_API_URL` is unset, Stats shows "LOCAL ONLY · THIS DEVICE" and nothing is sent anywhere.

**What verification does and doesn't guarantee.** It proves that the submitted input log really produces the submitted score under the current rules. It cannot prove a human produced the inputs: a bot or an offline optimiser can still submit legitimate input logs. It is not cheat-proof.

## Deviations from the handoff (and why)

- **Pars recalibrated.** The prototype's pars (400 / 900 / 1300 / 1600 / 1750 / 2400) were written against a faked clock and were far above any real completion. Pars are now the solver's median winning score plus two bursts, rounded up to 50.
- **One world per stage on phones.** The handoff suggests separate 360 × 470 portrait layouts. That would split every leaderboard by device, so portrait phones instead show the same 1150 × 720 field rotated a quarter turn. Thrust buttons stay screen-relative.
- **Predicted path is 6 s, not ~3 s.** Real flight speed is slower than the prototype's animation. 6 s gives the same on-screen length.
- **Submission lives in Stats.** The pinned YOU row has a callsign field and Submit button, as in the Stats artboard. How to Play says "submit your best from Stats" rather than "submits when you're online", because submission isn't automatic.
- **Daily from Home goes straight to Flight**, per the IA diagram. The daily is also selectable in Stages.

## Accessibility

Interface controls are keyboard-operable and focus is visible (2 px mint, `:focus-visible`). Game keys bind only while the playfield has focus, and every key has an on-screen button. The pause dialog is focus-trapped and Esc resumes. A polite live region announces launch, gate cleared, low fuel, complete and failed. Nothing relies on colour alone: ✓/✕, FUEL LOW, toothed horizons, and solid vs dashed paths. Reduced motion (system setting or Settings) removes signal effects, ambient motion and the beacon pulse; physics is unchanged. The game auto-pauses on tab hide, window blur and orientation change. Gameplay controls use `touch-action: none` so the page doesn't scroll during play.

## Browser E2E

```bash
npx playwright install chromium firefox webkit
```

```bash
npm run e2e
```

The first command is needed once per machine. `npm run e2e` runs every spec in Chromium, Firefox and WebKit (15 tests, about a minute; flights run in real time). Playwright starts [`e2e/servers.ts`](e2e/servers.ts), which:

- builds the client twice with [`e2e/vite.config.ts`](e2e/vite.config.ts) (the app's Vite config plus the determinism page) into `e2e/.out/`: once local-only (`VITE_VOID_API_URL` empty) and once with `VITE_VOID_API_URL=/api`;
- starts the real server (`server/index.ts`, what `npm start` runs) for each build, with the build directory as its working directory and a fresh SQLite file in `e2e/.out/db/`. One local-only server runs on port 4181. Each browser gets its own online server on 4182–4184, so each one's leaderboard starts empty.

Your `dist/` and `data/void.db` are not touched.

**Determinism** ([`e2e/determinism.spec.ts`](e2e/determinism.spec.ts)). [`e2e/determinism/cases.ts`](e2e/determinism/cases.ts) builds 44 input logs and replays them with `simulateRun`. They are every stage and daily reference solution from `solutions.ts` (dailies through a real seed, so `mulberry32` template selection runs too), each stage's reference aim with an extra pair of bursts, and 25 seeded live runs with 12–37 bursts each that end in a crash, lost signal or timeout. Each result records status, cause, ticks, time, score and fuel. It also records the final x/y as numbers and as IEEE-754 bit patterns, and a hash of every simulated position. `npm run e2e:fixture` writes the Node results to `fixture.json`. In each browser, the production-built page at `/e2e/determinism/index.html` runs the same module. The spec requires its JSON to be byte-identical to the fixture. On a mismatch it lists each diverging field as `node=… browser=…`. A separate test fails if Node no longer reproduces the fixture, so a rules change without a regenerated fixture is caught.

**Journeys** ([`e2e/journeys.spec.ts`](e2e/journeys.spec.ts)):
- Home → Stages → Flight 01 → keyboard aim to 2.0° / 74% → Space → Result: COMPLETE, score 227. Stats then shows LOCAL ONLY · THIS DEVICE with that run, and no request went to `/api`.
- Failed run (40.0° / 60% → FAILED · IMPACT, no score), then R on Result → back on the pad at the stage's starting aim.
- Online build: complete Flight 01, Stats → callsign → SUBMIT → **✓ VERIFIED · RANK 1**. The run is still on the board after a reload.

`@playwright/test` is pinned to **1.61.1**. On macOS 14, 1.62 and later drive a frozen WebKit build (r2251) with a protocol setting it doesn't support (`PushAPIEnabled`), so every WebKit page fails to open. Before upgrading, check that WebKit still starts on your oldest supported macOS.

## Verification status

Automated (run with `npm run check`): `tsc` passes, ESLint is clean, there are 61 Vitest tests, and the production build succeeds.

Automated in browsers (`npm run e2e`; last run on macOS 14 with Chromium 149, Firefox 151 and WebKit 26.5, Node 26.7): all 15 tests pass. Every determinism case is byte-identical to Node in all three engines. The journeys pass: complete run (score 227), failed run, Retry with R, Stats local-only mode, and submit → ✓ VERIFIED · RANK 1.

Manually verified in a Chromium browser:
- Keyboard and on-screen thrust.
- Pause/resume.
- Local persistence across reloads; Stats local-only mode.
- Online empty state, submit with callsign → verified rank 1, retrieval, persistence across a server restart.
- Phone portrait (rotated field, drag aim, touch thrust) and phone landscape layouts.

## Limitations and next steps

1. **Cross-engine determinism is tested, not proven.** `npm run e2e` shows that 44 runs (every reference solution plus burst-heavy live runs) are bit-identical in Chromium, Firefox, WebKit and Node, on one machine (macOS 14, Apple silicon). It doesn't cover other CPUs, mobile Safari or Chrome on Android, or older engine versions. Any change to the physics code could still use an operation that differs between engines, and only a new case in `e2e/determinism/cases.ts` would catch it.
2. **The browser E2E suite isn't wired into CI yet.** The repository has no CI configuration. A CI job would need `npx playwright install --with-deps chromium firefox webkit`, then `npm run e2e`. Pause/resume, thrust controls, touch and phone layouts, and persistence across a server restart are still checked only by hand.
3. **The server is single-process.** Rate limits are in memory, and the board query ranks the whole stage on each read. That's fine for an MVP; for scale, add per-stage cached boards and shared rate limiting.
4. **Losing localStorage loses the guest identity.** There's no account recovery or callsign change.
5. **Stages 04–06 and the daily templates were validated by the solver but have had little human playtesting.** Tune difficulty and pars with real play data.
6. **No ghost/replay viewer yet.** Verified input logs are stored server-side, so it can be added.
