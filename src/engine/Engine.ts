// Playfield engine: owns the canvas, the fixed-step loop and in-field pointer
// input. Implements the handoff's engine contract:
//   UI → engine: aim(angle, power), launch(), burst(dir), pause(), resume(), restart(), setReducedMotion(bool)
//   engine → UI: onTelemetry (10 Hz), onEvent, onOutcome
// Physics runs at a fixed 120 Hz independent of display refresh; rendering
// interpolates the probe between the last two steps.
import { PHYSICS } from '../game/constants.ts';
import { makeInputs } from '../game/replay.ts';
import { clampAim, cloneSim, createSim, launch, predictLaunch, predictPath, startBurst, step, type SimState } from '../game/sim.ts';
import type { BurstDir, Outcome, Phase, RunInputs, StageDef } from '../game/types.ts';
import { drawFrame, drawStatic } from './render.ts';
import { computeView, screenDirToWorld, toWorld, type View } from './view.ts';

export type Telemetry = {
  t: number;
  fuel: number;
  fuelMax: number;
  spent: number;
  phase: Phase;
  gates: boolean[];
  /** Screen-relative direction of the burst in progress, or -1. */
  firing: number;
  paused: boolean;
};

export type EngineEvent =
  | { type: 'launch' }
  | { type: 'burst' }
  | { type: 'gate'; index: number }
  | { type: 'lowFuel' }
  | { type: 'end'; outcome: Outcome }
  | { type: 'pause'; paused: boolean }
  | { type: 'restart' };

export type FlightResult = { outcome: Outcome; inputs: RunInputs; path: number[] };

export type EngineCallbacks = {
  onTelemetry(t: Telemetry): void;
  onEvent(e: EngineEvent): void;
  onOutcome(r: FlightResult): void;
  onAim(angle: number, power: number): void;
};

const THRUST = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const MAX_FRAME = 0.25; // s; longer gaps (tab switch, breakpoint) don't fast-forward the sim
const END_HOLD_MS = 900;

export class Engine {
  private readonly host: HTMLElement;
  private readonly stage: StageDef;
  private readonly seed: number;
  private readonly cb: EngineCallbacks;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cache: HTMLCanvasElement | null = null;
  private view: View;
  private readonly ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private acc = 0;

  private sim: SimState;
  private angle: number;
  private power: number;
  private paused = false;
  private reduced: boolean;
  private held: BurstDir[] = []; // world directions, most recent last
  /** Presses waiting to fire (one burst each), oldest first. */
  private taps: BurstDir[] = [];
  private flown: number[] = [];
  private predicted: number[] = [];
  private predictedAt = -1;
  private lowFuelSent = false;
  private endedAt = 0;
  private outcomeSent = false;
  private aiming = false;
  private destroyed = false;

  constructor(host: HTMLElement, stage: StageDef, seed: number, cb: EngineCallbacks, opts: { reducedMotion: boolean }) {
    this.host = host;
    this.stage = stage;
    this.seed = seed;
    this.cb = cb;
    this.reduced = opts.reducedMotion;
    this.sim = createSim(stage);
    this.angle = stage.aim.angle;
    this.power = stage.aim.power;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'playfield-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
    this.ctx = ctx;
    this.view = computeView(1, 1, 1);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.updatePrediction(true);
    this.emitTelemetry();
    this.cb.onAim(this.angle, this.power);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ UI → engine

  aim(angle: number, power: number): void {
    if (this.sim.phase !== 'aim') return;
    const a = clampAim(this.stage, angle, power);
    if (a.angle === this.angle && a.power === this.power) return;
    this.angle = a.angle;
    this.power = a.power;
    this.updatePrediction(true);
    this.cb.onAim(this.angle, this.power);
  }

  nudgeAim(dAngle: number, dPower: number): void {
    this.aim(this.angle + dAngle, this.power + dPower);
  }

  launch(): void {
    if (this.sim.phase !== 'aim' || this.paused) return;
    launch(this.sim, this.angle, this.power);
    this.flown = [this.sim.x, this.sim.y];
    this.acc = 0;
    this.predictedAt = -1;
    this.cb.onEvent({ type: 'launch' });
    this.emitTelemetry();
  }

  /** One burst in a screen-relative direction (0 up, 1 right, 2 down, 3 left). */
  burst(screenDir: BurstDir): void {
    if (this.sim.phase !== 'flight' || this.paused) return;
    this.queueTap(screenDirToWorld(this.view, screenDir));
  }

  /** Hold-to-repeat thrust: bursts fire back to back while held. */
  hold(screenDir: BurstDir, down: boolean): void {
    const d = screenDirToWorld(this.view, screenDir);
    this.held = this.held.filter((h) => h !== d);
    if (down && this.sim.phase === 'flight' && !this.paused) {
      this.held.push(d);
      // A press always fires one burst, even if released before the next step.
      this.queueTap(d);
    }
  }

  releaseAll(): void {
    this.held = [];
    this.taps = [];
  }

  private queueTap(d: BurstDir): void {
    if (this.taps.length < 4) this.taps.push(d);
  }

  pause(): void {
    if (this.paused || this.sim.phase !== 'flight') return;
    this.paused = true;
    this.releaseAll();
    this.cb.onEvent({ type: 'pause', paused: true });
    this.emitTelemetry();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
    this.acc = 0;
    this.cb.onEvent({ type: 'pause', paused: false });
    this.emitTelemetry();
  }

  restart(): void {
    this.sim = createSim(this.stage);
    this.paused = false;
    this.releaseAll();
    this.flown = [];
    this.acc = 0;
    this.lowFuelSent = false;
    this.outcomeSent = false;
    this.endedAt = 0;
    this.updatePrediction(true);
    this.cb.onEvent({ type: 'restart' });
    this.emitTelemetry();
  }

  setReducedMotion(on: boolean): void {
    this.reduced = on;
  }

  get phase(): Phase { return this.sim.phase; }
  get isPaused(): boolean { return this.paused; }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.remove();
    this.cache = null;
  }

