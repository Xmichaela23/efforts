// READ-ONLY trace for D-146: is thinChronicBase true/false on the real 28d window,
// which load_status escalation path fired, and is STATE serving a stale coach_cache row?
// No writes. Mirrors coach/index.ts windows: acute = today-6, chronic = today-27.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = '45d122e7-a950-4d50-858c-380b492061aa';

const safeNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const today = new Date().toISOString().slice(0, 10);
const addDays = (ymd, d) => new Date(new Date(ymd + 'T12:00:00Z').getTime() + d * 86400000).toISOString().slice(0, 10);
const acuteStart = addDays(today, -6);
const chronicStart = addDays(today, -27);

const { data: rolling } = await sb.from('workouts')
  .select('id,workload_actual,workload_planned,date,workout_status,type,name,planned_id')
  .eq('user_id', USER_ID).gte('date', chronicStart).lte('date', today).order('date', { ascending: true });

const completed = (rolling || []).filter(r => String(r.workout_status || '').toLowerCase() === 'completed');
const acute = completed.filter(r => String(r.date) >= acuteStart);
const acuteLoad = acute.reduce((s, r) => s + safeNum(r.workload_actual), 0);
const chronicLoad = completed.reduce((s, r) => s + safeNum(r.workload_actual), 0);
const topAcute = acute.reduce((m, r) => Math.max(m, safeNum(r.workload_actual)), 0);
const rawAcwr = chronicLoad > 0 ? (acuteLoad / 7) / (chronicLoad / 28) : null;
const thinChronicBase = chronicLoad < 500;
const dom = acuteLoad > 0 ? topAcute / acuteLoad : null;
const oneSessionDominates = acuteLoad > 0 && dom > 0.60;
const isSpikeOnEmptyBase = thinChronicBase && (acute.length < 2 || oneSessionDominates);

console.log('================ D-146 LOAD TRACE (user 45d122e7) ================');
console.log('today:', today, '| acute window:', acuteStart, '→', today, '| chronic window:', chronicStart, '→', today);
console.log('\n--- ACUTE (7d) sessions ---');
for (const r of acute) console.log(`  ${r.date}  ${String(r.type).padEnd(12)} wl_actual=${safeNum(r.workload_actual).toFixed(0).padStart(5)}  planned_id=${r.planned_id ? 'Y' : 'n'}  ${String(r.name||'').slice(0,28)}`);
console.log('\n--- ALL completed in 28d (chronic) ---');
for (const r of completed) console.log(`  ${r.date}  ${String(r.type).padEnd(12)} wl_actual=${safeNum(r.workload_actual).toFixed(0).padStart(5)}`);

console.log('\n================ NUMBERS ================');
console.log('acute7Load        :', acuteLoad.toFixed(1));
console.log('chronic28Load     :', chronicLoad.toFixed(1), '   (FLOOR = 500)');
console.log('acute sessions    :', acute.length);
console.log('top acute session :', topAcute.toFixed(1), '  dominance =', dom != null ? (dom*100).toFixed(0)+'%' : 'n/a', '(threshold 60%)');
console.log('rawAcwr           :', rawAcwr != null ? rawAcwr.toFixed(2) : 'null');
console.log('\n================ GUARD VERDICT (D-146) ================');
console.log('thinChronicBase      :', thinChronicBase, `  (chronic ${chronicLoad.toFixed(0)} ${thinChronicBase ? '<' : '>='} 500)`);
console.log('oneSessionDominates  :', oneSessionDominates);
console.log('isSpikeOnEmptyBase   :', isSpikeOnEmptyBase);
console.log('acwr after guard     :', (thinChronicBase ? 'null (suppressed)' : (rawAcwr != null ? rawAcwr.toFixed(2) : 'null')));
console.log('=> Surface-2 downgrade WOULD fire?', isSpikeOnEmptyBase ? 'YES (if not overreaching/easy-week)' : 'NO — guard does not apply on this base');

