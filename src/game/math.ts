// Deterministic math for the simulation.
//
// The simulation must produce bit-identical results in every browser and on the
// server, because ranked runs are verified by re-simulating the input log.
// IEEE-754 guarantees +, -, *, / and sqrt, but Math.sin / Math.cos / Math.pow are
// implementation-defined and differ between JS engines. Everything the physics
// needs is therefore built from the guaranteed operations only.

const PI = 3.141592653589793;
const TENTH_DEG_TO_RAD = PI / 1800;

/** sin and cos on |x| <= pi/4 using fixed-order Taylor polynomials (error < 1e-16). */
function sinSmall(x: number): number {
  const x2 = x * x;
  return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156 * (1 - x2 / 210)))))));
}
function cosSmall(x: number): number {
  const x2 = x * x;
  return 1 - x2 / 2 * (1 - x2 / 12 * (1 - x2 / 30 * (1 - x2 / 56 * (1 - x2 / 90 * (1 - x2 / 132 * (1 - x2 / 182 * (1 - x2 / 240)))))));
}

/**
 * Unit vector for an angle given in integer tenths of a degree, measured
 * counter-clockwise from +x with screen-up positive. Returns world components
 * (world y grows downward, so the y component is negated).
 */
export function dirFromTenths(tenths: number): { x: number; y: number } {
  // Quadrant reduction happens on integers, so it is exact.
  let n = Math.trunc(tenths) % 3600;
  if (n < 0) n += 3600;
  const octant = Math.floor((n + 450) / 900); // 0..4
  const q = octant % 4;
  const r = (n - octant * 900) * TENTH_DEG_TO_RAD; // in [-pi/4, pi/4)
  const s = sinSmall(r);
  const c = cosSmall(r);
  let cos: number, sin: number;
  switch (q) {
    case 0: cos = c; sin = s; break;
    case 1: cos = -s; sin = c; break;
    case 2: cos = -c; sin = -s; break;
    default: cos = s; sin = -c; break;
  }
  return { x: cos, y: -sin };
}

/** Cubic smoothstep, 0 at e0 and 1 at e1. */
export function smoothstep(e0: number, e1: number, v: number): number {
  const t = v <= e0 ? 0 : v >= e1 ? 1 : (v - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
}

/**
 * True when the motion segment p1→p2 crosses the line segment q1→q2.
 * A point lying exactly on the line counts as the non-positive side, so a
 * probe that stops on the line is counted once, never twice.
 */
export function segmentsCross(
  p1x: number, p1y: number, p2x: number, p2y: number,
  q1x: number, q1y: number, q2x: number, q2y: number,
): boolean {
  const d1 = (q2x - q1x) * (p1y - q1y) - (q2y - q1y) * (p1x - q1x);
  const d2 = (q2x - q1x) * (p2y - q1y) - (q2y - q1y) * (p2x - q1x);
  if ((d1 > 0) === (d2 > 0)) return false;
  const d3 = (p2x - p1x) * (q1y - p1y) - (p2y - p1y) * (q1x - p1x);
  const d4 = (p2x - p1x) * (q2y - p1y) - (p2y - p1y) * (q2x - p1x);
  return d3 * d4 <= 0;
}

/** Small deterministic PRNG (mulberry32) for seeded choices. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
