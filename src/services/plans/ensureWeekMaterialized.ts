import { supabase } from '@/lib/supabase';
import { normalizePlannedSession, normalizeStructuredSession } from '@/services/plans/normalizer';
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
  // new structured fast-path columns exist in DB; include in type to satisfy TS
  workout_structure?: any | null;
  workout_title?: string | null;
  friendly_summary?: string | null;
  total_duration_seconds?: number | null;
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
    .select('id, user_id, type, steps_preset, export_hints, intervals, computed, tags, rendered_description, description, day_number')
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

        // Bridge helper: synthesize structured workout from tokens for existing rows (all disciplines)
        const buildStructuredFromTokens = (row: any): any | null => {
          try {
            const steps: string[] = Array.isArray(row?.steps_preset) ? (row.steps_preset as any[]).map((t:any)=>String(t)) : [];
            if (!steps.length) return null;
            const disc = String(row?.type || '').toLowerCase();
            const m = (re: RegExp) => steps.map(t=>String(t).toLowerCase().match(re)).find(Boolean) as RegExpMatchArray | undefined;
            const mins = (n:number)=>`${n}min`;
            const toInt = (x:string|undefined)=> x?parseInt(x,10):0;
            // RUN
            if (disc==='run') {
              const wu = m(/warmup.*?(\d+)min/);
              const cd = m(/cooldown.*?(\d+)min/);
              const iv = m(/^interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_([a-z0-9]+).*?(?:_r(\d+)(?:s|min)?)?/i);
              const lr = m(/^(?:longrun_|run_easy_)(\d+)min/i);
              if (iv) {
                const reps = toInt(iv[1]); const dist = `${iv[2]}${iv[3]}`; const rest = iv[5]? (/min/i.test(String(iv[0]))?`${iv[5]}min`:`${iv[5]}s`): undefined;
                const ws: any = { type:'interval_session', total_duration_estimate: mins((wu?toInt(wu[1]):0)+(cd?toInt(cd[1]):0)), structure: [] as any[] };
                if (wu) ws.structure.push({ type:'warmup', duration: mins(toInt(wu[1])), intensity:'easy' });
                ws.structure.push({ type:'main_set', set_type:'intervals', repetitions: reps, work_segment: { distance: dist, target_pace:'user.fiveK_pace' }, recovery_segment: rest? { duration: rest, activity:'easy_jog', intensity:'recovery' } : undefined });
                if (cd) ws.structure.push({ type:'cooldown', duration: mins(toInt(cd[1])), intensity:'easy' });
                return ws;
              }
              if (lr) {
                const dur = mins(toInt(lr[1]));
                return { type:'endurance_session', total_duration_estimate: dur, structure: [ { type:'main_effort', duration: dur, target_pace:'user.easyPace', intensity:'aerobic_base' } ] };
              }
            }
            // BIKE (endurance + SS/THR/VO2)
            if (disc==='ride' || disc==='bike') {
              const endu = m(/^bike_endurance_(\d+)min(?:_z(\d)(?:-(\d))?)?/i);
              if (endu) {
                const dur = mins(toInt(endu[1]));
                const z = endu[2]? parseInt(endu[2],10) : 2; const range = z===1? '60-65%' : '65-75%';
                return { type:'endurance_session', total_duration_estimate: dur, structure:[ { type:'main_effort', duration: dur, target_power:{ zone:'endurance', baseline:'user.ftp', range }, intensity:'aerobic_base' } ] };
              }
              const buildBikeSet = (label:'sweet_spot_intervals'|'threshold_intervals'|'vo2_intervals', mm:RegExpMatchArray|undefined) => {
                if (!mm) return null; const reps=toInt(mm[1]); const work=mins(toInt(mm[2])); const rest=mm[3]? `${mm[3]}min` : undefined;
                return { type:'bike_intervals', total_duration_estimate: work, structure:[ { type:'warmup', duration:'15min', intensity:'easy_with_openers' }, { type:'main_set', set_type:label, repetitions: reps, work_segment:{ duration: work, target_power:{ baseline:'user.ftp', range: label==='sweet_spot_intervals'?'85-95%': label==='threshold_intervals'?'95-105%':'105-120%' } }, recovery_segment: rest? { duration: rest, intensity:'easy_spin' } : undefined }, { type:'cooldown', duration:'10min', intensity:'easy' } ] };
              };
              const ss = m(/^bike_ss_(\d+)x(\d+)min_(?:r(\d+)min)/i);
              const thr = m(/^bike_thr_(\d+)x(\d+)min_(?:r(\d+)min)/i);
              const vo2 = m(/^bike_vo2_(\d+)x(\d+)(?:min|s)_(?:r(\d+)(?:min|s))/i);
              const built = buildBikeSet('sweet_spot_intervals', ss) || buildBikeSet('threshold_intervals', thr) || buildBikeSet('vo2_intervals', vo2);
              if (built) return built;
            }
            // BRICK
            if (disc==='brick') {
              const bike = steps.find(t=>/^bike_/.test(String(t).toLowerCase()));
              const run = steps.find(t=>/^(run_easy_|longrun_|tempo_)/.test(String(t).toLowerCase()));
              if (bike && run) {
                const bd = (():string=>{ const mm=bike.toLowerCase().match(/_(\d+)min/); return mm? `${mm[1]}min` : '60min'; })();
                const rd = (():string=>{ const mm=run.toLowerCase().match(/_(\d+)min/); return mm? `${mm[1]}min` : '20min'; })();
                return { type:'brick_session', total_duration_estimate: mins(toInt(bd)+toInt(rd)), structure:[ { type:'bike_segment', duration: bd, target_power:{ baseline:'user.ftp', zone:'endurance', range: /z1/i.test(bike)?'60-65%':'65-75%' } }, { type:'transition', duration:'2min' }, { type:'run_segment', duration: rd, target_pace: /tempo_/.test(run.toLowerCase())? { baseline:'user.fiveK_pace', modifier:'+45s/mile' } : 'user.easyPace' } ] };
              }
            }
            // SWIM (WU/CD, drills, aerobic)
            if (disc==='swim') {
              const wu = m(/^swim_warmup_(\d+)(yd|m)/i);
              const cd = m(/^swim_cooldown_(\d+)(yd|m)/i);
              const drill = m(/^swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
              const aero = m(/^swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
              const ws: any = { type:'swim_session', total_duration_estimate: '30min', structure: [] as any[] };
              if (wu) ws.structure.push({ type:'warmup', distance: `${wu[1]}${wu[2]}`, intensity:'easy' });
              if (drill) ws.structure.push({ type:'drill_set', drill_type: drill[1], repetitions: toInt(drill[2]), distance: `${drill[3]}${drill[4]}`, rest: drill[5]? `${drill[5]}s` : '15s' });
              if (aero) ws.structure.push({ type:'main_set', set_type:'aerobic_intervals', repetitions: toInt(aero[1]), distance: `${aero[2]}${aero[3]}`, rest: aero[4]? `${aero[4]}s` : '15s' });
              if (cd) ws.structure.push({ type:'cooldown', distance: `${cd[1]}${cd[2]}`, intensity:'easy' });
              if (ws.structure.length) return ws;
            }
            // STRENGTH (main and accessory with %)
            if (disc==='strength') {
              const ws: any = { type:'strength_session', total_duration_estimate: '45min', structure: [] as any[] };
              steps.forEach(t=>{
                let mm = t.toLowerCase().match(/^st_wu_(\d+)/i); if (mm) { ws.structure.push({ type:'warmup', duration: `${mm[1]}min` }); return; }
                mm = t.toLowerCase().match(/^st_main_([a-z0-9_]+)_(\d+)x(\d+)(?:_@pct(\d+))?(?:_rest(\d+))?/i);
                if (mm) { const ex=mm[1]; const sets=toInt(mm[2]); const reps=toInt(mm[3]); const pct= mm[4]? toInt(mm[4]) : undefined; const rest = mm[5]? `${mm[5]}s` : undefined; const base = /bench/.test(ex)?'user.bench':/squat/.test(ex)?'user.squat':/deadlift/.test(ex)?'user.deadlift':'user.overheadPress1RM'; ws.structure.push({ type:'main_lift', exercise: ex, sets, reps, load: pct? { type:'percentage', baseline: base, percentage: pct } : undefined, rest }); return; }
                mm = t.toLowerCase().match(/^st_acc_([a-z0-9_]+)_(\d+)x(\d+)(?:_@pct(\d+))?(?:_rest(\d+))?/i);
                if (mm) { const ex=mm[1]; const sets=toInt(mm[2]); const reps=toInt(mm[3]); const pct= mm[4]? toInt(mm[4]) : undefined; const rest = mm[5]? `${mm[5]}s` : undefined; const base = /row/.test(ex)?'user.bench':'user.overheadPress1RM'; ws.structure.push({ type:'accessory', exercise: ex, sets, reps, load: pct? { type:'percentage', baseline: base, percentage: pct } : undefined, rest }); return; }
              });
              if (ws.structure.length) return ws;
            }
            return null;
          } catch { return null; }
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

      // Load library plan for this week to allow picking updated tokens (e.g., new @pct on accessories)
      let libraryWeekSessions: any[] | null = null;
      try {
        const { data: libPlan } = await supabase
          .from('plans')
          .select('sessions_by_week')
          .eq('id', planId)
          .single();
        libraryWeekSessions = libPlan?.sessions_by_week?.[String(weekNumber)] || null;
      } catch {}

      const dayNameFromNum = (n: number): string => DAYS[Math.max(1, Math.min(7, n)) - 1];
      const pctFromLibraryForRow = (row: any): number | undefined => {
        try {
          if (!Array.isArray(libraryWeekSessions)) return undefined;
          const dayName = dayNameFromNum(Number(row?.day_number || 1));
          const sessions = libraryWeekSessions.filter((s: any) => String(s?.day) === dayName && String(s?.discipline||s?.type||'').toLowerCase()==='strength');
          for (const s of sessions) {
            const steps: string[] = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
            for (const t of steps) {
              const m = String(t).toLowerCase().match(/st_acc_barbell_row_[^@]*_@pct(\d{1,3})/i);
              if (m) return Math.min(100, Math.max(1, parseInt(m[1], 10)));
            }
          }
        } catch {}
        return undefined;
      };

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

        // If structured exists but intervals have no real work reps, synthesize intervals from workout_structure
        try {
          const hasAnyWork = (arr: any[] | undefined): boolean => {
            if (!Array.isArray(arr)) return false;
            return arr.some((it) => {
              const lab = String((it?.effortLabel || '')).toLowerCase();
              return !(lab.includes('warm up') || lab.includes('cool down') || /rest|recovery/.test(lab));
            });
          };
          const ws: any = row?.workout_structure;
          const intervalsArr: any[] | undefined = Array.isArray(row?.intervals) ? row.intervals : undefined;
          const needsSynthesis = !!ws && (!intervalsArr || !hasAnyWork(intervalsArr));
          if (needsSynthesis) {
            const toSec = (v?: string): number => {
              if (!v || typeof v !== 'string') return 0;
              const m1 = v.match(/(\d+)\s*min/i); if (m1) return parseInt(m1[1],10)*60;
              const m2 = v.match(/(\d+)\s*s/i); if (m2) return parseInt(m2[1],10);
              return 0;
            };
            const toMeters = (val: number, unit?: string) => {
              const u = String(unit||'').toLowerCase();
              if (u==='m') return Math.floor(val);
              if (u==='yd') return Math.floor(val*0.9144);
              if (u==='mi') return Math.floor(val*1609.34);
              if (u==='km') return Math.floor(val*1000);
              return Math.floor(val||0);
            };
            const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
            const addPace = (step:any, paceTxt?: string, tol = 0.05) => {
              const m = String(paceTxt||'').trim().match(/(\d+):(\d{2})\s*\/(mi|km)/i);
              if (!m) return;
              const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
              const unit = m[3].toLowerCase();
              step.paceTarget = `${mmss(sec)}/${unit}`;
              step.pace_range = { lower: Math.round(sec*(1-tol)), upper: Math.round(sec*(1+tol)), unit };
            };
            const resolvePace = (ref: any): string | undefined => {
              if (!ref) return undefined;
              if (typeof ref === 'string') {
                if (/^user\./i.test(ref)) {
                  const key = ref.replace(/^user\./i,'');
                  const txt = (perfNumbersUpgrade as any)?.[key];
                  return typeof txt === 'string' ? txt : undefined;
                }
                return ref;
              }
              if (ref && typeof ref === 'object' && typeof ref.baseline === 'string') {
                const key = String(ref.baseline).replace(/^user\./i,'');
                const txt = (perfNumbersUpgrade as any)?.[key];
                if (typeof txt === 'string') {
                  const mod = String(ref.modifier||'').trim();
                  return mod ? `${txt} ${mod}` : txt;
                }
              }
              return undefined;
            };
            const out: any[] = [];
            const disc = String(row?.type||'').toLowerCase();
            const struct: any[] = Array.isArray(ws?.structure) ? ws.structure : [];
            for (const seg of struct) {
              const k = String(seg?.type||'').toLowerCase();
              if (k==='warmup') { const d=toSec(String(seg?.duration||'')); if(d>0){ const st:any={effortLabel:'warm up', duration:d}; if(disc==='run') addPace(st, (perfNumbersUpgrade as any)?.easyPace, 0.06); out.push(st);} continue; }
              if (k==='cooldown') { const d=toSec(String(seg?.duration||'')); if(d>0){ const st:any={effortLabel:'cool down', duration:d}; if(disc==='run') addPace(st, (perfNumbersUpgrade as any)?.easyPace, 0.06); out.push(st);} continue; }
              if (k==='main_set' && String(seg?.set_type||'').toLowerCase()==='intervals') {
                const reps = Math.max(1, Number(seg?.repetitions)||0);
                const work = seg?.work_segment||{}; const rec = seg?.recovery_segment||{};
                const distTxt = String(work?.distance||'');
                let meters: number | undefined = undefined;
                const dm = distTxt.match(/(\d+(?:\.\d+)?)\s*(m|mi|km|yd)/i);
                if (dm) meters = toMeters(parseFloat(dm[1]), dm[2]);
                const durS = toSec(String(work?.duration||''));
                const restS = toSec(String(rec?.duration||''));
                const paceTxt = disc==='run' ? resolvePace(work?.target_pace) : undefined;
                const workStep: any = { effortLabel:'interval' };
                if (typeof meters==='number' && meters>0) workStep.distanceMeters = meters;
                if (!meters && durS>0) workStep.duration = durS;
                if (paceTxt) addPace(workStep, paceTxt, 0.04);
                const segs: any[] = [workStep];
                if (restS>0) segs.push({ effortLabel:'rest', duration: restS });
                if (reps>1) out.push({ effortLabel:'repeat', repeatCount: reps, segments: segs }); else out.push(...segs);
                continue;
              }
            }
            if (out.length) {
              await supabase.from('planned_workouts').update({ intervals: out }).eq('id', row.id);
            }
          }
        } catch {}

        // If computed exists but carries no real work reps, synthesize computed V3 from workout_structure
        try {
          const hasComputed = row?.computed && Array.isArray(row.computed.steps);
          const hasWork = hasComputed ? (row.computed.steps as any[]).some((st:any)=>{
            const t = String(st?.type||'').toLowerCase();
            if (t==='warmup' || t==='cooldown') return false;
            if (t==='interval_rest' || /rest/.test(t)) return false;
            return true;
          }) : false;
          const ws: any = row?.workout_structure;
          const canBuild = !!ws && (!hasComputed || !hasWork);
          if (canBuild) {
            const toSec = (v?: string): number => { if (!v || typeof v !== 'string') return 0; const m1=v.match(/(\d+)\s*min/i); if (m1) return parseInt(m1[1],10)*60; const m2=v.match(/(\d+)\s*s/i); if (m2) return parseInt(m2[1],10); return 0; };
            const toMeters = (val: number, unit?: string) => { const u=String(unit||'').toLowerCase(); if(u==='m') return Math.floor(val); if(u==='yd') return Math.floor(val*0.9144); if(u==='mi') return Math.floor(val*1609.34); if(u==='km') return Math.floor(val*1000); return Math.floor(val||0); };
            const parsePace = (txt?: string): { sec:number|null, unit?:'mi'|'km' } => { if(!txt) return {sec:null} as any; const m=String(txt).trim().match(/(\d+):(\d{2})\s*\/(mi|km)/i); if(!m) return {sec:null} as any; return { sec: parseInt(m[1],10)*60+parseInt(m[2],10), unit: m[3].toLowerCase() as any }; };
            const toSecPerMi = (sec:number, unit?: 'mi'|'km'): number => unit==='km' ? Math.round(sec * 1.60934) : sec;
            const tolQual = (row.export_hints && typeof row.export_hints.pace_tolerance_quality==='number') ? row.export_hints.pace_tolerance_quality : 0.04;
            const tolEasy = (row.export_hints && typeof row.export_hints.pace_tolerance_easy==='number') ? row.export_hints.pace_tolerance_easy : 0.06;
            const resolvePace = (ref:any): string | undefined => {
              if (!ref) return undefined;
              if (typeof ref === 'string') {
                if (/^user\./i.test(ref)) { const key = ref.replace(/^user\./i,''); const txt=(perfNumbersUpgrade as any)?.[key]; return typeof txt==='string'? txt : undefined; }
                return ref;
              }
              if (ref && typeof ref === 'object' && typeof ref.baseline === 'string') {
                const key = String(ref.baseline).replace(/^user\./i,''); const txt=(perfNumbersUpgrade as any)?.[key]; if (typeof txt==='string'){ const mod=String(ref.modifier||'').trim(); return mod? `${txt} ${mod}` : txt; }
              }
              return undefined;
            };
            const out: any[] = [];
            const type = String(ws?.type||'').toLowerCase();
            const disc = String(row?.type||'').toLowerCase();
            const struct: any[] = Array.isArray(ws?.structure) ? ws.structure : [];
            const pushWU = (sec:number) => { if (sec>0) { const st:any={ type:'warmup', duration_s: sec }; if (disc==='run') { const ep = String((perfNumbersUpgrade as any)?.easyPace||''); const pp = parsePace(ep); if (pp.sec) { const center = toSecPerMi(pp.sec, pp.unit); st.pace_range = { lower: Math.round(center*(1-tolEasy)), upper: Math.round(center*(1+tolEasy)) }; st.pace_sec_per_mi = center; } } out.push(st);} };
            const pushCD = (sec:number) => { if (sec>0) { const st:any={ type:'cooldown', duration_s: sec }; if (disc==='run') { const ep = String((perfNumbersUpgrade as any)?.easyPace||''); const pp = parsePace(ep); if (pp.sec) { const center = toSecPerMi(pp.sec, pp.unit); st.pace_range = { lower: Math.round(center*(1-tolEasy)), upper: Math.round(center*(1+tolEasy)) }; st.pace_sec_per_mi = center; } } out.push(st);} };
            for (const seg of struct) {
              const k = String(seg?.type||'').toLowerCase();
              if (k==='warmup') { pushWU(toSec(String(seg?.duration||''))); continue; }
              if (k==='cooldown') { pushCD(toSec(String(seg?.duration||''))); continue; }
              if (type==='interval_session' && k==='main_set') {
                const reps = Math.max(1, Number(seg?.repetitions)||0);
                const work = seg?.work_segment||{}; const rec = seg?.recovery_segment||{};
                const distTxt = String(work?.distance||'');
                const dm = distTxt.match(/(\d+(?:\.\d+)?)\s*(m|mi|km|yd)/i);
                const meters = dm ? toMeters(parseFloat(dm[1]), dm[2]) : undefined;
                const durS = toSec(String(work?.duration||''));
                const restS = toSec(String(rec?.duration||''));
                const paceTxt = disc==='run' ? resolvePace(work?.target_pace) : undefined;
                const addWork = () => {
                  const st:any = { type:'interval' };
                  if (typeof meters==='number' && meters>0) st.distance_m = meters; else if (durS>0) st.duration_s = durS; else st.duration_s = 1;
                  if (paceTxt) { const pp = parsePace(paceTxt); if (pp.sec){ const center = toSecPerMi(pp.sec, pp.unit); st.pace_range = { lower: Math.round(center*(1-tolQual)), upper: Math.round(center*(1+tolQual)) }; st.pace_sec_per_mi = center; } }
                  out.push(st);
                };
                for (let r=0;r<reps;r+=1){
                  addWork();
                  if (r<reps-1 && restS>0) out.push({ type:'interval_rest', duration_s: restS });
                }
                continue;
              }
              if (type==='endurance_session' && (k==='main_effort' || k==='main')) {
                const sec = toSec(String(seg?.duration||'')); if (sec>0){ const st:any={ type:'interval', duration_s: sec }; if (disc==='run'){ const ep=String((perfNumbersUpgrade as any)?.easyPace||''); const pp=parsePace(ep); if (pp.sec){ const center=toSecPerMi(pp.sec, pp.unit); st.pace_range={lower:Math.round(center*(1-tolEasy)), upper:Math.round(center*(1+tolEasy))}; st.pace_sec_per_mi=center; } } out.push(st);} continue;
              }
            }
            if (out.length){
              const next = { normalization_version:'v3', steps: out, total_duration_seconds: totalDurationSeconds(out as any) } as any;
              await supabase.from('planned_workouts').update({ computed: next }).eq('id', row.id);
            }
          }
        } catch {}

          // Bridge structured for existing rows if missing
          try {
            if (!row?.workout_structure) {
              const bridged = buildStructuredFromTokens(row);
              if (bridged) {
                const sr = normalizeStructuredSession({ discipline: row.type, workout_structure: bridged }, { performanceNumbers: perfNumbersUpgrade });
                await supabase.from('planned_workouts').update({
                  workout_structure: bridged,
                  workout_title: bridged?.title || null,
                  friendly_summary: (sr?.friendlySummary || row.rendered_description || row.description || '').trim() || null,
                  total_duration_seconds: Math.max(Number(row.total_duration_seconds||0), Math.round((sr?.durationMinutes||0)*60)) || null,
                }).eq('id', row.id);
              }
            }
          } catch {}

        // Strength loads retrofit: if rendered_description has % but no load, inject user 1RM load
        try {
          const t = String(row?.type||'').toLowerCase();
          let desc = String((row as any)?.rendered_description || (row as any)?.description || '').trim();
          if (t==='strength' && desc) {
            const round5 = (n:number) => Math.round(n/5)*5;
            const injectLoads = (txt: string): string => {
              // Derive accessory percents from tokens if present (e.g., st_acc_barbell_row_*_@pct70)
              const pctFromTokens = (() => {
                try {
                  const steps: string[] = Array.isArray((row as any)?.steps_preset) ? (row as any).steps_preset : [];
                  for (const t of steps) {
                    const m = String(t).toLowerCase().match(/st_acc_barbell_row_[^@]*_@pct(\d{1,3})/i);
                    if (m) return Math.min(100, Math.max(1, parseInt(m[1], 10)));
                  }
                } catch {}
                return undefined;
              })();
              const pctFromLibrary = pctFromTokens == null ? pctFromLibraryForRow(row) : undefined;
              // 1) Main lifts with percent
              let out = txt.replace(/([A-Za-z\- ]+)\s+(\d+)\s*[x×]\s*(\d+)\s*@\s*(\d{1,3})%([^;]*)/g, (m, name, sets, reps, pctStr, tail) => {
                if (/\b\d+\s*lb\b/i.test(String(tail))) return m; // already includes load
                const pct = parseInt(String(pctStr), 10);
                const lift = String(name||'').toLowerCase();
                const orm = lift.includes('dead')
                  ? (perfNumbersUpgrade?.deadlift)
                  : (lift.includes('bench') || lift.includes('row'))
                  ? (perfNumbersUpgrade?.bench)
                  : (lift.includes('ohp')||lift.includes('overhead')||lift.includes('press'))
                  ? (perfNumbersUpgrade?.overheadPress1RM || perfNumbersUpgrade?.overhead)
                  : perfNumbersUpgrade?.squat;
                if (!orm || !pct || !isFinite(orm)) return m;
                const proxy = lift.includes('row') ? Number(orm) * 0.95 : Number(orm);
                const rounded = round5(proxy * (pct/100));
                return `${name} ${sets}×${reps} @ ${pct}% — ${rounded} lb${tail}`;
              });
              // 2) Accessory Barbell/DB Row without explicit percent — estimate from Bench 1RM (95%), fallback DL 55%
              out = out.replace(/\b(Barbell Row|BB Row|Row|DB Row|Dumbbell Row)\b([^;]*)/gi, (m, label, tail) => {
                const bench: number | undefined = typeof perfNumbersUpgrade?.bench === 'number' ? perfNumbersUpgrade.bench : undefined;
                const dead: number | undefined = typeof perfNumbersUpgrade?.deadlift === 'number' ? perfNumbersUpgrade.deadlift : undefined;
                const base = (typeof bench === 'number' && isFinite(bench)) ? bench * 0.95 : (typeof dead === 'number' && isFinite(dead) ? dead * 0.55 : undefined);
                const pct = (typeof pctFromTokens === 'number' && isFinite(pctFromTokens))
                  ? pctFromTokens
                  : (typeof pctFromLibrary === 'number' && isFinite(pctFromLibrary) ? pctFromLibrary : undefined);
                const scale = (typeof pct === 'number') ? (pct/100) : 1;
                const est = (typeof base === 'number') ? base * scale : undefined;
                if (typeof est !== 'number' || !isFinite(est)) return m;
                const pctTxt = (typeof pct === 'number') ? ` @ ${pct}%` : '';
                const rounded = round5(est);
                const cleanTail = String(tail || '').replace(/\s*—\s*\d+\s*lb\b/i, '');
                return `${label}${pctTxt} — ${rounded} lb${cleanTail}`;
              });
              return out;
            };
            const next = injectLoads(desc);
            if (next !== desc) {
              await supabase.from('planned_workouts').update({ rendered_description: next }).eq('id', row.id);
            }
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

  let sessionsByWeek = (plan as any).sessions_by_week || {};
  const planDefaults = (plan as any)?.defaults || DEFAULTS_FALLBACK;
  let weekSessions: any[] = sessionsByWeek[String(weekNumber)] || [];
  // Strict mode: if week has no authored sessions, do nothing
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
    // Strict mode: do not enrich sessions from kind; require authored tokens/DSL
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
    // Bridge: synthesize structured workout from tokens when authoring uses steps_preset
    try {
      const buildStructuredFromTokens = (stepsPreset?: any[], discipline?: string): any | null => {
        const steps: string[] = Array.isArray(stepsPreset) ? stepsPreset.map((t:any)=>String(t)) : [];
        if (!steps.length) return null;
        const disc = String(discipline || s.discipline || s.type || '').toLowerCase();
        const m = (re: RegExp) => steps.map(t=>t.toLowerCase().match(re)).find(Boolean) as RegExpMatchArray | undefined;
        const mins = (n:number)=>`${n}min`;
        const toInt = (x:string|undefined)=> x?parseInt(x,10):0;
        const sumDur = (arr: string[]): number => arr.reduce((a,v)=>{
          const mm = v.match(/(\d+)\s*min/i); return a + (mm?parseInt(mm[1],10):0);
        },0);

        // RUN — intervals
        if (disc==='run') {
          const wu = m(/warmup.*?(\d+)min/);
          const cd = m(/cooldown.*?(\d+)min/);
          const iv = m(/^interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_([a-z0-9]+).*?(?:_r(\d+)(?:s|min)?)?/i);
          const tp = m(/^tempo_(\d+)min_5kpace(?:_plus(\d+):(\d{2}))?/i);
          const lr = m(/^longrun_(\d+)min_easypace/i) || m(/^run_easy_(\d+)min/i);
          if (iv) {
            const reps = toInt(iv[1]); const dist = `${iv[2]}${iv[3]}`; const rest = iv[5]? (/min/i.test(String(iv[0]))?`${iv[5]}min`:`${iv[5]}s`): undefined;
            const ws: any = { type:'interval_session', total_duration_estimate: mins((wu?toInt(wu[1]):0)+(cd?toInt(cd[1]):0)), structure: [] as any[] };
            if (wu) ws.structure.push({ type:'warmup', duration: mins(toInt(wu[1])), intensity:'easy' });
            ws.structure.push({ type:'main_set', set_type:'intervals', repetitions: reps, work_segment: { distance: dist, target_pace:'user.fiveK_pace' }, recovery_segment: rest? { duration: rest, activity:'easy_jog', intensity:'recovery' } : undefined });
            if (cd) ws.structure.push({ type:'cooldown', duration: mins(toInt(cd[1])), intensity:'easy' });
            return ws;
          }
          if (tp) {
            const dur = mins(toInt(tp[1])); const plus = (tp[2] && tp[3])? `+${tp[2]}:${tp[3]}/mile` : undefined;
            const ws: any = { type:'tempo_session', total_duration_estimate: dur, structure: [] as any[] };
            if (wu) ws.structure.push({ type:'warmup', duration: mins(toInt(wu[1])), intensity:'easy_building' });
            ws.structure.push({ type:'main_set', set_type:'tempo_run', work_segment: { duration: dur, target_pace: plus? { baseline:'user.fiveK_pace', modifier: plus } : 'user.fiveK_pace' } });
            if (cd) ws.structure.push({ type:'cooldown', duration: mins(toInt(cd[1])), intensity:'easy' });
            return ws;
          }
          if (lr) {
            const dur = mins(toInt(lr[1]));
            return { type:'endurance_session', total_duration_estimate: dur, structure: [ { type:'main_effort', duration: dur, target_pace:'user.easyPace', intensity:'aerobic_base' } ] };
          }
        }

        // BIKE — endurance & intervals
        if (disc==='bike' || disc==='ride') {
          const endu = m(/^bike_endurance_(\d+)min(?:_z(\d)(?:-(\d))?)?/i);
          const ss = m(/^bike_ss_(\d+)x(\d+)min_(?:r(\d+)min)/i);
          const thr = m(/^bike_thr_(\d+)x(\d+)min_(?:r(\d+)min)/i);
          const vo2 = m(/^bike_vo2_(\d+)x(\d+)(?:min|s)_(?:r(\d+)(?:min|s))/i);
          if (endu) {
            const dur = mins(toInt(endu[1]));
            const z = endu[2]? parseInt(endu[2],10) : 2;
            const range = z===1? '60-65%' : '65-75%';
            return { type:'endurance_session', total_duration_estimate: dur, structure:[ { type:'main_effort', duration: dur, target_power:{ zone:'endurance', baseline:'user.ftp', range }, intensity:'aerobic_base' } ] };
          }
          const buildBikeSet = (label:'sweet_spot_intervals'|'threshold_intervals'|'vo2_intervals', mm:RegExpMatchArray|undefined) => {
            if (!mm) return null; const reps=toInt(mm[1]); const work=mins(toInt(mm[2])); const rest=mm[3]? `${mm[3]}min` : undefined; return { type:'bike_intervals', total_duration_estimate: work, structure:[ { type:'warmup', duration:'15min', intensity:'easy_with_openers' }, { type:'main_set', set_type:label, repetitions: reps, work_segment:{ duration: work, target_power:{ baseline:'user.ftp', range: label==='sweet_spot_intervals'?'85-95%': label==='threshold_intervals'?'95-105%':'105-120%' } }, recovery_segment: rest? { duration: rest, intensity:'easy_spin' } : undefined }, { type:'cooldown', duration:'10min', intensity:'easy' } ] };
          };
          return buildBikeSet('sweet_spot_intervals', ss) || buildBikeSet('threshold_intervals', thr) || buildBikeSet('vo2_intervals', vo2);
        }

        // SWIM
        if (disc==='swim') {
          const wu = m(/^swim_warmup_(\d+)(yd|m)/i);
          const cd = m(/^swim_cooldown_(\d+)(yd|m)/i);
          const drill = m(/^swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
          const aero = m(/^swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
          const thr = m(/^swim_threshold_(\d+)x(\d+)(yd|m)_r(\d+)/i) || m(/^swim_interval_(\d+)x(\d+)(yd|m)_r(\d+)/i);
          const ws: any = { type:'swim_session', total_duration_estimate: '30min', structure: [] as any[] };
          if (wu) ws.structure.push({ type:'warmup', distance: `${wu[1]}${wu[2]}`, intensity:'easy' });
          if (drill) ws.structure.push({ type:'drill_set', drill_type: drill[1], repetitions: toInt(drill[2]), distance: `${drill[3]}${drill[4]}`, rest: drill[5]? `${drill[5]}s` : '15s' });
          if (aero) ws.structure.push({ type:'main_set', set_type:'aerobic_intervals', repetitions: toInt(aero[1]), distance: `${aero[2]}${aero[3]}`, rest: aero[4]? `${aero[4]}s` : '15s' });
          if (thr) ws.structure.push({ type:'main_set', set_type:'threshold_intervals', repetitions: toInt(thr[1]), distance: `${thr[2]}${thr[3]}`, rest: `${thr[4]}s` });
          if (cd) ws.structure.push({ type:'cooldown', distance: `${cd[1]}${cd[2]}`, intensity:'easy' });
          if (ws.structure.length) return ws;
        }

        // STRENGTH
        if (disc==='strength') {
          const ws: any = { type:'strength_session', total_duration_estimate: '45min', structure: [] as any[] };
          steps.forEach(t=>{
            let m = t.match(/^st_wu_(\d+)/i); if (m) { ws.structure.push({ type:'warmup', duration: `${m[1]}min` }); return; }
            m = t.match(/^st_main_([a-z0-9_]+)_(\d+)x(\d+)(?:_@pct(\d+))?(?:_rest(\d+))?/i);
            if (m) { const ex=m[1]; const sets=toInt(m[2]); const reps=toInt(m[3]); const pct= m[4]? toInt(m[4]) : undefined; const rest = m[5]? `${m[5]}s` : undefined; const base = /bench/.test(ex)?'user.bench':/squat/.test(ex)?'user.squat':/deadlift/.test(ex)?'user.deadlift':'user.overheadPress1RM'; ws.structure.push({ type:'main_lift', exercise: ex, sets, reps, load: pct? { type:'percentage', baseline: base, percentage: pct } : undefined, rest }); return; }
            m = t.match(/^st_acc_([a-z0-9_]+)_(\d+)x(\d+)(?:_@pct(\d+))?(?:_rest(\d+))?/i);
            if (m) { const ex=m[1]; const sets=toInt(m[2]); const reps=toInt(m[3]); const pct= m[4]? toInt(m[4]) : undefined; const rest = m[5]? `${m[5]}s` : undefined; const base = /row/.test(ex)?'user.bench':'user.overheadPress1RM'; ws.structure.push({ type:'accessory', exercise: ex, sets, reps, load: pct? { type:'percentage', baseline: base, percentage: pct } : undefined, rest }); return; }
          });
          if (ws.structure.length) return ws;
        }

        // BRICK (bike + run tokens)
        if (disc==='brick') {
          const bike = steps.find(t=>/^bike_/.test(t.toLowerCase()));
          const run = steps.find(t=>/^(run_easy_|longrun_|tempo_)/.test(t.toLowerCase()));
          if (bike && run) {
            const bikeDur = (():string=>{ const m=bike.toLowerCase().match(/_(\d+)min/); return m? `${m[1]}min` : '60min'; })();
            const runDur = (():string=>{ const m=run.toLowerCase().match(/_(\d+)min/); return m? `${m[1]}min` : '20min'; })();
            return { type:'brick_session', total_duration_estimate: mins(toInt(bikeDur)+toInt(runDur)), structure:[ { type:'bike_segment', duration: bikeDur, target_power:{ baseline:'user.ftp', zone:'endurance', range: /z1/i.test(bike)?'60-65%':'65-75%' } }, { type:'transition', duration:'2min' }, { type:'run_segment', duration: runDur, target_pace: /tempo_/.test(run.toLowerCase())? { baseline:'user.fiveK_pace', modifier:'+45s/mile' } : 'user.easyPace' } ] };
          }
        }
        return null;
      };
      if (!s.workout_structure) {
        const bridged = buildStructuredFromTokens(s.steps_preset, s.discipline);
        if (bridged) s.workout_structure = bridged;
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
      // Prefer structured normalization when present
      const hasStructured = s && typeof (s as any).workout_structure === 'object' && (s as any).workout_structure;
      if (hasStructured) {
        const sr = normalizeStructuredSession(s, { performanceNumbers: perfNumbers });
        rendered = (sr.friendlySummary || rendered).trim();
        totalSeconds = Math.max(0, Math.round((sr.durationMinutes || 0) * 60));
      } else {
        const norm = normalizePlannedSession(s, { performanceNumbers: perfNumbers }, exportHints || {});
        rendered = (norm.friendlySummary || rendered).trim();
        totalSeconds = Math.max(0, Math.round((norm.durationMinutes || 0) * 60));
      }
      // Inject strength loads from user baselines when missing
      if (mappedType === 'strength') {
        try {
          const perf: any = perfNumbers || {};
          const oneRM = {
            squat: typeof perf.squat === 'number' ? perf.squat : undefined,
            bench: typeof perf.bench === 'number' ? perf.bench : undefined,
            deadlift: typeof perf.deadlift === 'number' ? perf.deadlift : undefined,
            overhead: typeof perf.overheadPress1RM === 'number' ? perf.overheadPress1RM : (typeof perf.overhead === 'number' ? perf.overhead : undefined),
          } as Record<string, number | undefined>;
          const round5 = (n:number) => Math.round(n/5)*5;
          const liftKey = (text: string): keyof typeof oneRM => {
            const t = text.toLowerCase();
            if (t.includes('dead')) return 'deadlift';
            if (t.includes('bench') || t.includes('row')) return 'bench';
            if (t.includes('ohp') || t.includes('overhead') || t.includes('press')) return 'overhead';
            return 'squat';
          };
          const addLoads = (txt: string): string => {
            // Derive accessory percents from tokens if present for this session (e.g., st_acc_barbell_row_*_@pct70)
            const pctFromTokens = (() => {
              try {
                const steps: string[] = Array.isArray((s as any)?.steps_preset) ? (s as any).steps_preset : [];
                for (const t of steps) {
                  const m = String(t).toLowerCase().match(/st_acc_barbell_row_[^@]*_@pct(\d{1,3})/i);
                  if (m) return Math.min(100, Math.max(1, parseInt(m[1], 10)));
                }
              } catch {}
              return undefined;
            })();
            // Main lifts with %
            let out = txt.replace(/([A-Za-z\- ]+)\s+(\d+)\s*[x×]\s*(\d+)\s*@\s*(\d{1,3})%([^;]*)/g, (m, name, sets, reps, pctStr, tail) => {
              if (/\b\d+\s*lb\b/i.test(String(tail))) return m;
              const pct = parseInt(String(pctStr), 10);
              const key = liftKey(String(name));
              const orm = oneRM[key];
              if (!orm || !pct || !isFinite(orm)) return m;
              const proxy = key==='bench' && /row/i.test(String(name)) ? orm * 0.95 : orm;
              const rounded = round5(proxy * (pct/100));
              return `${name} ${sets}×${reps} @ ${pct}% — ${rounded} lb${tail}`;
            });
            // Accessory: Rows without % — estimate from Bench (95%), fallback Deadlift (55%)
            out = out.replace(/\b(Barbell Row|BB Row|Row|DB Row|Dumbbell Row)\b([^;]*)/gi, (m, label, tail) => {
              const bench: number | undefined = typeof oneRM.bench === 'number' ? oneRM.bench : undefined;
              const dead: number | undefined = typeof oneRM.deadlift === 'number' ? oneRM.deadlift : undefined;
              const base = (typeof bench === 'number' && isFinite(bench)) ? bench * 0.95 : (typeof dead === 'number' && isFinite(dead) ? dead * 0.55 : undefined);
              const scale = (typeof pctFromTokens === 'number' && isFinite(pctFromTokens)) ? (pctFromTokens/100) : 1;
              const est = (typeof base === 'number') ? base * scale : undefined;
              if (typeof est !== 'number' || !isFinite(est)) return m;
              const rounded = round5(est);
              const pctTxt = (typeof pctFromTokens === 'number' && isFinite(pctFromTokens)) ? ` @ ${pctFromTokens}%` : '';
              const cleanTail = String(tail || '').replace(/\s*—\s*\d+\s*lb\b/i, '');
              return `${label}${pctTxt} — ${rounded} lb${cleanTail}`;
            });
            return out;
          };
          rendered = addLoads(rendered);
        } catch {}
      }
    } catch {}

    // Strength session-length presets (e.g., strength_main_45min, strength_power_40min, strength_circuit_30min)
    const strengthPresetMinutes = (() => {
      try {
        if (mappedType !== 'strength') return null;
        const toks = Array.isArray((s as any).steps_preset) ? (s as any).steps_preset.map((t:any)=>String(t).toLowerCase()) : [];
        let best: number | null = null;
        for (const t of toks) {
          const m = t.match(/strength_(?:main|accessory|power|bodyweight|circuit)_(\d{2})min/);
          if (m) { const mins = parseInt(m[1],10); best = Math.max(best ?? 0, mins); }
        }
        return best;
      } catch {}
      return null;
    })();
    const durationValBase = typeof s.duration === 'number' && Number.isFinite(s.duration) ? s.duration : (totalSeconds ? Math.round(totalSeconds/60) : 0);
    const durationVal = strengthPresetMinutes || durationValBase;

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
        if (/bike_endurance_|\bendurance\b|\bz2\b/.test(toks)) return 'Ride — Endurance';
        if (/bike_ss_/.test(toks)) return 'Ride — Sweet Spot';
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
      const addRest = (sec: number, pushIfLast = true) => { if (sec>0) out.push({ effortLabel: 'rest', duration: sec }); };
      const parseRestSec = (s: string): number => {
        // Accept minutes or seconds in a variety of token styles:
        //   _R5min, _r5min, _R300s, _r300, and ensure we don't swallow other suffixes
        const mMin = s.match(/_(?:r|R)(\d+)\s*min\b/i);
        if (mMin) return parseInt(mMin[1], 10) * 60;
        const mSecWithS = s.match(/_(?:r|R)(\d+)s\b/i);
        if (mSecWithS) return parseInt(mSecWithS[1], 10);
        const mSecBare = s.match(/_(?:r|R)(\d+)(?![a-z])/i);
        if (mSecBare) return parseInt(mSecBare[1], 10);
        return 0;
      };

      // Warmup/Cooldown tokens
      steps.forEach((t) => {
        const s = t.toLowerCase();
        let m = s.match(/warmup.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
        if (m) { const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; wuMin = Math.max(wuMin, Math.round((a+b)/2)); }
        m = s.match(/cooldown.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
        if (m) { const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; cdMin = Math.max(cdMin, Math.round((a+b)/2)); }
        // bike_warmup_10 or bike_warmup_15 → treat as minutes
        m = s.match(/^bike_warmup_(\d{1,3})$/);
        if (m) { wuMin = Math.max(wuMin, parseInt(m[1],10)); }
      });
      // Add warm-up at the start later; cooldown will be appended at the end

      // Interval blocks e.g., interval_6x800m_5kpace_R2min or ..._r120
      steps.forEach((tok) => {
        const s = tok.toLowerCase();
        const m = s.match(/^interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_([^_\s]+)(?:_(plus\d+(?::\d{2})?))?(?:_(r\d+|R\d+min))?$/i);
        if (!m) return;
        const reps = parseInt(m[1],10);
        const each = parseFloat(m[2]);
        const unit = (m[3]||'m').toLowerCase() as 'm'|'mi';
        const paceTag = String(m[4]||'');
        const plusTok = String(m[5]||'');
        const restSec = parseRestSec(s);
        const paceForIntervals = (() => {
          if (!isRun) return undefined;
          let base = undefined as string | undefined;
          if (/5kpace/i.test(paceTag) && fivekPace) base = fivekPace;
          else if (/10kpace/i.test(paceTag) && fivekPace) base = fivekPace; // fallback
          else if (/easy/i.test(paceTag) && easyPace) base = easyPace;
          else base = fivekPace || easyPace;
          if (!base) return undefined;
          if (plusTok) {
            const pm = plusTok.match(/plus(\d+)(?::(\d{2}))?/i);
            if (pm) {
              const add = (parseInt(pm[1],10) * 60) + (pm[2]?parseInt(pm[2],10):0);
              const parsed = base.match(/(\d+):(\d{2})\/(mi|km)/i);
              if (parsed) {
                const baseSec = parseInt(parsed[1],10)*60+parseInt(parsed[2],10);
                const unitTxt = parsed[3];
                base = `${Math.floor((baseSec+add)/60)}:${String((baseSec+add)%60).padStart(2,'0')}/${unitTxt}`;
              }
            }
          }
          return base;
        })();
        for (let r=0;r<reps;r+=1){
          out.push({ effortLabel: 'interval', distanceMeters: toMeters(unit==='mi'?each:each, unit), ...(paceForIntervals ? { paceTarget: paceForIntervals } : {}) });
          if (r<reps-1 && restSec>0) out.push({ effortLabel: 'rest', duration: restSec });
        }
      });

      // Tempo blocks e.g., tempo_4mi_...
      const tm = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi/i);
      if (tm) {
        const miles = parseFloat(tm[1]);
        const paceForTempo = isRun ? (fivekPace || easyPace) : undefined;
        out.push({ effortLabel: 'tempo', distanceMeters: toMeters(miles, 'mi'), ...(paceForTempo ? { paceTarget: paceForTempo } : {}) });
      }

      // Strides e.g., strides_6x20s or strides_6x100m
      const st = tokenStr.match(/strides_(\d+)x(\d+)s/i);
      if (st) {
        const reps = parseInt(st[1],10); const secEach = parseInt(st[2],10);
        for (let r=0;r<reps;r+=1) out.push({ effortLabel: 'interval', duration: secEach });
      }
      const stm = tokenStr.match(/strides_(\d+)x(\d+)(m)/i);
      if (stm) {
        const reps = parseInt(stm[1],10); const meters = parseInt(stm[2],10);
        for (let r=0;r<reps;r+=1) out.push({ effortLabel: 'interval', distanceMeters: toMeters(meters, 'm') });
      }

      // Run drills macro: drills_A_B_skips_high_knees → short technique blocks
      if (/drills_a_b_skips_high_knees/i.test(tokenStr)) {
        const pushBlock = (label:string, reps:number, sec:number, rest:number) => {
          for (let r=0;r<reps;r+=1){ out.push({ effortLabel: label, duration: sec }); if (rest && r<reps-1) out.push({ effortLabel:'rest', duration: rest }); }
        };
        pushBlock('drill — A-skips', 2, 30, 20);
        pushBlock('drill — B-skips', 2, 30, 20);
        pushBlock('drill — high knees', 4, 20, 20);
      }
      // Generic drills_foo_bar → 2x30s each with 20s rest between items
      steps.forEach((tok)=>{
        const s = tok.toLowerCase();
        const m = s.match(/^drills_([a-z0-9_]+)$/);
        if (!m) return;
        const items = m[1].split('_').filter(Boolean);
        items.forEach((name, idx) => {
          out.push({ effortLabel: `drill — ${name.replace(/_/g,' ')}`, duration: 30 });
          if (idx < items.length-1) out.push({ effortLabel: 'rest', duration: 20 });
        });
      });

      // Bike sets e.g., bike_vo2_6x3min_R3min, bike_thr_4x8min_R5min, bike_ss_2x20min_R6min
      steps.forEach((tok)=>{
        const s = tok.toLowerCase();
        let m = s.match(/^bike_(vo2|thr|ss)_(\d+)x(\d+)(min)(?:_(r\d+|r\d+min))?$/i);
        if (m) {
          const kind = (m[1]||'').toLowerCase();
          const reps=parseInt(m[2],10); const each=parseInt(m[3],10)*60; const restSec=parseRestSec(s);
          const powerForKind = (() => {
            if (!isRide || !ftp) return undefined;
            if (kind==='vo2') return Math.round(ftp*1.10);
            if (kind==='thr') return Math.round(ftp*0.98);
            if (kind==='ss') return Math.round(ftp*0.91);
            return undefined;
          })();
          for (let r=0;r<reps;r+=1){
            out.push({ effortLabel: 'interval', duration: each, ...(powerForKind ? { powerTarget: `${powerForKind}W` } : {}) });
            if (r<reps-1 && restSec>0) out.push({ effortLabel: 'rest', duration: restSec });
          }
          return;
        }
        // Neuromuscular and Anaerobic e.g., bike_neuro_8x30s_R300s, bike_anaerobic_6x60s_R4min
        m = s.match(/^bike_(neuro|anaerobic)_(\d+)x(\d+)(s|min)(?:_(r\d+|r\d+min))?$/i);
        if (m) {
          const reps = parseInt(m[2],10);
          const dur = parseInt(m[3],10) * (m[4].toLowerCase()==='min'?60:1);
          const restSec = parseRestSec(s);
          for (let r=0;r<reps;r+=1){ out.push({ effortLabel: m[1].toLowerCase()==='neuro'?'neuromuscular':'anaerobic', duration: dur }); if (r<reps-1 && restSec>0) out.push({ effortLabel:'rest', duration: restSec }); }
          return;
        }
      });

      // Bike tempo simple durations
      const btmp = tokenStr.match(/bike_tempo_(\d+)min/i);
      if (btmp) out.push({ effortLabel: 'tempo', duration: parseInt(btmp[1],10)*60 });

      // Endurance bike single block e.g., bike_endurance_50min...
      const bend = tokenStr.match(/bike_endurance_(\d+)min(?:_z(?:1|2)(?:-(?:2|3))?)?(?:_cad\d+(?:-\d+)?)?/i);
      if (bend) out.push({ effortLabel: 'endurance', duration: parseInt(bend[1],10)*60 });

      // Bike recovery
      const brec = tokenStr.match(/bike_recovery_(\d+)min/i);
      if (brec) out.push({ effortLabel: 'recovery', duration: parseInt(brec[1],10)*60 });

      // Bike race prep
      const brp = tokenStr.match(/bike_race_prep_(\d+)x(\d+)(min|s)_race_pace/i);
      if (brp) {
        const reps = parseInt(brp[1],10); const amt = parseInt(brp[2],10) * (brp[3].toLowerCase()==='min'?60:1);
        for (let r=0;r<reps;r+=1){ out.push({ effortLabel: 'race pace', duration: amt }); if (r<reps-1) out.push({ effortLabel:'rest', duration: 120 }); }
      }
      // Bike openers
      if (/\bbike_openers\b/i.test(tokenStr)) {
        for (let r=0;r<3;r+=1){ out.push({ effortLabel:'opener', duration: 60 }); if (r<2) out.push({ effortLabel:'rest', duration: 120 }); }
      }

      // Speed strides e.g., speed_8x20s_R60s or speed_6x100m_R90s
      const spd = tokenStr.match(/speed_(\d+)x(\d+)s_r(\d+)s/i);
      if (spd) { const reps=parseInt(spd[1],10), sec=parseInt(spd[2],10), rest=parseInt(spd[3],10); for(let r=0;r<reps;r+=1){ out.push({ effortLabel:'interval', duration: sec }); if(r<reps-1) out.push({ effortLabel:'rest', duration: rest }); } }
      const spdm = tokenStr.match(/speed_(\d+)x(\d+)m_(?:r(\d+)s|R(\d+)s|R(\d+)min|r(\d+))/i);
      if (spdm) {
        const reps=parseInt(spdm[1],10); const meters=parseInt(spdm[2],10);
        const restSec = spdm[3]?parseInt(spdm[3],10): spdm[4]?parseInt(spdm[4],10): spdm[5]?parseInt(spdm[5],10)*60: spdm[6]?parseInt(spdm[6],10):0;
        for(let r=0;r<reps;r+=1){ out.push({ effortLabel:'interval', distanceMeters: toMeters(meters,'m') }); if(r<reps-1 && restSec>0) out.push({ effortLabel:'rest', duration: restSec }); }
      }

      // Tempo with explicit 5k offset e.g., tempo_4mi_5kpace_plus0:45
      const tmp = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi(?:_5kpace_plus(\d+):(\d{2}))?/i);
      if (tmp) {
        const miles = parseFloat(tmp[1]);
        let base = fivekPace || easyPace || undefined;
        if (base && tmp[2] && tmp[3]) {
          const addMin = parseInt(tmp[2],10); const addSec = parseInt(tmp[3],10);
          const p = base.match(/(\d+):(\d{2})\/(mi|km)/i);
          if (p) { const sec = parseInt(p[1],10)*60+parseInt(p[2],10) + (addMin*60+addSec); base = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}/${p[3]}`; }
        }
        out.push({ effortLabel: 'tempo', distanceMeters: toMeters(miles, 'mi'), ...(base ? { paceTarget: base } : {}) });
      }

      // Long run blocks e.g., longrun_90min...
      const lr = tokenStr.match(/longrun_(\d+)min/i);
      if (lr) out.push({ effortLabel: 'long run', duration: parseInt(lr[1],10)*60, ...(isRun && easyPace ? { paceTarget: easyPace } : {}) });

      // Marathon pace finish segments within long runs (finish_XXmin_MP or NxXXmin_MP)
      const mpFin = tokenStr.match(/finish_(\d+)min_mp/i);
      if (mpFin) out.push({ effortLabel: 'MP finish', duration: parseInt(mpFin[1],10)*60 });
      const mpReps = tokenStr.match(/(\d+)x(\d+)min_mp/i);
      if (mpReps) { const reps=parseInt(mpReps[1],10), dur=parseInt(mpReps[2],10)*60; for(let r=0;r<reps;r+=1){ out.push({ effortLabel:'MP', duration: dur }); if(r<reps-1) out.push({ effortLabel:'rest', duration: 60 }); } }

      // Cruise reps (all variants) e.g., cruise_4x2mi_5kpace_plus0:15_R3min or ..._r180
      steps.forEach((tok)=>{
        const s = tok.toLowerCase();
        const m = s.match(/^cruise_(\d+)x(\d+)(?:_(\d+))?mi_5kpace_plus(\d+):(\d{2})(?:_(r\d+|R\d+min))?$/i);
        if (!m) return;
        const reps = parseInt(m[1],10);
        const miles = parseFloat(m[2] + (m[3]?`.${m[3]}`:''));
        const addMin = parseInt(m[4],10); const addSec = parseInt(m[5],10);
        const restSec = parseRestSec(s);
        let base = fivekPace || undefined;
        if (base) {
          const p = base.match(/(\d+):(\d{2})\/(mi|km)/i);
          if (p) { const sec = parseInt(p[1],10)*60+parseInt(p[2],10) + (addMin*60+addSec); base = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}/${p[3]}`; }
        }
        for(let r=0;r<reps;r+=1){ out.push({ effortLabel:'cruise', distanceMeters: toMeters(miles,'mi'), ...(base?{ paceTarget: base }: {}) }); if(r<reps-1 && restSec>0) out.push({ effortLabel:'rest', duration: restSec }); }
      });

      // Fartlek e.g., fartlek_40min_10x2min_on_90s_off
      const fl = tokenStr.match(/fartlek_(\d+)min_(\d+)x(\d+)(min|s)_on_(\d+)(min|s)_off/i);
      if (fl) {
        const reps=parseInt(fl[2],10); const on=parseInt(fl[3],10)*(fl[4].toLowerCase()==='min'?60:1); const off=parseInt(fl[5],10)*(fl[6].toLowerCase()==='min'?60:1);
        for (let r=0;r<reps;r+=1){ out.push({ effortLabel:'fartlek on', duration: on }); if (r<reps-1) out.push({ effortLabel:'off', duration: off }); }
      }

      // Progression run e.g., progression_6mi_start_easy_finish_tempo or ..._finish_5k
      const pr = tokenStr.match(/progression_(\d+)mi_start_easy_finish_(tempo|5k)/i);
      if (pr) { const miles=parseInt(pr[1],10); out.push({ effortLabel:'progression', distanceMeters: toMeters(miles,'mi') }); }

      // Swim simple translation from tokens expanded earlier (distances only)
      if (String(discipline||'').toLowerCase()==='swim'){
        steps.forEach((t)=>{
          const s = String(t).toLowerCase();
          let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
          if (m){ const dist=parseInt(m[1],10); const u=(m[2]||'yd').toLowerCase() as any; out.push({ effortLabel: /warmup/i.test(s)?'warm up':'cool down', distanceMeters: toMeters(dist, u) }); return; }
          // swim_rest_r15
          m = s.match(/^swim_rest_r(\d+)/i);
          if (m){ addRest(parseInt(m[1],10)); return; }
          // swim_drill tokens with rest/equipment suffixes: swim_drill_singlearm_4x50yd_r20_fins
          m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|snorkel|buoy))?/i);
          if (m){ const reps=parseInt(m[2],10), each=parseInt(m[3],10); const u=(m[4]||'yd').toLowerCase() as any; const rest=m[5]?parseInt(m[5],10):0; for(let r=0;r<reps;r+=1){ out.push({ effortLabel: 'drill', distanceMeters: toMeters(each, u) }); if(rest && r<reps-1) out.push({ effortLabel:'rest', duration: rest }); } return; }
          m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)(?:_([a-z0-9_]+))?/i);
          if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; for(let r=0;r<reps;r+=1) out.push({ effortLabel: 'drill', distanceMeters: toMeters(each, u) }); return; }
          m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|snorkel|buoy))?/i);
          if (m){ const reps=parseInt(m[2],10), each=parseInt(m[3],10); const u=(m[4]||'yd').toLowerCase() as any; const rest=m[5]?parseInt(m[5],10):0; for(let r=0;r<reps;r+=1){ out.push({ effortLabel: m[1]==='pull'?'pull':'kick', distanceMeters: toMeters(each, u) }); if (rest && r<reps-1) out.push({ effortLabel:'rest', duration: rest }); } return; }
          m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
          if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; const rest=m[4]?parseInt(m[4],10):0; for(let r=0;r<reps;r+=1){ out.push({ effortLabel: 'aerobic', distanceMeters: toMeters(each, u) }); if (rest && r<reps-1) out.push({ effortLabel:'rest', duration: rest }); } return; }
          // Threshold & Interval sets
          m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)_r(\d+)/i);
          if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; const rest=parseInt(m[4],10); for(let r=0;r<reps;r+=1){ out.push({ effortLabel: 'threshold', distanceMeters: toMeters(each, u) }); if (r<reps-1) out.push({ effortLabel:'rest', duration: rest }); } return; }
          m = s.match(/swim_interval_(\d+)x(\d+)(yd|m)_r(\d+)/i);
          if (m){ const reps=parseInt(m[1],10), each=parseInt(m[2],10); const u=(m[3]||'yd').toLowerCase() as any; const rest=parseInt(m[4],10); for(let r=0;r<reps;r+=1){ out.push({ effortLabel: 'interval', distanceMeters: toMeters(each, u) }); if (r<reps-1) out.push({ effortLabel:'rest', duration: rest }); } return; }
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
      // Strict mode: do not auto-add swim warm-up/cool-down; use authored steps only
      if (Array.isArray(resolved) && resolved.length) computedStepsV3 = resolved as any[];
    } catch {}

    const intervalsFromNorm = buildIntervalsFromTokens(Array.isArray((s as any).steps_preset)?(s as any).steps_preset:undefined, mappedType);

    // Build intervals from structured JSON so Garmin can ingest step-by-step
    const intervalsFromStructured = (() => {
      try {
        const ws: any = (s as any).workout_structure;
        if (!ws || typeof ws !== 'object') return undefined;
        const toSec = (v?: string): number => { if (!v || typeof v !== 'string') return 0; const m1=v.match(/(\d+)\s*min/i); if (m1) return parseInt(m1[1],10)*60; const m2=v.match(/(\d+)\s*s/i); if (m2) return parseInt(m2[1],10); return 0; };
        const toMeters = (val: number, unit?: string) => {
          const u = String(unit || '').toLowerCase();
          if (u === 'm') return Math.floor(val);
          if (u === 'yd') return Math.floor(val * 0.9144);
          if (u === 'mi') return Math.floor(val * 1609.34);
          if (u === 'km') return Math.floor(val * 1000);
          return Math.floor(val || 0);
        };
        const resolvePace = (ref: any): string | undefined => {
          if (!ref) return undefined;
          if (typeof ref === 'string') {
            if (/^user\./i.test(ref)) {
              const key = ref.replace(/^user\./i,'');
              const txt = (perfNumbers as any)?.[key];
              return typeof txt === 'string' ? txt : undefined;
            }
            return ref;
          }
          if (ref && typeof ref === 'object' && typeof ref.baseline === 'string') {
            const key = String(ref.baseline).replace(/^user\./i,'');
            const txt = (perfNumbers as any)?.[key];
            if (typeof txt === 'string') {
              const mod = String(ref.modifier||'').trim();
              return mod ? `${txt} ${mod}` : txt;
            }
          }
          return undefined;
        };
        const parsePace = (txt?: string): { sec: number|null, unit?: 'mi'|'km' } => {
          if (!txt) return { sec: null } as any;
          const m = String(txt).trim().match(/(\d+):(\d{2})\s*\/(mi|km)/i);
          if (!m) return { sec: null } as any;
          return { sec: parseInt(m[1],10)*60 + parseInt(m[2],10), unit: m[3].toLowerCase() as any };
        };
        const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
        const tolQual = (exportHints && typeof exportHints.pace_tolerance_quality==='number') ? exportHints.pace_tolerance_quality : 0.04;
        const tolEasy = (exportHints && typeof exportHints.pace_tolerance_easy==='number') ? exportHints.pace_tolerance_easy : 0.06;
        const tolSS = (exportHints && typeof exportHints.power_tolerance_SS_thr==='number') ? exportHints.power_tolerance_SS_thr : 0.05;
        const tolVO2 = (exportHints && typeof exportHints.power_tolerance_VO2==='number') ? exportHints.power_tolerance_VO2 : 0.10;
        const addPaceRange = (step: any, paceTxt?: string, tol = tolQual) => {
          const p = parsePace(paceTxt);
          if (p.sec && p.unit) {
            step.paceTarget = `${mmss(p.sec)}/${p.unit}`;
            step.pace_range = { lower: Math.round(p.sec*(1-tol)), upper: Math.round(p.sec*(1+tol)), unit: p.unit };
          }
        };
        const addPowerRange = (step: any, pctRange?: string, ftp?: number, tol?: number) => {
          if (!pctRange) return;
          const m = String(pctRange).match(/(\d{1,3})\s*[-–]\s*(\d{1,3})\s*%/);
          if (m && typeof ftp === 'number' && isFinite(ftp) && ftp>0) {
            const loPct = parseInt(m[1],10)/100;
            const hiPct = parseInt(m[2],10)/100;
            const lo = Math.round(ftp * loPct);
            const hi = Math.round(ftp * hiPct);
            step.power_range = { lower: lo, upper: hi };
          } else if (m) {
            // No FTP — still include percentage string
            step.powerTarget = `${m[1]}–${m[2]}%`;
          }
        };
        const out: any[] = [];

        const pushWU = (durS: number, disc: string) => {
          if (durS > 0) {
            const step: any = { effortLabel: 'warm up', duration: durS };
            if (disc==='run' && (perfNumbers as any)?.easyPace) addPaceRange(step, (perfNumbers as any).easyPace, tolEasy);
            out.push(step);
          }
        };
        const pushCD = (durS: number, disc: string) => {
          if (durS > 0) {
            const step: any = { effortLabel: 'cool down', duration: durS };
            if (disc==='run' && (perfNumbers as any)?.easyPace) addPaceRange(step, (perfNumbers as any).easyPace, tolEasy);
            out.push(step);
          }
        };
        const discOf = (fallback: string): 'run'|'ride'|'swim'|'strength' => {
          const d = String((s as any).discipline || (s as any).type || fallback || '').toLowerCase();
          if (d === 'run') return 'run'; if (d==='ride'||d==='bike'||d==='cycling') return 'ride'; if (d==='swim') return 'swim'; if (d==='strength') return 'strength'; return 'run';
        };

        const handleSimpleSession = (disc: 'run'|'ride'|'swim'|'strength', type: string, struct: any[]) => {
          for (const seg of struct) {
            const k = String(seg?.type||'').toLowerCase();
            if (k==='warmup') { pushWU(toSec(String(seg?.duration||'')), disc); continue; }
            if (k==='cooldown') { pushCD(toSec(String(seg?.duration||'')), disc); continue; }
            if (type==='interval_session' || (k==='main_set' && String(seg?.set_type||'').toLowerCase()==='intervals')) {
              const reps = Math.max(1, Number(seg?.repetitions)||0);
              const work = seg?.work_segment||{}; const rec = seg?.recovery_segment||{};
              const distTxt = String(work?.distance||'');
              const meters = /m\b/i.test(distTxt) ? toMeters(parseFloat(distTxt), 'm') : undefined;
              const durS = toSec(String(work?.duration||''));
              const restS = toSec(String(rec?.duration||''));
              const paceTxt = disc==='run' ? resolvePace(work?.target_pace) : undefined;
              const workStep: any = { effortLabel: 'interval' };
              if (typeof meters === 'number') workStep.distanceMeters = meters;
              if (!meters && durS>0) workStep.duration = durS;
              if (paceTxt) addPaceRange(workStep, paceTxt, tolQual);
              const segs: any[] = [workStep];
              if (restS>0) {
                const restStep: any = { effortLabel: 'rest', duration: restS };
                if (disc==='run' && (perfNumbers as any)?.easyPace) addPaceRange(restStep, (perfNumbers as any).easyPace, tolEasy);
                segs.push(restStep);
              }
              if (reps > 1) {
                out.push({ effortLabel: 'repeat', repeatCount: reps, segments: segs });
              } else {
                out.push(...segs);
              }
              continue;
            }
            if (type==='bike_intervals' && k==='main_set') {
              const reps = Math.max(1, Number(seg?.repetitions)||0);
              const wsS = toSec(String(seg?.work_segment?.duration||''));
              const rsS = toSec(String(seg?.recovery_segment?.duration||''));
              const rangeTxt: string | undefined = (()=>{ const rng = seg?.work_segment?.target_power?.range; return rng? String(rng) : undefined; })();
              const workStep: any = { effortLabel: 'interval' };
              if (wsS>0) workStep.duration = wsS;
              if (rangeTxt) addPowerRange(workStep, rangeTxt, (perfNumbers as any)?.ftp, tolSS);
              const segs: any[] = [workStep];
              if (rsS>0) segs.push({ effortLabel: 'rest', duration: rsS });
              if (reps > 1) out.push({ effortLabel: 'repeat', repeatCount: reps, segments: segs }); else out.push(...segs);
              continue;
            }
            if (type==='endurance_session' && (k==='main_effort' || k==='main')) {
              const sDur = toSec(String(seg?.duration||''));
              if (sDur>0) {
                const step: any = { effortLabel: 'endurance', duration: sDur };
                if (disc==='run' && (perfNumbers as any)?.easyPace) addPaceRange(step, (perfNumbers as any).easyPace, tolEasy);
                if (disc==='ride' && ws?.structure) {
                  const pow = (seg as any)?.target_power?.range ? String((seg as any).target_power.range) : undefined;
                  if (pow) addPowerRange(step, pow, (perfNumbers as any)?.ftp, tolSS);
                }
                out.push(step);
              }
              continue;
            }
            if (type==='swim_session') {
              if (k==='drill_set') {
                const reps = Number(seg?.repetitions)||0; const dist = String(seg?.distance||''); const yd = /yd/i.test(dist) ? parseInt(dist,10) : Math.round(parseInt(dist,10)/0.9144); const rs = toSec(String(seg?.rest||''));
                for (let r=0;r<Math.max(1,reps);r+=1){ out.push({ effortLabel: 'drill', distanceMeters: toMeters(yd,'yd') }); if (r<reps-1 && rs>0) out.push({ effortLabel:'rest', duration: rs }); }
                continue;
              }
              if (k==='main_set' && String(seg?.set_type||'').toLowerCase().includes('aerobic')) {
                const reps = Number(seg?.repetitions)||0; const dist = String(seg?.distance||''); const yd = /yd/i.test(dist) ? parseInt(dist,10) : Math.round(parseInt(dist,10)/0.9144); const rs = toSec(String(seg?.rest||''));
                for (let r=0;r<Math.max(1,reps);r+=1){ out.push({ effortLabel: 'aerobic', distanceMeters: toMeters(yd,'yd') }); if (r<reps-1 && rs>0) out.push({ effortLabel:'rest', duration: rs }); }
                continue;
              }
            }
          }
        };

        const type = String(ws?.type||'').toLowerCase();
        if (type==='brick_session') {
          let tIdx = 0;
          const processBrickSeg = (seg: any) => {
            const k = String(seg?.type||'').toLowerCase();
            if (k==='transition') { const d = toSec(String(seg?.duration||'')); if (d>0) out.push({ effortLabel: `T${++tIdx}`, duration: d }); return; }
            if (k==='bike_segment') { const d = toSec(String(seg?.duration||'')); if (d>0) { const step:any = { effortLabel: 'bike', duration: d }; const rng = String(seg?.target_power?.range||'')||undefined; if (rng) addPowerRange(step, rng, (perfNumbers as any)?.ftp, tolSS); out.push(step);} return; }
            if (k==='run_segment') { const d = toSec(String(seg?.duration||'')); const pace = resolvePace(seg?.target_pace); if (d>0) { const step:any = { effortLabel: 'run', duration: d }; if (pace) addPaceRange(step, pace, tolEasy); out.push(step);} return; }
            if (k==='swim_segment') { const d = toSec(String(seg?.duration||'')); if (d>0) out.push({ effortLabel: 'swim', duration: d }); return; }
            if (k==='strength_segment') { const d = toSec(String(seg?.duration||'')); if (d>0) out.push({ effortLabel: 'strength', duration: d }); return; }
          };
          for (const seg of (Array.isArray(ws?.structure)? ws.structure : [])) processBrickSeg(seg);
          return out.length ? out : undefined;
        }

        const disc = discOf(String((s as any).discipline||''));
        handleSimpleSession(disc, String(ws?.type||''), Array.isArray(ws?.structure)? ws.structure : []);
        return out.length ? out : undefined;
      } catch { return undefined; }
    })();

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
    let computedTargets = deriveTargetColumns(computedStepsV3, mappedType);

    // Endurance power from FTP when zone suffix present on bike_endurance token
    try {
      if (mappedType === 'ride' && (!computedTargets || computedTargets.primary_target_type === 'none')) {
        const toks = Array.isArray((s as any).steps_preset) ? (s as any).steps_preset.map((t:any)=>String(t).toLowerCase()).join(' ') : '';
        const m = toks.match(/bike_endurance_(\d+)min(?:_(z1(?:-2)?|z2(?:-3)?))?(?:_cad(\d+)(?:-(\d+))?)?/i);
        if (m) {
          const zone = (m[2]||'').toLowerCase();
          const ftp: number | undefined = typeof (perfNumbers as any)?.ftp === 'number' ? (perfNumbers as any).ftp : undefined;
          if (ftp && (zone==='z1' || zone==='z1-2' || zone==='z2' || zone==='z2-3')) {
            const pct = zone.startsWith('z1') ? [0.60, 0.65] : [0.65, 0.75];
            const lo = Math.round(ftp * pct[0]);
            const hi = Math.round(ftp * pct[1]);
            computedTargets = { primary_target_type: 'power', power_low: lo, power_high: hi } as any;
          }
        }
      }
    } catch {}

    // Build structured strength exercises from st_* tokens
    const strengthFromTokens = (stepsPreset?: any[]): any[] | undefined => {
      if (mappedType !== 'strength') return undefined;
      const steps: string[] = Array.isArray(stepsPreset) ? stepsPreset.map((t:any)=>String(t)) : [];
      if (!steps.length) return undefined;
      const ex: any[] = [];
      const toTitle = (slug: string) => slug.split('_').map(w => w.length? w[0].toUpperCase()+w.slice(1) : '').join(' ').replace(/Ohp/i,'Overhead Press').replace(/Bw/i,'BW');
      const pick1RM = (name: string): number | undefined => {
        const n = name.toLowerCase();
        if (n.includes('dead')) return perfNumbers?.deadlift;
        if (n.includes('bench') || n.includes('pull-up')|| n.includes('pullup')|| n.includes('row')) return perfNumbers?.bench;
        // Anchor shoulder accessories to overhead press
        if (n.includes('overhead') || n.includes('ohp') || n.includes('press') || n.includes('lateral raise') || n.includes('front raise') || n.includes('rear delt')) {
          return perfNumbers?.overheadPress1RM || perfNumbers?.overhead;
        }
        return perfNumbers?.squat;
      };
      const round5 = (n:number) => Math.round(n/5)*5;
      const repBracketScale = (repsVal: number): number => {
        if (!Number.isFinite(repsVal)) return 1;
        if (repsVal <= 6) return 1.05;
        if (repsVal <= 9) return 1.00;
        if (repsVal <= 12) return 0.95;
        if (repsVal <= 15) return 0.90;
        return 0.85;
      };
      const estimateFromHeuristic = (slug: string, repsNum: number | undefined): number | undefined => {
        const s = slug.toLowerCase();
        const scaleByReps = repBracketScale(typeof repsNum==='number'? repsNum : 10);
        const anchor = (kind: 'squat'|'bench'|'deadlift'|'overhead'): number | undefined => {
          if (kind==='squat') return perfNumbers?.squat;
          if (kind==='bench') return perfNumbers?.bench;
          if (kind==='deadlift') return perfNumbers?.deadlift;
          return perfNumbers?.overheadPress1RM || perfNumbers?.overhead;
        };
        let est: number | undefined;
        if (s.includes('barbell_row')) {
          const orm = anchor('bench'); if (orm) est = orm * 0.90;
        } else if (s.includes('t_bar_row')) {
          const orm = anchor('bench'); if (orm) est = orm * 0.80;
        } else if (s.includes('chest_supported_row') || s.includes('cable_row')) {
          const orm = anchor('bench'); if (orm) est = orm * 0.65;
        } else if (s.includes('lat_pulldown')) {
          const orm = anchor('bench'); if (orm) est = orm * 0.65;
        } else if (s.includes('hip_thrust')) {
          const orm = anchor('deadlift'); if (orm) est = orm * 0.80;
        } else if (s.includes('glute_bridge')) {
          const orm = anchor('deadlift'); if (orm) est = orm * 0.60;
        } else if (s.includes('good_mornings') || s.includes('good_morning')) {
          const orm = anchor('deadlift'); if (orm) est = orm * 0.45;
        } else if (s.includes('leg_curl')) {
          const orm = anchor('deadlift'); if (orm) est = orm * 0.40;
        } else if (s.includes('bulgarian_split_squat')) {
          const orm = anchor('squat'); if (orm) est = orm * 0.30;
        } else if (s.includes('walking_lunge') || s.includes('reverse_lunge') || s.includes('step_ups') || s.includes('step_ups') || s.includes('step_ups')) {
          const orm = anchor('squat'); if (orm) est = orm * 0.25;
        } else if (s.includes('goblet_squat')) {
          const orm = anchor('squat'); if (orm) est = orm * 0.30;
        } else if (s.includes('leg_press')) {
          const orm = anchor('squat'); if (orm) est = orm * 1.40;
        }
        if (typeof est === 'number' && isFinite(est)) return round5(est * scaleByReps);
        return undefined;
      };
      for (const tok of steps){
        const t = tok.toLowerCase();
        if (!/^st_/.test(t)) continue;
        // st_main_bench_press_4x6_@pct75-80_rest120 and st_core_* variants
        const m = t.match(/^st_(?:main|acc|core)_([^@]+?)_(\d+)x(\d+)(s)?(?:_@pct(\d{1,3})(?:-(\d{1,3}))?)?(?:_rest(\d+))?$/i);
        if (m){
          const slug = m[1].replace(/_rest\d+$/,'');
          const sets = parseInt(m[2],10);
          const repsRaw = m[3];
          const repsIsTime = !!m[4];
          const reps = repsIsTime ? `${parseInt(repsRaw,10)}s` : parseInt(repsRaw,10);
          const pctLo = m[5]?parseInt(m[5],10):undefined;
          const pctHi = m[6]?parseInt(m[6],10):undefined;
          const rest = m[7]?parseInt(m[7],10):undefined;
          const name = toTitle(slug.replace(/_/g,' '));
          const orm = pick1RM(name);
          const pct = (typeof pctLo==='number' && typeof pctHi==='number') ? ((pctLo+pctHi)/2) : pctLo;
          let est = (typeof orm==='number' && typeof pct==='number') ? round5(orm*(pct/100)) : undefined;
          if (typeof est === 'undefined' && !repsIsTime) {
            const repsNum = typeof reps === 'number' ? reps : undefined;
            est = estimateFromHeuristic(slug, repsNum);
          }
          ex.push({ name, sets, reps, percent: pctLo && pctHi ? `${pctLo}-${pctHi}%` : (pctLo? `${pctLo}%`: undefined), rest_s: rest, est_load_lb: est });
        }
        // st_wu_5 → warm-up minutes; st_cool_3 → cool-down
        const wu = t.match(/^st_wu_(\d{1,2})$/);
        if (wu) { ex.push({ name: 'General Warm-up', sets: 1, reps: parseInt(wu[1],10), unit: 'min' }); continue; }
        const cool = t.match(/^st_cool_(\d{1,2})$/);
        if (cool) { ex.push({ name: 'Cool-down', sets: 1, reps: parseInt(cool[1],10), unit: 'min' }); continue; }
      }
      // Shorthand accessories (row_4x6_8, chinups_3xAMRAP_RIR2, rollouts_3x15, lunges_3x10, pushups_3x15)
      for (const tok of steps){
        const t = tok.toLowerCase();
        // row_4x6_8
        let m = t.match(/^row_(\d+)x(\d+)(?:-(\d+))?$/);
        if (m) { const sets=parseInt(m[1],10); const repsLo=parseInt(m[2],10); const repsHi=m[3]?parseInt(m[3],10):undefined; const name='Barbell Row'; const orm = pick1RM(name); const est = typeof orm==='number'? Math.round(orm*0.9/5)*5 : undefined; ex.push({ name, sets, reps: repsHi?`${repsLo}-${repsHi}`:repsLo, rest_s: 90, est_load_lb: est }); continue; }
        // chinups_3xAMRAP_RIR2
        m = t.match(/^chinups_(\d+)xamrap(?:_rir(\d+))?$/);
        if (m) { const sets=parseInt(m[1],10); const rir = m[2]?parseInt(m[2],10):2; ex.push({ name:'Chin-ups', sets, reps: 'AMRAP', rir, rest_s: 120 }); continue; }
        // pullups_3xAMRAP (optional _RIRn)
        m = t.match(/^pullups_(\d+)xamrap(?:_rir(\d+))?$/);
        if (m) { const sets=parseInt(m[1],10); const rir = m[2]?parseInt(m[2],10):2; ex.push({ name:'Pull-ups', sets, reps: 'AMRAP', rir, rest_s: 120 }); continue; }
        // rollouts_3x15
        m = t.match(/^rollouts_(\d+)x(\d+)$/);
        if (m) { ex.push({ name:'Ab Rollouts', sets: parseInt(m[1],10), reps: parseInt(m[2],10), rest_s: 90 }); continue; }
        // lunges_3x10
        m = t.match(/^lunges_(\d+)x(\d+)$/);
        if (m) { ex.push({ name:'Walking Lunges', sets: parseInt(m[1],10), reps: `${parseInt(m[2],10)} each`, rest_s: 90 }); continue; }
        // pushups_3x15
        m = t.match(/^pushups_(\d+)x(\d+)$/);
        if (m) { ex.push({ name:'Push-ups', sets: parseInt(m[1],10), reps: parseInt(m[2],10), rest_s: 75 }); continue; }
        // dips_3x10
        m = t.match(/^dips_(\d+)x(\d+)$/);
        if (m) { ex.push({ name:'Dips', sets: parseInt(m[1],10), reps: parseInt(m[2],10), rest_s: 90 }); continue; }
      }
      return ex.length? ex: undefined;
    };
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

    // Ride-friendly rendered description: prefer power over pace for bikes
    if (mappedType === 'ride') {
      try {
        const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
        const durTxt = (totalDurSeconds>0 ? mmss(totalDurSeconds) : (typeof s?.duration === 'number' && s.duration>0 ? mmss(s.duration*60) : null));
        const tgt = computedTargets as any;
        let powTxt: string | null = null;
        if (tgt && tgt.primary_target_type === 'power') {
          if (typeof tgt.power_low === 'number' && typeof tgt.power_high === 'number' && tgt.power_low>0 && tgt.power_high>0) {
            powTxt = `${tgt.power_low}–${tgt.power_high}W`;
          } else if (typeof tgt.power_target_watts === 'number' && tgt.power_target_watts>0) {
            powTxt = `${tgt.power_target_watts}W`;
          }
        }
        // If no power targets, keep existing rendered but strip any run-style pace suffix like "@ mm:ss/mi"
        // Strip any run-style pace suffix like "@ 10:30/mi", "@10:30 / km", or bare "@ 10:30"
        const stripRunPace = (txt:string) => txt
          .replace(/@\s*\d{1,2}:\d{2}\s*\/\s*(mi|km)/gi, '')
          .replace(/@\s*\d{1,2}:\d{2}(?![^])/gi, '')
          .trim();
        if (durTxt) {
          rendered = `1 × ${durTxt}${powTxt?` @ ${powTxt}`:''}`;
        } else {
          rendered = stripRunPace(String(rendered||''));
          if (powTxt) rendered = `${rendered}${rendered ? ' ' : ''}@ ${powTxt}`.trim();
        }
      } catch {}
    }

    // PoC: do not fail if computed steps are missing; we'll insert minimal computed with duration only
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
      // tags stored in DB via a separate column in some deployments; omit from typed row here
      steps_preset: Array.isArray(s?.steps_preset) ? s.steps_preset : null,
      export_hints: exportHints || null,
      // If we successfully computed steps, clear rendered_description so UI uses rich steps
      rendered_description: (computedStepsV3 && computedStepsV3.length) ? null : rendered,
      computed: { normalization_version: 'v3', steps: (computedStepsV3 && computedStepsV3.length ? computedStepsV3 : undefined), total_duration_seconds: totalDurSeconds },
      // New fast-path columns for Weekly/Planned
      workout_structure: (s as any).workout_structure || null,
      workout_title: ((s as any)?.workout_structure?.title || (s as any)?.title) || null,
      friendly_summary: rendered || null,
      total_duration_seconds: (totalDurSeconds && totalDurSeconds>0) ? totalDurSeconds : (totalSeconds && totalSeconds>0 ? totalSeconds : null),
      // optional analytic columns are inserted via DB defaults elsewhere; omit from typed row
      // primary_target_type, pace/power fields, equipment are optional and may not exist in this deployment
      units: unitsPref,
      intensity: typeof s.intensity === 'object' ? s.intensity : undefined,
      // Always generate per-rep intervals from computed V3 when available; else use token/normalized fallback
      intervals: (computedStepsV3 && computedStepsV3.length)
        ? buildIntervalsFromComputed(computedStepsV3 as any)
        : (intervalsFromStructured || intervalsFromNorm),
      strength_exercises: (Array.isArray(s.strength_exercises) ? s.strength_exercises : undefined) || strengthFromTokens(s.steps_preset),
    });
  }

  if (rows.length === 0) return { inserted: 0 };
  const { error: insErr } = await supabase.from('planned_workouts').insert(rows as any);
  if (insErr) throw insErr;
  return { inserted: rows.length };
}


