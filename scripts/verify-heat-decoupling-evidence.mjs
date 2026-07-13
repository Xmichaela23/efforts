// Q-170 READ-ONLY evidence check: is there enough TEMPERATURE SPREAD in the run history to
// identify a heat coefficient separately from fitness? No writes.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('/Users/michaelambp/efforts/.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const USER='45d122e7-a950-4d50-858c-380b492061aa';

const { data, error } = await sb.from('workouts')
  .select('id,date,type,workout_analysis,weather_data,moving_time,duration,avg_heart_rate')
  .eq('user_id',USER).eq('type','run').order('date',{ascending:true});
if (error) { console.error(error); Deno?.exit?.(1); process.exit(1); }

const TEMP_REF_F = 60;                       // heat-adjust.ts hinge
const heatTerm = t => t==null ? null : Math.max(0, t - TEMP_REF_F);
const rows = [];
for (const w of data) {
  const wa = typeof w.workout_analysis==='string'?JSON.parse(w.workout_analysis):w.workout_analysis;
  const hrs = wa?.heart_rate_summary;
  const wd = typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  const temp = wd?.temperature_start_f ?? wd?.temperature ?? null;
  rows.push({
    date: w.date,
    dec: hrs?.decouplingPct ?? null,
    basis: hrs?.decouplingBasis ?? null,
    confounded: hrs?.decouplingConfounded ?? null,
    wtype: hrs?.workoutType ?? null,
    temp: temp==null?null:Number(temp),
    min: Number(w.moving_time ?? w.duration ?? 0),
  });
}
console.log(`TOTAL RUNS: ${rows.length}`);
const withTemp = rows.filter(r=>r.temp!=null);
console.log(`  with a temperature: ${withTemp.length}   (no temp -> cannot heat-model at all)`);
const withDec = rows.filter(r=>r.dec!=null);
console.log(`  with a decoupling %: ${withDec.length}`);
const both = rows.filter(r=>r.dec!=null && r.temp!=null);
console.log(`  with BOTH (the modelable substrate): ${both.length}`);
console.log(`  of those, flagged heat-confounded (currently DELETED from the trend): ${both.filter(r=>r.confounded===true).length}`);

const sd = a => { if(a.length<2) return 0; const m=a.reduce((s,x)=>s+x,0)/a.length; return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1)); };
const f=(n)=>n==null?'  -- ':n.toFixed(1).padStart(6);

function window(days, label) {
  const cut = new Date(); cut.setDate(cut.getDate()-days);
  const w = both.filter(r=> new Date(r.date) >= cut);
  const temps = w.map(r=>r.temp);
  const hts = w.map(r=>heatTerm(r.temp));
  console.log(`\n── ${label} (last ${days}d) ──`);
  console.log(`   runs w/ temp+decoupling: ${w.length}`);
  if (!w.length) return;
  console.log(`   temp range: ${Math.min(...temps).toFixed(0)}-${Math.max(...temps).toFixed(0)}F   SD=${sd(temps).toFixed(1)}F`);
  console.log(`   heatTerm (max(0,T-60)) SD = ${sd(hts).toFixed(2)}F   <-- needs >= 4.0 to identify a coefficient (HEAT_SPREAD_MIN)`);
  console.log(`   VERDICT: ${sd(hts) >= 4 ? 'IDENTIFIABLE — heat can be separated from fitness' : 'NOT identifiable — heat and fitness are confounded in this window'}`);
  console.log(`   decoupling: min ${Math.min(...w.map(r=>r.dec)).toFixed(1)}%  max ${Math.max(...w.map(r=>r.dec)).toFixed(1)}%`);
}
window(42, 'RUN DURABILITY WINDOW (the one State actually uses)');
window(90, 'a 90-day window');
window(365, 'a full year');

console.log(`\n── every run with both, newest 30 ──`);
console.log(`   date        tempF  heatT   dec%   hot?  type`);
for (const r of both.slice(-30)) {
  console.log(`   ${r.date}  ${f(r.temp)} ${f(heatTerm(r.temp))} ${f(r.dec)}   ${r.confounded===true?'HOT ':'    '}  ${r.wtype??'-'}`);
}
