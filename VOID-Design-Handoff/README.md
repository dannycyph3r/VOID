# VOID — Design Handoff

Design handoff for **VOID**, a minimal analog sci‑fi physics arcade game. Players launch a probe through a small universe, using planetary gravity and limited thruster bursts to reach a beacon as fast and fuel‑efficiently as possible.

- **Version:** v0.2 (VOID refinement pass)
- **Live design canvas:** https://claude.ai/artifact/JXipJKg8aScAyr3aDGu4TE (private — share from the canvas's Share menu)
- **Product name:** lives only in `tokens/game.config.ts` → `game.name`. Never hard‑code it in components.

## Folder contents

| Path | What it is |
| --- | --- |
| `docs/01-design-system.md` | Color, type, spacing, lines, analog/CRT treatment |
| `docs/02-screens.md` | Information architecture, every screen, its content and states |
| `docs/03-components.md` | React component inventory with props and states |
| `docs/04-engine-and-build.md` | Playfield/engine contract, world assets, motion, accessibility, responsive rules, scoring |
| `tokens/tokens.json` | Design tokens (source of truth) |
| `tokens/tokens.css` | Same tokens as CSS custom properties + CRT utility classes |
| `tokens/game.config.ts` | Name, scoring constants and theme object for the app |
| `source/*.dc.html` | Prototype source for each artboard (Design‑canvas component format) |
| `source/canvas.json` | Artboard index and layout |

## Screens (prototype)

| Artboard | File |
| --- | --- |
| 01 Home | `source/Main.dc.html` |
| 02 Stages | `source/Missions.dc.html` |
| 03 Flight | `source/Play.dc.html` |
| 04 Result — complete | `source/Result.dc.html` |
| 04b Result — failed | `source/ResultFail.dc.html` |
| 05 Stats | `source/Leaderboard.dc.html` |
| 06 How to Play | `source/HowTo.dc.html` |
| 01m / 03m / 04m Phone | `source/HomeMobile.dc.html`, `source/PlayMobile.dc.html`, `source/ResultMobile.dc.html` |
| H1 Design system | `source/System.dc.html` |
| H2 Engine & build | `source/Handoff.dc.html` |

> The `.dc.html` files need the canvas runtime (`support.js`) to render; open them on the live canvas. Treat them as reference markup — layout, copy, inline styles and state logic — not production code.

## Important

- The prototype **fakes the simulation** (fixed paths, ticking clock, "PROTO · ARRIVE / LOSE" shortcuts). The real game runs on a dedicated 2D engine — see `docs/04-engine-and-build.md`.
- All leaderboard names and numbers in the prototype are **sample data** and are labelled as such.
- Personal bests and rankings live **only** in Stats. Explanations live **only** in How to Play.
