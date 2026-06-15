import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WORKOUT_ID = '6bf694a6';

const { data: rows } = await sb
  .from('workouts')
  .select('id, name, date, type, source, duration, moving_time, avg_power, normalized_power, sensor_data, gps_track, computed')
  .eq('user_id','45d122e7-a950-4d50-858c-380b492061aa')
  .eq('date', '2026-06-02')
  .order('moving_time', { ascending: false });
const w = (rows || []).find(r => r.id.startsWith(WORKOUT_ID)) || (rows || [])[0];
if (!w) { console.error('not found'); process.exit(1); }
console.log('=== workout ===');
console.log(`id ${w.id}  source=${w.source}  type=${w.type}  date=${w.date}  duration=${w.duration}min  moving=${w.moving_time}min`);
console.log(`workouts.avg_power: ${w.avg_power}W   workouts.normalized_power (top-level / Strava): ${w.normalized_power}W`);

const ap = w.computed?.analysis?.power;
console.log(`computed.analysis.power.normalized_power (Efforts recompute): ${ap?.normalized_power}W`);
console.log(`computed.analysis.power.variability_index: ${ap?.variability_index}`);
console.log(`computed.analysis.power.intensity_factor: ${ap?.intensity_factor}`);
console.log(`computed.analysis.power.avg_power_pedaling_w: ${ap?.avg_power_pedaling_w}W`);
console.log(`computed.analysis.power.pct_time_pedaling: ${ap?.pct_time_pedaling}%`);

const sensor = typeof w.sensor_data === 'string' ? JSON.parse(w.sensor_data) : w.sensor_data;
const samples = Array.isArray(sensor?.samples) ? sensor.samples : (Array.isArray(sensor) ? sensor : []);
console.log(`\n=== raw sensor stream: ${samples.length} samples ===`);
if (samples.length === 0) { console.error('no samples'); process.exit(1); }

const first = samples[0];
console.log('first sample keys:', Object.keys(first).slice(0, 20).join(', '));
console.log('first sample:', JSON.stringify(first).slice(0, 300));

const powerField = (s) => {
  if (typeof s.power === 'number') return s.power;
  if (typeof s.watts === 'number') return s.watts;
  return undefined;
};

const rawPowers = samples.map(powerField);
const hasNumber = rawPowers.filter(p => typeof p === 'number').length;
const zeros = rawPowers.filter(p => p === 0).length;
const positive = rawPowers.filter(p => typeof p === 'number' && p > 0).length;
const undef = rawPowers.filter(p => p === undefined).length;
console.log(`\nRaw power field stats: total=${rawPowers.length}  numeric=${hasNumber}  zeros=${zeros}  positive=${positive}  undefined=${undef}`);

const positiveOnly = rawPowers.filter(p => typeof p === 'number' && p > 0);
if (positiveOnly.length > 0) {
  const sumPos = positiveOnly.reduce((a,b)=>a+b,0);
  console.log(`mean of positives (pedaling-only): ${(sumPos/positiveOnly.length).toFixed(1)}W   max: ${Math.max(...positiveOnly)}W`);
}
const allNumeric = rawPowers.filter(p => typeof p === 'number');
if (allNumeric.length > 0) {
  const sumAll = allNumeric.reduce((a,b)=>a+b,0);
  console.log(`mean of all numeric (zeros retained): ${(sumAll/allNumeric.length).toFixed(1)}W`);
}

// === Replicate Efforts' NP (zeros-stripped via short-circuit bug) ===
// normalizeSamples line 1069: power_w = (typeof s.power === 'number' && s.power) || ...
// Zero is falsy → becomes undefined → null in power_watts array.
// Then NP loop strips nulls.
function effortsNP(samples) {
  const pw = samples.map(s => {
    const v = (typeof s.power === 'number' && s.power) || (typeof s.watts === 'number' && s.watts) || undefined;
    return typeof v === 'number' ? v : null;
  });
  const windowSize = 30;
  const rollingAvgs = [];
  for (let i = 0; i < pw.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowPowers = pw.slice(windowStart, i + 1).filter(p => p !== null && !isNaN(p));
    if (windowPowers.length > 0) {
      const avg = windowPowers.reduce((a,b)=>a+b,0) / windowPowers.length;
      rollingAvgs.push(Math.pow(avg, 4));
    }
  }
  if (rollingAvgs.length === 0) return null;
  const meanFourth = rollingAvgs.reduce((a,b)=>a+b,0) / rollingAvgs.length;
  return Math.pow(meanFourth, 0.25);
}

// === True Coggan NP (zeros retained as 0W) ===
function trueCogganNP(samples) {
  const pw = samples.map(s => {
    if (typeof s.power === 'number') return s.power;
    if (typeof s.watts === 'number') return s.watts;
    return 0; // coasting = 0W
  });
  const windowSize = 30;
  const rollingAvgs = [];
  for (let i = 0; i < pw.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowPowers = pw.slice(windowStart, i + 1);
    const avg = windowPowers.reduce((a,b)=>a+b,0) / windowPowers.length;
    rollingAvgs.push(Math.pow(avg, 4));
  }
  // Coggan: drop first 30 seconds (incomplete window)
  const trimmed = rollingAvgs.slice(windowSize - 1);
  if (trimmed.length === 0) return null;
  const meanFourth = trimmed.reduce((a,b)=>a+b,0) / trimmed.length;
  return Math.pow(meanFourth, 0.25);
}

// === True Coggan NP, zeros retained but no startup trim (mirrors Efforts' lack of trim) ===
function cogganNoTrim(samples) {
  const pw = samples.map(s => {
    if (typeof s.power === 'number') return s.power;
    if (typeof s.watts === 'number') return s.watts;
    return 0;
  });
  const windowSize = 30;
  const rollingAvgs = [];
  for (let i = 0; i < pw.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowPowers = pw.slice(windowStart, i + 1);
    const avg = windowPowers.reduce((a,b)=>a+b,0) / windowPowers.length;
    rollingAvgs.push(Math.pow(avg, 4));
  }
  if (rollingAvgs.length === 0) return null;
  const meanFourth = rollingAvgs.reduce((a,b)=>a+b,0) / rollingAvgs.length;
  return Math.pow(meanFourth, 0.25);
}

const efforts = effortsNP(samples);
const correct = trueCogganNP(samples);
const correctNoTrim = cogganNoTrim(samples);

console.log(`\n=== NP recomputes ===`);
console.log(`Efforts implementation (zeros stripped):  ${efforts?.toFixed(1)}W`);
console.log(`True Coggan (zeros retained as 0W):       ${correct?.toFixed(1)}W`);
console.log(`Coggan-style without 30s startup trim:    ${correctNoTrim?.toFixed(1)}W`);
console.log(`\nGarmin reports:      141W`);
console.log(`Efforts displays:    169W  (= computed.analysis.power.normalized_power)`);
console.log(`Strava (top-level):  ${w.normalized_power}W`);

// === Sweet-spot interval analysis ===
const positiveOnlyDur = positiveOnly.length;
const totalDur = samples.length;
const coastFraction = (totalDur - positiveOnlyDur) / totalDur;
console.log(`\nCoast/zero fraction:  ${(coastFraction*100).toFixed(1)}%  (${totalDur - positiveOnlyDur} of ${totalDur} samples)`);
