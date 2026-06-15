// READ-ONLY (Q-038): report stored duration fields + workload for the user's swims.
// Settles: is the FORM→Strava swim's moving_time ~18 (display-only bug) or ~701 (load polluted)?
// SELECT only. No writes.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';

const { data, error } = await sb.from('workouts')
  .select('id,date,name,type,workout_status,moving_time,duration,elapsed_time,distance,workload_actual,source')
  .eq('user_id', USER_ID)
  .eq('type', 'swim')
  .order('date', { ascending: false })
  .limit(40);

if (error) { console.error('QUERY ERROR:', error.message); process.exit(1); }

console.log('================ Q-038 SWIM READ (user 45d122e7) ================');
console.log('rows:', (data||[]).length);
console.log('date        status     moving_time  duration  elapsed  dist  wl_actual  source            name');
for (const r of (data||[])) {
  const f = (v,w)=>String(v ?? '·').padStart(w);
  console.log(
    `${r.date}  ${String(r.workout_status||'').padEnd(9)} ${f(r.moving_time,11)} ${f(r.duration,9)} ${f(r.elapsed_time,8)} ${f(r.distance,5)} ${f(r.workload_actual,9)}  ${String(r.source||'·').padEnd(16)} ${String(r.name||'').slice(0,30)}`
  );
}
// Flag any swim whose moving_time is implausibly large (the Q-038 signature ~701)
const suspect = (data||[]).filter(r => Number(r.moving_time) > 180); // >3h-as-minutes is impossible for a swim
console.log('\n--- SUSPECT (moving_time > 180, i.e. would read as >3h) ---');
if (!suspect.length) console.log('  none — all swims have plausible moving_time (≤180)');
for (const r of suspect) console.log(`  ${r.date}  moving_time=${r.moving_time}  workload_actual=${r.workload_actual}  ${r.name||''}`);
