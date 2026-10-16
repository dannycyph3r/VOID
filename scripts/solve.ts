// Brute-force solver used to validate and tune stages.
//
//   npm run solve            all stages and daily templates
//   npm run solve -- 03 d2   selected ids (dN = daily template N)
//
// Searches launch angle × power with no thrust, then (if nothing completes)
// launch + one or two bursts. Prints the best run found per stage as a
// reference solution that can be pasted into src/game/solutions.ts.
import { PHYSICS } from '../src/game/constants.ts';
import { DAILY_TEMPLATES } from '../src/game/daily.ts';
import { makeInputs, simulateRun } from '../src/game/replay.ts';
import { STAGES } from '../src/game/stages.ts';
import type { BurstDir, RunInputs, StageDef } from '../src/game/types.ts';

type Found = { inputs: RunInputs; score: number; ticks: number; fuel: number };

function tryRun(stage: StageDef, angle: number, power: number, bursts: RunInputs['bursts']): Found | null {
  const inputs = makeInputs(stage, 0, angle, power, bursts);
  const r = simulateRun(stage, inputs);
  if (!r.ok || r.outcome.status !== 'complete') return null;
  return { inputs, score: r.outcome.score!, ticks: r.outcome.ticks, fuel: r.outcome.fuel };
}

const reference: Record<string, RunInputs> = {};

/** Suggested par: the median winning score plus two bursts, rounded up to 50. */
function suggestPar(median: number): number {
  return Math.ceil((median + 2 * 60) / 50) * 50;
}

function solve(stage: StageDef, label: string): void {
  const t0 = performance.now();
  const wins: Found[] = [];
  const causes: Record<string, number> = {};
  let total = 0;
  for (let a = stage.aim.min; a <= stage.aim.max; a += 5) {
    for (let p = PHYSICS.powerMin; p <= PHYSICS.powerMax; p += 1) {
      total++;
      const inputs = makeInputs(stage, 0, a, p, []);
      const r = simulateRun(stage, inputs);
      if (!r.ok) continue;
      if (r.outcome.status === 'complete') wins.push({ inputs, score: r.outcome.score!, ticks: r.outcome.ticks, fuel: 0 });
      else causes[r.outcome.cause!] = (causes[r.outcome.cause!] ?? 0) + 1;
    }
  }
  let mode = 'ballistic';
  if (wins.length === 0) {
    mode = 'one burst';
    const dirs: BurstDir[] = [0, 1, 2, 3];
    for (let a = stage.aim.min; a <= stage.aim.max; a += 20) {
      for (let p = PHYSICS.powerMin; p <= PHYSICS.powerMax; p += 4) {
        for (let t = 0; t < stage.timeLimit * PHYSICS.hz; t += 120) {
          for (const d of dirs) {
            const f = tryRun(stage, a, p, [[t, d]]);
            if (f) wins.push(f);
          }
        }
      }
    }
  }
  wins.sort((x, y) => x.score - y.score || x.ticks - y.ticks);
  const ms = Math.round(performance.now() - t0);
  const pct = ((wins.length / total) * 100).toFixed(2);
  console.log(`\n${label} ${stage.name} — ${mode}: ${wins.length} wins / ${total} aims (${pct}%) in ${ms} ms · par ${stage.par}`);
  console.log('  fail causes:', JSON.stringify(causes));
  if (wins.length) {
    const scores = wins.map((w) => w.score);
    const med = scores[Math.floor(scores.length / 2)];
    console.log(`  best ${scores[0]} · median ${med} · worst ${scores[scores.length - 1]}`);
    const b = wins[0];
    console.log(`  best: angle ${b.inputs.angle} power ${b.inputs.power} bursts ${JSON.stringify(b.inputs.bursts)} → ${(b.ticks / PHYSICS.hz).toFixed(2)} s, ${b.fuel} u, score ${b.score}`);
    // A "typical" winning aim (median score) is the friendlier reference.
    const m = wins[Math.floor(wins.length / 2)];
    console.log(`  median: angle ${m.inputs.angle} power ${m.inputs.power} bursts ${JSON.stringify(m.inputs.bursts)} → score ${m.score}`);
    console.log(`  suggested par ${suggestPar(med)} (current ${stage.par})`);
    reference[label] = m.inputs;
  } else {
    console.log('  NO SOLUTION FOUND');
  }
}

const args = process.argv.slice(2);
for (const s of STAGES) if (!args.length || args.includes(s.id)) solve(s, s.id);
DAILY_TEMPLATES.forEach((tpl, i) => {
  if (!args.length || args.includes(`d${i}`)) solve(tpl, `d${i}`);
});
console.log('\nReference solutions (median winning aim):');
for (const [k, v] of Object.entries(reference)) {
  console.log(`  '${k}': { angle: ${v.angle}, power: ${v.power}, bursts: ${JSON.stringify(v.bursts)} },`);
}
