# 02 · Screens and information architecture

```
Home ─┬─ Stages ──► Flight ──► Result (complete | failed) ─┬─ Retry ► Flight
      │                │                                     └─ Stages
      ├─ Daily ────────┘ (Pause ► Resume · Restart · Stages · How to Play)
      ├─ Stats (Leaderboard · Daily · Personal)
      ├─ How to Play
      └─ Settings (icon)
```

Principles: one heading per screen, short labels, no subtitles or explanatory copy outside How to Play. Personal bests and rankings appear **only** in Stats.

## 01 Home
- Header: live UTC clock (left), Settings icon (right).
- Wordmark `game.name`, mint underline tick, `NAV-01 _` marker.
- Menu rows: **Stages** (active, mint, ▸, count 6) · **Daily** (reset countdown) · **Stats** · **How to Play**.
- Orbital composition (decorative, `aria-hidden`): dial ring with 000/090/180/270, gravity rings, eclipsed planet, two orbiting bodies, mint trajectory to beacon, singularity with alarm teeth.
- Settings popover: Sound ON/OFF, Reduced motion ON/OFF.

## 02 Stages
- Heading "Stages".
- Daily row: `DAILY · 15 OCT`, course name, reset countdown. Selectable.
- Stage list rows: number, name, mechanic tag, 5 difficulty pips, status (`✓` cleared, `NEW`, `LOCK`).
- Stages: 01 First Light (WELL) · 02 Slingshot (ASSIST) · 03 Narrows (GATES) · 04 Singularity (BLACK HOLE) · 05 Binary (TWIN WELLS) · 06 Deep Field (ALL).
- Preview: `STAGE 02` label, name, coordinates, diagram, FUEL / PAR / DIFF, **Launch** (mint) or disabled `CLEAR 03` when locked.

## 03 Flight
- Header: Pause icon · `STAGE 02  SLINGSHOT` · Restart icon.
- Playfield (engine canvas, `data-engine-canvas="playfield"`). World labels only: SINGULARITY, GATE, aim readout.
- HUD rail: TIME (mint, glow), FUEL (20-segment gauge, value, SPENT), objective (GATE □, BEACON ○). Low fuel (< 20): gauge + label turn alarm, label reads `FUEL LOW`.
- Control bar: phase indicator AIM / FLIGHT; in aim: angle ←/→, power ↓/↑, **Launch** (Space); in flight: four thruster keys (fired key flashes mint).
- Pause dialog: PAUSED + time, **Resume**, Restart, Stages, Sound, Reduced motion, link to How to Play.
- Prototype-only: dashed `PROTO · ARRIVE / LOSE` chip.

## 04 Result
Answers: did I complete it, how did it score, what next.
- Status tag: `■ COMPLETE · STAGE 02` (mint) or `✕ FAILED · SINGULARITY` (alarm).
- Stage name heading.
- SCORE (large, mint; `—` when failed).
- TIME and FUEL.
- **Retry** (R) · Stages.
- Quiet flight trace; on complete, one mint ring expands from the beacon once.
- Not on this screen: breakdown, rankings, personal best, submit prompts.

## 05 Stats
- Tabs: **Leaderboard** (stage picker 01–06, pinned "YOU" row with Submit) · **Daily** (closes countdown) · **Personal** (Runs, Cleared, Flight time, Fuel totals; Personal Best per stage; Recent runs with ✓/✕).
- Data states (required for every remote list): `SAMPLE DATA · NOT LIVE` tag, loading skeleton, empty ("No runs yet" + action), unavailable ("No signal", runs saved on device, Retry).

## 06 How to Play
Section index, then: 01 Aim and launch · 02 Gravity · 03 Thrusters and fuel · 04 Gates and beacon · 05 Singularities · 06 Debt Score (formula + worked example) · 07 Controls (keyboard / mouse / touch table) · 08 Daily and ranked runs · 09 Terms (Trajectory, Gravity assist, Thruster, Burst, Gate, Beacon, Singularity, Event horizon, Debt Score, Par).

## Phone (390 × 844)
- 01m Home: wordmark top, small orbital, menu at thumb height.
- 03m Flight: 3-cell HUD, portrait stage, 56px thrust cross, 120px Launch, full-screen pause.
- 04m Result: single column, Retry (60px) and Stages at the bottom.
