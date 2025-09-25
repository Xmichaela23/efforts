// @ts-nocheck
// Minimal server-side materializer for new plans only (dev scope)
// - Reads planned_workouts rows by training_plan_id or single planned_workout id
// - Expands steps_preset tokens into computed.steps with stable ids
// - Resolves run paces (fiveK/easy) and bike power (FTP %) using user_baselines.performance_numbers
// - Persists computed.steps and duration

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Baselines = { ftp?: number; fiveK_pace?: any; fiveKPace?: any; fiveK?: any; easyPace?: any; easy_pace?: any };

function parsePaceToSecPerMi(v: any): number | null {
  try {
    if (v == null) return null;
    if (typeof v === 'number' && v > 0) return v; // already sec/mi
    const txt = String(v).trim();
    if (!txt) return null;
    // formats: mm:ss/mi or mm:ss /km
    const m = txt.match(/(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
    if (m) {
      const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const unit = m[3].toLowerCase();
      if (unit === 'mi') return sec;
      if (unit === 'km') return Math.round(sec * 1.60934);
      return sec;
    }
    // plain mm:ss
    const m2 = txt.match(/(\d{1,2}):(\d{2})/);
    if (m2) return parseInt(m2[1],10)*60 + parseInt(m2[2],10);
  } catch {}
  return null;
}

function secPerMiFromBaseline(b: Baselines, which: 'fivek'|'easy'): number | null {
  const raw = which==='fivek' ? (b.fiveK_pace ?? b.fiveKPace ?? b.fiveK) : (b.easyPace ?? b.easy_pace);
  return parsePaceToSecPerMi(raw);
}

function parseIntSafe(s?: string | number | null): number | null { const n = typeof s === 'number' ? s : parseInt(String(s||''), 10); return Number.isFinite(n) ? n : null; }

function uid(): string { try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; } }

function minutesTokenToSeconds(tok: string): number | null {
  const m = tok.match(/(\d+)\s*min/i); if (m) return parseInt(m[1],10)*60; return null;
}

function expandRunToken(tok: string, baselines: Baselines): any[] {
  const out: any[] = [];
  const lower = tok.toLowerCase();
  // warmup/cooldown
  if (/warmup/.test(lower) && /min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 600; out.push({ id: uid(), kind:'warmup', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  if (/cooldown/.test(lower) && /min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 600; out.push({ id: uid(), kind:'cooldown', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  // long run time based
  if (/longrun_\d+min/.test(lower)) {
    const m = lower.match(/longrun_(\d+)min/); const sec = m ? parseInt(m[1],10)*60 : 3600; out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  // easy run: run_easy_Xmin
  if (/run_easy_\d+min/.test(lower)) {
    const m = lower.match(/run_easy_(\d+)min/); const sec = m ? parseInt(m[1],10)*60 : 1800; out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  // Tempo: tempo_25min_5kpace_plus0:45
  if (/tempo_\d+min/.test(lower)) {
    const m = lower.match(/tempo_(\d+)min_5kpace(?:_plus(\d+):(\d+))?/);
    const sec = m ? parseInt(m[1],10)*60 : 1500;
    const fkp = secPerMiFromBaseline(baselines,'fivek');
    const plus = (m && m[2] && m[3]) ? (parseInt(m[2],10)*60 + parseInt(m[3],10)) : 0;
    const pace = (fkp!=null) ? (fkp + plus) : undefined;
    out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: pace }); return out;
  }
  // Intervals: interval_5x800m_5kpace_r90s
  if (/interval_\d+x/.test(lower)) {
    const m = lower.match(/interval_(\d+)x(\d+)(m|mi)_5kpace(?:_r(\d+)(s|min))?/);
    if (m) {
      const reps = parseInt(m[1],10);
      const val = parseInt(m[2],10);
      const unit = m[3];
      const dist_m = unit==='mi' ? Math.round(val*1609.34) : val;
      const rest_s = m[4] ? (m[5]==='min' ? parseInt(m[4],10)*60 : parseInt(m[4],10)) : 0;
      const pace = secPerMiFromBaseline(baselines,'fivek') || undefined;
      for (let i=0;i<reps;i+=1) {
        out.push({ id: uid(), kind:'work', distance_m: dist_m, pace_sec_per_mi: pace });
        if (rest_s>0) out.push({ id: uid(), kind:'recovery', duration_s: rest_s, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined });
      }
      return out;
    }
  }
  return out;
}

function expandBikeToken(tok: string, baselines: Baselines): any[] {
  const out: any[] = []; const lower = tok.toLowerCase(); const ftp = typeof baselines.ftp==='number'? baselines.ftp: undefined;
  const pctRange = (lo:number, hi:number)=> ftp? { lower: Math.round(lo*ftp), upper: Math.round(hi*ftp) } : undefined;
  if (/warmup_.*_\d+min/.test(lower)) { const sec = minutesTokenToSeconds(lower) ?? 900; out.push({ id: uid(), kind:'warmup', duration_s: sec }); return out; }
  if (/cooldown.*\d+min/.test(lower)) { const sec = minutesTokenToSeconds(lower) ?? 600; out.push({ id: uid(), kind:'cooldown', duration_s: sec }); return out; }
  // SS: bike_ss_3x12min_R4min
  let m = lower.match(/bike_ss_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(0.85,0.95) }); if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // Threshold: bike_thr_4x8min_R5min
  m = lower.match(/bike_thr_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(0.95,1.05) }); if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // VO2: bike_vo2_5x4min_R4min
  m = lower.match(/bike_vo2_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(1.1,1.2) }); if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // Endurance z2 time: bike_endurance_90min_Z2
  m = lower.match(/bike_endurance_(\d+)min/);
  if (m) { const sec=parseInt(m[1],10)*60; out.push({ id: uid(), kind:'work', duration_s: sec, power_range: pctRange(0.65,0.75) }); return out; }
  // Tempo steady time: bike_tempo_Xmin (map to race power ~80-85% FTP)
  m = lower.match(/bike_tempo_(\d+)min/);
  if (m) { const sec=parseInt(m[1],10)*60; out.push({ id: uid(), kind:'work', duration_s: sec, power_range: pctRange(0.80,0.85) }); return out; }
  // Race prep short efforts: bike_race_prep_4x90s
  m = lower.match(/bike_race_prep_(\d+)x(\d+)s/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10); for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work }); out.push({ id: uid(), kind:'recovery', duration_s: work }); } return out; }
  // Openers quick: bike_openers
  if (/bike_openers/.test(lower)) { out.push({ id: uid(), kind:'work', duration_s: 8*60 }); return out; }
  return out;
}

