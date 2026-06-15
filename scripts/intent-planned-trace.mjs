import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const planned_ids = [
  '3348b785-3e6a-4f00-8814-ac764eb2fc5a', // June 2 outdoor
  'b2e85f39-f918-476a-b9a2-04e142a2721f', // May 26 Zwift
  '6f2dd095-e70c-4533-a039-3a025bb3cedd', // May 19 Zwift
];

const { data } = await sb.from('planned_workouts').select('*').in('id', planned_ids);
for (const pw of data || []) {
  console.log('\n=== planned_workouts ' + pw.id.slice(0,8) + ' ===');
  console.log('all columns:', Object.keys(pw).join(', '));
  console.log('  name:', pw.name);
  console.log('  workout_type:', pw.workout_type);
  console.log('  type:', pw.type);
  console.log('  tags:', JSON.stringify(pw.tags));
  console.log('  steps_preset:', JSON.stringify(pw.steps_preset)?.slice(0,200));
  console.log('  intensity_targets:', JSON.stringify(pw.intensity_targets)?.slice(0,200));
  console.log('  description:', (pw.description || '').slice(0,200));
  console.log('  computed.steps[0..3]:');
  const steps = pw.computed?.steps || [];
  for (const s of steps.slice(0,3)) console.log('    ' + JSON.stringify(s).slice(0,200));
}
