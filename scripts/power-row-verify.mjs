import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER = '45d122e7-a950-4d50-858c-380b492061aa';

// Helper to call workout-detail and force a fresh build
// Render the POWER row using the exact same logic as the deployed
// _shared/session-detail/build.ts:1334-1346 (post-D-113).
function renderPowerRowNew(fp) {
  const np = fp?.facts?.normalized_power_w;
  const ifv = fp?.facts?.intensity_factor;
  if (!(typeof np === 'number' && np > 0 && typeof ifv === 'number' && ifv > 0)) return null;
  const pctThreshold = Math.round(ifv * 100);
  const ei = fp?.derived?.executed_intensity;
  const effortDescriptor = (typeof ei === 'string' && ei !== 'unknown') ? `${ei} effort` : null;
  const suffix = effortDescriptor ? ` — ${effortDescriptor}` : '';
  return `Normalized power ${np}W (${pctThreshold}% of threshold)${suffix}`;
}

const targets = ['6bf694a6', 'f9fb690b'];
const { data: rows } = await sb.from('workouts').select('id, name, date').eq('user_id', USER);

for (const tgt of targets) {
  const w = rows.find(r => r.id.startsWith(tgt));
  if (!w) { console.log(`${tgt} NOT FOUND`); continue; }
  console.log(`\n=== ${tgt} "${w.name}" ${w.date} ===`);

  const { data: rec } = await sb.from('workouts').select('workout_analysis').eq('id', w.id).maybeSingle();
  const analysis = typeof rec.workout_analysis === 'string' ? JSON.parse(rec.workout_analysis) : rec.workout_analysis;
  const cachedRows = analysis?.session_detail_v1?.analysis_details?.rows || [];
  const cachedPower = cachedRows.find(r => r.label === 'Power');
  const fp = analysis?.fact_packet_v1;

  console.log(`Fact packet (deterministic, same on both sides of the fix):`);
  console.log(`  facts.classified_type:      ${fp?.facts?.classified_type}`);
  console.log(`  facts.intensity_factor:     ${fp?.facts?.intensity_factor}  (${Math.round((fp?.facts?.intensity_factor ?? 0)*100)}% of threshold)`);
  console.log(`  facts.normalized_power_w:   ${fp?.facts?.normalized_power_w}`);
  console.log(`  derived.executed_intensity: ${fp?.derived?.executed_intensity}`);
  console.log();
  console.log(`OLD POWER row (cached in session_detail_v1, pre-D-113):`);
  console.log(`  "${cachedPower?.value ?? '(none)'}"`);
  console.log(`NEW POWER row (deployed code, what the user sees on next view):`);
  console.log(`  "${renderPowerRowNew(fp) ?? '(none)'}"`);
}
