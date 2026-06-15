// READ-ONLY "see it" trace for STATE v2 step 1.
// Bundles the REAL src/lib/state-trend module (single source) via esbuild, then runs it
// against live data (SELECT only) and prints per-discipline verdicts. No writes.
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// 1) bundle the pure trend module so the trace runs the exact shipping logic
const OUT = '/tmp/state-trend-bundle.mjs';
await build({
  entryPoints: [new URL('../src/lib/state-trend/index.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'silent',
});
const T = await import(pathToFileURL(OUT));

// 2) read-only supabase
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const asOf = new Date().toISOString().slice(0, 10);

const ICON = { improving: '▲ improving', holding: '▬ holding', sliding: '▼ sliding', needs_data: '· needs data' };
const pc = (n) => (n == null ? '  —  ' : `${n > 0 ? '+' : ''}${n}%`);

console.log('================ STATE v2 — trend model (read-only) ================');
console.log('user 45d122e7 · asOf', asOf, '\n');

// ---- STRENGTH ----
const { data: elog } = await sb.from('exercise_log')
  .select('canonical_name,exercise_name,date,estimated_1rm,workout_id')
  .eq('user_id', USER_ID).eq('discipline', 'strength')
  .gte('date', T.STRENGTH_THRESHOLDS ? new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10) : '2000-01-01')
  .order('date', { ascending: true });

const wids = [...new Set((elog || []).map(r => r.workout_id).filter(Boolean))];
const nameById = new Map();
for (let i = 0; i < wids.length; i += 100) {
  const { data: ws } = await sb.from('workouts').select('id,name').in('id', wids.slice(i, i + 100));
  for (const w of (ws || [])) nameById.set(w.id, w.name);
}

const byLift = new Map();
for (const r of (elog || [])) {
  if (!(Number(r.estimated_1rm) > 0)) continue;
  const arr = byLift.get(r.canonical_name) || [];
  arr.push({ date: r.date, value: Number(r.estimated_1rm), meta: { name: nameById.get(r.workout_id) || '' } });
  byLift.set(r.canonical_name, arr);
}
const liftSeries = [...byLift.entries()].map(([canonical, points]) => ({
  canonical, displayName: (elog.find(r => r.canonical_name === canonical)?.exercise_name) || canonical, points,
}));

const strength = T.computeStrengthState(liftSeries, asOf);
console.log('STRENGTH');
console.log(`  OVERALL: ${ICON[strength.overall]}  ${pc(strength.overallPctChange)}   (follows primary lifts)`);
for (const l of strength.lifts.sort((a, b) => b.trend.sampleCount - a.trend.sampleCount)) {
  const t = l.trend;
  console.log(`    ${l.isPrimary ? 'P' : ' '} ${String(l.displayName).slice(0, 22).padEnd(22)} ${ICON[t.verdict].padEnd(13)} ${pc(t.pctChange).padStart(7)}  n=${t.sampleCount} (${t.window.start}→${t.window.end})`);
}

// ---- BIKE ----
const { data: rides } = await sb.from('workouts')
  .select('id,date,name,workout_analysis')
  .eq('user_id', USER_ID).in('type', ['ride', 'bike'])
  .not('workout_analysis', 'is', null)
  .order('date', { ascending: false }).limit(30);

let pwr20 = null, rideType = null, rideDate = null;
for (const r of (rides || [])) {
  const p = r.workout_analysis?.pwr20_trend_v1;
  if (p?.points?.length) { pwr20 = p; rideType = p.classified_type || null; rideDate = r.date; break; }
}
const series = T.pwr20ToSeries(pwr20);
const bike = T.computeBikeState(series, asOf, rideType);
console.log('\nBIKE  (source: pwr20_trend_v1' + (rideDate ? ` from ${rideDate} ride` : ', none found') + ')');
console.log(`  ${ICON[bike.trend.verdict]}  ${pc(bike.trend.pctChange)}   metric="${bike.metricLabel}"${rideType ? ` · ${String(rideType).replace(/_/g, ' ')} rides` : ''}`);
console.log(`    n=${bike.trend.sampleCount} in window (${bike.trend.window.start}→${bike.trend.window.end}); raw pwr20 points available=${series.length}`);
if (series.length) console.log('    series:', series.map(p => `${p.date}:${p.value}W`).join('  '));

// ---- ADHERENCE + HYBRID DISCIPLINE CARDS (step 2) ----
const AW = T.ADHERENCE_WINDOW_DAYS;
const adhStart = new Date(Date.parse(asOf + 'T12:00:00Z') - (AW - 1) * 864e5).toISOString().slice(0, 10);
const disc = (t) => {
  const s = String(t || '').toLowerCase();
  if (s.includes('run')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('strength')) return 'strength';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'bike';
  return null;
};
const { data: planned } = await sb.from('planned_workouts')
  .select('type,date').eq('user_id', USER_ID).gte('date', adhStart).lte('date', asOf);
const { data: done } = await sb.from('workouts')
  .select('type,date,workout_status').eq('user_id', USER_ID).gte('date', adhStart).lte('date', asOf);
const plannedBy = {}, doneBy = {};
for (const p of (planned || [])) { const k = disc(p.type); if (k) plannedBy[k] = (plannedBy[k] || 0) + 1; }
for (const w of (done || [])) { if (String(w.workout_status || '').toLowerCase() !== 'completed') continue; const k = disc(w.type); if (k) doneBy[k] = (doneBy[k] || 0) + 1; }

// RUN performance — GAP pace at comparable effort (route_progress_metrics, easy intent, 42d)
const runStart = new Date(Date.parse(asOf + 'T12:00:00Z') - 42 * 864e5).toISOString().slice(0, 10);
let runSeries = [];
try {
  const { data: rpm } = await sb.from('route_progress_metrics')
    .select('metric_date,effort_adjusted_pace_sec_per_km,workout_id')
    .eq('user_id', USER_ID).gte('metric_date', runStart)
    .order('metric_date', { ascending: true });
  const wids = [...new Set((rpm || []).map(r => r.workout_id).filter(Boolean))];
  const ctById = new Map();
  if (wids.length) { const { data: rw } = await sb.from('workouts').select('id,workout_analysis').in('id', wids); for (const w of (rw || [])) ctById.set(w.id, w.workout_analysis?.classified_type ?? null); }
  runSeries = T.routeMetricsToSeries((rpm || []).map(r => ({ metric_date: r.metric_date, effort_adjusted_pace_sec_per_km: r.effort_adjusted_pace_sec_per_km, classified_type: ctById.get(r.workout_id) ?? null })));
} catch (e) { console.log('  (run source unavailable:', e.message, ')'); }
const run = T.computeRunState(runSeries, asOf);

// SWIM performance — pace per 100 (workout_facts.swim_facts.pace_per_100m, Q-038-guarded, 56d)
const swimStart = new Date(Date.parse(asOf + 'T12:00:00Z') - 56 * 864e5).toISOString().slice(0, 10);
let swimMapped = { series: [], dropped: 0 };
try {
  const { data: wf } = await sb.from('workout_facts')
    .select('date,swim_facts').eq('user_id', USER_ID).eq('discipline', 'swim')
    .gte('date', swimStart).order('date', { ascending: true });
  const rows = (wf || []).map(r => ({ date: r.date, pace_per_100m: Number(r.swim_facts?.pace_per_100m) }));
  swimMapped = T.swimPaceToSeries(rows);
} catch (e) { console.log('  (swim source unavailable:', e.message, ')'); }
const swim = T.computeSwimState(swimMapped.series, asOf, swimMapped.dropped);

const perfByDisc = {
  strength: { verdict: strength.overall, pctChange: strength.overallPctChange },
  bike: T.perfFromTrend(bike.trend),
  run: T.perfFromTrend(run.trend),
  swim: T.perfFromTrend(swim.trend),
};
console.log(`\n================ HYBRID DISCIPLINE CARDS + HEADLINE (adherence window ${AW}d: ${adhStart}→${asOf}) ================`);
console.log(`DISPLAY_MODE = ${T.DISPLAY_MODE}  (adherence shown only where performance absent; flip to 'co-equal' is one spot)`);
console.log(`  run perf: ${runSeries.length} easy GAP points in 42d; swim perf: ${swimMapped.series.length} pace points in 56d (${swimMapped.dropped} dropped Q-038-implausible)`);
const cards = [];
for (const k of ['strength', 'bike', 'run', 'swim']) {
  const adh = T.computeAdherenceState({ discipline: k, windowDays: AW, planned: plannedBy[k] || 0, completed: doneBy[k] || 0 });
  const card = T.resolveDisciplineCard({ discipline: k, performance: perfByDisc[k], adherence: adh });
  cards.push(card);
  const head = card.primaryAxis === 'performance' ? `PERF ${ICON[card.headlineVerdict]}` : `ADHERENCE "${adh.ratioLabel}"`;
  console.log(`  ${k.toUpperCase().padEnd(9)} primary=${card.primaryAxis.padEnd(11)} showAdherence=${card.showAdherence ? 'yes' : 'no '}  →  ${head}   (context tags: ${adh.context.length})`);
}
const hl = T.synthesizeHeadline(cards);
console.log(`\n  HEADLINE → "${hl.line}"   (off-plan stays on server intent_summary, not synthesized here)`);

// ---- LOGIC DEMO (synthetic) — exercise the verdict bands + noise guards on the SAME primitive ----
// Live data above is too thin in-window to show non-needs_data verdicts, so demonstrate the
// classifier directly. Strength thresholds (6wk / +2.5 / -2.0 / min 4); dates relative to asOf.
const d = (back) => new Date(Date.parse(asOf + 'T12:00:00Z') - back * 864e5).toISOString().slice(0, 10);
const P = (vals) => vals.map(([back, value, name]) => ({ date: d(back), value, meta: name ? { name } : undefined }));
const ST = T.STRENGTH_THRESHOLDS;
console.log('\n================ LOGIC DEMO (synthetic series → same primitive) ================');
const cases = [
  ['clean improve  225→240', P([[40, 225], [30, 228], [18, 235], [5, 240]])],
  ['holding (wobble)        ', P([[40, 200], [28, 203], [14, 198], [4, 201]])],
  ['sliding 185→176         ', P([[38, 185], [26, 184], [12, 179], [3, 176]])],
  ['1-PR spike (noise-guard)', P([[40, 200], [30, 201], [16, 202], [2, 230]])], // single PR damped by 2-pt avg
  ['deload week excluded    ', P([[40, 220], [30, 224], [12, 205, 'Lower Deload'], [4, 232]])],
  ['too few (n=3 → needs)   ', P([[30, 210], [15, 214], [3, 219]])],
];
for (const [label, pts] of cases) {
  const r = T.classifyTrend(pts, ST, asOf, { exclude: T.isDeloadWeek });
  console.log(`  ${label}  →  ${ICON[r.verdict].padEnd(13)} ${pc(r.pctChange).padStart(7)}  (n=${r.sampleCount}, early=${r.earlyAvg ?? '—'} recent=${r.recentAvg ?? '—'})`);
}
// pace cases — lowerIsBetter: a DECREASE in sec/km is improving (RUN_THRESHOLDS)
const paceCases = [
  ['run pace 300→291 s/km   ', P([[38, 300], [26, 298], [12, 294], [3, 291]])], // faster → improving
  ['run pace 300→309 s/km   ', P([[38, 300], [26, 302], [12, 306], [3, 309]])], // slower → sliding
];
for (const [label, pts] of paceCases) {
  const r = T.classifyTrend(pts, T.RUN_THRESHOLDS, asOf, { exclude: T.isDeloadWeek });
  console.log(`  ${label}  →  ${ICON[r.verdict].padEnd(13)} ${pc(r.pctChange).padStart(7)}  (lowerIsBetter: raw ${pc(r.pctChange)} pace ⇒ ${r.verdict})`);
}
// headline synthesis — gating (swim) + neutral empty state + trusted-leads
console.log('\n  -- headline synthesis (swim gated, empty = neutral) --');
const mkCard = (d, v) => T.resolveDisciplineCard({
  discipline: d,
  performance: v ? { verdict: v, pctChange: v === 'sliding' ? -3 : v === 'improving' ? 3 : 0 } : null,
  adherence: T.computeAdherenceState({ discipline: d, windowDays: 7, planned: 1, completed: 0 }),
});
const hlDemo = [
  ['ONE mover: run sliding', [mkCard('run', 'sliding'), mkCard('strength', 'holding')]],
  ['ONE mover: strength up', [mkCard('strength', 'improving'), mkCard('bike', 'holding')]],
  ['swim improving ONLY (gated)', [mkCard('swim', 'improving')]],
  ['strength up + swim up', [mkCard('strength', 'improving'), mkCard('swim', 'improving')]],
  ['bike sliding + run up', [mkCard('bike', 'sliding'), mkCard('run', 'improving')]],
  ['all thin → neutral', [mkCard('strength', null), mkCard('bike', null)]],
];
for (const [label, cs] of hlDemo) console.log(`    ${label.padEnd(30)} → "${T.synthesizeHeadline(cs).line}"`);
console.log('  note: "1-PR spike" → the 2-pt endpoint avg damps 230→216 (w/ 202) but, as the FINAL point, it keeps');
console.log('        50% weight, so a single end-of-window PR can still tip holding→improving (+7.7%). FLAGGED.');
console.log('        "deload week excluded" → dropping the 205 lb deload session takes n 4→3, below the min-4 gate,');
console.log('        so it reads needs_data. The deload-exclude interacts with the min-session floor. FLAGGED.');

console.log('\n(steps 1+2 — perf primitive + strength/bike adapters + adherence fallback + hybrid resolver.');
console.log(' NOT built: run/swim performance adapters, two-part headline synthesis, StateTab wiring.)');
