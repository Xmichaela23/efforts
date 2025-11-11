// @ts-nocheck
// Function: materialize-plan
// Behavior: Expand planned_workouts into computed.steps (stable ids) + total duration.
// Supports run/ride/swim/strength tokens, workout_structure fallback, long_run_* tokens,
// and description-based single-step fallback. CORS enabled. Returns count materialized.
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

// Strength helpers: map exercise name to baseline key and compute prescribed weight
function oneRmFromBaselines(b: any, exerciseName: string): number | null {
  try {
    const n = String(exerciseName || '').toLowerCase();
    if (n.includes('bench')) return Number.isFinite(b?.bench) ? b.bench : null;
    if (n.includes('deadlift')) return Number.isFinite(b?.deadlift) ? b.deadlift : null;
    if (n.includes('squat')) return Number.isFinite(b?.squat) ? b.squat : null;
    if (n.includes('overhead') || n.includes('ohp') || (n.includes('press') && !n.includes('bench'))) {
      const v = b?.overheadPress1RM ?? b?.ohp ?? b?.overhead_press;
      return Number.isFinite(v) ? v : null;
    }
    // Unknown or bodyweight: no 1RM baseline
    return null;
  } catch { return null; }
}
function round5(n: number): number { return Math.max(5, Math.round(n / 5) * 5); }
function pctWeight(oneRm: number | null, pct?: number): number | undefined {
  if (oneRm == null) return undefined;
  if (!(typeof pct === 'number' && isFinite(pct) && pct > 0)) return undefined;
  return round5(oneRm * pct);
}

function parseWeightInput(input: any, oneRm: number | null): { weight?: number; percent_1rm?: number } {
  try {
    if (typeof input === 'number' && isFinite(input) && input >= 0) return { weight: Math.round(input) };
    const s = String(input || '').trim().toLowerCase();
    if (!s) return {};
    if (/(^|\b)(bw|body\s*weight|bodyweight)(\b|$)/.test(s)) return { weight: 0 };
    if (/amrap/.test(s)) return {}; // reps-only hint, not a weight
    // Match "70% 1RM" or "70%" or "0.7" style
    let m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const w = pctWeight(oneRm, pct);
      return { weight: w, percent_1rm: pct };
    }
    m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*1\s*rm/);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const w = pctWeight(oneRm, pct);
      return { weight: w, percent_1rm: pct };
    }
    // Plain number inside string
    m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      const n = Math.round(parseFloat(m[1]));
      if (isFinite(n)) return { weight: n };
    }
  } catch {}
  return {};
}

// Accessory mapping → primary 1RM with ratio
function getAccessoryRatio(movement: string): number {
  const m = String(movement || '').toLowerCase();
  // Primary lifts default to 1.0
  if (/bench|squat|deadlift|dead_lift|ohp|overhead/.test(m)) return 1.0;
  // Upper body pull (bench reference)
  if (m.includes('barbell_row') || m.includes('bent_over_row') || m.includes('pendlay_row') || m.includes('barbell row') || m.includes('bent over row') || m.includes('pendlay')) return 0.90;
  if (m.includes('t_bar_row') || /\bt[-_ ]?bar[-_ ]?row\b/.test(m)) return 0.80;
  if (m.includes('chest_supported_row') || m.includes('chest supported row')) return 0.85;
  if (m.includes('cable_row') || m.includes('cable row')) return 0.70;
  if (m.includes('lat_pulldown') || m.includes('pulldown') || m.includes('lat pulldown')) return 0.65;
  if (m.includes('inverted_row') || m.includes('inverted row')) return 0.65;
  if (m.includes('face_pull') || m.includes('face pull')) return 0.35;
  if (m.includes('reverse_fly') || m.includes('reverse_flye') || m.includes('reverse fly')) return 0.30;
  if (m.includes('chinup') || m.includes('chin_up') || m.includes('pullup') || m.includes('pull_up') || m.includes('chin-up') || m.includes('pull-up')) return 0.65;
  // Upper body push (bench reference)
  if (m.includes('dip')) return 0.90;
  if (m.includes('incline_bench') || m.includes('incline bench')) return 0.85;
  if (m.includes('close_grip_bench') || m.includes('close grip bench')) return 0.90;
  if (m.includes('db_bench_press') || m.includes('dumbbell_bench')) return 0.75;
  if (m.includes('db_incline_press') || m.includes('dumbbell_incline')) return 0.70;
  if (m.includes('db_fly') || m.includes('db_flye') || m.includes('dumbbell_fly')) return 0.45;
  if (m.includes('cable_fly') || m.includes('cable_flye')) return 0.40;
  if (m.includes('diamond_pushup') || m.includes('close_grip_pushup')) return 0.0;
  if (m.includes('pike_pushup')) return 0.0;
  if (m.includes('pushup') || m.includes('push_up')) return 0.0;
  // Shoulders (overhead reference)
  if (m.includes('lateral_raise')) return 0.35;
  if (m.includes('front_raise')) return 0.40;
  if (m.includes('rear_delt_fly') || m.includes('rear_delt_flye')) return 0.30;
  if (m.includes('db_shoulder_press') || m.includes('dumbbell_shoulder')) return 0.65;
  if (m.includes('overhead_tricep_extension') || m.includes('tricep_extension')) return 0.40;
  if (m.includes('push_press')) return 1.10;
  // Hip dominant (deadlift reference)
  if (m.includes('hip_thrust') || m.includes('hip thrust')) return 0.80;
  if (m.includes('romanian_deadlift') || m.includes('rdl')) return 0.70;
  if (m.includes('good_morning') || m.includes('good morning')) return 0.45;
  if (m.includes('single_leg_rdl') || m.includes('single leg rdl')) return 0.25;
  if (m.includes('glute_bridge') || m.includes('glute bridge')) return 0.60;
  if (m.includes('leg_curl') || m.includes('leg curl')) return 0.60;
  if (m.includes('sumo_deadlift') || m.includes('sumo')) return 0.95;
  if (m.includes('nordic_curl')) return 0.0;
  // Knee dominant (squat reference)
  if (m.includes('bulgarian_split_squat')) return 0.30;
  if (m.includes('walking_lunge') || m.includes('lunge')) return 0.35;
  if (m.includes('reverse_lunge')) return 0.35;
  if (m.includes('lateral_lunge')) return 0.30;
  if (m.includes('goblet_squat')) return 0.40;
  if (m.includes('step_up') || m.includes('step up')) return 0.25;
  if (m.includes('leg_press')) return 1.20;
  if (m.includes('leg_extension')) return 0.55;
  if (m.includes('front_squat')) return 0.85;
  if (m.includes('overhead_squat')) return 0.60;
  if (m.includes('jump_squat') || m.includes('box_jump')) return 0.0;
  if (m.includes('wall_sit')) return 0.0;
  if (m.includes('pistol_squat') || m.includes('pistol')) return 0.0;
  // Core & BW
  if (m.includes('plank') || m.includes('side_plank')) return 0.0;
  if (m.includes('ab_rollout') || m.includes('rollout')) return 0.0;
  if (m.includes('hanging_leg_raise')) return 0.0;
  if (m.includes('russian_twist')) return 0.0;
  if (m.includes('dead_bug')) return 0.0;
  if (m.includes('bird_dog')) return 0.0;
  if (m.includes('pallof_press')) return 0.0;
  if (m.includes('burpee')) return 0.0;
  if (m.includes('mountain_climber')) return 0.0;
  return 1.0;
}

