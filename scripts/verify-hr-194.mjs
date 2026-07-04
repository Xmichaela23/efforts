// D-237 HR-plausibility: run the REAL detection on Michael's 194 ride + clean runs.
// Reports which mechanism catches the 194 (ceiling vs cadence-lock vs slew) and that
// the clean 178–182 runs pass untouched. Read-only.
//
// Run:  ~/.deno/bin/deno run --allow-read --allow-env --allow-net scripts/verify-hr-194.mjs
import {
  resolveMaxHrCeiling,
  assessHrPlausibility,
} from '../supabase/functions/_shared/hr-plausibility.ts';

const env = await Deno.readTextFile('.env');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] || '').trim();
const URL = get('SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const U = '45d122e7-a950-4d50-858c-380b492061aa';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const q = async (path) => (await fetch(URL + '/rest/v1/' + path, { headers: H })).json();

// Ceiling from all session maxes (robust-trimmed).
const maxes = await q(`workouts?select=max_heart_rate&user_id=eq.${U}&max_heart_rate=gt.100`);
const ceiling = resolveMaxHrCeiling({ observedMaxima: maxes.map((r) => r.max_heart_rate), age: 57 });
console.log(`ceiling: ${ceiling.ceiling} (basis ${ceiling.basis}, robust observed max ${ceiling.observedMax}, tanaka ${ceiling.tanaka})\n`);

function seriesOf(sd) {
  let s = sd;
  try { s = typeof sd === 'string' ? JSON.parse(sd) : sd; } catch { /* keep */ }
  const samples = Array.isArray(s?.samples) ? s.samples : Array.isArray(s) ? s : [];
  const hr = [], cad = [];
  for (const x of samples) {
    if (typeof x?.heart_rate === 'number') hr.push(x.heart_rate);
    if (typeof x?.cadence === 'number') cad.push(x.cadence);
  }
  return { hr, cad, n: samples.length };
}

async function assess(label, row) {
  const { hr, cad, n } = seriesOf(row.sensor_data);
  const v = assessHrPlausibility({
    maxHr: row.max_heart_rate, ceiling: ceiling.ceiling,
    hrSeries: hr, cadenceSeries: cad,
  });
  const corr = v.correlation == null ? 'n/a' : v.correlation.toFixed(3);
  console.log(`${label}  max ${row.max_heart_rate}  samples ${n} (hr ${hr.length}, cad ${cad.length})`);
  console.log(`   → corrupt=${v.corrupt}  reasons=[${v.reasons.join(', ') || 'none'}]  hr×cadence r=${corr}\n`);
  if (n === 0) console.log('   (no samples in workouts.sensor_data — likely Garmin, stored in garmin_activities)\n');
}

// The 194 ride
const ride = await q(`workouts?select=id,date,type,max_heart_rate,sensor_data&user_id=eq.${U}&type=eq.ride&max_heart_rate=eq.194&limit=1`);
if (ride[0]) await assess('194 RIDE (2025-05-15)', ride[0]);
else console.log('194 ride not found by exact match\n');

// A few clean runs (178–182) that must pass
const clean = await q(`workouts?select=id,date,type,max_heart_rate,sensor_data&user_id=eq.${U}&type=eq.run&max_heart_rate=gte.178&max_heart_rate=lte.182&order=max_heart_rate.desc&limit=3`);
for (const r of clean) await assess(`clean run ${r.date}`, r);
