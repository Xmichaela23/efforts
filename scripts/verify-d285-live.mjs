// D-285/Q-173/Q-174 live check against the DEPLOYED code. Read-only except the learner re-run
// (which is the app's own idempotent learner, not a hand-write).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const SB=env.SUPABASE_URL, KEY=env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SB, KEY, {auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const H={'Content-Type':'application/json','Authorization':`Bearer ${KEY}`,'apikey':KEY};

const r = await fetch(`${SB}/functions/v1/learn-fitness-profile`,{method:'POST',headers:H,body:JSON.stringify({user_id:USER})});
console.log('learn-fitness-profile (deployed v47) →', r.status);
await new Promise(x=>setTimeout(x,3000));

const { data } = await sb.from('user_baselines').select('learned_fitness,performance_numbers').eq('user_id',USER).single();
const lf = typeof data.learned_fitness==='string'?JSON.parse(data.learned_fitness):data.learned_fitness;
const pn = typeof data.performance_numbers==='string'?JSON.parse(data.performance_numbers):data.performance_numbers;

console.log('\n=== Q-173: does `as_of` land? (the freshness stamp) ===');
for (const k of ['run_threshold_hr','run_easy_hr','run_easy_pace_sec_per_km']) {
  const m = lf?.[k];
  if (!m) { console.log(`  ${k.padEnd(28)} null`); continue; }
  const age = m.as_of ? Math.floor((Date.now()-new Date(m.as_of+'T00:00:00Z'))/864e5) : null;
  console.log(`  ${k.padEnd(28)} ${String(m.value).padStart(4)}  as_of=${m.as_of ?? 'MISSING'}${age!=null?` (${age}d ago)`:''}  conf=${m.confidence}  n=${m.sample_count}`);
}
console.log('\n=== the BASIS string Baselines now renders (was thrown away) ===');
console.log(`  "${lf?.run_easy_pace_sec_per_km?.source ?? '—'}"`);
console.log('\n=== Q-174: the athlete\'s choice ===');
console.log(`  performance_numbers.easyPace          = ${pn?.easyPace ?? 'null'}`);
console.log(`  performance_numbers.easy_pace_source  = ${pn?.easy_pace_source ?? '(unset → learned-first, i.e. today\'s behavior)'}`);
