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
  .select('id, name, date, moving_time, computed')
  .eq('user_id', USER_ID)
  .eq('workout_status','completed')
  .in('type', rideTypes)
  .gte('date', ninetyAgoISO)
  .order('date', { ascending: false });

const out = rides.map(r => {
  const p = r.computed?.analysis?.power || {};
  return {
    id: r.id.slice(0,8),
    date: r.date,
    name: (r.name||'').slice(0,30),
    dur_min: r.moving_time,
    np: p.normalized_power ?? null,
    vi: p.variability_index != null ? Number(p.variability_index.toFixed(2)) : null,
    if: p.intensity_factor != null ? Number(p.intensity_factor.toFixed(2)) : null,
    tss: p.tss ?? null,
  };
});
console.log(`\n=== Live post-backfill state (${rides.length} rides) ===`);
console.table(out);

const target = rides.find(r => r.id.startsWith('6bf694a6'));
const t = target?.computed?.analysis?.power || {};
console.log(`\n=== Target ride 6bf694a6 (sweet-spot June 2) ===`);
console.log(`  normalized_power: ${t.normalized_power}W   (predicted: 140W; Garmin: 141W)`);
console.log(`  variability_index: ${t.variability_index?.toFixed(3)}   (predicted: 1.41)`);
console.log(`  intensity_factor: ${t.intensity_factor?.toFixed(3)}   (predicted: 0.79)`);
console.log(`  tss: ${t.tss}   (predicted: 62)`);
console.log(`  avg_power_pedaling_w: ${t.avg_power_pedaling_w}W  (unchanged; pedaling-only by design)`);
console.log(`  pct_time_pedaling: ${t.pct_time_pedaling}%`);

const totalTss = out.reduce((a,b) => a + (b.tss||0), 0);
console.log(`\n90d cycling TSS total (post-backfill): ${totalTss}   (pre-backfill was 2493)`);
