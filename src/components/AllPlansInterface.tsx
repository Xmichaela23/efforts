import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Play, Pause, Edit, Trash2, Calendar, Clock, Target, Activity, Bike, Waves, Dumbbell, ChevronDown, Moon, ArrowUpDown, Send } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { useAppContext } from '@/contexts/AppContext';
import { getDisciplineColor } from '@/lib/utils';
import PlannedWorkoutView from './PlannedWorkoutView';
import WorkoutSummaryView from './WorkoutSummaryView';

// Helpers for normalizing minimal JSON sessions into legacy view expectations
function cleanSessionDescription(text: string): string {
  // Remove catalog/control tags like [cat:run], [plan:...] but keep interval variant tags
  const s = String(text || '')
    .replace(/\[(?:cat|plan):[^\]]+\]\s*/gi, '') // control tags
    .replace(/\[[A-Za-z0-9_:+\-x\/]+\]/g, '')   // code-like tokens [800m_x6_R2min]
    .replace(/\s{2,}/g, ' ')                      // extra spaces
    .trim();
  return s;
}

function inferDisciplineFromText(text?: string): 'run' | 'ride' | 'swim' | 'strength' | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/\[cat:\s*run\]/i.test(text) || /\brun\b/.test(t)) return 'run';
  if (/\[cat:\s*(bike|ride)\]/i.test(text) || /\b(bike|ride|cycling)\b/.test(t)) return 'ride';
  if (/\[cat:\s*swim\]/i.test(text) || /\bswim\b/.test(t)) return 'swim';
  if (/\[cat:\s*strength\]/i.test(text) || /(strength|squat|deadlift|bench|ohp)/.test(t)) return 'strength';
  return undefined;
}

function extractTypeFromText(text?: string): string | undefined {
  if (!text) return undefined;
  // Match patterns like "Run — Intervals: ..." or "Bike — VO2 set: ..."
  const m = text.match(/[—\-]\s*([^:]+):/);
  if (m && m[1]) return m[1].trim();
  // Fallbacks
  if (/tempo/i.test(text)) return 'Tempo';
  if (/interval/i.test(text)) return 'Intervals';
  if (/long/i.test(text)) return 'Long';
  if (/sweet\s*spot/i.test(text)) return 'Sweet Spot';
  if (/vo2/i.test(text)) return 'VO2';
  return undefined;
}

function extractMinutesFromText(text?: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d{1,3})\s*min\b/i);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

