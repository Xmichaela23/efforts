import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows } = await sb.from('workouts').select('id, computed').eq('user_id','45d122e7-a950-4d50-858c-380b492061aa').eq('date','2026-06-02');
const target = rows.find(r => r.id.startsWith('6bf694a6'));
console.log('id:', target.id);
console.log('PRE state:');
const pre = target.computed?.analysis?.power;
console.log('  np:', pre?.normalized_power, 'vi:', pre?.variability_index?.toFixed(3), 'if:', pre?.intensity_factor?.toFixed(3), 'tss:', pre?.tss);

const t0 = Date.now();
const resp = await fetch(`${env.SUPABASE_URL}/functions/v1/compute-workout-analysis`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY },
  body: JSON.stringify({ workout_id: target.id }),
});
console.log('\ntrigger status:', resp.status, 'ms:', Date.now() - t0);
const body = await resp.text();
console.log('body:', body.slice(0, 400));
await new Promise(r => setTimeout(r, 1500));

const { data: w2 } = await sb.from('workouts').select('computed').eq('id', target.id).maybeSingle();
const p = w2?.computed?.analysis?.power;
console.log('\nPOST state:');
console.log('  np:', p?.normalized_power, 'vi:', p?.variability_index?.toFixed(3), 'if:', p?.intensity_factor?.toFixed(3), 'tss:', p?.tss);
console.log('  avg_power_pedaling_w:', p?.avg_power_pedaling_w, 'pct_time_pedaling:', p?.pct_time_pedaling);
