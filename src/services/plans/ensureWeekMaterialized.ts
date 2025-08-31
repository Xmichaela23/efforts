import { supabase } from '@/lib/supabase';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import { expandSession, DEFAULTS_FALLBACK } from '@/services/plans/plan_dsl';

type PlannedRow = {
  user_id: string;
  training_plan_id: string;
  template_id?: string;
  week_number: number;
  day_number: number;
  date: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  workout_status: 'planned';
  source: 'training_plan';
  steps_preset?: string[] | null;
  export_hints?: any;
  rendered_description?: string;
  computed?: any;
  units?: 'imperial' | 'metric';
  intensity?: any;
  intervals?: any[];
  strength_exercises?: any[];
};

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
const dayIndex: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };

function addDays(iso: string, n: number) {
  const parts = String(iso).split('-').map((x) => parseInt(x, 10));
  const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  base.setDate(base.getDate() + n);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeStartDateFromWeek1Anchor(anchorDate: string, anchorDayNumber: number | null): string {
  if (!anchorDate) {
    // fallback: next Monday local
    const d = new Date();
    const day = d.getDay(); // 0..6 Sun..Sat
    const diff = (8 - day) % 7 || 7;
    const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return nm.toISOString().slice(0,10);
  }
  const dn = typeof anchorDayNumber === 'number' && anchorDayNumber >= 1 && anchorDayNumber <= 7 ? anchorDayNumber : 1;
  return addDays(anchorDate, -(dn - 1));
}

export async function ensureWeekMaterialized(planId: string, weekNumber: number): Promise<{ inserted: number }>{
  // 1) If rows already exist for this week, upgrade any that are missing intervals
  const { data: existing, error: existErr } = await supabase
    .from('planned_workouts')
    .select('id, type, steps_preset, intervals')
    .eq('training_plan_id', planId)
    .eq('week_number', weekNumber);
  if (!existErr && Array.isArray(existing) && existing.length > 0) {
    try {
      // Helper to derive intervals from tokens for upgrades (same rules as inserts below)
      const deriveFromTokens = (stepsPreset?: any[], discipline?: string) => {
        const steps: string[] = Array.isArray(stepsPreset) ? stepsPreset.map((t:any)=>String(t)) : [];
        if (steps.length === 0) return undefined as any[] | undefined;
        const out: any[] = [];
        const fivek: string | undefined = (()=>{ try { return String(({} as any)).trim(); } catch { return undefined; }})();
        // We don't have perfNumbers yet at this point of function; they are loaded later.
        // To keep upgrades simple without extra queries, build distance/time-only steps here.
        const tokenStr = steps.join(' ').toLowerCase();
        const toMeters = (n:number, unit:'m'|'mi'|'yd'|'km'='m') => unit==='mi'?Math.floor(n*1609.34):unit==='yd'?Math.floor(n*0.9144):unit==='km'?Math.floor(n*1000):Math.floor(n);
        // Warmup/Cooldown
        steps.forEach((t)=>{ const s=String(t).toLowerCase(); let m=s.match(/warmup.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/); if(m){ const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; out.push({ effortLabel:'warm up', duration: Math.max(1, Math.round(((a+b)/2)*60)) }); }
          m=s.match(/cooldown.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/); if(m){ const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; out.push({ effortLabel:'cool down', duration: Math.max(1, Math.round(((a+b)/2)*60)) }); }
        });
        const iv = tokenStr.match(/interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)/i);
        if (iv){ const reps=parseInt(iv[1],10); const each=parseFloat(iv[2]); const unit=(iv[3]||'m').toLowerCase() as 'm'|'mi';
          const r = tokenStr.match(/_r(\d+)(?:-(\d+))?min/i); const ra=r?parseInt(r[1],10):0; const rb=r&&r[2]?parseInt(r[2],10):ra; const restSec=Math.round(((ra||0)+(rb||0))/2)*60;
          for(let k=0;k<reps;k+=1){ out.push({ effortLabel:'interval', distanceMeters: toMeters(each, unit) }); if (k<reps-1 && restSec>0) out.push({ effortLabel:'rest', duration: restSec }); }
        }
        const tm = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi/i); if (tm){ out.push({ effortLabel:'tempo', distanceMeters: toMeters(parseFloat(tm[1]), 'mi') }); }
        const st = tokenStr.match(/strides_(\d+)x(\d+)s/i); if (st){ const reps=parseInt(st[1],10); const secEach=parseInt(st[2],10); for(let r=0;r<reps;r+=1) out.push({ effortLabel:'interval', duration: secEach }); }
        const bike = tokenStr.match(/bike_(vo2|thr|ss)_(\d+)x(\d+)min(?:_r(\d+)min)?/i); if (bike){ const reps=parseInt(bike[2],10); const minEach=parseInt(bike[3],10); const rmin=bike[4]?parseInt(bike[4],10):0; for(let r=0;r<reps;r+=1){ out.push({ effortLabel:'interval', duration:minEach*60 }); if (r<reps-1 && rmin>0) out.push({ effortLabel:'rest', duration:rmin*60 }); } }
        const bend = tokenStr.match(/bike_endurance_(\d+)min/i); if (bend){ out.push({ effortLabel:'endurance', duration: parseInt(bend[1],10)*60 }); }
        const lr = tokenStr.match(/longrun_(\d+)min/i); if (lr){ out.push({ effortLabel:'long run', duration: parseInt(lr[1],10)*60 }); }
        if (String(discipline||'').toLowerCase()==='swim'){
          steps.forEach((t)=>{ const s=String(t).toLowerCase(); let m=s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i); if (m){ const dist=parseInt(m[1],10); const u=(m[2]||'yd').toLowerCase() as any; out.push({ effortLabel: /warmup/i.test(s)?'warm up':'cool down', distanceMeters: toMeters(dist, u) }); return; }
            m=s.match(/swim_drills_(\d+)x(\d+)(yd|m)/i); if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel:'drill', distanceMeters: toMeters(each, u) }); return; }
            m=s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i); if (m){ const reps=parseInt(m[2],10), each=parseInt(m[3],10); const u=(m[4]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel: m[1]==='pull'?'pull':'kick', distanceMeters: toMeters(each, u) }); return; }
            m=s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i); if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel:'aerobic', distanceMeters: toMeters(each, u) }); return; }
          });
        }
        return out.length ? out : undefined;
      };

      const missing = existing.filter((r:any)=> !Array.isArray(r?.intervals) || r.intervals.length === 0);
      for (const row of missing) {
        const derived = deriveFromTokens(row?.steps_preset as any[], row?.type as string);
        if (Array.isArray(derived) && derived.length) {
          await supabase.from('planned_workouts').update({ intervals: derived as any }).eq('id', row.id);
        }
      }
    } catch {}
    // We upgraded existing rows where needed; nothing to insert
    return { inserted: 0 };
  }

  // 2) Auth user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // 3) Load plan (sessions_by_week + config.catalog_id)
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, name, description, duration_weeks, sessions_by_week, config')
    .eq('id', planId)
    .single();
  if (planErr || !plan) throw planErr || new Error('Plan not found');

  const sessionsByWeek = (plan as any).sessions_by_week || {};
  const planDefaults = (plan as any)?.defaults || DEFAULTS_FALLBACK;
  const weekSessions: any[] = sessionsByWeek[String(weekNumber)] || [];
  if (!Array.isArray(weekSessions) || weekSessions.length === 0) return { inserted: 0 };

  // 4) Determine export_hints from library plan, if available
  let exportHints: any = null;
  try {
    const catalogId = (plan as any)?.config?.catalog_id;
    if (catalogId) {
      const lib = await supabase.from('library_plans').select('template').eq('id', catalogId).single();
      exportHints = (lib.data?.template?.export_hints || null);
    }
  } catch {}

  // 5) Determine start_date from existing Week 1 rows
  let startDate = (() => {
    try { return (plan as any).start_date as string; } catch { return undefined; }
  })() as string | undefined;
  if (!startDate) {
    const { data: w1, error: w1Err } = await supabase
      .from('planned_workouts')
      .select('date, day_number')
      .eq('training_plan_id', planId)
      .eq('week_number', 1)
      .order('day_number', { ascending: true })
      .order('date', { ascending: true })
      .limit(1);
    if (!w1Err && Array.isArray(w1) && w1.length > 0) {
      const anchor = w1[0] as any;
      startDate = computeStartDateFromWeek1Anchor(anchor.date as string, anchor.day_number as number);
    }
  }
  if (!startDate) {
    // fallback next Monday
    const d = new Date();
    const day = d.getDay();
    const diff = (8 - day) % 7 || 7;
    const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    startDate = nm.toISOString().slice(0,10);
  }

  // 6) Load baselines for normalization
  let perfNumbers: any = {};
  let unitsPref: 'imperial' | 'metric' = 'imperial';
  try {
    const { data: ub } = await supabase.from('user_baselines').select('units, performance_numbers').eq('user_id', user.id).single();
    if (ub) {
      unitsPref = (ub.units === 'metric' || ub.units === 'imperial') ? ub.units : 'imperial';
      perfNumbers = ub.performance_numbers || {};
    }
  } catch {}

  // 7) Build rows
  const rows: PlannedRow[] = [];
  for (const s0 of weekSessions) {
    // Expand swim DSL to steps_preset if present
    let s = { ...s0 } as any;
    // Authoring sugar → tags: optional_kind, xor_key
    try {
      const addTag = (arr: string[], t: string) => { if (!arr.map(x=>x.toLowerCase()).includes(t.toLowerCase())) arr.push(t); };
      const tags: string[] = Array.isArray(s?.tags) ? [...s.tags] : [];
      if (s.optional_kind) {
        addTag(tags, 'optional');
        addTag(tags, `opt_kind:${String(s.optional_kind)}`);
        const disc = String(s.discipline || s.type || '').toLowerCase();
        if (String(s.optional_kind).toLowerCase()==='intensity') {
          if (disc==='ride' || disc==='bike' || disc==='cycling') addTag(tags, 'bike_intensity');
          if (disc==='run') addTag(tags, 'hard_run');
        }
      }
      if (s.xor_key) {
        addTag(tags, `xor:${String(s.xor_key)}`);
      }
      if (tags.length) s.tags = tags;
      delete (s as any).optional_kind;
      delete (s as any).xor_key;
    } catch {}
    try {
      if ((!Array.isArray(s.steps_preset) || s.steps_preset.length === 0) && String(s.discipline||'').toLowerCase()==='swim') {
        const steps = expandSession({ discipline: 'swim', main: (s as any).main, extra: (s as any).extra, steps_preset: (s as any).steps_preset }, planDefaults);
        if (Array.isArray(steps) && steps.length) s.steps_preset = steps;
      }
    } catch {}
    const dow = dayIndex[(s.day as string) || 'Monday'] || 1;
    const date = addDays(startDate, (weekNumber - 1) * 7 + (dow - 1));
    const rawType = String(s.discipline || s.type || '').toLowerCase();
    let mappedType: 'run'|'ride'|'swim'|'strength' = 'run';
    if (rawType === 'run') mappedType = 'run';
    else if (rawType === 'bike' || rawType === 'ride' || rawType === 'cycling') mappedType = 'ride';
    else if (rawType === 'swim') mappedType = 'swim';
    else if (rawType === 'strength') mappedType = 'strength';

    // Friendly rendering + duration heuristics
    let rendered = String(s.description || '');
    let totalSeconds = 0;
    try {
      const norm = normalizePlannedSession(s, { performanceNumbers: perfNumbers }, exportHints || {});
      rendered = (norm.friendlySummary || rendered).trim();
      totalSeconds = Math.max(0, Math.round((norm.durationMinutes || 0) * 60));
    } catch {}

    const durationVal = typeof s.duration === 'number' && Number.isFinite(s.duration) ? s.duration : (totalSeconds ? Math.round(totalSeconds/60) : 0);

    const isOptional = Array.isArray(s?.tags) ? s.tags.some((t: any) => String(t).toLowerCase()==='optional') : /\[optional\]/i.test(String(s?.description||''));
    // Derive non-generic name from discipline and steps where possible
    const nameFromDiscipline = (() => {
      if (s.name) return String(s.name);
      if (mappedType === 'strength') return 'Strength';
      if (mappedType === 'ride') {
        const toks = Array.isArray(s?.steps_preset) ? s.steps_preset.join(' ').toLowerCase() : '';
        if (/bike_vo2|vo2/.test(toks) || /vo2/.test(String(s.description||'').toLowerCase())) return 'Ride — VO2';
        if (/bike_thr|threshold/.test(toks) || /threshold/.test(String(s.description||'').toLowerCase())) return 'Ride — Threshold';
        if (/bike_ss|sweet\s*spot/.test(toks) || /sweet\s*spot/.test(String(s.description||'').toLowerCase())) return 'Ride — Sweet Spot';
        if (/endurance|z1|z2/.test(toks) || /endurance|spin|z2/i.test(String(s.description||''))) return 'Ride — Endurance';
        return 'Ride';
      }
      if (mappedType === 'run') return 'Run';
      if (mappedType === 'swim') return 'Swim';
      return 'Session';
    })();
    // Build Garmin-ready intervals from either baked/normalized steps or token presets
    const buildIntervalsFromComputed = (steps?: any[]): any[] | undefined => {
      if (!Array.isArray(steps) || steps.length === 0) return undefined;
      const toMeters = (val: number, unit?: string) => {
        const u = String(unit || '').toLowerCase();
        if (u === 'm') return Math.floor(val);
        if (u === 'yd') return Math.floor(val * 0.9144);
        if (u === 'mi') return Math.floor(val * 1609.34);
        return Math.floor(val || 0);
      };
      return steps.map((st: any) => {
        const ctrl = String(st?.ctrl || '').toLowerCase();
        const label = String(st?.label || st?.effortLabel || '').trim();
        const kind = String(st?.kind || '').toLowerCase();
        if (kind === 'strength') {
          return { kind: 'strength', effortLabel: label, reps: Number(st?.reps||0), weight: Number(st?.weight||0) };
        }
        if (ctrl === 'distance') {
          return { effortLabel: label, distanceMeters: toMeters(Number(st?.meters || st?.distanceMeters || st?.original_val || 0), st?.original_units) };
        }
        return { effortLabel: label, duration: Math.max(1, Math.floor(Number(st?.seconds || st?.duration || 0))) };
      });
    };

    const buildIntervalsFromTokens = (stepsPreset?: any[], discipline?: string): any[] | undefined => {
      const steps: string[] = Array.isArray(stepsPreset) ? stepsPreset.map((t:any)=>String(t)) : [];
      if (steps.length === 0) return undefined;
      const out: any[] = [];
      const fivekPace: string | undefined = (() => {
        try { return String((perfNumbers?.fiveK_pace || (perfNumbers as any)?.fiveKPace) || '').trim() || undefined; } catch { return undefined; }
      })();
      const easyPace: string | undefined = (() => {
        try { return String((perfNumbers?.easyPace || (perfNumbers as any)?.easy_pace) || '').trim() || undefined; } catch { return undefined; }
      })();
      const ftp: number = (() => { try { return Number((perfNumbers as any)?.ftp || 0) || 0; } catch { return 0; }})();
      const isRun = String(discipline||'').toLowerCase()==='run';
      const isRide = String(discipline||'').toLowerCase()==='ride';
      let wuMin = 0; let cdMin = 0;
      const toMeters = (milesOrMeters: number, unit: 'm'|'mi'|'yd'|'km'='m') => {
        if (unit==='mi') return Math.floor(milesOrMeters*1609.34);
        if (unit==='yd') return Math.floor(milesOrMeters*0.9144);
        if (unit==='km') return Math.floor(milesOrMeters*1000);
        return Math.floor(milesOrMeters);
      };

      const tokenStr = steps.join(' ').toLowerCase();

      // Warmup/Cooldown tokens
      steps.forEach((t) => {
        const s = t.toLowerCase();
        let m = s.match(/warmup.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
        if (m) { const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; wuMin = Math.max(wuMin, Math.round((a+b)/2)); }
        m = s.match(/cooldown.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
        if (m) { const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; cdMin = Math.max(cdMin, Math.round((a+b)/2)); }
      });
      // Add warm-up at the start later; cooldown will be appended at the end

      // Interval blocks e.g., interval_6x800m_5kpace_R2min
      const iv = tokenStr.match(/interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_([^_\s]+)(?:_(plus\d+(?::\d{2})?))?(?:_r(\d+)(?:-(\d+))?min)?/i);
      if (iv) {
        const reps = parseInt(iv[1],10);
        const each = parseFloat(iv[2]);
        const unit = (iv[3]||'m').toLowerCase() as 'm'|'mi';
        const paceTag = String(iv[4]||'');
        const plusTok = String(iv[5]||'');
        const restA = iv[6]?parseInt(iv[6],10):0; const restB = iv[7]?parseInt(iv[7],10):restA; const restSec = Math.round(((restA||0)+(restB||0))/2)*60;
        // Resolve run pace if applicable
        const paceForIntervals = (() => {
          if (!isRun) return undefined;
          let base = undefined as string | undefined;
          if (/5kpace/i.test(paceTag) && fivekPace) base = fivekPace;
          else if (/easy/i.test(paceTag) && easyPace) base = easyPace;
          else base = fivekPace || easyPace;
          if (!base) return undefined;
          if (plusTok) {
            const m = plusTok.match(/plus(\d+)(?::(\d{2}))?/i);
            if (m) {
              const add = (parseInt(m[1],10) * 60) + (m[2]?parseInt(m[2],10):0);
              const mmss = (sec:number)=>{ const mm=Math.floor(sec/60); const ss=sec%60; return `${mm}:${String(ss).padStart(2,'0')}`; };
              const parsed = base.match(/(\d+):(\d{2})\/(mi|km)/i);
              if (parsed) {
                const baseSec = parseInt(parsed[1],10)*60+parseInt(parsed[2],10);
                const unitTxt = parsed[3];
                base = `${mmss(baseSec+add)}/${unitTxt}`;
              }
            }
          }
          return base;
        })();
        for (let r=0;r<reps;r+=1){
          out.push({ effortLabel: 'interval', distanceMeters: toMeters(unit==='mi'?each:each, unit), ...(paceForIntervals ? { paceTarget: paceForIntervals } : {}) });
          if (r<reps-1 && restSec>0) out.push({ effortLabel: 'rest', duration: restSec });
        }
      }

      // Tempo blocks e.g., tempo_4mi_...
      const tm = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi/i);
      if (tm) {
        const miles = parseFloat(tm[1]);
        const paceForTempo = isRun ? (fivekPace || easyPace) : undefined;
        out.push({ effortLabel: 'tempo', distanceMeters: toMeters(miles, 'mi'), ...(paceForTempo ? { paceTarget: paceForTempo } : {}) });
      }

      // Strides e.g., strides_6x20s
      const st = tokenStr.match(/strides_(\d+)x(\d+)s/i);
      if (st) {
        const reps = parseInt(st[1],10); const secEach = parseInt(st[2],10);
        for (let r=0;r<reps;r+=1) out.push({ effortLabel: 'interval', duration: secEach });
      }

      // Bike sets e.g., bike_vo2_6x3min_R3min, bike_thr_4x8min_R5min, bike_ss_2x20min_R6min
      const bike = tokenStr.match(/bike_(vo2|thr|ss)_(\d+)x(\d+)min(?:_r(\d+)min)?/i);
      if (bike) {
        const kind = (bike[1]||'').toLowerCase();
        const reps=parseInt(bike[2],10); const minEach=parseInt(bike[3],10); const rmin=bike[4]?parseInt(bike[4],10):0;
        const powerForKind = (() => {
          if (!isRide || !ftp) return undefined;
          if (kind==='vo2') return Math.round(ftp*1.10);
          if (kind==='thr') return Math.round(ftp*0.98);
          if (kind==='ss') return Math.round(ftp*0.91);
          return undefined;
        })();
        for (let r=0;r<reps;r+=1){
          out.push({ effortLabel: 'interval', duration: minEach*60, ...(powerForKind ? { powerTarget: `${powerForKind}W` } : {}) });
          if (r<reps-1 && rmin>0) out.push({ effortLabel: 'rest', duration: rmin*60 });
        }
      }

      // Endurance bike single block e.g., bike_endurance_50min...
      const bend = tokenStr.match(/bike_endurance_(\d+)min/i);
      if (bend) out.push({ effortLabel: 'endurance', duration: parseInt(bend[1],10)*60 });

      // Long run blocks e.g., longrun_90min...
      const lr = tokenStr.match(/longrun_(\d+)min/i);
      if (lr) out.push({ effortLabel: 'long run', duration: parseInt(lr[1],10)*60, ...(isRun && easyPace ? { paceTarget: easyPace } : {}) });

      // Swim simple translation from tokens expanded earlier (distances only)
      if (String(discipline||'').toLowerCase()==='swim'){
        steps.forEach((t)=>{
          const s = String(t).toLowerCase();
          let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
          if (m){ const dist=parseInt(m[1],10); const u=(m[2]||'yd').toLowerCase() as any; out.push({ effortLabel: /warmup/i.test(s)?'warm up':'cool down', distanceMeters: toMeters(dist, u) }); return; }
          m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)/i);
          if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel: 'drill', distanceMeters: toMeters(each, u) }); return; }
          m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i);
          if (m){ const reps=parseInt(m[2],10), each=parseInt(m[3],10); const u=(m[4]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel: m[1]==='pull'?'pull':'kick', distanceMeters: toMeters(each, u) }); return; }
          m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i);
          if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel: 'aerobic', distanceMeters: toMeters(each, u) }); return; }
        });
      }

      if (wuMin>0) out.unshift({ effortLabel:'warm up', duration: Math.max(1, Math.round(wuMin*60)), ...(isRun && easyPace ? { paceTarget: easyPace } : {}) });
      if (cdMin>0) out.push({ effortLabel:'cool down', duration: Math.max(1, Math.round(cdMin*60)), ...(isRun && easyPace ? { paceTarget: easyPace } : {}) });
      return out.length ? out : undefined;
    };

    const intervalsFromNorm = buildIntervalsFromTokens(Array.isArray((s as any).steps_preset)?(s as any).steps_preset:undefined, mappedType);

    rows.push({
      user_id: user.id,
      training_plan_id: plan.id,
      template_id: String(plan.id),
      week_number: weekNumber,
      day_number: dow,
      date,
      type: mappedType,
      name: nameFromDiscipline,
      description: s.description || '',
      duration: durationVal,
      workout_status: 'planned' as any,
      source: 'training_plan',
      tags: Array.isArray(s?.tags) ? s.tags : (isOptional ? ['optional'] : []),
      steps_preset: Array.isArray(s?.steps_preset) ? s.steps_preset : null,
      export_hints: exportHints || null,
      rendered_description: rendered,
      computed: { normalization_version: 'v2', total_duration_seconds: totalSeconds },
      units: unitsPref,
      intensity: typeof s.intensity === 'object' ? s.intensity : undefined,
      intervals: Array.isArray(s.intervals) && s.intervals.length ? s.intervals : intervalsFromNorm,
      strength_exercises: Array.isArray(s.strength_exercises) ? s.strength_exercises : undefined,
    });
  }

  if (rows.length === 0) return { inserted: 0 };
  const { error: insErr } = await supabase.from('planned_workouts').insert(rows as any);
  if (insErr) throw insErr;
  return { inserted: rows.length };
}


