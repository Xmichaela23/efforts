// Does HEAT slow the PACE-AT-EASY-HR? (Different question from D-283, which was about DECOUPLING.)
// If an athlete SLOWS DOWN to hold HR on a hot day, the run still qualifies as "easy" (HR in band) but
// its pace is heat-depressed -> the learned easy pace drifts slow -> the D-033 reconciler can read it as
// DETRAINING and slow the plan down. READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const mi = s => s==null?'--':`${Math.floor(s*1.609344/60)}:${String(Math.round(s*1.609344%60)).padStart(2,'0')}`;

const { data: ws } = await sb.from('workouts')
  .select('id,date,avg_heart_rate,avg_pace,moving_time,duration,weather_data')
  .eq('user_id',USER).eq('type','run').order('date',{ascending:true});
const { data: fs } = await sb.from('workout_facts').select('workout_id,run_facts').eq('user_id',USER);
const F = new Map((fs??[]).map(f=>[f.workout_id, typeof f.run_facts==='string'?JSON.parse(f.run_facts):f.run_facts]));

const LTHR=151, FLOOR=Math.round(LTHR*0.70), CEIL=Math.round(LTHR*0.89);
const rows=[];
for (const w of ws) {
  const wd = typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  const t = wd?.temperature_start_f ?? wd?.temperature ?? null;
  const hum = wd?.humidity_pct ?? wd?.humidity ?? null;
  const rf = F.get(w.id);
  const hr = w.avg_heart_rate, pace = w.avg_pace;
  const min = Number(w.moving_time ?? w.duration ?? 0);
  const easy = hr!=null && hr>=FLOOR && hr<=CEIL && min>=20;
  rows.push({ date:w.date, t:t==null?null:Number(t), hum:hum==null?null:Number(hum), hr, pace, min, easy,
              paceAtEasy: rf?.pace_at_easy_hr ?? null });
}

console.log(`=== YOUR LAST 8 RUNS ===`);
console.log(`   date        tempF  hum%   avgHR   avgPace   min   in easy band?   pace_at_easy_hr stored`);
for (const r of rows.slice(-8)) {
  console.log(`   ${r.date}  ${String(r.t??'--').padStart(5)}  ${String(r.hum??'--').padStart(4)}  ${String(r.hr??'--').padStart(5)}   ${mi(r.pace).padStart(6)}/mi  ${String(Math.round(r.min)).padStart(4)}   ${r.easy?'YES — COUNTS':'no  — excluded'}    ${r.paceAtEasy?mi(r.paceAtEasy)+'/mi':'--'}`);
}

// The regression that matters: among runs that QUALIFY as easy, does heat slow the pace?
const q = rows.filter(r=>r.easy && r.pace!=null && r.t!=null);
console.log(`\n=== AMONG RUNS THE LEARNER ACCEPTS AS "EASY" (n=${q.length}), DOES HEAT SLOW THE PACE? ===`);
function ols(pts,label){
  const n=pts.length; if(n<4){console.log(`   ${label}: n=${n} — too few to say`);return;}
  const mx=pts.reduce((s,p)=>s+p.x,0)/n,my=pts.reduce((s,p)=>s+p.y,0)/n;
  const sxx=pts.reduce((s,p)=>s+(p.x-mx)**2,0),sxy=pts.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0);
  const syy=pts.reduce((s,p)=>s+(p.y-my)**2,0);
  if(sxx===0){console.log('   no temp variance');return;}
  const b=sxy/sxx,a=my-b*mx,r=sxy/Math.sqrt(sxx*syy);
  const sse=pts.reduce((s,p)=>s+(p.y-(a+b*p.x))**2,0);
  const se=Math.sqrt(sse/(n-2)/sxx),t=b/se,lo=b-2*se,hi=b+2*se;
  console.log(`   n=${n}`);
  console.log(`   slope = ${(b*1.609344).toFixed(2)} sec/mile SLOWER per degF above 60F`);
  console.log(`   t = ${t.toFixed(2)}   r^2 = ${(r*r).toFixed(3)}   ${Math.abs(t)>2?'*** SIGNIFICANT — HEAT IS SLOWING THE LEARNED EASY PACE ***':'not significant'}`);
  console.log(`   95% CI: [${(lo*1.609344).toFixed(2)}, ${(hi*1.609344).toFixed(2)}] sec/mi per degF ${lo<0&&hi>0?' straddles zero':''}`);
  const at60=a+b*0, at85=a+b*25;
  console.log(`   implied easy pace at 60F: ${mi(at60)}/mi     at 85F: ${mi(at85)}/mi     -> ${Math.round((at85-at60)*1.609344)} sec/mi of HEAT`);
}
ols(q.map(r=>({x:Math.max(0,r.t-60), y:r.pace})), 'heatTerm -> avg_pace (qualifying easy runs)');

const hot=q.filter(r=>r.t>75), cool=q.filter(r=>r.t<=70);
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
console.log(`\n=== BLUNT CHECK (qualifying easy runs only) ===`);
console.log(`   HOT  (>75F): n=${hot.length}  mean easy pace = ${hot.length?mi(mean(hot.map(r=>r.pace)))+'/mi':'--'}`);
console.log(`   COOL (<=70F): n=${cool.length}  mean easy pace = ${cool.length?mi(mean(cool.map(r=>r.pace)))+'/mi':'--'}`);
if(hot.length&&cool.length){
  const d=(mean(hot.map(r=>r.pace))-mean(cool.map(r=>r.pace)))*1.609344;
  console.log(`   difference = ${d>0?'+':''}${Math.round(d)} sec/mi  (positive = hot runs are SLOWER at the same HR)`);
}
