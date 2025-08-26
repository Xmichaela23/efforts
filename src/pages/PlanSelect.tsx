import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getLibraryPlan } from '@/services/LibraryPlans';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { normalizePlannedSession } from '@/services/plans/normalizer';
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

  for (const [wk, sessions] of Object.entries<any>(plan.sessions_by_week || {})) {
    const s = cloneSessions(sessions as any[]);
    const deload = isDeloadWeek(s);
    // Infer missing tags
    s.forEach(inferTags);
    // Pin long days
    const lr = findByTag(s,'long_run'); if (lr) moveTo(lr, prefs.longRunDay);
    const lrd = findByTag(s,'long_ride'); if (lrd) moveTo(lrd, prefs.longRideDay);

    // Bike intensity vs long ride
    const bike = findByTag(s,'bike_intensity');
    if (bike) {
      if (prefs.longRideDay === 'Saturday') {
        if (canPlace(s,bike,'Tuesday')) moveTo(bike,'Tuesday');
        else if (wednesdayRunIsAerobic(s) && canPlace(s,bike,'Wednesday')) moveTo(bike,'Wednesday');
        else { if (!deload) { ensureTag(bike,'downgraded'); bike.description = `${bike.description ? bike.description+ ' — ' : ''}Z2 45–60min`; emitNote(notesByWeek, wk, 'Friday bike set to Z2 to respect spacing with Saturday long ride.'); } moveTo(bike,'Friday'); }
      } else {
        moveTo(bike,'Friday');
      }
    }

    // Strength gaps
    const strength = s.filter(x => hasTag(x,'strength_lower'));
    const longRun = findByTag(s,'long_run'); const longRide = findByTag(s,'long_ride');
    for (const st of strength) {
      if (longRun && hoursBetween(st.day,longRun.day) < 48) {
        // prefer Monday else Wednesday
        if (canPlace(s,st,'Monday')) { moveTo(st,'Monday'); } else if (canPlace(s,st,'Wednesday')) moveTo(st,'Wednesday');
      }
      if (longRide && hoursBetween(st.day,longRide.day) < 36) {
        if (canPlace(s,st,'Friday')) moveTo(st,'Friday'); else if (canPlace(s,st,'Wednesday')) moveTo(st,'Wednesday');
        if (longRide && hoursBetween(st.day,longRide.day) < 36) { if (!deload) { ensureTag(st,'lightened'); emitNote(notesByWeek, wk, 'Deadlift volume reduced to maintain 36h from long ride.'); } }
      }
    }

    // Hard runs vs long run
    const hardRuns = s.filter(x => hasTag(x,'hard_run'));
    for (const hr of hardRuns) {
      if (longRun && hoursBetween(hr.day,longRun.day) < 24) {
        if (isIntervals(hr) && canPlace(s,hr,'Monday')) { moveTo(hr,'Monday'); emitNote(notesByWeek, wk, 'Intervals moved to Monday to maintain 24h before long run.'); }
        else if (isTempo(hr) && canPlace(s,hr,'Thursday')) { moveTo(hr,'Thursday'); emitNote(notesByWeek, wk, 'Tempo moved to Thursday to maintain 24h before long run.'); }
      }
      // General rule: if authored placement already satisfies spacing, keep authored day
      if (longRun && hoursBetween(hr._origDay, longRun.day) >= 24) {
        hr.day = hr._origDay;
      }
    }

    // Final same-day collisions
    for (const d of DAYS) {
      const dayHard = s.filter(x => x.day===d && isHard(x));
      if (dayHard.length > 1) {
        const priority = ['long_run','strength_lower','hard_run','bike_intensity','long_ride'];
        const hasBike = dayHard.some(x=>hasTag(x,'bike_intensity'));
        if (hasBike) {
          const b = dayHard.find(x=>hasTag(x,'bike_intensity'))!; if (!deload) { ensureTag(b,'downgraded'); b.description = `${b.description ? b.description+ ' — ' : ''}Z2 45–60min`; emitNote(notesByWeek, wk, `${d} bike set to Z2 due to same-day hard collision.`); }
        } else {
          const sorted = [...dayHard].sort((a,b)=> priority.findIndex(t=>hasTag(a,t)) - priority.findIndex(t=>hasTag(b,t)));
          // Prefer moving a session that is not on its authored day to preserve author intent
          let moveCandidate = sorted.reverse().find(x => x._origDay !== d) || sorted[sorted.length-1];
          const di = dayIndex(d); const newDay = idxDay(di+1);
          if (canPlace(s,moveCandidate,newDay)) moveTo(moveCandidate,newDay); else { ensureTag(moveCandidate,'warning'); emitNote(notesByWeek, wk, 'Couldn’t fully satisfy spacing; review Tue/Wed stack.'); }
        }
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
    console.debug('autoSpaceWeek snapshot', snapshot);
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
  const [longRunDay, setLongRunDay] = useState<string>('Sunday');
  const [longRideDay, setLongRideDay] = useState<string>('Saturday');
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const byDay = (a: any, b: any) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
  const cleanDesc = (text: string) => String(text || '').replace(/\[(?:cat|plan):[^\]]+\]\s*/gi, '');

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setError('Missing plan id'); setLoading(false); return; }
        const p = await getLibraryPlan(id);
        if (!p) { setError('Plan not found'); setLoading(false); return; }
        setLibPlan(p);
        setStartDate(computeNextMonday());
        setLoading(false);
      } catch (e: any) {
        setError(e.message || 'Failed to load plan');
        setLoading(false);
      }
    })();
  }, [id]);

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
      const remapped = remapForPreferences(libPlan.template, { longRunDay, longRideDay, includeStrength: true });
      let baselines: any = null;
      try { baselines = await loadUserBaselines?.(); } catch {}
      const mapped = { ...remapped, sessions_by_week: {} as any };
      // Use stored paces from baselines (from assessment)
      const pn = baselines?.performanceNumbers || {};
      const candidate5k = pn.fiveK_pace || pn.fiveKPace || pn.fiveK || null;
      const fiveK = candidate5k ? String(candidate5k) : null;
      const easyPace = pn.easyPace ? String(pn.easyPace) : null;
      const swimPace100 = pn.swimPace100 ? String(pn.swimPace100) : null;
      const ftp = baselines?.performanceNumbers?.ftp || null;
      const oneRMs = { squat: baselines?.performanceNumbers?.squat, bench: baselines?.performanceNumbers?.bench, deadlift: baselines?.performanceNumbers?.deadlift, overhead: baselines?.performanceNumbers?.overheadPress1RM } as any;
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
      for (const [wk, sessions] of Object.entries<any>(remapped.sessions_by_week||{})) {
        const outWeek: any[] = [];
        for (const s of sessions as any[]) {
          let desc = String(s.description||'');
          if (desc) desc = resolvePaces(desc);
          if (desc) desc = resolveStrength(desc);
          const isBikeText = /\b(bike|ride|cycling)\b/i.test(String(s.discipline||s.type||''));
          if (desc && isBikeText) desc = mapBike(desc);
          const copy = { ...s, description: desc };
          outWeek.push(copy);
        }
        (mapped.sessions_by_week as any)[wk] = outWeek;
      }

      // --- Translate with deterministic baker at import-time ---
      const toSecPerMi = (pace: string | null | undefined): number | null => {
        if (!pace) return null;
        const m = String(pace).match(/^(\d+):(\d{2})\s*\/(mi|km)$/i);
        if (!m) return null;
        const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
        const unit = m[3].toLowerCase();
        if (unit === 'mi') return sec;
        if (unit === 'km') return Math.round(sec * 1.60934);
        return sec;
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
      try { baked = augmentPlan(planForAugment); } catch {}
      const payload = {
        name: libPlan.name,
        description: libPlan.description || '',
        duration_weeks: mapped.duration_weeks,
        current_week: 1,
        status: 'active',
        plan_type: 'catalog',
        start_date: startDate,
        config: { source: 'catalog', preferences: { longRunDay, longRideDay }, catalog_id: libPlan.id },
        weeks: [],
        sessions_by_week: mapped.sessions_by_week,
        notes_by_week: mapped.notes_by_week || {},
        export_hints: (libPlan?.export_hints || libPlan?.template?.export_hints || null)
      } as any;

      // Direct insert to ensure reliability
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to save a plan.');
      const insertPayload: any = { ...payload, user_id: user.id };
      delete insertPayload.start_date;
      delete insertPayload.export_hints;
      const { data: planRow, error: planErr } = await supabase
        .from('plans')
        .insert([insertPayload])
        .select()
        .single();
      if (planErr) throw planErr;

      // Minimal materialization of planned_workouts (type/name/description/duration/date)
      const dayIndex: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };
      const addDays = (iso: string, n: number) => {
        const parts = String(iso).split('-').map((x) => parseInt(x, 10));
        const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
        base.setDate(base.getDate() + n);
        const y = base.getFullYear();
        const m = String(base.getMonth() + 1).padStart(2, '0');
        const d = String(base.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      const rows: any[] = [];
      // Use baselines loaded above to resolve tokens to concrete paces/power
      const unitsPref = (baselines?.units === 'metric' || baselines?.units === 'imperial') ? baselines.units : 'imperial';
      Object.keys(payload.sessions_by_week || {}).forEach((wkKey) => {
        const weekNum = parseInt(wkKey, 10);
        const sessions = (payload.sessions_by_week as any)[wkKey] || [];
        (sessions as any[]).forEach((s: any, idx: number) => {
          const dow = dayIndex[s.day] || 1;
          const date = addDays(startDate, (weekNum - 1) * 7 + (dow - 1));
          if (weekNum === 1 && date < startDate) return;
          const rawType = String(s.discipline || s.type || '').toLowerCase();
          let mappedType: 'run'|'ride'|'swim'|'strength' = 'run';
          if (rawType === 'run') mappedType = 'run';
          else if (rawType === 'bike' || rawType === 'ride') mappedType = 'ride';
          else if (rawType === 'swim') mappedType = 'swim';
          else if (rawType === 'strength') mappedType = 'strength';
          const cleanedDesc = String(s.description || '');
          const durationVal = (typeof s.duration === 'number' && Number.isFinite(s.duration)) ? s.duration : 0;
          const nameGuess = s.name || (mappedType === 'strength' ? 'Strength' : mappedType === 'ride' ? 'Ride' : mappedType === 'swim' ? 'Swim' : 'Run');

          let rendered: string | undefined = cleanedDesc;
          let totalSeconds = Math.max(0, Math.round(durationVal * 60));
          let computedSteps: any[] | undefined;
          const bakedSess = baked?.sessions_by_week?.[wkKey]?.[idx];
          if (bakedSess?.computed?.total_seconds) {
            totalSeconds = bakedSess.computed.total_seconds;
            computedSteps = bakedSess.computed.steps;
            // Enhance rendered text with primary range if missing
            try {
              const hasAt = /@\s*\d+:\d{2}/.test(rendered || '') || /target\s+\d+/.test(rendered || '');
              const secTo = (s: number) => { const x = Math.max(1, Math.round(s)); const mm = Math.floor(x/60); const ss = x%60; return `${mm}:${String(ss).padStart(2,'0')}`; };
              const addRun = () => {
                const st = (computedSteps || []).find((st: any) => st.pace_sec_per_mi && (st.kind==='work' || st.intensity==='tempo'));
                if (!st) return;
                const base = `${secTo(st.pace_sec_per_mi!)}/mi`;
                const rng = st.pace_range ? ` (${secTo(st.pace_range.lower)}/mi–${secTo(st.pace_range.upper)}/mi)` : '';
                if (!hasAt) rendered = `${rendered} @ ${base}${rng}`.trim();
              };
              const addBike = () => {
                const st = (computedSteps || []).find((st: any) => typeof st.target_watts === 'number' || st.power_range);
                if (!st) return;
                const rng = st.power_range ? `${st.power_range.lower}–${st.power_range.upper} W` : `${st.target_watts} W`;
                if (!hasAt) rendered = `${rendered} — target ${rng}`.trim();
              };
              const addSwim = () => {
                const st = (computedSteps || []).find((st: any) => typeof st.swim_pace_sec_per_100 === 'number' || st.swim_pace_range_per_100);
                if (!st) return;
                const unit = (String((libPlan?.template?.swim_unit)||'yd').toLowerCase()==='m') ? '100m' : '100yd';
                const base = typeof st.swim_pace_sec_per_100==='number' ? secTo(st.swim_pace_sec_per_100) : undefined;
                const rng = st.swim_pace_range_per_100 ? ` (${secTo(st.swim_pace_range_per_100.lower)}–${secTo(st.swim_pace_range_per_100.upper)}/${unit})` : (base?`/${unit}`:'');
                if (!hasAt && (base || rng)) rendered = `${rendered} @ ${base || ''}${rng}`.trim();
              };
              if (mappedType==='run') addRun();
              else if (mappedType==='ride') addBike();
              else if (mappedType==='swim') addSwim();
            } catch {}
          } else {
            // Fallback to legacy normalizer if baker couldn't compute
            try {
              const norm = normalizePlannedSession(s, { performanceNumbers: baselines?.performanceNumbers as any }, payload.export_hints || {});
              if (norm?.friendlySummary) rendered = norm.friendlySummary;
              if (typeof norm?.durationMinutes === 'number') totalSeconds = Math.max(0, Math.round(norm.durationMinutes * 60));
            } catch {}
          }

          rows.push({
            user_id: user.id,
            training_plan_id: planRow.id,
            template_id: planRow.id,
            week_number: weekNum,
            day_number: dow,
            date,
            type: mappedType,
            name: nameGuess,
            description: cleanedDesc,
            duration: durationVal,
            workout_status: 'planned',
            source: 'training_plan',
            steps_preset: Array.isArray(s?.steps_preset) ? s.steps_preset : null,
            export_hints: payload.export_hints || null,
            rendered_description: rendered,
            computed: { normalization_version: 'v2', total_duration_seconds: totalSeconds, steps: computedSteps },
            units: unitsPref
          });
        });
      });

      if (rows.length) {
        const { error: pwErr } = await supabase.from('planned_workouts').insert(rows);
        if (pwErr) throw pwErr;
      }

      try { await refreshPlans?.(); } catch {}
      navigate('/', { state: { openPlans: true } });
    } catch (e: any) {
      setError(e?.message ? String(e.message) : JSON.stringify(e));
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto p-4">Loading…</div>;
  if (error) return <div className="max-w-3xl mx-auto p-4 text-red-600">{error}</div>;
  if (!libPlan) return <div className="max-w-3xl mx-auto p-4">Plan not found</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{libPlan.name}</h2>
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)} className="text-sm text-blue-600">Back to Catalog</button>
          <button onClick={() => navigate('/')} className="text-sm text-blue-600">Dashboard</button>
        </div>
      </div>
      <div className="text-sm text-gray-700">{cleanDesc(libPlan.description)}</div>

      {/* Read-only preview for users before accepting */}
      {showPreview && (
        <div className="p-3 border rounded space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Plan Preview</div>
            <button className="text-xs text-blue-600" onClick={()=>setShowPreview(false)}>Hide</button>
          </div>
          <div className="space-y-3 max-h-96 overflow-auto">
            {Object.keys(libPlan.template.sessions_by_week||{})
              .sort((a: any,b: any)=>parseInt(a,10)-parseInt(b,10))
              .map((wk: string) => {
                const sess = (libPlan.template.sessions_by_week[wk]||[]).slice().sort(byDay);
                const mins = sess.reduce((t: number, s: any)=>t+(typeof s.duration==='number'?s.duration:0),0);
                return (
                  <div key={wk} className="border rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Week {wk}</div>
                      <div className="text-xs text-gray-600">{sess.length} sessions{mins>0?` • ${mins} min`:''}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1">
                      {sess.map((s: any, i: number) => {
                        const fallback = [s.discipline || s.type || '']
                          .concat((s.type && s.type!==s.discipline) ? [`• ${s.type}`] : [])
                          .concat(typeof s.duration === 'number' ? [`• ${s.duration} min`] : [])
                          .filter(Boolean)
                          .join(' ')
                          .trim();
                        const label = s.description ? cleanDesc(s.description) : fallback;
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
        </div>
      )}

      <div className="p-3 border rounded space-y-3">
        <div className="text-sm font-medium">Scheduling Preferences</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-700 mb-1">Start date</div>
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          {hasRun && (
            <div>
              <div className="text-xs text-gray-700 mb-1">Long run day</div>
              <select value={longRunDay} onChange={e=>setLongRunDay(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {hasRide && (
            <div>
              <div className="text-xs text-gray-700 mb-1">Long ride day</div>
              <select value={longRideDay} onChange={e=>setLongRideDay(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {/* Strength is included as authored; no toggle */}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div>
          <button onClick={save} className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Save Plan</button>
        </div>
      </div>
    </div>
  );
}


