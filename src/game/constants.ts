// Simulation and gameplay tuning. Product name, score weights and burst
// cost/duration come from the handoff's game.config.ts (single source of truth);
// everything here is derived from it or is engine-only tuning.
import { game } from '../../VOID-Design-Handoff/tokens/game.config.ts';

export { game };

/**
 * Bump whenever anything that changes simulation results changes (physics,
 * stage geometry, daily templates, scoring). Runs are only comparable — and
 * only verifiable — within one rules version.
 */
export const RULES_VERSION = 1;

const HZ = 120;

export const PHYSICS = {
  /** Fixed simulation rate. Rendering interpolates between steps. */
  hz: HZ,
  dt: 1 / HZ,
  /** Playfield size in world units (wu). */
  field: { w: 1150, h: 720 },
  /** Launch speed at 100% power, wu/s. */
  launchSpeedMax: 52,
  powerMin: 20,
  powerMax: 100,
  /** Thruster acceleration during a burst, wu/s². One burst ≈ 8.5 wu/s of Δv. */
  thrustAccel: 30,
  /** game.burst.duration (0.28 s) rounded to whole simulation steps. */
  burstTicks: Math.round(game.burst.duration * HZ),
  /** game.burst.cost in tenths of a fuel unit; fuel is integer tenths internally so totals are exact. */
  burstCostTenths: Math.round(game.burst.cost * 10),
  /** Gravity softening length, wu. Keeps acceleration finite near a body's centre. */
  softening: 6,
  /** Probe collision radius, wu (the drawn probe is a 14 wu diamond). */
  probeRadius: 6,
  /** How far past the field edge the probe may drift before the run is lost, wu. */
  boundsMargin: 70,
  /**
   * Predicted trajectory length, seconds. The handoff says "~3 s ahead" for a
   * faster prototype clock; at real flight speeds 6 s gives the same on-screen
   * length without revealing the whole route.
   */
  predictSeconds: 6,
  /** Low-fuel threshold, units (gauge and label turn alarm). */
  lowFuel: 20,
} as const;

/** Hard cap on recorded bursts in one run (also bounded by every tank size). */
export const MAX_BURSTS = 80;
