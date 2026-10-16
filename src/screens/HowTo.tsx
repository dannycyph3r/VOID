import type { MouseEvent, ReactNode } from 'react';
import { BackLink, Screen, useTitle } from '../components/ui.tsx';
import { game, PHYSICS } from '../game/constants.ts';
import { debtScore } from '../game/score.ts';
import { href } from '../router.ts';
import { onlineConfigured } from '../state/api.ts';

const SECTIONS: [string, string][] = [
  ['aim', '01 AIM'], ['gravity', '02 GRAVITY'], ['thrust', '03 THRUST'], ['beacon', '04 BEACON'], ['hazards', '05 HAZARDS'],
  ['score', '06 SCORE'], ['controls', '07 CONTROLS'], ['daily', '08 DAILY'], ['terms', '09 TERMS'],
];

function teeth(cx: number, cy: number, r0: number, r1: number) {
  let d = '';
  for (let j = 0; j < 30; j++) {
    const b = (j * 12 * Math.PI) / 180;
    d += `M${(cx + r0 * Math.cos(b)).toFixed(1)} ${(cy + r0 * Math.sin(b)).toFixed(1)}L${(cx + r1 * Math.cos(b)).toFixed(1)} ${(cy + r1 * Math.sin(b)).toFixed(1)}`;
  }
  return d;
}

function Help({ id, n, title, children, diagram, stack }: { id: string; n: string; title: string; children: ReactNode; diagram?: ReactNode; stack?: boolean }) {
  return (
    <section id={id} className={`help${stack ? ' stack' : ''}`} tabIndex={-1} aria-labelledby={`${id}-h`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: stack ? 18 : 12 }}>
        <h2 id={`${id}-h`}><span className="n">{n}</span>{title}</h2>
        {children}
      </div>
      {diagram}
    </section>
  );
}

const cost = game.burst.cost;
const dur = game.burst.duration;
const exTicks = Math.round(38.42 * PHYSICS.hz);
const exBursts = 9;

const CONTROLS: [string, string, string, string][] = [
  ['Aim angle', '← →  or  A D  (Shift: fine)', 'Drag from probe', 'Drag from probe · ← → buttons'],
  ['Aim power', '↑ ↓  or  W S  (Shift: fine)', 'Drag length', 'Drag length · ↑ ↓ buttons'],
  ['Launch', 'Space or Enter', 'Launch button', 'Launch button'],
  ['Thrust (in flight)', 'Arrows or WASD · hold to repeat', 'Thrust buttons · hold to repeat', 'Thrust pad · hold to repeat'],
  ['Pause', 'Esc or P', 'Pause button', 'Pause button'],
  ['Restart', 'R', 'Restart button', 'Restart button'],
];

const TERMS: [string, string][] = [
  ['TRAJECTORY', 'The probe’s path. Solid = flown, dashed = predicted.'],
  ['GRAVITY ASSIST', 'Passing close to a planet to bend your path for free.'],
  ['THRUSTER', 'Small engine on the probe. Fires in four directions.'],
  ['BURST', `One thruster firing: ${dur} s, ${cost} u of fuel.`],
  ['GATE', 'A cycling opening you must pass through before the beacon.'],
  ['BEACON', 'The mint target. Touch it to complete the stage.'],
  ['SINGULARITY', 'A black hole. Far stronger pull than any planet.'],
  ['EVENT HORIZON', 'A singularity’s toothed ring. Crossing it fails the run.'],
  ['DEBT SCORE', `Seconds × ${game.score.perSecond} + fuel × ${game.score.perFuelUnit}. Lower is better.`],
  ['PAR', 'The target score for a stage.'],
];

