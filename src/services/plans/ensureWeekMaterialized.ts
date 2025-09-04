import { supabase } from '@/lib/supabase';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import { expandSession, DEFAULTS_FALLBACK } from '@/services/plans/plan_dsl';
import { expand } from './expander';
import { resolveTargets, totalDurationSeconds } from './targets';

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
    .select('id, user_id, type, steps_preset, export_hints, intervals, computed, tags')
    .eq('training_plan_id', planId)
    .eq('week_number', weekNumber);
  if (!existErr && Array.isArray(existing) && existing.length > 0) {
    try {
      // STRICT: Do not derive placeholder intervals anymore; upgrades must compute targets or fail

      // Helper: annotate/enrich intervals with targets from baselines/hints
      const annotateIntervals = (intervals: any[] | undefined, type: string, hints: any | undefined, perf: any | undefined): any[] | undefined => {
        if (!Array.isArray(intervals) || intervals.length === 0) return intervals;
        const tolEasy = (hints && typeof hints.pace_tolerance_easy==='number') ? hints.pace_tolerance_easy : 0.06;
        const tolQual = (hints && typeof hints.pace_tolerance_quality==='number') ? hints.pace_tolerance_quality : 0.04;
        const pTolSS = (hints && typeof hints.power_tolerance_SS_thr==='number') ? hints.power_tolerance_SS_thr : 0.05;
        const pTolVO2 = (hints && typeof hints.power_tolerance_VO2==='number') ? hints.power_tolerance_VO2 : 0.10;
        const easyPaceTxt: string | undefined = perf?.easyPace || perf?.easy_pace;
        const fivekPaceTxt: string | undefined = perf?.fiveK_pace || perf?.fiveKPace || perf?.fiveK;
        const ftp: number | undefined = typeof perf?.ftp === 'number' ? perf.ftp : undefined;
        const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
        const parsePace = (p?: string): { sec: number | null, unit?: 'mi'|'km' } => {
          if (!p) return { sec: null };
          const m = String(p).trim().match(/(\d+):(\d{2})\s*\/(mi|km)/i);
          if (!m) return { sec: null };
          return { sec: parseInt(m[1],10)*60 + parseInt(m[2],10), unit: m[3].toLowerCase() as any };
        };
        const formatPace = (sec:number, unit:'mi'|'km') => `${mmss(sec)}/${unit}`;
        const clone = (obj:any)=> JSON.parse(JSON.stringify(obj));
        const out: any[] = [];
        const isRun = String(type||'').toLowerCase()==='run';
        const isRide = String(type||'').toLowerCase()==='ride';
        for (const it of intervals){
          const item = clone(it);
          const lab = String(item?.effortLabel||'').toLowerCase();
          const isWU = /warm\s*up/.test(lab); const isCD = /cool\s*down/.test(lab); const isRest = /rest|recovery/.test(lab);
          if (isRun){
            const baseTxt = isRest ? (easyPaceTxt || fivekPaceTxt) : (fivekPaceTxt || easyPaceTxt);
            const p = parsePace(baseTxt);
            if (p.sec && p.unit){
              const tol = isRest || isWU || isCD ? tolEasy : tolQual;
              item.paceTarget = formatPace(p.sec, p.unit);
              item.pace_range = { lower: Math.round(p.sec*(1-tol)), upper: Math.round(p.sec*(1+tol)), unit: p.unit };
              // If distance-only rep, compute duration for convenience
              if (typeof item.distanceMeters === 'number' && !item.duration){
                const miles = Number(item.distanceMeters)/1609.34;
                item.duration = Math.max(1, Math.round(miles * p.sec));
              }
            }
          } else if (isRide && ftp){
            // If it looks like an intensity block, set a center and range from hints
            const isVo2 = /vo2/.test(lab) || (typeof item?.effortLabel==='string' && /hard/.test(lab));
            const isThr = /thr|threshold/.test(lab);
            const isSS = /ss|sweet\s*spot/.test(lab);
            const center = isVo2 ? 1.10 : isThr ? 0.98 : isSS ? 0.91 : undefined;
            const tol = isVo2 ? pTolVO2 : pTolSS;
            if (center && tol){
              const lo = Math.round(ftp * (center*(1-tol)));
              const hi = Math.round(ftp * (center*(1+tol)));
              item.power_range = { lower: lo, upper: hi };
            }
          }
          out.push(item);
        }
        return out;
      };

      // Upgrade: populate computed.steps strictly from tokens (no synthesis from intervals). If tokens missing → fail
      const parsePace = (p?: string): { secPerMi: number | null } => {
        if (!p) return { secPerMi: null };
        const m = String(p).trim().match(/(\d+):(\d{2})\s*\/(mi|km)/i);
        if (!m) return { secPerMi: null };
        const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
        const unit = m[3].toLowerCase();
        return { secPerMi: unit === 'mi' ? sec : Math.round(sec * 1.60934) };
      };
      // remove buildComputedFromIntervals fallback entirely (strict mode)

      // Load baselines once (single user per plan)
      let perfNumbersUpgrade: any = {};
      try {
        const uid = (existing as any[])[0]?.user_id;
        if (uid) {
          const { data: ub } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', uid).maybeSingle();
          perfNumbersUpgrade = ub?.performance_numbers || {};
        }
      } catch {}

      for (const row of existing as any[]) {
        const hasSteps = row?.computed && Array.isArray(row.computed.steps) && row.computed.steps.length>0;
        if (!hasSteps) {
          // STRICT: Only compute from tokens with targets; if tokens absent, surface failure
            if (Array.isArray(row?.steps_preset) && (row.steps_preset as any[]).length>0) {
              const atomic = expand((row.steps_preset as any[]) || [], undefined, row.tags as any);
              const resolved = resolveTargets(atomic as any, perfNumbersUpgrade, row.export_hints || {}, row.type);
            if (!Array.isArray(resolved) || resolved.length === 0) throw new Error('Materialization failed: no resolvable steps');
              const nextComputed = { normalization_version: 'v3', steps: resolved, total_duration_seconds: totalDurationSeconds(resolved as any) } as any;
              await supabase.from('planned_workouts').update({ computed: nextComputed }).eq('id', row.id);
          } else {
            throw new Error('Materialization failed: steps_preset missing on existing row');
          }
        }
        // Always ensure intervals carry targets when possible
        try {
          const enriched = annotateIntervals(row.intervals, row.type, row.export_hints, perfNumbersUpgrade);
          if (Array.isArray(enriched) && enriched.length) {
            await supabase.from('planned_workouts').update({ intervals: enriched }).eq('id', row.id);
          }
        } catch {}
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
      const lib = await supabase.from('library_plans').select('template').eq('id', catalogId).maybeSingle();
      exportHints = (lib.data?.template?.export_hints || null);
    }
  } catch {}

  // 5) Determine anchor start_date and user-selected start day (may be mid-week)
  let startDate: string | undefined; // computed from user-selected date if provided
  const userSelectedStartDate: string | undefined = (() => {
    try { return (plan as any)?.config?.user_selected_start_date as string; } catch { return undefined; }
  })();
  if (userSelectedStartDate) {
    // Compute Monday of the selected date to anchor weekdays
    const p = userSelectedStartDate.split('-').map(x=>parseInt(x,10));
    const d = new Date(p[0], (p[1]||1)-1, p[2]||1);
    const jsDow = d.getDay(); // 0=Sun..6=Sat
    const daysFromMonday = (jsDow + 6) % 7; // Mon=0..Sun=6
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday);
    const y = mon.getFullYear();
    const m = String(mon.getMonth()+1).padStart(2,'0');
    const dd = String(mon.getDate()).padStart(2,'0');
    startDate = `${y}-${m}-${dd}`;
  }
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
    const { data: ub } = await supabase.from('user_baselines').select('units, performance_numbers').eq('user_id', user.id).maybeSingle();
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
    // If this is Week 1 and the user selected a mid-week start, skip earlier days
    if (weekNumber === 1 && userSelectedStartDate) {
      const parts = userSelectedStartDate.split('-').map(x=>parseInt(x,10));
      const sel = new Date(parts[0], (parts[1]||1)-1, parts[2]||1).getTime();
      const dParts = date.split('-').map(x=>parseInt(x,10));
      const cur = new Date(dParts[0], (dParts[1]||1)-1, dParts[2]||1).getTime();
      if (cur < sel) {
        continue; // do not materialize sessions before the chosen start date
      }
    }
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
      // Prefer friendly summary (includes baseline-derived targets/weights) when available
      rendered = (norm.friendlySummary || rendered).trim();
      totalSeconds = Math.max(0, Math.round((norm.durationMinutes || 0) * 60));
    } catch {}

    const durationVal = typeof s.duration === 'number' && Number.isFinite(s.duration) ? s.duration : (totalSeconds ? Math.round(totalSeconds/60) : 0);

    const isOptional = Array.isArray(s?.tags) ? s.tags.some((t: any) => String(t).toLowerCase()==='optional') : /\[optional\]/i.test(String(s?.description||''));
    // Derive non-generic name from discipline and steps where possible
    const nameFromDiscipline = (() => {
      if (s.name) return String(s.name);
      const toks = Array.isArray(s?.steps_preset) ? s.steps_preset.join(' ').toLowerCase() : String(s?.description||'').toLowerCase();
      if (mappedType === 'strength') return 'Strength';
      if (mappedType === 'swim') return 'Swim — Technique';
      if (mappedType === 'ride') {
        if (/bike_vo2|\bvo2\b/.test(toks)) return 'Ride — VO2';
        if (/bike_thr|threshold/.test(toks)) return 'Ride — Threshold';
        if (/bike_ss|sweet\s*spot/.test(toks)) return 'Ride — Sweet Spot';
        if (/endurance|z1|z2/.test(toks)) return 'Ride — Endurance';
        return 'Ride';
      }
      if (mappedType === 'run') {
        if (/interval_|\b6x|\b8x|\b10x|\b400m|\b800m|\b1mi/.test(toks)) return 'Run — Intervals';
        if (/tempo_/.test(toks)) return 'Run — Tempo';
        if (/longrun_/.test(toks)) return 'Run — Long';
        return 'Run';
      }
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
      const parsePace = (txt?: string): { sec: number|null, unit?: 'mi'|'km' } => {
        if (!txt) return { sec: null } as any;
        const m = String(txt).trim().match(/(\d+):(\d{2})\s*\/(mi|km)/i);
        if (!m) return { sec: null } as any;
        return { sec: parseInt(m[1],10)*60 + parseInt(m[2],10), unit: m[3].toLowerCase() as any };
      };
      const reorder = (arr: any[]) => {
        const warm = arr.filter(s => s.type === 'warmup');
        const cool = arr.filter(s => s.type === 'cooldown');
        const rest = arr.filter(s => s.type === 'interval_rest');
        const work = arr.filter(s => s.type !== 'warmup' && s.type !== 'cooldown' && s.type !== 'interval_rest');
        return [...warm, ...work.flatMap((w,i)=> [w, rest[i]]).filter(Boolean), ...cool];
      };
      const v3 = steps.every(st => (st && typeof st.type === 'string' && (typeof st.duration_s === 'number' || typeof st.distance_m === 'number' || typeof (st as any).distance_yd === 'number')));
      const source = v3 ? reorder(steps) : steps;
      return source.flatMap((st: any) => {
        if (v3) {
          const t = String(st.type).toLowerCase();
          const isRest = t === 'interval_rest';
          let effortLabel = t === 'warmup' ? 'warm up' : t === 'cooldown' ? 'cool down' : isRest ? 'rest' : (String(mappedType).toLowerCase()==='swim' && st.cue ? st.cue : 'interval');
          if (String(mappedType).toLowerCase()==='swim') {
            const lbl = String((st as any).label || '').trim();
            const eq = String((st as any).equipment || '').trim();
            if (lbl) effortLabel = eq ? `${lbl} — ${eq}` : lbl;
          }
          const base: any = { effortLabel };
          if (typeof st.distance_m === 'number' && st.distance_m > 0) base.distanceMeters = Math.floor(st.distance_m);
          if (typeof st.distance_yd === 'number' && st.distance_yd > 0) base.distanceMeters = Math.floor(st.distance_yd * 0.9144);
          if (typeof st.duration_s === 'number' && st.duration_s > 0) base.duration = Math.max(1, Math.floor(st.duration_s));
          // map pace targets
          const p = parsePace(st.target_value);
          const lo = parsePace(st.target_low);
          const hi = parsePace(st.target_high);
          if (p.sec && p.unit) base.paceTarget = `${Math.floor(p.sec/60)}:${String(p.sec%60).padStart(2,'0')}/${p.unit}`;
          if (lo.sec && hi.sec) base.pace_range = { lower: lo.sec, upper: hi.sec };
          const arr = [base];
          if (String(mappedType).toLowerCase()==='swim' && typeof (st as any).rest_s === 'number' && (st as any).rest_s>0) arr.push({ effortLabel: 'rest', duration: Math.max(1, Math.floor((st as any).rest_s)) });
          return arr;
        }
        // legacy v2 mapping
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

    // Expand + resolve to computed steps (preferred path)
    let computedStepsV3: any[] | undefined = undefined;
    try {
      const atomic = expand(Array.isArray((s as any).steps_preset) ? (s as any).steps_preset : [], (s as any).main, (s as any).tags);
      let resolved = resolveTargets(atomic as any, perfNumbers, exportHints || {}, mappedType) as any[];
      // Ensure swim warm‑up/cool‑down are present so totals include them
      if (mappedType === 'swim') {
        const hasWU = Array.isArray(resolved) && resolved.some(st => /warmup|swim_warmup/i.test(String(st?.type)) || /warm/i.test(String((st as any)?.label||'')));
        const hasCD = Array.isArray(resolved) && resolved.some(st => /cooldown|swim_cooldown/i.test(String(st?.type)) || /cool/i.test(String((st as any)?.label||'')));
        const parseYd = (tok?: string): number | null => { try { const m = String(tok||'').match(/_(\d+)(yd|m)/i); if (!m) return null; const n = parseInt(m[1],10); return (m[2].toLowerCase()==='m') ? Math.round(n/0.9144/25)*25 : n; } catch { return null; } };
        const wuToken = (planDefaults as any)?.swim?.wu; const cdToken = (planDefaults as any)?.swim?.cd;
        const wuYd = parseYd(wuToken) || 0; const cdYd = parseYd(cdToken) || 0;
        if (!hasWU && wuYd > 0) resolved = [{ type: 'swim_warmup', label: 'Warm‑up', distance_yd: wuYd }, ...(resolved||[])];
        if (!hasCD && cdYd > 0) resolved = [...(resolved||[]), { type: 'swim_cooldown', label: 'Cool‑down', distance_yd: cdYd }];
      }
      if (Array.isArray(resolved) && resolved.length) computedStepsV3 = resolved as any[];
    } catch {}

    const intervalsFromNorm = buildIntervalsFromTokens(Array.isArray((s as any).steps_preset)?(s as any).steps_preset:undefined, mappedType);

    // Derive primary target columns and equipment list from computed steps
    const deriveTargetColumns = (steps: any[] | undefined, discipline: 'run'|'ride'|'swim'|'strength') => {
      const out: any = { primary_target_type: 'none' };
      if (!Array.isArray(steps) || steps.length === 0) return out;
      const paceRe = /(\d+):(\d{2})\/(mi|km)/i;
      const wattRe = /(\d+)\s*w/i;
      const pick = steps.find(st => typeof (st as any)?.target_value === 'string' || typeof (st as any)?.target_low === 'string' || typeof (st as any)?.target_high === 'string');
      if (pick) {
        const tv = String((pick as any).target_value || '');
        const tl = String((pick as any).target_low || '');
        const th = String((pick as any).target_high || '');
        const pm = tv.match(paceRe);
        const pl = tl.match(paceRe);
        const ph = th.match(paceRe);
        const wm = tv.match(wattRe);
        const wl = tl.match(wattRe);
        const wh = th.match(wattRe);
        if (pm || pl || ph) {
          out.primary_target_type = 'pace';
          out.pace_value = pm ? pm[0] : undefined;
          out.pace_low = pl ? pl[0] : undefined;
          out.pace_high = ph ? ph[0] : undefined;
        } else if (wm || wl || wh) {
          out.primary_target_type = 'power';
          out.power_target_watts = wm ? parseInt(wm[1], 10) : undefined;
          out.power_low = wl ? parseInt(wl[1], 10) : undefined;
          out.power_high = wh ? parseInt(wh[1], 10) : undefined;
        }
      }
      // equipment aggregation (swim segments carry equipment)
      try {
        const eq = new Set<string>();
        for (const st of steps) {
          const raw = String((st as any)?.equipment || '').trim();
          if (!raw) continue;
          raw.split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>eq.add(x.replace(/\s+/g,' ').toLowerCase()));
        }
        if (eq.size > 0) out.equipment = Array.from(eq);
      } catch {}
      return out;
    };
    const computedTargets = deriveTargetColumns(computedStepsV3, mappedType);
    // For swims, build a concise grouped summary for cards (Today/Weekly)
    if (mappedType === 'swim' && Array.isArray(computedStepsV3) && computedStepsV3.length>0) {
      try {
        type Key = { label: string; each: number; rest?: number };
        const sum: Record<string,{count:number,each:number,rest?:number}> = {};
        let wu=0, cd=0;
        const drillLines: string[] = [];
        for (const st of computedStepsV3 as any[]) {
          const kind = String(st?.type||'').toLowerCase();
          const yd = typeof (st as any)?.distance_yd === 'number' ? Math.round((st as any).distance_yd/25)*25 : (typeof (st as any)?.distance_m === 'number' ? Math.round((st as any).distance_m/0.9144/25)*25 : 0);
          if (kind==='swim_warmup' || kind==='warmup') { wu += yd; continue; }
          if (kind==='swim_cooldown' || kind==='cooldown') { cd += yd; continue; }
          if (yd>0) {
            const label = (String((st as any).label||'').trim() || 'Set').replace(/\s+/g,' ');
            const rest = typeof (st as any)?.rest_s === 'number' ? Math.max(0, Math.round((st as any).rest_s)) : undefined;
            const k = `${label}|${yd}|${rest||0}`;
            if (!sum[k]) sum[k] = { count: 0, each: yd, rest };
            sum[k].count += 1;
          }
          // Some drill steps may be duration-only in computed; retain their names via label
          if (!yd) {
            const lbl = String((st as any).label||'').trim();
            if (lbl) drillLines.push(lbl);
          }
        }
        const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
        const parts: string[] = [];
        if (wu>0) parts.push(`WU ${wu}`);
        // Prefer explicit drills from tokens when available to show names like "catchup"/"singlearm"
        try {
          const stepsTok: string[] = Array.isArray((s as any).steps_preset) ? (s as any).steps_preset : [];
          const drillSpecs: string[] = [];
          const restDefault = (name:string, each:number)=> name==='singlearm'||name==='single_arm'?20:15;
          for (const t of stepsTok) {
            const m = String(t).toLowerCase().match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
            if (m) {
              const reps = parseInt(m[1],10);
              const dist = parseInt(m[2],10);
              const name = String(m[4]||'').replace(/_/g,' ');
              const r = restDefault(name, dist);
              drillSpecs.push(`${name} ${reps}×${dist} @ :${r}r`);
            }
          }
          if (drillSpecs.length) {
            parts.push(`Drills: ${Array.from(new Set(drillSpecs)).join(', ')}`);
          } else if (drillLines.length) {
            parts.push(`Drills: ${Array.from(new Set(drillLines)).join(', ')}`);
          } else {
            // Fallback: parse main DSL e.g., drills(catchup@15r(board),singlearm@20r)
            try {
              const main: string = String((s as any).main || '');
              const m = main.match(/drills\(([^)]+)\)/i);
              if (m) {
                const body = m[1];
                const items = body.split(',').map(x=>x.trim()).filter(Boolean);
                const parsed: string[] = [];
                for (const it of items) {
                  const name = String(it.split('@')[0]||'').replace(/_/g,' ');
                  const restM = it.match(/@(\d+)r/i);
                  const equipM = it.match(/\(([^)]+)\)/);
                  const rest = restM ? ` @ :${restM[1]}r` : '';
                  const equip = equipM ? ` — ${equipM[1]}` : '';
                  if (name) parsed.push(`${name} 4×50${rest}${equip}`.trim());
                }
                if (parsed.length) parts.push(`Drills: ${Array.from(new Set(parsed)).join(', ')}`);
              }
            } catch {}
          }
        } catch {}
        // Keep a stable order: Pull, Kick, Aerobic, then drills/others
        const keys = Object.entries(sum);
        const order = (k:string)=>/pull\|/i.test(k)?1:/kick\|/i.test(k)?2:/aerobic\|/i.test(k)?3:4;
        keys.sort((a,b)=>order(a[0])-order(b[0]));
        for (const [,v] of keys) {
          const [label] = (Object.keys(sum).find(k=>sum[k]===v)||'Set|0|0').split('|');
          const restStr = typeof v.rest==='number' && v.rest>0 ? ` @ ${mmss(v.rest)}r` : '';
          parts.push(`${label} ${v.count}×${v.each}${restStr}`);
        }
        if (cd>0) parts.push(`CD ${cd}`);
        if (parts.length) rendered = parts.join(' • ');
      } catch {}
    }
    const totalDurSeconds = computedStepsV3 && computedStepsV3.length ? totalDurationSeconds(computedStepsV3 as any) : 0;

    // STRICT: require computedStepsV3; if missing, fail fast for this session
    if (!computedStepsV3 || computedStepsV3.length === 0) {
      throw new Error(`Materialization failed: could not compute steps for ${String(s.name||s.description||'session')}`);
    }
    // Only include columns that exist in planned_workouts
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
      duration: totalDurSeconds>0 ? Math.round(totalDurSeconds/60) : durationVal,
      workout_status: 'planned' as any,
      source: 'training_plan',
      tags: Array.isArray(s?.tags) ? s.tags : (isOptional ? ['optional'] : []),
      steps_preset: Array.isArray(s?.steps_preset) ? s.steps_preset : null,
      export_hints: exportHints || null,
      rendered_description: rendered,
      computed: { normalization_version: 'v3', steps: computedStepsV3, total_duration_seconds: totalDurSeconds },
      primary_target_type: (computedTargets as any).primary_target_type,
      pace_value: (computedTargets as any).pace_value,
      pace_low: (computedTargets as any).pace_low,
      pace_high: (computedTargets as any).pace_high,
      power_target_watts: (computedTargets as any).power_target_watts,
      power_low: (computedTargets as any).power_low,
      power_high: (computedTargets as any).power_high,
      equipment: (computedTargets as any).equipment || null,
      units: unitsPref,
      intensity: typeof s.intensity === 'object' ? s.intensity : undefined,
      intervals: (buildIntervalsFromComputed(computedStepsV3 as any, mappedType, exportHints || {}, perfNumbers) || intervalsFromNorm),
      strength_exercises: Array.isArray(s.strength_exercises) ? s.strength_exercises : undefined,
    });
  }

  if (rows.length === 0) return { inserted: 0 };
  const { error: insErr } = await supabase.from('planned_workouts').insert(rows as any);
  if (insErr) throw insErr;
  return { inserted: rows.length };
}