function expandTokensForRow(row: any, baselines: Baselines): { steps: any[]; total_s: number } {
  const tokens: string[] = Array.isArray(row?.steps_preset) ? row.steps_preset : [];
  const discipline = String(row?.type||'').toLowerCase();
  const steps: any[] = [];
  for (const tok of tokens) {
    let added: any[] = [];
    if (discipline==='run' || discipline==='walk') added = expandRunToken(tok, baselines);
    else if (discipline==='ride' || discipline==='bike' || discipline==='cycling') added = expandBikeToken(tok, baselines);
    else if (discipline==='swim') {
      // Detailed swim expansion — one line per rep
      const s = String(tok).toLowerCase();
      const ydToM = (yd:number)=> Math.round(yd*0.9144);
      const pushWUCD = (n:number, unit:string, warm:boolean) => {
        const distM = unit==='yd'? ydToM(n) : n;
        steps.push({ id: uid(), kind: warm?'warmup':'cooldown', distance_m: distM });
      };
      let m: RegExpMatchArray | null = null;
      // Warmup/Cooldown distance tokens: swim_warmup_300yd_easy / swim_cooldown_200yd
      m = s.match(/swim_(warmup|cooldown)_(\d+)(yd|m)/);
      if (m) { pushWUCD(parseInt(m[2],10), m[3], m[1]==='warmup'); continue; }
      // Drill: swim_drill_<name>_4x50yd(_r15)?(_equipment)?
      m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?/);
      if (m) {
        const name=m[1].replace(/_/g,' '); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const unit=m[4]; const rest=parseInt(m[5]||'0',10); const equip=m[6]||null;
        const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++) { steps.push({ id: uid(), kind:'drill', distance_m: distM, label:`drill ${name}`, equipment: equip||undefined }); if(rest) steps.push({ id: uid(), kind:'recovery', duration_s: rest }); }
        continue;
      }
      // Aerobic sets: swim_aerobic_6x150yd(_r20)?
      m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const rest=parseInt(m[4]||'0',10); const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++){ steps.push({ id: uid(), kind:'work', distance_m: distM, label:'aerobic' }); if(rest) steps.push({ id: uid(), kind:'recovery', duration_s: rest }); }
        continue;
      }
      // Pull/Kick sets
      m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?/);
      if (m) { const kind=m[1]; const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const unit=m[4]; const rest=parseInt(m[5]||'0',10); const eq=m[6]|| (kind==='pull'?'buoy': (kind==='kick'?'board':null)); const distM=unit==='yd'? ydToM(dist):dist; for(let i=0;i<reps;i++){ steps.push({ id: uid(), kind:'work', distance_m: distM, label:kind, equipment:eq||undefined }); if(rest) steps.push({ id: uid(), kind:'recovery', duration_s: rest }); } continue; }
      // Fallback distance/time
      if (/\d+yd/.test(s)) { const mm=s.match(/(\d+)yd/); const yd=mm?parseInt(mm[1],10):0; const mtr=ydToM(yd); steps.push({ id: uid(), kind:'work', distance_m: mtr }); continue; }
      if (/\d+min/.test(s)) { const sec=minutesTokenToSeconds(s) ?? 600; steps.push({ id: uid(), kind:'work', duration_s: sec }); continue; }
      steps.push({ id: uid(), kind:'work', duration_s: 300 });
      continue;
    } else if (discipline==='strength') {
      // Expand strength_exercises into steps if provided
      const exs: any[] = Array.isArray((row as any)?.strength_exercises) ? (row as any).strength_exercises : [];
      if (exs.length) {
        for (const ex of exs) {
          const name = String(ex?.name||'exercise');
          const reps = (typeof ex?.reps==='number'? ex.reps : undefined);
          const sets = (typeof ex?.sets==='number'? ex.sets : undefined);
          const weight = (typeof ex?.weight==='number'? ex.weight : undefined);
          steps.push({ id: uid(), kind:'strength', duration_s: 60, strength: { name, sets, reps, weight } });
        }
        continue;
      }
      // placeholder if no details
      const sec = 45*60; steps.push({ id: uid(), kind:'work', duration_s: sec }); continue;
    }
    steps.push(...added);
  }
  const total_s = steps.reduce((s,st)=> s + (Number(st.duration_s)||0), 0);
  return { steps, total_s };
}

