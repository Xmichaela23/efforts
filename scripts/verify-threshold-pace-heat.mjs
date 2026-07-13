// Was the LEARNED THRESHOLD PACE (10:05/mi, "3 runs") measured in HEAT?
// If so it is deflated — you run slower at any given HR when hot — and every pace zone derived from it
// is shifted slow, making a correctly-run easy pace LOOK like Zone 3. READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const mi=s=>`${Math.floor(s*1.609344/60)}:${String(Math.round(s*1.609344%60)).padStart(2,'0')}/mi`;
const LTHR=151;

// learn-fitness-profile: threshold pace = runs whose avg HR is within +/-5bpm of learned threshold HR, 90d window
const cut=new Date(); cut.setDate(cut.getDate()-90);
const { data } = await sb.from('workouts')
  .select('date,avg_heart_rate,avg_pace,moving_time,duration,weather_data')
  .eq('user_id',USER).eq('type','run').eq('workout_status','completed')
  .gte('date', cut.toISOString().slice(0,10)).order('date',{ascending:true});

console.log(`Learned threshold pace = 10:05/mi, "pace at threshold HR (3 runs)". LTHR=${LTHR}.`);
console.log(`Which runs fed it? (avg HR within ~5 bpm of ${LTHR}, i.e. ${LTHR-5}-${LTHR+5})\n`);
console.log(`   date        tempF  avgHR   pace       HOT?`);
const hits=[];
for (const w of data) {
  const hr=w.avg_heart_rate; if(hr==null) continue;
  if (hr < LTHR-5 || hr > LTHR+5) continue;
  const wd = typeof w.weather_data==='string'?JSON.parse(w.weather_data):w.weather_data;
  const t = wd?.temperature_start_f ?? wd?.temperature ?? null;
  hits.push({date:w.date,hr,pace:w.avg_pace,t});
  console.log(`   ${w.date}  ${String(t??'--').padStart(5)}  ${String(hr).padStart(5)}   ${mi(w.avg_pace).padStart(9)}   ${t!=null&&t>75?'HOT':''}`);
}
if(!hits.length){ console.log('   (none in the 90d window — the value is carried from an older learn)'); }
else {
  const hot = hits.filter(h=>h.t!=null&&h.t>75).length;
  console.log(`\n   ${hot} of ${hits.length} threshold-pace runs were HOT (>75F).`);
  if (hot) console.log(`   -> the learned THRESHOLD PACE is measured in heat -> DEFLATED (slow) -> every`);
  if (hot) console.log(`      pace zone derived from it shifts SLOW -> a correctly-run easy pace looks like Z3.`);
}
console.log(`\n=== SANITY: what threshold pace would make his easy pace (11:08) land mid-Z2? ===`);
console.log(`   Friel Z2 = 114-129% of threshold pace. For 11:08 (668 s/mi) to sit MID-Z2 (~121%):`);
console.log(`   implied threshold pace = ${mi(668/1.21/1.609344)}  ... vs the learned ${mi(376)}`);
console.log(`   For 11:08 to be at the Z2 FLOOR (114%): threshold = ${mi(668/1.14/1.609344)}`);
