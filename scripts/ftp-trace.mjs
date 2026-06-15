#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SB_URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'michaela@test.com';
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } });

let USER_ID = null;
for (let page = 1; page <= 50 && !USER_ID; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error); process.exit(1); }
  const found = data.users.find(x => (x.email || '').toLowerCase() === EMAIL);
  if (found) USER_ID = found.id;
  if (!data.users.length) break;
}
if (!USER_ID) { console.error('no user found across pages'); process.exit(1); }
console.log('USER_ID:', USER_ID);

const { data: baseline, error: bErr } = await sb
  .from('user_baselines')
  .select('id, performance_numbers, learned_fitness, updated_at')
  .eq('user_id', USER_ID)
  .maybeSingle();
if (bErr) console.error('baseline err', bErr);

console.log('\n=== user_baselines.performance_numbers.ftp ===');
console.log(baseline?.performance_numbers?.ftp ?? '(null)');

console.log('\n=== user_baselines.learned_fitness.ride_ftp_estimated ===');
console.log(JSON.stringify(baseline?.learned_fitness?.ride_ftp_estimated, null, 2));

console.log('\n=== user_baselines.learned_fitness.last_updated ===');
console.log(baseline?.learned_fitness?.last_updated ?? '(null)');
console.log('=== user_baselines.learned_fitness.ride_max_hr_observed ===');
console.log(JSON.stringify(baseline?.learned_fitness?.ride_max_hr_observed, null, 2));
console.log('=== user_baselines.learned_fitness.ride_threshold_hr ===');
console.log(JSON.stringify(baseline?.learned_fitness?.ride_threshold_hr, null, 2));

const today = new Date();
const ninetyAgo = new Date(today.getTime() - 90 * 86400 * 1000);
const ninetyAgoISO = ninetyAgo.toISOString().slice(0, 10);

const rideTypes = ['ride','cycling','bike','virtualride','indoorcycling','gravelride','ebikeride','mountainbikeride'];
const { data: rides, error: rErr } = await sb
  .from('workouts')
  .select('id, date, type, name, duration, moving_time, distance, avg_power, normalized_power, avg_heart_rate, max_heart_rate, computed')
  .eq('user_id', USER_ID)
  .eq('workout_status', 'completed')
  .in('type', rideTypes)
  .gte('date', ninetyAgoISO)
  .order('date', { ascending: false });
if (rErr) console.error('rides err', rErr);

console.log(`\n=== ${rides?.length || 0} ride(s) in 90d window (since ${ninetyAgoISO}) ===`);

const ridesEnriched = (rides || []).map(r => ({
  id: r.id?.slice(0,8),
  date: r.date,
  type: r.type,
  name: (r.name || '').slice(0, 50),
  dur_min: r.duration,
  mov_min: r.moving_time,
  np: r.normalized_power,
  avg_p: r.avg_power,
  avg_hr: r.avg_heart_rate,
  max_hr: r.max_heart_rate,
  p20: r.computed?.power_curve?.['20min'] ?? null,
  p60: r.computed?.power_curve?.['60min'] ?? null,
}));
console.table(ridesEnriched);

const obsMaxHR = Math.max(...(rides||[]).filter(r => r.max_heart_rate>100 && r.max_heart_rate<220).map(r => r.max_heart_rate), 0) || null;
console.log('\nobserved max HR (90d ride window):', obsMaxHR);

const withPower = (rides||[]).filter(r => (r.avg_power && r.avg_power > 50) || (r.normalized_power && r.normalized_power > 50));
const allPowers = withPower.filter(r => r.avg_power > 50).map(r => r.avg_power).sort((a,b)=>a-b);
const p75 = allPowers.length >= 4 ? allPowers[Math.floor(allPowers.length*0.75)] : null;
console.log('rides with power > 50:', withPower.length, 'P75 avg_power:', p75);

const sustained = withPower.filter(r => {
  const d = r.moving_time || r.duration || 0;
  return d >= 20 && d <= 120;
});
const p20Bests = sustained.map(r => r.computed?.power_curve?.['20min']).filter(p => p && p > 50);
console.log('\nTier 1 (20-min bests):', p20Bests.length, 'eligible. need ≥2.');
if (p20Bests.length) console.log('  values:', p20Bests, 'max:', Math.max(...p20Bests), '→ FTP =', Math.round(Math.max(...p20Bests)*0.95));

const hard = sustained.filter(r => {
  const hr = r.avg_heart_rate || 0;
  const pw = r.normalized_power || r.avg_power || 0;
  return (obsMaxHR && hr >= obsMaxHR*0.80) || (p75 && pw >= p75*0.85);
});
const hardNPs = hard.filter(r => r.normalized_power > 50).map(r => r.normalized_power).sort((a,b)=>b-a);
console.log('\nTier 2 (hard-effort NP):', hardNPs.length, 'eligible.');
if (hardNPs.length) console.log('  values:', hardNPs.slice(0,5), 'best:', hardNPs[0], '→ FTP =', Math.round(hardNPs[0]*0.95));

console.log('\nHard rides detail:');
console.table(hard.map(r => ({
  id: r.id?.slice(0,8), date: r.date,
  dur: r.moving_time || r.duration, np: r.normalized_power, avg_p: r.avg_power,
  avg_hr: r.avg_heart_rate, max_hr: r.max_heart_rate,
  isHardByHR: obsMaxHR ? (r.avg_heart_rate >= obsMaxHR*0.80) : null,
  isHardByPower: p75 ? ((r.normalized_power || r.avg_power) >= p75*0.85) : null,
})));
