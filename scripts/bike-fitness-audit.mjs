// READ-ONLY: terrain-binned power + EF + HR-at-fixed-power, for the bike-fitness build decision.
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const OUT = '/tmp/bike-fit.mjs';
await build({ entryPoints: [new URL('../src/lib/state-trend/index.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'silent' });
const T = await import(pathToFileURL(OUT));
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER = '45d122e7-a950-4d50-858c-380b492061aa';
const asOf = new Date().toISOString().slice(0, 10), TMS = Date.parse(asOf + 'T12:00:00Z');
const minus = d => new Date(TMS - d * 864e5).toISOString().slice(0, 10);
const age = iso => iso ? Math.round((TMS - Date.parse(iso + 'T12:00:00Z')) / 864e5) : null;
const WIN = T.BIKE_THRESHOLDS.windowDays, FRESH = T.BIKE_THRESHOLDS.freshnessDays;
const inWin = iso => String(iso) > minus(WIN);
const stats = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); return { m: Math.round(m * 1000) / 1000, sd: Math.round(sd * 1000) / 1000, cv: Math.round(sd / m * 1000) / 10 }; };

const { data: rides } = await sb.from('workouts').select('date,workout_analysis,computed').eq('user_id', USER).in('type', ['ride', 'bike']).eq('workout_status', 'completed').gte('date', minus(90)).order('date', { ascending: true });
const R = (rides || []).map(r => {
  const c = r.computed || {}; const w20 = Number(c?.power_curve?.['20min']);
  const avgP = Number(c?.overall?.avg_power_w ?? c?.overall?.avg_power);
  const np = Number(c?.overall?.normalized_power ?? c?.analysis?.power?.normalized_power);
  const hr = Number(c?.overall?.avg_hr); const power = Number.isFinite(np) && np > 0 ? np : avgP;
  const ser = c?.analysis?.series || {};
  return { date: r.date, type: r.workout_analysis?.classified_type ?? null, w20: Number.isFinite(w20) && w20 > 0 ? Math.round(w20) : null, power: Number.isFinite(power) && power > 0 ? Math.round(power) : null, hr: Number.isFinite(hr) && hr > 0 ? Math.round(hr) : null, ef: (Number.isFinite(power) && power > 0 && Number.isFinite(hr) && hr > 0) ? Math.round(power / hr * 1000) / 1000 : null, pw: Array.isArray(ser.power_watts) ? ser.power_watts : null, hb: Array.isArray(ser.hr_bpm) ? ser.hr_bpm : null };
});
console.log(`============ BIKE FITNESS AUDIT (user 45d122e7) ============`);
console.log(`asOf ${asOf} · window ${WIN}d · staleness ${FRESH}d · ${R.length} rides/90d\n`);

// ===== PART 1: terrain-binned power =====
console.log('████ PART 1 — terrain-binned 20-min power ████');
console.log('Proposed bins: CLIMBING={climbing}; FLAT_SUSTAINED={threshold,sweet_spot,tempo}; EXCLUDED from power-trend={vo2 (no real 20-min max), endurance, endurance_long (sub-max aerobic → EF)}\n');
const BINS = { CLIMBING: new Set(['climbing']), FLAT_SUSTAINED: new Set(['threshold', 'sweet_spot', 'tempo']) };
console.log('bin             pts(90d) in-win  freshest   age  clears21d?  verdict');
for (const [name, types] of Object.entries(BINS)) {
  const pts = R.filter(r => r.w20 && types.has(String(r.type))).map(r => ({ date: r.date, value: r.w20 }));
  const win = pts.filter(p => inWin(p.date)); const fresh = win.map(p => p.date).sort().pop();
  const v = T.classifyTrend(pts, T.BIKE_THRESHOLDS, asOf);
  console.log(`${name.padEnd(15)} ${String(pts.length).padStart(6)} ${String(win.length).padStart(6)}  ${(fresh || '—')}  ${String(age(fresh)).padStart(3)}d  ${age(fresh) <= FRESH ? '✓' : '✗ stale '}    ${v.verdict}${v.pctChange != null ? ' ' + v.pctChange + '%' : ''} (n=${v.sampleCount},stale=${v.stale})`);
  console.log(`    points(in-win): ${win.map(p => `${p.date}:${p.value}W`).join('  ') || '—'}`);
}
const poolV = T.classifyTrend(R.filter(r => r.w20 && (BINS.CLIMBING.has(String(r.type)) || BINS.FLAT_SUSTAINED.has(String(r.type)))).map(r => ({ date: r.date, value: r.w20 })), T.BIKE_THRESHOLDS, asOf);
console.log(`  ⚖ ARTIFACT CHECK: cross-terrain pool (all together) = ${poolV.verdict} ${poolV.pctChange}% — vs FLAT_SUSTAINED alone above. Mixing terrains can invert the verdict.\n`);

// ===== PART 2a: raw EF =====
console.log('████ PART 2 — HR efficiency ████');
const STEADY = new Set(['endurance', 'endurance_long', 'sweet_spot', 'threshold', 'tempo', 'climbing']);
const ef = R.filter(r => STEADY.has(String(r.type)));
const efGood = ef.filter(r => r.ef != null), efWin = efGood.filter(r => inWin(r.date));
console.log(`RAW EF (power/HR): steady rides ${ef.length}/90d; with power+HR ${efGood.length}; in-window ${efWin.length}; freshest ${age(efWin.map(r=>r.date).sort().pop())}d`);
const efVals = efWin.map(r => r.ef), efS = stats(efVals);
let maxSwing = 0; for (let i = 1; i < efWin.length; i++) maxSwing = Math.max(maxSwing, Math.abs(efWin[i].ef - efWin[i - 1].ef) / efWin[i - 1].ef * 100);
console.log(`  EF in-window: ${efVals.join(', ')}`);
console.log(`  noise: mean ${efS.m}, sd ${efS.sd}, CV ${efS.cv}%, max consecutive-ride swing ${Math.round(maxSwing)}%`);
const efEarly = stats(efVals.slice(0, 2)).m, efRecent = stats(efVals.slice(-2)).m;
console.log(`  trend (2-pt endpoints): early ${efEarly} → recent ${efRecent} = ${Math.round((efRecent-efEarly)/efEarly*1000)/10}% (higher=better)\n`);

// ===== PART 2b: HR at fixed reference power (clean metric) =====
const REF_LO = 130, REF_HI = 150; // reference power band ~140W (covers most steady rides)
console.log(`HR@FIXED POWER (clean): mean HR where power ∈ [${REF_LO},${REF_HI}]W per ride. Lower HR = better.`);
const hrAt = [];
for (const r of efWin) {
  if (!r.pw || !r.hb || r.pw.length !== r.hb.length) { continue; }
  const hrs = []; for (let i = 0; i < r.pw.length; i++) { const p = Number(r.pw[i]), h = Number(r.hb[i]); if (Number.isFinite(p) && p >= REF_LO && p <= REF_HI && Number.isFinite(h) && h > 0) hrs.push(h); }
  if (hrs.length >= 60) hrAt.push({ date: r.date, value: Math.round(hrs.reduce((s, x) => s + x, 0) / hrs.length), n: hrs.length });
}
console.log(`  rides with ≥60 in-band samples (HR@ref computable): ${hrAt.length}/${efWin.length}`);
console.log(`  series: ${hrAt.map(x => `${x.date}:${x.value}bpm(${x.n}s,${age(x.date)}d)`).join('  ') || '—'}`);
if (hrAt.length >= 2) {
  const hv = hrAt.map(x => x.value), hs = stats(hv);
  let hSwing = 0; for (let i = 1; i < hrAt.length; i++) hSwing = Math.max(hSwing, Math.abs(hrAt[i].value - hrAt[i - 1].value) / hrAt[i - 1].value * 100);
  const hEarly = stats(hv.slice(0, 2)).m, hRecent = stats(hv.slice(-2)).m;
  console.log(`  noise: mean ${hs.m}bpm, sd ${hs.sd}, CV ${hs.cv}%, max consecutive swing ${Math.round(hSwing)}%  ← compare to raw EF CV ${efS.cv}%`);
  console.log(`  trend: early ${hEarly} → recent ${hRecent}bpm = ${Math.round((hRecent-hEarly)/hEarly*1000)/10}% (lower=better → ${hRecent<hEarly?'improving':'worsening'})`);
}