function pickPrimary1RMAndBase(name: string, baselines: any): { base: number | null; ref: 'bench'|'squat'|'deadlift'|'overhead'|null; ratio: number; unilateral: boolean } {
  const n = String(name || '').toLowerCase();
  const bench = Number.isFinite(baselines?.bench) ? baselines.bench as number : null;
  const squat = Number.isFinite(baselines?.squat) ? baselines.squat as number : null;
  const deadlift = Number.isFinite(baselines?.deadlift) ? baselines.deadlift as number : null;
  const overhead = Number.isFinite(baselines?.overheadPress1RM ?? baselines?.ohp ?? baselines?.overhead) ? (baselines?.overheadPress1RM ?? baselines?.ohp ?? baselines?.overhead) as number : null;
  const unilateral = /(single|bulgarian|split|one arm|one leg|unilateral|pistol)/i.test(n);

  // Get accessory ratio for all exercises
  const ratio = getAccessoryRatio(n);
  
  // Direct primary lifts
  if (n.includes('bench')) return { base: bench, ref: 'bench', ratio: 1.0, unilateral };
  if (n.includes('squat') && !n.includes('goblet')) return { base: squat, ref: 'squat', ratio: 1.0, unilateral };
  if (n.includes('deadlift') || n.includes('dead_lift')) return { base: deadlift, ref: 'deadlift', ratio: 1.0, unilateral };
  if (n.includes('overhead') || n.includes('ohp')) return { base: overhead, ref: 'overhead', ratio: 1.0, unilateral };
  if (n.includes('push press')) return { base: overhead, ref: 'overhead', ratio, unilateral };

  // Accessory aliases
  
  // Upper body pull (bench reference)
  if (n.includes('row')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('pulldown') || n.includes('pull down')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('pullup') || n.includes('pull up') || n.includes('pull-up')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('chinup') || n.includes('chin up') || n.includes('chin-up')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('face pull')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('reverse fly') || n.includes('reverse flye')) return { base: bench, ref: 'bench', ratio, unilateral };
  
  // Upper body push (bench reference)
  if (n.includes('dip')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('incline')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('fly') || n.includes('flye')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('dumbbell') && (n.includes('press') || n.includes('bench'))) return { base: bench, ref: 'bench', ratio, unilateral };
  
  // Shoulders (overhead reference)
  if (n.includes('lateral raise')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('front raise')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('rear delt')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('shoulder')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('tricep')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  
  // Hip dominant (deadlift reference)
  if (n.includes('hip thrust')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('rdl') || n.includes('romanian')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('sumo')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('good morning')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('leg curl')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('glute bridge')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  
  // Knee dominant (squat reference)
  if (n.includes('lunge') || n.includes('split squat') || n.includes('goblet') || n.includes('step up')) return { base: squat, ref: 'squat', ratio, unilateral };
  if (n.includes('leg press')) return { base: squat, ref: 'squat', ratio, unilateral };
  if (n.includes('leg extension')) return { base: squat, ref: 'squat', ratio, unilateral };

  // Unknown
  return { base: null, ref: null, ratio: 1.0, unilateral };
}

function repScaleFor(reps?: number | string): number {
  if (typeof reps === 'string' && /amrap/i.test(reps)) return 1.00;
  const r = Number(reps);
  if (!Number.isFinite(r)) return 1.0;
  if (r <= 6) return 1.05;
  if (r <= 9) return 1.00;
  if (r <= 12) return 0.95;
  if (r <= 15) return 0.90;
  return 0.85;
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
  // long run time based (support longrun_Xmin and long_run_Xmin)
  if (/long[_-]?run_\d+min/.test(lower)) {
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
  // Intervals: interval_5x800m_5kpace_r90s, interval_6x800m_5kpace_r120, interval_4x1mi_5kpace_R2min
  if (/interval_\d+x/.test(lower)) {
    // Handle both _r and _R, optional s/min suffix
    const m = lower.match(/interval_(\d+)x(\d+)(m|mi)_5kpace(?:_[rR](\d+)(s|min)?)?/);
    if (m) {
      const reps = parseInt(m[1],10);
      const val = parseInt(m[2],10);
      const unit = m[3];
      const dist_m = unit==='mi' ? Math.round(val*1609.34) : val;
      // Parse rest: if m[4] exists, check if m[5] is 'min' (multiply by 60) or default to seconds
      const rest_s = m[4] ? (m[5]==='min' ? parseInt(m[4],10)*60 : parseInt(m[4],10)) : 0;
      const pace = secPerMiFromBaseline(baselines,'fivek') || undefined;
      for (let i=0;i<reps;i+=1) {
        out.push({ id: uid(), kind:'work', distance_m: dist_m, pace_sec_per_mi: pace });
        if (rest_s>0 && i<reps-1) out.push({ id: uid(), kind:'recovery', duration_s: rest_s, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined });
      }
      return out;
    }
  }
  return out;
}

function expandBikeToken(tok: string, baselines: Baselines): any[] {
  const out: any[] = []; const lower = tok.toLowerCase(); const ftp = typeof baselines.ftp==='number'? baselines.ftp: undefined;
  console.log(`🔍 [BIKE DEBUG] Token: ${tok}, FTP: ${ftp}`);
  const pctRange = (lo:number, hi:number)=> {
    if (!ftp) return undefined;
    const result = { lower: Math.round(lo*ftp), upper: Math.round(hi*ftp) };
    console.log(`🔍 [BIKE DEBUG] pctRange(${lo}, ${hi}) = ${result.lower}-${result.upper}W`);
    return result;
  };
  
  // Warmup tokens with proper FTP-based power ranges
  if (/warmup_bike_quality_\d+min_fastpedal/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 900; 
    out.push({ id: uid(), kind:'warmup', duration_s: sec, power_range: pctRange(0.55, 0.70) }); 
    return out; 
  }
  if (/warmup_.*_\d+min/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 900; 
    out.push({ id: uid(), kind:'warmup', duration_s: sec, power_range: pctRange(0.50, 0.65) }); 
    return out; 
  }
  
  // Cooldown tokens with proper FTP-based power ranges
  if (/cooldown.*\d+min/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 600; 
    out.push({ id: uid(), kind:'cooldown', duration_s: sec, power_range: pctRange(0.40, 0.55) }); 
    return out; 
  }
  // SS: bike_ss_3x12min_R4min
  let m = lower.match(/bike_ss_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { 
    const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; 
    console.log(`🔍 [BIKE DEBUG] Sweet spot match: ${reps}x${work/60}min, rest=${rest/60}min`);
    for(let i=0;i<reps;i++){ 
      const powerRange = pctRange(0.85,0.95);
      console.log(`🔍 [BIKE DEBUG] Adding work step ${i+1}/${reps} with power_range:`, powerRange);
      out.push({ id: uid(), kind:'work', duration_s: work, power_range: powerRange }); 
      if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); 
    } 
    return out; 
  }
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
  // Infer session-level swim equipment from tags (e.g., req:board, req:fins, req:buoy, req:snorkel)
  const inferEquipFromTagsOrDesc = (): string | null => {
    try {
      const tags: string[] = Array.isArray((row as any)?.tags) ? (row as any).tags.map((t:any)=>String(t).toLowerCase()) : [];
      const desc: string = String((row as any)?.description || '').toLowerCase();
      if (!tags.length) return null;
      if (tags.some(t=>/req:board|\bboard\b/.test(t))) return 'board';
      if (tags.some(t=>/req:fins|\bfins\b/.test(t))) return 'fins';
      if (tags.some(t=>/req:buoy|\bbuoy\b/.test(t))) return 'buoy';
      if (tags.some(t=>/req:snorkel|\bsnorkel\b/.test(t))) return 'snorkel';
      // Fallback: infer from description keywords
      if (/\bwith\s+board\b|\bkick\s+board\b/.test(desc)) return 'board';
      if (/\bfins\b/.test(desc)) return 'fins';
      if (/\bpull\s+buoy\b|\bbuoy\b/.test(desc)) return 'buoy';
      if (/\bsnorkel\b/.test(desc)) return 'snorkel';
      return null;
    } catch { return null }
  };
  const sessionEquip = inferEquipFromTagsOrDesc();

  // Early path: Strength without tokens → expand from strength_exercises so computed is written
  if (discipline === 'strength' && tokens.length === 0) {
    try {
      const rawStrength: any = (row as any)?.strength_exercises;
      const exs: any[] = Array.isArray(rawStrength)
        ? rawStrength
        : (typeof rawStrength === 'string' ? (()=>{ try { return JSON.parse(rawStrength); } catch { return []; } })() : []);
      if (Array.isArray(exs) && exs.length > 0) {
        for (const ex of exs) {
          const name = String(ex?.name||'exercise');
          const reps = (typeof ex?.reps==='number'? ex.reps : undefined);
          const sets = (typeof ex?.sets==='number'? ex.sets : undefined);
          // Resolve base 1RM and accessory ratio
          const pick = pickPrimary1RMAndBase(name, baselines as any);
          const base1RM = pick.base;
          const ratio = pick.ratio;
          const percentRaw = (typeof ex?.percent_1rm === 'number' ? ex.percent_1rm : (typeof ex?.load?.percent_1rm === 'number' ? ex.load.percent_1rm : undefined));
          const parsed = parseWeightInput((ex as any)?.weight, base1RM);
          let prescribed: number | undefined = undefined;
          if (parsed.weight != null) prescribed = parsed.weight;
          else if (base1RM != null && typeof percentRaw === 'number' && percentRaw>0) {
            const scaled = base1RM * ratio * percentRaw * repScaleFor(reps);
            prescribed = round5(scaled);
          }
          const percent_1rm = (typeof percentRaw==='number' ? percentRaw : (parsed.percent_1rm != null ? parsed.percent_1rm : undefined));
          const strength = { name, sets, reps, weight: prescribed, percent_1rm, resolved_from: pick.ref || undefined } as any;
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch {}
    // No details present: still emit a generic block so computed exists
    steps.push({ id: uid(), kind:'strength', strength: { name: 'strength block' } });
    return { steps, total_s: 0 };
  }

  // Strength WITH tokens: expand authored strength_exercises ONCE (not per-token)
  // Tokens are used for UI copy; the load prescription comes from strength_exercises.
  // Avoid the per-token duplication by handling this branch before iterating tokens.
  if (discipline === 'strength' && tokens.length > 0) {
    try {
      const rawStrength: any = (row as any)?.strength_exercises;
      const exs: any[] = Array.isArray(rawStrength)
        ? rawStrength
        : (typeof rawStrength === 'string' ? (()=>{ try { return JSON.parse(rawStrength); } catch { return []; } })() : []);
      if (exs.length) {
        for (const ex of exs) {
          const name = String(ex?.name||'exercise');
          const reps = (typeof ex?.reps==='number'? ex.reps : (typeof ex?.reps==='string'? ex.reps : undefined));
          const sets = (typeof ex?.sets==='number'? ex.sets : undefined);
          const pick = pickPrimary1RMAndBase(name, baselines as any);
          const base1RM = pick.base;
          const ratio = pick.ratio;
          const percentRaw = (typeof ex?.percent_1rm === 'number' ? ex.percent_1rm : (typeof ex?.load?.percent_1rm === 'number' ? ex.load.percent_1rm : undefined));
          const parsed = parseWeightInput((ex as any)?.weight, base1RM);
          let prescribed: number | undefined = undefined;
          if (parsed.weight != null) prescribed = parsed.weight;
          else if (base1RM != null && typeof percentRaw === 'number' && percentRaw>0) {
            const scaled = base1RM * ratio * (percentRaw as number) * repScaleFor(typeof reps==='number'? reps : undefined);
            prescribed = round5(scaled);
          }
          const percent_1rm = (typeof percentRaw==='number' ? percentRaw : (parsed.percent_1rm != null ? parsed.percent_1rm : undefined));
          const strength = { name, sets, reps, weight: prescribed, percent_1rm, resolved_from: pick.ref || undefined } as any;
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch {}
    // Fallback placeholder if no details present
    steps.push({ id: uid(), kind:'strength', strength: { name: 'strength block' } });
    return { steps, total_s: 0 };
  }
  console.log(`🔍 Parsing ${tokens.length} tokens for ${discipline}:`, tokens);
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
      // Allow optional suffix after unit (e.g., _easy)
      m = s.match(/swim_(warmup|cooldown)_(\d+)(yd|m)(?:_[a-z0-9_]+)?/);
      if (m) { pushWUCD(parseInt(m[2],10), m[3], m[1]==='warmup'); continue; }
      // Drill (name first): swim_drill_<name>_4x50yd(_r15)?(_equipment)?
      m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?/);
      if (m) {
        const name=m[1].replace(/_/g,' '); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const unit=m[4]; const rest=parseInt(m[5]||'0',10); const equip=m[6]||null;
        const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++) { steps.push({ id: uid(), kind:'drill', distance_m: distM, label:`drill ${name}`, equipment: equip||undefined }); if(rest) steps.push({ id: uid(), kind:'recovery', duration_s: rest }); }
        continue;
      }
      // Drill (name first): swim_drill_catchup_4x50yd_r15 (optional equipment)
      m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?/);
      if (m) {
        const name=m[1].replace(/_/g,' '); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const unit=m[4]; const rest=parseInt(m[5]||'0',10); const equip=m[6]||null;
        console.log(`  ✅ Matched drill (name first): name="${name}", reps=${reps}, dist=${dist}${unit}, rest=${rest}s, equip=${equip}`);
        const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++) { 
          steps.push({ id: uid(), kind:'drill', distance_m: distM, label:`drill ${name}`, equipment: equip||undefined }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Drill (count first): swim_drills_6x50yd_fingertipdrag (optional _r15, optional equipment)
      // Use negative lookahead to prevent drill name from consuming _r\d+ pattern
      m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+?)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const name=m[4].replace(/_/g,' '); const rest=parseInt(m[5]||'0',10); const equip=m[6]||null;
        console.log(`  ✅ Matched drill (count first): name="${name}", reps=${reps}, dist=${dist}${unit}, rest=${rest}s, equip=${equip}`);
        const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++) { 
          steps.push({ id: uid(), kind:'drill', distance_m: distM, label:`drill ${name}`, equipment: equip||undefined }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Aerobic sets: swim_aerobic_6x150yd[_easy](_r20)?
      m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_([a-z]+?))?(?:_r(\d+))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const label=m[4]||'aerobic'; const rest=parseInt(m[5]||'0',10); const distM = unit==='yd'? ydToM(dist) : dist;
        console.log(`  ✅ Matched aerobic: reps=${reps}, dist=${dist}${unit}, label="${label}", rest=${rest}s`);
        for(let i=0;i<reps;i++){ 
          steps.push({ id: uid(), kind:'work', distance_m: distM, label }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Threshold sets: swim_threshold_8x100yd(_r10)?
      m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)(?:_r(\d+))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const rest=parseInt(m[4]||'0',10); const distM = unit==='yd'? ydToM(dist) : dist;
        console.log(`  ✅ Matched threshold: reps=${reps}, dist=${dist}${unit}, rest=${rest}s`);
        for(let i=0;i<reps;i++){ 
          steps.push({ id: uid(), kind:'work', distance_m: distM, label:'threshold' }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Pull/Kick sets: swim_pull_4x100yd_r20_buoy
      m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?$/);
      if (m) { 
        const kind=m[1]; 
        const reps=parseInt(m[2],10); 
        const dist=parseInt(m[3],10); 
        const unit=m[4]; 
        const rest=parseInt(m[5]||'0',10); 
        const eq=m[6]|| sessionEquip || (kind==='pull'?'buoy': (kind==='kick'?'board':null)); 
        const distM=unit==='yd'? ydToM(dist):dist; 
        console.log(`  ✅ Matched ${kind}: reps=${reps}, dist=${dist}${unit}, rest=${rest}s, equip=${eq}`);
        for(let i=0;i<reps;i++){ 
          steps.push({ id: uid(), kind:'work', distance_m: distM, label:kind, equipment:eq||undefined }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        } 
        continue; 
      }
      // Fallback distance/time
      if (/\d+yd/.test(s)) { const mm=s.match(/(\d+)yd/); const yd=mm?parseInt(mm[1],10):0; const mtr=ydToM(yd); steps.push({ id: uid(), kind:'work', distance_m: mtr }); continue; }
      if (/\d+min/.test(s)) { const sec=minutesTokenToSeconds(s) ?? 600; steps.push({ id: uid(), kind:'work', duration_s: sec }); continue; }
      steps.push({ id: uid(), kind:'work', duration_s: 300 });
      continue;
    }
    steps.push(...added);
  }
  // Fallback: if no tokens yielded steps, try to expand from workout_structure when present
  try {
    if (steps.length === 0 && row?.workout_structure && typeof row.workout_structure === 'object') {
      const ws: any = row.workout_structure;
      const struct: any[] = Array.isArray(ws?.structure) ? ws.structure : [];
      const toSec = (val?: string | number | null): number => {
        if (typeof val === 'number' && isFinite(val) && val>0) return Math.round(val);
        const txt = String(val||'').trim();
        let m = txt.match(/(\d+)\s*min/i); if (m) return parseInt(m[1],10)*60;
        m = txt.match(/(\d+)\s*s(ec)?\b/i); if (m) return parseInt(m[1],10);
        m = txt.match(/^(\d{1,2}):(\d{2})$/); if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
        return 0;
      };
      const toMeters = (txt?: string | number | null): number => {
        if (typeof txt === 'number' && isFinite(txt) && txt>0) return Math.round(txt);
        const t = String(txt||'');
        let m = t.match(/(\d+(?:\.\d+)?)\s*(yd|yard|yards)\b/i); if (m) return Math.round(parseFloat(m[1])*0.9144);
        m = t.match(/(\d+(?:\.\d+)?)\s*m\b/i); if (m) return Math.round(parseFloat(m[1]));
        m = t.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/i); if (m) return Math.round(parseFloat(m[1])*1609.34);
        m = t.match(/(\d+(?:\.\d+)?)\s*km\b/i); if (m) return Math.round(parseFloat(m[1])*1000);
        return 0;
      };

      for (const seg of struct) {
        const kind = String(seg?.type||'').toLowerCase();
        if (kind === 'warmup' || kind === 'cooldown') {
          const dSec = toSec(seg?.duration);
          const dM = toMeters(seg?.distance);
          if (dM>0) steps.push({ id: uid(), kind: kind==='warmup'?'warmup':'cooldown', distance_m: dM });
          else if (dSec>0) steps.push({ id: uid(), kind: kind==='warmup'?'warmup':'cooldown', duration_s: dSec });
          continue;
        }
        if (kind === 'main_set' && String(seg?.set_type||'').toLowerCase()==='intervals') {
          const reps = Number(seg?.repetitions)||1;
          const work = seg?.work_segment || {};
          const rec = seg?.recovery_segment || {};
          const wSec = toSec(work?.duration);
          const wM = toMeters(work?.distance);
          const rSec = toSec(rec?.duration);
          for (let r=0;r<Math.max(1,reps);r+=1) {
            if (wM>0) steps.push({ id: uid(), kind: 'work', distance_m: wM });
            else if (wSec>0) steps.push({ id: uid(), kind: 'work', duration_s: wSec });
            if (r<reps-1 && rSec>0) steps.push({ id: uid(), kind: 'recovery', duration_s: rSec });
          }
          continue;
        }
        if (kind === 'main_set' && /aerobic/i.test(String(seg?.set_type||''))) {
          const reps = Number(seg?.repetitions)||1; const dist = toMeters(seg?.distance);
          for (let r=0;r<Math.max(1,reps);r+=1) {
            if (dist>0) steps.push({ id: uid(), kind: 'work', distance_m: dist, label: 'aerobic' });
          }
          continue;
        }
        if (kind === 'main_effort' || kind === 'main') {
          const dSec = toSec(seg?.duration); if (dSec>0) steps.push({ id: uid(), kind: 'work', duration_s: dSec });
          const dM = toMeters(seg?.distance); if (dM>0) steps.push({ id: uid(), kind: 'work', distance_m: dM });
          continue;
        }
      }
    }
  } catch {}
  // Final fallback (no parsing of description): if this is a run and row.duration is set,
  // create a single steady step using user's easy pace baseline
  try {
    if (steps.length === 0 && String(row?.type||'').toLowerCase()==='run') {
      const min = Number(row?.duration);
      if (Number.isFinite(min) && min>0) {
        const easy = secPerMiFromBaseline(baselines, 'easy');
        steps.push({ id: uid(), kind: 'work', duration_s: Math.round(min*60), pace_sec_per_mi: easy||undefined });
      }
    }
  } catch {}
  // Final fallback: parse rendered_description/description for a single steady step
  try {
    if (steps.length === 0) {
      const desc = String(row?.rendered_description || row?.description || '').toLowerCase();
      // Duration: prefer an explicit "total duration" marker
      let dMatch = desc.match(/total\s*duration\s*:\s*(\d{1,3}):(\d{2})/);
      if (!dMatch) dMatch = desc.match(/\b(\d{1,3}):(\d{2})\b/);
      const durSec = dMatch ? (parseInt(dMatch[1],10)*60 + parseInt(dMatch[2],10)) : 0;
      // Pace text like 10:30/mi or 5:00/km
      let pMatch = desc.match(/(\d{1,2}):(\d{2})\s*\/mi/);
      let paceSecPerMi: number | null = null;
      if (pMatch) {
        paceSecPerMi = parseInt(pMatch[1],10)*60 + parseInt(pMatch[2],10);
      } else {
        pMatch = desc.match(/(\d{1,2}):(\d{2})\s*\/km/);
        if (pMatch) {
          const spk = parseInt(pMatch[1],10)*60 + parseInt(pMatch[2],10);
          paceSecPerMi = Math.round(spk * 1.60934);
        }
      }
      if (durSec > 0 || (paceSecPerMi!=null)) {
        steps.push({ id: uid(), kind: 'work', duration_s: durSec>0?durSec:1800, pace_sec_per_mi: paceSecPerMi || undefined });
      }
    }
  } catch {}
  // Parse textual target ranges from description and attach as structured fields when missing
  try {
    const desc = String(row?.rendered_description || row?.description || '').toLowerCase();
    const parsePaceRange = (s:string): [number,number] | null => {
      // 10:00-10:30/mi or 5:00-5:15/km
      let m = s.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
      if (!m) return null;
      const a = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const b = parseInt(m[3],10)*60 + parseInt(m[4],10);
      const unit = m[5].toLowerCase();
      if (unit === 'mi') return [Math.min(a,b), Math.max(a,b)];
      const aMi = Math.round(a * 1.60934); const bMi = Math.round(b * 1.60934);
      return [Math.min(aMi,bMi), Math.max(aMi,bMi)];
    };
    const parsePowerRange = (s:string): {lower:number, upper:number} | null => {
      // Handle absolute watt ranges like "200-250W"
      let m = s.match(/(\d{2,4})\s*[–-]\s*(\d{2,4})\s*w/i);
      if (m) {
        const lo = parseInt(m[1],10); const hi = parseInt(m[2],10);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo<=0 || hi<=0) return null;
        return { lower: Math.min(lo,hi), upper: Math.max(lo,hi) };
      }
      
      // Handle FTP percentage ranges like "85-95% FTP" or "90% FTP"
      const ftp = baselines?.ftp;
      if (typeof ftp === 'number' && ftp > 0) {
        // Range format: "85-95% FTP"
        m = s.match(/(\d{1,3})\s*[–-]\s*(\d{1,3})\s*%\s*(?:ftp)?/i);
        if (m) {
          const lo = parseInt(m[1],10); const hi = parseInt(m[2],10);
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo<=0 || hi<=0) return null;
          return { lower: Math.round(ftp * (lo/100)), upper: Math.round(ftp * (hi/100)) };
        }
        
        // Single percentage format: "90% FTP"
        m = s.match(/(\d{1,3})\s*%\s*(?:ftp)?/i);
        if (m) {
          const pct = parseInt(m[1],10);
          if (!Number.isFinite(pct) || pct<=0) return null;
          const center = Math.round(ftp * (pct/100));
          const tolerance = 0.05; // ±5% tolerance
          return { lower: Math.round(center * (1-tolerance)), upper: Math.round(center * (1+tolerance)) };
        }
      }
      
      return null;
    };
    const pr = parsePaceRange(desc);
    const pow = parsePowerRange(desc);
    if (pr || pow) {
      for (const st of steps) {
        const kind = String((st as any)?.kind || '').toLowerCase();
        if (kind === 'recovery' || kind === 'rest') continue;
        if (pr && !(Array.isArray((st as any)?.pace_range))) (st as any).pace_range = pr;
        if (pow && !((st as any)?.power_range && typeof (st as any).power_range.lower==='number')) (st as any).power_range = pow;
      }
    }
  } catch {}
  
  // For swim steps with distance but no duration, estimate duration using baseline pace
  if (discipline === 'swim') {
    try {
      // Parse baseline swim pace from various formats (string "mm:ss" or number seconds)
      const swimPacePer100Sec = (() => {
        // Try numeric format first (seconds per 100)
        const numPace = baselines?.swim_pace_per_100_sec ?? (row as any)?.baselines_template?.swim_pace_per_100_sec ?? (row as any)?.baselines?.swim_pace_per_100_sec;
        if (typeof numPace === 'number' && numPace > 0) {
          console.log(`  🏊 Using numeric baseline pace: ${numPace}s per 100`);
          return numPace;
        }
        
        // Try string format "mm:ss" (e.g., "2:10")
        const strPace = (baselines as any)?.swimPace100 ?? (row as any)?.baselines_template?.swimPace100 ?? (row as any)?.baselines?.swimPace100;
        if (typeof strPace === 'string' && /^\d{1,2}:\d{2}$/.test(strPace)) {
          const [mm, ss] = strPace.split(':').map((t:string)=>parseInt(t,10));
          const sec = mm*60 + ss;
          if (sec > 0) {
            console.log(`  🏊 Using string baseline pace: ${strPace} (${sec}s per 100)`);
            return sec;
          }
        }
        
        // Default fallback: 1:30/100 (90 seconds)
        console.log(`  🏊 No baseline found, using default: 90s per 100 (1:30/100)`);
        return 90;
      })();
      
      // Determine baseline unit from user's preferred units (imperial=yards, metric=meters)
      const userUnits = String((row as any)?.units || '').toLowerCase();
      const baselineUnit = (userUnits === 'imperial') ? 'yd' : 'm';
      const poolUnit = ((row as any)?.pool_unit as 'yd' | 'm' | null) || baselineUnit;
      
      console.log(`  🏊 Baseline unit: ${baselineUnit}, Pool unit: ${poolUnit}`);
      
      for (const st of steps) {
        // Skip if step already has duration
        if (typeof st.duration_s === 'number' && st.duration_s > 0) continue;
        
        // Check both camelCase and snake_case field names
        const distM = typeof st.distanceMeters === 'number' ? st.distanceMeters : (typeof st.distance_m === 'number' ? st.distance_m : 0);
        if (distM > 0) {
          // Convert distance to baseline unit, calculate duration, then apply
          let dist100: number;
          if (baselineUnit === 'yd') {
            // Baseline is per 100 yards
            const distYd = distM / 0.9144;
            dist100 = distYd / 100;
          } else {
            // Baseline is per 100 meters
            dist100 = distM / 100;
          }
          const calcDur = Math.round(dist100 * swimPacePer100Sec);
          st.duration_s = calcDur;
          console.log(`    ⏱️  ${distM}m → ${Math.round(distM/0.9144)}yd → ${dist100.toFixed(2)} × ${swimPacePer100Sec}s = ${calcDur}s`);
        }
      }
    } catch {}
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
  
  // Duration: explicit or calculated from distance + pace
  if (typeof st?.duration_s === 'number') {
    out.seconds = Math.max(1, Math.round(st.duration_s));
  } else if (typeof st?.distance_m === 'number' && st.distance_m > 0) {
    // Calculate duration from distance and pace for distance-based steps
    const distM = st.distance_m;
    let paceSecPerMi: number | null = null;
    
    // Try to get pace from pace_range (use midpoint)
    if (Array.isArray(st?.pace_range) && st.pace_range.length === 2) {
      const a = Number(st.pace_range[0]);
      const b = Number(st.pace_range[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        paceSecPerMi = (a + b) / 2;
      }
    }
    // Fallback to single pace target
    if (!paceSecPerMi && typeof st?.pace_sec_per_mi === 'number' && st.pace_sec_per_mi > 0) {
      paceSecPerMi = st.pace_sec_per_mi;
    }
    
    // Calculate duration: distance (meters) / 1609.34 * pace (sec/mi)
    if (paceSecPerMi && paceSecPerMi > 0) {
      const miles = distM / 1609.34;
      const durationSec = miles * paceSecPerMi;
      out.seconds = Math.max(1, Math.round(durationSec));
    }
  }
  
  if (typeof st?.distance_m === 'number') out.distanceMeters = Math.max(1, Math.round(st.distance_m));
  if (typeof st?.pace_sec_per_mi === 'number') {
    out.paceTarget = `${mmss(st.pace_sec_per_mi)}/mi`;
    
    // Calculate pace range with appropriate tolerance
    // Use strict tolerance for quality work (matches Garmin/TrainingPeaks standards)
    // Use lenient tolerance for easy/recovery/long runs (accounts for terrain, fatigue)
    const paceSec = st.pace_sec_per_mi;
    const tolerance = (st?.kind === 'work') 
      ? 0.02   // ±2% for quality work (~10-20s for most paces)
      : 0.06;  // ±6% for easy runs (~30-60s for most paces)
    
    const lower = Math.round(paceSec * (1 - tolerance));
    const upper = Math.round(paceSec * (1 + tolerance));
    out.pace_range = { lower, upper };
  }
  if (Array.isArray(st?.pace_range) && st.pace_range.length===2) {
    const a = Number(st.pace_range[0]); const b = Number(st.pace_range[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a>0 && b>0) {
      // Store as object with numeric properties for analysis
      out.pace_range = { lower: a, upper: b };
    }
  }
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
      console.log(`🔍 [FTP DEBUG] User ${userId} baselines:`, baselines);
      console.log(`🔍 [FTP DEBUG] FTP value:`, baselines?.ftp);
    } catch (e) {
      console.error(`❌ [FTP DEBUG] Error loading baselines:`, e);
    }

    let count = 0;
    for (const row of rows) {
      try {
        console.log(`📋 Materializing: ${row.type} - ${row.name} (${row.id})`);
        const { steps, total_s } = expandTokensForRow(row, baselines);
        console.log(`  ✅ Generated ${steps.length} steps, total_s: ${total_s} (${Math.floor(total_s/60)}:${String(total_s%60).padStart(2,'0')})`);
        if (steps && steps.length) {
          // Count recovery steps
          const recoverySteps = steps.filter((st:any) => st.kind === 'recovery' || st.kind === 'rest').length;
          console.log(`  🔄 Recovery steps: ${recoverySteps}`);
          // Assign stable planned_index per step
          const withIndex = steps.map((st:any, idx:number)=> ({ ...st, planned_index: idx }));
          const v3 = withIndex.map(toV3Step);
          // Recalculate total from v3 steps (which have calculated durations for distance-based steps)
          const actualTotal = v3.reduce((sum:number, st:any) => sum + (Number(st?.seconds) || 0), 0);
          const update: any = { computed: { normalization_version: 'v3', steps: v3, total_duration_seconds: actualTotal }, total_duration_seconds: actualTotal, duration: Math.max(1, Math.round(actualTotal/60)) };
          await supabase.from('planned_workouts').update(update).eq('id', String(row.id));
          count += 1;
        }
      } catch (err) {
        console.error(`❌ Error materializing ${row.id}:`, err);
      }
    }
    return new Response(JSON.stringify({ success:true, materialized: count }), { headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ error:String(e) }), { status:500, headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  }
});


