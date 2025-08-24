import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getLibraryPlan } from '@/services/LibraryPlans';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';

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
  // Only move explicitly tagged long_run / long_ride; otherwise preserve JSON order and days exactly
  const out: any = { ...plan, sessions_by_week: {} };
  // Preserve week notes if provided in template
  if (plan && plan.notes_by_week) {
    out.notes_by_week = plan.notes_by_week;
  }
  for (const [wk, sessions] of Object.entries<any>(plan.sessions_by_week || {})) {
    const copy = (sessions as any[]).map(s => ({ ...s }));
    const runTagged = copy.findIndex(s => hasTag(s,'long_run'));
    if (runTagged >= 0) copy[runTagged].day = prefs.longRunDay;
    const rideTagged = copy.findIndex(s => hasTag(s,'long_ride'));
    if (rideTagged >= 0) copy[rideTagged].day = prefs.longRideDay;
    const filtered = prefs.includeStrength ? copy : copy.filter(s => !isStrength(s) || hasTag(s,'mandatory_strength'));
    out.sessions_by_week[wk] = filtered;
  }
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
      const resolvePaces = (text: string) => { let out = text; if (fiveK) out = out.split('{5k_pace}').join(fiveK); if (easyPace) out = out.split('{easy_pace}').join(easyPace); return out; };
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
        const repsMin = [...text.matchAll(/(\d+)x(\d+)\s*min/g)];
        if (repsMin.length) {
          for (const m of repsMin) { totalMin += parseInt(m[1],10) * parseInt(m[2],10); }
          const rest = text.match(/w\/?\s*(\d+)\s*min\s*(?:easy|rest|jog)?/);
          if (rest) { const r = parseInt(rest[1],10); const n = repsMin.reduce((s, m) => s + parseInt(m[1],10), 0); totalMin += Math.max(0, n - 1) * r; }
        }
        if (totalMin === 0) {
          const singleMin = text.match(/(\d+)\s*min\b/);
          if (singleMin) return parseInt(singleMin[1],10);
        }
        const distMi = text.match(/(\d+(?:\.\d+)?)\s*mi\b/);
        if (distMi) { const miles = parseFloat(distMi[1]); const pace = text.includes('{easy_pace}') ? easySecs : fiveKSecs; if (pace) totalMin += Math.round((miles * pace) / 60); }
        const repsMeters = text.match(/(\d+)x(\d{3,4})m/);
        if (repsMeters) { const n = parseInt(repsMeters[1],10); const meters = parseInt(repsMeters[2],10); const milesEach = metersToMiles(meters); const pace = fiveKSecs || easySecs || null; if (pace) totalMin += Math.round((n * milesEach * pace) / 60); const rest = text.match(/(\d+)\s*min\s*(?:jog|easy|rest)/); if (rest) totalMin += Math.max(0, n - 1) * parseInt(rest[1],10); }
        return Math.max(0, Math.round(totalMin));
      };
      for (const [wk, sessions] of Object.entries<any>(remapped.sessions_by_week||{})) { const outWeek: any[] = []; for (const s of sessions as any[]) { let desc = String(s.description||''); if (desc) desc = resolvePaces(desc); if (desc) desc = resolveStrength(desc); if (desc) desc = mapBike(desc); const copy = { ...s, description: desc }; outWeek.push(copy); } (mapped.sessions_by_week as any)[wk] = outWeek; }
      const payload = { name: libPlan.name, description: libPlan.description || '', duration_weeks: mapped.duration_weeks, current_week: 1, status: 'active', plan_type: 'catalog', start_date: startDate, config: { source: 'catalog', preferences: { longRunDay, longRideDay }, catalog_id: libPlan.id }, weeks: [], sessions_by_week: mapped.sessions_by_week, notes_by_week: mapped.notes_by_week || {} } as any;

      // Direct insert into plans and materialize planned_workouts
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to save a plan.');
      const insertPayload: any = { ...payload, user_id: user.id }; delete insertPayload.start_date;
      const { data: planRow, error: planErr } = await supabase.from('plans').insert([insertPayload]).select().single();
      if (planErr) throw planErr;
      const dayIndex: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };
      const addDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
      const rows: any[] = [];
      Object.keys(payload.sessions_by_week || {}).forEach((wkKey) => {
        const weekNum = parseInt(wkKey, 10);
        const sessions = payload.sessions_by_week[wkKey] || [];
        sessions.forEach((s: any) => {
          const dow = dayIndex[s.day] || 1;
          const date = addDays(startDate, (weekNum - 1) * 7 + (dow - 1));
          if (weekNum === 1 && date < startDate) return;
          const rawType = (s.discipline || s.type || '').toLowerCase();
          const inferred = inferDisciplineFromDescription(String(s.description||'')) || undefined;
          let mappedType: 'run'|'ride'|'swim'|'strength' = 'run';
          if (rawType === 'run' || inferred === 'run') mappedType = 'run';
          else if (rawType === 'bike' || rawType === 'ride' || inferred === 'ride') mappedType = 'ride';
          else if (rawType === 'swim' || inferred === 'swim') mappedType = 'swim';
          else if (rawType === 'strength' || inferred === 'strength') mappedType = 'strength';
          const durationVal = (typeof s.duration === 'number' && Number.isFinite(s.duration)) ? s.duration : computeDurationMinutes(s.description);
          const cleanedDesc = String(s.description||'').replace(/\[(?:cat|plan):[^\]]+\]\s*/gi,'');
          const guessKind = /interval/i.test(cleanedDesc) ? 'Intervals' : /tempo/i.test(cleanedDesc) ? 'Tempo' : /long/i.test(cleanedDesc) ? 'Long' : 'Session';
          const derivedName = mappedType==='strength' ? 'Strength' : mappedType==='swim' ? 'Swim' : mappedType==='ride' ? 'Ride' : 'Run';
          const row: any = { user_id: user.id, training_plan_id: planRow.id, template_id: planRow.id, week_number: weekNum, day_number: dow, date, type: mappedType, name: s.name || `${derivedName} ${guessKind}`.trim(), description: cleanedDesc, duration: durationVal, workout_status: 'planned', source: 'training_plan' };
          // Build swim intervals from steps[] so Garmin export works
          if (mappedType === 'swim' && Array.isArray((s as any).steps) && (s as any).steps.length) {
            const parseSwimPace = (p?: string|null): number | null => {
              if (!p) return null; const m = String(p).match(/(\d+):(\d{2})\s*\/\s*100\s*(yd|m)/i); if (!m) return null; const mins = parseInt(m[1],10); const secs = parseInt(m[2],10); const unit = m[3].toLowerCase(); const total = mins*60+secs; const meters = unit==='yd'?100*0.9144:100; return total/meters; // sec per meter
            };
            const secPerMeter = parseSwimPace(swimPace100) ?? 2.0;
            const defaultUnit = (libPlan?.template?.swim_unit || 'yd').toLowerCase();
            const toMeters = (val: number, unit?: string) => ((unit||defaultUnit).toLowerCase()==='yd'? val*0.9144 : val);
            const parseRest = (rest?: string) => {
              if (!rest) return 0;
              const t = String(rest).trim();
              // Support "20s", "0:20", "1:00", "00:20"
              const secOnly = t.match(/^(\d+)\s*s$/i);
              if (secOnly) return parseInt(secOnly[1], 10);
              const mmss = t.match(/^(\d{1,2}):(\d{2})$/);
              if (mmss) return parseInt(mmss[1],10)*60 + parseInt(mmss[2],10);
              return 0;
            };
            const steps = (s as any).steps as any[];
            const intervals: any[] = [];
            for (const step of steps) {
              const repeat = Number(step.repeat || 1);
              const distM = step.distance ? toMeters(Number(step.distance), step.unit) : 0;
              const workSec = distM>0 ? Math.round(distM * secPerMeter) : 0;
              for (let r = 0; r < Math.max(1, repeat); r += 1) {
                if (distM>0) intervals.push({ distanceMeters: Math.round(distM), effortLabel: step.effort || step.stroke || 'Swim' });
                const restSec = parseRest(step.rest); if (restSec>0) intervals.push({ duration: restSec, effortLabel: 'Rest' });
              }
            }
            if (intervals.length) row.intervals = intervals;
          } else if (mappedType === 'swim' && !Array.isArray((s as any).steps)) {
            // Auto-parse simple swim description patterns into intervals so swims without steps are Garmin-ready
            const parseSwimPace = (p?: string|null): number | null => {
              if (!p) return null; const m = String(p).match(/(\d+):(\d{2})\s*\/\s*100\s*(yd|m)/i); if (!m) return null; const mins = parseInt(m[1],10); const secs = parseInt(m[2],10); const unit = m[3].toLowerCase(); const total = mins*60+secs; const meters = unit==='yd'?100*0.9144:100; return total/meters;
            };
            const secPerMeter = parseSwimPace(swimPace100) ?? 2.0;
            const defaultUnit = (libPlan?.template?.swim_unit || 'yd').toLowerCase();
            const toMeters = (val: number, unit?: string) => ((unit||defaultUnit).toLowerCase()==='yd'? val*0.9144 : val);
            const parseRest = (rest?: string) => {
              if (!rest) return 0; const t = String(rest).trim(); const secOnly = t.match(/^(\d+)\s*s$/i); if (secOnly) return parseInt(secOnly[1],10); const mmss = t.match(/^(\d{1,2}):(\d{2})$/); if (mmss) return parseInt(mmss[1],10)*60 + parseInt(mmss[2],10); return 0;
            };
            const description = String(s.description||'');
            // Split on commas and semicolons; derive segments
            const parts = description.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
            const intervals: any[] = [];
            for (const part of parts) {
              // Match like "4x50 drill:catch-up /20s" or "2x100 pull /20s" or "200 easy"
              const repDist = part.match(/^(\d+)x\s*(\d{2,4})\s*(yd|m)?/i);
              const singleDist = part.match(/^(\d{2,4})\s*(yd|m)?/i);
              const restMatch = part.match(/\/(\s*)?([0-9:]+)s?/i);
              const restSec = restMatch ? ((): number => { const t = restMatch[2]; const mm = t.match(/^(\d{1,2}):(\d{2})$/); if (mm) return parseInt(mm[1],10)*60+parseInt(mm[2],10); const ss = t.match(/^(\d{1,3})$/); return ss ? parseInt(ss[1],10) : 0; })() : 0;
              const label = /drill\s*:/.test(part) ? (part.match(/drill\s*:\s*([a-z\-]+)/i)?.[1] || 'Drill')
                            : /pull/i.test(part) ? 'Pull'
                            : /kick/i.test(part) ? 'Kick'
                            : /easy/i.test(part) ? 'Easy'
                            : 'Swim';
              if (repDist) {
                const repeat = parseInt(repDist[1],10);
                const dist = parseInt(repDist[2],10);
                const unit = (repDist[3] || defaultUnit) as string;
                const distM = toMeters(dist, unit);
                for (let r = 0; r < Math.max(1, repeat); r += 1) {
                  if (distM>0) intervals.push({ distanceMeters: Math.round(distM), effortLabel: label });
                  if (restSec>0) intervals.push({ duration: restSec, effortLabel: 'Rest' });
                }
                continue;
              }
              if (singleDist) {
                const dist = parseInt(singleDist[1],10);
                const unit = (singleDist[2] || defaultUnit) as string;
                const distM = toMeters(dist, unit);
                if (distM>0) intervals.push({ distanceMeters: Math.round(distM), effortLabel: label });
                if (restSec>0) intervals.push({ duration: restSec, effortLabel: 'Rest' });
                continue;
              }
            }
            if (intervals.length) row.intervals = intervals;
          }

          // Strength: convert steps to structured intervals for Garmin Strength
          if (mappedType === 'strength' && Array.isArray((s as any).steps) && (s as any).steps.length) {
            const pn2 = baselines?.performanceNumbers || {};
            const estimatedRow1RM = pn2.bench ? pn2.bench * 0.7 : undefined; // Row ≈ 70% of bench 1RM
            const orm = { squat: pn2.squat, bench: pn2.bench, deadlift: pn2.deadlift, overhead: pn2.overheadPress1RM, row: estimatedRow1RM } as any;
            const toSeconds = (t?: string) => { if (!t) return 0; const m = String(t).trim(); const sec = m.match(/^(\d+)\s*s$/i); if (sec) return parseInt(sec[1],10); const mmss = m.match(/^(\d{1,2}):(\d{2})$/); if (mmss) return parseInt(mmss[1],10)*60+parseInt(mmss[2],10); return 0; };
            const round5 = (w: number) => Math.round(w/5)*5;
            const exMap: Record<string,string> = {
              bench_press: 'bench',
              back_squat: 'squat',
              deadlift: 'deadlift',
              overhead_press: 'overhead',
              ohp: 'overhead',
              row: 'row',
              barbell_row: 'row',
              pendlay_row: 'row'
            };
            const steps = (s as any).steps as any[];
            const intervals: any[] = [];
            const strengthAgg: Record<string, { name: string; sets: number; reps: number; weight: number } > = {};
            const formatName = (k: string) => k.replace(/_/g,' ').replace(/\b\w/g, (c) => c.toUpperCase());
            for (const step of steps) {
              const repeat = Math.max(1, Number(step.repeat||1));
              if (String(step.type||'').toLowerCase()==='strength') {
                const key = exMap[String(step.exercise||'').toLowerCase()] || '';
                let weight = Number(step.target_weight||0);
                if (!weight && Number(step.target_percent_1rm||0) > 0 && orm[key]) {
                  weight = round5(orm[key] * Number(step.target_percent_1rm));
                }
                for (let r=0;r<repeat;r+=1) {
                  intervals.push({ kind:'strength', exercise: String(step.exercise||'').toLowerCase(), reps: Number(step.reps||0), weight, note: step.note||undefined });
                }
                // Aggregate for logger prefill
                const aggKey = String(step.exercise||'').toLowerCase();
                const prev = strengthAgg[aggKey];
                const repsNum = Number(step.reps||0);
                if (prev) {
                  prev.sets += repeat;
                  // If weights differ across sets, keep the heavier one for display; user can edit per set
                  if (weight > 0) prev.weight = Math.max(prev.weight, weight);
                  if (repsNum > 0) prev.reps = repsNum; // keep latest reps spec
                } else {
                  strengthAgg[aggKey] = { name: formatName(aggKey), sets: repeat, reps: repsNum, weight: weight||0 };
                }
              } else if (String(step.type||'').toLowerCase()==='rest') {
                const dur = toSeconds(step.duration);
                for (let r=0;r<repeat;r+=1) {
                  intervals.push({ kind:'rest', duration: dur, effortLabel: 'Rest' });
                }
              }
            }
            if (intervals.length) row.intervals = intervals;
            // Emit strength_exercises for logger prepopulation
            const strengthExercises = Object.values(strengthAgg);
            if (strengthExercises.length) {
              row.strength_exercises = strengthExercises.map(se => ({ name: se.name, sets: se.sets, reps: se.reps, weight: se.weight }));
            }
          }
          if (s.intensity && typeof s.intensity === 'object') row.intensity = s.intensity;
          if (Array.isArray(s.intervals)) row.intervals = s.intervals;
          if (Array.isArray(s.strength_exercises)) row.strength_exercises = s.strength_exercises;
          rows.push(row);
        });
      });
      if (rows.length) {
        // Ensure idempotency: remove any prior materialization for this plan/template, then insert fresh
        await supabase.from('planned_workouts').delete().eq('training_plan_id', planRow.id);
        await supabase.from('planned_workouts').delete().eq('template_id', planRow.id);

        const { error: pwErr } = await supabase
          .from('planned_workouts')
          .insert(rows);
        if (pwErr) {
          const msg = String((pwErr as any)?.message || '');
          if (msg.includes('planned_workouts_plan_fk')) {
            const rowsNoLink = rows.map(r => ({ ...r, training_plan_id: null }));
            const { error: pwErr2 } = await supabase
              .from('planned_workouts')
              .insert(rowsNoLink);
            if (pwErr2) throw pwErr2;
          } else {
            throw pwErr;
          }
        }
      }
      try { await refreshPlans?.(); } catch {}
      navigate('/');
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


