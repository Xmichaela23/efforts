import React from 'react';
import { supabase } from '@/lib/supabase';
import { expand } from '@/services/plans/expander';
import { resolveTargets } from '@/services/plans/targets';

type PlannedWorkout = {
  id?: string;
  name?: string;
  type: 'run' | 'ride' | 'swim' | 'strength' | 'walk';
  date?: string;
  description?: string;
  duration?: number;
  intervals?: any[];
  steps_preset?: string[] | null;
  export_hints?: any;
  computed?: { normalization_version?: string; steps?: any[]; total_duration_seconds?: number } | null;
};

interface PlannedWorkoutViewProps {
  workout: PlannedWorkout;
  showHeader?: boolean;
  compact?: boolean;
  onEdit?: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
}

const PlannedWorkoutView: React.FC<PlannedWorkoutViewProps> = ({ workout, showHeader = true }) => {
  const [perf, setPerf] = React.useState<any>(null);
  const [lines, setLines] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        // Load baselines
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const resp = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', user.id).single();
            setPerf((resp as any)?.data?.performance_numbers || {});
          }
        } catch { setPerf({}); }

        // Build steps: prefer computed; else expand from tokens
        const compSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? ((workout as any).computed!.steps as any[]) : [];
        let resolved: any[] = compSteps;
        if (!resolved || resolved.length === 0) {
          const tokens: string[] = Array.isArray(workout.steps_preset) ? workout.steps_preset! : [];
          if (tokens.length) {
            const atomic = expand(tokens, (workout as any).main, (workout as any).tags);
            resolved = resolveTargets(atomic as any, (perf || {}), (workout.export_hints || {}), String(workout.type||'').toLowerCase());
        } else {
            resolved = [];
          }
        }
        setLines(flatten(resolved, String(workout.type||'').toLowerCase()));
      } catch { setLines([ 'Unable to render workout details.' ]); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);

  if (!lines) return null;

  return (
    <div className="w-full space-y-3">
      {showHeader && (
        <div className="pb-1">
          <h3 className="text-lg font-semibold">{workout.name || 'Planned Workout'}</h3>
        </div>
      )}
      <div className="space-y-1 text-sm">
        {lines.map((l, i) => (
          <div key={i} className="border-l-4 border-gray-200 bg-gray-50 px-3 py-2">{l}</div>
        ))}
      </div>
    </div>
  );
};

function flatten(steps: any[], type: string): string[] {
  try {
    const out: string[] = [];
    const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s||0)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
    const fmtDist = (m?: number, isSwim?: boolean) => {
      const v = Number(m||0); if (!v || !Number.isFinite(v)) return undefined;
      if (isSwim) { const yd = Math.round(v/0.9144/25)*25; return `${yd} yd`; }
              if (Math.abs(v - Math.round(v/1609.34)*1609.34) < 1) return `${Math.round(v/1609.34)} mi`;
              if (v % 1000 === 0) return `${Math.round(v/1000)} km`;
              return `${Math.round(v)} m`;
            };
    const powerTxt = (st:any) => {
      const lo = numFromW(st?.target_low); const hi = numFromW(st?.target_high); const c = numFromW(st?.target_value);
      if (lo && hi) return `${lo}–${hi} W`;
      if (c) return `${c} W`;
                return undefined;
              };
    const numFromW = (txt?: string) => { const m = String(txt||'').match(/(\d+)\s*w/i); return m?parseInt(m[1],10):undefined; };

    const isSwim = type === 'swim';
    for (const st of (Array.isArray(steps)?steps:[])) {
      const t = String(st?.type||'').toLowerCase();
      if (t==='warmup' || t==='swim_warmup') {
        const base = typeof st?.duration_s==='number'? mmss(st.duration_s) : fmtDist((st as any).distance_m, isSwim);
        if (base) out.push(`Warm‑up ${base}`);
                    continue;
                  }
      if (t==='cooldown' || t==='swim_cooldown') {
        const base = typeof st?.duration_s==='number'? mmss(st.duration_s) : fmtDist((st as any).distance_m, isSwim);
        if (base) out.push(`Cool‑down ${base}`);
                    continue;
                  }
      if (t==='interval_rest') {
        const base = typeof st?.duration_s==='number'? mmss(st.duration_s) : fmtDist((st as any).distance_m, isSwim);
        if (base) out.push(`Rest ${base}`);
                    continue;
                  }
      if (t==='interval_work' || t==='steady' || /^swim_/.test(t) || t==='strength_work' || t==='strength_rest') {
        // Strength: show set × reps, with load if available
        if (t==='strength_work') {
          const reps = (st?.reps!=null)? String(st.reps) : '';
          const loadW = numFromW(st?.target_value); // rarely set
          const loadTxt = loadW ? ` @ ${loadW} W` : (():string|undefined=>{
            const m = String(st?.intensity||'').match(/(\d{1,3})%/); return m?` @ ${m[1]}%`:undefined;
          })();
          out.push(`${String(st?.exercise||'Set')} 1 × ${reps}${loadTxt?loadTxt:''}`.trim());
          continue;
        }
        const base = typeof st?.duration_s==='number'? mmss(st.duration_s) : fmtDist((st as any).distance_m, isSwim);
        const ptxt = (type==='ride') ? powerTxt(st) : (():string|undefined=>{
          const v = String(st?.target_value||''); if (/\d+:\d{2}\s*\/(mi|km)/i.test(v)) return v;
          return undefined;
        })();
        if (base) out.push(`1 × ${base}${ptxt?` @ ${ptxt}`:''}`.trim());
      }
    }
    return out.length? out : [ 'No steps available.' ];
  } catch { return [ 'No steps available.' ]; }
}

export default PlannedWorkoutView;


