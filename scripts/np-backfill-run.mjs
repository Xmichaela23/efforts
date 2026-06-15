import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';

const rideTypes = ['ride','cycling','bike','virtualride','indoorcycling','gravelride','ebikeride','mountainbikeride'];
const today = new Date();
const ninetyAgoISO = new Date(today.getTime() - 90*86400*1000).toISOString().slice(0,10);

const { data: rides } = await sb
  .from('workouts')
  .select('id, name, date')
  .eq('user_id', USER_ID)
  .eq('workout_status', 'completed')
  .in('type', rideTypes)
  .gte('date', ninetyAgoISO)
  .order('date', { ascending: false });

console.log(`Backfilling ${rides.length} rides via compute-workout-analysis edge function...\n`);

const results = [];
for (const r of rides) {
  const start = Date.now();
  const resp = await fetch(`${env.SUPABASE_URL}/functions/v1/compute-workout-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ workout_id: r.id }),
  });
  const dur = Date.now() - start;
  const ok = resp.status === 200;
  let body = '';
  try { body = (await resp.text()).slice(0, 200); } catch {}
  results.push({ id: r.id.slice(0,8), date: r.date, name: (r.name||'').slice(0,30), status: resp.status, ms: dur });
  console.log(`  ${ok ? '✓' : '✗'}  ${r.id.slice(0,8)}  ${r.date}  ${(r.name||'').slice(0,30).padEnd(30)}  ${resp.status}  ${dur}ms${ok ? '' : '  ' + body}`);
  // small pacing delay to avoid stepping on the merge_computed RPC lock
  await new Promise(res => setTimeout(res, 250));
}

const ok = results.filter(r => r.status === 200).length;
const fail = results.filter(r => r.status !== 200);
console.log(`\nResult: ${ok}/${results.length} ok.`);
if (fail.length) {
  console.log('Failures:');
  console.table(fail);
}
