// READ-ONLY: why is the RUN durability read stale? No writes.
//
// The chain (compute-facts -> route_progress_metrics -> compute-snapshot:667 -> state-trend/run.ts):
//   STAGE 1  compute-facts writes a route_progress_metrics row (the trend's LIST OF RUNS)
//   STAGE 2  analyze-running-workout writes workouts.workout_analysis.heart_rate_summary
//   STAGE 3  decouplingPct exists and basis is not 'raw'
//   STAGE 4  steady-aerobic workoutType, >= 20 min, plausible pct
// The newest run that clears all four IS the "as of" date on the State RUN row.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const asOf = new Date().toISOString().slice(0, 10);
const minus = (d) => new Date(Date.parse(asOf + 'T12:00:00Z') - d * 864e5).toISOString().slice(0, 10);

const NONSTEADY = ['interval', 'tempo', 'fartlek', 'threshold', 'vo2', 'speed', 'track', 'race', 'surge'];

const { data: runs, error: runErr } = await sb.from('workouts')
  .select('id,date,type,workout_status,workout_analysis')
  .eq('user_id', USER_ID).in('type', ['run', 'running'])
  .gte('date', minus(60)).order('date', { ascending: false });
if (runErr) throw runErr;

const { data: rpm, error: rpmErr } = await sb.from('route_progress_metrics')
  .select('workout_id,metric_date,decoupling_pct')
  .eq('user_id', USER_ID).gte('metric_date', minus(60));
if (rpmErr) throw rpmErr;
const rpmByWid = new Map((rpm || []).map((r) => [r.workout_id, r]));

console.log(`\nRuns in the last 60 days: ${runs?.length ?? 0}   |   route_progress_metrics rows: ${rpm?.length ?? 0}\n`);
console.log('date        status      route?  analysis?  decoup%  basis   workoutType      min    verdict');
console.log('─'.repeat(110));

let newestCounting = null;
const tally = {};

for (const w of runs || []) {
  const hrs = w.workout_analysis?.heart_rate_summary ?? null;
  const row = rpmByWid.get(w.id) ?? null;
  const pct = hrs?.decouplingPct ?? null;
  const basis = hrs?.decouplingBasis ?? null;
  const wt = hrs?.workoutType ?? null;
  const mins = hrs?.durationMinutes ?? null;

  let verdict;
  if (String(w.workout_status || '').toLowerCase() !== 'completed') verdict = 'not completed';
  else if (!row) verdict = 'STAGE 1 — no route row';
  else if (!w.workout_analysis) verdict = 'STAGE 2 — no workout_analysis';
  else if (typeof pct !== 'number' || !Number.isFinite(Number(pct))) verdict = 'STAGE 3 — no decouplingPct';
  else if (basis === 'raw') verdict = 'STAGE 3 — basis=raw';
  else if (!wt || NONSTEADY.some((k) => String(wt).toLowerCase().includes(k))) verdict = `STAGE 4 — not steady (${wt ?? 'null type'})`;
  else if (mins != null && Number(mins) < 20) verdict = 'STAGE 4 — under 20 min';
  else if (Number(pct) < -30 || Number(pct) > 50) verdict = 'STAGE 4 — implausible pct';
  else { verdict = 'COUNTS'; if (!newestCounting) newestCounting = w.date; }

  const key = verdict.startsWith('STAGE') ? verdict.split('—')[0].trim() : verdict;
  tally[key] = (tally[key] || 0) + 1;

  console.log(
    `${w.date}  ${String(w.workout_status || '?').padEnd(10)}  ${(row ? 'yes' : 'NO ').padEnd(6)}  ` +
    `${(w.workout_analysis ? 'yes' : 'NO ').padEnd(9)}  ${String(pct ?? '—').padStart(6)}  ` +
    `${String(basis ?? '—').padEnd(6)}  ${String(wt ?? '—').padEnd(15)}  ${String(mins ?? '—').padStart(4)}   ${verdict}`,
  );
}

console.log('\n─'.repeat(110));
console.log('TALLY:', tally);
console.log(`\nNewest run that COUNTS toward durability: ${newestCounting ?? 'NONE in 60 days'}`);
console.log(`Today: ${asOf}\n`);
