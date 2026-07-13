// What do STATE and PERFORMANCE actually read now? Read-only.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const USER='45d122e7-a950-4d50-858c-380b492061aa';

const { data: snaps } = await sb.from('athlete_snapshot')
  .select('week_start,state_trends_v1,run_easy_pace_at_hr,computed_at')
  .eq('user_id',USER).order('week_start',{ascending:false}).limit(1);
const s = snaps?.[0];
const st = typeof s?.state_trends_v1==='string'?JSON.parse(s.state_trends_v1):s?.state_trends_v1;

console.log(`SPINE  week_start=${s?.week_start}   computed_at=${s?.computed_at?.slice(0,16)}\n`);

const d = st?.run?.decoupling;
console.log('=== STATE -> RUN DURABILITY (the card that said "aerobic base needs work") ===');
if (!d) console.log('  (no run decoupling in the spine)');
else {
  console.log(`  verdict      : ${d.verdict}`);
  console.log(`  band         : ${d.band}`);
  console.log(`  recentPct    : ${d.recentPct}%`);
  console.log(`  sampleCount  : ${d.sampleCount}      <- D-283: hot runs are now KEPT, so this got BIGGER`);
  console.log(`  newestAgeDays: ${d.newestAgeDays}`);
  console.log(`  stale        : ${d.stale}`);
  console.log(`  provisional  : ${d.provisional}`);
  const clientRenders = d.verdict !== 'needs_data';
  const coachRenders  = d.verdict !== 'needs_data' && !d.stale && !!d.band;
  console.log(`\n  -> PERFORMANCE row renders a verdict? ${clientRenders}`);
  console.log(`  -> STATE/AERO card renders a verdict?  ${coachRenders}`);
  if (!clientRenders) console.log(`  -> both show "needs data" (honest: not enough clean steady runs)`);
}

const e = st?.run?.efficiency;
console.log('\n=== STATE -> RUN EFFICIENCY (secondary read) ===');
console.log(e ? `  verdict=${e.verdict}  pctChange=${e.pctChange}  n=${e.sampleCount}  ageDays=${e.newestAgeDays}` : '  (none)');

console.log('\n=== the observed easy-pace side (feeds the D-033 reconciler) ===');
console.log(`  athlete_snapshot.run_easy_pace_at_hr = ${s?.run_easy_pace_at_hr ?? 'null'}`);
