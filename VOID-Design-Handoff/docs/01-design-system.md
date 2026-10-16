# 01 · Design system

Analog industrial sci‑fi: near‑black surfaces, monospaced readouts, condensed display type, fine rules, one accent. Less interface, more immersion.

## Color

All values live in `tokens/tokens.json`. Contrast ratios are against **Void**.

| Token | Value | Role | Contrast |
| --- | --- | --- | --- |
| `void` | `#0E0F10` | App ground, UI panels | base |
| `voidDeep` | `#08090A` | Playfield ground — separates world from UI | — |
| `voidRaised` | `#18191B` | Selected rows, active segments | — |
| `starlight` | `#E8E4D8` | Text, bodies, probe, thrust | 15.1 : 1 |
| `starlightDim` | `#B9B5AA` | Body copy, secondary values | 9.3 : 1 |
| `telemetry` | `#8A8880` | Labels, units, inactive states | 5.4 : 1 |
| `flare` | `#82E6D0` | **The accent (mint).** Selection, primary action, trajectory, beacon, time, score | 12.9 : 1 |
| `flareHover` | `#A6EEDD` | Primary button hover | — |
| `flarePressed` | `#66C9B3` | Primary button pressed | — |
| `alarm` | `#D9604C` | Danger only: event horizon, low fuel, failure | 5.2 : 1 |
| `hair` | `rgba(232,228,216,.10)` | Rules, frames | — |
| `hairStrong` | `rgba(232,228,216,.24)` | Interactive outlines | — |

Rules
- Mint marks what matters *now*. Never body text, resting borders or headings.
- Alarm always travels with a shape (toothed ring, ✕, "FUEL LOW" label) so it reads without color.
- Primary button text on mint uses `void` (12.9 : 1).

## Typography

Two families.

| Family | Use |
| --- | --- |
| **Barlow Condensed** 500/600 | Wordmark, headings, stage names, menu rows, score. Uppercase, tracking +0.06–0.1em |
| **IBM Plex Mono** 400/500/600 | Telemetry, labels, buttons, body copy. Tabular figures always on |

Google Fonts: `https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap`

| Token | Spec |
| --- | --- |
| `display.mark` | Barlow 600 · clamp(120px, 15vw, 232px) / 0.8 · +0.06em |
| `display.score` | Barlow 500 · clamp(120px, 13vw, 184px) / 0.8 · mint + glow |
| `display.h1` | Barlow 600 · clamp(44px, 5vw, 64px) / 0.9 · +0.06em |
| `display.h2` | Barlow 600 · 32px · +0.08em |
| `display.menu` | Barlow 500 · 30–34px · +0.06em |
| `mono.readout` | Plex 500 · 38px HUD / 19px phone |
| `mono.value` | Plex 500 · 20–24px |
| `mono.body` | Plex 400 · 14–15px / 1.65 |
| `mono.label` | Plex 400 · 12px · uppercase · +0.12–0.18em |
| `mono.action` | Plex 600 · 13px · uppercase · +0.18em |

Floor: 12px anywhere; 13px for body copy on phones.

## Space, size, line

- Spacing: 4px base — 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96.
- Page gutter: `clamp(16px, 4vw, 56px)`.
- Header: 64px (48px phone).
- Hit targets: 44px min · 48px in game · 56px touch thrusters · 120px phone Launch.
- Radius: **0** everywhere. Only celestial bodies and beacons are round.
- Strokes: 1px hairline · 1.5px predicted path · 1.8px flown path · 2px focus.
- Technical marks: corner brackets, edge rulers, ▸ cursor, coordinates. One kind per surface.
- No shadows, no blur, no gradients except the vignette.

## Analog / CRT treatment

| Effect | Spec | Where |
| --- | --- | --- |
| Scanlines | `repeating-linear-gradient` 3px period, black 18% (menus) / 12% (flight) | Overlay layer over the whole screen, `pointer-events:none`, never inside the engine canvas |
| Vignette | radial, edges to 50% black | Menus and results only |
| Phosphor glow | `text-shadow: 0 0 10–22px rgba(130,230,208,.32–.35)` | Mint values only (time, score); wordmark uses starlight at 18% |
| Signal instability | stepped opacity + 1–3px x‑shift, `steps(5–9)`, 0.32–0.7s | Once on screen entry, pause and result. Never loops, never during flight |
| Cursor blink | 1.1s steps | Home `NAV-01 _` only |

Not allowed: chromatic aberration, warping, rolling bars, static, constant flicker.
Reduced motion removes all signal effects and ambient motion; scanlines and vignette stay (they don't move).
