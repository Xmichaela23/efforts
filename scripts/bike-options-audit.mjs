// READ-ONLY: what would BIKE show under (1) current exact-type pooling, (2) loosened
// sustained-power pooling, (3) HR-at-power efficiency? No writes. Bundles the shipped model.
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = '/tmp/bike-opt.mjs';
await build({ entryPoints: [new URL('../src/lib/state-trend/index.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'silent' });
const T = await import(pathToFileURL(OUT));

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const asOf = new Date().toISOString().slice(0, 10);
const TMS = Date.parse(asOf + 'T12:00:00Z');
const minus = (d) => new Date(TMS - d * 864e5).toISOString().slice(0, 10);
const age = (iso) => iso ? Math.round((TMS - Date.parse(iso + 'T12:00:00Z')) / 864e5) : null;
const WIN = T.BIKE_THRESHOLDS.windowDays, FRESH = T.BIKE_THRESHOLDS.freshnessDays;

const { data: rides } = await sb.from('workouts')
  .select('date,workout_analysis,computed').eq('user_id', USER_ID).in('type', ['ride', 'bike']).eq('workout_status', 'completed')
  .gte('date', minus(90)).order('date', { ascending: true });

// extract per-ride: date, type, 20min power, avg power, NP, avg HR, EF
const R = (rides || []).map(r => {
  const c = r.computed || {};
  const w20 = Number(c?.power_curve?.['20min']);
  const avgP = Number(c?.overall?.avg_power_w ?? c?.overall?.avg_power);
  const np = Number(c?.overall?.normalized_power ?? c?.analysis?.power?.normalized_power ?? c?.overall?.np_w);
  const hr = Number(c?.overall?.avg_hr);
  const power = Number.isFinite(np) && np > 0 ? np : avgP;
  const ef = (Number.isFinite(power) && power > 0 && Number.isFinite(hr) && hr > 0) ? Math.round((power / hr) * 1000) / 1000 : null;
  return { date: r.date, type: r.workout_analysis?.classified_type ?? null, w20: Number.isFinite(w20) && w20 > 0 ? Math.round(w20) : null, power: Number.isFinite(power) && power > 0 ? Math.round(power) : null, hr: Number.isFinite(hr) && hr > 0 ? Math.round(hr) : null, ef };
});
const inWin = (iso) => String(iso) > minus(WIN);

console.log(`================ BIKE OPTIONS AUDIT (user 45d122e7) ================`);
console.log(`asOf ${asOf} · bike window ${WIN}d · staleness gate ${FRESH}d · ${R.length} rides in 90d\n`);

// ---------- OPTION 1: current exact-type pooling ----------
console.log('──── OPTION 1: current (exact-type pooling) ────');
const byType = {};
for (const r of R) { if (!r.w20) continue; (byType[r.type ?? 'null'] ||= []).push(r); }
console.log('type            pts(90d)  pts(in-win)  newest   age  ≥3?  fresh(≤21d)?');
for (const [t, arr] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
  const win = arr.filter(r => inWin(r.date));
  const newest = arr.map(r => r.date).sort().pop();
  console.log(`${t.padEnd(15)} ${String(arr.length).padStart(7)}  ${String(win.length).padStart(10)}  ${newest}  ${String(age(newest)).padStart(3)}d  ${win.length >= 3 ? '✓' : '·'}    ${age(newest) <= FRESH ? '✓ fresh' : '✗ stale'}`);
}
// what the shipped pickBestPwr20 lands on = densest in-window single type → then staleness gate
const candidates = Object.values(byType).map(arr => ({ points: arr.map(r => ({ date: r.date, value: r.w20 })), classified_type: 'x' }));
const best = T.pickBestPwr20(candidates, asOf);
const o1 = T.computeBikeState(T.pwr20ToSeries(best), asOf, null).trend;
console.log(`  → shipped verdict (densest single type + staleness gate): ${o1.verdict} (n=${o1.sampleCount}, newest ${o1.newestAgeDays}d, stale=${o1.stale})\n`);

// ---------- OPTION 2: loosened sustained-power pooling ----------
console.log('──── OPTION 2: loosened pooling {climbing + threshold + sweet_spot} = "sustained power" ────');
const SUSTAINED = new Set(['climbing', 'threshold', 'sweet_spot']);
const pool = R.filter(r => r.w20 && SUSTAINED.has(String(r.type))).map(r => ({ date: r.date, value: r.w20 }));
const poolWin = pool.filter(p => inWin(p.date));
console.log(`  pooled 20-min points: ${pool.length} in 90d, ${poolWin.length} in ${WIN}d window`);
console.log(`  points (in-win): ${poolWin.map(p => `${p.date}:${p.value}W(${age(p.date)}d)`).join('  ') || '—'}`);
const freshest = poolWin.map(p => p.date).sort().pop();
console.log(`  freshest in-win point: ${freshest || '—'} (${age(freshest)}d) → ${age(freshest) <= FRESH ? '✓ clears 21d gate' : '✗ still stale'}`);
const o2 = T.classifyTrend(pool, T.BIKE_THRESHOLDS, asOf);
console.log(`  → verdict: ${o2.verdict}${o2.pctChange != null ? ' ' + o2.pctChange + '%' : ''} (n=${o2.sampleCount}, newest ${o2.newestAgeDays}d, stale=${o2.stale})`);
console.log(`  ⚠ caveat: pools 20-min power across climbing/threshold/sweet_spot — terrain differs (climbing 20-min ≠ flat-threshold 20-min), so it's a looser "best sustained effort" proxy, not a single comparable effort.\n`);

// ---------- OPTION 3: HR-at-power efficiency (EF = power/HR) ----------
console.log('──── OPTION 3: HR-at-power efficiency (EF = NP-or-avgP / avg_HR) across ALL steady rides ────');
const STEADY = new Set(['endurance', 'endurance_long', 'sweet_spot', 'threshold', 'tempo', 'climbing']);
const efAll = R.filter(r => STEADY.has(String(r.type)));
const efGood = efAll.filter(r => r.ef != null);
const efWin = efGood.filter(r => inWin(r.date));
console.log(`  steady rides in 90d: ${efAll.length}; with BOTH power+HR (EF computable): ${efGood.length}; in ${WIN}d window: ${efWin.length}`);
console.log(`  missing power-or-HR (no EF): ${efAll.length - efGood.length} steady rides`);
console.log(`  EF series (in-win): ${efWin.map(r => `${r.date}:${r.ef}(${r.power}W/${r.hr}bpm,${age(r.date)}d)`).join('  ') || '—'}`);
const efFresh = efWin.map(r => r.date).sort().pop();
const efSeries = efGood.map(r => ({ date: r.date, value: r.ef }));
// EF is higher-better → use a BIKE-like threshold but NOT lowerIsBetter; thresholds are illustrative only
const o3 = T.classifyTrend(efSeries, { windowDays: WIN, improvePct: 3, slidePct: -3, minSessions: 4, freshnessDays: FRESH }, asOf);
console.log(`  freshest EF point: ${efFresh || '—'} (${age(efFresh)}d) → ${age(efFresh) <= FRESH ? '✓ fresh' : '✗ stale'}`);
console.log(`  → illustrative verdict (EF higher-better, ±3% placeholder thresholds — NONE signed off): ${o3.verdict}${o3.pctChange != null ? ' ' + o3.pctChange + '%' : ''} (n=${o3.sampleCount}, newest ${o3.newestAgeDays}d, stale=${o3.stale})`);
console.log(`  ⚠ caveat: EF (power/HR) is sensitive to duration, heat, cardiac drift, fueling; "HR at a FIXED reference power" is cleaner but needs power-binning. EF thresholds are undefined (would need sign-off like the others).\n`);

// ---------- SUMMARY ----------
console.log('================ SUMMARY ================');
console.log('option                         escapes needs_data?   verdict        freshest   caveat');
const row = (n, esc, v, f, c) => console.log(`${n.padEnd(30)} ${esc.padEnd(20)} ${String(v).padEnd(14)} ${String(f).padEnd(10)} ${c}`);
row('1 exact-type (shipped)', o1.verdict !== 'needs_data' ? 'yes' : 'no', o1.verdict, (o1.newestAgeDays ?? '—') + 'd', 'sparse single type; densest is stale');
row('2 loosened sustained-power', o2.verdict !== 'needs_data' ? 'yes' : 'no', o2.verdict, (o2.newestAgeDays ?? '—') + 'd', 'terrain-mixed 20-min proxy');
row('3 HR-at-power efficiency', o3.verdict !== 'needs_data' ? 'yes' : 'no', o3.verdict, (o3.newestAgeDays ?? '—') + 'd', 'EF noisy; thresholds undefined');
