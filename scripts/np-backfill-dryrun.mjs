import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';
const FTP = 176;

const rideTypes = ['ride','cycling','bike','virtualride','indoorcycling','gravelride','ebikeride','mountainbikeride'];
const today = new Date();
const ninetyAgoISO = new Date(today.getTime() - 90*86400*1000).toISOString().slice(0,10);

const { data: rides } = await sb
  .from('workouts')
  .select('id, name, date, type, source, sensor_data, computed, duration, moving_time')
  .eq('user_id', USER_ID)
  .eq('workout_status', 'completed')
  .in('type', rideTypes)
  .gte('date', ninetyAgoISO)
  .order('date', { ascending: false });

// Replicate the FIXED algorithm exactly:
//  - normalizeSamples line 1069 (fixed): power_w preserves 0
//  - power_watts line 1189: typeof r.power_w === 'number' ? r.power_w : null
//  - NP loop line 1244-1258 with 30s Coggan trim
function computeFixed(samples, ftp) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  // Mirror normalizeSamples coercion (fixed form): preserve 0
  const power_watts = samples.map(s => {
    const v = typeof s.power === 'number' ? s.power
      : typeof s.watts === 'number' ? s.watts
      : undefined;
    return typeof v === 'number' ? v : null;
  });
  const windowSize = 30;
  const rollingAvgs = [];
  for (let i = 0; i < power_watts.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const windowPowers = power_watts.slice(start, i + 1).filter(p => p !== null && !isNaN(p));
    if (windowPowers.length > 0) {
      const avg = windowPowers.reduce((a,b)=>a+b,0) / windowPowers.length;
      rollingAvgs.push(Math.pow(avg, 4));
    }
  }
  // Coggan: drop first 30s (incomplete rolling windows)
  const trimmed = rollingAvgs.slice(windowSize - 1);
  if (trimmed.length === 0) return null;
  const meanFourth = trimmed.reduce((a,b)=>a+b,0) / trimmed.length;
  const np = Math.pow(meanFourth, 0.25);

  // Avg power for VI: same filter as line 1261 (null-strip, accept 0)
  const allNumeric = power_watts.filter(p => p !== null);
  const avgPower = allNumeric.length > 0
    ? allNumeric.reduce((a,b)=>a+b,0) / allNumeric.length
    : 0;
  const vi = avgPower > 0 ? np / avgPower : null;
  const intF = ftp > 0 ? np / ftp : null;

  // TSS: mirrors computeRideTss — (durSec × NP × IF) / (FTP × 3600) × 100
  // durSec from sample time span:
  const ts = samples.map(s => Number(
    s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsed_s ?? s.offsetInSeconds ?? s.startTimeInSeconds ?? 0
  )).filter(Number.isFinite);
  const durSec = ts.length >= 2 ? Math.max(0, ts[ts.length - 1] - ts[0]) : 0;
  const tss = (intF != null && durSec > 0)
    ? (durSec * np * intF) / (ftp * 3600) * 100
    : null;

  return { np: Math.round(np), vi: vi ? Number(vi.toFixed(2)) : null, intF: intF ? Number(intF.toFixed(2)) : null, tss: tss != null ? Math.round(tss) : null, durSec, samples: power_watts.length };
}

const out = [];
for (const r of rides) {
  const sensor = typeof r.sensor_data === 'string' ? JSON.parse(r.sensor_data) : r.sensor_data;
  const samples = Array.isArray(sensor?.samples) ? sensor.samples : (Array.isArray(sensor) ? sensor : []);
  const oldP = r.computed?.analysis?.power || {};
  const newF = computeFixed(samples, FTP);
  out.push({
    id: r.id.slice(0, 8),
    name: (r.name || '').slice(0, 32),
    date: r.date,
    type: r.type,
    dur_min: r.moving_time,
    samples: samples.length,
    old_np: oldP.normalized_power ?? null,
    new_np: newF?.np ?? null,
    delta_np: (oldP.normalized_power != null && newF?.np != null) ? (newF.np - oldP.normalized_power) : null,
    old_vi: oldP.variability_index != null ? Number(oldP.variability_index.toFixed(2)) : null,
    new_vi: newF?.vi ?? null,
    old_if: oldP.intensity_factor != null ? Number(oldP.intensity_factor.toFixed(2)) : null,
    new_if: newF?.intF ?? null,
    old_tss: oldP.tss ?? null,
    new_tss: newF?.tss ?? null,
  });
}
console.log(`\n=== Dry-run backfill (NO WRITES) — user 45d122e7, FTP=${FTP}, ${rides.length} rides ===\n`);
console.table(out);

const swung = out.filter(r => r.delta_np != null && Math.abs(r.delta_np) >= 5);
console.log(`\n${swung.length} of ${out.length} rides have |Δ NP| ≥ 5W.`);
const indoorish = out.filter(r => /zwift|indoor|treadmill/i.test(r.name));
if (indoorish.length > 0) {
  console.log(`\nIndoor/Zwift rides (expect tiny change — little coasting):`);
  console.table(indoorish.map(r => ({ id: r.id, name: r.name, old_np: r.old_np, new_np: r.new_np, delta: r.delta_np })));
}
