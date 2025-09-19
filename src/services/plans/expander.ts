import { getPreset, PRESETS, Preset, SWIM_CATALOG, SWIM_EQUIPMENT_MODS } from './presets';

export type AtomicStep =
  | { id: string; type: 'warmup'|'cooldown'|'steady'; duration_s?: number; distance_m?: number; target?: string; cue?: string }
  | { id: string; type: 'interval_work'|'interval_rest'; duration_s?: number; distance_m?: number; target?: string; cue?: string }
  | { id: string; type: 'strength_work'|'strength_rest'; exercise?: string; set?: number; reps?: number|string; intensity?: string; rest_s?: number }
  // Swim enriched
  | { id: string; type: 'swim_drill'|'swim_pull'|'swim_kick'|'swim_aerobic'|'swim_warmup'|'swim_cooldown'; label?: string; distance_yd?: number; authored_unit?: 'yd'; rest_s?: number; equipment?: string; cue?: string };

export interface ExpandOptions {
  idPrefix?: string;
  override?: { reps?: number; work_time_s?: number; work_dist_m?: number; rest_time_s?: number; rest_dist_m?: number; omit_last_rest?: boolean };
}

const makeId = (prefix: string, parts: (string|number|undefined)[]) => [prefix, ...parts.filter(Boolean)].join('-');

export function parseExpandTags(tags?: string[]|unknown): ExpandOptions {
  try {
    const arr: string[] = Array.isArray(tags) ? (tags as string[]) : [];
    const idp = arr.find(t => t.toLowerCase().startsWith('idprefix:'));
    const exp = arr.find(t => t.toLowerCase().startsWith('expand:'));
    const res: ExpandOptions = {};
    if (idp) res.idPrefix = String(idp.split(':')[1] || '').trim();
    if (exp) {
      const spec = String(exp.split(':')[1]||'');
      const kvs = spec.split(';');
      const o: any = {};
      for (const kv of kvs) {
        const [k,v] = kv.split('=');
        if (!k) continue;
        if (k==='reps') o.reps = Number(v);
        if (k==='work') {
          if (String(v).endsWith('s')) o.work_time_s = Number(String(v).replace('s',''));
          if (String(v).endsWith('m')) o.work_dist_m = Number(String(v).replace('m',''));
        }
        if (k==='rest') {
          if (String(v).endsWith('s')) o.rest_time_s = Number(String(v).replace('s',''));
          if (String(v).endsWith('m')) o.rest_dist_m = Number(String(v).replace('m',''));
        }
        if (k==='omit_last_rest') o.omit_last_rest = String(v||'1')==='1';
      }
      res.override = o;
    }
    return res;
  } catch { return {}; }
}

