import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';

const TARGETS = [
  { id: '6bf694a6', label: 'June 2 outdoor (Edge 1040) — the bug' },
  { id: 'f9fb690b', label: 'May 26 Zwift — where D-091 verified' },
  { id: '7f15c92f', label: 'May 19 Zwift sweet-spot' },
];

for (const tgt of TARGETS) {
  const { data: rows } = await sb
    .from('workouts')
    .select('id, name, date, source, planned_id, workout_analysis')
    .eq('user_id', USER_ID);
  const w = (rows || []).find(r => r.id.startsWith(tgt.id));
  if (!w) { console.log(`\n=== ${tgt.label} === NOT FOUND`); continue; }
  console.log(`\n=== ${tgt.label} ===`);
  console.log(`workout ${w.id}  source=${w.source}  date=${w.date}  name="${w.name}"`);
  console.log(`planned_id: ${w.planned_id}`);

  const wa = typeof w.workout_analysis === 'string' ? JSON.parse(w.workout_analysis) : w.workout_analysis;
  const fp = wa?.fact_packet_v1;
  const facts = fp?.facts;
  console.log(`\nworkout_analysis.fact_packet_v1.facts:`);
  console.log(`  classified_type: ${facts?.classified_type}`);
  console.log(`  plan_intent: ${facts?.plan_intent}`);
  console.log(`  normalized_power_w: ${facts?.normalized_power_w}`);
  console.log(`  intensity_factor: ${facts?.intensity_factor}`);
  console.log(`  variability_index: ${facts?.variability_index}`);
  console.log(`  executed_intensity: ${facts?.executed_intensity}`);
  console.log(`  ftp_quality: ${facts?.ftp_quality}`);
  if (facts?.ftp_bins) console.log(`  ftp_bins (min): ${JSON.stringify(facts.ftp_bins)}`);

  if (w.planned_id) {
    const { data: pw } = await sb
      .from('planned_workouts')
      .select('id, name, description, workout_type, type, tags, steps_preset, computed')
      .eq('id', w.planned_id)
      .maybeSingle();
    console.log(`\nplanned_workouts row:`);
    console.log(`  name: "${pw?.name}"`);
    console.log(`  workout_type: ${pw?.workout_type}    type: ${pw?.type}`);
    console.log(`  tags: ${JSON.stringify(pw?.tags)}`);
    console.log(`  steps_preset: ${JSON.stringify(pw?.steps_preset)}`);
    if (pw?.computed?.steps) {
      console.log(`  computed.steps[0..3]:`);
      for (const s of pw.computed.steps.slice(0, 3)) {
        console.log(`    ${JSON.stringify(s)}`);
      }
    }
  }

  // AI summary (lede + insights)
  if (fp?.coachingParagraph || wa?.ai_summary) {
    console.log(`\nAI summary preview:`);
    const summary = wa?.ai_summary || fp?.coachingParagraph || {};
    if (typeof summary === 'string') console.log('  ' + summary.slice(0, 400));
    else if (summary?.headline) console.log('  headline:', summary.headline);
    else console.log('  ' + JSON.stringify(summary).slice(0, 500));
  }
}
