import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, Toggle, useFocusTrap, useTitle } from '../components/ui.tsx';
import { PHYSICS } from '../game/constants.ts';
import { dailyStage, seedForDate } from '../game/daily.ts';
import { formatClock, formatFuel } from '../game/score.ts';
import { isUnlocked, stageById } from '../game/stages.ts';
import type { BurstDir, StageDef } from '../game/types.ts';
import { play } from '../engine/audio.ts';
import { Engine, type FlightResult, type Telemetry } from '../engine/Engine.ts';
import { href, navigate } from '../router.ts';
import { clearedStages, getRuns, recordRun, type LocalRun } from '../state/runs.ts';
import type { Settings } from '../state/settings.ts';

export type Finished = { stage: StageDef; seed: number; result: FlightResult; run: LocalRun };

const CAUSE_TEXT: Record<string, string> = {
  PLANET: 'impact with a planet', SINGULARITY: 'crossed the event horizon', GATE: 'hit a closed gate',
  DRIFT: 'drifted out of range', TIME: 'out of time',
};

const KEY_DIR: Record<string, BurstDir> = {
  ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3,
};

/** Stepper button with press-and-hold auto-repeat; Enter/Space steps once. */
function RepeatButton({ label, onStep, children }: { label: string; onStep: () => void; children: string }) {
  const timer = useRef<number | undefined>(undefined);
  const stop = useCallback(() => {
    clearTimeout(timer.current);
    clearInterval(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => stop, [stop]);
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onStep();
        stop();
        timer.current = window.setTimeout(() => { timer.current = window.setInterval(onStep, 60); }, 350);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => { if (e.detail === 0) onStep(); }}
    >
      {children}
    </button>
  );
}