export function expand(stepsPreset: string[]|null|undefined, swimMain?: string, tags?: string[]|unknown): AtomicStep[] {
  const out: AtomicStep[] = [];
  const opts = parseExpandTags(tags);
  const idPrefix = opts.idPrefix || 'step';
  const steps = Array.isArray(stepsPreset) ? stepsPreset : [];
  // Track tokens handled by preset mappings to avoid double-expanding in the generic parsers below
  const handled = new Set<string>();

  const pushInterval = (reps: number, work: {duration_s?:number; dist_m?:number; target?:string}, rest?: {duration_s?:number; dist_m?:number}) => {
    const r = Math.max(1, Number(opts.override?.reps || reps));
    const workTime = opts.override?.work_time_s ?? work.duration_s;
    const workDist = opts.override?.work_dist_m ?? work.dist_m;
    const restTime = opts.override?.rest_time_s ?? rest?.duration_s;
    const restDist = opts.override?.rest_dist_m ?? rest?.dist_m;
    for (let i=1;i<=r;i+=1){
      out.push({ id: makeId(idPrefix, ['rep', String(i).padStart(2,'0'), 'work']), type: 'interval_work', duration_s: workTime, distance_m: workDist, target: work.target });
      const last = i===r;
      // Default behavior: omit the trailing rest on the final rep unless explicitly overridden to include it
      const defaultOmit = true;
      const omitFlag = opts.override?.omit_last_rest;
      const omit = (typeof omitFlag === 'boolean' ? omitFlag : defaultOmit) && last;
      if (!omit && (restTime || restDist)) out.push({ id: makeId(idPrefix, ['rep', String(i).padStart(2,'0'), 'rest']), type: 'interval_rest', duration_s: restTime, distance_m: restDist });
    }
  };

  for (const token of steps) {
    const preset = getPreset(token);
    if (!preset) continue;
    if ((preset as any).kind === 'steady') {
      const p = preset as any;
      out.push({ id: makeId(idPrefix, [token]), type: token.includes('cooldown')?'cooldown': token.includes('warmup')?'warmup':'steady', duration_s: p.duration_s, target: p.target });
      handled.add(String(token).toLowerCase());
    } else if ((preset as any).kind === 'interval') {
      const p = preset as any;
      pushInterval(p.reps, { duration_s: p.work.duration_s, dist_m: p.work.dist_m, target: p.work.target }, p.rest);
      handled.add(String(token).toLowerCase());
    } else if ((preset as any).kind === 'tempo') {
      const p = preset as any;
      out.push({ id: makeId(idPrefix, [token]), type: 'steady', distance_m: p.dist_m, target: p.target });
      handled.add(String(token).toLowerCase());
    } else if ((preset as any).kind === 'longrun') {
      const p = preset as any;
      out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: p.duration_s, target: p.target });
      handled.add(String(token).toLowerCase());
    } else if ((preset as any).exercise) {
      const s = preset as any;
      for (let set=1; set<=Number(s.sets||1); set+=1){
        // Heuristic work duration: 3s per rep accessories, 4s compounds
        const exName = String(s.exercise || '').toLowerCase();
        const perRep = /(squat|deadlift|bench|ohp|press|row)/.test(exName) ? 4 : 3;
        const repsNum = typeof s.reps === 'number' ? s.reps : (String(s.reps||'').toLowerCase()==='amrap' ? 8 : parseInt(String(s.reps||'0'),10));
        const work_s = Number.isFinite(repsNum) ? Math.max(5, repsNum * perRep) : undefined;
        out.push({ id: makeId(idPrefix, [s.exercise, 'set', String(set).padStart(2,'0')]), type: 'strength_work', exercise: s.exercise, set, reps: s.reps, intensity: s.intensity, rest_s: s.rest_s, duration_s: work_s } as any);
        if (typeof s.rest_s === 'number' && s.rest_s>0) {
          out.push({ id: makeId(idPrefix, [s.exercise, 'rest', String(set).padStart(2,'0')]), type: 'strength_rest', rest_s: s.rest_s, duration_s: s.rest_s } as any);
        }
      }
      handled.add(String(token).toLowerCase());
    }
  }

  // Generic parsing for new deterministic tokens (run/bike)
  for (const token of steps) {
    if (handled.has(String(token).toLowerCase())) continue; // avoid double-expansion
    const t = String(token).toLowerCase();
    // Run easy: run_easy_30min
    let m = t.match(/^run_easy_(\d{2,3})min$/i);
    if (m) { out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: parseInt(m[1],10)*60, target: '{easy_pace}' }); continue; }
    // Long run base: longrun_90min_easypace
    m = t.match(/^longrun_(\d{2,3})min_easypace$/i);
    if (m) { out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: parseInt(m[1],10)*60, target: '{easy_pace}' }); continue; }
    // Speed sets: speed_8x20s_R60s or speed_6x100m_R90s
    m = t.match(/^speed_(\d+)x(\d+)(s|m)_r(\d+)(s|min)$/i);
    if (m) {
      const reps = parseInt(m[1],10);
      const amt = parseInt(m[2],10);
      const isTime = m[3].toLowerCase()==='s';
      const restRaw = parseInt(m[4],10);
      const rest = m[5].toLowerCase()==='min' ? restRaw*60 : restRaw;
      for (let i=1;i<=reps;i+=1){
        if (isTime) out.push({ id: makeId(idPrefix, ['speed','rep', String(i).padStart(2,'0')]), type: 'interval_work', duration_s: amt, target: 'fast' });
        else out.push({ id: makeId(idPrefix, ['speed','rep', String(i).padStart(2,'0')]), type: 'interval_work', distance_m: amt, target: 'fast' });
        if (i<reps) out.push({ id: makeId(idPrefix, ['speed','rest', String(i).padStart(2,'0')]), type: 'interval_rest', duration_s: rest });
      }
      continue;
    }
    // Run drills bundles → warmup-style steady time blocks
    if (/^drills_a_b_skips_high_knees$/i.test(t)) { out.push({ id: makeId(idPrefix, [token]), type: 'warmup', duration_s: 10*60, target: '{easy_pace}' }); continue; }
    if (/^drills_butt_kicks_carioca$/i.test(t)) { out.push({ id: makeId(idPrefix, [token]), type: 'warmup', duration_s: 8*60, target: '{easy_pace}' }); continue; }
    if (/^drills_leg_swings_dynamic$/i.test(t)) { out.push({ id: makeId(idPrefix, [token]), type: 'warmup', duration_s: 6*60, target: '{easy_pace}' }); continue; }
    // Run intervals: interval_<reps>x<dist>(m|mi)_<paceTag>[_plusMM:SS]_r<restSeconds>
    // Accept rest in seconds (r120) or minutes (r2min)
    m = t.match(/^interval_(\d+)x(\d+)(m|mi)_([a-z0-9_]+?)(?:_plus(\d{1,2}:\d{2}))?_r(\d+)(?:min)?$/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const distNum = parseInt(m[2], 10);
      const unit = (m[3]||'m').toLowerCase();
      const paceTag = (m[4]||'').toLowerCase();
      const plus = m[5] ? m[5] : undefined;
      const rest = parseInt(m[6], 10) * (t.includes('r') && t.includes('min') ? 60 : 1);
      const dist_m = unit === 'mi' ? Math.round(distNum * 1609) : distNum;
      const mapped = paceTag.replace('pace', '_pace');
      const target = `{${mapped}}${plus?`+${plus}`:''}`;
      const idPrefixLocal = `${idPrefix}-${token}`;
      pushInterval(reps, { dist_m, target }, { duration_s: rest });
      continue;
    }
    // Run tempo distance: tempo_<distMi>mi_<paceTag>[_plusMM:SS]
    m = t.match(/^tempo_(\d+)mi_([a-z0-9_]+?)(?:_plus(\d{1,2}:\d{2}))?$/i);
    if (m) {
      const miles = parseInt(m[1], 10);
      const paceTag = (m[2]||'').toLowerCase();
      const plus = m[3] ? m[3] : undefined;
      const dist_m = Math.round(miles * 1609);
      const mapped = paceTag.replace('pace', '_pace');
      const target = `{${mapped}}${plus?`+${plus}`:''}`;
      out.push({ id: makeId(idPrefix, [token]), type: 'steady', distance_m: dist_m, target });
      continue;
    }
    // Cruise intervals: cruise_<reps>x<distMi>mi_<paceTag>[_plusMM:SS]_r<restSeconds>
    m = t.match(/^cruise_(\d+)x([0-9_.]+)mi_([a-z0-9_]+?)(?:_plus(\d{1,2}:\d{2}))?_r(\d+)(?:min)?$/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const distStr = (m[2]||'').replace('_', '.');
      const miles = Number(distStr);
      const dist_m = Math.round(miles * 1609);
      const paceTag = (m[3]||'').toLowerCase();
      const plus = m[4] ? m[4] : undefined;
      const rest = parseInt(m[5], 10) * (t.includes('r') && t.includes('min') ? 60 : 1);
      const mapped = paceTag.replace('pace', '_pace');
      const target = `{${mapped}}${plus?`+${plus}`:''}`;
      pushInterval(reps, { dist_m, target }, { duration_s: rest });
      continue;
    }
    // Bike intervals: bike_(vo2|thr|ss)_<reps>x<minutes>min_r<restSeconds>
    m = t.match(/^bike_(vo2|thr|ss)_(\d+)x(\d+)min_r(\d+)(?:min)?$/i);
    if (m) {
      const kind = m[1].toLowerCase();
      const reps = parseInt(m[2], 10);
      const minutes = parseInt(m[3], 10);
      const rest = parseInt(m[4], 10) * (t.includes('r') && t.includes('min') ? 60 : 1);
      const work_s = minutes * 60;
      const target = kind === 'vo2' ? '{VO2_power}' : kind === 'thr' ? '{threshold_power}' : '{sweetspot_power}';
      pushInterval(reps, { duration_s: work_s, target }, { duration_s: rest });
      continue;
    }
    // Bike tempo continuous: bike_tempo_20min
    m = t.match(/^bike_tempo_(\d{2,3})min$/i);
    if (m) { out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: parseInt(m[1],10)*60, target: 'Z3' }); continue; }
    // Bike neuromuscular / anaerobic time-based reps: bike_(neuro|anaerobic)_Nx(15s|30s|45s|60s)_r(rest)
    m = t.match(/^bike_(neuro|anaerobic)_(\d+)x(\d+)(s|min)_r(\d+)(?:min)?$/i);
    if (m) {
      const kind = m[1].toLowerCase();
      const reps = parseInt(m[2],10);
      const amt = parseInt(m[3],10) * (m[4].toLowerCase()==='min'?60:1);
      const rest = parseInt(m[5],10) * (t.includes('min')?60:1);
      const target = kind==='neuro' ? 'sprint' : 'Z5';
      for (let i=1;i<=reps;i+=1){
        out.push({ id: makeId(idPrefix, ['bike', kind, 'work', String(i).padStart(2,'0')]), type: 'interval_work', duration_s: amt, target });
        if (i<reps) out.push({ id: makeId(idPrefix, ['bike', kind, 'rest', String(i).padStart(2,'0')]), type: 'interval_rest', duration_s: rest });
      }
      continue;
    }
    // Bike SS single blocks: bike_ss_1x45min, bike_ss_1x60min
    m = t.match(/^bike_ss_1x(\d+)min$/i);
    if (m) { out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: parseInt(m[1],10)*60, target: '{sweetspot_power}' }); continue; }
    // Bike endurance single-block: bike_endurance_<minutes>min[_z*]
    m = t.match(/^bike_endurance_(\d+)min(?:_(z1|z1-2|z2|z2-3))?(?:_cad\d+(?:-\d+)?)?$/i);
    if (m) { const minutes=parseInt(m[1],10); const zone=(m[2]||'Z2').toUpperCase(); out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: minutes*60, target: zone }); continue; }
    // Bike recovery
    m = t.match(/^bike_recovery_(\d{2,3})min(?:_(z1|z2))?$/i);
    if (m) { const minutes=parseInt(m[1],10); const z=(m[2]||'z1').toUpperCase(); out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: minutes*60, target: z }); continue; }
    // Bike warmup shorthand
    m = t.match(/^bike_warmup_(\d{1,3})$/i);
    if (m) { out.push({ id: makeId(idPrefix, [token]), type: 'warmup', duration_s: parseInt(m[1],10)*60 }); continue; }
    // Bike warmup/cooldown generic durations
    m = t.match(/^warmup_bike_quality_(\d+)min_[a-z0-9_]+$/i);
    if (m) { out.push({ id: makeId(idPrefix, [token]), type: 'warmup', duration_s: parseInt(m[1],10)*60 }); continue; }
    m = t.match(/^cooldown_bike_easy_(\d+)min$/i);
    if (m) { out.push({ id: makeId(idPrefix, [token]), type: 'cooldown', duration_s: parseInt(m[1],10)*60 }); continue; }
    // Bike race prep/openers
    m = t.match(/^bike_race_prep_(\d+)x(\d+)(min|s)_race_pace$/i);
    if (m) { const reps=parseInt(m[1],10); const amt=parseInt(m[2],10)*(m[3].toLowerCase()==='min'?60:1); for(let i=1;i<=reps;i+=1){ out.push({ id: makeId(idPrefix, ['bike','race-pace', String(i).padStart(2,'0')]), type: 'interval_work', duration_s: amt, target: 'race' }); if(i<reps) out.push({ id: makeId(idPrefix, ['bike','rest', String(i).padStart(2,'0')]), type: 'interval_rest', duration_s: 120 }); } continue; }
    if (/^bike_openers$/i.test(t)) { for (let i=1;i<=3;i+=1){ out.push({ id: makeId(idPrefix, ['bike','opener', String(i).padStart(2,'0')]), type: 'interval_work', duration_s: 60 }); if(i<3) out.push({ id: makeId(idPrefix, ['bike','rest', String(i).padStart(2,'0')]), type: 'interval_rest', duration_s: 120 }); } continue; }
  }

  // Also parse swim tokens from steps_preset when present (fallback when swimMain is absent)
  for (const token of steps) {
    const t = String(token).toLowerCase();
    // swim warmup/cooldown distance
    let m = t.match(/^swim_(warmup|cooldown)_(\d+)(yd|m)(?:_[a-z0-9_]+)?$/i);
    if (m) {
      const kind = m[1].toLowerCase();
      const dist = parseInt(m[2],10);
      const unit = (m[3]||'yd').toLowerCase();
      const yd = unit==='m' ? Math.round(dist/0.9144/25)*25 : Math.round(dist/25)*25;
      out.push({ id: makeId(idPrefix, ['swim', kind]), type: kind==='warmup'?'swim_warmup':'swim_cooldown', label: kind==='warmup'?'Warm‑up':'Cool‑down', distance_yd: yd, authored_unit: 'yd' });
      continue;
    }
    // swim drills legacy like swim_drills_4x50yd_catchup
    m = t.match(/^swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
    if (m) {
      const reps = parseInt(m[1],10); const each = parseInt(m[2],10); const unit=(m[3]||'yd').toLowerCase(); const key=(m[4]||'').toLowerCase();
      const cat = SWIM_CATALOG[key] || { type: 'swim_drill', label: 'Drill', cue: '', equipment: 'none' } as any;
      const ydEach = unit==='m' ? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25;
      const defaultRest = key==='catchup'?15: key==='singlearm'||key==='single_arm'?20: undefined;
      for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim','drill',key,String(i).padStart(2,'0')]), type: 'swim_drill', label: cat.label, distance_yd: ydEach, authored_unit: 'yd', rest_s: defaultRest, equipment: cat.equipment, cue: cat.cue });
      continue;
    }
    // swim drills new: swim_drill_<name>_<reps>x<dist>(yd|m)_r<rest>[_equip...]
    m = t.match(/^swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)_r(\d+)(?:_(.+))?$/i);
    if (m) {
      const key = (m[1]||'').toLowerCase();
      const reps = parseInt(m[2],10);
      const each = parseInt(m[3],10);
      const unit = (m[4]||'yd').toLowerCase();
      const rest = parseInt(m[5],10);
      const equipSuffix = (m[6]||'').split('_').map(s=>s.trim().toLowerCase()).filter(Boolean);
      const cat = SWIM_CATALOG[key] || { type: 'swim_drill', label: 'Drill', cue: '', equipment: 'none' } as any;
      const ydEach = unit==='m' ? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25;
      const equipFromMods = equipSuffix.map(e => SWIM_EQUIPMENT_MODS[e]?.equipment).filter(Boolean) as string[];
      const equip = [cat.equipment, ...equipFromMods].filter(Boolean).join(', ').trim() || undefined;
      for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim','drill',key,String(i).padStart(2,'0')]), type: 'swim_drill', label: cat.label, distance_yd: ydEach, authored_unit: 'yd', rest_s: rest, equipment: equip, cue: cat.cue });
      continue;
    }
    // swim pull/kick/aerobic new: swim_(pull|kick|aerobic)_<reps>x<dist>(yd|m)_r<rest>[_equip...]
    // Parse this before legacy so suffixes aren't swallowed
    m = t.match(/^swim_(pull|kick|aerobic)_(\d+)x(\d+)(yd|m)_r(\d+)(?:_(.+))?$/i);
    if (m) {
      const kind = m[1].toLowerCase(); const reps = parseInt(m[2],10); const each = parseInt(m[3],10); const unit=(m[4]||'yd').toLowerCase(); const rest = parseInt(m[5],10);
      const mods = (m[6]||'').split('_').map(s=>s.trim().toLowerCase()).filter(Boolean);
      const base = SWIM_CATALOG[kind];
      const ydEach = unit==='m' ? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25;
      const equipFromMods = mods.map(e=>SWIM_EQUIPMENT_MODS[e]?.equipment).filter(Boolean) as string[];
      const baseEquip = base?.equipment ? [base.equipment] : [];
      const equip = [...baseEquip, ...equipFromMods].filter(Boolean).join(', ').trim() || undefined;
      const typeMap: any = { pull: 'swim_pull', kick: 'swim_kick', aerobic: 'swim_aerobic' };
      const label = base?.label || (kind==='pull'?'Pull': kind==='kick'?'Kick':'Aerobic');
      for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim',kind,String(i).padStart(2,'0')]), type: typeMap[kind], label, distance_yd: ydEach, authored_unit: 'yd', equipment: equip, rest_s: rest });
      continue;
    }
    // swim threshold/interval new: swim_(threshold|interval)_<reps>x<dist>(yd|m)_r<rest>
    m = t.match(/^swim_(threshold|interval)_(\d+)x(\d+)(yd|m)_r(\d+)$/i);
    if (m) {
      const kind = m[1].toLowerCase();
      const reps = parseInt(m[2],10);
      const each = parseInt(m[3],10);
      const unit = (m[4]||'yd').toLowerCase();
      const rest = parseInt(m[5],10);
      const ydEach = unit==='m' ? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25;
      const label = kind==='threshold' ? 'Threshold' : 'Interval';
      for (let i=1;i<=reps;i+=1) {
        out.push({ id: makeId(idPrefix, ['swim', kind, String(i).padStart(2,'0')]), type: 'swim_aerobic', label, distance_yd: ydEach, authored_unit: 'yd', rest_s: rest });
      }
      continue;
    }
    // swim pull/kick legacy like swim_pull_2x100yd (anchor at end to avoid swallowing modern tokens)
    m = t.match(/^swim_(pull|kick)_(\d+)x(\d+)(yd|m)$/i);
    if (m) {
      const kind = m[1].toLowerCase(); const reps = parseInt(m[2],10); const each = parseInt(m[3],10); const unit=(m[4]||'yd').toLowerCase();
      const base = SWIM_CATALOG[kind];
      const ydEach = unit==='m' ? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25;
      for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim',kind,String(i).padStart(2,'0')]), type: (base?.type || (kind==='pull'?'swim_pull':'swim_kick')) as any, label: base?.label || (kind==='pull'?'Pull':'Kick'), distance_yd: ydEach, authored_unit: 'yd', equipment: base?.equipment });
      continue;
    }
    // swim aerobic blocks like swim_aerobic_6x100yd
    m = t.match(/^swim_aerobic_(\d+)x(\d+)(yd|m)(?:_[a-z0-9_]+)?$/i);
    if (m) {
      const reps = parseInt(m[1],10); const each = parseInt(m[2],10); const unit=(m[3]||'yd').toLowerCase();
      const ydEach = unit==='m' ? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25;
      for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim','aerobic',String(i).padStart(2,'0')]), type: 'swim_aerobic', label: SWIM_CATALOG['aerobic']?.label || 'Aerobic', distance_yd: ydEach, authored_unit: 'yd' });
      continue;
    }
    // explicit swim rest between blocks: swim_rest_r<seconds>
    m = t.match(/^swim_rest_r(\d+)$/i);
    if (m) {
      const rest = parseInt(m[1], 10);
      out.push({ id: makeId(idPrefix, ['swim','rest', String(rest)]), type: 'interval_rest', duration_s: rest });
      continue;
    }
  }

  // Parse strength tokens (st_*) into v3 steps so materializer has computedStepsV3
  for (const token of steps) {
    const t = String(token).toLowerCase();
    // Warmup/Cooldown minutes: st_wu_8, st_cool_5 → duration-based, not sets
    let m = t.match(/^st_(wu|cool)_(\d{1,3})$/i);
    if (m) {
      const kind = m[1].toLowerCase();
      const minutes = parseInt(m[2], 10);
      const type = kind === 'wu' ? 'warmup' : 'cooldown';
      out.push({ id: makeId(idPrefix, ['strength', type]), type: type as any, duration_s: Math.max(1, minutes * 60) } as any);
      continue;
    }
    // Main/accessory/core: st_main_back_squat_5x5_@pct70_rest150, st_acc_barbell_row_4x6_rest75, st_core_rollouts_3x15_rest45
    m = t.match(/^st_(main|acc|core)_([a-z0-9_]+)_(\d+)x(\d+|amrap)(?:_@pct(\d+))?(?:_rest(\d+))?(?:_rir\d+)?$/i);
    if (m) {
      const group = m[1].toLowerCase();
      const exercise = (m[2]||'').replace(/_/g, ' ');
      const sets = parseInt(m[3], 10);
      const repsTxt = (m[4]||'').toLowerCase();
      const reps = repsTxt === 'amrap' ? 'AMRAP' : parseInt(repsTxt, 10);
      const pct = m[5] ? `${parseInt(m[5],10)}%1RM` : undefined;
      const rest = m[6] ? parseInt(m[6], 10) : undefined;
      // Heuristic per-set work duration to improve total time estimates
      const exLower = exercise.toLowerCase();
      const isCompound = /(squat|deadlift|bench|ohp|overhead|press|row)/.test(exLower);
      const perRepSec = isCompound ? 4 : 3;
      const repsNum = typeof reps === 'number' ? reps : 8; // default for AMRAP
      const work_s = Math.max(5, repsNum * perRepSec);
      for (let sIdx=1; sIdx<=sets; sIdx+=1) {
        out.push({ id: makeId(idPrefix, ['strength', group, exercise.replace(/\s+/g,'-'), 'set', String(sIdx).padStart(2,'0')]), type: 'strength_work', exercise, set: sIdx, reps, intensity: pct, rest_s: rest, duration_s: work_s } as any);
        // Insert rest only BETWEEN sets (omit after last)
        if (sIdx < sets && typeof rest === 'number' && rest>0) {
          out.push({ id: makeId(idPrefix, ['strength', group, exercise.replace(/\s+/g,'-'), 'rest', String(sIdx).padStart(2,'0')]), type: 'strength_rest', rest_s: rest, duration_s: rest } as any);
        }
      }
      continue;
    }
  }

  // Swim main DSL → atomic blocks (yards-first semantics)
  if (typeof swimMain === 'string' && swimMain.trim()) {
    const parts = swimMain.split(';').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const m1 = part.match(/^drills\(([^)]+)\)$/i);
      if (m1) {
        const drills = m1[1].split(',').map(x=>x.trim());
        for (const d of drills) {
          // Support: name@15r(mod1,mod2)
          const dm = d.match(/^([a-z0-9_]+)(?:@(\d+)r)?(?:\(([^)]+)\))?$/i);
          const name = (dm?.[1] || d).toLowerCase();
          const rest = dm?.[2] ? Number(dm[2]) : undefined;
          const mods = (dm?.[3] || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
          const cat = SWIM_CATALOG[name] || { type: 'swim_drill', label: 'Drill', cue: '', is_drill: true, equipment: 'none' } as any;
          const equipMods = mods.map(m=>SWIM_EQUIPMENT_MODS[m]?.equipment).filter(Boolean) as string[];
          const equipParts = [cat.equipment, ...equipMods].filter(Boolean);
          const equip = equipParts.join(', ').trim() || undefined;
          const defaultRest = name==='catchup'?15: name==='singlearm'?20: undefined;
          out.push({ id: makeId(idPrefix, ['swim','drill',name]), type: 'swim_drill', label: cat.label, distance_yd: 50, authored_unit: 'yd', rest_s: typeof rest==='number'?rest: defaultRest, equipment: equip, cue: cat.cue });
        }
        continue;
      }
      const m2 = part.match(/^(pull|kick)(\d+)x(\d+)(?:@(\d+)r)?(?:\(([^)]+)\))?$/i);
      if (m2) {
        const reps = Number(m2[2]); const each = Number(m2[3]); const rest = m2[4]?Number(m2[4]):undefined; const mods = String(m2[5]||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
        const base = SWIM_CATALOG[m2[1].toLowerCase()];
        const equip = [base?.equipment].concat(mods.map(m=>SWIM_EQUIPMENT_MODS[m]?.equipment).filter(Boolean) as string[]).filter(Boolean).join(', ').replace(/,\s*,/g, ', ').trim();
        for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim', m2[1].toLowerCase(), String(i).padStart(2,'0')]), type: (base?.type || 'swim_aerobic') as any, label: base?.label || (m2[1].toLowerCase()==='pull'?'Pull':'Kick'), distance_yd: each, authored_unit: 'yd', equipment: equip||undefined, rest_s: rest });
        continue;
      }
      const m3 = part.match(/^aerobic\((\d+)x(\d+)(?:@(?:(\d+))?r)?(?:,([^\)]+))?\)$/i);
      if (m3) {
        const reps = Number(m3[1]); const each = Number(m3[2]); const rest = m3[3]?Number(m3[3]):undefined; const mods = String(m3[4]||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
        const base = SWIM_CATALOG['aerobic'];
        // aerobic default equipment: none; only explicit modifiers apply
        const equip = mods.map(m=>SWIM_EQUIPMENT_MODS[m]?.equipment).filter(Boolean).join(', ').trim();
        for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim','aerobic', String(i).padStart(2,'0')]), type: 'swim_aerobic', label: base?.label || 'Aerobic', distance_yd: each, authored_unit: 'yd', rest_s: rest?rest:undefined, equipment: equip||undefined });
        continue;
      }
    }
  }

  return out;
}


