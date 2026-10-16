# 03 · Components (React inventory)

| Component | Key props | States | Used in |
| --- | --- | --- | --- |
| `Screen` | `crt`, `signalOnEnter` | live · still (reduced motion) | All |
| `CrtOverlay` | `strength` (.18 menus / .12 flight), `vignette` | — | All |
| `Wordmark` | `name` (from `game.name`) | — | Home |
| `OrbitalHero` | `reducedMotion` | animated · still | Home |
| `MenuRow` | `label`, `meta`, `href`, `active` | rest · hover · focus · active | Home |
| `SettingsPopover` | `sound`, `reducedMotion` | open · closed | Home |
| `Button` | `variant: primary \| secondary \| icon`, `keycap` | default · hover · focus · pressed · disabled | All |
| `KeyCap` | `label` | — | Buttons |
| `DailyRow` | `date`, `name`, `resetsAt` | rest · selected | Stages |
| `StageList` / `StageRow` | `stage`, `selected` | rest · selected · cleared · new · locked | Stages |
| `StageDiagram` | `bodies[]`, `path` | — | Stages |
| `FlightScreen` | `stageId`, `seed` | aim · flight · paused · ended | Flight |
| `Playfield` | `engine`, `onTelemetry`, `onOutcome` | mounting · ready · error | Flight |
| `Hud` | `time`, `fuel`, `spent`, `gates` | normal · low-fuel | Flight |
| `FuelGauge` | `value`, `max`, `segments=20` | normal · low · empty | Flight |
| `AimControls` | `angle`, `power` | enabled | Flight |
| `ThrustPad` | `layout: row \| cross`, `firing` | idle · firing · disabled | Flight |
| `PauseDialog` | `onResume`, `onRestart`, `onExit` | open (focus trapped, Esc resumes) | Flight |
| `ResultScreen` | `status`, `time`, `fuel`, `score` | complete · failed | Result |
| `StatusTag` | `kind: complete \| failed`, `label` | — | Result |
| `FlightTrace` | `path`, `end` | complete · failed | Result |
| `Tabs` | `tabs`, `value` | selected · focus | Stats |
| `RankTable` | `rows`, `pinned` | default · you | Stats |
| `PersonalPanel` | `totals`, `bests`, `recent` | — | Stats |
| `DataState` | `kind: sample \| loading \| empty \| unavailable` | — | Stats, any remote list |
| `HelpSection` | `n`, `title`, `diagram` | — | How to Play |
| `ControlTable` / `TermList` | `rows` | — | How to Play |

## Key component specs

**Primary button** — mint fill `#82E6D0`, void text, 13px Plex 600, +0.18em, height 50–56px (120px phone Launch). Hover `#A6EEDD`, pressed `#66C9B3` + 1px drop, focus 2px mint outline 3px offset. One per screen: Launch, Retry, Resume.

**Secondary button** — transparent, 1px `hairStrong` border, starlight text.

**Disabled** — dashed `hairStrong` border, telemetry text, label states the reason (e.g. `CLEAR 03`).

**Menu row** — 56–64px, Barlow 30–34px uppercase. Active: mint text + ▸. Hover: mint text.

**Tabs** — 12px Plex uppercase; selected = mint text + 2px mint underline.

**Toggle** — `button[aria-pressed]`, 8px square indicator; ON = mint filled, OFF = outline telemetry.

**Selection (rows, segments)** — `voidRaised` background + mint marker. No left-border accents, no rounded cards.
