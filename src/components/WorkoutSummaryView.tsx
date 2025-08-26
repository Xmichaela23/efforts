import React from 'react';
import { generateSummaryWorkoutTemplate, WorkoutComputed, UserBaselines } from '@/services/plans/templates/workoutDisplayTemplates';
import { Clock, Target } from 'lucide-react';

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
  const workoutDisplay = generateSummaryWorkoutTemplate(computed, baselines, workoutType, description);

  return (
    <div className={`${compact ? 'space-y-2' : 'space-y-3'} ${className}`}>
      {/* Workout Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
            {workoutDisplay.title}
          </h4>
          
          {/* Recovery and Structure Info */}
          {workoutDisplay.steps[0]?.description && (
            <p className={`text-gray-600 mt-1 ${compact ? 'text-xs' : 'text-sm'}`}>
              {workoutDisplay.steps[0].description}
            </p>
          )}
        </div>
        
        {/* Duration Badge */}
        <div className="flex-shrink-0">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 ${
            compact ? 'text-xs' : 'text-sm'
          }`}>
            <Clock className={`${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
            <span className="font-medium">{workoutDisplay.totalDuration}</span>
          </div>
        </div>
      </div>

      {/* Additional Description */}
      {description && !compact && (
        <div className="text-sm text-gray-500 border-t border-gray-100 pt-2">
          {description}
        </div>
      )}
    </div>
  );
};

export default WorkoutSummaryView;
