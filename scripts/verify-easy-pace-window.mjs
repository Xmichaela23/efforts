// Q-173: the learner uses a ROLLING 90-DAY window and needs >=3 qualifying easy runs.
// If heat keeps disqualifying runs, the qualifying set doesn't just go stale — it AGES OUT.
// Project when run_easy_pace_sec_per_km goes NULL. READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const LTHR=151, FLOOR=Math.round(LTHR*0.70), CEIL=Math.round(LTHR*0.89);
const mi=s=>`${Math.floor(s*1.609344/60)}:${String(Math.round(s*1.609344%60)).padStart(2,'0')}/mi`;

const { data } = await sb.from('workouts')
  .select('date,avg_heart_rate,avg_pace,moving_time,duration,weather_data')
  .eq('user_id',USER).eq('type','run').eq('workout_status','completed').order('date',{ascending:true});

const qual = [];
for (const w of data) {
  const hr=w.avg_heart_rate, pace=w.avg_pace, min=Number(w.moving_time??w.duration??0);
  const wd = typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  const t = wd?.temperature_start_f ?? wd?.temperature ?? null;
  if (hr!=null && hr>=FLOOR && hr<=CEIL && min>=20 && pace>150 && pace<900) qual.push({date:w.date,hr,pace,t,min});
}
const TODAY = new Date('2026-07-13T00:00:00Z');
const inWin = qual.filter(r => (TODAY - new Date(r.date+'T00:00:00Z'))/86400000 <= 90);

console.log(`EASY BAND: ${FLOOR}-${CEIL} bpm (70-89% of LTHR ${LTHR}).  Learner window: ROLLING 90 DAYS. Needs >=3.\n`);
console.log(`QUALIFYING EASY RUNS INSIDE THE 90-DAY WINDOW (n=${inWin.length}):`);
console.log(`   date        tempF  avgHR   pace       ages out of the window on`);
for (const r of inWin) {
  const out = new Date(new Date(r.date+'T00:00:00Z').getTime() + 90*86400000);
  console.log(`   ${r.date}  ${String(r.t??'--').padStart(5)}  ${String(r.hr).padStart(5)}   ${mi(r.pace).padStart(9)}   ${out.toISOString().slice(0,10)}`);
}
console.log(`\nPROJECTION — assuming heat keeps disqualifying new runs (no NEW easy run qualifies):`);
const sorted=[...inWin].sort((a,b)=>a.date.localeCompare(b.date));
for (let drop=0; drop<sorted.length; drop++) {
  const remaining = sorted.length - (drop+1);
  const out = new Date(new Date(sorted[drop].date+'T00:00:00Z').getTime()+90*86400000).toISOString().slice(0,10);
  const flag = remaining < 3 ? '  <<< LEARNER GOES NULL — easy pace DISAPPEARS' : '';
  console.log(`   after ${out}: ${remaining} qualifying run${remaining===1?'':'s'} left${flag}`);
  if (remaining < 3) break;
}
console.log(`\nWhat it falls back to when null: performance_numbers.easyPace (your MANUAL 11:30/mi) or effort_paces.base.`);