  // ------------------------------------------------------------ internals

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const v = computeView(Math.max(1, r.width), Math.max(1, r.height), dpr);
    this.view = v;
    this.canvas.width = Math.round(v.cw * dpr);
    this.canvas.height = Math.round(v.ch * dpr);
    this.canvas.style.width = `${v.cw}px`;
    this.canvas.style.height = `${v.ch}px`;
    // Static layers cached per size and device-pixel-ratio.
    const cache = document.createElement('canvas');
    cache.width = this.canvas.width;
    cache.height = this.canvas.height;
    const cctx = cache.getContext('2d');
    if (cctx) {
      drawStatic(cctx, v, this.stage);
      this.cache = cache;
    }
    this.held = [];
  }

  private updatePrediction(force = false): void {
    const s = this.sim;
    if (s.phase === 'aim') {
      if (force) this.predicted = predictLaunch(this.stage, this.angle, this.power);
    } else if (s.phase === 'flight' && (force || s.tick - this.predictedAt >= 6)) {
      this.predicted = predictPath(this.stage, cloneSim(s));
      this.predictedAt = s.tick;
    } else if (s.phase === 'ended') {
      this.predicted = [];
    }
  }

  private emitTelemetry(): void {
    const s = this.sim;
    const firing = s.burstDir === -1 ? -1 : this.view.rotated ? (s.burstDir + 3) % 4 : s.burstDir;
    this.cb.onTelemetry({
      t: s.tick / PHYSICS.hz,
      fuel: s.fuelTenths / 10,
      fuelMax: this.stage.fuel,
      spent: s.spentTenths / 10,
      phase: s.phase,
      gates: s.gatesCleared.slice(),
      firing,
      paused: this.paused,
    });
  }

  private stepOnce(): void {
    const s = this.sim;
    if (s.burstDir === -1) {
      const want = this.taps.length ? this.taps.shift()! : this.held.length ? this.held[this.held.length - 1] : -1;
      if (want !== -1 && startBurst(s, want)) {
        this.cb.onEvent({ type: 'burst' });
        if (!this.lowFuelSent && s.fuelTenths < PHYSICS.lowFuel * 10) {
          this.lowFuelSent = true;
          this.cb.onEvent({ type: 'lowFuel' });
        }
      }
    }
    const events = step(this.stage, s);
    if (s.tick % 2 === 0 || s.phase !== 'flight') this.flown.push(s.x, s.y);
    if (events) {
      for (const e of events) {
        if (e.type === 'gate') this.cb.onEvent({ type: 'gate', index: e.index });
        else {
          this.endedAt = performance.now();
          this.cb.onEvent({ type: 'end', outcome: e.outcome });
        }
      }
      this.emitTelemetry();
    } else if (s.tick % 12 === 0) {
      this.emitTelemetry(); // 10 Hz
    }
  }

  private frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(MAX_FRAME, (now - this.last) / 1000) : 0;
    this.last = now;
    const s = this.sim;

    if (s.phase === 'flight' && !this.paused) {
      this.acc += dt;
      while (this.acc >= PHYSICS.dt && s.phase === 'flight') {
        this.stepOnce();
        this.acc -= PHYSICS.dt;
      }
      this.updatePrediction();
    }
    if (s.phase === 'ended') {
      this.predicted = [];
      if (!this.outcomeSent && now - this.endedAt >= (this.reduced ? 300 : END_HOLD_MS)) {
        this.outcomeSent = true;
        this.cb.onOutcome({
          outcome: s.outcome!,
          inputs: makeInputs(this.stage, this.seed, this.angle, this.power, s.bursts),
          path: this.flown.slice(),
        });
      }
    }

    const alpha = s.phase === 'flight' && !this.paused ? Math.min(1, this.acc / PHYSICS.dt) : 1;
    const probe = s.phase === 'aim' ? { x: s.x, y: s.y } : { x: s.px + (s.x - s.px) * alpha, y: s.py + (s.y - s.py) * alpha };
    drawFrame(this.ctx, this.view, this.stage, this.cache, {
      now,
      reduced: this.reduced,
      tick: s.tick,
      gatesCleared: s.gatesCleared,
      predicted: this.predicted,
      flown: this.flown,
      probe,
      inFlight: s.phase === 'flight',
      thrust: s.burstDir === -1 ? null : THRUST[s.burstDir],
      aim: s.phase === 'aim' ? { angle: this.angle, power: this.power } : null,
      ended: s.phase === 'ended' && s.outcome ? { status: s.outcome.status, at: this.endedAt } : null,
    });
  };

  // Pointer aiming: drag from the probe; direction sets angle, length sets power.
  private aimFromPointer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const w = toWorld(this.view, e.clientX - r.left, e.clientY - r.top);
    const dx = w.x - this.stage.pad.x, dy = this.stage.pad.y - w.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return;
    const angle = Math.round((Math.atan2(dy, dx) * 1800) / Math.PI);
    const power = (dist - 50) / 1.5;
    this.aim(angle, power);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.sim.phase !== 'aim' || e.button > 0) return;
    e.preventDefault();
    this.host.focus({ preventScroll: true });
    this.aiming = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.aimFromPointer(e);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.aiming) this.aimFromPointer(e);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.aiming) return;
    this.aiming = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  };
}
