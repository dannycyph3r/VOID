# 04 · Engine and build

Inside the playfield frame: rendered by a dedicated 2D engine. Outside it: React DOM.

## World assets

No bitmaps. Every world element is procedural vector drawn from theme tokens and cached per device-pixel-ratio at stage load. Sizes in world units (wu) on a 1150 × 720 field (360 × 470 portrait variant on phones); strokes in screen px.

| Element | Spec |
| --- | --- |
| Probe | 14 wu square rotated 45°, starlight. Mint halo r 20 at 55% in flight |
| Planet | Starlight disc + voidDeep eclipse offset toward light; optional 1px ring; r 18 / 40 / 62 wu |
| Gravity rings | Dotted telemetry rings at equal pull, tighter and brighter toward the body |
| Singularity | Black disc, starlight rim; event horizon drawn as alarm radial teeth; pull radius dashed alarm 55% |
| Gate | 2.5px posts, dashed span. Open = dashed starlight, closed = solid telemetry. Cycle bar above (56 × 3) |
| Beacon | Mint core r 6, rings r 18/26, crosshair, one slow pulse (2.4s). Only mint body in the world |
| Trajectory | Flown: solid mint 1.8px. Predicted: dashed 6/8 at 1.5px, ~3s ahead |
| Thrust | Three starlight strokes opposite the thrust direction, 0.28s, 2-step flicker |
| Field | voidDeep, 50 wu grid at 4%, edge rulers every 10 wu (long tick every 50). No star field |

## Layer stack

| Z | Layer |
| --- | --- |
| L0 | Field (ground, grid, rulers) |
| L1 | Gravity rings |
| L2 | Hazards |
| L3 | Bodies, gates |
| L4 | Trajectory (predicted, then flown) |
| L5 | Probe, thrust |
| L6 | World labels (13px screen size): SINGULARITY, GATE, aim readout only |
| DOM | HUD, controls, overlays, CRT layers |

## Engine contract

- Mount into `[data-engine-canvas="playfield"]`.
- Engine → UI: `onTelemetry({ t, fuel, spent, phase, gates })` at 10 Hz; `onEvent(type)` for launch, gate cleared, low fuel; `onOutcome({ status, time, fuel, score, cause })`.
- UI → engine: `aim(angle, power)`, `launch()`, `burst(dir)`, `pause()`, `resume()`, `restart()`, `setReducedMotion(bool)`.
- Fixed-step physics at 120 Hz with render interpolation → deterministic scores, verifiable replays.

## Scoring, daily, ranking

- **Debt Score** = round(seconds × 10 + fuel units × 25). Lower is better. Failed runs record no score. Each stage has a par.
- Burst: 0.28s, 2.4 u.
- Daily: seed = UTC date `YYYYMMDD` → deterministic stage generator shipped with the client. Same stage for everyone 00:00–24:00 UTC; best run of the day is ranked.
- Ranking: a REST endpoint accepts `{ stage, seed, inputs[], score }`, re-simulates the input log server-side and stores verified results. No realtime/multiplayer infrastructure.

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `dur.instant` | 80ms | Press, thrust key flash |
| `dur.quick` | 160ms | Hover, row highlight |
| `dur.signal` | 320–700ms | Stepped entry: screens, pause, result |
| `dur.ring` | 1400ms × 1 | Beacon ring on complete |
| `ease.settle` | `cubic-bezier(.2,.7,.2,1)` | Hover, ring |
| `ease.signal` | `steps(5–9)` | Signal instability |
| `ambient.orbit` | 34–96s linear | Home only |
| `ambient.flow` | 2.4–3.2s linear | Predicted path dashes |

## Accessibility

- Focus: 2px mint outline, 3px offset, `:focus-visible` only.
- Game keys bind only while the playfield has focus; every key has an on-screen button.
- Polite live region announces launch, gate cleared, low fuel, complete, failed — never per-tick values.
- Not color alone: solid vs dashed paths, toothed horizons, ✓/✕, FUEL LOW label.
- Auto-pause on tab hide, window blur and orientation change. Pause is a focus-trapped dialog.
- Reduced motion (system or Settings): no ambient motion, no signal effects. Physics unchanged.

## Responsive

| Width | Menus | Flight |
| --- | --- | --- |
| ≥ 1200 | Two columns | Playfield + right HUD rail, control bar below |
| 768–1199 | Columns stack | HUD becomes a strip above the playfield; touch controls bottom |
| < 768 portrait | Wordmark top, menu at thumb height | 3-cell HUD, portrait stage, 56px thrust cross, 120px Launch |
| Phone landscape | As portrait | Thrust cross on left edge, Launch and Pause on right edge, HUD in top margin |

## Keyboard / touch

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Aim angle | ← → / A D | Drag from probe | Drag from probe |
| Aim power | ↑ ↓ / W S | Drag length | Drag length |
| Launch | Space | Launch button | Launch button |
| Thrust (flight) | Arrows / WASD | Thrust buttons | Thrust pad, hold to repeat |
| Pause | Esc / P | Pause button | Pause button |
| Restart | R | Restart button | Restart button |
