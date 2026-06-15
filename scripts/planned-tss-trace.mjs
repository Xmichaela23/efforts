import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER = '45d122e7-a950-4d50-858c-380b492061aa';
const FTP = 176;

const ids = [
  '3348b785-3e6a-4f00-8814-ac764eb2fc5a', // 6bf694a6's plan (3x15 sweet spot)
  'b2e85f39-f918-476a-b9a2-04e142a2721f', // May 26 Zwift plan (2x15 sweet spot)
  '6f2dd095-e70c-4533-a039-3a025bb3cedd', // May 19 Zwift plan
];

const { data: planned } = await sb.from('planned_workouts').select('*').in('id', ids);
for (const pw of planned || []) {
  console.log(`\n=== planned ${pw.id.slice(0,8)} "${pw.name}" ${pw.date} ===`);
  console.log(`  workload_planned: ${pw.workload_planned}`);
  console.log(`  workload_actual:  ${pw.workload_actual}`);
  console.log(`  intensity_factor: ${pw.intensity_factor}     (column directly on the row)`);
  console.log(`  total_duration_seconds: ${pw.total_duration_seconds}`);
  console.log(`  hardness: ${pw.hardness}`);
  console.log(`  intensity: ${JSON.stringify(pw.intensity)}`);
  console.log(`  targets_summary: ${JSON.stringify(pw.targets_summary)}`);
  console.log(`  power_target_watts: ${pw.power_target_watts}`);
  console.log(`  power_low: ${pw.power_low}  power_high: ${pw.power_high}`);

  // computed.steps detail
  const steps = pw.computed?.steps || [];
  console.log(`\n  computed.steps (${steps.length} total):`);
  for (const s of steps) {
    const pr = s.powerRange ? `[${s.powerRange.lower}-${s.powerRange.upper}W]` : '';
    const pt = s.powerTarget ? `target ${s.powerTarget}` : '';
    console.log(`    ${(s.kind || '').padEnd(10)} ${String(s.seconds).padStart(4)}s ${pr} ${pt}`);
  }

  // Compute planned TSS from steps using ftp + duration × IF^2 model
  let plannedTssFromSteps = 0;
  let workSecs = 0;
  for (const s of steps) {
    const sec = Number(s.seconds) || 0;
    let p = null;
    if (s.powerRange && Number(s.powerRange.lower) > 0 && Number(s.powerRange.upper) > 0) {
      p = (Number(s.powerRange.lower) + Number(s.powerRange.upper)) / 2;
    } else if (s.powerTarget && /(\d+)\s*W/i.test(s.powerTarget)) {
      p = Number(s.powerTarget.match(/(\d+)/)[1]);
    }
    if (p && sec > 0) {
      const ifSeg = p / FTP;
      // Coggan TSS: (sec × IF^2) / 3600 × 100
      plannedTssFromSteps += (sec * ifSeg * ifSeg) / 3600 * 100;
      if ((s.kind || '').toLowerCase() === 'work') workSecs += sec;
    } else {
      // unknown power (e.g. recovery without target) — treat as IF 0.55 endurance default
      // (Coggan recovery is typically <0.55; conservative)
      const ifEst = 0.55;
      plannedTssFromSteps += (sec * ifEst * ifEst) / 3600 * 100;
    }
  }
  console.log(`\n  Computed planned TSS (from steps, FTP=${FTP}): ${plannedTssFromSteps.toFixed(1)}`);
  console.log(`  Work seconds (kind=work): ${workSecs}  (=${(workSecs/60).toFixed(0)} min)`);
}

// Now pull the linked workout to confirm actual TSS
const workoutIds = ['6bf694a6', 'f9fb690b', '7f15c92f'];
const { data: ws } = await sb.from('workouts').select('id, name, date, workload_actual, workload_planned, computed').eq('user_id', USER);
for (const tgt of workoutIds) {
  const w = ws.find(r => r.id.startsWith(tgt));
  if (!w) continue;
  console.log(`\n=== workout ${tgt} "${w.name}" ===`);
  console.log(`  workouts.workload_actual: ${w.workload_actual}`);
  console.log(`  workouts.workload_planned: ${w.workload_planned}`);
  console.log(`  computed.analysis.power.tss: ${w.computed?.analysis?.power?.tss}`);
  console.log(`  computed.analysis.power.intensity_factor: ${w.computed?.analysis?.power?.intensity_factor?.toFixed(3)}`);
  console.log(`  computed.analysis.power.normalized_power: ${w.computed?.analysis?.power?.normalized_power}`);
}
