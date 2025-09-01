import React from 'react';
import { generateSummaryWorkoutTemplate, WorkoutComputed, UserBaselines } from '@/services/plans/templates/workoutDisplayTemplates';
import { Clock } from 'lucide-react';

interface WorkoutSummaryViewProps {
  computed: WorkoutComputed;
  baselines: UserBaselines;
  workoutType: string;
  description?: string;
  className?: string;
  compact?: boolean;
}

const WorkoutSummaryView: React.FC<WorkoutSummaryViewProps> = ({
  computed,
  baselines,
  workoutType,
  description,
  className = '',
  compact = false
}) => {
  const display = generateSummaryWorkoutTemplate(computed, baselines, workoutType, description);

  return (
    <div className={`${compact ? 'space-y-2' : 'space-y-3'} ${className}`}>
      {/* Header with title and total duration */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>{display.title}</h4>
        </div>
        <div className="flex-shrink-0">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 ${compact ? 'text-xs' : 'text-sm'}`}>
            <Clock className={`${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
            <span className="font-medium">{display.totalDuration}</span>
          </div>
        </div>
      </div>

      {/* Structured list: Warm‑up → Main (grouped) → Cool‑down */}
      <div className={`${compact ? 'space-y-1' : 'space-y-2'}`}>
        {display.steps
          // Keep order as produced by template (WU first, then Main, then CD)
          .map((step, idx) => (
            <div key={idx} className={compact ? 'text-xs text-gray-700' : 'text-sm text-gray-700'}>
              <span className="font-medium">{step.type === 'warmup' ? 'Warm‑up' : step.type === 'cooldown' ? 'Cool‑down' : step.type === 'recovery' ? 'Recovery' : 'Main'}</span>
              {step.description ? <> {step.description}</> : null}
              {step.target ? <> {step.target}</> : null}
              {step.range ? <> <span className="text-gray-500">{step.range}</span></> : null}
              {step.recovery ? <> <span className="text-gray-500">{step.recovery}</span></> : null}
            </div>
          ))}
      </div>

      {/* Optional extra description (grouped) */}
      {description && !compact && (
        <div className="text-sm text-gray-500 border-t border-gray-100 pt-2">
          {description}
        </div>
      )}
    </div>
  );
};

export default WorkoutSummaryView;

export default WorkoutSummaryView;
