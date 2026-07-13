// Q-170 READ-ONLY: does heat actually PREDICT decoupling in this athlete's data?
// If the coefficient is ~0 / wrong-signed / not significant, a heat ADJUSTMENT is unbuildable and
// the honest answer is "show it raw". No writes.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const USER='45d122e7-a950-4d50-858c-380b492061aa';

const { data } = await sb.from('workouts').select('date,workout_analysis,weather_data')
  .eq('user_id',USER).eq('type','run').order('date',{ascending:true});

const NONSTEADY=['interval','fartlek','tempo','threshold','race','hill','sprint','vo2','repeat'];
const rows=[];
for (const w of data) {
  const wa = typeof w.workout_analysis==='string'?JSON.parse(w.workout_analysis):w.workout_analysis;
  const hrs = wa?.heart_rate_summary; if(!hrs) continue;
  const wd = typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  const temp = wd?.temperature_start_f ?? wd?.temperature ?? null;
  const dec = hrs.decouplingPct;
  const wt = String(hrs.workoutType??'').toLowerCase();
  if (dec==null || temp==null) continue;
  if (hrs.decouplingBasis === 'raw') continue;                 // terrain-confounded, already dropped
  const steady = wt.length>0 && !NONSTEADY.some(k=>wt.includes(k));
  rows.push({ date:w.date, t:Number(temp), ht:Math.max(0,Number(temp)-60), dec:Number(dec), steady, wt });
}

function ols(pts, label){
  const n=pts.length; if(n<3){console.log(`\n${label}: n=${n} — too few`);return;}
  const mx=pts.reduce((s,p)=>s+p.x,0)/n, my=pts.reduce((s,p)=>s+p.y,0)/n;
  const sxx=pts.reduce((s,p)=>s+(p.x-mx)**2,0), sxy=pts.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0);
  const syy=pts.reduce((s,p)=>s+(p.y-my)**2,0);
  if(sxx===0){console.log(`\n${label}: no x-variance`);return;}
  const b=sxy/sxx, a=my-b*mx;
  const r=sxy/Math.sqrt(sxx*syy);
  const resid=pts.map(p=>p.y-(a+b*p.x));
  const sse=resid.reduce((s,e)=>s+e*e,0);
  const se=Math.sqrt(sse/(n-2)/sxx);
  const t=b/se;
  console.log(`\n${label}`);
  console.log(`   n = ${n}`);
  console.log(`   slope = ${b.toFixed(4)} %-decoupling per degF above 60F`);
  console.log(`   r     = ${r.toFixed(3)}     r^2 = ${(r*r).toFixed(3)}   (how much of decoupling heat explains)`);
  console.log(`   t     = ${t.toFixed(2)}      ${Math.abs(t)>2 ? 'SIGNIFICANT (|t|>2)' : 'NOT SIGNIFICANT — cannot distinguish from zero'}`);
  const lo=b-2*se, hi=b+2*se;
  console.log(`   95% CI on the slope: [${lo.toFixed(4)}, ${hi.toFixed(4)}]  ${lo<0&&hi>0?'<-- STRADDLES ZERO. The sign is not even known.':''}`);
}

console.log(`=== DOES HEAT PREDICT DECOUPLING? (user 45d122e7, run history) ===`);
ols(rows.map(r=>({x:r.ht,y:r.dec})), 'ALL runs (heatTerm -> decoupling)');
const st = rows.filter(r=>r.steady);
ols(st.map(r=>({x:r.ht,y:r.dec})), 'STEADY-AEROBIC runs only (the actual durability substrate)');
const st1y = st.filter(r=> new Date(r.date) >= new Date(Date.now()-365*864e5));
ols(st1y.map(r=>({x:r.ht,y:r.dec})), 'STEADY-AEROBIC, last 365d');

// What the field's own claim would predict: ~2% drift at 22C vs ~11% at 35C => ~0.7%/C => ~0.39%/F
console.log(`\n   For reference, the dose-response cited in Q-170 (~2% at 22C -> ~11% at 35C) implies`);
console.log(`   a slope of roughly +0.39 %-decoupling per degF. Compare against the CI above.`);

const hot = st.filter(r=>r.t>75), cool = st.filter(r=>r.t<=70);
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
console.log(`\n=== BLUNT CHECK: hot vs cool steady runs ===`);
console.log(`   HOT  (>75F): n=${hot.length}  mean decoupling = ${hot.length?mean(hot.map(r=>r.dec)).toFixed(2):'--'}%`);
console.log(`   COOL (<=70F): n=${cool.length}  mean decoupling = ${cool.length?mean(cool.map(r=>r.dec)).toFixed(2):'--'}%`);
if(hot.length&&cool.length) console.log(`   difference = ${(mean(hot.map(r=>r.dec))-mean(cool.map(r=>r.dec))).toFixed(2)} pts  (positive = heat inflates decoupling, as theory says)`);
