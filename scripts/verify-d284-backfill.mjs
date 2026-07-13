// D-284 / D-283 backfill — DETERMINISTIC chain only:
//   compute-workout-analysis (LTHR zone bins) -> compute-facts (pace_at_easy_hr) -> compute-snapshot
// Deliberately does NOT invoke analyze-*-workout: that regenerates LLM narratives (stochastic, 147 of
// them) and NONE of the D-283/D-284 changes live there.
// Modes:  --before   snapshot current state (read-only)
//         --run      execute the backfill
//         --after    snapshot resulting state (read-only)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const SB=env.SUPABASE_URL, KEY=env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SB, KEY, { auth:{persistSession:false} });
const USER='45d122e7-a950-4d50-858c-380b492061aa';
const MODE = process.argv[2] ?? '--before';

async function snapshotState(label) {
  const { data: facts } = await sb.from('workout_facts').select('workout_id,run_facts').eq('user_id',USER);
  const { data: runs } = await sb.from('workouts').select('id,date,type,computed').eq('user_id',USER).eq('type','run');
  const byId = new Map(runs.map(r=>[r.id,r]));
  let withPace=0, withoutPace=0; const paces=[];
  let friel=0, hrmax=0, noZones=0;
  for (const f of facts??[]) {
    const rf = typeof f.run_facts==='string'?JSON.parse(f.run_facts):f.run_facts;
    if (!rf) continue;
    if (!byId.has(f.workout_id)) continue;
    if (rf.pace_at_easy_hr!=null) { withPace++; paces.push(rf.pace_at_easy_hr); } else withoutPace++;
  }
  for (const r of runs??[]) {
    const c = typeof r.computed==='string'?JSON.parse(r.computed):r.computed;
    const sch = c?.analysis?.zones?.hr?.schema ?? c?.analysis?.zones?.hr?.source ?? null;
    const bins = c?.analysis?.zones?.hr?.bins;
    if (!bins) { noZones++; continue; }
    if (String(sch??'').includes('lthr')||String(sch??'').includes('friel')) friel++; else hrmax++;
  }
  const med=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
  const mi=p=>p==null?'--':`${Math.floor(p*1.609344/60)}:${String(Math.round(p*1.609344%60)).padStart(2,'0')}/mi`;
  console.log(`\n===== ${label} =====`);
  console.log(`  runs: ${runs.length}`);
  console.log(`  pace_at_easy_hr  present: ${withPace}   absent: ${withoutPace}`);
  console.log(`  pace_at_easy_hr  median : ${med(paces)==null?'--':med(paces)+' s/km  ('+mi(med(paces))+')'}`);
  console.log(`  HR zone schema   friel/lthr: ${friel}   %hrmax: ${hrmax}   none: ${noZones}`);
  return { withPace, paces, friel, hrmax };
}

if (MODE==='--before' || MODE==='--after') {
  await snapshotState(MODE==='--before'?'BEFORE':'AFTER');
  process.exit(0);
}

if (MODE!=='--run') { console.error('use --before | --run | --after'); process.exit(1); }

// ---- the backfill ----
const H={ 'Content-Type':'application/json', 'Authorization':`Bearer ${KEY}`, 'apikey':KEY };
// Retries on transient network faults. Every function invoked here is an IDEMPOTENT recompute, so a
// retry (or a full re-run of the script) can only converge — never double-apply.
const call = async (fn, body, tries = 4) => {
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(`${SB}/functions/v1/${fn}`, { method:'POST', headers:H, body:JSON.stringify(body) });
      return { status:r.status, ok:r.ok, text: r.ok?null:(await r.text()).slice(0,160) };
    } catch (e) {
      if (a === tries) return { status:0, ok:false, text:`network: ${String(e?.cause?.code ?? e?.message ?? e).slice(0,80)}` };
      await new Promise(r=>setTimeout(r, 1000 * a * a));   // 1s, 4s, 9s
    }
  }
};

const { data: runs } = await sb.from('workouts').select('id,date').eq('user_id',USER).eq('type','run').order('date',{ascending:true});
console.log(`\nBackfilling ${runs.length} runs — compute-workout-analysis -> compute-facts (deterministic; no analyzer, no LLM)\n`);
let okA=0,okF=0; const fails=[];
for (let i=0;i<runs.length;i++) {
  const w = runs[i];
  const a = await call('compute-workout-analysis', { workout_id: w.id });
  if (a.ok) okA++; else fails.push(`${w.date} analysis ${a.status} ${a.text}`);
  const f = await call('compute-facts', { workout_id: w.id });
  if (f.ok) okF++; else fails.push(`${w.date} facts ${f.status} ${f.text}`);
  if ((i+1)%20===0 || i===runs.length-1) console.log(`  ${i+1}/${runs.length}  analysis-ok=${okA} facts-ok=${okF} fails=${fails.length}`);
  await new Promise(r=>setTimeout(r,120));
}
console.log(`\ncompute-workout-analysis ok: ${okA}/${runs.length}`);
console.log(`compute-facts            ok: ${okF}/${runs.length}`);
if (fails.length) { console.log(`\nFAILURES (${fails.length}):`); fails.slice(0,15).forEach(f=>console.log('  '+f)); }

// re-learn the profile off the refreshed history, then rebuild every affected week's snapshot
console.log(`\nlearn-fitness-profile...`);
const lf = await call('learn-fitness-profile', { user_id: USER });
console.log(`  HTTP ${lf.status}${lf.text?' '+lf.text:''}`);

const weeks = [...new Set(runs.map(r=>{ const d=new Date(r.date+'T00:00:00Z'); const dow=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-dow); return d.toISOString().slice(0,10); }))].sort();
console.log(`\ncompute-snapshot for ${weeks.length} affected weeks...`);
let okS=0; const sFails=[];
for (const wk of weeks) {
  const s = await call('compute-snapshot', { user_id: USER, week_start: wk });
  if (s.ok) okS++; else sFails.push(`${wk} ${s.status} ${s.text}`);
  await new Promise(r=>setTimeout(r,120));
}
console.log(`  snapshots ok: ${okS}/${weeks.length}`);
if (sFails.length) sFails.slice(0,10).forEach(f=>console.log('  FAIL '+f));
console.log(`\nDONE.`);
