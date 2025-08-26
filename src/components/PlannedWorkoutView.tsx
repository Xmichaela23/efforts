import React from 'react';
import { Clock, Target, Dumbbell, MapPin, Info } from 'lucide-react';
import { getDisciplineColor } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import WorkoutDetailView from './WorkoutDetailView';

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
  console.log('🔍 PlannedWorkoutView computed data:', workout.computed);
  console.log('🔍 PlannedWorkoutView workout:', workout);
  
  const [friendlyDesc, setFriendlyDesc] = React.useState<string | undefined>(undefined);
  const [resolvedDuration, setResolvedDuration] = React.useState<number | undefined>(undefined);
  
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

  const getWorkoutTypeColor = (type: string) => {
    switch (type) {
      case 'run': return 'bg-green-100 text-green-800 border-green-200';
      case 'ride': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'swim': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'strength': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'walk': return 'bg-green-100 text-green-100 text-green-800 border-green-200';
      default: return 'bg-green-100 text-green-800 border-green-200';
    }
  };

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

        // Prefer computed.total_duration_seconds
        const comp: any = (workout as any).computed || null;
        let secs: any = comp ? comp.total_duration_seconds : null;
        if (typeof secs === 'string') secs = parseInt(secs, 10);
        if (typeof secs === 'number' && isFinite(secs) && secs > 0) {
          setResolvedDuration(Math.round(secs / 60));
        } else if (!workout.duration) {
          const est = estimateMinutesFromDescription((workout as any).rendered_description || workout.description);
          if (est > 0) setResolvedDuration(est);
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

  const getTargetSuffix = (interval: any) => {
    const target = interval?.paceTarget || interval?.powerTarget || interval?.bpmTarget || interval?.cadenceTarget;
    return target ? ` at ${target}` : '';
  };

  const formatRepeatSummary = (segments: any[]) => {
    if (!Array.isArray(segments) || segments.length === 0) return '';
    return segments
      .map((seg: any) => `${seg.time || ''} ${seg.effortLabel || ''}${getTargetSuffix(seg)}`.trim())
      .join(' + ');
  };

  const formatIntervalLine = (interval: any, index: number) => {
    if (Array.isArray(interval?.segments) && interval?.repeatCount) {
      const inner = formatRepeatSummary(interval.segments);
      return `${interval.repeatCount}x — (${inner})`;
    }
    const label = interval.effortLabel || `Segment ${index + 1}`;
    const time = interval.time || '';
    return `${label} — ${time}${getTargetSuffix(interval)}`.trim();
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors rounded">
        <div className="text-xs font-semibold" style={{ color: getDisciplineColor(workout.type) }}>
          {getWorkoutTypeIcon(workout.type)}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate" style={{ color: getDisciplineColor(workout.type) }}>
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
              <div className="text-sm font-bold" style={{ color: getDisciplineColor(workout.type) }}>
                {getWorkoutTypeIcon(workout.type)}
              </div>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: getDisciplineColor(workout.type) }}>
                  {workout.name || (workout as any).focus || 'Planned Workout'}
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

      <div className="space-y-4">
        {/* Template System - No Fallbacks */}
        <WorkoutDetailView
          computed={workout.computed || { total_duration_seconds: 0, steps: [] }}
          baselines={{
            fiveK_pace_sec_per_mi: (workout as any).fiveK_pace_sec_per_mi,
            easy_pace_sec_per_mi: (workout as any).easy_pace_sec_per_mi,
            ftp: (workout as any).ftp,
            swim_pace_per_100_sec: (workout as any).swim_pace_per_100_sec,
            // Strength 1RMs
            squat: (workout as any).squat,
            bench: (workout as any).bench,
            deadlift: (workout as any).deadlift,
            overheadPress1RM: (workout as any).overheadPress1RM,
            barbellRow: (workout as any).barbellRow
          }}
          workoutType={getWorkoutTypeLabel(workout.type)}
          description={workout.rendered_description || workout.description}
        />

        {/* Action Buttons */}
        {(onEdit || onComplete || onDelete || true) && (
          <div className="flex gap-2 pt-2">
            {/* Send to Garmin */}
            {['run','ride','swim','strength'].includes(workout.type) && (
              <SendToGarminButton workoutId={workout.id} disabled={workout.workout_status === 'sent_to_garmin'} />
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors border border-blue-200 rounded hover:bg-blue-50"
              >
                Edit
              </button>
            )}
            {onComplete && workout.workout_status === 'planned' && (
              <button
                onClick={onComplete}
                className="px-3 py-1.5 text-sm text-green-600 hover:text-green-700 transition-colors border border-green-200 rounded hover:bg-green-50"
              >
                Mark Complete
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 transition-colors border border-red-200 rounded hover:bg-red-50"
              >
                Delete
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
      className={`px-3 py-1.5 text-sm border rounded transition-colors ${
        disabled || isSending
          ? 'text-gray-400 border-gray-200 cursor-not-allowed'
          : 'text-indigo-600 hover:text-indigo-700 border-indigo-200 hover:bg-indigo-50'
      }`}
    >
      {isSending ? 'Sending…' : 'Send to Garmin'}
    </button>
  );
};

export default PlannedWorkoutView;
