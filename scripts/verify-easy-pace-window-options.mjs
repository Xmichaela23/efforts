// What does each candidate window actually DO to the learner, on real data? READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const LTHR=151, FLOOR=Math.round(LTHR*0.70), CEIL=Math.round(LTHR*0.89);
const mi=s=>`${Math.floor(s*1.609344/60)}:${String(Math.round(s*1.609344%60)).padStart(2,'0')}/mi`;
const TODAY=new Date('2026-07-13T00:00:00Z');

const { data } = await sb.from('workouts')
  .select('date,avg_heart_rate,avg_pace,moving_time,duration')
  .eq('user_id',USER).eq('type','run').eq('workout_status','completed').order('date',{ascending:true});
const qual=[];
for (const w of data) {
  const hr=w.avg_heart_rate,pace=w.avg_pace,min=Number(w.moving_time??w.duration??0);
  if (hr!=null&&hr>=FLOOR&&hr<=CEIL&&min>=20&&pace>150&&pace<900)
    qual.push({date:w.date,pace,age:Math.floor((TODAY-new Date(w.date+'T00:00:00Z'))/86400000)});
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const MIN=3;

console.log(`QUALIFYING EASY RUNS (all history, HR ${FLOOR}-${CEIL}, >=20min):`);
for (const r of qual) console.log(`   ${r.date}  ${mi(r.pace)}   ${String(r.age).padStart(3)}d ago`);

console.log(`\n=== HARD WINDOW (what we do now: flat median, needs >=${MIN}) ===`);
for (const W of [30,42,60,90,120]) {
  const inw = qual.filter(r=>r.age<=W);
  const ok = inw.length>=MIN;
  const val = ok ? mi(med(inw.map(r=>r.pace))) : 'NULL — learner starves';
  const oldest = inw.length? Math.max(...inw.map(r=>r.age)) : 0;
  console.log(`   ${String(W).padStart(3)}d window: n=${inw.length}  ->  ${ok?val:val}${ok?`   (oldest contributor ${oldest}d)`:'   <<< falls back to the MANUAL 11:30/mi'}`);
}

console.log(`\n=== RECENCY-WEIGHTED (no cliff: every run counts, weight = 0.5^(age/halflife)) ===`);
console.log(`   A 30d HALF-LIFE gives 30d-window responsiveness WITHOUT throwing anything away.`);
for (const HL of [21,30,42]) {
  // weighted median
  const ws = qual.map(r=>({...r, w: Math.pow(0.5, r.age/HL)}));
  const tot = ws.reduce((s,r)=>s+r.w,0);
  const sorted=[...ws].sort((a,b)=>a.pace-b.pace);
  let acc=0, wmed=null;
  for (const r of sorted){ acc+=r.w; if(acc>=tot/2){ wmed=r.pace; break; } }
  const effN = tot;                                   // effective sample size
  const topw = [...ws].sort((a,b)=>b.w-a.w)[0];
  console.log(`   half-life ${String(HL).padStart(2)}d: weighted median = ${mi(wmed)}   effective n = ${effN.toFixed(2)}   (newest run carries ${(topw.w/tot*100).toFixed(0)}% of the weight)`);
}
console.log(`\n   For reference — flat 90d median (today's answer): ${mi(med(qual.filter(r=>r.age<=90).map(r=>r.pace)))}`);