// ---- coach_cache: is STATE serving a stale pre-deploy response? ----
const { data: cc } = await sb.from('coach_cache').select('generated_at,invalidated_at,payload').eq('user_id', USER_ID).maybeSingle();
console.log('\n================ COACH_CACHE ================');
if (!cc) { console.log('no coach_cache row'); }
else {
  console.log('generated_at  :', cc.generated_at);
  console.log('invalidated_at:', cc.invalidated_at);
  const ageH = (Date.now() - new Date(cc.generated_at).getTime()) / 3600000;
  console.log('age (hours)   :', ageH.toFixed(2), ageH > 24 ? '(STALE by 24h rule → would recompute)' : '(fresh → served from cache unless invalidated/version)');
  console.log('coach_payload_version:', cc.payload?.coach_payload_version);
  // pull the relevant fields out of the cached payload
  const found = { intent_summary: [], load_status: [], acwr: [], runLoadPct: [], weeksOut: [], weekIntent: [] };
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'intent_summary' && typeof v === 'string') found.intent_summary.push(v);
      if (k === 'interpretation' && typeof v === 'string') found.load_status.push(`status=${o.status} | ${v}`);
      if (k === 'acwr' && (typeof v === 'number' || v === null)) found.acwr.push(v);
      if (k === 'run_only_week_load_pct' && v != null) found.runLoadPct.push(v);
      if (k === 'weeks_out' && v != null) found.weeksOut.push(v);
      if ((k === 'week_intent' || k === 'intent') && typeof v === 'string') found.weekIntent.push(v);
      walk(v);
    }
  };
  walk(cc.payload);
  console.log('cached intent_summary :', JSON.stringify([...new Set(found.intent_summary)]));
  console.log('cached load_status    :', JSON.stringify([...new Set(found.load_status)]));
  console.log('cached acwr values    :', JSON.stringify([...new Set(found.acwr)]));
  console.log('run_only_week_load_pct:', JSON.stringify([...new Set(found.runLoadPct)]));
  console.log('weeks_out (race)      :', JSON.stringify([...new Set(found.weeksOut)]));
  console.log('week intent           :', JSON.stringify([...new Set(found.weekIntent)]));

  // ---- D-147 prediction for this week ----
  const acwrForGate = thinChronicBase ? null : rawAcwr;
  const loadActuallyElevated = acwrForGate != null && acwrForGate >= 1.0;
  const runPct = found.runLoadPct.length ? Number(found.runLoadPct[0]) : null;
  const wIntent = found.weekIntent.find(x => ['recovery','taper','deload','peak','build','base','maintenance'].includes(x)) ?? '(unknown)';
  const wOut = found.weeksOut.length ? Math.min(...found.weeksOut.map(Number)) : null;
  // D-147: off-plan branch now runs BEFORE race overrides → no weeksOut dependency.
  const statusFlipsUnder = !loadActuallyElevated;
  const offPlanFires =
    statusFlipsUnder &&
    runPct != null && runPct <= -50 &&
    !['recovery','taper','deload','peak'].includes(wIntent);
  console.log('\n================ D-147 PREDICTION ================');
  console.log('loadActuallyElevated (acwr>=1.0):', loadActuallyElevated, `(acwr ${acwrForGate})`);
  console.log('=> unplanned-load escalation:', loadActuallyElevated ? 'STILL FIRES (load at/above baseline)' : 'GATED OFF → no "high" from unplanned');
  console.log('=> load_status flips to     :', loadActuallyElevated ? '(unchanged)' : "'under' → bar \"build more\"");
  console.log('off-plan wording fires?     :', offPlanFires, `(runLoadPct=${runPct}, intent=${wIntent}, weeksOut=${wOut})`);
  console.log('=> verdict text             :', offPlanFires ? '"Off plan this week — planned sessions skipped. Get back on schedule before adding extra."' : '(falls through to existing low-load branch)');
}
console.log('\n(Deploy of D-146 happened just now; compare cache generated_at above.)');
