// World ↔ screen mapping for the playfield canvas.
//
// Landscape containers show the 1150 × 720 wu field as-is. Tall (portrait)
// containers show the same field rotated a quarter turn so it fills a phone
// screen: world +x points up the screen. One world per stage keeps rankings
// comparable across devices.
import { PHYSICS } from '../game/constants.ts';
import type { BurstDir } from '../game/types.ts';

export type View = {
  /** CSS-pixel size of the container. */
  cw: number; ch: number;
  dpr: number;
  rotated: boolean;
  /** CSS px per world unit. */
  scale: number;
  ox: number; oy: number;
};

const W = PHYSICS.field.w;
const H = PHYSICS.field.h;

export function computeView(cw: number, ch: number, dpr: number): View {
  const rotated = ch > cw * 1.05;
  const ew = rotated ? H : W;
  const eh = rotated ? W : H;
  const scale = Math.max(0.01, Math.min(cw / ew, ch / eh));
  return { cw, ch, dpr, rotated, scale, ox: (cw - ew * scale) / 2, oy: (ch - eh * scale) / 2 };
}

/** Canvas transform (device pixels) for drawing in world units. */
export function worldTransform(v: View): [number, number, number, number, number, number] {
  const s = v.scale * v.dpr;
  return v.rotated
    ? [0, -s, s, 0, v.ox * v.dpr, (v.oy + W * v.scale) * v.dpr]
    : [s, 0, 0, s, v.ox * v.dpr, v.oy * v.dpr];
}

/** World point → CSS px inside the container. */
export function toScreen(v: View, x: number, y: number): { x: number; y: number } {
  return v.rotated
    ? { x: v.ox + y * v.scale, y: v.oy + (W - x) * v.scale }
    : { x: v.ox + x * v.scale, y: v.oy + y * v.scale };
}

/** CSS px inside the container → world point. */
export function toWorld(v: View, sx: number, sy: number): { x: number; y: number } {
  return v.rotated
    ? { x: W - (sy - v.oy) / v.scale, y: (sx - v.ox) / v.scale }
    : { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
}

/**
 * On-screen thrust buttons are screen-relative (↑ means up the screen). In the
 * rotated view, screen up is world right, and so on around the compass.
 */
export function screenDirToWorld(v: View, dir: BurstDir): BurstDir {
  return v.rotated ? (((dir + 1) % 4) as BurstDir) : dir;
}

/** Screen-relative rotation in tenths of a degree (for drawing labels/arrows). */
export function viewRotationTenths(v: View): number {
  return v.rotated ? 900 : 0;
}
