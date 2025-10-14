import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getLibraryPlan } from '@/services/LibraryPlans';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import { expandSession, DEFAULTS_FALLBACK } from '@/services/plans/plan_dsl';
import { augmentPlan } from '@/services/plans/tools/plan_bake_and_compute';

function computeNextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (8 - day) % 7 || 7;
  const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  // format local YYYY-MM-DD
  const y = nm.getFullYear();
  const m = String(nm.getMonth() + 1).padStart(2,'0');
  const dd = String(nm.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// Build a lightweight preview from a tri blueprint (no persistence)
function composePreviewFromBlueprint(template: any, targetWeeks: number): Record<string, any[]> {
  try {
    const bp = template?.phase_blueprint || {};
    const blocks = template?.blocks || {};
    const order: string[] = Array.isArray(bp.order) ? bp.order.map((s:string)=>String(s).toLowerCase()) : ['build','peak','taper'];
    const fixed = {
      peak: (bp?.peak?.fixed && Number.isFinite(bp.peak.fixed)) ? Math.max(0, bp.peak.fixed) : 0,
      taper: (bp?.taper?.fixed && Number.isFinite(bp.taper.fixed)) ? Math.max(0, bp.taper.fixed) : 0,
    };
    const buildWeeks = Math.max(0, targetWeeks - fixed.peak - fixed.taper);
    const peakBlocks: string[] = Array.isArray(bp?.peak?.blocks) ? bp.peak.blocks : [];
    const taperBlocks: string[] = Array.isArray(bp?.taper?.blocks) ? bp.taper.blocks : [];
    const buildRef: string | undefined = (bp?.build?.block_ref || bp?.build?.ref || 'block_build');

    const weekBlocks: string[] = [];
    // Respect order: build → peak → taper
    order.forEach(phase => {
      if (phase === 'build') {
        for (let i=0;i<buildWeeks;i+=1) weekBlocks.push(buildRef || '');
      } else if (phase === 'peak') {
        for (let i=0;i<fixed.peak;i+=1) weekBlocks.push(peakBlocks[i % Math.max(1, peakBlocks.length)] || '');
      } else if (phase === 'taper') {
        for (let i=0;i<fixed.taper;i+=1) weekBlocks.push(taperBlocks[i % Math.max(1, taperBlocks.length)] || '');
      }
    });

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const inferDisc = (kind: string): string => {
      const k = String(kind||'').toLowerCase();
      if (k.startsWith('run_')) return 'run';
      if (k.startsWith('bike_')) return 'ride';
      if (k.startsWith('swim_')) return 'swim';
      if (k.startsWith('strength_')) return 'strength';
      return 'session';
    };
    const sessionsByWeek: Record<string, any[]> = {};
    weekBlocks.forEach((bid, idx) => {
      const block = blocks[bid] || {};
      const sessSpec = block.sessions || {};
      const week: any[] = [];
      Object.keys(sessSpec).forEach(dow => {
        const arr: any[] = Array.isArray(sessSpec[dow]) ? sessSpec[dow] : [];
        arr.forEach((s:any) => {
          const desc = String(s.main || s.scheme || s.kind || '').trim();
          week.push({ day: cap(dow), discipline: inferDisc(String(s.kind||'')), description: desc });
        });
      });
      // Stable display order
      const orderIdx = (d:string)=> DAYS.indexOf(cap(d));
      week.sort((a,b)=> orderIdx(a.day) - orderIdx(b.day));
      sessionsByWeek[String(idx+1)] = week;
    });
    return sessionsByWeek;
  } catch { return {}; }
}

// Compose actionable sessions_by_week from tri blueprint with tokenized steps
function composeSessionsFromBlueprint(template: any, totalWeeks: number): Record<string, any[]> {
  try {
    const bp = template?.phase_blueprint || {};
    const blocks = template?.blocks || {};
    const order: string[] = Array.isArray(bp.order) ? bp.order.map((s:string)=>String(s).toLowerCase()) : ['build','peak','taper'];
    const fixed = {
      peak: (bp?.peak?.fixed && Number.isFinite(bp.peak.fixed)) ? Math.max(0, bp.peak.fixed) : 0,
      taper: (bp?.taper?.fixed && Number.isFinite(bp.taper.fixed)) ? Math.max(0, bp.taper.fixed) : 0,
    };
    const buildWeeks = Math.max(0, totalWeeks - fixed.peak - fixed.taper);
    const peakBlocks: string[] = Array.isArray(bp?.peak?.blocks) ? bp.peak.blocks : [];
    const taperBlocks: string[] = Array.isArray(bp?.taper?.blocks) ? bp.taper.blocks : [];
    const buildRef: string | undefined = (bp?.build?.block_ref || bp?.build?.ref || 'block_build');

    const weekBlocks: string[] = [];
    order.forEach(phase => {
      if (phase === 'build') {
        for (let i=0;i<buildWeeks;i+=1) weekBlocks.push(buildRef || '');
      } else if (phase === 'peak') {
        for (let i=0;i<fixed.peak;i+=1) weekBlocks.push(peakBlocks[i % Math.max(1, peakBlocks.length)] || '');
      } else if (phase === 'taper') {
        for (let i=0;i<fixed.taper;i+=1) weekBlocks.push(taperBlocks[i % Math.max(1, taperBlocks.length)] || '');
      }
    });

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const inferDisc = (kind: string): 'run'|'ride'|'swim'|'strength' => {
      const k = String(kind||'').toLowerCase();
      if (k.startsWith('run_') || k==='run_openers' || k==='run_brick_easy' || k==='run_tempo' || k==='run_easy' || k==='run_long' || k==='shakeout') return 'run';
      if (k.startsWith('bike_') || k==='race_rehearsal_bike' || k==='bike_openers' || k==='bike_sharpen' || k==='bike_easy' || k==='bike_tempo' || k==='bike_long_progressive') return 'ride';
      if (k.startsWith('swim_') || k==='swim_open_water_or_pool') return 'swim';
      return 'strength';
    };
    const kindToTokens = (kind: string, variant: any): string[] => {
      const k = String(kind||'').toLowerCase();
      if (k === 'bike_intervals') return ['warmup_bike_quality_15min_fastpedal','bike_vo2_6x5min_R3min','cooldown_bike_easy_10min'];
      if (k === 'bike_tempo') return ['warmup_bike_quality_15min_fastpedal','bike_thr_2x20min_R5min','cooldown_bike_easy_10min'];
      if (k === 'bike_long_progressive') return ['bike_endurance_120min'];
      if (k === 'bike_easy' || k === 'bike_sharpen' || k==='bike_openers') return ['bike_endurance_60min'];
      if (k === 'race_rehearsal_bike') return ['bike_endurance_180min'];
      if (k === 'run_intervals') return ['warmup_run_quality_12min','interval_6x800m_5kpace_R2min','cooldown_easy_10min'];
      if (k === 'run_tempo') return ['warmup_run_quality_12min','tempo_4mi','cooldown_easy_10min'];
      if (k === 'run_openers') return ['strides_6x20s'];
      if (k === 'run_brick_easy' || k==='shakeout') return ['longrun_20min'];
      if (k === 'run_easy') return ['longrun_40min'];
      if (k === 'run_long') return ['longrun_90min'];
      if (k === 'swim_technique' || k==='swim_easy_tech') return ['swim_warmup_200yd_easy','swim_drills_4x50yd_catchup','swim_drills_4x50yd_singlearm','swim_pull_2x100yd','swim_kick_2x100yd','swim_cooldown_200yd_easy'];
      if (k === 'swim_intervals') return ['swim_warmup_200yd_easy','swim_aerobic_10x100yd','swim_cooldown_200yd_easy'];
      if (k === 'swim_steady' || k==='swim_open_water_or_pool' || k==='swim_easy') return ['swim_warmup_200yd_easy','swim_aerobic_6x200yd','swim_cooldown_200yd_easy'];
      // Strength kinds do not use steps tokens
      return [];
    };
    const addTags = (k: string): string[] => {
      const t: string[] = [];
      const x = k.toLowerCase();
      if (x === 'run_long') t.push('long_run');
      if (x === 'bike_long_progressive') t.push('long_ride');
      if (x === 'strength_lower') t.push('strength_lower');
      return t;
    };

    const sessionsByWeek: Record<string, any[]> = {};
    weekBlocks.forEach((bid, idx) => {
      const block = blocks[bid] || {};
      const sessSpec = block.sessions || {};
      const week: any[] = [];
      Object.keys(sessSpec).forEach(dow => {
        const arr: any[] = Array.isArray(sessSpec[dow]) ? sessSpec[dow] : [];
        arr.forEach((s:any, si:number) => {
          const day = cap(dow);
          const disc = inferDisc(String(s.kind||''));
          const tokens = kindToTokens(String(s.kind||''), s);
          const tags = addTags(String(s.kind||''));
          const descr = String(s.main || s.scheme || s.kind || '').trim();
          const out: any = { day, discipline: disc, description: descr };
          if (tokens.length) out.steps_preset = tokens;
          if (tags.length) out.tags = tags;
          week.push(out);
        });
      });
      const orderIdx = (d:string)=> DAYS.indexOf(cap(d));
      week.sort((a,b)=> orderIdx(a.day) - orderIdx(b.day));
      sessionsByWeek[String(idx+1)] = week;
    });
    return sessionsByWeek;
  } catch { return {}; }
}

function inferDisciplineFromDescription(desc?: string): string | null {
  if (!desc) return null;
  const t = desc.toLowerCase();
  if (/\brun\b/.test(t)) return 'run';
  if (/\b(bike|ride|cycling)\b/.test(t)) return 'ride';
  if (/\bswim\b/.test(t)) return 'swim';
  if (/\bstrength\b|squat|deadlift|bench|ohp/.test(t)) return 'strength';
  return null;
}
function isRun(s: any) {
  const d = (s.discipline||s.type||'')?.toLowerCase();
  return d==='run' || inferDisciplineFromDescription(s.description)==='run';
}
function isRide(s: any) {
  const d = (s.discipline||s.type||'')?.toLowerCase();
  return d==='ride'||d==='bike'||d==='cycling' || inferDisciplineFromDescription(s.description)==='ride';
}
function isStrength(s: any) {
  const d = (s.discipline||s.type||'')?.toLowerCase();
  return d==='strength' || inferDisciplineFromDescription(s.description)==='strength';
}
function hasTag(s: any, t: string) { return Array.isArray(s.tags) && s.tags.includes(t); }

function remapForPreferences(plan: any, prefs: { longRunDay: string; longRideDay: string; includeStrength: boolean }) {
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const dayIndex = (d: string) => DAYS.indexOf(d);
  const idxDay = (i: number) => DAYS[(i+7)%7];
  const hoursBetween = (a: string, b: string) => {
    const ia = dayIndex(a); const ib = dayIndex(b); if (ia<0||ib<0) return 9999; const diff = Math.abs(ib-ia); const min = Math.min(diff, 7-diff); return min*24;
  };
  const cloneSessions = (arr: any[]) => arr.map(s => ({ ...s, tags: Array.isArray(s.tags)?[...s.tags]:[], _origDay: s.day }));
  const isOptional = (s: any) => Array.isArray(s?.tags) && s.tags.some((t: any) => String(t).toLowerCase()==='optional');
  const hasXor = (s: any) => Array.isArray(s?.tags) && s.tags.some((t: any) => /^xor:/i.test(String(t)));
  const isIntervals = (s: any) => /interval|cruise|1mi|800m/i.test(String(s.description||''));
  const isTempo = (s: any) => /tempo|mp\b/i.test(String(s.description||''));
  const ensureTag = (s: any, t: string) => { if (!Array.isArray(s.tags)) s.tags=[]; if (!s.tags.includes(t)) s.tags.push(t); };
  const isHard = (s: any) => hasTag(s,'long_run')||hasTag(s,'hard_run')||hasTag(s,'bike_intensity')||hasTag(s,'strength_lower')||hasTag(s,'long_ride');
  const inferTags = (s: any) => {
    const text = String(s.description||'');
    if (/\b(Intervals|Cruise|1mi|800m)\b/i.test(text)) ensureTag(s,'hard_run');
    if (/\bTempo\b|MP\b/i.test(text)) ensureTag(s,'hard_run');
    if (/\b(VO2|Threshold|Sweet Spot)\b/i.test(text)) ensureTag(s,'bike_intensity');
    if (/squat|deadlift/i.test(text)) ensureTag(s,'strength_lower');
  };
  const moveTo = (s: any, day: string) => { s.day = day; };
  const canPlace = (sessions: any[], s: any, day: string) => {
    // No other hard sessions that day
    return !sessions.some(x => x !== s && x.day === day && isHard(x));
  };
  const findByTag = (arr: any[], tag: string) => arr.find(x => (Array.isArray(x.tags)&&x.tags.includes(tag)));
  const wednesdayRunIsAerobic = (arr: any[]) => arr.some(x => x.day==='Wednesday' && (isRun(x) && !hasTag(x,'hard_run')));
  const isDeloadWeek = (arr: any[]) => arr.some(ss => /deload/i.test(String(ss.description||'')) || hasTag(ss,'deload'));
  const emitNote = (bucket: Record<string,string[]>, key: string, msg: string) => { (bucket[key] = bucket[key] || []).push(msg); };

  const out: any = { ...plan, sessions_by_week: {} };
  if (plan && plan.notes_by_week) out.notes_by_week = plan.notes_by_week;
  const notesByWeek: Record<string,string[]> = { ...(out.notes_by_week||{}) };
  // Ensure weekly header from ui_text is present at notes_by_week[w][0]
  try {
    const header: string | undefined = (plan?.ui_text && typeof plan.ui_text.optional_header === 'string') ? String(plan.ui_text.optional_header) : undefined;
    if (header && header.trim().length > 0) {
      const weekKeys = Object.keys(plan?.sessions_by_week || {});
      for (const wk of weekKeys) {
        const arr: string[] = Array.isArray(notesByWeek[wk]) ? [...notesByWeek[wk]] : [];
        if (arr[0] !== header) arr.unshift(header);
        notesByWeek[wk] = arr;
      }
    }
  } catch {}

  for (const [wk, sessions] of Object.entries<any>(plan.sessions_by_week || {})) {
    const s = cloneSessions(sessions as any[]);
    const deload = isDeloadWeek(s);
    // Infer missing tags
    s.forEach(inferTags);
    // Pin long days
    // Pin long days to user-chosen anchors (defaults now come from authored days)
    const lr = findByTag(s,'long_run'); if (lr) moveTo(lr, prefs.longRunDay);
    const lrd = findByTag(s,'long_ride'); if (lrd) moveTo(lrd, prefs.longRideDay);

    // Bike intensity vs long ride — no fallback moves/downgrades; flag conflicts only
    const bike = findByTag(s,'bike_intensity');
    if (bike && !isOptional(bike) && !hasXor(bike)) {
      const longRide = findByTag(s,'long_ride');
      if (longRide) {
        const hrs = hoursBetween(bike.day, longRide.day);
        if (hrs < 36 && !deload) emitNote(notesByWeek, wk, `Authoring conflict: Bike intensity (${bike.day}) is within ${hrs}h of long ride (${longRide.day}).`);
      }
    }

    // Strength gaps — do not move; flag conflicts only
    const strength = s.filter(x => hasTag(x,'strength_lower'));
    const longRun = findByTag(s,'long_run'); const longRide = findByTag(s,'long_ride');
    for (const st of strength) {
      if (longRun) {
        const hrs = hoursBetween(st.day,longRun.day);
        if (hrs < 48 && !deload) emitNote(notesByWeek, wk, `Authoring conflict: Lower‑body strength (${st.day}) is within ${hrs}h of long run (${longRun.day}).`);
      }
      if (longRide) {
        const hrs = hoursBetween(st.day,longRide.day);
        if (hrs < 36 && !deload) emitNote(notesByWeek, wk, `Authoring conflict: Lower‑body strength (${st.day}) is within ${hrs}h of long ride (${longRide.day}).`);
      }
    }

    // Hard runs vs long run — do not move; flag conflicts only
    const hardRuns = s.filter(x => hasTag(x,'hard_run') && !isOptional(x) && !hasXor(x));
    for (const hr of hardRuns) {
      if (longRun) {
        const hrs = hoursBetween(hr.day,longRun.day);
        if (hrs < 24 && !deload) emitNote(notesByWeek, wk, `Authoring conflict: Hard run (${hr.day}) is within ${hrs}h of long run (${longRun.day}).`);
      }
    }

    // Final same-day collisions — do not adjust; flag conflicts only
    for (const d of DAYS) {
      const dayHard = s.filter(x => x.day===d && isHard(x) && !isOptional(x) && !hasXor(x));
      if (dayHard.length > 1 && !deload) {
        emitNote(notesByWeek, wk, `Authoring conflict: Multiple hard sessions scheduled on ${d}.`);
      }
    }

    const filtered = prefs.includeStrength ? s : s.filter(ss => !isStrength(ss) || hasTag(ss,'mandatory_strength'));
    out.sessions_by_week[wk] = filtered;
  }
  if (Object.keys(notesByWeek).length) out.notes_by_week = notesByWeek;
  try {
    const snapshot: any = { chosenDays: { longRun: prefs.longRunDay, longRide: prefs.longRideDay }, weeks: {} };
    for (const [wk, wkSessions] of Object.entries<any>(out.sessions_by_week || {})) {
      snapshot.weeks[wk] = (wkSessions as any[]).map(ss => ({ name: ss.name || ss.description || '', day: ss.day, tags: ss.tags }));
    }
    
  } catch {}
  return out;
}

export default function PlanSelect() {
  const [sp] = useSearchParams();
  const id = sp.get('id');
  const navigate = useNavigate();
  const { addPlan, loadUserBaselines, refreshPlans } = useAppContext();
  
  
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [libPlan, setLibPlan] = useState<any|null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [startEdited, setStartEdited] = useState<boolean>(false);
  const [raceDate, setRaceDate] = useState<string>('');
  const [strengthTrack, setStrengthTrack] = useState<string>('');
  // Default to authored anchors; we will set these after loading the plan
  const [longRunDay, setLongRunDay] = useState<string>('');
  const [longRideDay, setLongRideDay] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [baselines, setBaselines] = useState<any|null>(null);
  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const byDay = (a: any, b: any) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
  const cleanDesc = (text: string) => String(text || '').replace(/\[(?:cat|plan):[^\]]+\]\s*/gi, '');

  // Load user baselines when component mounts
  useEffect(() => {
    // Only run if loadUserBaselines is a function
    if (typeof loadUserBaselines !== 'function') {
      // Try direct database call as fallback
      (async () => {
        try {
          const { supabase } = await import('@/lib/supabase');
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data, error } = await supabase.from('user_baselines').select('*').eq('user_id', user.id).single();
            if (data) {
              setBaselines(data);
            }
          }
        } catch (e) {
        }
      })();
      return;
    }
    
    (async () => {
      try {
        // Check auth status first
        const { supabase } = await import('@/lib/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setBaselines(null);
          return;
        }
        
        // Try loadUserBaselines first
        const b = await loadUserBaselines();
        
        if (b) {
          setBaselines(b);
        } else {
          
          // Fallback: direct database call
          try {
            const { data, error } = await supabase.from('user_baselines').select('*').eq('user_id', user.id).single();
            if (data) {
              setBaselines(data);
            } else {
              setBaselines(null);
            }
          } catch (e) {
            setBaselines(null);
          }
        }
      } catch (e) {
        setBaselines(null);
      }
    })();
  }, [loadUserBaselines]);

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setError('Missing plan id'); setLoading(false); return; }
        const p = await getLibraryPlan(id);
        if (!p) { setError('Plan not found'); setLoading(false); return; }
        setLibPlan(p);
        // Initialize default anchors from authored JSON (first occurrence each week)
        try {
          const sbw = p?.template?.sessions_by_week || {};
          const w1 = sbw?.['1'] || [];
          const findDay = (tag: string, fallback: string) => {
            const sess = (w1 as any[]).find(s => Array.isArray(s?.tags) && s.tags.includes(tag));
            return (sess && sess.day) ? String(sess.day) : fallback;
          };
          setLongRunDay(prev => prev || findDay('long_run', 'Sunday'));
          setLongRideDay(prev => prev || findDay('long_ride', 'Saturday'));
        } catch {}
        setStartDate(computeNextMonday());
        setLoading(false);
      } catch (e: any) {
        setError(e.message || 'Failed to load plan');
        setLoading(false);
      }
    })();
  }, [id]);

  // Tri acceptance variables derived from template (if present)
  const triVars = useMemo(() => {
    const t = libPlan?.template || {};
    const minWeeks = typeof t.min_weeks === 'number' ? t.min_weeks : null;
    const maxWeeks = typeof t.max_weeks === 'number' ? t.max_weeks : null;
    const blueprint = t.phase_blueprint || null;
    const strengthTracks = Array.isArray(t.strength_tracks) ? t.strength_tracks : [];
    return { minWeeks, maxWeeks, blueprint, strengthTracks } as { minWeeks: number|null; maxWeeks: number|null; blueprint: any; strengthTracks: string[] };
  }, [libPlan]);

  // Compute weeks_to_race from user-provided start_date (if edited) to race_date
  const weeksToRace = useMemo(() => {
    try {
      if (!raceDate) return null;
      const mondayOf = (iso: string): string => {
        const p = iso.split('-').map(x=>parseInt(x,10));
        const d = new Date(p[0], (p[1]||1)-1, p[2]||1);
        const jsDow = d.getDay();
        const daysFromMonday = (jsDow + 6) % 7;
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday);
        const y = mon.getFullYear();
        const m = String(mon.getMonth()+1).padStart(2,'0');
        const dd = String(mon.getDate()).padStart(2,'0');
        return `${y}-${m}-${dd}`;
      };
      const startIso = (startDate && startDate.trim().length>0) ? startDate : (()=>{ const t=new Date(); const y=t.getFullYear(); const m=String(t.getMonth()+1).padStart(2,'0'); const d=String(t.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; })();
      const rdMon = mondayOf(raceDate);
      const stMon = mondayOf(startIso);
      const toLocalMs = (iso: string) => { const p = iso.split('-').map(x=>parseInt(x,10)); const d = new Date(p[0], (p[1]||1)-1, p[2]||1); return d.getTime(); };
      const diffDays = Math.ceil((toLocalMs(rdMon) - toLocalMs(stMon)) / 86400000);
      const w = Math.ceil(diffDays / 7);
      return Math.max(0, w);
    } catch { return null; }
  }, [raceDate, startDate, startEdited]);

  const validationMsg = useMemo(() => {
    try {
      const minW = triVars.minWeeks; const maxW = triVars.maxWeeks;
      if (!raceDate) return null;
      const toJs = (iso: string) => { const p = iso.split('-').map(x=>parseInt(x,10)); return new Date(p[0], (p[1]||1)-1, p[2]||1); };
      if (startDate && toJs(startDate) > toJs(raceDate)) return 'Race date must be after start date.';
      return null;
    } catch { return null; }
  }, [raceDate, startDate, weeksToRace, triVars.minWeeks, triVars.maxWeeks]);

  // Optional auto-derive start Monday ONLY if user hasn't set any start date (keep user's date stable)
  useEffect(() => {
    const minW = triVars.minWeeks, maxW = triVars.maxWeeks;
    if (!raceDate || !weeksToRace || !minW || !maxW) return;
    if (weeksToRace < minW || weeksToRace > maxW) return;
    if (startEdited) return; // respect user's explicit start selection
    if (startDate) return; // if we already have a start date (default or chosen), don't shift it
    const mondayOf = (iso: string): string => {
      const p = iso.split('-').map(x=>parseInt(x,10));
      const d = new Date(p[0], (p[1]||1)-1, p[2]||1);
      const jsDow = d.getDay();
      const daysFromMonday = (jsDow + 6) % 7;
      const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday);
      const y = mon.getFullYear();
      const m = String(mon.getMonth()+1).padStart(2,'0');
      const dd = String(mon.getDate()).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    };
    const addDays = (iso: string, n: number): string => {
      const p = iso.split('-').map(x=>parseInt(x,10));
      const base = new Date(p[0], (p[1]||1)-1, p[2]||1);
      base.setDate(base.getDate() + n);
      const y = base.getFullYear();
      const m = String(base.getMonth()+1).padStart(2,'0');
      const dd = String(base.getDate()).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    };
    // Last week Monday is Monday of race week; start Monday is that minus (weeksToRace-1)*7 days
    const lastWeekMonday = mondayOf(raceDate);
    const startMonday = addDays(lastWeekMonday, -7 * ((weeksToRace || 1) - 1));
    setStartDate(startMonday);
  }, [raceDate, weeksToRace, triVars.minWeeks, triVars.maxWeeks, startEdited]);

  const isTriBlueprint = useMemo(() => {
    try { return !!(libPlan?.template?.phase_blueprint) && !(libPlan?.template?.sessions_by_week); } catch { return false; }
  }, [libPlan]);

  const hasRun = useMemo(() => {
    if (!libPlan?.template?.sessions_by_week) return false;
    return Object.values(libPlan.template.sessions_by_week).some((arr: any) => (arr as any[]).some(isRun));
  }, [libPlan]);
  const hasRide = useMemo(() => {
    if (!libPlan?.template?.sessions_by_week) return false;
    return Object.values(libPlan.template.sessions_by_week).some((arr: any) => (arr as any[]).some(isRide));
  }, [libPlan]);
  // Strength is not optional in scheduling; presence in plan is respected as-authored

  async function save() {
    if (!libPlan) return;
    try {
      // If tri acceptance variables are present, validate race_date window first
      const tMin = triVars.minWeeks;
      const tMax = triVars.maxWeeks;
      const hasTriVars = typeof tMin === 'number' && typeof tMax === 'number';
      let targetDurationWeeks: number | null = null;
      let derivedStartMonday: string | null = null;
      const mondayOf = (iso: string): string => {
        const p = iso.split('-').map(x=>parseInt(x,10));
        const d = new Date(p[0], (p[1]||1)-1, p[2]||1);
        const jsDow = d.getDay();
        const daysFromMonday = (jsDow + 6) % 7;
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday);
        const y = mon.getFullYear();
        const m = String(mon.getMonth()+1).padStart(2,'0');
        const dd = String(mon.getDate()).padStart(2,'0');
        return `${y}-${m}-${dd}`;
      };
      const addDaysISO = (iso: string, n: number): string => {
        const p = iso.split('-').map(x=>parseInt(x,10));
        const base = new Date(p[0], (p[1]||1)-1, p[2]||1);
        base.setDate(base.getDate() + n);
        const y = base.getFullYear();
        const m = String(base.getMonth()+1).padStart(2,'0');
        const dd = String(base.getDate()).padStart(2,'0');
        return `${y}-${m}-${dd}`;
      };
      if (hasTriVars) {
        if (!raceDate) { setError('Please choose a race date'); return; }
        if (!weeksToRace || weeksToRace <= 0) { setError('Race date must be in the future'); return; }
        const wtr = weeksToRace as number;
        // Soft gate: bake with clamped duration, still allow saving
        const clamp = (v:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, v));
        targetDurationWeeks = clamp(wtr, tMin as number, tMax as number);
        const lastWeekMonday = mondayOf(raceDate);
        derivedStartMonday = addDaysISO(lastWeekMonday, -7 * (targetDurationWeeks - 1));
      }

      // If this is a tri blueprint (no sessions_by_week), compose/bake sessions first
      const baseTemplate = (() => {
        const hasSBW = !!(libPlan?.template?.sessions_by_week);
        if (hasSBW) return libPlan.template;
        const total = targetDurationWeeks || triVars.maxWeeks || 12;
        try {
          // Prefer deterministic baker
          const { bakeBlueprintToSessions } = require('@/services/plans/composeTri');
          const rd = raceDate || (new Date(Date.now()+Number(total)*7*24*60*60*1000)).toISOString().slice(0,10);
          const sbw = bakeBlueprintToSessions((libPlan?.template || {}) as any, Number(total), rd);
          return { ...libPlan.template, sessions_by_week: sbw };
        } catch {
          const sbw = composeSessionsFromBlueprint(libPlan?.template || {}, Number(total));
          return { ...libPlan.template, sessions_by_week: sbw };
        }
      })();
      const remapped = remapForPreferences(baseTemplate, { longRunDay, longRideDay, includeStrength: true });
      
      // Use baselines loaded on mount
      
      const mapped = { ...remapped, sessions_by_week: {} as any };
      // Use stored paces from baselines (from assessment)
      // The database has the data in both root level (snake_case) and performance_numbers object (camelCase)
      const pn = baselines || {};
      const pnObj = pn.performance_numbers || {};
      
      // Try both locations for each field
      const candidate5k = pn.fivek_pace || pn.fivek_time || pnObj.fiveK || pnObj.fiveKPace || null;
      const fiveK = candidate5k ? String(candidate5k) : null;
      const easyPace = pnObj.easyPace || null;
      const swimPace100 = pnObj.swimPace100 || null;
      const ftp = pnObj.ftp || null;
      
      
      
      const oneRMs = { squat: pnObj.squat, bench: pnObj.bench, deadlift: pnObj.deadlift, overhead: pnObj.overheadPress1RM } as any;
      const parsePace = (p?: string|null) => { if (!p) return null; const m = p.match(/^(\d+):(\d{2})\/(mi|km)$/i); if (!m) return null; return { s: parseInt(m[1],10)*60+parseInt(m[2],10), u: m[3].toLowerCase() }; };
      const fmtPace = (sec: number, u: string) => { const s = Math.max(1, Math.round(sec)); const mm = Math.floor(s/60); const ss = s%60; return `${mm}:${String(ss).padStart(2,'0')}/${u}`; };
      const addOffset = (base: string, off: string) => { const b = base.trim(); const o = off.trim(); const bm = b.match(/^(\d+):(\d{2})\/(mi|km)$/i); const om = o.match(/^([+\-−])(\d+):(\d{2})\/(mi|km)$/i); if (!bm || !om) return base+off; const bs = parseInt(bm[1],10)*60+parseInt(bm[2],10); const bu = bm[3].toLowerCase(); const sign = om[1]==='-'||om[1]==='−' ? -1 : 1; const os = parseInt(om[2],10)*60+parseInt(om[3],10); const ou = om[4].toLowerCase(); if (bu!==ou) return base+off; return fmtPace(bs + sign*os, bu); };
      const resolvePaces = (text: string) => {
        let out = text || '';
        if (fiveK) out = out.split('{5k_pace}').join(fiveK);
        if (easyPace) out = out.split('{easy_pace}').join(easyPace);
        // Compute offsets like "7:43/mi + 0:45/mi" or base without unit "7:43 + 0:45/mi"
        out = out.replace(/(\d+:\d{2})(?:\/(mi|km))?\s*([+\-−])\s*(\d+:\d{2})\/(mi|km)/g, (m, baseNoUnit, baseUnit, sign, t, offUnit) => {
          const unit = baseUnit || offUnit;
          const base = `${baseNoUnit}/${unit}`;
          const off = `${sign}${t}/${unit}`;
          return addOffset(base, off);
        });

        // Alias mapping when no explicit offset is provided (tempo, threshold, etc.)
        const f = parsePace(fiveK || undefined);
        const e = parsePace(easyPace || undefined);
        const fmt = (sec: number, unit: string) => fmtPace(sec, unit);
        const aliasToPace = (alias: string, unitHint: string): string | null => {
          const unit = (unitHint === 'km' || unitHint === 'mi') ? unitHint : (f?.u || 'mi');
          const fiveKSec = f?.u === unit ? (f?.s || 0) : (f ? Math.round(f.s * (f.u==='mi' && unit==='km' ? 0.621371 : (f.u==='km' && unit==='mi' ? 1/0.621371 : 1))) : 0);
          const easySec = e?.u === unit ? (e?.s || 0) : (e ? Math.round(e.s * (e.u==='mi' && unit==='km' ? 0.621371 : (e.u==='km' && unit==='mi' ? 1/0.621371 : 1))) : 0);
          const add = (base: number, sec: number) => fmt(Math.max(1, base + sec), unit);
          const sub = (base: number, sec: number) => fmt(Math.max(1, base - sec), unit);
          switch (alias) {
            case 'easy':
              if (easySec) return fmt(easySec, unit);
              // fallback: +60s/mi or +37s/km approx
              return add(fiveKSec, unit==='mi' ? 60 : 37);
            case 'steady':
            case 'aerobic':
              return add(fiveKSec, unit==='mi' ? 45 : 28);
            case 'marathon pace':
            case 'mp':
              return add(fiveKSec, unit==='mi' ? 30 : 19);
            case 'tempo':
              return add(fiveKSec, unit==='mi' ? 45 : 28);
            case 'threshold':
              return add(fiveKSec, unit==='mi' ? 35 : 22);
            case 'cruise':
              return add(fiveKSec, unit==='mi' ? 10 : 6);
            case 'vo2':
              return fmt(fiveKSec, unit);
            case 'rep':
              return sub(fiveKSec, unit==='mi' ? 20 : 12);
            default:
              return null;
          }
        };

        // Replace patterns like "@ tempo", "@ MP", "@ aerobic"
        out = out.replace(/@\s*(easy|steady|aerobic|tempo|threshold|cruise|vo2|rep|mp|marathon pace)\b/gi, (m, a) => {
          // try to infer unit from nearby text
          const unitHintMatch = out.match(/\/(mi|km)\b/);
          const unitHint = unitHintMatch ? unitHintMatch[1] : (f?.u || 'mi');
          const pace = aliasToPace(String(a).toLowerCase(), unitHint as any);
          return pace ? `@ ${pace}` : m;
        });
        // Ensure bare paces have unit (default to mi) e.g., "@ 7:43" → "@ 7:43/mi"
        out = out.replace(/@\s*(\d+:\d{2})(?!\/(mi|km))/g, (m, p) => `@ ${p}/${(parsePace(fiveK || easyPace || '')?.u || 'mi')}`);
        // Append pace ranges based on context tolerance
        const toSec = (mmss: string) => { const mm = parseInt(mmss.split(':')[0],10); const ss = parseInt(mmss.split(':')[1],10); return mm*60+ss; };
        const secTo = (s: number, unit: string) => { const x = Math.max(1, Math.round(s)); const mm = Math.floor(x/60); const ss = x%60; return `${mm}:${String(ss).padStart(2,'0')}/${unit}`; };
        const context = out.toLowerCase();
        const tol = /interval|tempo|threshold|vo2|rep|800m|400m/.test(context) ? 0.04 : (/easy|long|aerobic|endurance|steady/.test(context) ? 0.06 : 0.05);
        out = out.replace(/@\s*(\d+:\d{2})\/(mi|km)(?!\s*\()/g, (m, p, u) => {
          const s = toSec(p); const min = s*(1 - tol); const max = s*(1 + tol);
          return `${m} (${secTo(min,u)}–${secTo(max,u)})`;
        });
        return out;
      };
      const round = (w: number) => Math.round(w / 5) * 5;
      const resolveStrength = (text: string) => text.replace(/(Squat|Back Squat|Bench|Bench Press|Deadlift|Overhead Press|OHP)[^@]*@\s*(\d+)%/gi, (m, lift, pct) => { const key = String(lift).toLowerCase(); let orm: number|undefined = key.includes('squat')?oneRMs.squat : key.includes('bench')?oneRMs.bench : key.includes('deadlift')?oneRMs.deadlift : (key.includes('ohp')||key.includes('overhead'))?oneRMs.overhead : undefined; if (!orm) return m; const w = round(orm * (parseInt(pct,10)/100)); return `${m} — ${w} lb`; });
      const mapBike = (text: string) => { if (!ftp) return text; const t = text.toLowerCase(); const add = (lo: number, hi: number) => `${text} — target ${Math.round(lo*ftp)}–${Math.round(hi*ftp)} W`; if (t.includes('vo2')) return add(1.06,1.20); if (t.includes('threshold')) return add(0.95,1.00); if (t.includes('sweet spot')) return add(0.88,0.94); if (t.includes('zone 2')) return add(0.60,0.75); return text; };

      // Compute duration in minutes from description using baselines
      const fiveKSecs = parsePace(fiveK || undefined)?.s ?? null;
      const easySecs = parsePace(easyPace || undefined)?.s ?? null;
      const metersToMiles = (m: number) => m / 1609.34;
      const computeDurationMinutes = (desc?: string): number => {
        if (!desc) return 0;
        const text = desc.toLowerCase();
        let totalMin = 0;
        let matched = false;

        // Pattern: NxY min with optional rest
        const repsMin = [...text.matchAll(/(\d+)x(\d+)\s*min/g)];
        if (repsMin.length) {
          matched = true;
          for (const m of repsMin) { totalMin += parseInt(m[1],10) * parseInt(m[2],10); }
          const rest = text.match(/w\/?\s*(\d+)\s*min\s*(?:easy|rest|jog)?/);
          if (rest) { const r = parseInt(rest[1],10); const n = repsMin.reduce((s, m) => s + parseInt(m[1],10), 0); totalMin += Math.max(0, n - 1) * r; }
        }

        // Pattern: distance in miles with explicit pace or implied tokens
        const distMi = text.match(/(\d+(?:\.\d+)?)\s*mi\b/);
        if (distMi) {
          const miles = parseFloat(distMi[1]);
          // explicit mm:ss/mi nearby
          const paceMatch = desc.match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i);
          let paceSec: number | null = null;
          if (paceMatch) {
            paceSec = parseInt(paceMatch[1],10)*60 + parseInt(paceMatch[2],10);
          } else if (text.includes('{easy_pace}')) {
            paceSec = easySecs ?? null;
          } else if (text.includes('{5k_pace}')) {
            paceSec = fiveKSecs ?? null;
          } else if (/long\b/.test(text)) {
            paceSec = easySecs ?? fiveKSecs ?? null;
          } else {
            paceSec = fiveKSecs ?? easySecs ?? null;
          }
          if (paceSec) { totalMin += Math.round((miles * paceSec) / 60); matched = true; }
        }

        // Pattern: reps of meters (e.g., 6x800m)
        const repsMeters = text.match(/(\d+)x(\d{3,4})m/);
        if (repsMeters) {
          matched = true;
          const n = parseInt(repsMeters[1],10);
          const meters = parseInt(repsMeters[2],10);
          const milesEach = metersToMiles(meters);
          const pace = fiveKSecs || easySecs || null;
          if (pace) totalMin += Math.round((n * milesEach * pace) / 60);
          const rest = text.match(/(\d+)\s*min\s*(?:jog|easy|rest)/);
          if (rest) totalMin += Math.max(0, n - 1) * parseInt(rest[1],10);
        }

        // Fallback: single "X min" only if we didn't match more specific patterns
        if (!matched) {
          const singleMin = text.match(/(\d+)\s*min\b/);
          if (singleMin) totalMin += parseInt(singleMin[1],10);
        }

        return Math.max(0, Math.round(totalMin));
      };
      // Expand any swim DSL (main/extra) to steps_preset using plan defaults
      const planDefaults = (libPlan.template?.defaults as any) || DEFAULTS_FALLBACK;
      // Optionally reduce or reindex weeks to match targetDurationWeeks (tri acceptance)
      const sourceWeeksEntries = Object.entries<any>(remapped.sessions_by_week || {})
        .map(([wk, sessions]) => [parseInt(String(wk),10), sessions] as [number, any[]])
        .sort((a,b)=>a[0]-b[0]);
      const selectedWeeks = (() => {
        if (targetDurationWeeks && sourceWeeksEntries.length >= targetDurationWeeks) {
          return sourceWeeksEntries.slice(-targetDurationWeeks);
        }
        return sourceWeeksEntries;
      })();

      for (const [wkNum, sessions] of selectedWeeks) {
        const outWeek: any[] = [];
        for (const s of sessions as any[]) {
          let expanded = { ...s } as any;
          // Authoring sugar → tags: optional_kind, xor_key
          try {
            const addTag = (arr: string[], t: string) => { if (!arr.map(x=>x.toLowerCase()).includes(t.toLowerCase())) arr.push(t); };
            const tags: string[] = Array.isArray(expanded?.tags) ? [...expanded.tags] : [];
            if (expanded.optional_kind) {
              addTag(tags, 'optional');
              addTag(tags, `opt_kind:${String(expanded.optional_kind)}`);
              const disc = String(expanded.discipline || expanded.type || '').toLowerCase();
              if (String(expanded.optional_kind).toLowerCase()==='intensity') {
                if (disc==='ride' || disc==='bike' || disc==='cycling') addTag(tags, 'bike_intensity');
                if (disc==='run') addTag(tags, 'hard_run');
              }
            }
            if (expanded.xor_key) {
              addTag(tags, `xor:${String(expanded.xor_key)}`);
            }
            if (tags.length) expanded.tags = tags;
            delete (expanded as any).optional_kind;
            delete (expanded as any).xor_key;
          } catch {}
          try {
            if ((!Array.isArray(expanded.steps_preset) || expanded.steps_preset.length === 0) && String(expanded.discipline||'').toLowerCase()==='swim') {
              const steps = expandSession({ discipline: 'swim', main: (expanded as any).main, extra: (expanded as any).extra, steps_preset: (expanded as any).steps_preset }, planDefaults);
              if (Array.isArray(steps) && steps.length) expanded.steps_preset = steps;
            }
          } catch {}
          let desc = String(s.description||'');
          if (desc) desc = resolvePaces(desc);
          if (desc) desc = resolveStrength(desc);
          const isBikeText = /\b(bike|ride|cycling)\b/i.test(String(s.discipline||s.type||''));
          if (desc && isBikeText) desc = mapBike(desc);
          const copy = { ...expanded, description: desc };
          outWeek.push(copy);
        }
        (mapped.sessions_by_week as any)[wkNum] = outWeek;
      }

      // Reindex weeks to start at 1 if we sliced
      if (targetDurationWeeks) {
        const re: any = {};
        const keys = Object.keys(mapped.sessions_by_week).map(k=>parseInt(k,10)).sort((a,b)=>a-b);
        keys.forEach((oldIdx, i) => { re[String(i+1)] = mapped.sessions_by_week[String(oldIdx)]; });
        mapped.sessions_by_week = re;
      }

      // Safety net: if sessions_by_week is still empty, bake from blueprint now
      const hasAnySessions = (() => {
        try { return Object.values(mapped.sessions_by_week||{}).some((arr:any)=>Array.isArray(arr)&&arr.length>0); } catch { return false; }
      })();
      if (!hasAnySessions && libPlan?.template?.phase_blueprint) {
        try {
          const total = targetDurationWeeks || triVars.maxWeeks || 12;
          const { bakeBlueprintToSessions } = await import('@/services/plans/composeTri');
          const rd = raceDate || (()=>{ const d=new Date(); d.setDate(d.getDate()+Number(total)*7); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
          const baked = bakeBlueprintToSessions((libPlan?.template||{}) as any, Number(total), String(rd));
          if (baked && Object.keys(baked).length) mapped.sessions_by_week = baked as any;
        } catch {}
      }

      // --- Translate with deterministic baker at import-time ---
      const toSecPerMi = (pace: string | null | undefined): number | null => {
        if (!pace) {
          return null;
        }
        const txt = String(pace).trim();
        // Accept 7:43, 7:43/mi, 4:45/km
        let m = txt.match(/^(\d+):(\d{2})\s*\/(mi|km)$/i);
        if (m) {
          const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
          const unit = m[3].toLowerCase();
          if (unit === 'mi') return sec;
          if (unit === 'km') return Math.round(sec * 1.60934);
          return sec;
        }
        m = txt.match(/^(\d+):(\d{2})$/); // no unit → assume /mi
        if (m) {
          const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
          return sec;
        }
        return null;
      };

      const baselinesTemplate = {
        fiveK_pace_sec_per_mi: toSecPerMi(fiveK),
        easy_pace_sec_per_mi: toSecPerMi(easyPace),
        tenK_pace_sec_per_mi: null,
        mp_pace_sec_per_mi: null,
        ftp: typeof ftp === 'number' ? ftp : null,
        swim_pace_per_100_sec: swimPace100 ? (()=>{ const [mm,ss] = String(swimPace100).split(':').map((x:string)=>parseInt(x,10)); return (mm||0)*60+(ss||0); })() : null,
        easy_from_5k_multiplier: 1.30
      };

      const planForAugment: any = {
        name: libPlan.name,
        description: libPlan.description || '',
        duration_weeks: mapped.duration_weeks,
        swim_unit: libPlan.template?.swim_unit || 'yd',
        baselines_template: baselinesTemplate,
        tolerances: libPlan.template?.tolerances || undefined,
        export_hints: (libPlan?.export_hints || libPlan?.template?.export_hints || null),
        sessions_by_week: mapped.sessions_by_week,
        notes_by_week: mapped.notes_by_week || {}
      };

      let baked: any | null = null;
      
      
      // TEMPORARILY DISABLED - BAKER IS CRASHING SUPABASE
      // try { 
      //   console.log('[baker] Calling augmentPlan...');
      //   baked = augmentPlan(planForAugment); 
      //   console.log('[baker] augmentPlan returned:', baked ? 'success' : 'null');
      //   if (baked?.sessions_by_week) {
      //     console.log('[baker] Baked sessions by week:', Object.keys(baked.sessions_by_week));
      //   }
      // } catch (error) {
      //   console.error('[baker] Failed to bake plan:', error);
      //   console.error('[baker] Error details:', {
      //     name: error.name,
      //     message: error.message,
      //     stack: error.stack
      //   });
      //   }
      
      baked = null;
      // Align start to Monday of the selected week, but remember the exact selected date
      const computeMondayOf = (iso: string): string => {
        const parts = iso.split('-').map(x=>parseInt(x,10));
        const d = new Date(parts[0], (parts[1]||1)-1, parts[2]||1);
        const jsDow = d.getDay(); // 0=Sun..6=Sat
        const daysFromMonday = (jsDow + 6) % 7; // Mon=0..Sun=6
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday);
        const y = mon.getFullYear();
        const m = String(mon.getMonth()+1).padStart(2,'0');
        const dd = String(mon.getDate()).padStart(2,'0');
        return `${y}-${m}-${dd}`;
      };

      const anchorMonday = (derivedStartMonday || computeMondayOf(startDate));

      const payload = {
        name: libPlan.name,
        description: libPlan.description || '',
        duration_weeks: (targetDurationWeeks || mapped.duration_weeks || Object.keys(mapped.sessions_by_week||{}).length || 12),
        current_week: 1,
        status: 'active',
        plan_type: 'catalog',
        // Preserve acceptance metadata; Week 1 anchor derived above
        config: { 
          source: 'catalog', 
          preferences: { longRunDay, longRideDay }, 
          catalog_id: libPlan.id, 
          user_selected_start_date: anchorMonday,
          // Persist weekly_summaries within config so Weekly can read it consistently
          ...(libPlan?.template?.weekly_summaries ? { weekly_summaries: JSON.parse(JSON.stringify(libPlan.template.weekly_summaries)) } : {}),
          // Persist authoring baselines metadata for runtime use
          ...(libPlan?.template?.baselines_required ? { baselines_required: libPlan.template.baselines_required } : {}),
          ...(typeof libPlan?.template?.units === 'string' ? { units: libPlan.template.units } : {}),
          // Persist adaptive metadata for runtime
          ...(libPlan?.template?.adaptive_scaling ? { adaptive_scaling: libPlan.template.adaptive_scaling } : {}),
          ...(libPlan?.template?.progression_rules ? { progression_rules: libPlan.template.progression_rules } : {}),
          ...(libPlan?.template?.volume_distribution ? { volume_distribution: libPlan.template.volume_distribution } : {}),
          ...(libPlan?.template?.weekly_frequency ? { weekly_frequency: libPlan.template.weekly_frequency } : {}),
          ...(libPlan?.template?.phase_adjustments ? { phase_adjustments: libPlan.template.phase_adjustments } : {}),
          ...(libPlan?.template?.recovery_patterns ? { recovery_patterns: libPlan.template.recovery_patterns } : {}),
          ...(libPlan?.template?.load_management ? { load_management: libPlan.template.load_management } : {}),
          ...(libPlan?.template?.equipment_scaling ? { equipment_scaling: libPlan.template.equipment_scaling } : {}),
          ...(libPlan?.template?.strength_progression ? { strength_progression: libPlan.template.strength_progression } : {}),
          ...(libPlan?.template?.endurance_progression ? { endurance_progression: libPlan.template.endurance_progression } : {}),
          ...(libPlan?.template?.load_monitoring ? { load_monitoring: libPlan.template.load_monitoring } : {}),
          ...(hasTriVars ? { 
            tri_acceptance: {
              race_date: raceDate,
              weeks_to_race: targetDurationWeeks,
              strength_track: strengthTrack || null,
              phase_blueprint: triVars.blueprint || null,
              phases_by_week: (()=>{
                try {
                  const total = targetDurationWeeks || 0;
                  if (!total) return [];
                  const bp = triVars.blueprint || {};
                  const findWeeks = (name:string, def:number) => {
                    try { 
                      if (Array.isArray(bp?.phases)) {
                        const ph = bp.phases.find((p:any)=>String(p?.name||'').toLowerCase()===name.toLowerCase());
                        if (ph && typeof ph.weeks === 'number') return Math.max(0, ph.weeks);
                      }
                      const k = `${name.toLowerCase()}_weeks`;
                      if (typeof bp?.[k] === 'number') return Math.max(0, bp?.[k]);
                    } catch {}
                    return def;
                  };
                  const taperW = findWeeks('Taper', 2);
                  const peakW = findWeeks('Peak', 2);
                  const buildW = Math.max(0, total - taperW - peakW);
                  const arr = new Array(total).fill('Build');
                  for (let i=0;i<peakW;i++) arr[total - taperW - peakW + i] = 'Peak';
                  for (let i=0;i<taperW;i++) arr[total - taperW + i] = 'Taper';
                  return arr;
                } catch { return []; }
              })()
            }
          } : {})
        },
        weeks: [],
        sessions_by_week: mapped.sessions_by_week,
        notes_by_week: mapped.notes_by_week || {},
        export_hints: (libPlan?.export_hints || libPlan?.template?.export_hints || null)
      } as any;

      // Direct insert to ensure reliability
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to save a plan.');
      
      // Calculate current_week based on start date
      const chosenStart = (startDate && startDate.trim().length>0) ? startDate : (payload?.config?.user_selected_start_date || '');
      let currentWeek = 1;
      if (chosenStart) {
        const startDateObj = new Date(chosenStart);
        const today = new Date();
        const weeksDiff = Math.floor((today.getTime() - startDateObj.getTime()) / (7 * 24 * 60 * 60 * 1000));
        currentWeek = Math.max(1, Math.min(payload.duration_weeks, weeksDiff + 1));
      }
      
      const insertPayload: any = { ...payload, user_id: user.id, current_week: currentWeek };
      delete insertPayload.export_hints;
      const planInsert = await supabase
        .from('plans')
        .insert([insertPayload])
        .select();
      const planRow = Array.isArray((planInsert as any).data) ? (planInsert as any).data[0] : (planInsert as any).data;
      const planErr = (planInsert as any).error;
      if (planErr) throw planErr;

      // Activate plan server-side with explicit start_date: insert planned rows and materialize steps
      try {
        const { supabase } = await import('@/lib/supabase');
        const chosenStart = (startDate && startDate.trim().length>0) ? startDate : (payload?.config?.user_selected_start_date || '');
        const resp = await supabase.functions.invoke('activate-plan', { body: { plan_id: String(planRow.id), start_date: chosenStart } });
        try { console.log('[PlanSelect] activate-plan start_date:', chosenStart, 'resp:', (resp as any)?.data); } catch {}
      } catch {}

      try { await refreshPlans?.(); } catch {}
      navigate('/', { state: { openPlans: true, focusPlanId: planRow.id, focusWeek: 1 } });
    } catch (e: any) {
      setError(e?.message ? String(e.message) : JSON.stringify(e));
    }
  }

  if (loading) return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <button onClick={() => { if (window.history.length>1) navigate(-1); else navigate('/'); }} className="text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</button>
              <h1 className="text-2xl font-bold">Select a Plan</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/')} className="text-sm font-medium text-gray-700 hover:bg-gray-50">Dashboard</button>
            </div>
          </div>
        </div>
      </header>
      <main className="mobile-main-content">
        <div className="w-full max-w-3xl mx-auto px-4 py-4">Loading…</div>
      </main>
    </div>
  );
  if (error) return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <button onClick={() => { if (window.history.length>1) navigate(-1); else navigate('/'); }} className="text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</button>
              <h1 className="text-2xl font-bold">Select a Plan</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/')} className="text-sm font-medium text-gray-700 hover:bg-gray-50">Dashboard</button>
            </div>
          </div>
        </div>
      </header>
      <main className="mobile-main-content">
        <div className="w-full max-w-3xl mx-auto px-4 py-4 text-red-600">{error}</div>
      </main>
    </div>
  );
  if (!libPlan) return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <button onClick={() => { if (window.history.length>1) navigate(-1); else navigate('/'); }} className="text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</button>
              <h1 className="text-2xl font-bold">Select a Plan</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/')} className="text-sm font-medium text-gray-700 hover:bg-gray-50">Dashboard</button>
            </div>
          </div>
        </div>
      </header>
      <main className="mobile-main-content">
        <div className="w-full max-w-3xl mx-auto px-4 py-4">Plan not found</div>
      </main>
    </div>
  );

  return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <button onClick={() => { if (window.history.length>1) navigate(-1); else navigate('/'); }} className="text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</button>
              <h1 className="text-2xl font-bold">Select a Plan</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/')} className="text-sm font-medium text-gray-700 hover:bg-gray-50">Dashboard</button>
            </div>
          </div>
        </div>
      </header>
      <main className="mobile-main-content">
        <div className="w-full max-w-3xl mx-auto px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">{libPlan.name}</h2>
          </div>
          <div className="text-sm text-gray-700">{cleanDesc(libPlan.description)}</div>

      {/* Read-only preview for users before accepting */}
      {showPreview && (
        <div className="p-3 border rounded space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Plan Preview</div>
            <button className="text-xs text-blue-600" onClick={()=>setShowPreview(false)}>Hide</button>
          </div>
          {libPlan?.template?.sessions_by_week ? (
            <div className="space-y-3 max-h-96 overflow-auto">
              {Object.keys(libPlan.template.sessions_by_week||{})
                .sort((a: any,b: any)=>parseInt(a,10)-parseInt(b,10))
                .map((wk: string) => {
                  const sess = (libPlan.template.sessions_by_week[wk]||[]).slice().sort(byDay);
                  const planDefaults = (libPlan.template?.defaults as any) || DEFAULTS_FALLBACK;
                  const mins = sess.reduce((t: number, s: any)=>{
                    try {
                      const sClone = JSON.parse(JSON.stringify(s));
                      const norm = normalizePlannedSession(sClone, { performanceNumbers: (baselines?.performance_numbers || {}) }, libPlan.template?.export_hints || {});
                      if (typeof norm?.durationMinutes === 'number' && isFinite(norm.durationMinutes)) return t + Math.max(0, Math.round(norm.durationMinutes));
                    } catch {}
                    return t + (typeof s.duration==='number'?s.duration:0);
                  },0);
                  return (
                    <div key={wk} className="border rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Week {wk}</div>
                        <div className="text-xs text-gray-600">{sess.length} sessions{mins>0?` • ${mins} min`:''}</div>
                      </div>
                      {(() => {
                        try {
                          const wsObj: any = (libPlan as any)?.template?.weekly_summaries || {};
                          const ws: any = wsObj?.[wk] || {};
                          const focus: string | undefined = (typeof ws?.focus === 'string' && ws.focus.trim().length>0) ? ws.focus.trim() : undefined;
                          const notes: string | undefined = (typeof ws?.notes === 'string' && ws.notes.trim().length>0) ? ws.notes.trim() : undefined;
                          if (!focus && !notes) return null;
                          return (
                            <div className="mt-1 text-xs text-gray-700">
                              {focus && (<div className="font-medium">{focus}</div>)}
                              {notes && (<div className="text-gray-600">{notes}</div>)}
                            </div>
                          );
                        } catch { return null; }
                      })()}
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {sess.map((s: any, i: number) => {
                          const fallback = [s.discipline || s.type || '']
                            .concat((s.type && s.type!==s.discipline) ? [`• ${s.type}`] : [])
                            .concat(typeof s.duration === 'number' ? [`• ${s.duration} min`] : [])
                            .filter(Boolean)
                            .join(' ')
                            .trim();
                          const swimPreview = (() => {
                            try {
                              const disc = String(s.discipline||s.type||'').toLowerCase();
                              if (disc !== 'swim') return undefined;
                              const steps = expandSession({ discipline: 'swim', main: (s as any).main, extra: (s as any).extra, steps_preset: (s as any).steps_preset }, planDefaults);
                              if (!Array.isArray(steps) || steps.length===0) return undefined;
                              const ydFrom = (count:number, each:number, unit:string) => {
                                const yd = unit.toLowerCase()==='m' ? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25; return { count, each: yd };
                              };
                              let wu=0, cd=0, pull={count:0,each:0}, kick={count:0,each:0}, aerobic={count:0,each:0};
                              steps.forEach((t:string)=>{
                                const s1=t.toLowerCase();
                                let m=s1.match(/^swim_warmup_(\d+)(yd|m)/i); if(m){ wu = m[2].toLowerCase()==='m' ? Math.round(parseInt(m[1],10)/0.9144/25)*25 : parseInt(m[1],10); return; }
                                m=s1.match(/^swim_cooldown_(\d+)(yd|m)/i); if(m){ cd = m[2].toLowerCase()==='m' ? Math.round(parseInt(m[1],10)/0.9144/25)*25 : parseInt(m[1],10); return; }
                                m=s1.match(/^swim_pull_(\d+)x(\d+)(yd|m)/i); if(m){ const v=ydFrom(parseInt(m[1],10),parseInt(m[2],10),m[3]); pull=v; return; }
                                m=s1.match(/^swim_kick_(\d+)x(\d+)(yd|m)/i); if(m){ const v=ydFrom(parseInt(m[2],10),parseInt(m[3],10),m[4]); kick=v; return; }
                                m=s1.match(/^swim_aerobic_(\d+)x(\d+)(yd|m)/i); if(m){ const v=ydFrom(parseInt(m[1],10),parseInt(m[2],10),m[3]); aerobic=v; return; }
                              });
                              const parts: string[] = [];
                              if (wu>0) parts.push(`Warm‑up ${wu} yd`);
                              if (pull.count>0) parts.push(`Pull ${pull.count} × ${pull.each} yd — buoy`);
                              if (kick.count>0) parts.push(`Kick ${kick.count} × ${kick.each} yd — board`);
                              if (aerobic.count>0) parts.push(`Aerobic ${aerobic.count} × ${aerobic.each} yd`);
                              if (cd>0) parts.push(`Cool‑down ${cd} yd`);
                              return parts.join(' • ');
                            } catch { return undefined; }
                          })();
                          const label = swimPreview || (s.description ? cleanDesc(s.description) : fallback);
                          return (
                            <div key={i} className="text-xs text-gray-700">
                              <span className="font-medium">{s.day}</span>{label ? ` — ${label}` : ''}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-auto">
              {(() => {
                const total = (typeof triVars.maxWeeks==='number' ? triVars.maxWeeks : 12);
                const preview = composePreviewFromBlueprint(libPlan?.template || {}, total);
                const weeks = Object.keys(preview);
                if (weeks.length === 0) {
                  return (
                    <div className="text-xs text-gray-700 space-y-1">
                      <div>Triathlon blueprint detected.</div>
                      {typeof triVars.minWeeks==='number' && typeof triVars.maxWeeks==='number' && (
                        <div>Window: {triVars.minWeeks}–{triVars.maxWeeks} weeks</div>
                      )}
                      {Array.isArray(triVars?.blueprint?.order) && (
                        <div>Phases: {triVars.blueprint.order.join(' → ')}</div>
                      )}
                    </div>
                  );
                }
                return weeks.map((wk) => {
                  const sess = (preview[wk] || []) as any[];
                  return (
                    <div key={wk} className="border rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Week {wk}</div>
                        <div className="text-xs text-gray-600">{sess.length} sessions</div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {sess.map((s:any, i:number) => (
                          <div key={i} className="text-xs text-gray-700">
                            <span className="font-medium">{s.day}</span>{s.description ? ` — ${cleanDesc(s.description)}` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

          <div className="p-3 border rounded space-y-3">
        <div className="text-sm font-medium">Scheduling Preferences</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Triathlon acceptance fields (race date + optional strength track) */}
          {
            true && (
            <>
              <div>
                <div className="text-xs text-gray-700 mb-1">Race date</div>
                <input type="date" value={raceDate} onChange={e=>setRaceDate(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
              </div>
              {Array.isArray(triVars.strengthTracks) && triVars.strengthTracks.length > 0 && (
                <div>
                  <div className="text-xs text-gray-700 mb-1">Strength focus (optional)</div>
                  <select value={strengthTrack} onChange={e=>setStrengthTrack(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                    <option value="">No preference</option>
                    {triVars.strengthTracks.map((t: string) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          <div>
            <div className="text-xs text-gray-700 mb-1">Start date</div>
            <input type="date" value={startDate} onChange={e=>{ setStartDate(e.target.value); setStartEdited(true); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          {(
            true
          ) && (
            <div>
              <div className="text-xs text-gray-700 mb-1">Long run day</div>
              <select value={longRunDay} onChange={e=>setLongRunDay(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {(
            true
          ) && (
            <div>
              <div className="text-xs text-gray-700 mb-1">Long ride day</div>
              <select value={longRideDay} onChange={e=>setLongRideDay(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {/* Strength is included as authored; no toggle */}
        </div>
        {(() => {
          if (!raceDate) return null;
          const minW = triVars.minWeeks; const maxW = triVars.maxWeeks;
          if (typeof weeksToRace === 'number' && typeof minW === 'number' && typeof maxW === 'number') {
            if (weeksToRace < minW || weeksToRace > maxW) {
              return <div className="text-sm text-amber-700">This plan is tuned for {minW}–{maxW} weeks; you are {weeksToRace} weeks out.</div>;
            }
          }
          return null;
        })()}
        {error && <div className="text-sm text-red-600">{error}</div>}
            <div>
              <button onClick={save} className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50" disabled={!raceDate}>
                Save Plan
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


