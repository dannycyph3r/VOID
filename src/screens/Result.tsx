import { useEffect } from 'react';
import { Icon, Screen, useTitle } from '../components/ui.tsx';
import { FlightTrace } from '../components/world.tsx';
import { formatFuel, formatScore, formatSeconds } from '../game/score.ts';
import type { FailCause } from '../game/types.ts';
import { href, navigate } from '../router.ts';
import type { Finished } from './Flight.tsx';

export const CAUSE_LABEL: Record<FailCause, string> = {
  PLANET: 'IMPACT', SINGULARITY: 'SINGULARITY', GATE: 'GATE CLOSED', DRIFT: 'LOST SIGNAL', TIME: 'OUT OF TIME',
};

export function Result({ finished }: { finished: Finished | null }) {
  useTitle('Result');
  const flightId = finished ? (finished.stage.id === 'daily' ? 'daily' : finished.stage.id) : null;

  useEffect(() => {
    if (!finished) navigate('stages', true);
  }, [finished]);

  useEffect(() => {
    if (!flightId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey) navigate(`flight/${flightId}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flightId]);

  if (!finished) return null;
  const { stage, result } = finished;
  const o = result.outcome;
  const ok = o.status === 'complete';
  const label = stage.id === 'daily' ? 'DAILY' : `STAGE ${stage.id}`;

  return (
    <Screen>
      <main className="result-main">
        <section className={`result-col ${ok ? 'signal-boot' : 'signal-lost'}`}>
          <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ok
              ? <span className="status-tag mint"><span className="sq" aria-hidden="true" />COMPLETE · {label}</span>
              : <span className="status-tag alarm">{Icon.cross}FAILED · {CAUSE_LABEL[o.cause ?? 'DRIFT']}</span>}
            <h1 className="result-name">{stage.name}</h1>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="label" style={{ letterSpacing: '.18em' }}>SCORE</span>
            <span className={`score-big${ok ? '' : ' none'}`} aria-label={ok ? `Score ${o.score}` : 'No score'}>{formatScore(o.score)}</span>
          </div>
          <dl className="stats-dl">
            <div><dt>TIME</dt><dd>{formatSeconds(o.ticks)} s</dd></div>
            <div><dt>FUEL</dt><dd>{formatFuel(o.fuel)} u</dd></div>
          </dl>
          <div className="actions">
            <a className="btn btn-primary" href={href(`flight/${flightId}`)} autoFocus>RETRY<span className="keycap">R</span></a>
            <a className="btn" href={href(`stages?sel=${flightId}`)}>STAGES</a>
          </div>
        </section>
        <section className="trace-col" aria-hidden="true">
          <FlightTrace stage={stage} path={result.path} status={o.status} />
        </section>
      </main>
    </Screen>
  );
}
