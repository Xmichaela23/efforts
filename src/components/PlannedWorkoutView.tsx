import React from 'react';
import { Clock, Target, Dumbbell, MapPin, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';


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
      case 'walk': return 'bg-green-100 text-green-800 border-green-200';
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

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors rounded">
        <div className={`text-xs font-bold px-2 py-1 rounded border ${getWorkoutTypeColor(workout.type)}`}>{getWorkoutTypeIcon(workout.type)}</div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate text-gray-900">{workout.name || (workout as any).focus || 'Planned Workout'}</h4>
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
        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(workout.workout_status)}`}>
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
              <div className={`text-sm font-bold px-3 py-2 rounded border ${getWorkoutTypeColor(workout.type)}`}>{getWorkoutTypeIcon(workout.type)}</div>
              <div>
                <h3 className="text-lg font-semibold">{workout.name || (workout as any).focus || 'Planned Workout'}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{formatDate(workout.date)}</span>
                  {workout.duration && (
                    <>
                      <Clock className="h-4 w-4" />
                      <span>{workout.duration} minutes</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(workout.workout_status)}`}>
                {workout.workout_status.replace('_', ' ')}
              </span>
              {workout.source && (
                <span className={`px-2 py-1 text-xs rounded-full ${getSourceColor(workout.source)}`}>
                  {workout.source.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Workout Structure Display */}
        {/* Removed legacy top summary block per design request */}
        
        {workout.strength_exercises && workout.strength_exercises.length > 0 && (
          <div className="border-l-2 border-blue-200 pl-4 py-2">
            <h4 className="font-medium text-sm text-gray-700 mb-2">Exercises:</h4>
            <div className="space-y-1">
              {workout.strength_exercises.map((exercise: any, index: number) => (
                <div key={index} className="text-xs text-gray-600">
                  {exercise.name}: {exercise.sets}s × {exercise.reps}r @ {exercise.weight} lbs
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Workout Type & Details */}
        <div className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-blue-600" />
          <span className="font-medium">{getWorkoutTypeLabel(workout.type)}</span>
          {workout.training_plan_id && workout.week_number && workout.day_number && (
            <span className="text-gray-500">
              • Week {workout.week_number}, Day {workout.day_number}
            </span>
          )}
        </div>

        {/* Description */}
        {workout.description && (
          <div className="flex gap-2">
            <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">{workout.description}</p>
          </div>
        )}

        {/* Intervals (for run/ride/swim) */}
        {workout.intervals && workout.intervals.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2 text-gray-700">
              <MapPin className="h-4 w-4 text-gray-500" />
              Intervals
            </h4>
            <div className="space-y-2">
              {workout.intervals.map((interval: any, index: number) => (
                <div key={index} className="p-3 border-l-2 border-gray-200 pl-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-gray-900">
                      {interval.effortLabel || `Segment ${index + 1}`}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      {interval.time}{getTargetSuffix(interval)}
                    </span>
                  </div>
                  {interval.bpmTarget && (
                    <div className="text-xs text-gray-500 mt-1">
                      HR: {interval.bpmTarget}
                    </div>
                  )}
                  {interval.rpeTarget && (
                    <div className="text-xs text-gray-500 mt-1">
                      RPE: {interval.rpeTarget}
                    </div>
                  )}
                  {interval.repeatCount && (
                    <div className="text-xs text-gray-500 mt-1">
                      {interval.repeatCount}×
                    </div>
                  )}
                  {interval.segments && interval.segments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {interval.segments.map((segment: any, segIndex: number) => (
                        <div key={segIndex} className="text-xs text-gray-600 pl-2 border-l border-gray-100">
                          {segment.time} @ {segment.effortLabel}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strength Exercises */}
        {workout.strength_exercises && workout.strength_exercises.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2 text-gray-700">
              <Dumbbell className="h-4 w-4 text-gray-500" />
              Exercises
            </h4>
            <div className="space-y-2">
              {workout.strength_exercises.map((exercise: any, index: number) => (
                <div key={index} className="p-3 border-l-2 border-gray-200 pl-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-gray-900">{exercise.name}</span>
                    {exercise.weight && (
                      <span className="text-xs text-gray-500 font-medium">
                        {exercise.weight} lbs
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                    {exercise.sets && (
                      <span>{exercise.sets}s</span>
                    )}
                    {exercise.reps && (
                      <span>{exercise.reps}r</span>
                    )}
                    {exercise.distance && (
                      <span>{exercise.distance} {exercise.distanceUnit || 'm'}</span>
                    )}
                    {exercise.time && (
                      <span>{exercise.time}</span>
                    )}
                  </div>
                  {exercise.notes && (
                    <div className="text-xs text-gray-500 mt-1 italic">
                      {exercise.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
