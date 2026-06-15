import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ids = ['6bf694a6', 'f9fb690b']; // June 2 outdoor; May 26 Zwift
const { data: rows } = await sb.from('workouts').select('id, name, date, workout_analysis').eq('user_id', '45d122e7-a950-4d50-858c-380b492061aa');

for (const tgt of ids) {
  const w = rows.find(r => r.id.startsWith(tgt));
  if (!w) continue;
  const wa = typeof w.workout_analysis === 'string' ? JSON.parse(w.workout_analysis) : w.workout_analysis;
  const fp = wa?.fact_packet_v1;
  console.log(`\n=== ${tgt} "${w.name}" ${w.date} ===`);
  console.log('facts.classified_type:', fp?.facts?.classified_type);
  console.log('facts.plan_intent:', fp?.facts?.plan_intent);
  console.log('facts.intensity_factor:', fp?.facts?.intensity_factor);
  console.log('derived.executed_intensity:', fp?.derived?.executed_intensity);
  console.log('derived.ftp_bins:', JSON.stringify(fp?.derived?.ftp_bins));
  console.log('display.is_mixed_effort:', fp?.display?.is_mixed_effort);
  console.log('display.variance_signal:', fp?.display?.variance_signal);
  console.log('display.interval_summary present?', !!fp?.display?.interval_summary);
  const isum = fp?.display?.interval_summary;
  if (isum) {
    console.log('  total_steps:', isum.total_steps, 'completed_steps:', isum.completed_steps);
    console.log('  clean_execution:', isum.clean_execution);
    if (isum.work_intervals) {
      console.log('  work_intervals (first 3):');
      for (const iv of isum.work_intervals.slice(0, 3)) console.log('    ' + JSON.stringify(iv).slice(0,200));
    }
  }
  // Also look for ai_summary
  console.log('\nai_summary text:');
  const txt = wa?.ai_summary?.text || wa?.ai_summary;
  if (typeof txt === 'string') console.log('  ' + txt.slice(0, 600));
}
