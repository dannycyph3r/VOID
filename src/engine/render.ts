// Procedural vector rendering of the playfield (handoff: docs/04 "World assets").
// Static layers (field, gravity rings, bodies, hazards) are drawn once per
// stage/size/DPR into an offscreen cache; dynamic layers are drawn per frame.
import { theme } from '../../VOID-Design-Handoff/tokens/game.config.ts';
import { PHYSICS } from '../game/constants.ts';
import { gateOpen, gateOpenRemaining } from '../game/sim.ts';
import type { StageDef } from '../game/types.ts';
import { toScreen, worldTransform, type View } from './view.ts';

const W = PHYSICS.field.w;
const H = PHYSICS.field.h;
const TAU = Math.PI * 2;
const MINT = theme.flare;
const LABEL_FONT = `400 13px "${theme.font.ui}", ui-monospace, Menlo, monospace`;

type Ctx = CanvasRenderingContext2D;

function setWorld(ctx: Ctx, v: View) {
  ctx.setTransform(...worldTransform(v));
}
function setScreen(ctx: Ctx, v: View) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
}
/** Line width in screen px while drawing in world units. */
const px = (v: View, n: number) => n / v.scale;

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function label(ctx: Ctx, v: View, text: string, wx: number, wy: number, color: string, align: CanvasTextAlign = 'center') {
  const p = toScreen(v, wx, wy);
  setScreen(ctx, v);
  ctx.font = LABEL_FONT;
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = '1.6px';
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x, p.y);
  setWorld(ctx, v);
}

/** Radii where a body's pull equals fixed levels: equal-pull rings. */
export function gravityRingRadii(gm: number, bodyR: number): number[] {
  return [16, 8, 4, 2].map((a) => Math.sqrt(gm / a)).filter((r) => r > bodyR + 14 && r < 340);
}

// ---------------------------------------------------------------- static layer

export function drawStatic(ctx: Ctx, v: View, stage: StageDef) {
  setScreen(ctx, v);
  ctx.clearRect(0, 0, v.cw, v.ch);
  setWorld(ctx, v);

  // L0 field
  ctx.fillStyle = theme.voidDeep;
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  for (let x = 50; x < W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 50; y < H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.strokeStyle = 'rgba(232,228,216,.04)';
  ctx.lineWidth = px(v, 1);
  ctx.stroke();
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const l = x % 50 === 0 ? 10 : 4;
    ctx.moveTo(x, 0); ctx.lineTo(x, l); ctx.moveTo(x, H); ctx.lineTo(x, H - l);
  }
  for (let y = 0; y <= H; y += 10) {
    const l = y % 50 === 0 ? 10 : 4;
    ctx.moveTo(0, y); ctx.lineTo(l, y); ctx.moveTo(W, y); ctx.lineTo(W - l, y);
  }
  ctx.strokeStyle = 'rgba(232,228,216,.28)';
  ctx.stroke();

  // L1 gravity rings — dotted, tighter and brighter toward the body
  const alphas = [0.62, 0.48, 0.36, 0.26];
  for (const p of stage.planets) {
    gravityRingRadii(p.gm, p.r).forEach((r, i) => {
      circle(ctx, p.x, p.y, r);
      ctx.setLineDash([px(v, 1), px(v, 3 + i)]);
      ctx.strokeStyle = `rgba(138,136,128,${alphas[i]})`;
      ctx.lineWidth = px(v, 1);
      ctx.stroke();
    });
  }
  ctx.setLineDash([]);

  // L2 hazards — singularities
  for (const h of stage.singularities) {
    circle(ctx, h.x, h.y, h.pull);
    ctx.setLineDash([px(v, 2), px(v, 6)]);
    ctx.strokeStyle = 'rgba(217,96,76,.55)';
    ctx.lineWidth = px(v, 1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let j = 0; j < 36; j++) {
      const a = (j * TAU) / 36;
      const c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(h.x + c * (h.horizon - 6), h.y + s * (h.horizon - 6));
      ctx.lineTo(h.x + c * (h.horizon + 6), h.y + s * (h.horizon + 6));
    }
    ctx.strokeStyle = theme.alarm;
    ctx.lineWidth = px(v, 1.4);
    ctx.stroke();
    circle(ctx, h.x, h.y, h.r + 8);
    ctx.strokeStyle = 'rgba(232,228,216,.4)';
    ctx.lineWidth = px(v, 1);
    ctx.stroke();
    circle(ctx, h.x, h.y, h.r);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.strokeStyle = theme.starlight;
    ctx.stroke();
  }

  // L3 bodies — starlight disc with a void eclipse, optional ring
  for (const p of stage.planets) {
    circle(ctx, p.x, p.y, p.r);
    ctx.fillStyle = theme.starlight;
    ctx.fill();
    ctx.save();
    circle(ctx, p.x, p.y, p.r);
    ctx.clip();
    ctx.globalAlpha = 0.88;
    circle(ctx, p.x + p.r * 0.35, p.y - p.r * 0.19, p.r * 0.94);
    ctx.fillStyle = theme.voidDeep;
    ctx.fill();
    ctx.restore();
    circle(ctx, p.x, p.y, p.r);
    ctx.strokeStyle = theme.starlight;
    ctx.lineWidth = px(v, 1);
    ctx.stroke();
    if (p.ring) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.7, p.r * 0.45, (-18 * Math.PI) / 180, 0, TAU);
      ctx.stroke();
    }
  }

  // Launch pad bracket
  const { x, y } = stage.pad;
  ctx.beginPath();
  ctx.moveTo(x - 20, y + 16); ctx.lineTo(x + 20, y + 16);
  ctx.moveTo(x - 20, y + 16); ctx.lineTo(x - 20, y + 2);
  ctx.moveTo(x + 20, y + 16); ctx.lineTo(x + 20, y + 2);
  ctx.strokeStyle = theme.starlight;
  ctx.lineWidth = px(v, 1);
  ctx.stroke();

  // L6 static labels
  for (const h of stage.singularities) label(ctx, v, 'SINGULARITY', h.x, h.y + h.pull + 16, theme.alarm);
}

