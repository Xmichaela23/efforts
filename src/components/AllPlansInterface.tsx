import React, { useState, useEffect, useRef } from 'react';
import { normalizePlannedSession, normalizeStructuredSession } from '@/services/plans/normalizer';
import { resolveTargets } from '@/services/plans/targets';
import { expand } from '@/services/plans/expander';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Play, Pause, Edit, Trash2, Calendar, Clock, Target, Activity, Bike, Waves, Dumbbell, ChevronDown, Moon, ArrowUpDown, Send } from 'lucide-react';
import PlannedWorkoutSummary from './PlannedWorkoutSummary';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
// Planned workouts hook deprecated; unified server paths are the source of truth
import { useAppContext } from '@/contexts/AppContext';
import { getDisciplineColor } from '@/lib/utils';
// PlannedWorkoutView is deprecated; unified view replaces it
import WorkoutSummaryView from './WorkoutSummaryView';
import UnifiedWorkoutView from './UnifiedWorkoutView';
// @ts-ignore
import optionalUiSpec from '@/services/plans/optional-ui-spec.json';

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
  // Planned workouts are sourced via unified server paths now
  const plannedWorkouts: any[] = [];
  const { loadUserBaselines, updatePlan, pausePlan, endPlan } = useAppContext();
  const [baselines, setBaselines] = useState<any>(null);
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'day'>(focusPlanId ? 'detail' : 'list');
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<any>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [planStatus, setPlanStatus] = useState<string>('active');
  const [viewMode, setViewMode] = useState<'summary' | 'adjustments'>('summary');
  const [activatingId, setActivatingId] = useState<string | null>(null);
  // Gate weekly render while week is being materialized/refetched to avoid flicker
  const [weekLoading, setWeekLoading] = useState<boolean>(false);
  const weekCacheRef = useRef<Map<string, any[]>>(new Map());
  
  // Add workout edit mode state
  const [workoutViewMode, setWorkoutViewMode] = useState<'summary' | 'edit'>('summary');

  // Plan adjustment state
  const [adjustmentInput, setAdjustmentInput] = useState('');
  const [adjustmentHistory, setAdjustmentHistory] = useState<Array<{type: 'user' | 'system', message: string, timestamp: number}>>([]);
  const [isProcessingAdjustment, setIsProcessingAdjustment] = useState(false);
  const [adjustmentsUsed, setAdjustmentsUsed] = useState(0);
  const [adjustmentLimit] = useState(3);
  const [showPlanDesc, setShowPlanDesc] = useState(false);

  // Load baselines for weekly summaries (pace/power/loads)
  useEffect(() => {
    (async () => {
      try {
        const b = await loadUserBaselines?.();
        if (b) setBaselines(b);
      } catch {}
    })();
  }, [loadUserBaselines]);

  const buildWeeklySubtitle = (workout: any): string | undefined => {
    try {
      const pn = (baselines as any)?.performanceNumbers || {};
      // Swim: prefer a drill-aware summary using tokens or computed steps
      try {
        const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
        if (disc === 'swim') {
          const parts: string[] = [];
          // 1) Try tokens (covers WU/CD/pull/kick/aerobic and named drills)
          const stepsTok: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t:any)=>String(t)) : [];
          if (stepsTok.length) {
            let wu: string | null = null, cd: string | null = null;
            const drills: string[] = []; const pulls: string[] = []; const kicks: string[] = []; const aerobics: string[] = [];
            stepsTok.forEach((t)=>{
              const s = String(t).toLowerCase();
              let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
              if (m) { const txt = `${parseInt(m[1],10)} ${m[2].toLowerCase()}`; if(/warmup/i.test(s)) wu = `WU ${txt}`; else cd = `CD ${txt}`; return; }
              m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
              if (m) { const name=m[1].replace(/_/g,' '); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const r=m[5]?` @ :${parseInt(m[5],10)}r`:''; drills.push(`${name} ${reps}x${dist}${r}`); return; }
              m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
              if (m) { const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const name=m[4].replace(/_/g,' '); drills.push(`${name} ${reps}x${dist}`); return; }
              m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
              if (m) { const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const r=m[5]?` @ :${parseInt(m[5],10)}r`:''; (m[1]==='pull'?pulls:kicks).push(`${reps}x${dist}${r}`); return; }
              m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
              if (m) { const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const r=m[4]?` @ :${parseInt(m[4],10)}r`:''; aerobics.push(`${reps}x${dist}${r}`); return; }
            });
            if (wu) parts.push(wu);
            if (drills.length) parts.push(`Drills: ${Array.from(new Set(drills)).join(', ')}`);
            if (pulls.length) parts.push(`Pull ${Array.from(new Set(pulls)).join(', ')}`);
            if (kicks.length) parts.push(`Kick ${Array.from(new Set(kicks)).join(', ')}`);
            if (aerobics.length) parts.push(`Aerobic ${Array.from(new Set(aerobics)).join(', ')}`);
            if (cd) parts.push(cd);
            if (parts.length) return parts.join(' • ');
          }
          // 2) Fallback to computed steps: summarize drills present even if tokens missing in this view model
          const compSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
          if (compSteps.length) {
            const drillMap = new Map<string, { reps:number; eachYd?:number }>();
            compSteps.forEach((st:any)=>{
              const label = String((st?.label || st?.name || '')).trim();
              const isDrill = String(st?.effortLabel||'').toLowerCase()==='drill' || String(st?.type||'').toLowerCase()==='drill';
              if (!isDrill) return;
              const yd = typeof st?.distanceMeters==='number' ? Math.round((st.distanceMeters||0)/0.9144) : undefined;
              const key = label || 'drill';
              const cur = drillMap.get(key) || { reps:0, eachYd: yd };
              cur.reps += 1; if (yd && !cur.eachYd) cur.eachYd = yd; drillMap.set(key, cur);
            });
            if (drillMap.size) {
              const drillParts = Array.from(drillMap.entries()).map(([name, v])=> name==='drill' ? `${v.reps}x${v.eachYd||''}` : `${name} ${v.reps}x${v.eachYd||''}`);
              parts.push(`Drills: ${drillParts.join(', ')}`);
              return parts.join(' • ');
            }
          }
        }
      } catch {}
      const structured = (workout as any)?.workout_structure;
      if (structured && typeof structured === 'object') {
        try {
          const res = normalizeStructuredSession(workout, { performanceNumbers: pn });
          if (res?.friendlySummary) return res.friendlySummary;
        } catch {}
      }
      const friendly = String((workout as any)?.friendly_summary || '').trim();
      // If this is a swim with explicit drills in tokens, prefer token-derived subtitle over stored friendly text
      try {
        const discCheck = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
        const stepsCheck: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t:any)=>String(t).toLowerCase()) : [];
        const hasDrills = discCheck==='swim' && stepsCheck.some(t=>/swim_drill[s]?_/i.test(t));
        if (!hasDrills && friendly) return friendly;
        // else fall through to drill-aware token summary below
      } catch {}
      if (friendly && !/swim/i.test(String((workout as any)?.type || (workout as any)?.discipline || ''))) return friendly;
      const desc = String((workout as any)?.description || '').trim();
      // Swim drill-aware fallback from tokens when no friendly summary exists
      try {
        const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
        const steps: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t:any)=>String(t)) : [];
        if (disc === 'swim' && steps.length) {
          const parts: string[] = [];
          let wu: string | null = null, cd: string | null = null;
          const drills: string[] = [];
          const pulls: string[] = [];
          const kicks: string[] = [];
          const aerobics: string[] = [];
          steps.forEach((t: string) => {
            const s = t.toLowerCase();
            let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
            if (m) { const txt = `${parseInt(m[1],10)} ${m[2].toLowerCase()}`; if (/warmup/i.test(s)) wu = `WU ${txt}`; else cd = `CD ${txt}`; return; }
            m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const name=m[1].replace(/_/g,' '); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const r = m[5]?` @ :${parseInt(m[5],10)}r`:''; drills.push(`${name} ${reps}x${dist}${r}`); return; }
            m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
            if (m) { const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const name=m[4].replace(/_/g,' '); drills.push(`${name} ${reps}x${dist}`); return; }
            m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const r=m[5]?` @ :${parseInt(m[5],10)}r`:''; if(m[1]==='pull') pulls.push(`${reps}x${dist}${r}`); else kicks.push(`${reps}x${dist}${r}`); return; }
            m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const r=m[4]?` @ :${parseInt(m[4],10)}r`:''; aerobics.push(`${reps}x${dist}${r}`); return; }
          });
          if (wu) parts.push(wu);
          if (drills.length) parts.push(`Drills: ${Array.from(new Set(drills)).join(', ')}`);
          if (pulls.length) parts.push(`Pull ${Array.from(new Set(pulls)).join(', ')}`);
          if (kicks.length) parts.push(`Kick ${Array.from(new Set(kicks)).join(', ')}`);
          if (aerobics.length) parts.push(`Aerobic ${Array.from(new Set(aerobics)).join(', ')}`);
          if (cd) parts.push(cd);
          if (parts.length) return parts.join(' • ');
        }
      } catch {}
      return desc || undefined;
    } catch { return undefined; }
  };

  // Weekly renderer: grouped summary lines (WU / repeats / CD) with pace/power ranges
  const WeeklyLines: React.FC<{ workout: any }> = React.memo(({ workout }) => {
    try {
      const disc = String((workout as any)?.type||'').toLowerCase();
      const hints = (workout as any)?.export_hints || {};
      const lines = React.useMemo(() => {
        const out: string[] = [];
        // Swim grouping from tokens
        if (disc==='swim') {
          try {
            const toks: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t:any)=>String(t)) : [];
            if (toks.length) {
              let wu: string | null = null, cd: string | null = null; const drills: string[] = []; const pulls: string[] = []; const kicks: string[] = []; const aerobics: string[] = [];
              toks.forEach((t)=>{
                const s = String(t).toLowerCase();
                let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i); if (m) { const txt = `${parseInt(m[1],10)} ${m[2].toLowerCase()}`; if(/warmup/i.test(s)) wu = `Warm‑up ${txt}`; else cd = `Cool‑down ${txt}`; return; }
                m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i); if (m) { const name=m[1].replace(/_/g,' '); drills.push(`${name} ${parseInt(m[2],10)}x${parseInt(m[3],10)}`); return; }
                m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i); if (m) { const name=m[4].replace(/_/g,' '); drills.push(`${name} ${parseInt(m[1],10)}x${parseInt(m[2],10)}`); return; }
                m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i); if (m) { const kind=m[1]==='pull'?'Pull':'Kick'; const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); (m[1]==='pull'?pulls:kicks).push(`${reps}x${dist}`); return; }
                m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i); if (m) { const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); aerobics.push(`${reps}x${dist}`); return; }
              });
              if (wu) out.push(`1 × ${wu}`);
              if (drills.length) out.push(`Drills ${Array.from(new Set(drills)).join(', ')}`);
              if (pulls.length) out.push(`Pull ${Array.from(new Set(pulls)).join(', ')}`);
              if (kicks.length) out.push(`Kick ${Array.from(new Set(kicks)).join(', ')}`);
              if (aerobics.length) out.push(`Aerobic ${Array.from(new Set(aerobics)).join(', ')}`);
              if (cd) out.push(`1 × ${cd}`);
            }
          } catch {}
        }
        const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
        if (steps.length) {
          const tolQual: number = (typeof hints?.pace_tolerance_quality==='number' ? hints.pace_tolerance_quality : 0.04);
          const tolEasy: number = (typeof hints?.pace_tolerance_easy==='number' ? hints.pace_tolerance_easy : 0.06);
          const fmtTime = (s:number)=>{ const x=Math.max(1,Math.round(Number(s)||0)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
          // Use server-processed pace ranges instead of client-side calculations
          const paceStrWithRange = (paceTarget?: string, kind?: string, paceRange?: any) => {
            try {
              // Priority 1: Use server-processed pace_range object
              if (paceRange && typeof paceRange === 'object' && paceRange.lower && paceRange.upper) {
                const formatPace = (sec: number) => {
                  const mins = Math.floor(sec / 60);
                  const secs = Math.round(sec % 60);
                  return `${mins}:${secs.toString().padStart(2, '0')}`;
                };
                return `${formatPace(paceRange.lower)}–${formatPace(paceRange.upper)}/mi`;
              }
              
              // Priority 2: Use server-processed pace_range array
              if (Array.isArray(paceRange) && paceRange.length === 2 && paceRange[0] && paceRange[1]) {
                return `${paceRange[0]}–${paceRange[1]}`;
              }
              
              // Priority 3: Fall back to single pace target (no range calculation)
              return paceTarget || undefined;
            } catch { return undefined; }
          };
          const powerStr = (st:any) => (st?.powerRange && typeof st.powerRange.lower==='number' && typeof st.powerRange.upper==='number') ? `${Math.round(st.powerRange.lower)}–${Math.round(st.powerRange.upper)} W` : undefined;
          let i = 0;
          while (i < steps.length) {
            const st:any = steps[i];
            const kind = String(st?.kind||'').toLowerCase();
            if (kind==='warmup' && typeof st?.seconds==='number') {
              const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'warmup', st?.pace_range);
              out.push(`1 × Warm‑up ${fmtTime(st.seconds)}${pace?` (${pace})`:''}`);
              i += 1; continue;
            }
            if (kind==='cooldown' && typeof st?.seconds==='number') {
              const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'cooldown', st?.pace_range);
              out.push(`1 × Cool‑down ${fmtTime(st.seconds)}${pace?` (${pace})`:''}`);
              i += 1; continue;
            }
            const isWork = (x:any)=> String((x?.kind||'')).toLowerCase()==='work' || String((x?.kind||'')).toLowerCase()==='steady' || String((x?.kind||''))==='interval_work';
            const isRec = (x:any)=> String((x?.kind||'')).toLowerCase()==='recovery' || /rest/i.test(String(x?.label||''));
            if (isWork(st)) {
              const workLabel = (()=>{
                if (typeof st?.distanceMeters==='number' && st.distanceMeters>0) return `${Math.round(st.distanceMeters)} m`;
                if (typeof st?.seconds==='number' && st.seconds>0) return fmtTime(st.seconds);
                return 'interval';
              })();
              const workPace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined, st?.kind, st?.pace_range);
              const workPower = powerStr(st);
              const next = steps[i+1];
              const hasRec = next && isRec(next);
              const restLabel = hasRec ? (()=>{
                if (typeof next?.seconds==='number' && next.seconds>0) return fmtTime(next.seconds);
                if (typeof next?.distanceMeters==='number' && next.distanceMeters>0) return `${Math.round(next.distanceMeters)} m`;
                return 'rest';
              })() : undefined;
              const restPace = hasRec ? paceStrWithRange(typeof next?.paceTarget==='string'?next.paceTarget:undefined, 'recovery', next?.pace_range) : undefined;
              const restPower = hasRec ? powerStr(next) : undefined;
              let count = 0; let j = i;
              while (j < steps.length) {
                const a = steps[j]; const b = steps[j+1];
                if (!isWork(a)) break;
                const aLabel = (typeof a?.distanceMeters==='number' && a.distanceMeters>0) ? `${Math.round(a.distanceMeters)} m` : (typeof a?.seconds==='number' ? fmtTime(a.seconds) : 'interval');
                const aPace = paceStrWithRange(typeof a?.paceTarget==='string'?a.paceTarget:undefined, a?.kind, a?.pace_range);
                const aPow = powerStr(a);
                const bLabel = (b && isRec(b)) ? ((typeof b?.seconds==='number' && b.seconds>0) ? fmtTime(b.seconds) : (typeof b?.distanceMeters==='number' && b.distanceMeters>0 ? `${Math.round(b.distanceMeters)} m` : 'rest')) : undefined;
                const bPace = (b && isRec(b)) ? paceStrWithRange(typeof b?.paceTarget==='string'?b.paceTarget:undefined, 'recovery', b?.pace_range) : undefined;
                const bPow = (b && isRec(b)) ? powerStr(b) : undefined;
                const sameWork = (aLabel===workLabel) && (aPace===workPace) && (aPow===workPower);
                const sameRest = (!hasRec && !b) || (!!hasRec && !!b && isRec(b) && bLabel===restLabel && bPace===restPace && bPow===restPower);
                if (!sameWork || !sameRest) break;
                count += 1; j += hasRec ? 2 : 1;
              }
              const workAnno = workPace ? ` (${workPace})` : (workPower?` (${workPower})`:'' );
              const restAnno = hasRec ? (restPace ? ` ${restLabel} (${restPace})` : (restPower?` ${restLabel} (${restPower})` : ` ${restLabel}`)) : '';
              out.push(`${count} × ${workLabel}${workAnno}${restAnno}`);
              i = j; continue;
            }
            if (typeof st?.seconds==='number') { out.push(`1 × ${fmtTime(st.seconds)}`); i+=1; continue; }
            if (typeof st?.distanceMeters==='number') { out.push(`1 × ${Math.round(st.distanceMeters)} m`); i+=1; continue; }
            i += 1;
          }
        }
        if (!out.length) {
          const txt = buildWeeklySubtitle(workout) || '';
          if (txt) out.push(txt);
          else out.push(String((workout as any).rendered_description || (workout as any).description || ''));
        }
        return out;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [disc, (workout as any)?.id, (workout as any)?.computed?.total_duration_seconds]);
      return (<ul className="list-disc pl-5">{lines.map((ln,idx)=>(<li key={idx}>{ln}</li>))}</ul>);
    } catch { return (<span>{(workout as any).rendered_description || (workout as any).description}</span>); }
  });

  // Calculate current week based on plan start date and today's date
  const calculateCurrentWeek = async (planId: string): Promise<number> => {
    try {
      // Get plan's start date from planned_workouts (Week 1 Monday)
      const { data: w1 } = await supabase
        .from('planned_workouts')
        .select('date, day_number')
        .eq('training_plan_id', planId)
        .eq('week_number', 1)
        .order('day_number', { ascending: true })
        .limit(1);
      
      if (Array.isArray(w1) && w1.length > 0) {
        const anchor = w1[0] as any;
        const startDate = new Date(anchor.date);
        const today = new Date();
        
        // Calculate days difference
        const diffTime = today.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        // Calculate week number (1-based)
        const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);
        
        console.log('📅 Current week calculation:', {
          startDate: anchor.date,
          today: today.toISOString().split('T')[0],
          diffDays,
          calculatedWeek: weekNumber
        });
        
        return weekNumber;
      }
      
      // Fallback: try to get start date from plan config
      const { data: planRow } = await supabase
        .from('plans')
        .select('config')
        .eq('id', planId)
        .maybeSingle();
      
      if (planRow?.config?.user_selected_start_date) {
        const startDate = new Date(planRow.config.user_selected_start_date);
        const today = new Date();
        
        const diffTime = today.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);
        
        console.log('📅 Current week calculation (from config):', {
          startDate: planRow.config.user_selected_start_date,
          today: today.toISOString().split('T')[0],
          diffDays,
          calculatedWeek: weekNumber
        });
        
        return weekNumber;
      }
    } catch (error) {
      console.error('Error calculating current week:', error);
    }
    
    // Default to week 1 if calculation fails
    return 1;
  };

  const handlePlanClick = async (planId: string) => {
    // Guard: if we already have this plan open in detail view, skip expensive re-load
    if (selectedPlanDetail?.id === planId && currentView === 'detail') {
      return;
    }
    let planDetail = detailedPlans[planId as keyof typeof detailedPlans];

    // Parse JSON-string fields persisted in plans row
    if (planDetail) {
      const tryParse = (v: any) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
      if (typeof planDetail.weeks === 'string') {
        try {
          planDetail.weeks = JSON.parse(planDetail.weeks);
        } catch (error) {
          console.error('Error parsing weeks JSON:', error);
        }
      }
      // Ensure weekly_summaries is an object even if stored as text
      if (planDetail.weekly_summaries && typeof planDetail.weekly_summaries === 'string') {
        planDetail.weekly_summaries = tryParse(planDetail.weekly_summaries);
      }
      if (planDetail.notes_by_week && typeof planDetail.notes_by_week === 'string') {
        planDetail.notes_by_week = tryParse(planDetail.notes_by_week);
      }
      if (planDetail.template && typeof planDetail.template === 'string') {
        planDetail.template = tryParse(planDetail.template);
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
      
      // Removed legacy fallback fetch for weekly_summaries/template from plans.
      // Weekly summaries should be provided via pd.config.weekly_summaries when present.

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

      // Prefer week-scoped planned_workouts only (on-demand materialization)
      try {
        const commonSelect = '*';
        const wk = selectedWeek || 1;
        // Compute Monday–Sunday ISO window for selected week from the plan's Week 1 anchor
        const weekStartISO = (()=>{
          try {
            const w1 = (pd.weeks && pd.weeks[0] && pd.weeks[0].workouts && pd.weeks[0].workouts[0] && pd.weeks[0].workouts[0].date) || null;
            const ref = new Date(w1 || new Date());
            const js = ref.getDay(); const mon = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ((js + 6)%7));
            const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + (wk-1)*7);
            const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
            return `${y}-${m}-${dd}`;
          } catch { return undefined; }
        })();
        const weekEndISO = (()=>{
          try {
            const s = weekStartISO ? new Date(weekStartISO) : new Date();
            const e = new Date(s.getFullYear(), s.getMonth(), s.getDate()+6);
            const y=e.getFullYear(), m=String(e.getMonth()+1).padStart(2,'0'), dd=String(e.getDate()).padStart(2,'0');
            return `${y}-${m}-${dd}`;
          } catch { return undefined; }
        })();
        // Skip invoking here to avoid load storms; Calendar/TodaysEffort already warms cache
        const { data: mat, error: e1 } = await supabase
          .from('planned_workouts')
          .select(commonSelect)
          .eq('training_plan_id', planId)
          .eq('week_number', wk)
          .order('day_number', { ascending: true });
        if (!e1 && Array.isArray(mat) && mat.length > 0) {
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
            if (fiveK) out = out.split('{5k_pace}').join(String(fiveK));
            if (easyPace) out = out.split('{easy_pace}').join(String(easyPace));
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
          // Client-side strength calculations removed - server handles all 1RM calculations
          // Power ranges now provided by server - no client-side FTP calculation needed
          const mapBike = (text: string) => text;

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
            // Parse steps_preset/export_hints/intervals which may be JSON strings
            const stepsPresetParsed = parseMaybeJson((w as any).steps_preset);
            const exportHintsParsed = parseMaybeJson((w as any).export_hints);
            const intervalsParsed = parseMaybeJson((w as any).intervals);
            const tags = (() => {
              const t = (w as any).tags;
              if (Array.isArray(t)) return t;
              const pj = parseMaybeJson(t);
              return Array.isArray(pj) ? pj : [];
            })();
            // Optional view-scoped overrides and expansion specs (JSONB or string)
            const displayOverrides = parseMaybeJson((w as any).display_overrides) || null;
            const expandSpec = parseMaybeJson((w as any).expand_spec) || null;
            const paceAnnotation = null; // DB column not present; may be derived from tags elsewhere
            
            const workout = {
              id: w.id,
              name: w.name || 'Session',
              type: (String((w as any).type).toLowerCase() === 'bike' ? 'ride' : (w as any).type) as any,
              description: renderedDesc || mapBike(resolvePaces(w.description || '')),
              duration,
              intensity: typeof w.intensity === 'string' ? w.intensity : undefined,
              day: dayName,
              completed: false,
              tags,
              // Pass through computed data for PlannedWorkoutView
              computed: computed,
              rendered_description: renderedDesc,
              // Provide raw structures to Planned view so it can derive targets per-rep
              steps_preset: Array.isArray(stepsPresetParsed) ? stepsPresetParsed : null,
              export_hints: typeof exportHintsParsed === 'object' && exportHintsParsed ? exportHintsParsed : null,
              intervals: Array.isArray(intervalsParsed) ? intervalsParsed : null,
              // Include server-derived strength exercises for grouped display
              strength_exercises: Array.isArray((w as any).strength_exercises) ? (w as any).strength_exercises : undefined,
              display_overrides: displayOverrides,
              expand_spec: expandSpec,
              pace_annotation: paceAnnotation,
            };
            byWeek[wk] = byWeek[wk] ? [...byWeek[wk], workout] : [workout];
          }
          const wn = wk;
          const weeksOut = [{ weekNumber: wn, title: `Week ${wn}`, focus: '', workouts: byWeek[wn]||[] }];
          pd.weeks = weeksOut;
        }
      } catch (e) {
        // fall back silently to sessions_by_week normalization
      }

      // Only normalize the currently selected week from sessions_by_week to avoid heavy render
      if (pd.sessions_by_week) {
        try {
          const weeksOut: any[] = [];
          const sessionsByWeek = pd.sessions_by_week;
          const notesByWeek = pd.notes_by_week || {};

          const wk = selectedWeek || 1;
          const weekNumbers = [wk];

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
                if (fiveK) out = out.split('{5k_pace}').join(String(fiveK));
                if (easyPace) out = out.split('{easy_pace}').join(String(easyPace));
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
              // Client-side strength calculations removed - server handles all 1RM calculations
              // Power ranges now provided by server - no client-side FTP calculation needed
              const mapBike = (text: string) => text;
              const description = (() => {
                const base = mapBike(resolvePaces(cleanSessionDescription(rawDesc)));
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
              const lowerText = String(rawDesc || '').toLowerCase();
              const lowerSteps = Array.isArray((s as any).steps_preset) ? (s as any).steps_preset.join(' ').toLowerCase() : '';
              const tagsLower: string[] = Array.isArray((s as any).tags) ? (s as any).tags.map((t: any) => String(t).toLowerCase()) : [];
              const hasTag = (t: string) => tagsLower.includes(t.toLowerCase());
              const contains = (needle: string) => lowerText.includes(needle.toLowerCase()) || lowerSteps.includes(needle.toLowerCase());
              // Parse view/expansion hints encoded in tags (schema-safe)
              const parseExpandSpecFromTags = () => {
                const rawTags: string[] = Array.isArray((s as any).tags) ? (s as any).tags.map((t:any)=>String(t)) : [];
                const out: any = {};
                const idPrefixTag = rawTags.find(t=>/^idprefix:/i.test(String(t)));
                if (idPrefixTag) out.id_prefix = String(idPrefixTag.split(':')[1]||'').trim();
                const expandTag = rawTags.find(t=>/^expand:/i.test(String(t)));
                if (expandTag){
                  // expand:reps=6;work=400m;rest=120s;omit_last_rest=1
                  const body = expandTag.split(':')[1] || '';
                  const parts = body.split(';');
                  for (const p of parts){
                    const [k,v] = p.split('=');
                    const key = String(k||'').trim().toLowerCase();
                    const val = String(v||'').trim().toLowerCase();
                    if (!key) continue;
                    if (key === 'reps') out.reps = Number(val);
                    if (key === 'omit_last_rest') out.omit_last_rest = (val==='1' || val==='true');
                    if (key === 'work'){
                      if (/^\d+\s*s$/.test(val)) { out.work = { time_s: Number(val.replace(/\D/g,'')) }; }
                      else if (/^\d+\s*m$/.test(val)) { out.work = { distance_m: Number(val.replace(/\D/g,'')) }; }
                      else if (/^\d+\s*mi$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.work = { distance_m: Math.round(n*1609.34) }; }
                      else if (/^\d+\s*km$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.work = { distance_m: Math.round(n*1000) }; }
                    }
                    if (key === 'rest'){
                      if (/^\d+\s*s$/.test(val)) { out.rest = { time_s: Number(val.replace(/\D/g,'')) }; }
                      else if (/^\d+\s*m$/.test(val)) { out.rest = { distance_m: Number(val.replace(/\D/g,'')) }; }
                      else if (/^\d+\s*mi$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.rest = { distance_m: Math.round(n*1609.34) }; }
                      else if (/^\d+\s*km$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.rest = { distance_m: Math.round(n*1000) }; }
                    }
                  }
                }
                return (out.reps && (out.work || out.rest)) ? out : null;
              };
              const parseDisplayOverridesFromTags = () => {
                const rawTags: string[] = Array.isArray((s as any).tags) ? (s as any).tags.map((t:any)=>String(t)) : [];
                const view = rawTags.find(t=>/^view:/i.test(t));
                const pace = rawTags.find(t=>/^pace_annotation:/i.test(t));
                const ov: any = {};
                if (view && String(view.split(':')[1]||'').toLowerCase()==='unpack') ov.planned_detail = 'unpack';
                const pa = pace ? String(pace.split(':')[1]||'').toLowerCase() : '';
                return { overrides: Object.keys(ov).length?ov:null, pace_annotation: pa||null };
              };
              const { overrides: displayOverridesFromTags, pace_annotation: paceAnnoFromTags } = parseDisplayOverridesFromTags();
              const expandSpecFromTags = parseExpandSpecFromTags();
              const buildName = (): string => {
                if (discipline === 'strength') return 'Strength';
                if (mappedType === 'ride') {
                  if (hasTag('long_ride')) return 'Ride — Long Ride';
                  if (contains('vo2')) return 'Ride — VO2';
                  if (contains('threshold') || contains('thr_')) return 'Ride — Threshold';
                  if (contains('sweet spot') || /\bss(p)?\b/.test(lowerText) || contains('ss_')) return 'Ride — Sweet Spot';
                  if (contains('recovery')) return 'Ride — Recovery';
                  if (contains('endurance') || contains('z2')) return 'Ride — Endurance';
                  return 'Ride';
                }
                if (mappedType === 'run') {
                  if (hasTag('long_run')) return 'Run — Long Run';
                  if (contains('tempo')) return 'Run — Tempo';
                  if (contains('interval') || /\b\d+x\d+/.test(lowerText)) return 'Run — Intervals';
                  return 'Run';
                }
                if (mappedType === 'swim') {
                  if (hasTag('opt_kind:technique') || contains('technique') || contains('drills')) return 'Swim — Technique';
                  return 'Swim — Endurance';
                }
                return [capitalize(mappedType), typeName].filter(Boolean).join(' ').trim() || 'Session';
              };
              const name = buildName();
              const stepsSummary = summarizeSteps((s as any).steps_preset);
              const stepsPreset = (s as any).steps_preset as string[] | undefined;
              const estFromSteps = estimateMinutesFromSteps(stepsPreset);
              const estFromIntervals = estimateMinutesFromIntervals(stepsPreset, description);
              // Structured normalization (preferred)
              const hasStructured = (s as any).workout_structure && typeof (s as any).workout_structure === 'object';
              let structuredSummary: string | undefined;
              let structuredMinutes = 0;
              try {
                if (hasStructured) {
                  const res = normalizeStructuredSession(s, bl || {} as any);
                  structuredSummary = res.friendlySummary || undefined;
                  structuredMinutes = res.durationMinutes || 0;
                }
              } catch {}
              const duration = (typeof s.duration === 'number' && Number.isFinite(s.duration))
                ? s.duration
                : (structuredMinutes || estFromIntervals || estFromSteps || estimateMinutesFromDescription(description) || extractMinutesFromText(rawDesc) || 0);
              const base = {
                id: s.id || `${pd.id}-w${w}-${idx}`,
                name,
                type: mappedType || 'run',
                description: [structuredSummary || description, (!structuredSummary && stepsSummary.length) ? `(${stepsSummary.join(' • ')})` : ''].filter(Boolean).join(' '),
                duration,
                intensity: typeof s.intensity === 'string' ? s.intensity : undefined,
                day: s.day,
                completed: false,
                tags: Array.isArray((s as any).tags) ? (s as any).tags : [],
                // View hints parsed from tags (schema-safe)
                display_overrides: displayOverridesFromTags,
                expand_spec: expandSpecFromTags,
                pace_annotation: paceAnnoFromTags || undefined,
              } as any;
              if ((s.discipline || mappedType) === 'swim' && Array.isArray((s as any).steps) && (s as any).steps.length > 0) {
                base.intervals = (s as any).steps.map((st: any) => ({ effortLabel: st.effort || st.stroke || 'Swim', duration: 0 }));
              }
              return base;
            });

            weeksOut.push({
              weekNumber: w,
              title: `Week ${w}`,
              header: Array.isArray(notesByWeek[w]) ? (notesByWeek[w][0] || '') : '',
              focus: Array.isArray(notesByWeek[w]) ? (notesByWeek[w][1] || '') : '',
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

      // Calculate and set the current week based on plan start date
      const calculatedCurrentWeek = await calculateCurrentWeek(planId);
      
      // Update the plan detail with the calculated current week
      pd.currentWeek = calculatedCurrentWeek;
      
      setSelectedPlanDetail(pd);
      setSelectedWeek(calculatedCurrentWeek);
      
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
      const spec: any = optionalUiSpec as any;
      const L = spec.logic || {};
      const qTag = String(L.quality_tag || 'bike_intensity').toLowerCase();
      const optTag = String(L.optional_tag || 'optional').toLowerCase();
      const xorTag = String(L.xor_tag || 'xor:swim_or_quality_bike').toLowerCase();
      const weeklyCap = Number(L.weekly_quality_cap || 1);
      const tz = L.week_boundary?.timezone || 'America/Los_Angeles';
      const toDateOnly = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { timeZone: tz });
      const startOfWeek = (iso: string) => {
        const d = new Date(iso + 'T00:00:00');
        const day = new Date(d.toLocaleString('en-US', { timeZone: tz })).getDay();
        const mondayOffset = (day === 0 ? -6 : 1 - day);
        const base = new Date(d);
        base.setDate(base.getDate() + mondayOffset);
        return toDateOnly(base.toISOString().slice(0,10));
      };

      const existingTags: string[] = Array.isArray(workout.tags) ? workout.tags : [];
      const lower = existingTags.map((t:string)=>t.toLowerCase());

      // weekly cap for quality bikes
      if (String(workout.type).toLowerCase()==='ride' && lower.includes(qTag)) {
        const wkStart = startOfWeek(workout.date);
        const end = new Date(wkStart); end.setDate(end.getDate()+6); const wkEnd = toDateOnly(end.toISOString().slice(0,10));
        const { data: weekRows } = await supabase
          .from('planned_workouts')
          .select('id,type,tags,date')
          .eq('training_plan_id', workout.training_plan_id)
          .gte('date', wkStart)
          .lte('date', wkEnd);
        const countQual = (weekRows||[]).filter((r:any)=> String(r.type).toLowerCase()==='ride' && Array.isArray(r.tags) && r.tags.map((t:string)=>t.toLowerCase()).includes(qTag) && !r.tags.map((t:string)=>t.toLowerCase()).includes(optTag)).length;
        if (countQual >= weeklyCap) {
          try { (window as any).toast?.({ title: 'Weekly limit reached', description: spec.ui_text?.notifications?.weekly_limit_reached }); } catch {}
          setSelectedWeek(w=>w);
          return;
        }
      }

      // Activate: remove optional tag from selected
      let newTags = existingTags.filter((t: string) => String(t).toLowerCase() !== optTag);
      if (!newTags.map((t:string)=>t.toLowerCase()).includes('opt_active')) newTags = [...newTags, 'opt_active'];
      await supabase.from('planned_workouts').update({ tags: newTags }).eq('id', rowId);
      // Local immediate update to reduce layout shift
      try {
        if (selectedPlanDetail && selectedPlanDetail.weeks) {
          const clone = { ...selectedPlanDetail } as any;
          clone.weeks = (clone.weeks || []).map((wk: any) => {
            const workouts = (wk.workouts || []).map((w: any) => {
              if (w.id === rowId) {
                const t = Array.isArray(w.tags) ? w.tags : [];
                const filtered = t.filter((x: string)=>String(x).toLowerCase()!==optTag);
                const hasOptActive = filtered.map((x:string)=>x.toLowerCase()).includes('opt_active');
                return { ...w, tags: hasOptActive ? filtered : [...filtered, 'opt_active'] };
              }
              return w;
            });
            return { ...wk, workouts };
          });
          setSelectedPlanDetail(clone);
        }
      } catch {}

      // XOR swap: if this workout carries xor tag, hide the counterpart (swim ↔ ride)
      if (lower.includes(xorTag)) {
        const wkStart = startOfWeek(workout.date);
        const end = new Date(wkStart); end.setDate(end.getDate()+6); const wkEnd = toDateOnly(end.toISOString().slice(0,10));
        const { data: weekRows } = await supabase
          .from('planned_workouts')
          .select('id,type,tags')
          .eq('training_plan_id', workout.training_plan_id)
          .gte('date', wkStart)
          .lte('date', wkEnd);
        const chosenType = String(workout.type).toLowerCase();
        const otherType = chosenType === 'swim' ? 'ride' : 'swim';
        const others = (weekRows||[]).filter((r:any)=> String(r.type).toLowerCase()===otherType && Array.isArray(r.tags) && r.tags.map((t:string)=>t.toLowerCase()).includes(xorTag));
        for (const o of others) {
          const tgs = Array.isArray(o.tags) ? o.tags : [];
          if (!tgs.map((t:string)=>t.toLowerCase()).includes(optTag)) {
            await supabase.from('planned_workouts').update({ tags: [...tgs, 'optional'] }).eq('id', o.id);
          }
        }
        // Update local state for XOR-swapped counterparts
        try {
          if (selectedPlanDetail && selectedPlanDetail.weeks) {
            const clone = { ...selectedPlanDetail } as any;
            clone.weeks = (clone.weeks || []).map((wk: any) => {
              const workouts = (wk.workouts || []).map((w: any) => {
                const tgs = Array.isArray(w.tags) ? w.tags : [];
                const lowerTags = tgs.map((x:string)=>x.toLowerCase());
                if (String(w.type).toLowerCase()===otherType && lowerTags.includes(xorTag) && !lowerTags.includes(optTag)) {
                  return { ...w, tags: [...tgs, 'optional'] };
                }
                return w;
              });
              return { ...wk, workouts };
            });
            setSelectedPlanDetail(clone);
          }
        } catch {}
        try { (window as any).toast?.({ title: 'Selection applied', description: spec.ui_text?.notifications?.xor_applied }); } catch {}
      }
      // Post-activation spacing: if activating this optional creates a hard-day collision, move the ACTIVATED optional (never core)
      try {
        const spec: any = optionalUiSpec as any;
        const L = spec.logic || {};
        const qTag = String(L.quality_tag || 'bike_intensity').toLowerCase();
        const optTag = String(L.optional_tag || 'optional').toLowerCase();
        const tz = L.week_boundary?.timezone || 'America/Los_Angeles';
        const toDateOnly = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { timeZone: tz });
        const startOfWeek = (iso: string) => {
          const d = new Date(iso + 'T00:00:00');
          const day = new Date(d.toLocaleString('en-US', { timeZone: tz })).getDay();
          const mondayOffset = (day === 0 ? -6 : 1 - day);
          const base = new Date(d);
          base.setDate(base.getDate() + mondayOffset);
          return toDateOnly(base.toISOString().slice(0,10));
        };
        const wkStart = startOfWeek(workout.date);
        const end = new Date(wkStart); end.setDate(end.getDate()+6); const wkEnd = toDateOnly(end.toISOString().slice(0,10));
        const { data: weekRows } = await supabase
          .from('planned_workouts')
          .select('id,day_number,tags')
          .eq('training_plan_id', workout.training_plan_id)
          .gte('date', wkStart)
          .lte('date', wkEnd);
        const isHard = (r: any) => {
          const tags = Array.isArray(r?.tags) ? r.tags.map((t:string)=>t.toLowerCase()) : [];
          return tags.includes('long_run') || tags.includes('hard_run') || tags.includes(qTag) || tags.includes('strength_lower') || tags.includes('long_ride');
        };
        const sameDayHardCore = (weekRows||[]).some((r:any)=> r.id!==workout.id && Number(r.day_number)===Number(workout.day_number) && isHard(r) && !(Array.isArray(r.tags)&&r.tags.map((t:string)=>t.toLowerCase()).includes(optTag)));
        if (sameDayHardCore) {
          const nextDay = Math.min(7, Number(workout.day_number || 1) + 1);
          await supabase.from('planned_workouts').update({ day_number: nextDay }).eq('id', workout.id);
        }
      } catch {}
      // Remove global invalidation to avoid refresh storms
    } finally {
      setActivatingId(null);
    }
  }

  async function deactivateOptional(workout: any) {
    try {
      const rowId = workout.id as string;
      setActivatingId(rowId);
      // Add optional back; remove opt_active
      const existingTags: string[] = Array.isArray(workout.tags) ? workout.tags : [];
      let next = existingTags.filter((t:string)=>t.toLowerCase()!=='opt_active');
      if (!next.map((t:string)=>t.toLowerCase()).includes('optional')) next = [...next, 'optional'];
      await supabase.from('planned_workouts').update({ tags: next }).eq('id', rowId);
      // Local update
      try {
        if (selectedPlanDetail && selectedPlanDetail.weeks) {
          const clone = { ...selectedPlanDetail } as any;
          clone.weeks = (clone.weeks || []).map((wk: any) => {
            const workouts = (wk.workouts || []).map((w: any) => {
              if (w.id === rowId) {
                const t = Array.isArray(w.tags) ? w.tags : [];
                const noActive = t.filter((x:string)=>x.toLowerCase()!=='opt_active');
                return noActive.map((x:string)=>x.toLowerCase()).includes('optional') ? { ...w, tags: noActive } : { ...w, tags: [...noActive, 'optional'] };
              }
              return w;
            });
            return { ...wk, workouts };
          });
          setSelectedPlanDetail(clone);
        }
      } catch {}
      // XOR reverse: If this row carries xor tag, unhide the counterpart (remove optional)
      try {
        const spec: any = optionalUiSpec as any;
        const xorTag = String(spec?.logic?.xor_tag || 'xor:swim_or_quality_bike').toLowerCase();
        const optTag = String(spec?.logic?.optional_tag || 'optional').toLowerCase();
        const tz = spec?.logic?.week_boundary?.timezone || 'America/Los_Angeles';
        const toDateOnly = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { timeZone: tz });
        const startOfWeek = (iso: string) => {
          const d = new Date(iso + 'T00:00:00');
          const day = new Date(d.toLocaleString('en-US', { timeZone: tz })).getDay();
          const mondayOffset = (day === 0 ? -6 : 1 - day);
          const base = new Date(d);
          base.setDate(base.getDate() + mondayOffset);
          return toDateOnly(base.toISOString().slice(0,10));
        };
        const tagsLower = (Array.isArray(workout.tags)? workout.tags:[]).map((t:string)=>t.toLowerCase());
        if (tagsLower.includes(xorTag)) {
          const wkStart = startOfWeek(workout.date);
          const end = new Date(wkStart); end.setDate(end.getDate()+6); const wkEnd = toDateOnly(end.toISOString().slice(0,10));
          const { data: weekRows } = await supabase
            .from('planned_workouts')
            .select('id,type,tags')
            .eq('training_plan_id', workout.training_plan_id)
            .gte('date', wkStart)
            .lte('date', wkEnd);
          const chosenType = String(workout.type).toLowerCase();
          const otherType = chosenType === 'swim' ? 'ride' : 'swim';
          const others = (weekRows||[]).filter((r:any)=> String(r.type).toLowerCase()===otherType && Array.isArray(r.tags) && r.tags.map((t:string)=>t.toLowerCase()).includes(xorTag));
          for (const o of others) {
            const tgs = Array.isArray(o.tags) ? o.tags : [];
            const cleaned = tgs.filter((t:string)=>t.toLowerCase()!==optTag);
            await supabase.from('planned_workouts').update({ tags: cleaned }).eq('id', o.id);
          }
        }
      } catch {}
      // Removed global invalidation
    } finally {
      setActivatingId(null);
    }
  }

  // Auto-open a plan if requested by parent (e.g., from Today's Effort click)
  useEffect(() => {
    (async () => {
      try {
        // Guard: only auto-open once per mount
        const openedRef = (useRef as any);
        if (!('current' in openedRef)) { /* noop for TS */ }
        // use local ref to gate auto-open
      } catch {}
    })();
  }, []);

  // Use a dedicated ref to gate auto-open so we don't re-trigger on state churn
  const hasAutoOpenedRef = useRef<boolean>(false);
  useEffect(() => {
    (async () => {
      try {
        if (focusPlanId && !selectedPlanDetail && !hasAutoOpenedRef.current) {
          // Show detail immediately to avoid list flash
          setCurrentView('detail');
          await handlePlanClick(focusPlanId);
          hasAutoOpenedRef.current = true;
          if (typeof focusWeek === 'number' && focusWeek > 0) setSelectedWeek(focusWeek);
        }
      } catch {}
    })();
  }, [focusPlanId, focusWeek]);

  // Ensure week materialized on selection change with in-memory week cache
  useEffect(() => {
    (async () => {
      try {
        if (!selectedPlanDetail || !selectedPlanDetail.id || !selectedWeek) return;
        const key = `${selectedPlanDetail.id}:${selectedWeek}`;
        const cached = weekCacheRef.current.get(key);
        if (cached && cached.length) {
          const weeks = (selectedPlanDetail.weeks || []).map((wk: any) => (
            wk.weekNumber === selectedWeek ? { ...wk, workouts: cached } : wk
          ));
          setSelectedPlanDetail((prev: any) => ({ ...prev, weeks }));
          return;
        }

        setWeekLoading(true);
        // Server-side handles materialization; warm unified cache only
        const wk = selectedWeek || 1;
        const weekStartISO = (()=>{
          try {
            const today = new Date(); const js = today.getDay(); const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((js + 6)%7));
            const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + (wk-1)*7);
            const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
            return `${y}-${m}-${dd}`;
          } catch { return undefined; }
        })();
        const weekEndISO = (()=>{
          try { const s = weekStartISO ? new Date(weekStartISO) : new Date(); const e = new Date(s.getFullYear(), s.getMonth(), s.getDate()+6); const y=e.getFullYear(), m=String(e.getMonth()+1).padStart(2,'0'), dd=String(e.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; } catch { return undefined; }
        })();
        // Skip invoking here to avoid load storms
        const { data: rows } = await supabase
          .from('planned_workouts')
          .select('*')
          .eq('training_plan_id', selectedPlanDetail.id)
          .eq('week_number', wk)
          .order('day_number', { ascending: true });
        if (Array.isArray(rows)) {
          // Removed auto-rebake to avoid surprise writes in UI
          const numToDay = { 1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday' } as Record<number,string>;
          const normalized = rows.map((w: any) => {
            const dayName = numToDay[(w as any).day_number as number] || (w as any).day || '';
            const computed = (w as any).computed || {};
            const renderedDesc = (w as any).rendered_description || (w as any).description || '';
            const totalSeconds = computed.total_duration_seconds;
            const duration = totalSeconds ? Math.round(totalSeconds / 60) : (typeof (w as any).duration === 'number' ? (w as any).duration : 0);
            const parseMaybeJson = (v: any) => { if (Array.isArray(v)) return v; if (v && typeof v === 'object') return v; try { return JSON.parse(v); } catch { return v; } };
            const tags = (() => { const raw=(w as any).tags; if (Array.isArray(raw)) return raw; try { const p=JSON.parse(raw); return Array.isArray(p)?p:[]; } catch { return []; } })();
            const steps_preset = parseMaybeJson((w as any).steps_preset) || null;
            const export_hints = parseMaybeJson((w as any).export_hints) || null;
            const intervals = parseMaybeJson((w as any).intervals) || [];
            return { ...w, day: dayName, duration, tags, steps_preset, export_hints, intervals, rendered_description: renderedDesc };
          });
          weekCacheRef.current.set(key, normalized);
          let weeks: any[];
          const existing = Array.isArray(selectedPlanDetail.weeks) ? selectedPlanDetail.weeks : [];
          if (existing.length === 0) {
            // Seed a minimal week structure so the detail view can render immediately
            weeks = [{ weekNumber: selectedWeek, title: `Week ${selectedWeek}`, focus: '', workouts: normalized }];
          } else if (!existing.some((wk: any) => wk.weekNumber === selectedWeek)) {
            weeks = [...existing, { weekNumber: selectedWeek, title: `Week ${selectedWeek}`, focus: '', workouts: normalized }].sort((a:any,b:any)=>a.weekNumber-b.weekNumber);
          } else {
            weeks = existing.map((wk: any) => (wk.weekNumber === selectedWeek ? { ...wk, workouts: normalized } : wk));
          }
          setSelectedPlanDetail((prev: any) => ({ ...prev, weeks }));
        }
      } catch {}
      finally {
        setWeekLoading(false);
      }
    })();
  }, [selectedPlanDetail?.id, selectedWeek]);

  // Pull-to-refresh signal from AppLayout: bust current week cache and reload
  useEffect(() => {
    const onPull = () => {
      if (!selectedPlanDetail?.id || !selectedWeek) return;
      const key = `${selectedPlanDetail.id}:${selectedWeek}`;
      weekCacheRef.current.delete(key);
      setWeekLoading(true);
      // Let the materialize effect above run again naturally
      setTimeout(() => setWeekLoading(false), 0);
    };
    // Remove global pullrefresh listener to reduce render storms
    return () => {};
  }, [selectedPlanDetail?.id, selectedWeek]);

  // Force refresh control for current week
  const handleForceRefreshWeek = async () => {
    if (!selectedPlanDetail?.id || !selectedWeek) return;
    const key = `${selectedPlanDetail.id}:${selectedWeek}`;
    weekCacheRef.current.delete(key);
    setWeekLoading(true);
    try {
      // No global invalidation here
    } finally {
      setWeekLoading(false);
    }
  };

  const handleWorkoutClick = (workout: any) => {
    // Attach plan-level daily instructions so Planned view can show Guidance
    const planDaily = (selectedPlanDetail as any)?.daily_instructions || (selectedPlanDetail as any)?.template?.daily_instructions || null;
    setSelectedWorkout(planDaily ? { ...workout, plan_daily_instructions: planDaily } : workout);
    setWorkoutViewMode('summary');
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

  const handleEndPlan = async () => {
    if (!selectedPlanDetail || !endPlan) return;
    try {
      const result = await endPlan(selectedPlanDetail.id);
      console.log('Plan ended:', result);
      // Update local state to reflect ended status
      setPlanStatus('ended');
      setSelectedPlanDetail({ ...selectedPlanDetail, status: 'ended' });
      // Optionally go back to list view
      // handleBack();
    } catch (error) {
      console.error('Error ending plan:', error);
      alert('Failed to end plan. Please try again.');
    }
  };

  const handlePausePlan = async () => {
    if (!selectedPlanDetail || !pausePlan) return;
    try {
      const result = await pausePlan(selectedPlanDetail.id);
      console.log('Plan paused:', result);
      // Just update the status fields, keep everything else intact
      setPlanStatus('paused');
      setSelectedPlanDetail((prev: any) => ({ 
        ...prev, 
        status: 'paused', 
        paused_at: result.paused_at 
      }));
    } catch (error) {
      console.error('Error pausing plan:', error);
      alert('Failed to pause plan. Please try again.');
    }
  };

  const handleResumePlan = async () => {
    if (!selectedPlanDetail || !updatePlan) return;
    try {
      // Calculate how long the plan was paused
      const pausedAt = selectedPlanDetail.paused_at ? new Date(selectedPlanDetail.paused_at) : null;
      const now = new Date();
      
      // If we have a pause timestamp and a config with start date, adjust it
      let updates: any = { status: 'active', paused_at: null };
      
      if (pausedAt && selectedPlanDetail.config?.user_selected_start_date) {
        const pauseDurationDays = Math.floor((now.getTime() - pausedAt.getTime()) / (1000 * 60 * 60 * 24));
        const originalStart = new Date(selectedPlanDetail.config.user_selected_start_date);
        const newStart = new Date(originalStart);
        newStart.setDate(newStart.getDate() + pauseDurationDays);
        
        // Update config with new start date
        updates.config = {
          ...selectedPlanDetail.config,
          user_selected_start_date: newStart.toISOString().split('T')[0]
        };
      }
      
      await updatePlan(selectedPlanDetail.id, updates);
      // Just update the status and config fields, keep everything else intact
      setPlanStatus('active');
      setSelectedPlanDetail((prev: any) => ({ 
        ...prev, 
        status: 'active',
        paused_at: null,
        config: updates.config || prev.config
      }));
    } catch (error) {
      console.error('Error resuming plan:', error);
      alert('Failed to resume plan. Please try again.');
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
    if (!week || !Array.isArray(week.workouts)) return 0;
    return week.workouts
      .filter((w: any) => {
        const tags = Array.isArray(w?.tags) ? w.tags.map((t: string) => t.toLowerCase()) : [];
        return !tags.includes('optional');
      })
      .reduce((total: number, w: any) => {
        const sec = Number((w as any)?.computed?.total_duration_seconds);
        const min = Number.isFinite(sec) && sec > 0 ? Math.round(sec / 60) : 0;
        return total + min;
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

  // Day View via unified modal (Planned tab)
  if (currentView === 'day' && selectedWorkout) {
    return (
      <div className="min-h-screen bg-white">
        <UnifiedWorkoutView
          workout={selectedWorkout}
          initialTab="planned"
          origin="weekly"
          onClose={() => { setCurrentView('detail'); setSelectedWorkout(null); }}
        />
      </div>
    );
  }

  // Fast-path: when focusing a plan, render a lightweight loading state instead of the list
  if (currentView === 'detail' && !selectedPlanDetail) {
    return (
      <div className="p-4 text-sm text-gray-600">
        Loading plan…
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
              <button onClick={handlePausePlan} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                <Pause className="h-4 w-4" />
                Pause
              </button>
            ) : planStatus === 'paused' ? (
              <button onClick={handleResumePlan} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                <Play className="h-4 w-4" />
                Resume
              </button>
            ) : null}

            <div className="hidden sm:block">
              <button onClick={() => exportPlanToMarkdown(selectedPlanDetail)} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                Download
              </button>
            </div>
            <div className="sm:hidden">
              <button onClick={() => setShowPlanDesc((v:any)=>!v)} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                Info
              </button>
            </div>
            
            <button className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
              <Edit className="h-4 w-4" />
              Modify
            </button>
            
            {(planStatus === 'active' || planStatus === 'paused') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-2 text-orange-600 hover:text-orange-700 transition-colors">
                    End Plan
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End Plan Early</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to end "{selectedPlanDetail.name}"? This will remove all future planned workouts but keep your completed workouts for comparison. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleEndPlan} className="bg-orange-600 hover:bg-orange-700">
                      End Plan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
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
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <h1
                    className="font-semibold leading-tight text-base sm:text-xl"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2 as any, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {selectedPlanDetail.name}
                  </h1>
                </div>
                {showPlanDesc && (
                  <p className="text-gray-600 mt-1 text-sm leading-relaxed">{selectedPlanDetail.description}</p>
                )}
              </div>
            </div>
          </div>
          <div className="p-2">
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

        {/* Removed Summary/Adjustments tabs for a tighter header */}

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
            {(() => {
              const totalWeeks = selectedPlanDetail.duration || selectedPlanDetail.duration_weeks || (selectedPlanDetail.weeks ? selectedPlanDetail.weeks.length : 0);
              const nums = Array.from({ length: Math.max(0, Number(totalWeeks) || 0) }, (_, i) => i + 1);
              return nums.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {nums.map((wn: number) => {
                    const isSelected = selectedWeek === wn;
                    const isCurrent = wn === (selectedPlanDetail.currentWeek || 0);
                    return (
                      <button
                        key={wn}
                        onClick={() => setSelectedWeek(wn)}
                        className={`whitespace-nowrap px-2 py-1 rounded flex items-center gap-1 ${
                          isSelected 
                            ? 'bg-gray-100 text-black' 
                            : isCurrent 
                              ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                              : 'text-gray-700 hover:text-black'
                        }`}
                      >
                        <span className="text-sm">Week {wn}</span>
                        {isCurrent && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null;
            })()}

            {currentWeekData && (
              <div className="text-sm text-gray-700 px-1 pb-1">
                {(() => {
                  const focusText = String(currentWeekData.focus || '').toLowerCase();
                  const stage = /taper/.test(focusText)
                    ? 'Taper'
                    : /deload|recovery/.test(focusText)
                    ? 'Deload'
                    : /peak/.test(focusText)
                    ? 'Peak'
                    : 'Build';
                  const count = (currentWeekData?.workouts || []).filter((w:any)=>w.type!=='rest').length;
                  const isCur = selectedWeek === (selectedPlanDetail.currentWeek || 0);
                  return (
                    <span>
                      <span className="font-medium">{stage}</span>
                      <span className="text-gray-400"> • </span>
                      <span className="font-medium">{formatDuration(getWeeklyVolume(currentWeekData))}</span>
                      <span className="text-gray-400"> • </span>
                      <span>{count} workouts</span>
                      {isCur ? <span className="ml-2 text-blue-600">Current</span> : null}
                    </span>
                  );
                })()}
              </div>
            )}

            {(() => {
              const weeklySummariesObj: any = (selectedPlanDetail as any)?.config?.weekly_summaries || (selectedPlanDetail as any)?.weekly_summaries || (selectedPlanDetail as any)?.template?.weekly_summaries || {};
              const wsKey = String(selectedWeek);
              const ws: any = weeklySummariesObj?.[wsKey] || {};
              const focus: string | undefined = (typeof ws?.focus === 'string' && ws.focus.trim().length>0) ? ws.focus.trim() : undefined;
              const notes: string | undefined = (typeof ws?.notes === 'string' && ws.notes.trim().length>0) ? ws.notes.trim() : undefined;
              const hours = typeof ws?.estimated_hours === 'number' ? ws.estimated_hours : undefined;
              const hard = typeof ws?.hard_sessions === 'number' ? ws.hard_sessions : undefined;
              const keys: string[] = Array.isArray(ws?.key_workouts) ? ws.key_workouts.slice(0, 3) : [];
              const hasHeader = !!(focus || notes);
              if (!hasHeader && !(hours != null || hard != null || (keys.length > 0))) return null;
              return (
                <div className="px-1 pb-3 text-sm text-gray-700">
                  {focus && (<div className="mb-1">{focus}</div>)}
                  {notes && (<div className="mb-1 text-gray-600">{notes}</div>)}
                  {false && (
                    <div />
                  )}
                </div>
              );
            })()}

            {currentWeekData && !weekLoading && (
              <div className="">
                <div className="">
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
                            {groups[day].map((workout: any, index: number) => (
                              <div
                                key={workout.id || `workout-${day}-${index}`}
                                onClick={() => handleWorkoutClick(workout)}
                                className={`p-4 rounded-lg border transition-colors cursor-pointer ${workout.type === 'rest' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                              >
                                {false ? (
                                  <></>
                                ) : (
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <PlannedWorkoutSummary workout={workout} baselines={baselines as any} hideLines={false} suppressNotes={true} />
                                    </div>
                                    {Array.isArray(workout.tags) && workout.tags.map((t:string)=>t.toLowerCase()).includes('opt_active') && (
                                      <Button size="sm" variant="outline" disabled={activatingId===workout.id} onClick={(e)=>{e.stopPropagation(); deactivateOptional(workout);}}>
                                        {activatingId===workout.id? 'Removing…':'Remove'}
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                            
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
            {weekLoading && (
              <div className="p-3 text-sm text-gray-500">Loading…</div>
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
    <div className="space-y-6 overflow-x-hidden" style={{fontFamily: 'Inter, sans-serif', touchAction: 'pan-y', overscrollBehaviorX: 'contain'}}>
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