// Humanize steps_preset tokens and estimate duration
function humanizeToken(token: string): string {
  const t = token.toLowerCase();
  const dur = (() => {
    const m = t.match(/(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
    if (!m) return '';
    return m[2] ? `${m[1]}–${m[2]}min` : `${m[1]}min`;
  })();
  if (t.startsWith('warmup')) return `Warm‑up ${dur}`.trim();
  if (t.startsWith('cooldown')) return `Cool‑down ${dur}`.trim();
  if (t.startsWith('longrun')) return `Long run ${dur}`.trim();
  if (t.startsWith('tempo')) return `Tempo ${dur}`.trim();
  if (t.startsWith('interval')) return `Intervals`;
  if (t.startsWith('strides')) return `Strides`;
  if (t.startsWith('drills')) return `Drills`;
  if (t.startsWith('bike_vo2')) return `Bike VO₂ ${dur}`.trim();
  if (t.startsWith('bike_thr') || t.includes('threshold')) return `Bike Threshold ${dur}`.trim();
  if (t.startsWith('bike_ss')) return `Bike Sweet Spot ${dur}`.trim();
  if (t.startsWith('bike_endurance')) return `Bike Endurance ${dur}`.trim();
  // Generic fallback
  return token.replace(/_/g, ' ');
}

function summarizeSteps(steps?: string[]): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  return steps.map(humanizeToken);
}

function estimateMinutesFromSteps(steps?: string[]): number {
  if (!Array.isArray(steps)) return 0;
  let total = 0;
  for (const tok of steps) {
    const m = tok.toLowerCase().match(/(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      total += Math.round((a + b) / 2);
    }
  }
  return total;
}

// Estimate duration from description like "4mi @ 7:30/mi"
function estimateMinutesFromDescription(desc?: string): number {
  if (!desc) return 0;
  const s = desc.toLowerCase();
  // distance in miles
  let m = s.match(/(\d+(?:\.\d+)?)\s*mi[^\d]*(\d+):(\d{2})\s*\/\s*mi/);
  if (m) {
    const dist = parseFloat(m[1]);
    const pace = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    return Math.round((dist * pace) / 60);
  }
  // distance in km
  m = s.match(/(\d+(?:\.\d+)?)\s*km[^\d]*(\d+):(\d{2})\s*\/\s*km/);
  if (m) {
    const distKm = parseFloat(m[1]);
    const paceSec = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    const minutes = (distKm * paceSec) / 60;
    return Math.round(minutes);
  }
  return 0;
}

// Estimate interval block duration from steps_preset + description pace
function estimateMinutesFromIntervals(steps?: string[], desc?: string): number {
  if (!Array.isArray(steps) || !desc) return 0;
  const joined = steps.join(' ').toLowerCase();
  const m = joined.match(/(?:interval|cruise)_(\d+)x(\d+(?:\.\d+)?)(m|mi)/i);
  if (!m) return 0;
  const reps = parseInt(m[1], 10);
  const per = parseFloat(m[2]);
  const unit = m[3].toLowerCase();
  const perMiles = unit === 'm' ? per / 1609.34 : per; // meters → miles

  // Resolve pace from description (already token-resolved)
  // Handle formats: "@ 7:43/mi", or "@ 7:43 + 0:45/mi"
  let paceSec: number | null = null;
  let pm = desc.match(/@(.*?)\b/); // capture after @ up to next whitespace
  if (pm) {
    const seg = pm[1];
    let mm: RegExpMatchArray | null = null;
    // 7:43/mi + 0:45/mi OR 7:43 + 0:45/mi
    mm = String(seg).match(/(\d+):(\d{2})(?:\/(mi|km))?\s*[+\-−]\s*(\d+):(\d{2})\/(mi|km)/i);
    if (mm) {
      const base = parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
      const off = parseInt(mm[4], 10) * 60 + parseInt(mm[5], 10);
      paceSec = base + off; // assume plus; minus uncommon for quality
    }
    if (!paceSec) {
      mm = String(seg).match(/(\d+):(\d{2})\/(mi|km)/i);
      if (mm) paceSec = parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
    }
  }
  if (!paceSec) return 0;

  // Rest between reps: _R2min or _R2-3min → average
  const rm = joined.match(/_r(\d+)(?:-(\d+))?min/i);
  let restMin = 0;
  if (rm) {
    const ra = parseInt(rm[1], 10);
    const rb = rm[2] ? parseInt(rm[2], 10) : ra;
    const avg = (ra + rb) / 2;
    restMin = avg * Math.max(0, reps - 1);
  }

  const workMin = (reps * perMiles * paceSec) / 60;
  return Math.round(workMin + restMin);
}

function capitalize(w?: string) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : ''; }

interface Plan {
  id: string;
  name: string;
  description: string;
  currentWeek?: number;
  status: 'active' | 'completed';
}

interface AllPlansInterfaceProps {
  onClose: () => void;
  onSelectPlan: (plan: Plan) => void;
  onBuildWorkout: (type: string, sourceContext?: string) => void;
  onDeletePlan?: (planId: string) => void;
  currentPlans?: Plan[];
  completedPlans?: Plan[];
  detailedPlans?: any;
  onSelectWorkout?: (workout: any) => void;
  // Optional: auto-open a specific plan and week when mounting
  focusPlanId?: string;
  focusWeek?: number;
}

const AllPlansInterface: React.FC<AllPlansInterfaceProps> = ({ 
  onClose, 
  onSelectPlan, 
  onBuildWorkout,
  onDeletePlan,
  currentPlans = [],
  completedPlans = [],
  detailedPlans = {},
  onSelectWorkout,
  focusPlanId,
  focusWeek
}) => {
  const { plannedWorkouts, loading: plannedLoading } = usePlannedWorkouts();
  const { loadUserBaselines } = useAppContext();
  const [baselines, setBaselines] = useState<any>(null);
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'day'>('list');
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<any>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [planStatus, setPlanStatus] = useState<string>('active');
  const [viewMode, setViewMode] = useState<'summary' | 'adjustments'>('summary');
  const [activatingId, setActivatingId] = useState<string | null>(null);
  
  // Add workout edit mode state
  const [workoutViewMode, setWorkoutViewMode] = useState<'summary' | 'edit'>('summary');

  // Plan adjustment state
  const [adjustmentInput, setAdjustmentInput] = useState('');
  const [adjustmentHistory, setAdjustmentHistory] = useState<Array<{type: 'user' | 'system', message: string, timestamp: number}>>([]);
  const [isProcessingAdjustment, setIsProcessingAdjustment] = useState(false);
  const [adjustmentsUsed, setAdjustmentsUsed] = useState(0);
  const [adjustmentLimit] = useState(3);

  const handlePlanClick = async (planId: string) => {
    let planDetail = detailedPlans[planId as keyof typeof detailedPlans];

    // Parse weeks if stored as JSON string
    if (planDetail) {
      if (typeof planDetail.weeks === 'string') {
        try {
          planDetail.weeks = JSON.parse(planDetail.weeks);
        } catch (error) {
          console.error('Error parsing weeks JSON:', error);
        }
      }
    }

    // Fallback to basic plan info if detailed record missing
    if (!planDetail) {
      const basicPlan = [...currentPlans, ...completedPlans].find(plan => plan.id === planId);
      if (basicPlan) {
        planDetail = {
          ...basicPlan,
          weeks: (basicPlan as any).weeks || [],
          duration: (basicPlan as any).duration || (basicPlan as any).duration_weeks || 4,
          totalWorkouts: (basicPlan as any).totalWorkouts || 0,
          currentWeek: basicPlan.currentWeek || 1
        } as any;
      }
    }

    // Normalize new universal plan shape → legacy view expectations
    if (planDetail) {
      const pd: any = planDetail;

      // duration_weeks → duration
      if (!pd.duration && pd.duration_weeks) {
        pd.duration = pd.duration_weeks;
      }

      // Load baselines for token resolution (use local variable immediately)
      let bl: any = baselines;
      try {
        if (!bl) {
          bl = await loadUserBaselines?.();
          if (bl) setBaselines(bl);
        }
      } catch {}

      // Prefer materialized planned_workouts if present, so we honor actual scheduling and dates
      try {
        const commonSelect = '*';
        const { data: byLink, error: e1 } = await supabase
          .from('planned_workouts')
          .select(commonSelect)
          .eq('training_plan_id', planId)
          .order('week_number', { ascending: true })
          .order('day_number', { ascending: true });
        const { data: byTemplate, error: e2 } = await supabase
          .from('planned_workouts')
          .select(commonSelect)
          .eq('template_id', planId)
          .order('week_number', { ascending: true })
          .order('day_number', { ascending: true });
        const mat = ([] as any[]).concat(byLink || []).concat(byTemplate || []);
        if (!e1 && !e2 && Array.isArray(mat) && mat.length > 0) {
          const numToDay = { 1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday' } as Record<number,string>;
          const byWeek: Record<number, any[]> = {};
          // Baseline helpers
          const pn = bl?.performanceNumbers || {};
          const candidate5k = pn.fiveK_pace || pn.fiveKPace || pn.fiveK || null;
          const fiveK: string | null = (candidate5k ? String(candidate5k) : null) as any;
          const easyPace: string | null = (pn.easyPace ? String(pn.easyPace) : null) as any;
          const ftp: number | null = (bl?.performanceNumbers?.ftp || null) as any;
          const hints = (pd?.export_hints || {}) as any;
          const paceTolQuality = typeof hints.pace_tolerance_quality === 'number' ? hints.pace_tolerance_quality : 0.04;
          const paceTolEasy = typeof hints.pace_tolerance_easy === 'number' ? hints.pace_tolerance_easy : 0.06;
          const pTolSS = typeof hints.power_tolerance_SS_thr === 'number' ? hints.power_tolerance_SS_thr : 0.05;
          const pTolVO2 = typeof hints.power_tolerance_VO2 === 'number' ? hints.power_tolerance_VO2 : 0.10;
          const paceToSec = (p: string) => { const m = p.match(/(\d+):(\d{2})\/(mi|km)/i); if (!m) return null as any; return { sec:Number(m[1])*60+Number(m[2]), unit:m[3].toLowerCase() }; };
          const secToPace = (sec: number, unit: string) => { const s = Math.max(1, Math.round(sec)); const mm = Math.floor(s/60); const ss = s%60; return `${mm}:${String(ss).padStart(2,'0')}/${unit}`; };
          const appendPaceRange = (txt: string) => {
            const m = txt.match(/(\d+:\d{2}\/((?:mi|km)))/i);
            if (!m) return txt;
            const isEasy = /easy|warm\s*up|cool\s*down|cooldown|warmup|\{easy_pace\}/i.test(txt);
            const isQuality = /tempo|interval|threshold|5k|10k|vo2|repeat/i.test(txt) && !isEasy;
            const tol = isQuality ? paceTolQuality : paceTolEasy;
            const ps = paceToSec(m[1]); if (!ps) return txt;
            const lo = secToPace(ps.sec*(1 - tol), ps.unit); const hi = secToPace(ps.sec*(1 + tol), ps.unit);
            if (txt.includes('(') && txt.includes('–')) return txt;
            return txt.replace(m[1], `${m[1]} (${lo}–${hi})`);
          };
          const resolvePaces = (text: string) => {
            let out = text || '';
            if (fiveK) out = out.replaceAll('{5k_pace}', String(fiveK));
            if (easyPace) out = out.replaceAll('{easy_pace}', String(easyPace));
            // Compute offsets like 7:43/mi + 0:45/mi → 8:28/mi
            out = out.replace(/(\d+:\d{2})\/(mi|km)\s*([+\-−])\s*(\d+:\d{2})\/(mi|km)/g, (m, base, u1, sign, t, u2) => {
              if (u1 !== u2) return m;
              const [bm, bs] = base.split(':').map(Number);
              const [tm, ts] = t.split(':').map(Number);
              const baseSec = bm * 60 + bs;
              const offSec = tm * 60 + ts;
              const newSec = sign === '-' || sign === '−' ? baseSec - offSec : baseSec + offSec;
              const mm = Math.floor(newSec / 60);
              const ss = newSec % 60;
              return `${mm}:${String(ss).padStart(2, '0')}/${u1}`;
            });
            out = appendPaceRange(out);
            return out;
          };
          const round = (w: number) => Math.round(w / 5) * 5;
          const resolveStrength = (text: string) => {
            const pn = bl?.performanceNumbers || {};
            const oneRMs = { squat: pn.squat, bench: pn.bench, deadlift: pn.deadlift, overhead: pn.overheadPress1RM } as any;
            return String(text||'').replace(/(Squat|Back Squat|Bench|Bench Press|Deadlift|Overhead Press|OHP)[^@]*@\s*(\d+)%/gi, (m, lift, pct) => {
              const key = String(lift).toLowerCase(); let orm: number|undefined = key.includes('squat')?oneRMs.squat : key.includes('bench')?oneRMs.bench : key.includes('deadlift')?oneRMs.deadlift : (key.includes('ohp')||key.includes('overhead'))?oneRMs.overhead : undefined; if (!orm) return m; const w = round(orm * (parseInt(pct,10)/100)); return `${m} — ${w} lb`; });
          };
          const mapBike = (text: string) => { if (!ftp) return text; const t = (text||'').toLowerCase(); const add = (center: number, tol: number) => `${text} — target ${Math.round((center*(1-tol))*ftp)}–${Math.round((center*(1+tol))*ftp)} W`; if (t.includes('vo2')) return add(1.10, pTolVO2); if (t.includes('threshold')) return add(0.98, pTolSS); if (t.includes('sweet spot')) return add(0.91, pTolSS); if (t.includes('zone 2') || t.includes('endurance')) return add(0.68, 0.05); return text; };

          const parseMaybeJson = (v: any) => {
            if (v == null) return v;
            if (typeof v === 'string') {
              try { return JSON.parse(v); } catch { return v; }
            }
            return v;
          };
          for (const w of mat) {
            const wk = w.week_number || 1;
            const dayName = numToDay[w.day_number as number] || w.day || '';
            
            // Prefer computed fields if available
            const computed = w.computed || {};
            const renderedDesc = w.rendered_description || w.description || '';
            const totalSeconds = computed.total_duration_seconds;
            const duration = totalSeconds ? Math.round(totalSeconds / 60) : (typeof w.duration === 'number' ? w.duration : 0);
            const tags = (() => {
              const t = (w as any).tags;
              if (Array.isArray(t)) return t;
              const pj = parseMaybeJson(t);
              return Array.isArray(pj) ? pj : [];
            })();
            
            const workout = {
              id: w.id,
              name: w.name || 'Session',
              type: w.type,
              description: renderedDesc || resolveStrength(mapBike(resolvePaces(w.description || ''))),
              duration,
              intensity: typeof w.intensity === 'string' ? w.intensity : undefined,
              day: dayName,
              completed: false,
              tags,
              // Pass through computed data for PlannedWorkoutView
              computed: computed,
              rendered_description: renderedDesc,
            };
            byWeek[wk] = byWeek[wk] ? [...byWeek[wk], workout] : [workout];
          }
          const weekNumbers = Object.keys(byWeek).map(n=>parseInt(n,10)).sort((a,b)=>a-b);
          const weeksOut = weekNumbers.map(wn => ({
            weekNumber: wn,
            title: `Week ${wn}`,
            focus: '',
            workouts: byWeek[wn],
          }));
          pd.weeks = weeksOut;
        }
      } catch (e) {
        // fall back silently to sessions_by_week normalization
      }

      // Always normalize sessions_by_week → weeks[].workouts[] expected by this view
      if (pd.sessions_by_week) {
        try {
          const weeksOut: any[] = [];
          const sessionsByWeek = pd.sessions_by_week;
          const notesByWeek = pd.notes_by_week || {};

          const weekNumbers = Object.keys(sessionsByWeek)
            .map(n => parseInt(n, 10))
            .filter(n => !Number.isNaN(n))
            .sort((a, b) => a - b);

          for (const w of weekNumbers) {
            const sessions = sessionsByWeek[w] || [];
            const workouts = (sessions as any[]).map((s, idx) => {
              const rawDesc = s.description || '';
              // Baseline helpers (reuse same computation as above)
              const pn2 = bl?.performanceNumbers || {};
              const candidate5k2 = pn2.fiveK_pace || pn2.fiveKPace || pn2.fiveK || null;
              const fiveK: string | null = (candidate5k2 ? String(candidate5k2) : null) as any;
              const easyPace: string | null = (pn2.easyPace ? String(pn2.easyPace) : null) as any;
              const ftp: number | null = (bl?.performanceNumbers?.ftp || null) as any;
              const resolvePaces = (text: string) => {
                let out = text || '';
                if (fiveK) out = out.replaceAll('{5k_pace}', String(fiveK));
                if (easyPace) out = out.replaceAll('{easy_pace}', String(easyPace));
                // Compute offsets
                out = out.replace(/(\d+:\d{2}\/(mi|km))\s*([+\-−])\s*(\d+:\d{2})\/(mi|km)/g, (m, base, u1, sign, t, u2) => {
                  if (u1 !== u2) return m; const off = `${sign}${t}/${u1}`; return ((): string => {
                    const bm = base.match(/(\d+):(\d{2})\/(mi|km)/i); const om = off.match(/^([+\-−])(\d+):(\d{2})\/(mi|km)$/i);
                    if (!bm || !om) return base; const bs = parseInt(bm[1],10)*60+parseInt(bm[2],10); const signc = om[1]==='-'||om[1]==='−'?-1:1; const os = parseInt(om[2],10)*60+parseInt(om[3],10); const unit = bm[3].toLowerCase(); const ns = bs + signc*os; const mm = Math.floor(ns/60); const ss = ns%60; return `${mm}:${String(ss).padStart(2,'0')}/${unit}`;
                  })();
                });
                return out;
              };
              const round = (w: number) => Math.round(w / 5) * 5;
              const resolveStrength = (text: string) => { const pn = bl?.performanceNumbers || {}; const oneRMs = { squat: pn.squat, bench: pn.bench, deadlift: pn.deadlift, overhead: pn.overheadPress1RM } as any; return String(text||'').replace(/(Squat|Back Squat|Bench|Bench Press|Deadlift|Overhead Press|OHP)[^@]*@\s*(\d+)%/gi, (m, lift, pct) => { const key = String(lift).toLowerCase(); let orm: number|undefined = key.includes('squat')?oneRMs.squat : key.includes('bench')?oneRMs.bench : key.includes('deadlift')?oneRMs.deadlift : (key.includes('ohp')||key.includes('overhead'))?oneRMs.overhead : undefined; if (!orm) return m; const w = round(orm * (parseInt(pct,10)/100)); return `${m} — ${w} lb`; }); };
              const mapBike = (text: string) => { if (!ftp) return text; const t = (text||'').toLowerCase(); const add = (lo: number, hi: number) => `${text} — target ${Math.round(lo*ftp)}–${Math.round(hi*ftp)} W`; if (t.includes('vo2')) return add(1.06,1.20); if (t.includes('threshold')) return add(0.95,1.00); if (t.includes('sweet spot')) return add(0.88,0.94); if (t.includes('zone 2')) return add(0.60,0.75); return text; };
              const description = (() => {
                const base = resolveStrength(mapBike(resolvePaces(cleanSessionDescription(rawDesc))));
                // If the session is optional, keep the authored context alongside summary
                if (Array.isArray((s as any).tags) && (s as any).tags.includes('optional')) {
                  const authored = cleanSessionDescription(rawDesc);
                  if (authored && !base.toLowerCase().includes(authored.toLowerCase())) {
                    return `${base} — ${authored}`.trim();
                  }
                }
                return base;
              })();
              const discipline = (s.discipline || inferDisciplineFromText(rawDesc)) as any;
              const mappedType = discipline === 'bike' ? 'ride' : discipline;
              const extracted = extractTypeFromText(rawDesc);
              const typeName = s.type || extracted || '';
              const name = discipline === 'strength' ? 'Strength' : [capitalize(mappedType), typeName].filter(Boolean).join(' ').trim() || 'Session';
              const stepsSummary = summarizeSteps((s as any).steps_preset);
              const stepsPreset = (s as any).steps_preset as string[] | undefined;
              const estFromSteps = estimateMinutesFromSteps(stepsPreset);
              const estFromIntervals = estimateMinutesFromIntervals(stepsPreset, description);
              const duration = (typeof s.duration === 'number' && Number.isFinite(s.duration)) ? s.duration : (estFromIntervals || estFromSteps || estimateMinutesFromDescription(description) || extractMinutesFromText(rawDesc) || 0);
              const base = {
                id: s.id || `${pd.id}-w${w}-${idx}`,
                name,
                type: mappedType || 'run',
                description: [description, stepsSummary.length ? `(${stepsSummary.join(' • ')})` : ''].filter(Boolean).join(' '),
                duration,
                intensity: typeof s.intensity === 'string' ? s.intensity : undefined,
                day: s.day,
                completed: false,
                tags: Array.isArray((s as any).tags) ? (s as any).tags : [],
              } as any;
              if ((s.discipline || mappedType) === 'swim' && Array.isArray((s as any).steps) && (s as any).steps.length > 0) {
                base.intervals = (s as any).steps.map((st: any) => ({ effortLabel: st.effort || st.stroke || 'Swim', duration: 0 }));
              }
              return base;
            });

            weeksOut.push({
              weekNumber: w,
              title: `Week ${w}`,
              focus: Array.isArray(notesByWeek[w]) ? (notesByWeek[w][0] || '') : '',
              workouts,
            });
          }

          // If DB contains skeleton weeks, carry basic meta (weekNumber) ordering
          if (weeksOut.length === 0 && Array.isArray(pd.weeks)) {
            for (const wk of pd.weeks) {
              weeksOut.push({
                weekNumber: wk.weekNumber,
                title: `Week ${wk.weekNumber}`,
                focus: '',
                workouts: [],
              });
            }
          }

          pd.weeks = weeksOut;

          // compute totals for header
          const totalWorkouts = weeksOut.reduce((sum, wk) => sum + (wk.workouts?.length || 0), 0);
          pd.totalWorkouts = totalWorkouts;
        } catch (err) {
          console.error('Error normalizing plan detail:', err);
        }
      }

      setSelectedPlanDetail(pd);
      setSelectedWeek(pd.currentWeek || 1);
      setPlanStatus(pd.status || 'active');
      setCurrentView('detail');
    } else {
      alert('Plan details are not available. Please try again.');
    }
  };

  async function activateOptional(workout: any) {
    try {
      const rowId = workout.id as string;
      setActivatingId(rowId);
      const existingTags: string[] = Array.isArray(workout.tags) ? workout.tags : [];
      const newTags = existingTags.filter((t: string) => String(t).toLowerCase() !== 'optional');
      await supabase
        .from('planned_workouts')
        .update({ tags: newTags })
        .eq('id', rowId);
      // Soft refresh by bumping selectedWeek state
      setSelectedWeek(w => w);
    } finally {
      setActivatingId(null);
    }
  }

  // Auto-open a plan if requested by parent (e.g., from Today's Effort click)
  useEffect(() => {
    (async () => {
      try {
        if (focusPlanId && !selectedPlanDetail) {
          await handlePlanClick(focusPlanId);
          if (typeof focusWeek === 'number' && focusWeek > 0) {
            setSelectedWeek(focusWeek);
          }
        }
      } catch {}
    })();
  }, [focusPlanId, focusWeek]);

  // Ensure week materialized on selection change
  useEffect(() => {
    (async () => {
      try {
        if (!selectedPlanDetail || !selectedPlanDetail.id || !selectedWeek) return;
        // If week has no rows yet, bake & insert just this week
        const { ensureWeekMaterialized } = await import('@/services/plans/ensureWeekMaterialized');
        await ensureWeekMaterialized(String(selectedPlanDetail.id), Number(selectedWeek));
        // Reload plan detail rows from DB to reflect any newly inserted sessions
        try {
          const commonSelect = '*';
          const { data: byLink } = await supabase
            .from('planned_workouts')
            .select(commonSelect)
            .eq('training_plan_id', selectedPlanDetail.id)
            .order('week_number', { ascending: true })
            .order('day_number', { ascending: true });
          if (Array.isArray(byLink) && byLink.length) {
            // Merge into existing selectedPlanDetail.weeks similar to normalize above
            const numToDay = { 1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday' } as Record<number,string>;
            const byWeek: Record<number, any[]> = {};
            for (const w of byLink) {
              const wk = (w as any).week_number || 1;
              const dayName = numToDay[(w as any).day_number as number] || (w as any).day || '';
              const computed = (w as any).computed || {};
              const renderedDesc = (w as any).rendered_description || (w as any).description || '';
              const totalSeconds = computed.total_duration_seconds;
              const duration = totalSeconds ? Math.round(totalSeconds / 60) : (typeof (w as any).duration === 'number' ? (w as any).duration : 0);
              const workout = {
                id: (w as any).id,
                name: (w as any).name || 'Session',
                type: (w as any).type,
                description: renderedDesc,
                duration,
                day: dayName,
                computed
              };
              byWeek[wk] = byWeek[wk] ? [...byWeek[wk], workout] : [workout];
            }
            const clone = { ...selectedPlanDetail } as any;
            const weeksOut: any[] = Object.keys(byWeek).map(n => parseInt(n,10)).sort((a,b)=>a-b).map(wn => ({ weekNumber: wn, title: `Week ${wn}`, focus: '', workouts: byWeek[wn] }));
            clone.weeks = weeksOut;
            setSelectedPlanDetail(clone);
          }
        } catch {}
      } catch {}
    })();
  }, [selectedPlanDetail?.id, selectedWeek]);

  const handleWorkoutClick = (workout: any) => {
    setSelectedWorkout(workout);
    setWorkoutViewMode('summary'); // Reset to summary when opening workout
    setCurrentView('day');
  };

  const handleBackToWeek = () => {
    setCurrentView('detail');
    setSelectedWorkout(null);
    setWorkoutViewMode('summary');
  };

  const handleBack = () => {
    setCurrentView('list');
    setSelectedPlanDetail(null);
  };

  const handleDeletePlan = async () => {
    if (!selectedPlanDetail || !onDeletePlan) return;
    try {
      await onDeletePlan(selectedPlanDetail.id);
      handleBack();
    } catch (error) {
      console.error('Error deleting plan:', error);
    }
  };

  const handleAdjustmentSubmit = async () => {
    if (!adjustmentInput.trim() || isProcessingAdjustment) return;
    
    if (adjustmentsUsed >= adjustmentLimit) {
      setAdjustmentHistory(prev => [...prev, {
        type: 'system',
        message: 'You have reached your adjustment limit. Upgrade to make unlimited plan changes.',
        timestamp: Date.now()
      }]);
      return;
    }

    const userMessage = adjustmentInput.trim();
    setAdjustmentHistory(prev => [...prev, {
      type: 'user',
      message: userMessage,
      timestamp: Date.now()
    }]);

    setAdjustmentInput('');
    setIsProcessingAdjustment(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const response = generateAdjustmentResponse(userMessage);
      setAdjustmentHistory(prev => [...prev, {
        type: 'system',
        message: response,
        timestamp: Date.now()
      }]);
      setAdjustmentsUsed(prev => prev + 1);
    } catch (error) {
      setAdjustmentHistory(prev => [...prev, {
        type: 'system',
        message: 'Sorry, there was an issue processing your adjustment. Please try again.',
        timestamp: Date.now()
      }]);
    } finally {
      setIsProcessingAdjustment(false);
    }
  };

  const generateAdjustmentResponse = (request: string) => {
    const requestLower = request.toLowerCase();
    
    if (requestLower.includes('strength') && requestLower.includes('thursday')) {
      return 'I have moved your strength training sessions to Thursdays. This gives you better recovery between your Tuesday runs and weekend long sessions.';
    }
    
    if (requestLower.includes('easier') || requestLower.includes('less intense')) {
      return 'I have reduced the intensity across your plan by about 15%. Your interval sessions now target RPE 6-7 instead of 7-8.';
    }
    
    if (requestLower.includes('more recovery') || requestLower.includes('rest day')) {
      return 'I have added an extra recovery day to each week and reduced the consecutive training days.';
    }
    
    if (requestLower.includes('weekend') || requestLower.includes('sunday')) {
      return 'I have rearranged your schedule to avoid weekend commitments. Your longer sessions are now spread across weekdays.';
    }
    
    if (requestLower.includes('shorter') || requestLower.includes('time')) {
      return 'I have shortened your sessions to better fit your schedule. Most workouts are now 30-45 minutes.';
    }
    
    if (requestLower.includes('week 3') || requestLower.includes('busy week')) {
      return 'I have modified week 3 to be a lighter recovery week. This will work perfectly for your busy period.';
    }
    
    return 'I have analyzed your request and made adjustments to your plan. The changes maintain the overall training progression while addressing your specific needs.';
  };

  const getWorkoutIcon = (type: string) => {
    switch (type) {
      case 'run': return <Activity className="h-6 w-6" />;
      case 'ride': return <Bike className="h-6 w-6" />;
      case 'swim': return <Waves className="h-6 w-6" />;
      case 'strength': return <Dumbbell className="h-6 w-6" />;
      case 'rest': return <Moon className="h-6 w-6" />;
      default: return <ArrowUpDown className="h-6 w-6" />;
    }
  };
  
  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'Easy': return 'bg-green-100 text-green-800 border-green-200';
      case 'Moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Hard': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCompletionBadge = (workout: any) => {
    if (!workout.completed) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          Planned
        </span>
      );
    }
    
    const ratingColors = {
      1: 'bg-red-100 text-red-800 border-red-200',
      2: 'bg-orange-100 text-orange-800 border-orange-200', 
      3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      4: 'bg-green-100 text-green-800 border-green-200',
      5: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${ratingColors[workout.rating as keyof typeof ratingColors] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
        ✓ {workout.rating}/5
      </span>
    );
  };
  
  const formatDuration = (minutes: number) => {
    if (!minutes && minutes !== 0) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    // Show hours with 'h', minutes as plain number (no trailing 'm')
    return `${hours}h ${mins}`;
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getWeeklyVolume = (week: any) => {
    if (!week || !week.workouts) return 0;
    return week.workouts.reduce((total: number, workout: any) => {
      return total + (workout.duration || 0);
    }, 0);
  };

  // Export selected plan to Markdown (all weeks)
  const exportPlanToMarkdown = (plan: any) => {
    if (!plan) return;
    const fmtHM = (m: number) => {
      const h = Math.floor((m || 0) / 60);
      const md = (m || 0) % 60;
      return `${h}h ${md}m`;
    };

    const lines: string[] = [];
    lines.push(`# ${plan.name || 'Training Plan'}`);
    if (plan.description) lines.push(`${plan.description}`);
    const duration = plan.duration || plan.duration_weeks || (plan.weeks ? plan.weeks.length : undefined);
    if (duration) lines.push(`Duration: ${duration} weeks`);
    lines.push('');

    const weeks: any[] = (plan.weeks || []).slice().sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0));
    const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    for (const wk of weeks) {
      lines.push(`## Week ${wk.weekNumber}${wk.title ? `: ${wk.title}` : ''}`);
      if (wk.focus) lines.push(`> ${wk.focus}`);
      const groups: Record<string, any[]> = {};
      (wk.workouts || []).forEach((w: any) => {
        const d = w.day || 'Unscheduled';
        groups[d] = groups[d] ? [...groups[d], w] : [w];
      });
      const orderedDays = dayOrder.filter(d => groups[d]).concat(Object.keys(groups).filter(k => !dayOrder.includes(k)));
      for (const d of orderedDays) {
        lines.push(`### ${d}`);
        for (const w of groups[d]) {
          const meta: string[] = [];
          if (w.intensity) meta.push(`${w.intensity}`);
          if (typeof w.duration === 'number') meta.push(fmtHM(w.duration));
          lines.push(`- ${w.name}${meta.length ? ` (${meta.join(' • ')})` : ''}`);
          if (w.description) lines.push(`  - ${w.description}`);
        }
        lines.push('');
      }
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(plan.name || 'training-plan').replace(/\s+/g,'-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Day View Rendering with Summary/Edit modes
  if (currentView === 'day' && selectedWorkout) {
    const intervals = selectedWorkout.intervals || [];
    const totalTime = intervals.reduce((sum: number, interval: any) => sum + (interval.duration || 0), 0);

    // SUMMARY MODE - Clean workout overview
    if (workoutViewMode === 'summary') {
      return (
        <div key={selectedWorkout?.id} className="min-h-screen bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
          <main className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
              <button onClick={handleBackToWeek} className="text-gray-600 hover:text-black transition-colors">
                ← Back to Week
              </button>
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-500">
                  {new Date(selectedWorkout.date).toLocaleDateString()}
                </div>
                <button onClick={() => setWorkoutViewMode('edit')} className="text-gray-600 hover:text-black transition-colors">
                  Edit Workout
                </button>
              </div>
            </div>

            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {selectedWorkout.name || 'Untitled Workout'}
              </h1>
              <div className="flex items-center gap-4 text-gray-600">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{formatTime(totalTime)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {getWorkoutIcon(selectedWorkout.type)}
                  <span className="capitalize">{selectedWorkout.type}</span>
                </div>
              </div>
            </div>



            {intervals.length > 0 && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Workout Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{formatTime(totalTime)}</div>
                      <div className="text-sm text-gray-600">Total Time</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{intervals.length}</div>
                      <div className="text-sm text-gray-600">Segments</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {intervals.filter((i: any) => parseInt(i.rpeTarget || '0') >= 7).length}
                      </div>
                      <div className="text-sm text-gray-600">Hard Efforts</div>
                    </div>
                  </div>
                  {selectedWorkout.description && (
                    <p className="text-gray-700 leading-relaxed">{selectedWorkout.description}</p>
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4">Workout Structure</h2>
                  <div className="space-y-3">
                    {intervals.map((interval: any, index: number) => (
                      <div key={interval.id || index} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-600">{index + 1}</span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {interval.effortLabel || `Segment ${index + 1}`}
                            </div>
                            <div className="text-sm text-gray-600">
                              {interval.time || formatTime(interval.duration || 0)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {interval.rpeTarget && (
                            <div className="font-medium text-gray-900">RPE {interval.rpeTarget}</div>
                          )}
                          {interval.paceTarget && (
                            <div className="text-sm text-gray-600">{interval.paceTarget} pace</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedWorkout.coachingNotes && (
              <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <h2 className="text-xl font-semibold text-blue-900 mb-4">Coaching Notes</h2>
                <div className="text-blue-800 leading-relaxed whitespace-pre-line">
                  {selectedWorkout.coachingNotes}
                </div>
              </div>
            )}

            <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Plan Context</h2>
              <p className="text-gray-700 leading-relaxed">
                This workout is part of your Week {selectedWeek} training in the {selectedPlanDetail?.name} plan.
                {isStrengthWorkout 
                  ? ' This strength session supports your primary training by building the muscular foundation needed for improved performance and injury prevention.'
                  : ' This endurance session builds your aerobic capacity and prepares you for the demands of your goal event.'
                }
              </p>
            </div>
          </main>
        </div>
      );
    }

    // EDIT MODE - Full workout builder interface
    return (
      <div className="min-h-screen bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
        <main className="max-w-7xl mx-auto px-3 py-2">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setWorkoutViewMode('summary')}
              className="text-gray-600 hover:text-black transition-colors"
            >
              ← Back to Summary
            </button>
            <div className="text-right text-sm text-gray-500">
              {new Date(selectedWorkout.date).toLocaleDateString()}
            </div>
          </div>

          <div className="mb-4">
            <Input
              value={selectedWorkout.name || 'Untitled Workout'}
              readOnly
              className="border-gray-300 text-lg font-medium min-h-[44px]"
            />
          </div>

          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <Clock className="h-4 w-4" />
              <span>Total Time: {formatTime(totalTime)}</span>
            </div>
          </div>

          {/* STRENGTH WORKOUT DISPLAY */}
          {isStrengthWorkout && strengthExercises.length > 0 && (
            <div className="space-y-4 mb-6">
              {strengthExercises.map((exercise: any, index: number) => (
                <div key={exercise.id || index} className="space-y-4 p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4" />
                    <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                      <Dumbbell className="w-3 h-3 text-gray-400" />
                    </div>
                    <div className="font-medium">{exercise.name}</div>
                    <button className="ml-auto text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button className="text-gray-400 hover:text-red-500 text-sm">
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sets</label>
                      <Input
                        value={exercise.sets || ''}
                        readOnly
                        placeholder="3"
                        className="min-h-[44px]"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reps</label>
                      <Input
                        value={exercise.reps || ''}
                        readOnly
                        placeholder="10"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
                      <Input
                        value={exercise.weight || ''}
                        readOnly
                        placeholder="135"
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  {exercise.weightMode && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        Weight Mode: {exercise.weightMode === 'same' ? 'Same weight all sets' : 'Individual weight per set'}
                      </span>
                    </div>
                  )}

                  {exercise.note && (
                    <div className="text-sm text-gray-600 italic">
                      Note: {exercise.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ENDURANCE WORKOUT DISPLAY */}
          {!isStrengthWorkout && intervals.length > 0 && (
            <div className="space-y-4 mb-6">
              {intervals.map((interval: any, index: number) => (
                <div key={interval.id || index} className="space-y-4 p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4" />
                    <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    </div>
                    <Select defaultValue={interval.effortLabel || `Segment ${index + 1}`}>
                      <SelectTrigger className="w-auto border-none shadow-none p-0 h-auto">
                        <SelectValue />
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Warmup">Warmup</SelectItem>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                        <SelectItem value="Tempo">Tempo</SelectItem>
                        <SelectItem value="Intervals">Intervals</SelectItem>
                        <SelectItem value="Recovery">Recovery</SelectItem>
                        <SelectItem value="Cooldown">Cooldown</SelectItem>
                      </SelectContent>
                    </Select>
                    <button className="ml-auto text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button className="text-gray-400 hover:text-red-500 text-sm">
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                      <Input
                        value={interval.time || formatTime(interval.duration || 0)}
                        readOnly
                        className="min-h-[44px]"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pace {selectedWorkout.type === 'run' ? '(per mi)' : ''}
                      </label>
                      <Input
                        value={interval.paceTarget || ''}
                        readOnly
                        placeholder="8:30"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Distance {selectedWorkout.type === 'run' ? '(mi)' : '(km)'}
                      </label>
                      <Input
                        value={interval.distance || ''}
                        readOnly
                        placeholder="5.0"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">BPM</label>
                      <Input
                        value={interval.bpmTarget || ''}
                        readOnly
                        placeholder="150-160"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">RPE</label>
                      <Input
                        value={interval.rpeTarget || ''}
                        readOnly
                        placeholder="6-7"
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4" />
                    <span className="text-sm text-gray-600">Repeat?</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center mb-6">
            <button className="flex items-center gap-2 mx-auto px-4 py-2 text-gray-600 hover:text-black transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              {isStrengthWorkout ? 'Add Exercise' : 'Add Segment'}
            </button>
          </div>

          {selectedWorkout.coachingNotes && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Coaching Notes</h3>
              <div className="text-sm text-blue-800 whitespace-pre-line">
                {selectedWorkout.coachingNotes}
              </div>
            </div>
          )}

          {selectedWorkout.description && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Description</h3>
              <div className="text-sm text-gray-700">
                {selectedWorkout.description}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Plan Detail View
  if (currentView === 'detail' && selectedPlanDetail) {
    const progress = selectedPlanDetail.duration ? Math.round((selectedPlanDetail.currentWeek / selectedPlanDetail.duration) * 100) : 0;
    const currentWeekData = selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 ? selectedPlanDetail.weeks.find((w: any) => w.weekNumber === selectedWeek) : null;
    const totalVolume = selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 ? selectedPlanDetail.weeks.reduce((total: number, week: any) => total + getWeeklyVolume(week), 0) : 0;
    const averageWeeklyVolume = selectedPlanDetail.duration && selectedPlanDetail.duration > 0 ? Math.round(totalVolume / selectedPlanDetail.duration) : 0;

    return (
      <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-center justify-between">
          <button onClick={handleBack} className="flex items-center gap-2 p-0 h-auto text-gray-600 hover:text-black transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Plans
          </button>
          
          <div className="flex items-center gap-2">
            {planStatus === 'active' ? (
              <button onClick={() => setPlanStatus('paused')} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                <Pause className="h-4 w-4" />
                Pause
              </button>
            ) : (
              <button onClick={() => setPlanStatus('active')} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                <Play className="h-4 w-4" />
                Resume
              </button>
            )}

            <button onClick={() => exportPlanToMarkdown(selectedPlanDetail)} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
              Download
            </button>
            
            <button className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
              <Edit className="h-4 w-4" />
              Modify
            </button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-800 transition-colors">
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Plan</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{selectedPlanDetail.name}"? This will also delete all associated workouts. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeletePlan} className="bg-red-600 hover:bg-red-700">
                    Delete Plan
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{selectedPlanDetail.name}</h1>
                <p className="text-gray-600 mt-1">{selectedPlanDetail.description}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${planStatus === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {planStatus}
              </span>
            </div>
          </div>
          <div className="p-4">
            {/* Compact, single-line stats */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 mb-3">
              <span>
                <span className="font-semibold text-gray-900">{selectedPlanDetail.duration || 0}</span> wk
              </span>
              <span>
                <span className="font-semibold text-gray-900">{selectedPlanDetail.totalWorkouts || 0}</span> workouts
              </span>
              <span>
                <span className="font-semibold text-gray-900">{formatDuration(totalVolume)}</span> total
              </span>
              <span>
                <span className="font-semibold text-gray-900">{formatDuration(averageWeeklyVolume)}</span> avg/wk
              </span>
            </div>

            {/* Slim progress row */}
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Progress</span>
              <span>Week {selectedPlanDetail.currentWeek || 1} of {selectedPlanDetail.duration || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-black rounded-full h-1.5 transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>

        {selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 && (
          <div className="flex items-center gap-8 border-b border-gray-200">
            <button
              onClick={() => setViewMode('summary')}
              className={`pb-3 transition-colors ${viewMode === 'summary' ? 'text-black border-b-2 border-black' : 'text-gray-600 hover:text-black'}`}
            >
              Summary
            </button>
            <button
              onClick={() => setViewMode('adjustments')}
              className={`pb-3 transition-colors ${viewMode === 'adjustments' ? 'text-black border-b-2 border-black' : 'text-gray-600 hover:text-black'}`}
            >
              Ask for adjustments
            </button>
          </div>
        )}

        {viewMode === 'adjustments' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">
                Plan adjustments: {adjustmentsUsed} of {adjustmentLimit} used
              </div>
              {adjustmentsUsed >= adjustmentLimit && (
                <button className="text-sm text-blue-600 hover:text-blue-800">
                  Upgrade for unlimited adjustments
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Textarea
                value={adjustmentInput}
                onChange={(e) => setAdjustmentInput(e.target.value)}
                placeholder="Describe what you'd like to change about your plan..."
                className="flex-1 min-h-[44px] max-h-[120px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAdjustmentSubmit();
                  }
                }}
                disabled={adjustmentsUsed >= adjustmentLimit}
              />
              <button
                onClick={handleAdjustmentSubmit}
                disabled={!adjustmentInput.trim() || isProcessingAdjustment || adjustmentsUsed >= adjustmentLimit}
                className="h-auto px-4 py-2 text-gray-600 hover:text-black transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 min-h-[200px] max-h-[400px] overflow-y-auto">
              {adjustmentHistory.length === 0 ? (
                <div className="text-center py-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    What would you like to adjust about your plan?
                  </h3>
                  
                  <div className="space-y-2 max-w-md mx-auto">
                    {[
                      "Move strength training to Thursday",
                      "Make week 2 easier",
                      "I need more recovery days",
                      "Avoid weekend workouts",
                      "Shorter session times"
                    ].map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => setAdjustmentInput(suggestion)}
                        className="block w-full p-3 text-left text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                adjustmentHistory.map((message, index) => (
                  <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-2xl p-4 rounded-lg ${message.type === 'user' ? 'bg-black text-white' : 'bg-gray-100 text-gray-900'}`}>
                      <p className="leading-relaxed">{message.message}</p>
                    </div>
                  </div>
                ))
              )}
              
              {isProcessingAdjustment && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                      <span className="text-sm text-gray-600 ml-2">Processing your adjustment...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 && (
              <div className="flex items-center gap-6 overflow-x-auto py-4">
                {selectedPlanDetail.weeks.map((week: any) => (
                  <button
                    key={week.weekNumber}
                    onClick={() => setSelectedWeek(week.weekNumber)}
                    className={`whitespace-nowrap pb-2 transition-colors ${selectedWeek === week.weekNumber ? 'text-black border-b-2 border-black font-medium' : 'text-gray-600 hover:text-black'}`}
                  >
                    Week {week.weekNumber}
                    {week.weekNumber === selectedPlanDetail.currentWeek && (
                      <span className="ml-2 text-xs text-blue-600">Current</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {currentWeekData && (
              <div className="border border-gray-200 rounded-lg">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold mb-2">
                    Week {currentWeekData.weekNumber}: {currentWeekData.title}
                  </h2>
                  <p className="text-gray-600 mb-4">{currentWeekData.focus}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatDuration(getWeeklyVolume(currentWeekData))} total
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {currentWeekData.workouts ? currentWeekData.workouts.filter((w: any) => w.type !== 'rest').length : 0} workouts
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {(() => {
                      const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
                      const groups: Record<string, any[]> = {};
                      (currentWeekData.workouts || []).forEach((w: any) => {
                        const d = w.day || 'Unscheduled';
                        groups[d] = groups[d] ? [...groups[d], w] : [w];
                      });
                      const keys = dayOrder.filter(d => groups[d]).concat(Object.keys(groups).filter(k => !dayOrder.includes(k)));
                      return keys.map(day => (
                        <div key={day} className="border border-gray-200 rounded">
                          <div className="px-3 py-2 text-sm font-medium">{day}</div>
                          <div className="px-3 pb-3 space-y-3">
                            {groups[day].filter((w:any)=>!(Array.isArray(w.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional'))).map((workout: any, index: number) => (
                              <div
                                key={workout.id || `workout-${day}-${index}`}
                                onClick={() => handleWorkoutClick(workout)}
                                className={`p-4 rounded-lg border transition-colors cursor-pointer ${workout.type === 'rest' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                              >
                                {workout.computed && workout.computed.steps && workout.computed.total_duration_seconds ? (
                                  <WorkoutSummaryView
                                    computed={workout.computed}
                                    baselines={{
                                      fiveK_pace_sec_per_mi: (workout as any).fiveK_pace_sec_per_mi,
                                      easy_pace_sec_per_mi: (workout as any).easy_pace_sec_per_mi,
                                      ftp: (workout as any).ftp,
                                      swim_pace_per_100_sec: (workout as any).swim_pace_per_100_sec
                                    }}
                                    workoutType={workout.name || 'Session'}
                                    description={workout.rendered_description || workout.description}
                                    compact={true}
                                  />
                                ) : (
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <div className="font-medium flex items-center gap-2">
                                        <span>{workout.name}</span>
                                        {typeof workout.duration === 'number' && (
                                          <span className="px-2 py-0.5 text-xs rounded bg-gray-100 border border-gray-200 text-gray-800">
                                            {formatDuration(workout.duration)}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-sm text-gray-600 mt-1">{workout.description}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                            {groups[day].some((w:any)=>Array.isArray(w.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional')) && (
                              <div className="mt-3">
                                <div className="text-xs font-medium text-gray-700 mb-1">Optional sessions — select one supplemental session to add to week</div>
                                <div className="space-y-2">
                                  {groups[day].filter((w:any)=>Array.isArray(w.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional')).map((workout:any, idx:number)=> (
                                    <div key={workout.id || `opt-${day}-${idx}`} className="p-3 rounded border border-dashed">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                          <div className="font-medium flex items-center gap-2">
                                            <span>{workout.name || (workout.type||'Session')}</span>
                                            {(() => {
                                              const sec = workout?.computed?.total_duration_seconds;
                                              const min = (typeof sec === 'number' && sec > 0) ? Math.round(sec/60) : (typeof workout.duration === 'number' ? workout.duration : null);
                                              return (typeof min === 'number') ? (
                                                <span className="px-2 py-0.5 text-xs rounded bg-gray-100 border border-gray-200 text-gray-800">{formatDuration(min)}</span>
                                              ) : null;
                                            })()}
                                            <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">Optional</span>
                                          </div>
                                          <div className="text-sm text-gray-600 mt-1">{workout.rendered_description || workout.description}</div>
                                        </div>
                                        <Button size="sm" disabled={activatingId===workout.id} onClick={(e)=>{e.stopPropagation(); activateOptional(workout);}}>
                                          {activatingId===workout.id? 'Adding…':'Add to week'}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {(!selectedPlanDetail.weeks || selectedPlanDetail.weeks.length === 0) && (
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Plan Details Loading</h3>
                <p className="text-gray-600 mb-4">Detailed workout information is being prepared...</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Plans List View
  return (
    <div className="space-y-6" style={{fontFamily: 'Inter, sans-serif'}}>
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-2 p-0 h-auto text-gray-600 hover:text-black transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>
        
        {/* Quick Actions */}
        <div className="flex gap-2">
          {plannedWorkouts.length > 0 && (
            <>
              <Button
                onClick={() => onBuildWorkout('run', 'plans')}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                + Add Workout
              </Button>
              <Button
                onClick={() => { try { (window as any).appNavigate?.('/demo'); } catch { window.location.assign('/demo'); } }}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                View All ({plannedWorkouts.length})
              </Button>
            </>
          )}
        </div>
      </div>

      {currentPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Current Plans</h2>
          {currentPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => handlePlanClick(plan.id)}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg border border-gray-200"
            >
              <div className="font-medium">{plan.name} - Wk {plan.currentWeek}</div>
              <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
            </div>
          ))}
        </div>
      )}

      {completedPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Completed Plans</h2>
          {completedPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => handlePlanClick(plan.id)}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg border border-gray-200"
            >
              <div className="font-medium">{plan.name}</div>
              <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
              <div className="text-xs text-green-600 mt-1">✓ Completed</div>
            </div>
          ))}
        </div>
      )}

      {/* Planned Workouts Section (hidden per design: planned visible in plan view and calendar) */}

      {currentPlans.length === 0 && completedPlans.length === 0 && plannedWorkouts.length === 0 && (
        <div className="text-center py-8">
          <h2 className="text-lg font-medium text-gray-900 mb-2">No Plans Yet</h2>
          <p className="text-gray-600 mb-4">Use "Build me a plan" in the Builder tab to create your first training plan, or create individual workouts in the Builder tab</p>
        </div>
      )}
    </div>
  );
};

export default AllPlansInterface;