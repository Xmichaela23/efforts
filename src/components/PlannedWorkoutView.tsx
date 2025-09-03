import React from 'react';
import { Clock } from 'lucide-react';
// Intentionally avoid discipline-specific colors in Planned view for a clean look
import { supabase } from '@/lib/supabase';
import { normalizePlannedSession } from '@/services/plans/normalizer';

export interface PlannedWorkout {
  id: string;
  name: string;
  type: 'run' | 'ride' | 'swim' | 'strength' | 'walk';
  date: string;
  description?: string;
  duration?: number;
  intervals?: any[];
  strength_exercises?: any[];
  workout_status: 'planned' | 'in_progress' | 'completed' | 'sent_to_garmin';
  source?: 'manual' | 'plan_template' | 'training_plan';
  training_plan_id?: string;
  week_number?: number;
  day_number?: number;
  computed?: any; // Computed data from plan baker
  rendered_description?: string; // Rendered description from plan baker
}

interface PlannedWorkoutViewProps {
  workout: PlannedWorkout;
  showHeader?: boolean;
  compact?: boolean;
  onEdit?: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
}

const PlannedWorkoutView: React.FC<PlannedWorkoutViewProps> = ({
  workout,
  showHeader = true,
  compact = false,
  onEdit,
  onComplete,
  onDelete
}) => {
  const [friendlyDesc, setFriendlyDesc] = React.useState<string | undefined>(undefined);
  const [resolvedDuration, setResolvedDuration] = React.useState<number | undefined>(undefined);
  const [stepLines, setStepLines] = React.useState<string[] | null>(null);
  const [fallbackPace, setFallbackPace] = React.useState<string | undefined>(undefined);
  const [perfNumbers, setPerfNumbers] = React.useState<any | undefined>(undefined);
  const [totalYards, setTotalYards] = React.useState<number | undefined>(undefined);

  const totalYardsMemo = React.useMemo(() => {
    try {
      if (String((workout as any).type||'').toLowerCase() !== 'swim') return undefined;
      // 1) computed steps
      const compSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
      const accFromSteps = (arr:any[]): number => {
        let y = 0; if (!Array.isArray(arr)) return 0;
        for (const s of arr) {
          if (typeof (s as any)?.distance_yd === 'number') {
            y += Math.round(Number((s as any).distance_yd) / 25) * 25;
          } else if (typeof (s as any)?.distance_m === 'number') {
            const yd = Number((s as any).distance_m) / 0.9144;
            y += Math.round(yd / 25) * 25;
          }
          if (Array.isArray((s as any)?.segments)) y += accFromSteps((s as any).segments);
        }
        return y;
      };
      let yards = accFromSteps(compSteps);
      // 2) intervals if computed is empty
      if (!yards) {
        const intervalsSrc: any[] = Array.isArray((workout as any).intervals) ? (workout as any).intervals : [];
        const accIntervals = (it:any) => {
          if (Array.isArray(it?.segments) && Number(it?.repeatCount)>0) {
            for (let r=0;r<Number(it.repeatCount);r+=1) for (const sg of it.segments) if (typeof sg?.distanceMeters==='number') {
              const yd = Number(sg.distanceMeters) / 0.9144; yards += Math.round(yd/25)*25;
            }
          } else if (typeof it?.distanceMeters==='number') {
            const yd = Number(it.distanceMeters) / 0.9144; yards += Math.round(yd/25)*25;
          }
        };
        for (const it of intervalsSrc) accIntervals(it);
      }
      // 3) rendered lines fallback
      if (!yards) {
        const lines = Array.isArray(stepLines) ? stepLines : [];
        for (const s of lines) { const m = String(s).match(/(\d+)\s*yd\b/i); if (m) yards += Math.round(parseInt(m[1],10)/25)*25 || 0; }
      }
      const rounded = Math.round(Number(yards||0) / 25) * 25;
      return rounded>0 ? rounded : undefined;
    } catch { return undefined; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepLines, (workout as any)?.computed, (workout as any)?.intervals, (workout as any)?.id]);
  
  const formatDate = (dateString: string) => {
    try {
      const ds = String(dateString || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
        const date = new Date(ds + 'T00:00:00');
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          });
        }
      }
      // Fallback: show weekday from day_number or generic label
      try {
        const dn = Number((workout as any)?.day_number);
        if (dn >= 1 && dn <= 7) {
          const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          return weekdays[dn - 1];
        }
      } catch {}
      return 'Planned';
    } catch {
      return 'Planned';
    }
  };

  const getWorkoutTypeIcon = (type: string) => {
    switch (type) {
      case 'run': return 'RUN';
      case 'ride': return 'RIDE';
      case 'swim': return 'SWIM';
      case 'strength': return 'STR';
      case 'walk': return 'WALK';
      default: return 'RUN';
    }
  };

  const getWorkoutTypeColor = (_type: string) => 'bg-gray-100 text-gray-800 border-gray-200';

  const getWorkoutTypeLabel = (type: string) => {
    switch (type) {
      case 'run': return 'Running';
      case 'ride': return 'Cycling';
      case 'swim': return 'Swimming';
      case 'strength': return 'Strength Training';
      case 'walk': return 'Walking';
      default: return type;
    }
  };

  // Helpers copied from plan detail for consistent rendering
  const stripCodes = (text?: string) => String(text || '')
    .replace(/\[(?:cat|plan):[^\]]+\]\s*/gi, '')
    .replace(/\[[A-Za-z0-9_:+\-x\/]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const estimateMinutesFromDescription = (desc?: string): number => {
    if (!desc) return 0; 
    const s = desc.toLowerCase();
    let m = s.match(/(\d+(?:\.\d+)?)\s*mi[^\d]*(\d+):(\d{2})\s*\/\s*mi/);
    if (m) { 
      const dist=parseFloat(m[1]); 
      const pace=parseInt(m[2],10)*60+parseInt(m[3],10); 
      return Math.round((dist*pace)/60); 
    }
    m = s.match(/(\d+(?:\.\d+)?)\s*km[^\d]*(\d+):(\d{2})\s*\/\s*km/);
    if (m) { 
      const distKm=parseFloat(m[1]); 
      const paceSec=parseInt(m[2],10)*60+parseInt(m[3],10); 
      return Math.round((distKm*paceSec)/60); 
    }
    return 0;
  };

  React.useEffect(() => {
    (async () => {
      try {
        // Always load baselines for target annotations
        let pn: any = {};
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const resp = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', user.id).single();
            pn = (resp as any)?.data?.performance_numbers || {};
            setPerfNumbers(pn);
            const fiveK0 = pn.fiveK_pace || pn.fiveKPace || pn.fiveK || null;
            const easy0 = pn.easyPace || null;
            setFallbackPace(easy0 || fiveK0 || undefined);
          }
        } catch {}

        // Friendly copy: prefer server-rendered, else author text with baseline tokens resolved
        const storedText = (workout as any).rendered_description;
        if (typeof storedText === 'string' && storedText.trim().length > 0) {
          setFriendlyDesc(storedText);
        } else {
          const raw = workout.description || '';
          const fiveK = pn.fiveK_pace || pn.fiveKPace || pn.fiveK || null;
          const easy = pn.easyPace || pn.easy_pace || null;
          let out = raw || '';
          if (fiveK) out = out.split('{5k_pace}').join(String(fiveK));
          if (easy) out = out.split('{easy_pace}').join(String(easy));
          // Resolve 7:43/mi + 0:45/mi → 8:28/mi
          out = out.replace(/(\d+):(\d{2})\/(mi|km)\s*([+\-−])\s*(\d+):(\d{2})\/(mi|km)/g, (m, m1, s1, u1, sign, m2, s2, u2) => {
            if (u1 !== u2) return m;
            const base = parseInt(m1, 10) * 60 + parseInt(s1, 10);
            const off  = parseInt(m2, 10) * 60 + parseInt(s2, 10);
            const sec = sign === '-' || sign === '−' ? base - off : base + off;
            const mm = Math.floor(sec / 60); const ss = sec % 60;
            return `${mm}:${String(ss).padStart(2,'0')}/${u1}`;
          });
          out = stripCodes(out);
          setFriendlyDesc(out);
        }

        // Safe duration resolution: prefer computed, else derive from baselines (swim), else fall back to authored duration/estimate
        const comp: any = (workout as any).computed || {};
        let secs: any = comp.total_duration_seconds;
        if (typeof secs === 'string') secs = parseInt(secs, 10);
        // Swim baseline-driven duration when missing
        if (!(typeof secs === 'number' && isFinite(secs) && secs > 0) && String((workout as any).type||'').toLowerCase()==='swim') {
          const parse100 = (txt?: string): number | null => {
            if (!txt) return null; const m = String(txt).trim().match(/(\d+):(\d{2})/); if (!m) return null; return parseInt(m[1],10)*60 + parseInt(m[2],10);
          };
          const pace100 = parse100((pn as any)?.swimPace100 || (pn as any)?.swim_pace_100 || (pn as any)?.swim || '');
          const sumFromSteps = (arr:any[]): number => {
            if (!Array.isArray(arr)) return 0; let s=0;
            for (const st of arr) {
              if (typeof st?.duration_s === 'number') s += Math.max(0, Math.round(st.duration_s));
              else if (typeof (st as any)?.distance_yd === 'number' && pace100) s += Math.round(((st as any).distance_yd/100) * pace100);
              else if (typeof (st as any)?.distance_m === 'number' && pace100) s += Math.round((((st as any).distance_m/0.9144)/100) * pace100);
              if (typeof (st as any)?.rest_s === 'number') s += Math.max(0, Math.round((st as any).rest_s));
              if (Array.isArray((st as any)?.segments)) s += sumFromSteps((st as any).segments);
            }
            return s;
          };
          let swimSec = sumFromSteps(Array.isArray(comp?.steps)?comp.steps:[]);
          if (!swimSec && Array.isArray((workout as any).intervals) && pace100) {
            for (const it of (workout as any).intervals) {
              if (Array.isArray(it?.segments) && Number(it?.repeatCount)>0) {
                for (let r=0;r<Number(it.repeatCount);r+=1) {
                  for (const sg of it.segments) {
                    if (typeof sg?.duration === 'number') swimSec += Math.round(sg.duration);
                    else if (typeof sg?.distanceMeters === 'number') {
                      const yd = Number(sg.distanceMeters)/0.9144; swimSec += Math.round((yd/100)*pace100);
                    }
                  }
                }
              } else {
                if (typeof it?.duration === 'number') swimSec += Math.round(it.duration);
                else if (typeof it?.distanceMeters === 'number') { const yd = Number(it.distanceMeters)/0.9144; swimSec += Math.round((yd/100)*pace100); }
              }
            }
          }
          if (!swimSec && pace100 && typeof totalYardsMemo==='number' && totalYardsMemo>0) {
            swimSec = Math.round((totalYardsMemo/100) * pace100);
          }
          if (swimSec>0) secs = swimSec;
        }
        if (!(typeof secs === 'number' && isFinite(secs) && secs > 0)) {
          if (typeof workout.duration === 'number' && isFinite(workout.duration) && workout.duration > 0) {
            secs = workout.duration * 60;
          } else {
            secs = estimateMinutesFromDescription(friendlyDesc || workout.description) * 60;
          }
        }
        if (typeof secs === 'number' && isFinite(secs) && secs >= 0) {
          setResolvedDuration(Math.round(secs / 60));
        }

        // Build vertical step lines: prefer computed.steps; else tokens; else intervals; else expand grouped text
        const intervalLines = (() => {
          try { return Array.isArray((workout as any).intervals) ? ((): string[] => {
            const arr = (workout as any).intervals as any[];
            const lines: string[] = [];
            const defaultTarget = formatPrimaryTarget(comp);
            const fmtPace = (p?: string) => (p && String(p).trim().length > 0) ? ` @ ${p}` : '';
            const isSwim = String((workout as any).type || '').toLowerCase() === 'swim';
            const fmtDist = (m?: number) => {
              const v = Number(m || 0); if (!v || !Number.isFinite(v)) return undefined;
              if (isSwim) {
                const yd = Math.round(v / 0.9144 / 25) * 25; // nearest 25 yd
                return `${yd} yd`;
              }
              if (Math.abs(v - Math.round(v/1609.34)*1609.34) < 1) return `${Math.round(v/1609.34)} mi`;
              if (v % 1000 === 0) return `${Math.round(v/1000)} km`;
              return `${Math.round(v)} m`;
            };
            const fmtTime = (s?: number) => { const n=Number(s||0); if(!n||!Number.isFinite(n)) return undefined; const mm=Math.floor(n/60), ss=Math.round(n%60); return `${mm}:${String(ss).padStart(2,'0')}`; };
            const pushOne = (o:any) => {
              const raw = String(o?.effortLabel||'').trim();
              const label = raw.toLowerCase();
              const d=fmtDist(o?.distanceMeters); const t=fmtTime(o?.duration); const pace=fmtPace(o?.paceTarget || o?.pace || defaultTarget);
              // Explicit WU/CD labels seen from baker/export/authoring
              if (label==='wu' || /warm[\s\u00A0]*(?:-|[\u2010-\u2015])?\s*up/i.test(label)) {
                const base = t || d; if (base) { lines.push(`Warm‑up ${base}${pace}`.trim()); return; }
              }
              if (label==='cd' || /cool[\s\u00A0]*(?:-|[\u2010-\u2015])?\s*down/i.test(label)) {
                const base = t || d; if (base) { lines.push(`Cool‑down ${base}${pace}`.trim()); return; }
              }
              // Rest-like blocks
              if (label.includes('rest') || label.includes('recovery') || label.includes('jog') || label.includes('easy')) {
                const tt=fmtTime(o?.duration); lines.push(`1 × ${tt ? `${tt} rest` : 'rest'}`.trim()); return;
              }
              if (d) lines.push(`1 × ${d}${pace}`.trim()); else if (t) lines.push(`1 × ${t}${pace}`.trim());
            };
            for (const it of arr) { if (Array.isArray(it?.segments) && it?.repeatCount && it.repeatCount>0) { for(let r=0;r<Number(it.repeatCount);r+=1){ for(const seg of it.segments) pushOne(seg);} } else pushOne(it); }
            return lines;
          })() : []; } catch { return []; }
        })();
        const computedSteps = Array.isArray(comp?.steps) ? comp.steps : [];
        if (computedSteps.length > 0) {
          setStepLines(flattenSteps(computedSteps));
        } else {
          // Per-workout backfill: if we have tokens (preferred) or intervals but no computed, synthesize computed and persist
          try {
            const stepsPresetArr: string[] | undefined = Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : undefined;
            const intervalsRaw: any[] | undefined = Array.isArray((workout as any).intervals) ? (workout as any).intervals : undefined;
            if ((stepsPresetArr && stepsPresetArr.length > 0) || (workout as any).main) {
              // Use centralized expander + resolver for accurate targets and durations
              const { expand } = await import('@/services/plans/expander');
              const { resolveTargets, totalDurationSeconds } = await import('@/services/plans/targets');
              const atomic: any[] = expand(stepsPresetArr || [], (workout as any).main, (workout as any).tags);
              const resolved: any[] = resolveTargets(atomic as any, (perfNumbers || {}), ((workout as any).export_hints || {}), String((workout as any).type||'').toLowerCase());
              if (Array.isArray(resolved) && resolved.length) {
                setStepLines(flattenSteps(resolved));
                try {
                  const nextComputed = { normalization_version: 'v3', steps: resolved, total_duration_seconds: totalDurationSeconds(resolved as any) } as any;
                  await supabase.from('planned_workouts').update({ computed: nextComputed }).eq('id', (workout as any).id);
                } catch {}
                return;
              }
            }
          } catch {}
          // STRICT UI: Only show if we can render tokens or computed; otherwise show a clear not-materialized message
          // If JSON supplies display_overrides.expand for this view, or expand_spec, honor it first
          const wantUnpack = (() => {
            try {
              const ov = (workout as any).display_overrides;
              if (ov && typeof ov === 'object' && String(ov.planned_detail || ov.planned) === 'unpack') return true;
              return Boolean((workout as any).expand_spec);
            } catch { return false; }
          })();
          if (wantUnpack) {
            const expanded = expandFromSpec(
              (workout as any).expand_spec,
              String((workout as any).type||''),
              ((workout as any).export_hints || {}),
              (perfNumbers || {}),
              String((workout as any).pace_annotation || 'inline'),
              (Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : ([] as string[]))
            );
            if (expanded.length) {
              // Prepend/append WU/CD from tokens if available, without duplicating
              const tokenLinesWUCD = interpretTokensPerRep(
                (Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : ([] as string[])),
                String((workout as any).type || ''),
                ((workout as any).export_hints || {}),
                (perfNumbers || {})
              ).filter((s)=>/^(Warm‑up|Cool‑down)\s/i.test(s));
              const warm = tokenLinesWUCD.filter((s)=>/^Warm‑up\s/i.test(s));
              const cool = tokenLinesWUCD.filter((s)=>/^Cool‑down\s/i.test(s));
              setStepLines([...(warm||[]), ...expanded, ...(cool||[])]);
              return;
            }
          }
          const perfObj = (perfNumbers || {});
          const tokenLines = interpretTokensPerRep(
            (Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : ([] as string[])),
            String((workout as any).type || ''),
            ((workout as any).export_hints || {}),
            perfObj
          );
          if (tokenLines && tokenLines.length) {
            setStepLines(tokenLines);
          } else {
            setStepLines(["Not materialized — open from Plans/Calendar to bake details."]);
          }
        }
      } catch {
        setFriendlyDesc(stripCodes(workout.description));
      }
      try {
        // Compute swim yard total
        if (String((workout as any).type||'').toLowerCase() === 'swim') {
          const compSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
          const intervalsSrc: any[] = Array.isArray((workout as any).intervals) ? (workout as any).intervals : [];
          const sumComputedYards = (arr:any[]) => {
            if (!Array.isArray(arr) || !arr.length) return 0;
            let y = 0;
            for (const s of arr) {
              if (typeof (s as any)?.distance_yd === 'number') y += Number((s as any).distance_yd);
              else if (typeof (s as any)?.distance_m === 'number') y += Number((s as any).distance_m) / 0.9144;
              if (Array.isArray((s as any)?.segments)) {
                for (const sg of (s as any).segments) {
                  if (typeof (sg as any)?.distance_yd === 'number') y += Number((sg as any).distance_yd);
                  else if (typeof (sg as any)?.distance_m === 'number') y += Number((sg as any).distance_m) / 0.9144;
                }
              }
            }
            return y;
          };
          const sumIntervalsYards = (arr:any[]) => {
            if (!Array.isArray(arr) || !arr.length) return 0;
            let m = 0;
            for (const it of arr) {
              if (Array.isArray((it as any)?.segments) && Number((it as any)?.repeatCount)>0) {
                for (let r=0;r<Number((it as any).repeatCount);r+=1) {
                  for (const sg of (it as any).segments) {
                    if (typeof (sg as any)?.distanceMeters === 'number') m += Number((sg as any).distanceMeters);
                  }
                }
              } else if (typeof (it as any)?.distanceMeters === 'number') {
                m += Number((it as any).distanceMeters);
              }
            }
            return m / 0.9144;
          };
          const yards = sumComputedYards(compSteps) || sumIntervalsYards(intervalsSrc);
          if (yards && isFinite(yards)) {
            const rounded = Math.round(yards / 25) * 25;
            if (rounded > 0) setTotalYards(rounded);
          }
        } else {
          setTotalYards(undefined);
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout.id]);

  // Derive swim yard total from rendered step lines as a fallback
  React.useEffect(() => {
    try {
      if (String((workout as any).type||'').toLowerCase() !== 'swim') return;
      const lines = Array.isArray(stepLines) ? stepLines : [];
      let yards = 0;
      for (const s of lines) {
        const m = String(s).match(/(\d+)\s*yd\b/i);
        if (m) yards += parseInt(m[1], 10) || 0;
      }
      if (yards > 0) setTotalYards(yards);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepLines, workout.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'sent_to_garmin': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Expand per-rep lines from compact JSON spec (expand_spec)
  const expandFromSpec = (spec: any, discipline: string, exportHints: any, perf: any, annotation: string, stepsPreset?: string[]): string[] => {
    if (!spec || typeof spec !== 'object') return [];
    const out: string[] = [];
    const type = String(discipline||'').toLowerCase();
    const reps = Number(spec.reps) || 0;
    if (reps <= 0) return out; // hard fail closed
    const tolEasy = typeof exportHints?.pace_tolerance_easy==='number' ? exportHints.pace_tolerance_easy : 0.06;
    const tolQual = typeof exportHints?.pace_tolerance_quality==='number' ? exportHints.pace_tolerance_quality : 0.04;
    const fivek = String(perf?.fiveK_pace || perf?.fiveKPace || perf?.fiveK || '').trim() || undefined;
    const easy = String(perf?.easyPace || perf?.easy_pace || '').trim() || undefined;
    const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
    const parsePace = (p?: string): { sec:number, unit:'mi'|'km' } | null => { if (!p) return null; const m = String(p).match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i); if (!m) return null; return { sec: parseInt(m[1],10)*60+parseInt(m[2],10), unit: m[3].toLowerCase() as any }; };
    // Derive default targets from tokens if not provided in spec
    const tokensJoined = Array.isArray(stepsPreset) ? stepsPreset.join(' ').toLowerCase() : '';
    const defaultWorkToken = /5kpace|10kpace|tempo|interval/.test(tokensJoined) ? '{5k_pace}' : undefined;
    const defaultRestToken = /rest|recovery|easy/.test(tokensJoined) ? '{easy_pace}' : '{easy_pace}';
    const resolveTarget = (t?: string, phase: 'work'|'rest'='work') => {
      if (!t) return undefined as string|undefined;
      let raw = t;
      if (fivek) raw = raw.split('{5k_pace}').join(String(fivek));
      if (easy) raw = raw.split('{easy_pace}').join(String(easy));
      const p = parsePace(raw);
      if (!p) return t; // show verbatim token when baselines are missing or unparsable
      const tol = /easy/i.test(String(t)) ? tolEasy : tolQual;
      const lo = `${mmss(p.sec*(1-tol))}/${p.unit}`; const hi = `${mmss(p.sec*(1+tol))}/${p.unit}`;
      return `${mmss(p.sec)}/${p.unit} (${lo}–${hi})`;
    };
    const work = spec.work || {};
    const rest = spec.rest || {};
    const idPrefix = typeof spec.id_prefix === 'string' && spec.id_prefix.trim().length>0 ? String(spec.id_prefix).trim() : '';
    const workTarget = resolveTarget(work.target || defaultWorkToken, 'work');
    const restTarget = resolveTarget(rest.target || defaultRestToken, 'rest');
    for (let i=0;i<reps;i+=1){
      const repNum = i+1;
      const workId = idPrefix ? `${idPrefix}-rep${repNum}-work` : '';
      if (typeof work.distance_m === 'number') out.push(`1 × ${Math.round(work.distance_m)} m${annotation==='inline' && workTarget?` @ ${workTarget}`:''}${workId?` // ${workId}`:''}`);
      else if (typeof work.time_s === 'number') out.push(`1 × ${mmss(work.time_s)}${annotation==='inline' && workTarget?` @ ${workTarget}`:''}${workId?` // ${workId}`:''}`);
      if (i<reps-1){
        const restId = idPrefix ? `${idPrefix}-rep${repNum}-rest` : '';
        if (typeof rest.time_s === 'number') out.push(`1 × ${mmss(rest.time_s)} rest${annotation==='inline' && restTarget?` @ ${restTarget}`:''}${restId?` // ${restId}`:''}`);
        else if (typeof rest.distance_m === 'number') out.push(`1 × ${Math.round(rest.distance_m)} m rest${annotation==='inline' && restTarget?` @ ${restTarget}`:''}${restId?` // ${restId}`:''}`);
      }
    }
    return out;
  };

  // Final fallback: expand grouped text (e.g., "6 × 400 m @ 7:43/mi … w 2 min jog …") into per-rep lines
  const expandGroupedFromText = (text: string, discipline: string, exportHints: any, perf: any): string[] => {
    const out: string[] = [];
    const type = String(discipline||'').toLowerCase();
    if (!text || !/\b(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|mi)\b/i.test(text)) return out;
    const tolEasy = typeof exportHints?.pace_tolerance_easy==='number' ? exportHints.pace_tolerance_easy : 0.06;
    const tolQual = typeof exportHints?.pace_tolerance_quality==='number' ? exportHints.pace_tolerance_quality : 0.04;
    const fivek = String(perf?.fiveK_pace || perf?.fiveKPace || perf?.fiveK || '').trim() || undefined;
    const easy = String(perf?.easyPace || perf?.easy_pace || '').trim() || undefined;
    const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
    const parsePace = (p?: string): { sec:number, unit:'mi'|'km' } | null => { if (!p) return null; const m = String(p).match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i); if (!m) return null; return { sec: parseInt(m[1],10)*60+parseInt(m[2],10), unit: m[3].toLowerCase() as any }; };
    const m = text.match(/\b(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|mi)\b.*?(?:@\s*(\d+:\d{2}\s*\/\s*(?:mi|km)))?/i);
    if (!m) return out;
    const reps = parseInt(m[1],10);
    const per = parseFloat(m[2]);
    const unit = String(m[3]||'m').toLowerCase();
    const paceStr = m[4] || (type==='run' ? (fivek || easy || '') : '');
    const p = type==='run' ? parsePace(paceStr) : null;
    const tol = tolQual;
    const rng = p ? (()=>{ const lo=`${mmss(p.sec*(1-tol))}/${p.unit}`; const hi=`${mmss(p.sec*(1+tol))}/${p.unit}`; return `${mmss(p.sec)}/${p.unit} (${lo}–${hi})`; })() : undefined;
    // optional rest like "w 2 min jog" or "R 2min"
    const restMatch = text.match(/(?:w|with|\bR\b)\s*(\d+)\s*(?:min|minutes)/i);
    const restMin = restMatch ? parseInt(restMatch[1],10) : 0;
    for (let r=0; r<reps; r+=1) {
      out.push(`1 × ${unit==='mi'?per:`${Math.round(per)} m`}${rng?` @ ${rng}`:''}`);
      if (r<reps-1 && restMin>0) out.push(`1 × ${restMin}:00 rest`);
    }
    return out;
  };

  const getSourceColor = (source?: string) => {
    switch (source) {
      case 'manual': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'plan_template': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'training_plan': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const secTo = (s?: number | null) => {
    if (typeof s !== 'number' || !isFinite(s) || s <= 0) return '';
    const mm = Math.floor(s / 60);
    const ss = Math.round(s % 60);
    return `${mm}:${String(ss).padStart(2,'0')}`;
  };

  const paceRangeStr = (obj: any) => {
    try {
      if (obj?.pace_range && typeof obj.pace_range.lower === 'number' && typeof obj.pace_range.upper === 'number') {
        return `${secTo(obj.pace_range.lower)}–${secTo(obj.pace_range.upper)}`;
      }
      if (typeof obj?.pace_sec_per_mi === 'number') return `${secTo(obj.pace_sec_per_mi)}`;
    } catch {}
    return undefined;
  };

  const powerRangeStr = (obj: any) => {
    try {
      if (obj?.power_range && typeof obj.power_range.lower === 'number' && typeof obj.power_range.upper === 'number') {
        return `${obj.power_range.lower}–${obj.power_range.upper} W`;
      }
      if (typeof obj?.target_watts === 'number') return `${obj.target_watts} W`;
    } catch {}
    return undefined;
  };

  const swimPer100Str = (obj: any) => {
    try {
      if (obj?.swim_pace_range_per_100) {
        const lo = obj.swim_pace_range_per_100.lower;
        const hi = obj.swim_pace_range_per_100.upper;
        if (typeof lo === 'number' && typeof hi === 'number') {
          return `${secTo(lo)}–${secTo(hi)}`;
        }
      }
      if (typeof obj?.swim_pace_sec_per_100 === 'number') {
        return `${secTo(obj.swim_pace_sec_per_100)}`;
      }
    } catch {}
    return undefined;
  };

  // Format workout-level primary target from computed.targets_summary
  const formatPrimaryTarget = (computedAny: any): string | undefined => {
    try {
      const ts = computedAny?.targets_summary;
      if (!ts || typeof ts !== 'object') return undefined;
      if (ts.power && (typeof ts.power.value === 'number' || ts.power.range)) {
        if (ts.power.range && Array.isArray(ts.power.range)) {
          const [lo, hi] = ts.power.range as [number, number];
          if (Number.isFinite(lo) && Number.isFinite(hi)) return `${lo}–${hi} W`;
        }
        if (typeof ts.power.value === 'number') return `${Math.round(ts.power.value)} W`;
      }
      if (ts.pace && (typeof ts.pace.value === 'string' || ts.pace.range)) {
        if (ts.pace.range && Array.isArray(ts.pace.range)) {
          const [a, b] = ts.pace.range as [string, string];
          if (a && b) return `${a}–${b}`;
        }
        if (typeof ts.pace.value === 'string') return ts.pace.value;
      }
    } catch {}
    return undefined;
  };

  const distStr = (obj: any) => {
    if (typeof obj?.distance_m === 'number' && obj.distance_m > 0) return `${Math.round(obj.distance_m)}m`;
    if (typeof obj?.distance === 'string' && obj.distance.trim()) return obj.distance;
    return undefined;
  };

  const timeStr = (obj: any) => {
    if (typeof obj?.durationSeconds === 'number' && obj.durationSeconds > 0) return secTo(obj.durationSeconds);
    if (typeof obj?.time === 'string' && obj.time.trim()) return obj.time;
    return undefined;
  };

  const isRestLike = (obj: any) => {
    const label = String(obj?.effortLabel || obj?.intensity || '').toLowerCase();
    return label.includes('rest') || label.includes('recovery');
  };

  const flattenSteps = (stepsRaw: any[] | undefined): string[] => {
    if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return [];
    const lines: string[] = [];
    const workoutLevelTarget: string | undefined = formatPrimaryTarget((workout as any).computed);
    const hints: any = (workout as any)?.export_hints || {};
    const tolEasy = typeof hints.pace_tolerance_easy === 'number' ? hints.pace_tolerance_easy : 0.06;
    const tolQual = typeof hints.pace_tolerance_quality === 'number' ? hints.pace_tolerance_quality : 0.04;
    const parsePace = (txt: string): { sec: number; unit: 'mi'|'km' } | null => {
      const m = String(txt).trim().match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i);
      if (!m) return null;
      return { sec: parseInt(m[1],10)*60 + parseInt(m[2],10), unit: m[3].toLowerCase() as any };
    };
    const mmss = (s: number) => { const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
    const workoutType = String((workout as any).type||'').toLowerCase();
    const pushSeg = (seg: any, nextSeg?: any) => {
      // v3 schema: { type, duration_s?, distance_m? | distance_yd?, target_value?, target_low?, target_high? }
      if (typeof seg?.type === 'string' && (typeof seg?.duration_s === 'number' || typeof seg?.distance_m === 'number' || typeof (seg as any)?.distance_yd === 'number')) {
        const kind = String(seg.type).toLowerCase();
        const isRestV3 = kind === 'interval_rest' || /rest/.test(kind);
        const isWarmV3 = kind === 'warmup' || kind === 'swim_warmup';
        const isCoolV3 = kind === 'cooldown' || kind === 'swim_cooldown';
        const typeLower = String((workout as any).type||'').toLowerCase();
        const isSwim = typeLower === 'swim';
        // Standalone V3 rest (e.g., swim_rest_rNN): render "Rest mm:ss" and return
        if (isRestV3 && isSwim) {
          const sec = typeof seg?.duration_s === 'number' ? seg.duration_s : (seg as any)?.rest_s;
          if (typeof sec === 'number' && sec>0) {
            const rmm = Math.floor(sec/60); const rss = sec%60;
            lines.push(`Rest ${rmm}:${String(rss).padStart(2,'0')}`);
            return;
          }
        }
        const base = (() => {
          // Prefer authored yards from enriched swim steps
          if (isSwim && typeof (seg as any).distance_yd === 'number' && (seg as any).distance_yd > 0) {
            const yd = Math.round((seg as any).distance_yd / 25) * 25;
            return `${yd} yd`;
          }
          if (typeof seg?.distance_m === 'number' && seg.distance_m > 0) {
            if (isSwim) {
              const yd = Math.round(seg.distance_m / 0.9144 / 25) * 25; // nearest 25 yd
              return `${yd} yd`;
            }
            // For runs, prefer miles instead of meters
            const isRun = typeLower === 'run';
            if (isRun) {
              const miles = seg.distance_m / 1609.34;
              const fmt = (n:number) => {
                const nearInt = Math.abs(n - Math.round(n)) < 1e-6;
                if (nearInt) return String(Math.round(n));
                // Show 2 decimals for <1 mi reps (e.g., 0.25 mi), else 1 decimal
                return n < 1 ? n.toFixed(2) : (Math.round(n * 10) / 10).toFixed(1);
              };
              return `${fmt(miles)} mi`;
            }
            return `${Math.round(seg.distance_m)}m`;
          }
          if (typeof seg?.duration_s === 'number' && seg.duration_s > 0) return secTo(seg.duration_s);
          return undefined;
        })();
        const trg = (!isSwim && seg?.target_value && seg?.target_low && seg?.target_high)
          ? `${seg.target_value} (${seg.target_low}–${seg.target_high})`
          : undefined;
        if (base) {
          const label = (() => {
            if (isWarmV3) return 'Warm‑up';
            if (isCoolV3) return 'Cool‑down';
            if (isRestV3) return '';
            if (isSwim) {
              const cue = String(seg?.cue||'');
              const labelPref = (seg as any).label as string | undefined;
              if (labelPref && labelPref.trim()) return labelPref.trim();
              if (/drill:/.test(cue)) return String(cue.split(':')[1] || '').replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
              if (/pull/i.test(cue)) return 'Pull';
              if (/kick/i.test(cue)) return 'Kick';
              if (/aerobic/i.test(cue)) return 'Aerobic';
            }
            return '';
          })();
          const prefix = label ? label + ' ' : '';
          const equipmentRaw = isSwim ? String((seg as any).equipment||'').trim() : '';
          const equipmentList = equipmentRaw
            .split(',')
            .map(s=>s.trim())
            .filter(s=>s.length>0 && s.toLowerCase()!=='none')
            .map(s=>s.replace(/pull buoy/ig,'buoy').replace(/kickboard/ig,'board').replace(/\(optional\)/ig,'(opt)'));
          let abbrEquipList = Array.from(new Set(equipmentList));
          // Equipment formatting rules (universal):
          // - Drills: show optional list "(optional: ... )"
          // - Pull: show required gear "— buoy" when present
          // - Kick: show required gear "— board" when present
          // - Aerobic and others: suppress equipment
          const isDrillLabel = /^Drill\b/.test(label);
          const isPullKind = kind === 'swim_pull';
          const isKickKind = kind === 'swim_kick';
          const hasBuoy = abbrEquipList.includes('buoy');
          const hasBoard = abbrEquipList.includes('board');
          // For drills, always show canonical optional gear regardless of token
          if (isDrillLabel) {
            const low = label.toLowerCase();
            if (low.includes('single arm')) {
              if (!abbrEquipList.includes('fins')) abbrEquipList.push('fins');
              if (!abbrEquipList.includes('board')) abbrEquipList.push('board');
            }
            if (low.includes('catch-up')) {
              if (!abbrEquipList.includes('board')) abbrEquipList.push('board');
            }
          }
          const equipAnn = (() => {
            if (isSwim && isDrillLabel && abbrEquipList.length>0) return ` (optional: ${abbrEquipList.join(' or ')})`;
            if (isPullKind && hasBuoy) return ' — buoy';
            if (isKickKind && hasBoard) return ' — board';
            return '';
          })();
          lines.push(`${prefix}1 × ${base}${trg ? ` @ ${trg}` : ''}${equipAnn}`.trim());
          // Show rests only between reps (never after the last in a block)
          if (isSwim && typeof (seg as any).rest_s === 'number' && (seg as any).rest_s>0) {
            const nextLabel = (() => {
              if (!nextSeg) return '';
              const nk = String(nextSeg?.type||'').toLowerCase();
              if (nk==='warmup' || nk==='swim_warmup') return 'Warm‑up';
              if (nk==='cooldown' || nk==='swim_cooldown') return 'Cool‑down';
              const cue = String(nextSeg?.cue||'');
              const pref = (nextSeg as any).label as string | undefined;
              if (pref && pref.trim()) return pref.trim();
              if (/drill:/.test(cue)) return String(cue.split(':')[1] || '').replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
              if (/pull/i.test(cue)) return 'Pull';
              if (/kick/i.test(cue)) return 'Kick';
              if (/aerobic/i.test(cue)) return 'Aerobic';
              return '';
            })();
            if (nextLabel && nextLabel === label) {
              const rs = Math.max(1, Math.round((seg as any).rest_s));
              const rmm = Math.floor(rs/60); const rss = rs%60;
              lines.push(`Rest ${rmm}:${String(rss).padStart(2,'0')}`);
            }
          }
        }
        return;
      }
      const d = distStr(seg);
      const t = timeStr(seg);
      const pr = paceRangeStr(seg) || (typeof seg?.paceTarget === 'string' ? seg.paceTarget : undefined);
      const pw = powerRangeStr(seg);
      const sp = swimPer100Str(seg);
      // For run distance reps, derive a per-rep time range from pace
      const deriveRunTimeRange = (): string | undefined => {
        try {
          if (!d) return undefined;
          // extract numeric meters from d when formatted like "400m" or "0.5 mi"
          let meters = 0;
          const md = String(d).trim().toLowerCase();
          if (/mi\b/.test(md)) {
            const m = md.match(/([\d\.]+)/);
            if (m) meters = parseFloat(m[1]) * 1609.34;
          } else if (/km\b/.test(md)) {
            const m = md.match(/([\d\.]+)/);
            if (m) meters = parseFloat(m[1]) * 1000;
          } else {
            const m = md.match(/(\d+)/);
            if (m) meters = parseFloat(m[1]);
          }
          if (!meters || !Number.isFinite(meters)) return undefined;
          // pace seconds per mile if available
          const baseSec = typeof seg?.pace_sec_per_mi === 'number' ? seg.pace_sec_per_mi : undefined;
          const rng = seg?.pace_range && typeof seg.pace_range.lower === 'number' && typeof seg.pace_range.upper === 'number'
            ? { lo: seg.pace_range.lower, hi: seg.pace_range.upper }
            : undefined;
          const miles = meters / 1609.34;
          const fmt = (s:number) => { const x=Math.round(s); const mm=Math.floor(x/60); const ss=x%60; return `${mm}:${String(ss).padStart(2,'0')}`; };
          if (rng) {
            return `${fmt(rng.lo * miles)}–${fmt(rng.hi * miles)}`;
          }
          if (typeof baseSec === 'number' && isFinite(baseSec)) {
            const tol = 0.04; // quality default
            return `${fmt(baseSec*(1-tol)*miles)}–${fmt(baseSec*(1+tol)*miles)}`;
          }
        } catch {}
        return undefined;
      };
      if (isRestLike(seg)) {
        lines.push(`1 × ${t || d || 'rest'} rest`);
      } else if (d || t) {
        // Prefer discipline-specific targets
        let target = pw || (sp ? `${sp}/100` : pr) || workoutLevelTarget;
        // Ensure pace shows with range when we have a single pace value
        if (target && typeof target === 'string' && /\d+:\d{2}\s*\/\s*(mi|km)/i.test(target) && !/\(/.test(target)) {
          const p = parsePace(target);
          if (p) {
            const tol = tolQual; // work step
            const lo = `${mmss(p.sec*(1-tol))}/${p.unit}`;
            const hi = `${mmss(p.sec*(1+tol))}/${p.unit}`;
            target = `${mmss(p.sec)}/${p.unit} (${lo}–${hi})`;
          }
        }
        const timeAnn = (!t && d && pr) ? deriveRunTimeRange() : undefined;
        lines.push(`1 × ${(d || t)}${target ? ` @ ${target}` : ''}${timeAnn ? ` — ${timeAnn}` : ''}`.trim());
      }
    };
    // Compact swim rendering: group identical reps and include WU/CD (only in compact contexts)
    if (workoutType === 'swim' && compact) {
      type SwimItem = { label: string; yards: number; equipment: string };
      const items: SwimItem[] = [];
      const pushIf = (seg: any) => {
        const kind = String(seg?.type||'').toLowerCase();
        const isWU = kind==='swim_warmup' || kind==='warmup';
        const isCD = kind==='swim_cooldown' || kind==='cooldown';
        const yd = (typeof (seg as any)?.distance_yd === 'number')
          ? Math.round((seg as any).distance_yd/25)*25
          : (typeof (seg as any)?.distance_m === 'number' ? Math.round((seg as any).distance_m/0.9144/25)*25 : 0);
        if (isWU || isCD) {
          if (yd>0) items.push({ label: isWU?'Warm‑up':'Cool‑down', yards: yd, equipment: '' });
          return;
        }
        // only group work-like swim steps
        if (!/swim_/.test(kind)) return;
        if (yd<=0) return;
        const labelPref = (seg as any)?.label ? String((seg as any).label).trim() : '';
        const label = labelPref || 'Set';
        const eqRaw = String((seg as any)?.equipment||'').trim();
        const eqList = eqRaw.split(',').map(s=>s.trim()).filter(s=>s.length>0 && s.toLowerCase()!=='none')
          .map(s=>s.replace(/pull buoy/ig,'buoy').replace(/kickboard/ig,'board').replace(/\(optional\)/ig,'(opt)'));
        const eq = /^Drill\b/.test(label) ? Array.from(new Set(eqList)).join(', ') : '';
        items.push({ label, yards: yd, equipment: eq });
      };
      for (const st of stepsRaw) {
        if (Array.isArray(st?.segments) && typeof st?.repeatCount === 'number' && st.repeatCount > 0) {
          for (let r=0;r<st.repeatCount;r++) for (const seg of st.segments) pushIf(seg);
        } else { pushIf(st); }
      }
      // Group consecutive identical items
      let i = 0;
      while (i < items.length) {
        const a = items[i];
        // Warm‑up/Cool‑down emit as single lines
        if (a.label==='Warm‑up' || a.label==='Cool‑down') {
          lines.push(`${a.label} 1 × ${a.yards} yd`);
          i += 1; continue;
        }
        let count = 1; let j = i+1;
        while (j < items.length) {
          const b = items[j];
          if (a.label===b.label && a.yards===b.yards && a.equipment===b.equipment) { count += 1; j += 1; } else break;
        }
        const equipAnn = a.equipment ? ` — ${a.equipment}` : '';
        lines.push(`${a.label} ${count} × ${a.yards} yd${equipAnn}`.trim());
        i = j;
      }
      return lines;
    }

    // Flatten segments to decide rest placement based on the next step label
    const flatSegs: any[] = [];
    for (const st of stepsRaw) {
      if (Array.isArray(st?.segments) && typeof st?.repeatCount === 'number' && st.repeatCount > 0) {
        for (let r = 0; r < st.repeatCount; r++) {
          for (const seg of st.segments) flatSegs.push(seg);
        }
      } else {
        flatSegs.push(st);
      }
    }
    for (let i=0;i<flatSegs.length;i+=1){
      const cur = flatSegs[i];
      const nxt = i+1<flatSegs.length ? flatSegs[i+1] : undefined;
      pushSeg(cur, nxt);
    }
    return lines;
  };

  // UI-only interpreter for steps_preset → per-rep lines with targets
  const interpretTokensPerRep = (stepsPreset: string[], discipline: string, exportHints: any, perf: any): string[] => {
    if (!Array.isArray(stepsPreset) || stepsPreset.length===0) return [];
    const out: string[] = [];
    const type = String(discipline||'').toLowerCase();
    const tolEasy = typeof exportHints?.pace_tolerance_easy==='number' ? exportHints.pace_tolerance_easy : 0.06;
    const tolQual = typeof exportHints?.pace_tolerance_quality==='number' ? exportHints.pace_tolerance_quality : 0.04;
    const fivek = String(perf?.fiveK_pace || perf?.fiveKPace || perf?.fiveK || '').trim() || undefined;
    const easy = String(perf?.easyPace || perf?.easy_pace || '').trim() || undefined;
    const parsePace = (p?: string): { sec:number, unit:'mi'|'km' } | null => {
      if (!p) return null; const m = String(p).match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i); if (!m) return null; return { sec: parseInt(m[1],10)*60+parseInt(m[2],10), unit: m[3].toLowerCase() as any };
    };
    const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
    const toMeters = (n:number, unit:'m'|'mi'|'yd'|'km'='m') => unit==='mi'?Math.floor(n*1609.34):unit==='yd'?Math.floor(n*0.9144):unit==='km'?Math.floor(n*1000):Math.floor(n);
    const toNumber = (raw: string) => parseFloat(String(raw).replace('_','.'));
    const parsePlus = (tok?: string): number => { if (!tok) return 0; const m = tok.match(/plus(\d+)(?::(\d{2}))?/i); if (!m) return 0; return (parseInt(m[1],10)*60) + (m[2]?parseInt(m[2],10):0); };
    const paceWithRange = (basePace: {sec:number, unit:'mi'|'km'}|null, tol:number) => {
      if (!basePace) return undefined as string|undefined;
      const lo = `${mmss(basePace.sec*(1-tol))}/${basePace.unit}`;
      const hi = `${mmss(basePace.sec*(1+tol))}/${basePace.unit}`;
      return `${mmss(basePace.sec)}/${basePace.unit} (${lo}–${hi})`;
    };
    const ftp = typeof perf?.ftp === 'number' && isFinite(perf.ftp) ? perf.ftp as number : undefined;
    const pTolSS = typeof exportHints?.power_tolerance_SS_thr==='number' ? exportHints.power_tolerance_SS_thr : 0.05;
    const pTolVO2 = typeof exportHints?.power_tolerance_VO2==='number' ? exportHints.power_tolerance_VO2 : 0.10;
    const powerRange = (centerFraction: number, tol: number) => {
      if (!ftp) return undefined as string|undefined;
      const lo = Math.round(ftp * (centerFraction * (1 - tol)));
      const hi = Math.round(ftp * (centerFraction * (1 + tol)));
      return `${lo}–${hi} W`;
    };
    const tokenStr = stepsPreset.join(' ').toLowerCase();
    const pushWU = (min:number) => { if (min>0){ const base = parsePace(easy || fivek); const rng = base?` @ ${mmss(base.sec)}/${base.unit} (${mmss(base.sec*(1-tolEasy))}/${base.unit}–${mmss(base.sec*(1+tolEasy))}/${base.unit})`:''; out.push(`Warm‑up ${min}:00${rng}`.trim()); }};
    const pushCD = (min:number) => { if (min>0){ const base = parsePace(easy || fivek); const rng = base?` @ ${mmss(base.sec)}/${base.unit} (${mmss(base.sec*(1-tolEasy))}/${base.unit}–${mmss(base.sec*(1+tolEasy))}/${base.unit})`:''; out.push(`Cool‑down ${min}:00${rng}`.trim()); }};
    // Warmup/Cooldown
    stepsPreset.forEach((t)=>{ const s=t.toLowerCase(); let m=s.match(/warmup.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/); if(m){ const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; pushWU(Math.round((a+b)/2)); }
      m=s.match(/cooldown.*?(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/); if(m){ const a=parseInt(m[1],10); const b=m[2]?parseInt(m[2],10):a; pushCD(Math.round((a+b)/2)); }});
    // Intervals run
    const iv = tokenStr.match(/interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_([^_\s]+)(?:_(plus\d+(?::\d{2})?))?(?:_r(\d+)(?:-(\d+))?min)?/i);
    if (iv && type==='run'){
      const reps=parseInt(iv[1],10); const each=parseFloat(iv[2]); const unit=(iv[3]||'m').toLowerCase() as 'm'|'mi'; const tag=String(iv[4]||''); const plusTok=String(iv[5]||''); const ra=iv[6]?parseInt(iv[6],10):0; const rb=iv[7]?parseInt(iv[7],10):ra; const rest=Math.round(((ra||0)+(rb||0))/2);
      let baseTxt = /5kpace/i.test(tag) ? (fivek||easy) : /easy/i.test(tag) ? (easy||fivek) : (fivek||easy);
      if (baseTxt && plusTok){ const m = plusTok.match(/plus(\d+)(?::(\d{2}))?/i); if(m){ const add=(parseInt(m[1],10)*60)+(m[2]?parseInt(m[2],10):0); const p=parsePace(baseTxt); if(p){ baseTxt = `${mmss(p.sec+add)}/${p.unit}`; } } }
      const p = parsePace(baseTxt || '');
      for(let r=0;r<reps;r+=1){
        if (p){ const rng = paceWithRange(p, tolQual); out.push(`1 × ${unit==='mi'?each:`${Math.round(each)} m`} @ ${rng}`); } else { out.push(`1 × ${unit==='mi'?each:`${Math.round(each)} m`}`); }
        if (r<reps-1 && rest>0) out.push(`1 × ${rest}:00 rest`);
      }
    }
    // Cruise intervals with decimal miles using underscore (e.g., 1_5mi)
    const cr = tokenStr.match(/cruise_(\d+)x(\d+(?:[_\.]\d+)?)(mi)(?:_([^_\s]+))?(?:_(plus\d+(?::\d{2})?))?(?:_r(\d+)(?:-(\d+))?min)?/i);
    if (cr && type==='run'){
      const reps=parseInt(cr[1],10); const each=toNumber(cr[2]); const tag=String(cr[4]||''); const plusTok=String(cr[5]||''); const ra=cr[6]?parseInt(cr[6],10):0; const rb=cr[7]?parseInt(cr[7],10):ra; const rest=Math.round(((ra||0)+(rb||0))/2);
      let baseTxt = /5kpace/i.test(tag) ? (fivek||easy) : /easy/i.test(tag) ? (easy||fivek) : (fivek||easy);
      const addSec = parsePlus(plusTok);
      const base = parsePace(baseTxt||'');
      const adj = base ? { sec: base.sec + addSec, unit: base.unit } : null;
      for(let r=0;r<reps;r+=1){
        const rng = paceWithRange(adj, tolQual);
        out.push(`1 × ${each} mi${rng?` @ ${rng}`:''}`);
        if (r<reps-1 && rest>0) out.push(`1 × ${rest}:00 rest`);
      }
    }
    // Tempo with explicit base and plus offset (e.g., tempo_6mi_5kpace_plus0:45)
    const tpm = tokenStr.match(/tempo_(\d+(?:[_\.]\d+)?)mi(?:_([^_\s]+))?(?:_(plus\d+(?::\d{2})?))?/i);
    if (tpm && type==='run'){
      const miles = toNumber(tpm[1]); const tag = String(tpm[2]||''); const plusTok = String(tpm[3]||'');
      let baseTxt = /5kpace/i.test(tag) ? (fivek||easy) : (easy||fivek);
      const addSec = parsePlus(plusTok);
      const base = parsePace(baseTxt||'');
      const adj = base ? { sec: base.sec + addSec, unit: base.unit } : null;
      const rng = paceWithRange(adj, tolQual);
      out.push(`1 × ${miles} mi${rng?` @ ${rng}`:''}`);
    }
    // Strides (e.g., strides_6x20s)
    const st = tokenStr.match(/strides_(\d+)x(\d+)s/i);
    if (st && type==='run'){
      const reps = parseInt(st[1],10); const secs = parseInt(st[2],10);
      for(let r=0;r<reps;r+=1){ out.push(`1 × 0:${String(secs).padStart(2,'0')}`); }
    }
    // Speed (e.g., speed_8x20s_R60s)
    const spd = tokenStr.match(/speed_(\d+)x(\d+)s(?:_r(\d+)s)?/i);
    if (spd && type==='run'){
      const reps = parseInt(spd[1],10); const workS = parseInt(spd[2],10); const restS = spd[3]?parseInt(spd[3],10):0;
      for(let r=0;r<reps;r+=1){ out.push(`1 × 0:${String(workS).padStart(2,'0')}`); if (r<reps-1 && restS>0) out.push(`1 × 0:${String(restS).padStart(2,'0')} rest`); }
    }
    // Long runs (e.g., longrun_150min_easypace...)
    const lr = tokenStr.match(/longrun_(\d+)min/i);
    if (lr && type==='run'){
      const min = parseInt(lr[1],10);
      const base = parsePace(easy || fivek || '');
      const rng = paceWithRange(base, tolEasy);
      out.push(`1 × ${min}:00${rng?` @ ${rng}`:''}`);
    }
    // Bike intensity blocks: VO2, Threshold, Sweet Spot (e.g., bike_vo2_6x3min_R3min)
    const bIv = tokenStr.match(/bike_(vo2|thr|ss)_(\d+)x(\d+)min(?:_r(\d+)min)?/i);
    if (bIv && type==='ride'){
      const kind = String(bIv[1]).toLowerCase(); const reps = parseInt(bIv[2],10); const workMin = parseInt(bIv[3],10); const restMin = bIv[4]?parseInt(bIv[4],10):0;
      const center = kind==='vo2'?1.10 : kind==='thr'?0.98 : 0.92; // ss default
      const tol = kind==='vo2'?pTolVO2 : pTolSS;
      const rng = powerRange(center, tol);
      for(let r=0;r<reps;r+=1){ out.push(`1 × ${workMin}:00${rng?` @ ${rng}`:''}`); if (r<reps-1 && restMin>0) out.push(`1 × ${restMin}:00 rest`); }
    }
    // Bike endurance/recovery singles (e.g., bike_endurance_120min_Z2, bike_recovery_35min_Z1)
    const bEnd = tokenStr.match(/bike_(endurance|recovery)_(\d+)min/i);
    if (bEnd && type==='ride'){
      const kind = String(bEnd[1]).toLowerCase(); const min = parseInt(bEnd[2],10);
      const center = kind==='recovery'?0.55:0.68; const tol = 0.05;
      const rng = powerRange(center, tol);
      out.push(`1 × ${min}:00${rng?` @ ${rng}`:''}`);
    }
    // Tempo legacy fallback (tempo_6mi)
    const tmLegacy = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi/i);
    if (tmLegacy && type==='run'){
      const miles=parseFloat(tmLegacy[1]); const p=parsePace(fivek || easy || ''); if (p){ const lo = `${mmss(p.sec*(1-tolQual))}/${p.unit}`; const hi = `${mmss(p.sec*(1+tolQual))}/${p.unit}`; out.push(`1 × ${miles} mi @ ${mmss(p.sec)}/${p.unit} (${lo}–${hi})`);} else out.push(`1 × ${miles} mi`);
    }

    // Swim tokens → labeled per-rep lines (yards-first, with rests/equipment)
    if (type==='swim'){
      const addRest = (key:string) => key==='catchup'? '0:15' : key==='singlearm'||key==='single_arm'? '0:20' : undefined;
      // Warmup/Cooldown distance
      stepsPreset.forEach((t)=>{ const s=t.toLowerCase(); let m=s.match(/swim_(warmup|cooldown)_(\d+)(yd|m)/i); if(m){ const dist=parseInt(m[2],10); const unit=(m[3]||'yd').toLowerCase(); const yd = unit==='m'? Math.round(dist/0.9144/25)*25 : Math.round(dist/25)*25; out.push(`${m[1].toLowerCase()==='warmup'?'Warm‑up':'Cool‑down'} 1 × ${yd} yd`);} });
      // Drills with specific names
      const swimDrillRe=/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i;
      stepsPreset.forEach((t)=>{ const m=t.match(swimDrillRe); if(m){ const reps=parseInt(m[1],10); const each=parseInt(m[2],10); const unit=(m[3]||'yd').toLowerCase(); const key=(m[4]||'').toLowerCase(); const label = key==='catchup'?'Catch-up': key==='singlearm'||key==='single_arm'?'Single Arm': key==='fist'?'Fist Swim': key==='scullfront'||key==='front_scull'?'Scull (Front)': key==='fingertipdrag'||key==='fingertip_drag'?'Fingertip Drag': key==='zipper'?'Zipper': key==='doggypaddle'||key==='dog_paddle'?'Doggy Paddle': key==='616'||key==='six_one_six'?'6-1-6':'Drill'; const equip = (key==='scullfront' || key==='616') ? ' — snorkel (opt)' : ''; const yd= unit==='m'? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25; for(let r=0;r<reps;r+=1){ out.push(`${label} 1 × ${yd} yd${equip}`); const rs=addRest(key); if(rs) out.push(`Rest ${rs}`);} } });
      // Pull/Kick blocks
      const swimPKRe=/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i;
      stepsPreset.forEach((t)=>{ const m=t.match(swimPKRe); if(m){ const kind=(m[1]||'').toLowerCase(); const reps=parseInt(m[2],10); const each=parseInt(m[3],10); const unit=(m[4]||'yd').toLowerCase(); const yd= unit==='m'? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25; const label = kind==='pull'?'Pull — buoy':'Kick — board'; for(let r=0;r<reps;r+=1){ out.push(`${label} 1 × ${yd} yd`);} } });
      // Aerobic blocks
      const swimAerRe=/swim_aerobic_(\d+)x(\d+)(yd|m)/i;
      stepsPreset.forEach((t)=>{ const m=t.match(swimAerRe); if(m){ const reps=parseInt(m[1],10); const each=parseInt(m[2],10); const unit=(m[3]||'yd').toLowerCase(); const yd= unit==='m'? Math.round(each/0.9144/25)*25 : Math.round(each/25)*25; for(let r=0;r<reps;r+=1){ out.push(`Aerobic 1 × ${yd} yd`);} } });
    }
    return out;
  };

  // Heuristic per-rep from intervals when tokens are unavailable
  const synthesizeFromIntervals = (intervals: any[] | undefined, discipline: string, exportHints: any, perf: any): string[] => {
    if (!Array.isArray(intervals) || intervals.length===0) return [];
    const type = String(discipline||'').toLowerCase();
    const tolEasy = typeof exportHints?.pace_tolerance_easy==='number' ? exportHints.pace_tolerance_easy : 0.06;
    const tolQual = typeof exportHints?.pace_tolerance_quality==='number' ? exportHints.pace_tolerance_quality : 0.04;
    const fivek = String(perf?.fiveK_pace || perf?.fiveKPace || perf?.fiveK || '').trim() || undefined;
    const easy = String(perf?.easyPace || perf?.easy_pace || '').trim() || undefined;
    const parsePace = (p?: string): { sec:number, unit:'mi'|'km' } | null => { if (!p) return null; const m=String(p).match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i); if (!m) return null; return { sec: parseInt(m[1],10)*60+parseInt(m[2],10), unit: m[3].toLowerCase() as any }; };
    const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
    const parseTimeStr = (val: any): number | null => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const m = val.match(/^(\d+):(\d{2})$/);
        if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
      }
      return null;
    };
    const out: string[] = [];
    const pushOne = (lab: string, meters?: number, seconds?: number) => {
      const isRest = /rest|recovery/i.test(lab);
      if (typeof seconds === 'number' && seconds>0) {
        if (type==='run'){
          const base = parsePace(isRest ? (easy||fivek) : (fivek||easy));
          if (base){ const tol = isRest?tolEasy:tolQual; const lo=`${mmss(base.sec*(1-tol))}/${base.unit}`; const hi=`${mmss(base.sec*(1+tol))}/${base.unit}`; out.push(`1 × ${mmss(seconds)} @ ${mmss(base.sec)}/${base.unit} (${lo}–${hi})`); return; }
        }
        out.push(`1 × ${mmss(seconds)}${isRest?' rest':''}`); return;
      }
      if (typeof meters === 'number' && meters>0) {
        if (type==='run'){
          const base = parsePace(fivek || easy);
          if (base){ const tol = tolQual; const lo=`${mmss(base.sec*(1-tol))}/${base.unit}`; const hi=`${mmss(base.sec*(1+tol))}/${base.unit}`; out.push(`1 × ${Math.round(meters)} m @ ${mmss(base.sec)}/${base.unit} (${lo}–${hi})`); return; }
        }
        if (type==='swim'){
          const yd = Math.round(Number(meters) / 0.9144 / 25) * 25;
          // Map swim cues to labels (fallback heuristic). Prefer specific drill name.
          const raw = String(lab || '').toLowerCase();
          const drillName = (() => {
            if (/catchup/.test(raw)) return 'Catch-up';
            if (/singlearm|single_arm/.test(raw)) return 'Single Arm';
            if (/fist/.test(raw)) return 'Fist Swim';
            if (/scullfront|front_scull/.test(raw)) return 'Scull (Front)';
            if (/fingertipdrag|fingertip_drag/.test(raw)) return 'Fingertip Drag';
            if (/zipper/.test(raw)) return 'Zipper';
            if (/doggypaddle|dog_paddle/.test(raw)) return 'Doggy Paddle';
            if (/\b616\b|six_one_six/.test(raw)) return '6-1-6';
            return null;
          })();
          const prefix = drillName || (/pull/.test(raw) ? 'Pull' : /kick/.test(raw) ? 'Kick' : /aerobic/.test(raw) ? 'Aerobic' : /warm\s*up/.test(raw) ? 'Warm‑up' : /cool\s*down/.test(raw) ? 'Cool‑down' : '');
          out.push(`${prefix ? `${prefix} ` : ''}1 × ${yd} yd`.trim());
          return;
        }
        out.push(`1 × ${Math.round(meters)} m`); return;
      }
      out.push('1 ×');
    };
    for (const it of intervals){
      if (Array.isArray(it?.segments) && Number(it?.repeatCount)>0){
        for (let r=0;r<Number(it.repeatCount);r+=1){ for (const sg of it.segments){ const dur = (parseTimeStr((sg as any).time) ?? Number(sg?.duration)) || 0; pushOne(String(sg?.effortLabel||it?.effortLabel||'interval'), Number(sg?.distanceMeters)||0, dur); } }
      } else {
        const dur = (parseTimeStr((it as any).time) ?? Number(it?.duration)) || 0;
        pushOne(String(it?.effortLabel||'interval'), Number(it?.distanceMeters)||0, dur);
      }
    }
    return out;
  };

  const deriveFocus = () => {
    const txt = String(workout.name || workout.rendered_description || workout.description || '').toLowerCase();
    if (/interval/.test(txt) || /\b\d+x\d+/.test(txt)) return 'Intervals';
    if (/vo2|vo₂/.test(txt)) return 'VO2';
    if (/tempo|threshold|thr\b/.test(txt)) return 'Tempo';
    if (/drill|technique/.test(txt)) return 'Technique';
    if (/long|endurance|z2/.test(txt)) return 'Endurance';
    return 'Planned';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors rounded">
        <div className="text-xs font-semibold">
          {getWorkoutTypeIcon(workout.type)}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">
            {workout.name || (workout as any).focus || 'Planned Workout'}
          </h4>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{formatDate(workout.date)}</span>
            {workout.duration && (
              <>
                <Clock className="h-3 w-3" />
                <span>{workout.duration} min</span>
              </>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-500">
          {workout.workout_status.replace('_', ' ')}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {showHeader && (
        <div className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold">
                {getWorkoutTypeIcon(workout.type)}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {(() => {
                    const n = String(workout.name || '').trim();
                    if (n) return n;
                    return `${getWorkoutTypeLabel(workout.type)} — ${deriveFocus()}`;
                  })()}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{formatDate(workout.date)}</span>
                  {(workout.duration || resolvedDuration) && (
                    <>
                      <Clock className="h-4 w-4" />
                      <span>{workout.duration || resolvedDuration} minutes</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              {workout.workout_status.replace('_', ' ')}
              {workout.source ? ` · ${workout.source.replace('_', ' ')}` : ''}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Planned pill and title */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Planned</span>
          <div className="text-sm text-gray-500">
            {resolvedDuration ? `${resolvedDuration} min` : (typeof workout.duration==='number'?`${workout.duration} min`: '')}
            {String((workout as any).type||'').toLowerCase()==='swim' && typeof (totalYardsMemo||totalYards)==='number' && (totalYardsMemo||totalYards)!>0 ? ` • ${(totalYardsMemo||totalYards)} yd` : ''}
          </div>
        </div>
        <h3 className="text-base font-semibold">
          {getWorkoutTypeLabel(workout.type)} — {deriveFocus()}
        </h3>
        {String((workout as any).type||'').toLowerCase()==='swim' && typeof (totalYardsMemo||totalYards)==='number' && (totalYardsMemo||totalYards)!>0 && (
          <div className="text-sm text-gray-500">Total {(totalYardsMemo||totalYards)} yd</div>
        )}

        {/* Vertical step list (minimal, no color panel) */}
        <div className="p-1">
          {(() => {
            const lines = Array.isArray(stepLines) ? stepLines : [];
            if (lines.length === 0) {
              return (
                <div className="text-sm text-gray-700">{friendlyDesc || stripCodes(workout.description)}</div>
              );
            }
            // Ensure warm-up first, then main, cooldown last
            const reordered = (() => {
              const isCool = (s: string) => /cool[\s\u00A0]*(?:-|[\u2010-\u2015])?\s*down/i.test(s);
              const isWarm = (s: string) => /warm[\s\u00A0]*(?:-|[\u2010-\u2015])?\s*up/i.test(s);
              const warm: string[] = [];
              const cool: string[] = [];
              const main: string[] = [];
              lines.forEach(l => {
                if (isWarm(l)) warm.push(l);
                else if (isCool(l)) cool.push(l);
                else main.push(l);
              });
              const out = [...warm, ...main, ...cool];
              // Ensure every main rep has a target; don't rely on a global hasTarget check (WU/CD may already have targets)
              const workoutTarget = formatPrimaryTarget((workout as any).computed) || fallbackPace;
              const needsTarget = (s: string) => !/warm|cool|rest/i.test(s) && !/@\s*\d|@\s*\d+:\d{2}\s*\/\s*(mi|km)/i.test(s);
              const isSwim = String((workout as any).type||'').toLowerCase()==='swim';
              return out.map((s) => (needsTarget(s) && workoutTarget && !isSwim) ? `${s} @ ${workoutTarget}`.trim() : s);
            })();
            return (
              <ul className="list-none space-y-1">
                {reordered.map((ln, i) => (
                  <li key={i} className="text-sm text-gray-900">{ln}</li>
                ))}
              </ul>
            );
          })()}
        </div>

        {/* Action Buttons (minimal, lower on page) */}
        {(onEdit || onComplete || true) && (
          <div className="flex gap-6 mt-40 pt-12 pb-36">
            {/* Send to Garmin */}
            {['run','ride','swim','strength'].includes(workout.type) && (
              <SendToGarminButton workoutId={workout.id} disabled={workout.workout_status === 'sent_to_garmin'} />
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-0 py-0 text-sm text-gray-900 hover:underline"
              >
                Edit
              </button>
            )}
            {onComplete && (workout.workout_status === 'planned' || !workout.workout_status || workout.workout_status === 'in_progress') && (
              <button
                onClick={onComplete}
                className="px-0 py-0 text-sm text-gray-900 hover:underline"
              >
                Mark Complete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const SendToGarminButton: React.FC<{ workoutId: string; disabled?: boolean }> = ({ workoutId, disabled }) => {
  const [isSending, setIsSending] = React.useState(false);

  const handleSend = async () => {
    try {
      setIsSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in');
        return;
      }
      const { error } = await supabase.functions.invoke('send-workout-to-garmin', {
        body: { workoutId, userId: user.id }
      });
      if (error) throw error;
      alert('Sent to Garmin');
    } catch (e: any) {
      console.error(e);
      alert(`Failed to send: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <button
      disabled={disabled || isSending}
      onClick={handleSend}
      className={`px-0 py-0 text-sm transition-colors ${
        disabled || isSending
          ? 'text-gray-400 cursor-not-allowed'
          : 'text-gray-900 hover:underline'
      }`}
    >
      {isSending ? 'Sending…' : 'Send to Garmin'}
    </button>
  );
};

export default PlannedWorkoutView;