Deno.env.get; // keep Deno type active

function mmss(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2,'0')}`;
}

function toV3Step(st: any): any {
  const out: any = { id: st?.id || uid() };
  if (typeof st?.duration_s === 'number') out.seconds = Math.max(1, Math.round(st.duration_s));
  if (typeof st?.distance_m === 'number') out.distanceMeters = Math.max(1, Math.round(st.distance_m));
  if (typeof st?.pace_sec_per_mi === 'number') out.paceTarget = `${mmss(st.pace_sec_per_mi)}/mi`;
  if (st?.power_range && typeof st.power_range.lower === 'number' && typeof st.power_range.upper === 'number') {
    const lo = Math.round(st.power_range.lower);
    const up = Math.round(st.power_range.upper);
    out.powerTarget = `${Math.round((lo + up) / 2)} W`;
    out.powerRange = { lower: lo, upper: up };
  }
  if (typeof st?.label === 'string') out.label = st.label;
  if (st?.equipment) out.equipment = st.equipment;
  if (st?.strength) out.strength = st.strength;
  if (typeof st?.planned_index === 'number') out.planned_index = st.planned_index;
  if (st?.kind) out.kind = st.kind;
  return out;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string,string>;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  try {
    const payload = await req.json();
    const planId: string | null = payload?.plan_id ?? null;
    const plannedRowId: string | null = payload?.planned_workout_id ?? null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Find rows to materialize
    let rows: any[] = [];
    if (plannedRowId) {
      const { data } = await supabase.from('planned_workouts').select('*').eq('id', plannedRowId).limit(1);
      rows = data || [];
    } else if (planId) {
      const { data } = await supabase.from('planned_workouts').select('*').eq('training_plan_id', planId).order('date');
      rows = data || [];
    } else {
      return new Response(JSON.stringify({ error:'plan_id or planned_workout_id required' }), { status:400, headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
    }
    if (!rows.length) return new Response(JSON.stringify({ success:true, materialized:0 }), { headers:{ ...corsHeaders, 'Content-Type':'application/json'} });

    // Load baselines for user inferred from first row
    const userId = rows[0]?.user_id;
    let baselines: Baselines = {};
    try {
      const { data: ub } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', userId).maybeSingle();
      baselines = (ub?.performance_numbers || {}) as any;
    } catch {}

    let count = 0;
    for (const row of rows) {
      try {
        const { steps, total_s } = expandTokensForRow(row, baselines);
        if (steps && steps.length) {
          // Assign stable planned_index per step
          const withIndex = steps.map((st:any, idx:number)=> ({ ...st, planned_index: idx }));
          const v3 = withIndex.map(toV3Step);
          const update: any = { computed: { normalization_version: 'v3', steps: v3, total_duration_seconds: total_s }, duration: Math.max(1, Math.round(total_s/60)) };
          await supabase.from('planned_workouts').update(update).eq('id', String(row.id));
          count += 1;
        }
      } catch {}
    }
    return new Response(JSON.stringify({ success:true, materialized: count }), { headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ error:String(e) }), { status:500, headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  }
});


