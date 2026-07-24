// The efficiency easing-off is real (not heat). WHAT is it? Decompose: HR up or pace down?
// Plus confound checks: distance, elevation, within-run drift, run volume/frequency. READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const mi = s => s==null?'--':`${Math.floor(s*1.609344/60)}:${String(Math.round(s*1.609344%60)).padStart(2,'0')}`;

const { data: ws } = await sb.from('workouts')
  .select('id,date,type,weather_data,moving_time,duration').eq('user_id',USER)
  .order('date',{ascending:true});
const { data: fs } = await sb.from('workout_facts').select('workout_id,run_facts').eq('user_id',USER);
const F = new Map((fs??[]).map(f=>[f.workout_id, typeof f.run_facts==='string'?JSON.parse(f.run_facts):f.run_facts]));

// qualifying steady runs, same 30-70 band
const runs=[];
for (const w of (ws??[]).filter(w=>w.type==='run')) {
  const rf = F.get(w.id); if(!rf) continue;
  const durMin = Number(w.moving_time ?? w.duration ?? 0);
  if(!(durMin>=30 && durMin<=70)) continue;
  const eff = rf.efficiency_index; if(!(Number.isFinite(eff)&&eff>=0.5&&eff<=5)) continue;
  const wd = typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  runs.push({ date:w.date, eff, hr:rf.hr_avg, pace:rf.pace_avg_s_per_km,
    distKm:(rf.distance_m??0)/1000, elevM:rf.elevation_gain_m, drift:rf.hr_drift_pct,
    t: wd?.temperature_start_f ?? wd?.temperature ?? null });
}
const asOf = runs.length?runs[runs.length-1].date:null;
const start = new Date(new Date(asOf+'T12:00:00Z').getTime()-84*86400000).toISOString().slice(0,10);
const win = runs.filter(r=>r.date>start && r.date<=asOf);
const half=Math.floor(win.length/2), E=win.slice(0,half), R=win.slice(-half||win.length);
const mean=(a,k)=>{const v=a.map(x=>x[k]).filter(Number.isFinite);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};

console.log(`=== EARLY vs RECENT half of the 12-wk window (${win.length} runs) ===`);
const rowsY=[['efficiency','eff',3],['avg HR (bpm)','hr',0],['pace (min/mi)','pace','pace'],
  ['distance (mi)','distKm','mi'],['elev gain (ft)','elevM','ft'],['within-run drift %','drift',1],['temp F','t',0]];
console.log(`   metric              EARLY      RECENT     change`);
for(const [lab,k,fmt] of rowsY){
  let e=mean(E,k), r=mean(R,k), d=(e!=null&&r!=null)?r-e:null, f=x=>x==null?'--':
    fmt==='pace'?mi(x)+'/mi': fmt==='mi'?(x*0.621371).toFixed(1): fmt==='ft'?Math.round(x*3.281):
    (typeof fmt==='number'?x.toFixed(fmt):x);
  let ds = d==null?'--': fmt==='pace'?`${d>0?'+':''}${Math.round(d*1.609344)} s/mi`:
    fmt==='mi'?`${d>0?'+':''}${(d*0.621371).toFixed(1)}`: fmt==='ft'?`${d>0?'+':''}${Math.round(d*3.281)}`:
    `${d>0?'+':''}${(typeof fmt==='number'?d.toFixed(fmt):d)}`;
  console.log(`   ${lab.padEnd(20)}${String(f(e)).padStart(8)}   ${String(f(r)).padStart(8)}   ${ds}`);
}

// Run volume/frequency by week across the window (detraining check)
console.log(`\n=== RUN VOLUME BY WEEK (all runs, not just qualifying) — detraining check ===`);
const allRun = (ws??[]).filter(w=>w.type==='run' && w.date>start);
const wk = d => { const dt=new Date(d+'T12:00:00Z'); const day=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-day); return dt.toISOString().slice(0,10); };
const byWk = {};
for(const w of allRun){ const rf=F.get(w.id); const km=(rf?.distance_m??0)/1000; (byWk[wk(w.date)] ??= {n:0,mi:0}); byWk[wk(w.date)].n++; byWk[wk(w.date)].mi+=km*0.621371; }
for(const k of Object.keys(byWk).sort()) console.log(`   wk ${k}:  ${byWk[k].n} runs   ${byWk[k].mi.toFixed(1)} mi`);

// Strength volume by week (fatigue-timing check)
console.log(`\n=== STRENGTH SESSIONS BY WEEK — fatigue-timing check ===`);
const allStr = (ws??[]).filter(w=>w.type==='strength' && w.date>start);
const sWk={}; for(const w of allStr){ (sWk[wk(w.date)] ??= 0); sWk[wk(w.date)]++; }
for(const k of Object.keys(sWk).sort()) console.log(`   wk ${k}:  ${sWk[k]} strength sessions`);