export function Flight({ id, settings, onSettings, reducedMotion, onFinish }: {
  id: string; settings: Settings; onSettings: (p: Partial<Settings>) => void; reducedMotion: boolean;
  onFinish: (f: Finished) => void;
}) {
  // The daily seed is fixed when the flight screen opens, so a run that crosses midnight keeps its challenge.
  const [seed] = useState(() => (id === 'daily' ? seedForDate(new Date()) : 0));
  const stage = useMemo(() => (id === 'daily' ? dailyStage(seed) : stageById(id)), [id, seed]);
  const locked = !!stage && id !== 'daily' && !isUnlocked(id, clearedStages(getRuns()));
  useTitle(stage ? stage.name : 'Stages');

  const fieldRef = useRef<HTMLElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [tele, setTele] = useState<Telemetry | null>(null);
  const [aim, setAim] = useState(() => ({ angle: stage?.aim.angle ?? 0, power: stage?.aim.power ?? 50 }));
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const finishRef = useRef(onFinish);
  useEffect(() => { finishRef.current = onFinish; });

  // Stable handlers for the on-screen controls (refs are read only when they fire).
  const hold = useCallback((dir: BurstDir, down: boolean) => engineRef.current?.hold(dir, down), []);
  const tap = useCallback((dir: BurstDir) => engineRef.current?.burst(dir), []);
  const nudge = useCallback((a: number, p: number) => engineRef.current?.nudgeAim(a, p), []);

  useEffect(() => {
    if (!stage || locked) navigate(`stages${id ? `?sel=${id}` : ''}`, true);
  }, [stage, locked, id]);

  // Mount the engine once per stage; tear it down (loop, listeners, canvas) on exit.
  useEffect(() => {
    const host = fieldRef.current;
    if (!stage || locked || !host) return;
    let engine: Engine;
    try {
      engine = new Engine(host, stage, seed, {
        onTelemetry: setTele,
        onAim: (angle, power) => setAim({ angle, power }),
        onEvent: (e) => {
          switch (e.type) {
            case 'launch': play('launch'); setAnnounce('Launched.'); break;
            case 'burst': play('burst'); break;
            case 'gate': play('gate'); setAnnounce('Gate cleared.'); break;
            case 'lowFuel': play('lowFuel'); setAnnounce('Fuel low.'); break;
            case 'end':
              play(e.outcome.status === 'complete' ? 'complete' : 'failed');
              setAnnounce(e.outcome.status === 'complete' ? `Complete. Score ${e.outcome.score}.` : `Failed: ${CAUSE_TEXT[e.outcome.cause ?? ''] ?? ''}.`);
              break;
            case 'restart': setAnnounce('Restarted.'); break;
            default: break;
          }
        },
        onOutcome: (result) => {
          const run = recordRun(stage, result.outcome, result.inputs);
          finishRef.current({ stage, seed, result, run });
        },
      }, { reducedMotion });
    } catch (e) {
      // Error path of mounting an external system (the canvas engine).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(e instanceof Error ? e.message : 'The playfield could not start.');
      return;
    }
    engineRef.current = engine;
    host.focus({ preventScroll: true });
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // reducedMotion is applied live below; it must not remount the engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, seed, locked]);

  useEffect(() => { engineRef.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);

  const openPause = useCallback(() => {
    engineRef.current?.pause();
    setDialog(true);
  }, []);
  // Focus returns to the playfield after the dialog's focus trap has released.
  const refocus = () => setTimeout(() => fieldRef.current?.focus({ preventScroll: true }), 0);
  const resume = useCallback(() => {
    setDialog(false);
    engineRef.current?.resume();
    refocus();
  }, []);
  const restart = useCallback(() => {
    setDialog(false);
    engineRef.current?.restart();
    refocus();
  }, []);

  // Auto-pause on tab hide, window blur and orientation change.
  useEffect(() => {
    const auto = () => {
      if (engineRef.current?.phase === 'flight' && !engineRef.current.isPaused) openPause();
    };
    const onVis = () => { if (document.hidden) auto(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', auto);
    window.addEventListener('orientationchange', auto);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', auto);
      window.removeEventListener('orientationchange', auto);
    };
  }, [openPause]);

  const launch = () => {
    engineRef.current?.launch();
    fieldRef.current?.focus({ preventScroll: true });
  };

  // Game keys bind only while the playfield has focus.
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const eng = engineRef.current;
    if (!eng || dialog || e.altKey || e.ctrlKey || e.metaKey) return;
    const code = e.code;
    let handled = true;
    if (code === 'Escape' || code === 'KeyP') openPause();
    else if (code === 'KeyR') restart();
    else if (eng.phase === 'aim') {
      const fine = e.shiftKey;
      if (code === 'ArrowLeft' || code === 'KeyA') eng.nudgeAim(fine ? -1 : -5, 0);
      else if (code === 'ArrowRight' || code === 'KeyD') eng.nudgeAim(fine ? 1 : 5, 0);
      else if (code === 'ArrowUp' || code === 'KeyW') eng.nudgeAim(0, fine ? 1 : 2);
      else if (code === 'ArrowDown' || code === 'KeyS') eng.nudgeAim(0, fine ? -1 : -2);
      else if (code === 'Space' || code === 'Enter') { if (!e.repeat) launch(); }
      else handled = false;
    } else if (eng.phase === 'flight' && code in KEY_DIR) {
      if (!e.repeat) eng.hold(KEY_DIR[code], true);
    } else if (code === 'Space') {
      // Swallow so the page never scrolls during flight.
    } else handled = false;
    if (handled) e.preventDefault();
  };
  const onKeyUp = (e: ReactKeyboardEvent) => {
    if (e.code in KEY_DIR) engineRef.current?.hold(KEY_DIR[e.code], false);
  };

  const dialogRef = useFocusTrap(dialog, resume);

  if (!stage || locked) return null;

  const phase = tele?.phase ?? 'aim';
  const isAim = phase === 'aim';
  const fuel = tele?.fuel ?? stage.fuel;
  const low = fuel < PHYSICS.lowFuel;
  const segOn = Math.round((fuel / stage.fuel) * 20 + 1e-9);
  const timeText = formatClock(tele?.t ?? 0);
  const gates = tele?.gates ?? stage.gates.map(() => false);
  const firing = tele?.firing ?? -1;

  const thrustProps = (dir: BurstDir) => ({
    'data-dir': dir,
    disabled: phase !== 'flight',
    className: firing === dir ? 'firing' : '',
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault(); // keep focus on the playfield
      e.currentTarget.setPointerCapture(e.pointerId);
      hold(dir, true);
    },
    onPointerUp: () => hold(dir, false),
    onPointerCancel: () => hold(dir, false),
    onLostPointerCapture: () => hold(dir, false),
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) tap(dir); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const objective = (
    <>
      {gates.map((g, i) => <li key={i} className={g ? 'done' : ''}><span className="box" aria-hidden="true" />GATE{gates.length > 1 ? ` ${i + 1}` : ''}<span className="sr-only">{g ? ' cleared' : ' not cleared'}</span></li>)}
      <li><span className="ring" aria-hidden="true" />BEACON</li>
    </>
  );

  return (
    <div className="flight">
      <div className="crt-scan crt-scan--game" aria-hidden="true" />
      <header className="fl-header">
        <button className="icon-btn" type="button" aria-label="Pause" onClick={openPause}>{Icon.pause}</button>
        <div className="fl-title">
          <span className="label">{id === 'daily' ? 'DAILY' : `STAGE ${stage.id}`}</span>
          <h1 className="name">{stage.name}</h1>
        </div>
        <button className="icon-btn" type="button" aria-label="Restart" onClick={restart}>{Icon.restart}</button>
      </header>

      <section
        ref={fieldRef}
        className="fl-field"
        data-engine-canvas="playfield"
        tabIndex={0}
        aria-label={`Playfield, ${stage.name}. ${isAim ? 'Aim with arrow keys or drag from the probe; Space launches.' : 'Arrow keys or WASD fire thrusters.'} Escape pauses.`}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => engineRef.current?.releaseAll()}
      >
        {error && <div className="field-msg" role="alert">PLAYFIELD ERROR · {error}</div>}
      </section>

      <aside className="fl-hud" aria-label="Telemetry">
        <div className="hud-cell hud-time">
          <span className="label">TIME</span>
          <span className="value">{timeText}</span>
        </div>
        <div className={`hud-cell hud-fuel${low ? ' low' : ''}`}>
          <div className="row">
            <span className="label">{low ? 'FUEL LOW' : 'FUEL'}</span>
            <span className="value">{formatFuel(fuel)}</span>
          </div>
          <div className="gauge" role="meter" aria-label="Fuel remaining" aria-valuemin={0} aria-valuemax={stage.fuel} aria-valuenow={Math.round(fuel)}>
            {Array.from({ length: 20 }, (_, i) => <span key={i} className={i < segOn ? 'on' : ''} />)}
          </div>
          <div className="gauge-bar" aria-hidden="true"><span style={{ width: `${(fuel / stage.fuel) * 100}%` }} /></div>
          <div className="row hud-spent"><span>SPENT</span><span className="value">{formatFuel(tele?.spent ?? 0)}</span></div>
        </div>
        <div className="hud-cell hud-spent-cell" aria-hidden="true">
          <span className="label">SPENT</span>
          <span className="value">{formatFuel(tele?.spent ?? 0)}</span>
        </div>
        <ol className="objective" aria-label="Objective">{objective}</ol>
      </aside>

      <div className="fl-controls">
        <div className="phase" role="status" aria-label="Flight phase">
          <span className={isAim ? 'on' : ''}>AIM</span>
          <span className={!isAim ? 'on' : ''}>FLIGHT</span>
        </div>
        {isAim && (
          <div className="fl-aim">
            <div className="stepper">
              <RepeatButton label="Decrease angle" onStep={() => nudge(-5, 0)}>←</RepeatButton>
              <output aria-label="Launch angle">{(aim.angle / 10).toFixed(1)}°</output>
              <RepeatButton label="Increase angle" onStep={() => nudge(5, 0)}>→</RepeatButton>
            </div>
            <div className="stepper">
              <RepeatButton label="Decrease power" onStep={() => nudge(0, -2)}>↓</RepeatButton>
              <output aria-label="Launch power">{aim.power}%</output>
              <RepeatButton label="Increase power" onStep={() => nudge(0, 2)}>↑</RepeatButton>
            </div>
          </div>
        )}
        <div role="group" aria-label="Thrusters" className={`thrust${isAim ? ' idle' : ''}`}>
          <button type="button" aria-label="Thrust up" {...thrustProps(0)}>↑</button>
          <button type="button" aria-label="Thrust left" {...thrustProps(3)}>←</button>
          <span className={`core${firing !== -1 ? ' on' : ''}`} aria-hidden="true"><span /></span>
          <button type="button" aria-label="Thrust right" {...thrustProps(1)}>→</button>
          <button type="button" aria-label="Thrust down" {...thrustProps(2)}>↓</button>
        </div>
        {isAim
          ? <button className="btn btn-primary fl-launch" type="button" onClick={launch} disabled={!!error}>LAUNCH<span className="keycap">Space</span></button>
          : <ol className="objective obj-mobile" aria-hidden="true">{objective}</ol>}
      </div>

      <div className="sr-only" role="status" aria-live="polite">{announce}</div>

      {dialog && (
        <div className="dialog-backdrop">
          <div ref={dialogRef} className="dialog signal-swap" role="dialog" aria-modal="true" aria-labelledby="pause-title">
            <div className="dialog-head">
              <h2 id="pause-title">Paused</h2>
              <span className="tele" style={{ fontSize: 13 }}>{timeText}</span>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-primary" type="button" onClick={resume}>RESUME</button>
              <div className="pair">
                <button className="btn btn-sm" type="button" onClick={restart}>RESTART</button>
                <a className="btn btn-sm" href={href(`stages?sel=${id}`)}>STAGES</a>
              </div>
            </div>
            <div className="dialog-settings">
              <Toggle label="Sound" on={settings.sound} onChange={(v) => onSettings({ sound: v })} />
              <Toggle label="Reduced motion" on={settings.reducedMotion} onChange={(v) => onSettings({ reducedMotion: v })} />
              <a className="dialog-link" href={href('how')}>How to Play<span className="tele" aria-hidden="true">→</span></a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
