import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackLink, Screen, useNow, useTitle } from '../components/ui.tsx';
import { dailyLabel, dailyStage, formatCountdown, msUntilUtcMidnight, seedForDate } from '../game/daily.ts';
import { formatScore, formatSeconds } from '../game/score.ts';
import { STAGES } from '../game/stages.ts';
import { href, navigate } from '../router.ts';
import { ApiError, fetchBoard, onlineConfigured, registerPlayer, submitRun, usePlayer, type Board } from '../state/api.ts';
import { clearedStages, localRanking, personalBest, totals, useRuns, type LocalRun } from '../state/runs.ts';

type Tab = 'global' | 'daily' | 'personal';
const TABS: [Tab, string][] = [['global', 'LEADERBOARD'], ['daily', 'DAILY'], ['personal', 'PERSONAL']];

const fuelU = (tenths: number) => (tenths / 10).toFixed(1);

function ago(at: number, now: number): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return 'NOW';
  if (m < 60) return `${m} MIN`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} H` : `${Math.floor(h / 24)} D`;
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {['60%', '42%', '70%', '50%', '64%', '38%'].map((w, i) => (
        <div key={i} className="skel-row"><span style={{ width: 16 }} /><span style={{ width: w }} /><span /><span style={{ opacity: .6 }} /><span style={{ opacity: .6 }} /></div>
      ))}
    </div>
  );
}

function Empty({ daily }: { daily: boolean }) {
  return (
    <div className="state-block">
      <span className="state-title">No runs yet</span>
      <a className="btn btn-sm" href={href(daily ? 'flight/daily' : 'stages')}>{daily ? 'FLY DAILY' : 'STAGES'}</a>
    </div>
  );
}

/** Pinned "YOU" row: your best local run for this board and its submission state. */
function YouRow({ best, board, onSubmitted }: { best: LocalRun; board: Board | null; onSubmitted: () => void }) {
  const player = usePlayer();
  const [callsign, setCallsign] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const r = best.remote;

  const submit = async () => {
    setNote(null);
    setBusy(true);
    try {
      if (!player) await registerPlayer(callsign);
      await submitRun(best);
      onSubmitted();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'No signal');
    } finally {
      setBusy(false);
    }
  };

  let action;
  if (r.state === 'confirmed') action = <span className="remote-note mint">✓ VERIFIED{r.rank ? ` · RANK ${r.rank}` : ''}</span>;
  else if (r.state === 'pending' || busy) action = <span className="remote-note" role="status">SUBMITTING…</span>;
  else if (r.state === 'rejected') action = <span className="remote-note err">REJECTED · {r.error}</span>;
  else {
    action = (
      <form className="you-actions" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {r.state === 'failed' && <span className="remote-note err">NOT SENT · {r.error}</span>}
        {!player && (
          <input className="callsign-input" aria-label="Callsign (3–12 letters, digits, _ or -)" placeholder="CALLSIGN" required minLength={3} maxLength={12}
            pattern="[A-Za-z0-9_\-]{3,12}" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} />
        )}
        <button className="btn btn-sm" type="submit">{r.state === 'failed' ? 'RETRY' : 'SUBMIT'}</button>
      </form>
    );
  }
  return (
    <tfoot>
      <tr>
        <td className="you-cell">{board?.you ? String(board.you.rank).padStart(2, '0') : '—'}</td>
        <td className="you-cell">YOU{player ? ` · ${player.callsign}` : ''}</td>
        <td className="r" style={{ fontWeight: 500 }}>{formatScore(best.score)}</td>
        <td className="r" colSpan={2}>
          <div className="you-actions">{action}</div>
          {note && <div className="remote-note err" role="alert" style={{ textAlign: 'right', marginTop: 6 }}>{note}</div>}
        </td>
      </tr>
    </tfoot>
  );
}

function BoardView({ stage, seed, daily }: { stage: string; seed: number; daily: boolean }) {
  const runs = useRuns();
  const best = personalBest(runs, stage, seed);
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ready'; board: Board } | { kind: 'error'; message: string }>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setState({ kind: 'loading' });
    setNonce((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!onlineConfigured) return;
    let live = true;
    fetchBoard(stage, seed).then(
      (board) => { if (live) setState({ kind: 'ready', board }); },
      (e: unknown) => { if (live) setState({ kind: 'error', message: e instanceof Error ? e.message : 'No signal' }); },
    );
    return () => { live = false; };
  }, [stage, seed, nonce]);

  // Local-only build: an honest ranking of this device's own runs.
  if (!onlineConfigured) {
    const mine = localRanking(runs, stage, seed).slice(0, 20);
    return (
      <>
        <span className="data-tag">LOCAL ONLY · THIS DEVICE</span>
        <p className="remote-note" style={{ margin: 0 }}>Online rankings are not configured for this build. These are your own runs on this device.</p>
        {mine.length === 0 ? <Empty daily={daily} /> : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 520 }}>
              <caption className="sr-only">Your runs on this device</caption>
              <thead><tr><th style={{ width: 64 }}>#</th><th>PILOT</th><th className="r">SCORE</th><th className="r">TIME</th><th className="r">FUEL</th></tr></thead>
              <tbody>
                {mine.map((r, i) => (
                  <tr key={r.id}>
                    <td className={i === 0 ? 'mint' : 'tele'}>{String(i + 1).padStart(2, '0')}</td>
                    <td>YOU</td>
                    <td className="r" style={{ fontWeight: 500 }}>{formatScore(r.score)}</td>
                    <td className="r num">{formatSeconds(r.ticks)}</td>
                    <td className="r num">{fuelU(r.fuelTenths)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  if (state.kind === 'loading') return <Skeleton />;
  if (state.kind === 'error') {
    return (
      <div className="state-block" role="alert">
        <span className="state-title alarm">No signal</span>
        <span className="dim" style={{ fontSize: 14 }}>Runs are saved on this device.</span>
        {state.message !== 'No signal' && <span className="remote-note">SERVER · {state.message}</span>}
        <button className="btn btn-sm" type="button" onClick={reload}>RETRY</button>
      </div>
    );
  }
  const { board } = state;
  if (board.rows.length === 0 && !best) return <><span className="data-tag live">LIVE · VERIFIED RUNS</span><Empty daily={daily} /></>;
  return (
    <>
      <span className="data-tag live">LIVE · VERIFIED RUNS · {board.total} {board.total === 1 ? 'PILOT' : 'PILOTS'}</span>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 560 }}>
          <caption className="sr-only">Verified leaderboard</caption>
          <thead><tr><th style={{ width: 64 }}>#</th><th>PILOT</th><th className="r">SCORE</th><th className="r">TIME</th><th className="r">FUEL</th></tr></thead>
          <tbody>
            {board.rows.length === 0 && <tr><td colSpan={5} className="tele">No verified runs yet. Submit yours.</td></tr>}
            {board.rows.map((r) => (
              <tr key={r.rank}>
                <td className={r.rank === 1 ? 'mint' : 'tele'}>{String(r.rank).padStart(2, '0')}</td>
                <td>{r.callsign}</td>
                <td className="r" style={{ fontWeight: 500 }}>{formatScore(r.score)}</td>
                <td className="r num">{formatSeconds(r.ticks)}</td>
                <td className="r num">{fuelU(r.fuelTenths)}</td>
              </tr>
            ))}
          </tbody>
          {best && <YouRow best={best} board={board} onSubmitted={reload} />}
        </table>
      </div>
    </>
  );
}

function Personal() {
  const runs = useRuns();
  const now = useNow(30_000).getTime();
  const t = totals(runs);
  const cleared = clearedStages(runs);
  const mins = Math.floor(t.ticks / 120 / 60);
  const secs = Math.floor(t.ticks / 120) % 60;
  const recent = runs.slice(-8).reverse();
  return (
    <>
      <dl className="totals">
        <div><dt>RUNS</dt><dd>{t.runs}</dd></div>
        <div><dt>CLEARED</dt><dd>{cleared.size}/{STAGES.length}</dd></div>
        <div><dt>FLIGHT TIME</dt><dd>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</dd></div>
        <div><dt>FUEL</dt><dd>{Math.round(t.fuelTenths / 10)} u</dd></div>
      </dl>
      {t.runs === 0 ? <Empty daily={false} /> : (
        <div className="two-tables">
          <div className="table-wrap">
            <table className="table">
              <caption>PERSONAL BEST</caption>
              <tbody>
                {STAGES.map((s) => {
                  const b = personalBest(runs, s.id);
                  return (
                    <tr key={s.id} style={{ color: b ? undefined : 'var(--telemetry)' }}>
                      <td className="tele" style={{ width: 40 }}>{s.id}</td>
                      <td>{s.name.toUpperCase()}</td>
                      <td className="r" style={{ fontWeight: 500 }}>{b ? formatScore(b.score) : '—'}</td>
                      <td className="r num">{b ? formatSeconds(b.ticks) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="table">
              <caption>RECENT</caption>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td style={{ width: 28 }} className={r.status === 'complete' ? 'mint' : 'alarm'} aria-label={r.status === 'complete' ? 'Complete' : 'Failed'}>{r.status === 'complete' ? '✓' : '✕'}</td>
                    <td>{r.stage === 'daily' ? 'DAILY' : `${r.stage} ${r.name.toUpperCase()}`}</td>
                    <td className="r" style={{ fontWeight: 500 }}>{formatScore(r.score)}</td>
                    <td className="r num">{formatSeconds(r.ticks)}</td>
                    <td className="r tele">{ago(r.at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export function Stats({ tab: tabParam, stage: stageParam }: { tab: string | null; stage: string | null }) {
  useTitle('Stats');
  const now = useNow(1000);
  const tab: Tab = tabParam === 'daily' || tabParam === 'personal' ? tabParam : 'global';
  const stage = STAGES.some((s) => s.id === stageParam) ? (stageParam as string) : '01';
  const seed = seedForDate(now);
  const daily = useMemo(() => dailyStage(seed), [seed]);
  const go = (t: Tab, s = stage) => navigate(`stats?tab=${t}&stage=${s}`, true);

  const stageName = STAGES.find((s) => s.id === stage)!.name.toUpperCase();
  const period = tab === 'global' ? `ALL TIME · ${stage} ${stageName}`
    : tab === 'daily' ? `DAILY · ${daily.name.toUpperCase()} · ${dailyLabel(seed)} ${now.getUTCFullYear()} UTC`
    : 'THIS DEVICE';

  return (
    <Screen>
      <header className="topbar"><BackLink /></header>
      <main className="page-main">
        <div className="stats-head">
          <h1 className="h1">Stats</h1>
          <div className="tabs" role="tablist" aria-label="Stats view">
            {TABS.map(([t, label]) => (
              <button key={t} id={`tab-${t}`} className="tab" type="button" role="tab" aria-selected={tab === t} aria-controls="stats-panel" onClick={() => go(t)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="filterbar">
          <span className="dim" style={{ fontSize: 12, letterSpacing: '.14em' }}>{period}</span>
          {tab === 'global' && (
            <div className="seg" role="group" aria-label="Stage">
              {STAGES.map((s) => <button key={s.id} type="button" aria-pressed={s.id === stage} aria-label={`Stage ${s.id} ${s.name}`} onClick={() => go('global', s.id)}>{s.id}</button>)}
            </div>
          )}
          {tab === 'daily' && <span className="tele" style={{ fontSize: 12 }}>CLOSES {formatCountdown(msUntilUtcMidnight(now))}</span>}
        </div>
        <div id="stats-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'personal' ? <Personal /> : <BoardView key={`${tab}:${stage}:${seed}`} stage={tab === 'daily' ? 'daily' : stage} seed={tab === 'daily' ? seed : 0} daily={tab === 'daily'} />}
        </div>
      </main>
    </Screen>
  );
}
