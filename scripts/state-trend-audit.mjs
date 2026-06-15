// READ-ONLY data audit for STATE v2 trends. No writes. Bundles the SHIPPED model and runs it
// against production data, comparing ground-truth sessions (workouts) vs what reaches each
// trend's source table (route_progress_metrics / workout_facts / pwr20 / exercise_log).
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = '/tmp/st-audit.mjs';
await build({ entryPoints: [new URL('../src/lib/state-trend/index.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'silent' });
const T = await import(pathToFileURL(OUT));

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const asOf = new Date().toISOString().slice(0, 10);
const TMS = Date.parse(asOf + 'T12:00:00Z');
const minus = (d) => new Date(TMS - d * 864e5).toISOString().slice(0, 10);
const age = (iso) => iso ? Math.round((TMS - Date.parse(iso + 'T12:00:00Z')) / 864e5) : null;
const inWin = (rows, dkey, days) => (rows || []).filter(r => String(r[dkey]) > minus(days));

const W = { strength: T.STRENGTH_THRESHOLDS.windowDays, bike: T.BIKE_THRESHOLDS.windowDays, run: T.RUN_THRESHOLDS.windowDays, swim: T.SWIM_THRESHOLDS.windowDays };
console.log(`================ STATE v2 TREND DATA AUDIT (user 45d122e7) ================`);
console.log(`asOf ${asOf} · windows: strength ${W.strength}d, bike ${W.bike}d, run ${W.run}d, swim ${W.swim}d\n`);

const table = []; // {disc, last, ageD, srcInWin, passFilter, verdict, fresh}

// ---------- ground truth: completed sessions per discipline from `workouts` ----------
const typeMap = { run: ['run'], bike: ['ride', 'bike'], swim: ['swim'], strength: ['strength'] };
const gt = {};
for (const [disc, types] of Object.entries(typeMap)) {
  const { data } = await sb.from('workouts').select('date,workout_status,type')
    .eq('user_id', USER_ID).in('type', types).order('date', { ascending: false });
  const completed = (data || []).filter(r => String(r.workout_status || '').toLowerCase() === 'completed');
  gt[disc] = { last: completed[0]?.date ?? null, all: completed, inWin: inWin(completed, 'date', W[disc]).length };
}

// ---------- STRENGTH (source: exercise_log; gate: estimated_1rm>0, ≥2 entries/lift like useExerciseLog) ----------
{
  const { data: el } = await sb.from('exercise_log').select('date,canonical_name,exercise_name,estimated_1rm,avg_rir')
    .eq('user_id', USER_ID).eq('discipline', 'strength').gte('date', minus(120)).order('date', { ascending: true });
  const rows = el || [];
  const winRows = inWin(rows, 'date', W.strength);
  const pos = winRows.filter(r => Number(r.estimated_1rm) > 0);
  const byLift = new Map();
  for (const r of pos) { const a = byLift.get(r.canonical_name) || []; a.push({ date: r.date, value: Number(r.estimated_1rm) }); byLift.set(r.canonical_name, a); }
  const series = [...byLift.entries()].filter(([, p]) => p.length >= 2).map(([canonical, points]) => ({ canonical, displayName: canonical, points }));
  const st = T.computeStrengthState(series, asOf);
  const rir5 = pos.filter(r => Number(r.avg_rir) >= 5).length;
  const lastEl = rows[rows.length - 1]?.date ?? null;
  console.log(`STRENGTH  (source exercise_log)`);
  console.log(`  workouts strength completed: last ${gt.strength.last} (${age(gt.strength.last)}d ago); ${gt.strength.inWin} in ${W.strength}d window`);
  console.log(`  exercise_log: ${winRows.length} rows in window, ${pos.length} with estimated_1rm>0 (${winRows.length - pos.length} fail gate), latest e-log ${lastEl} (${age(lastEl)}d)`);
  console.log(`  per-lift (≥4 = qualifies for verdict):`);
  for (const [lift, pts] of byLift) console.log(`     ${lift.padEnd(20)} ${pts.length} pts  ${pts.length >= 4 ? '✓ qualifies' : '· needs_data (<4)'}  last ${pts[pts.length - 1].date} (${age(pts[pts.length - 1].date)}d)`);
  console.log(`  RIR note: ${rir5}/${pos.length} in-window points have avg_rir≥5 (D-118 affects the learned AGGREGATE, NOT these per-session trend points — not a trend gate)`);
  console.log(`  → OVERALL VERDICT: ${st.overall}${st.overallPctChange != null ? ' ' + st.overallPctChange + '%' : ''}\n`);
  const lastQual = [...byLift.values()].flatMap(p => p).map(p => p.date).sort().pop();
  table.push({ disc: 'strength', last: gt.strength.last, ageD: age(gt.strength.last), srcInWin: pos.length, passFilter: [...byLift.values()].filter(p => p.length >= 4).length + ' lifts', verdict: st.overall, fresh: age(lastQual) != null && age(lastQual) <= 7 });
}

// ---------- BIKE (source: latest ride's pwr20_trend_v1.points; gate: ≥3 same classified_type) ----------
{
  const { data: rides } = await sb.from('workouts').select('date,workout_analysis')
    .eq('user_id', USER_ID).in('type', ['ride', 'bike']).not('workout_analysis', 'is', null)
    .order('date', { ascending: false }).limit(40);
  const candidates = (rides || []).map(r => r.workout_analysis?.pwr20_trend_v1).filter(Boolean);
  const latest = candidates[0] || null; // candidates are date-desc, so [0] = old "latest" pick
  const pwr20 = T.pickBestPwr20(candidates, asOf); // new "densest current" pick
  const pts = pwr20?.points || [];
  const ptsWin = pts.filter(p => String(p.date) > minus(W.bike));
  const series = T.pwr20ToSeries(pwr20);
  const bs = T.computeBikeState(series, asOf, pwr20?.classified_type || null);
  const latestWin = (latest?.points || []).filter(p => String(p.date) > minus(W.bike)).length;
  console.log(`BIKE  (source pwr20_trend_v1, ${candidates.length} candidate series)`);
  console.log(`  workouts ride completed: last ${gt.bike.last} (${age(gt.bike.last)}d ago); ${gt.bike.inWin} in ${W.bike}d window`);
  console.log(`  OLD pick (latest ride): ${latest?.classified_type || '—'} series, ${latestWin} in-window pts`);
  console.log(`  NEW pick (densest current): ${pwr20?.classified_type || '—'} series, ${ptsWin.length} in-window pts / ${pts.length} total`);
  if (pts.length) console.log(`  points: ${pts.map(p => `${p.date}:${p.value}W`).join('  ')}`);
  console.log(`  → VERDICT: ${bs.trend.verdict}${bs.trend.pctChange != null ? ' ' + bs.trend.pctChange + '%' : ''} (n=${bs.trend.sampleCount} in window, newest ${bs.trend.newestAgeDays}d, stale=${bs.trend.stale})\n`);
  table.push({ disc: 'bike', last: gt.bike.last, ageD: age(gt.bike.last), srcInWin: bs.trend.sampleCount, passFilter: `${ptsWin.length} pwr20`, verdict: bs.trend.verdict, fresh: bs.trend.sampleCount > 0 && pts.length ? age(ptsWin.map(p => p.date).sort().pop()) <= 7 : false });
}

// ---------- RUN (source: route_progress_metrics; gate: easy intent) ----------
{
  let rpm = [];
  try { const { data } = await sb.from('route_progress_metrics').select('metric_date,effort_adjusted_pace_sec_per_km,workout_id').eq('user_id', USER_ID).gte('metric_date', minus(120)).order('metric_date', { ascending: true }); rpm = data || []; }
  catch (e) { console.log('  (route_progress_metrics error:', e.message, ')'); }
  const win = inWin(rpm, 'metric_date', W.run);
  // join classified_type from workouts (the fix: gate on classified_type, not null workout_intent)
  const wids = [...new Set(win.map(r => r.workout_id).filter(Boolean))];
  const ctById = new Map();
  if (wids.length) { const { data: rw } = await sb.from('workouts').select('id,workout_analysis').in('id', wids); for (const w of (rw || [])) ctById.set(w.id, w.workout_analysis?.classified_type ?? null); }
  const joined = win.map(r => ({ metric_date: r.metric_date, effort_adjusted_pace_sec_per_km: r.effort_adjusted_pace_sec_per_km, classified_type: ctById.get(r.workout_id) ?? null }));
  const series = T.routeMetricsToSeries(joined);
  const rs = T.computeRunState(series, asOf);
  const cts = {}; for (const r of joined) { const k = String(r.classified_type || 'null'); cts[k] = (cts[k] || 0) + 1; }
  console.log(`RUN  (source route_progress_metrics + workouts.classified_type, gate easy)`);
  console.log(`  workouts run completed: last ${gt.run.last} (${age(gt.run.last)}d ago); ${gt.run.inWin} in ${W.run}d window`);
  console.log(`  route_progress_metrics: ${win.length} rows in ${W.run}d window  vs  ${gt.run.inWin} run workouts  → PIPELINE GAP = ${gt.run.inWin - win.length}`);
  console.log(`  classified_type breakdown in window: ${JSON.stringify(cts)}`);
  console.log(`  passing easy gate: ${series.length}/${win.length}  (need ≥4)`);
  console.log(`  → VERDICT: ${rs.trend.verdict}${rs.trend.pctChange != null ? ' ' + rs.trend.pctChange + '%' : ''} (n=${rs.trend.sampleCount}, newest ${rs.trend.newestAgeDays}d, stale=${rs.trend.stale})\n`);
  const lastEasy = series.map(r => r.date).sort().pop();
  console.log(`  easy-run GAP pace values (sec/km): ${series.map(p => `${p.date}:${p.value}`).join('  ')}`);
  table.push({ disc: 'run', last: gt.run.last, ageD: age(gt.run.last), srcInWin: win.length, passFilter: `${series.length} easy`, verdict: rs.trend.verdict, fresh: lastEasy ? age(lastEasy) <= 7 : false });
}

// ---------- SWIM (source: workout_facts.swim_facts.pace_per_100m; gate: plausibility 40–240) ----------
{
  const { data: wf } = await sb.from('workout_facts').select('date,swim_facts').eq('user_id', USER_ID).eq('discipline', 'swim').gte('date', minus(120)).order('date', { ascending: true });
  const rows = wf || [];
  const win = inWin(rows, 'date', W.swim);
  const withPace = win.filter(r => Number(r.swim_facts?.pace_per_100m) > 0);
  const mapped = T.swimPaceToSeries(win.map(r => ({ date: r.date, pace_per_100m: Number(r.swim_facts?.pace_per_100m) })));
  const ss = T.computeSwimState(mapped.series, asOf, mapped.dropped);
  console.log(`SWIM  (source workout_facts.swim_facts.pace_per_100m, gate plausibility 40–240 s/100m)`);
  console.log(`  workouts swim completed: last ${gt.swim.last} (${age(gt.swim.last)}d ago); ${gt.swim.inWin} in ${W.swim}d window`);
  console.log(`  workout_facts swim: ${win.length} rows in ${W.swim}d window (${withPace.length} with pace_per_100m)  vs  ${gt.swim.inWin} swim workouts  → PIPELINE GAP = ${gt.swim.inWin - withPace.length}`);
  console.log(`  passing plausibility gate: ${mapped.series.length} (${mapped.dropped} dropped implausible)`);
  if (mapped.series.length) console.log(`  series used: ${mapped.series.map(p => `${p.date}:${p.value}s(${age(p.date)}d)`).join('  ')}`);
  console.log(`  → VERDICT: ${ss.trend.verdict}${ss.trend.pctChange != null ? ' ' + ss.trend.pctChange + '%' : ''} (n=${ss.trend.sampleCount})`);
  const newest = mapped.series.map(p => p.date).sort().pop();
  console.log(`  ⚠ recency: newest in-window swim point is ${newest} (${age(newest)}d ago); window reaches back to ${minus(W.swim)} — verdict can rest on sessions up to ${W.swim}d old\n`);
  table.push({ disc: 'swim', last: gt.swim.last, ageD: age(gt.swim.last), srcInWin: withPace.length, passFilter: `${mapped.series.length} plaus`, verdict: ss.trend.verdict, fresh: newest ? age(newest) <= 7 : false });
}

// ---------- SUMMARY TABLE ----------
console.log('================ SUMMARY ================');
console.log('disc      last_session   age   src_in_window   passing_filter   verdict        fresh?');
for (const r of table) {
  console.log(`${r.disc.padEnd(9)} ${String(r.last).padEnd(13)} ${String(r.ageD + 'd').padStart(4)}   ${String(r.srcInWin).padStart(11)}   ${String(r.passFilter).padEnd(14)} ${String(r.verdict).padEnd(13)} ${r.verdict === 'needs_data' ? 'n/a' : (r.fresh ? 'FRESH (≤7d)' : 'STALE (>7d)')}`);
}
console.log('\nNote: "fresh?" = is the newest qualifying (in-window, filter-passing) session ≤7d old. STALE = verdict still shows but rests on data whose newest point is >7d old.');
