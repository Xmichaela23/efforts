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
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
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
        // Prefer server-rendered friendly text if present
        const storedText = (workout as any).rendered_description;
        if (typeof storedText === 'string' && storedText.trim().length > 0) {
          setFriendlyDesc(storedText);
        } else {
          const raw = workout.description || '';
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { setFriendlyDesc(stripCodes(raw)); return; }
          const { data } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', user.id).single();
          const pn: any = (data as any)?.performance_numbers || {};
          const fiveK = pn.fiveK_pace || pn.fiveKPace || pn.fiveK || null;
          const easy = pn.easyPace || null;
          setFallbackPace(easy || fiveK || undefined);
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

        // Safe duration resolution: prefer computed, else fall back to authored duration/estimate
        const comp: any = (workout as any).computed || {};
        let secs: any = comp.total_duration_seconds;
        if (typeof secs === 'string') secs = parseInt(secs, 10);
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

        // Build vertical step lines: prefer intervals; else computed.steps; else try normalizer with steps_preset
        const intervalLines = (() => {
          try { return Array.isArray((workout as any).intervals) ? ((): string[] => {
            const arr = (workout as any).intervals as any[];
            const lines: string[] = [];
            const defaultTarget = formatPrimaryTarget(comp);
            const fmtPace = (p?: string) => (p && String(p).trim().length > 0) ? ` @ ${p}` : '';
            const fmtDist = (m?: number) => {
              const v = Number(m || 0); if (!v || !Number.isFinite(v)) return undefined;
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
        } else if (intervalLines.length > 0) {
          setStepLines(intervalLines);
        } else {
            try {
              const stepsPreset = Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : [];
              if (stepsPreset.length > 0) {
                const { data } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', (await supabase.auth.getUser()).data.user?.id).single();
                const pn: any = (data as any)?.performance_numbers || {};
                const norm = normalizePlannedSession({ steps_preset: stepsPreset, discipline: (workout as any).type }, { performanceNumbers: pn }, (workout as any).export_hints || {});
                const c = Array.isArray(norm.computedSteps) ? norm.computedSteps : (Array.isArray((norm as any).steps) ? (norm as any).steps : []);
                if (Array.isArray(c) && c.length > 0) setStepLines(flattenSteps(c));
              }
            } catch {}
        }
      } catch {
        setFriendlyDesc(stripCodes(workout.description));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'sent_to_garmin': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
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
    const pushSeg = (seg: any) => {
      const d = distStr(seg);
      const t = timeStr(seg);
      const pr = paceRangeStr(seg) || (typeof seg?.paceTarget === 'string' ? seg.paceTarget : undefined);
      const pw = powerRangeStr(seg);
      const sp = swimPer100Str(seg);
      if (isRestLike(seg)) {
        lines.push(`1 × ${t || d || 'rest'} rest`);
      } else if (d || t) {
        // Prefer discipline-specific targets
        const target = pw || (sp ? `${sp}/100` : pr) || workoutLevelTarget;
        lines.push(`1 × ${(d || t)}${target ? ` @ ${target}` : ''}`.trim());
      }
    };
    for (const st of stepsRaw) {
      if (Array.isArray(st?.segments) && typeof st?.repeatCount === 'number' && st.repeatCount > 0) {
        for (let r = 0; r < st.repeatCount; r++) {
          for (const seg of st.segments) pushSeg(seg);
        }
      } else {
        pushSeg(st);
      }
    }
    return lines;
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
          </div>
        </div>
        <h3 className="text-base font-semibold">
          {getWorkoutTypeLabel(workout.type)} — {deriveFocus()}
        </h3>

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
              let out = [...warm, ...main, ...cool];
              // If no line has a target, append a fallback target to non-rest, non-WU/CD lines
              if (!out.some(s => /@\s*\d/.test(s))){
                const workoutTarget = formatPrimaryTarget((workout as any).computed) || fallbackPace;
                if (workoutTarget) {
                  out = out.map((s) => {
                    if (/warm|cool|rest/i.test(s)) return s;
                    return `${s} @ ${workoutTarget}`.trim();
                  });
                }
              }
              return out;
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
            {onComplete && workout.workout_status === 'planned' && (
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
