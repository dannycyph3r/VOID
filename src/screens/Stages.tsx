import { useMemo } from 'react';
import { BackLink, Icon, Screen, useNow, useTitle } from '../components/ui.tsx';
import { StageDiagram } from '../components/world.tsx';
import { dailyLabel, dailyStage, formatCountdown, msUntilUtcMidnight, seedForDate, templateIndexForSeed } from '../game/daily.ts';
import { DAILY_SOLUTIONS, STAGE_SOLUTIONS } from '../game/solutions.ts';
import { STAGES, isUnlocked } from '../game/stages.ts';
import { href, navigate } from '../router.ts';
import { clearedStages, useRuns } from '../state/runs.ts';

export function Stages({ sel }: { sel: string | null }) {
  useTitle('Stages');
  const now = useNow(1000);
  const runs = useRuns();
  const cleared = useMemo(() => clearedStages(runs), [runs]);
  const seed = seedForDate(now);
  const daily = useMemo(() => dailyStage(seed), [seed]);

  // Default selection: the first open stage not yet cleared.
  const fallback = STAGES.find((s) => isUnlocked(s.id, cleared) && !cleared.has(s.id))?.id ?? STAGES[0].id;
  const picked = sel === 'daily' || STAGES.some((s) => s.id === sel) ? (sel as string) : fallback;
  const pick = (id: string) => navigate(`stages?sel=${id}`, true);

  const isDaily = picked === 'daily';
  const stage = isDaily ? daily : STAGES.find((s) => s.id === picked)!;
  const open = isDaily || isUnlocked(stage.id, cleared);
  const prevId = STAGES[STAGES.findIndex((s) => s.id === stage.id) - 1]?.id;
  const reference = isDaily ? DAILY_SOLUTIONS[templateIndexForSeed(seed)] : STAGE_SOLUTIONS[stage.id];

  return (
    <Screen>
      <header className="topbar"><BackLink /></header>
      <main className="stages-main">
        <section className="stages-col">
          <h1 className="h1">Stages</h1>
          <button className="daily-row" type="button" aria-pressed={isDaily} onClick={() => pick('daily')}>
            <span className="label mint">DAILY · {dailyLabel(seed)}</span>
            <span className="label" style={{ textAlign: 'right', letterSpacing: 0 }}><span className="sr-only">Resets in </span>{formatCountdown(msUntilUtcMidnight(now))}</span>
            <span className="name">{daily.name}</span>
            <span />
          </button>
          <ol className="stage-list" aria-label="Stages">
            {STAGES.map((s) => {
              const unlocked = isUnlocked(s.id, cleared);
              const done = cleared.has(s.id);
              const selected = s.id === picked;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`stage-row${unlocked ? '' : ' locked'}`}
                    aria-pressed={selected}
                    aria-label={`Stage ${s.id} ${s.name}, ${s.mechanic}, difficulty ${s.difficulty} of 5, ${done ? 'cleared' : unlocked ? 'new' : 'locked'}`}
                    onClick={() => pick(s.id)}
                    onDoubleClick={() => unlocked && navigate(`flight/${s.id}`)}
                  >
                    <span className="mint" style={{ fontSize: 12, textAlign: 'center' }} aria-hidden="true">{selected ? '▸' : ''}</span>
                    <span className="tele" style={{ fontSize: 13 }}>{s.id}</span>
                    <span className="title"><span className="name">{s.name}</span><span className="mech">{s.mechanic}</span></span>
                    <span className="pips" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= s.difficulty ? 'on' : ''} />)}
                    </span>
                    <span className={`status${unlocked && !done ? ' new' : ''}`}>{done ? '✓' : unlocked ? 'NEW' : 'LOCK'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="stages-col" aria-label="Selected stage" style={{ gap: 20 }}>
          <div key={picked} className="signal-swap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="preview-head">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="label">{isDaily ? 'DAILY' : `STAGE ${stage.id}`}</span>
                <h2 className="preview-name">{stage.name}</h2>
              </div>
              <span className="label" style={{ letterSpacing: '.1em' }}>{stage.coords}</span>
            </div>
            <StageDiagram stage={stage} reference={reference} seed={isDaily ? seed : 0} />
            <dl className="facts">
              <div><dt>FUEL</dt><dd>{stage.fuel}</dd></div>
              <div><dt>PAR</dt><dd>{stage.par.toLocaleString('en-US')}</dd></div>
              <div><dt>DIFF</dt><dd>{stage.difficulty}/5</dd></div>
            </dl>
          </div>
          {open ? (
            <a className="btn btn-primary launch-link" href={href(`flight/${picked}`)}>
              <span>LAUNCH</span>{Icon.arrow}
            </a>
          ) : (
            <button className="btn launch-link" type="button" disabled>
              <span>CLEAR {prevId}</span>{Icon.lock}
            </button>
          )}
        </section>
      </main>
    </Screen>
  );
}
