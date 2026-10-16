// SVG renderings of a stage outside the engine: Stages preview diagram and the
// Result flight trace. Drawn from the real stage definitions.
import { useMemo } from 'react';
import { PHYSICS } from '../game/constants.ts';
import { makeInputs, simulateRun } from '../game/replay.ts';
import type { Reference } from '../game/solutions.ts';
import type { StageDef } from '../game/types.ts';

const W = PHYSICS.field.w;
const H = PHYSICS.field.h;

export function pathD(pts: readonly number[]): string {
  if (pts.length < 4) return '';
  let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i].toFixed(1)} ${pts[i + 1].toFixed(1)}`;
  return d;
}

function teeth(x: number, y: number, r0: number, r1: number, n: number): string {
  let d = '';
  for (let j = 0; j < n; j++) {
    const a = (j * 2 * Math.PI) / n;
    d += `M${(x + r0 * Math.cos(a)).toFixed(1)} ${(y + r0 * Math.sin(a)).toFixed(1)}L${(x + r1 * Math.cos(a)).toFixed(1)} ${(y + r1 * Math.sin(a)).toFixed(1)}`;
  }
  return d;
}

const corners = `M10 10h16M10 10v16M${W - 10} 10h-16M${W - 10} 10v16M10 ${H - 10}h16M10 ${H - 10}v-16M${W - 10} ${H - 10}h-16M${W - 10} ${H - 10}v-16`;

/** Stage preview: bodies, hazards, gates, pad, beacon and the reference route (dashed). */
export function StageDiagram({ stage, reference, seed }: { stage: StageDef; reference: Reference | undefined; seed: number }) {
  const route = useMemo(() => {
    if (!reference) return '';
    const r = simulateRun(stage, makeInputs(stage, seed, reference.angle, reference.power, reference.bursts), 6);
    return r.ok ? pathD(r.path) : '';
  }, [stage, reference, seed]);
  return (
    <div className="diagram">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path d={`M0 ${H / 4}H${W}M0 ${H / 2}H${W}M0 ${(3 * H) / 4}H${W}M${W / 4} 0V${H}M${W / 2} 0V${H}M${(3 * W) / 4} 0V${H}`} stroke="rgba(232,228,216,.05)" strokeWidth="2" />
        <path d={corners} stroke="rgba(232,228,216,.4)" strokeWidth="2" fill="none" />
        {stage.singularities.map((h, i) => (
          <g key={`h${i}`}>
            <circle cx={h.x} cy={h.y} r={h.pull} fill="none" stroke="#D9604C" strokeWidth="3" strokeDasharray="2 8" />
            <path d={teeth(h.x, h.y, h.horizon - 6, h.horizon + 6, 28)} stroke="#D9604C" strokeWidth="2.5" />
            <circle cx={h.x} cy={h.y} r={h.r} fill="#000" stroke="#E8E4D8" strokeWidth="2" />
          </g>
        ))}
        {stage.planets.map((p, i) => (
          <g key={`p${i}`}>
            <circle cx={p.x} cy={p.y} r={p.r * 2.6} fill="none" stroke="rgba(138,136,128,.45)" strokeWidth="2" strokeDasharray="6 6" />
            <circle cx={p.x} cy={p.y} r={p.r} fill="#E8E4D8" />
          </g>
        ))}
        {stage.gates.map((g, i) => (
          <path key={`g${i}`} d={`M${g.x1} ${g.y1}L${g.x2} ${g.y2}`} stroke="#E8E4D8" strokeWidth="4" strokeDasharray="8 8" />
        ))}
        {route && <path className="flow" d={route} fill="none" stroke="#82E6D0" strokeWidth="4" strokeDasharray="12 14" />}
        <rect x={stage.pad.x - 9} y={stage.pad.y - 9} width="18" height="18" fill="#E8E4D8" transform={`rotate(45 ${stage.pad.x} ${stage.pad.y})`} />
        <circle cx={stage.beacon.x} cy={stage.beacon.y} r="24" fill="none" stroke="#82E6D0" strokeWidth="2.5" />
        <circle cx={stage.beacon.x} cy={stage.beacon.y} r="9" fill="#82E6D0" />
      </svg>
    </div>
  );
}

/** Quiet flight trace on the Result screen. */
export function FlightTrace({ stage, path, status }: { stage: StageDef; path: readonly number[]; status: 'complete' | 'failed' }) {
  const end = path.length >= 2 ? { x: path[path.length - 2], y: path[path.length - 1] } : stage.pad;
  const b = stage.beacon;
  return (
    <div className="trace">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {stage.planets.map((p, i) => (
          <g key={`p${i}`}>
            <circle cx={p.x} cy={p.y} r={p.r * 2} fill="none" stroke="rgba(138,136,128,.35)" strokeDasharray="1 4" />
            <circle cx={p.x} cy={p.y} r={p.r} fill="none" stroke="rgba(232,228,216,.6)" />
          </g>
        ))}
        {stage.singularities.map((h, i) => (
          <g key={`h${i}`}>
            <path d={teeth(h.x, h.y, h.horizon - 6, h.horizon + 6, 36)} stroke="#D9604C" strokeWidth="1.6" opacity={status === 'failed' ? 1 : 0.5} />
            <circle cx={h.x} cy={h.y} r={h.r} fill="#000" stroke="rgba(232,228,216,.4)" />
          </g>
        ))}
        {stage.gates.map((g, i) => (
          <path key={`g${i}`} d={`M${g.x1} ${g.y1}L${g.x2} ${g.y2}`} stroke="rgba(232,228,216,.5)" strokeDasharray="3 4" />
        ))}
        <path d={pathD(path)} fill="none" stroke="#82E6D0" strokeWidth="2" strokeLinejoin="round" opacity={status === 'failed' ? 0.6 : 1} />
        <rect x={stage.pad.x - 6} y={stage.pad.y - 6} width="12" height="12" fill="none" stroke="#E8E4D8" transform={`rotate(45 ${stage.pad.x} ${stage.pad.y})`} />
        {status === 'complete' ? (
          <>
            <circle cx={b.x} cy={b.y} r="7" fill="#82E6D0" />
            <circle cx={b.x} cy={b.y} r="18" fill="none" stroke="#82E6D0" />
            <circle className="ring-once" cx={b.x} cy={b.y} r="20" fill="none" stroke="#82E6D0" />
          </>
        ) : (
          <>
            <circle cx={b.x} cy={b.y} r="18" fill="none" stroke="rgba(130,230,208,.35)" />
            <path d={`M${end.x - 10} ${end.y - 10}l20 20M${end.x + 10} ${end.y - 10}l-20 20`} stroke="#D9604C" strokeWidth="2" />
          </>
        )}
        <path d={corners} stroke="rgba(232,228,216,.4)" fill="none" />
      </svg>
    </div>
  );
}
