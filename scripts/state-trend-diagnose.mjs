// READ-ONLY diagnosis: run-intent source + bike pwr20 population. No writes.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const asOf = new Date().toISOString().slice(0, 10);
const minus = (d) => new Date(Date.parse(asOf + 'T12:00:00Z') - d * 864e5).toISOString().slice(0, 10);

// ---------- RUN INTENT: is workout_type null at SOURCE (workouts.computed) or lost before RPM? ----------
console.log('================ RUN INTENT DIAGNOSIS ================');
console.log('RPM.workout_intent is written from workouts.computed.analysis.heart_rate.workout_type (compute-facts:930)\n');
const { data: runs } = await sb.from('workouts')
  .select('id,date,computed,workout_analysis,planned_id')
  .eq('user_id', USER_ID).eq('type', 'run').eq('workout_status', 'completed')
  .gte('date', minus(42)).order('date', { ascending: false });
const { data: rpm } = await sb.from('route_progress_metrics')
  .select('workout_id,metric_date,workout_intent').eq('user_id', USER_ID).gte('metric_date', minus(42));
const rpmByWid = new Map((rpm || []).map(r => [r.workout_id, r.workout_intent]));
console.log('date        computed.hr.workout_type   wa.classified_type   RPM.workout_intent   planned?');
let srcNull = 0, hasUpstream = 0;
for (const r of (runs || [])) {
  const hrType = r.computed?.analysis?.heart_rate?.workout_type ?? null;
  const waType = r.workout_analysis?.classified_type ?? null;
  const rpmIntent = rpmByWid.has(r.id) ? rpmByWid.get(r.id) : '(no RPM row)';
  if (hrType == null) srcNull++; else hasUpstream++;
  console.log(`${r.date}  ${String(hrType ?? '—').padEnd(24)} ${String(waType ?? '—').padEnd(20)} ${String(rpmIntent ?? 'null').padEnd(20)} ${r.planned_id ? 'Y' : 'n'}`);
}
console.log(`\n  SOURCE check: ${srcNull}/${(runs || []).length} runs have NULL computed.analysis.heart_rate.workout_type (the RPM source field).`);
console.log(`  ${hasUpstream} runs have a non-null workout_type upstream but RPM.workout_intent is null ⇒ lost in write.`);
console.log(`  VERDICT: ${srcNull === (runs || []).length ? 'NULL AT SOURCE — workout_type never classified in workouts.computed (no HR-based type), so RPM legitimately stores null.' : hasUpstream > 0 ? 'LOST DOWNSTREAM — upstream has intent but RPM lost it.' : 'mixed'}`);

// ---------- BIKE PWR20: legit type-filter sparsity vs population gap ----------
console.log('\n================ BIKE PWR20 DIAGNOSIS ================');
const { data: rides } = await sb.from('workouts')
  .select('id,date,workout_analysis').eq('user_id', USER_ID).in('type', ['ride', 'bike']).eq('workout_status', 'completed')
  .gte('date', minus(56)).order('date', { ascending: false });
console.log(`${(rides || []).length} completed rides in 56d window:`);
console.log('date        classified_type      has_pwr20?   pwr20_pts  pwr20_type   has_wa?');
const typeCounts = {};
let withPwr20 = 0;
for (const r of (rides || [])) {
  const wa = r.workout_analysis;
  const ct = wa?.classified_type ?? null;
  const p = wa?.pwr20_trend_v1;
  typeCounts[ct ?? 'null'] = (typeCounts[ct ?? 'null'] || 0) + 1;
  if (p?.points?.length) withPwr20++;
  console.log(`${r.date}  ${String(ct ?? '—').padEnd(20)} ${(p?.points?.length ? 'YES' : 'no ').padEnd(11)} ${String(p?.points?.length ?? 0).padStart(6)}     ${String(p?.classified_type ?? '—').padEnd(12)} ${wa ? 'Y' : 'n'}`);
}
console.log(`\n  classified_type distribution (56d): ${JSON.stringify(typeCounts)}`);
console.log(`  rides carrying a pwr20_trend_v1 series: ${withPwr20}/${(rides || []).length}`);
console.log('  (pwr20 requires ≥3 same-classified_type rides in 90d to populate — analyze-cycling-workout)');