export function HowTo() {
  useTitle('How to Play');
  const jump = (e: MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: 'start' });
    el?.focus({ preventScroll: true });
  };
  return (
    <Screen vignette={false}>
      <header className="topbar"><BackLink /></header>
      <main className="page-main" style={{ gap: 0, paddingBottom: 40 }}>
        <h1 className="h1" style={{ marginBottom: 24 }}>How to Play</h1>
        <nav className="howto-index" aria-label="Sections">
          {SECTIONS.map(([id, l]) => <a key={id} href={href('how')} onClick={(e) => jump(e, id)}>{l}</a>)}
        </nav>

        <Help id="aim" n="01" title="Aim and launch" diagram={
          <svg viewBox="0 0 360 150" role="img" aria-label="Aim arrow from the pad with a dashed preview path"><path d="M40 120 L130 80" stroke="#E8E4D8" strokeWidth="1.2" /><path d="M120 78 L130 80 L124 89" stroke="#E8E4D8" strokeWidth="1.2" fill="none" /><path d="M80 120 A40 40 0 0 0 77 105" stroke="rgba(232,228,216,.45)" fill="none" /><rect x="35" y="115" width="10" height="10" fill="#E8E4D8" transform="rotate(45 40 120)" /><path d="M130 80 C 170 62, 220 50, 300 46" stroke="#82E6D0" strokeDasharray="5 6" fill="none" /><text x="138" y="108" fill="#8A8880" fontFamily="IBM Plex Mono, monospace" fontSize="12">24° · 64%</text></svg>
        }>
          <p>Drag from the probe to aim: direction sets the angle, length sets the power. Keys and the on-screen steppers do the same. The dashed line previews the next {PHYSICS.predictSeconds} seconds of flight under real gravity. Launching is free; the clock starts when the probe leaves the pad.</p>
        </Help>

        <Help id="gravity" n="02" title="Gravity" diagram={
          <svg viewBox="0 0 360 150" role="img" aria-label="Path bending around a planet with dotted gravity rings"><circle cx="180" cy="90" r="62" fill="none" stroke="rgba(138,136,128,.35)" strokeDasharray="1 5" /><circle cx="180" cy="90" r="42" fill="none" stroke="rgba(138,136,128,.55)" strokeDasharray="1 3" /><circle cx="180" cy="90" r="22" fill="#E8E4D8" /><path d="M20 140 C 100 120, 150 140, 200 130 C 250 120, 240 60, 340 20" stroke="#82E6D0" strokeWidth="1.6" fill="none" /><path d="M20 140 L 340 110" stroke="rgba(232,228,216,.25)" strokeDasharray="3 5" /></svg>
        }>
          <p>Every planet pulls the probe toward it, and the pull grows sharply as you get closer (inverse square). Dotted rings mark equal pull; tighter rings mean stronger pull. Passing close to a planet bends your path and speeds you up on the way in: a gravity assist. Touching a planet ends the run.</p>
        </Help>

        <Help id="thrust" n="03" title="Thrusters and fuel" diagram={
          <svg viewBox="0 0 360 150" role="img" aria-label="Probe firing a thruster burst, with a fuel gauge"><path d="M30 120 C 90 100, 130 90, 160 80" stroke="#82E6D0" strokeWidth="1.6" fill="none" /><path d="M160 80 C 200 60, 240 40, 320 36" stroke="#82E6D0" strokeDasharray="5 6" fill="none" /><rect x="155" y="75" width="10" height="10" fill="#E8E4D8" transform="rotate(45 160 80)" /><path d="M160 94 V114 M154 92 L150 108 M166 92 L170 108" stroke="#E8E4D8" strokeWidth="1.3" /><g fill="#E8E4D8">{[230, 240, 250, 260, 270, 280].map((x) => <rect key={x} x={x} y="120" width="8" height="8" />)}</g><g fill="rgba(232,228,216,.12)">{[290, 300, 310, 320].map((x) => <rect key={x} x={x} y="120" width="8" height="8" />)}</g></svg>
        }>
          <p>In flight, each press fires one burst in that direction: {dur} s, {cost} u of fuel. Hold to repeat. One burst fires at a time. Each stage starts with its own tank; with less than {cost} u left the probe can only coast. Below {PHYSICS.lowFuel} u the gauge turns red and reads FUEL LOW.</p>
        </Help>

        <Help id="beacon" n="04" title="Gates and beacon" diagram={
          <svg viewBox="0 0 360 150" role="img" aria-label="Path through an open gate to the beacon"><path d="M120 120 L170 70" stroke="#E8E4D8" strokeDasharray="3 4" /><path d="M114 113 L126 127 M164 63 L176 77" stroke="#E8E4D8" strokeWidth="2.5" /><rect x="110" y="44" width="56" height="3" fill="rgba(232,228,216,.16)" /><rect x="110" y="44" width="34" height="3" fill="#E8E4D8" /><path d="M30 130 C 90 120, 130 100, 145 95 C 200 70, 260 60, 300 56" stroke="#82E6D0" strokeWidth="1.6" fill="none" /><circle cx="306" cy="55" r="5" fill="#82E6D0" /><circle cx="306" cy="55" r="15" fill="none" stroke="#82E6D0" /></svg>
        }>
          <p>Gates open and close on a fixed cycle that starts at launch. Open gates are dashed; closed gates are solid and fail the run if you fly into them. The bar above a gate shows how much of its open window is left. Pass through every gate, then touch the mint beacon to complete the stage.</p>
        </Help>

        <Help id="hazards" n="05" title="Singularities" diagram={
          <svg viewBox="0 0 360 150" role="img" aria-label="Singularity with toothed event horizon and dashed outer ring"><circle cx="180" cy="75" r="62" fill="none" stroke="#D9604C" strokeDasharray="2 6" opacity="0.6" /><path d={teeth(180, 75, 26, 34)} stroke="#D9604C" strokeWidth="1.4" /><circle cx="180" cy="75" r="14" fill="#000" stroke="#E8E4D8" /><path d="M20 30 C 90 40, 120 50, 140 62" stroke="#82E6D0" strokeWidth="1.6" fill="none" /><path d="M138 54 l12 12 M150 54 l-12 12" stroke="#D9604C" strokeWidth="1.8" /></svg>
        }>
          <p>A singularity pulls far harder than any planet. Its toothed red ring is the event horizon: cross it and the run fails. The dashed outer ring marks where its pull begins. A run also fails if the probe hits a planet, drifts off the field, or runs out of time.</p>
        </Help>

        <Help id="score" n="06" title="Debt Score" stack>
          <p className="formula">Score = Seconds × {game.score.perSecond} + Fuel × {game.score.perFuelUnit}</p>
          <p>Lower is better. Every second and every unit of fuel adds to what the run owes, rounded to a whole number. Failed runs don’t score. Each stage has a par to beat. Equal scores rank by shorter time, then less fuel, then the earlier run.</p>
          <p className="example">e.g. 38.42 s × {game.score.perSecond} + {(exBursts * cost).toFixed(1)} u × {game.score.perFuelUnit} = <span className="mint">{debtScore(exTicks, exBursts * cost * 10)}</span></p>
        </Help>

        <Help id="controls" n="07" title="Controls" stack>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">ACTION</th><th scope="col">KEYBOARD</th><th scope="col">MOUSE</th><th scope="col">TOUCH</th></tr></thead>
              <tbody>
                {CONTROLS.map(([a, k, m, t]) => (
                  <tr key={a}><th scope="row" style={{ fontWeight: 500, padding: '12px 16px 12px 0', borderTop: '1px solid var(--hair)', fontSize: 14, color: 'var(--starlight)', letterSpacing: 0 }}>{a}</th><td className="dim">{k}</td><td className="dim">{m}</td><td className="dim">{t}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Game keys work while the playfield has focus (click it or Tab to it). The game pauses itself when you switch tabs or windows.</p>
        </Help>

        <Help id="daily" n="08" title="Daily and ranked runs" stack>
          <ul>
            <li>One daily stage, identical for everyone, from 00:00 to 24:00 UTC. The UTC date picks it from a fixed set of tested layouts.</li>
            <li>Fly it as often as you like; your best run of the day is ranked.</li>
            <li>Only completed runs are ranked. Each is verified by replaying your recorded inputs on the server before it counts.</li>
            {onlineConfigured
              ? <li>Every run is saved on this device first. Submit your best from Stats; it shows as verified only after the server confirms it.</li>
              : <li>This build has no online rankings configured, so runs stay on this device and Stats shows local results only.</li>}
          </ul>
        </Help>

        <Help id="terms" n="09" title="Terms" stack>
          <dl className="terms">
            {TERMS.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
        </Help>
      </main>
    </Screen>
  );
}
