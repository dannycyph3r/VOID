import { describe, expect, it } from 'vitest';
import { computeView, screenDirToWorld, toScreen, toWorld } from './view.ts';

describe('playfield view', () => {
  it('fits the field in landscape without rotation', () => {
    const v = computeView(1150, 720, 1);
    expect(v.rotated).toBe(false);
    expect(v.scale).toBe(1);
    expect(toScreen(v, 100, 200)).toEqual({ x: 100, y: 200 });
  });

  it('rotates tall containers so world +x points up the screen', () => {
    const v = computeView(360, 575, 2);
    expect(v.rotated).toBe(true);
    const pad = toScreen(v, 100, 600); // bottom-left in world
    const beacon = toScreen(v, 1000, 100); // top-right in world
    expect(beacon.y).toBeLessThan(pad.y); // further along x is higher on screen
    expect(beacon.x).toBeLessThan(pad.x);
  });

  it('round-trips screen ↔ world in both orientations', () => {
    for (const v of [computeView(900, 500, 1), computeView(390, 700, 3)]) {
      const s = toScreen(v, 321, 123);
      const w = toWorld(v, s.x, s.y);
      expect(w.x).toBeCloseTo(321, 9);
      expect(w.y).toBeCloseTo(123, 9);
    }
  });

  it('maps screen thrust directions to world directions', () => {
    const land = computeView(1150, 720, 1);
    const port = computeView(360, 575, 1);
    expect([0, 1, 2, 3].map((d) => screenDirToWorld(land, d as 0))).toEqual([0, 1, 2, 3]);
    // Rotated: screen up = world right, screen right = world down, ...
    expect([0, 1, 2, 3].map((d) => screenDirToWorld(port, d as 0))).toEqual([1, 2, 3, 0]);
  });
});