// --------------------------------------------------------------- dynamic layer

export type FrameState = {
  now: number;            // ms, for ambient animation
  reduced: boolean;
  tick: number;           // simulation tick (gate cycles)
  gatesCleared: boolean[];
  predicted: number[];
  flown: number[];
  probe: { x: number; y: number };
  inFlight: boolean;
  /** World-space unit thrust vector of the burst in progress, or null. */
  thrust: { x: number; y: number } | null;
  aim: { angle: number; power: number } | null;
  ended: { status: 'complete' | 'failed'; at: number } | null;
};

function polyline(ctx: Ctx, pts: number[], from = 0) {
  ctx.beginPath();
  ctx.moveTo(pts[from], pts[from + 1]);
  for (let i = from + 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
}

export function drawFrame(ctx: Ctx, v: View, stage: StageDef, cache: HTMLCanvasElement | null, f: FrameState) {
  setScreen(ctx, v);
  ctx.clearRect(0, 0, v.cw, v.ch);
  if (cache) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache, 0, 0);
  }
  setWorld(ctx, v);
  ctx.lineCap = 'butt';

  // L3 gates
  stage.gates.forEach((g, i) => {
    const open = gateOpen(g, f.tick);
    const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2);
    ctx.setLineDash(open ? [px(v, 3), px(v, 4)] : []);
    ctx.strokeStyle = open ? theme.starlight : theme.telemetry;
    ctx.lineWidth = px(v, open ? 1 : 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const [x, y] of [[g.x1, g.y1], [g.x2, g.y2]]) {
      ctx.moveTo(x - nx * 9, y - ny * 9);
      ctx.lineTo(x + nx * 9, y + ny * 9);
    }
    ctx.strokeStyle = theme.starlight;
    ctx.lineWidth = px(v, 2.5);
    ctx.stroke();

    // Cycle bar (screen space, 56 × 3 px) above the gate: how long it stays open.
    const top = Math.min(g.y1, g.y2);
    const c = toScreen(v, (g.x1 + g.x2) / 2, top - 26);
    setScreen(ctx, v);
    ctx.fillStyle = 'rgba(232,228,216,.16)';
    ctx.fillRect(c.x - 28, c.y + 8, 56, 3);
    ctx.fillStyle = theme.starlight;
    ctx.fillRect(c.x - 28, c.y + 8, 56 * gateOpenRemaining(g, f.tick), 3);
    setWorld(ctx, v);
    label(ctx, v, f.gatesCleared[i] ? 'GATE ✓' : 'GATE', (g.x1 + g.x2) / 2, top - 30, theme.starlightDim);
  });

  // Beacon — the only mint body in the world
  const b = stage.beacon;
  ctx.strokeStyle = MINT;
  ctx.fillStyle = MINT;
  ctx.lineWidth = px(v, 1);
  if (f.reduced) {
    ctx.globalAlpha = 0.45;
    circle(ctx, b.x, b.y, 26);
    ctx.stroke();
  } else {
    const t = (f.now % 2400) / 2400;
    const e = 1 - Math.pow(1 - t, 3);
    ctx.globalAlpha = 0.6 * (1 - t);
    circle(ctx, b.x, b.y, 26 * (0.7 + e));
    ctx.stroke();
  }
  ctx.globalAlpha = 0.65;
  circle(ctx, b.x, b.y, 18);
  ctx.stroke();
  ctx.globalAlpha = 1;
  circle(ctx, b.x, b.y, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(b.x - 30, b.y); ctx.lineTo(b.x - 12, b.y);
  ctx.moveTo(b.x + 12, b.y); ctx.lineTo(b.x + 30, b.y);
  ctx.moveTo(b.x, b.y - 30); ctx.lineTo(b.x, b.y - 12);
  ctx.moveTo(b.x, b.y + 12); ctx.lineTo(b.x, b.y + 30);
  ctx.stroke();

  // L4 trajectory: predicted (dashed), then flown (solid)
  if (f.predicted.length >= 4) {
    polyline(ctx, f.predicted);
    ctx.setLineDash([px(v, 6), px(v, 8)]);
    ctx.lineDashOffset = f.reduced ? 0 : px(v, -((f.now / 2400) * 56) % 56);
    ctx.strokeStyle = MINT;
    ctx.globalAlpha = f.inFlight ? 0.75 : 1;
    ctx.lineWidth = px(v, 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
  }
  if (f.flown.length >= 4) {
    polyline(ctx, f.flown);
    ctx.lineTo(f.probe.x, f.probe.y);
    ctx.strokeStyle = MINT;
    ctx.lineWidth = px(v, 1.8);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Aim arrow, arc and readout
  if (f.aim) {
    const a = (f.aim.angle / 10) * (Math.PI / 180);
    const len = 50 + f.aim.power * 1.5;
    const { x, y } = stage.pad;
    const ex = x + len * Math.cos(a), ey = y - len * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(ex, ey);
    ctx.moveTo(ex - 10 * Math.cos(a - 0.4), ey + 10 * Math.sin(a - 0.4));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - 10 * Math.cos(a + 0.4), ey + 10 * Math.sin(a + 0.4));
    ctx.strokeStyle = theme.starlight;
    ctx.lineWidth = px(v, 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 50, 0, -a, a > 0);
    ctx.strokeStyle = 'rgba(232,228,216,.4)';
    ctx.lineWidth = px(v, 1);
    ctx.stroke();
    const lx = ex + 16 * Math.cos(a) + 10, ly = ey - 16 * Math.sin(a) - 10;
    label(ctx, v, `${(f.aim.angle / 10).toFixed(1)}° · ${f.aim.power}%`, lx, ly, theme.starlight, 'left');
  }

  // L5 probe, halo and thrust plume
  const p = f.probe;
  if (f.inFlight) {
    ctx.globalAlpha = 0.55;
    circle(ctx, p.x, p.y, 16);
    ctx.strokeStyle = MINT;
    ctx.lineWidth = px(v, 1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (f.thrust) {
    const flick = f.reduced || Math.floor(f.now / 60) % 2 === 0;
    const tx = -f.thrust.x, ty = -f.thrust.y; // plume points away from thrust
    const nx = -ty, ny = tx;
    ctx.globalAlpha = flick ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(p.x + tx * 14, p.y + ty * 14); ctx.lineTo(p.x + tx * 44, p.y + ty * 44);
    ctx.moveTo(p.x + tx * 13 + nx * 6, p.y + ty * 13 + ny * 6); ctx.lineTo(p.x + tx * 35 + nx * 13, p.y + ty * 35 + ny * 13);
    ctx.moveTo(p.x + tx * 13 - nx * 6, p.y + ty * 13 - ny * 6); ctx.lineTo(p.x + tx * 35 - nx * 13, p.y + ty * 35 - ny * 13);
    ctx.strokeStyle = theme.starlight;
    ctx.lineWidth = px(v, 1.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = theme.starlight;
  ctx.fillRect(-6, -6, 12, 12);
  ctx.restore();

  // Arrival / failure feedback
  if (f.ended) {
    const t = Math.min(1, (f.now - f.ended.at) / 900);
    if (f.ended.status === 'complete') {
      if (!f.reduced) {
        ctx.globalAlpha = 0.9 * (1 - t);
        circle(ctx, b.x, b.y, 20 + 70 * (1 - Math.pow(1 - t, 3)));
        ctx.strokeStyle = MINT;
        ctx.lineWidth = px(v, 1.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(p.x - 12, p.y - 12); ctx.lineTo(p.x + 12, p.y + 12);
      ctx.moveTo(p.x + 12, p.y - 12); ctx.lineTo(p.x - 12, p.y + 12);
      ctx.strokeStyle = theme.alarm;
      ctx.lineWidth = px(v, 2);
      ctx.stroke();
    }
  }
}
