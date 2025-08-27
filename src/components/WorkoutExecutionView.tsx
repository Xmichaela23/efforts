import React from 'react';
import { generateExecutionTemplate, WorkoutComputed, UserBaselines } from '@/services/plans/templates/workoutDisplayTemplates';
import { Clock, Play, Repeat, Target } from 'lucide-react';

interface WorkoutExecutionViewProps {
  computed: WorkoutComputed;
  baselines: UserBaselines;
  workoutType: string;
  description?: string;
  className?: string;
  showStatus?: boolean;
}

const WorkoutExecutionView: React.FC<WorkoutExecutionViewProps> = ({
  computed,
  baselines,
  workoutType,
  description,
  className = '',
  showStatus = true
}) => {
  const workoutDisplay = generateExecutionTemplate(computed, baselines, workoutType, description);

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'warmup':
        return <Play className="h-4 w-4 text-green-600" />;
      case 'main':
        return <Repeat className="h-4 w-4 text-blue-600" />;
      case 'recovery':
        return <Clock className="h-4 w-4 text-gray-600" />;
      case 'cooldown':
        return <Play className="h-4 w-4 text-red-600" />;
      case 'option':
        return <Target className="h-4 w-4 text-purple-600" />;
      case 'alternative':
        return <Target className="h-4 w-4 text-orange-600" />;
      default:
        return <Target className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Workout Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-base">
            {workoutDisplay.title}
          </h4>
          
          {/* Duration */}
          <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
            <Clock className="h-4 w-4" />
            <span>{workoutDisplay.totalDuration}</span>
          </div>
        </div>
        
        {/* Status Badge */}
        {showStatus && (
          <div className="flex-shrink-0">
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs">
              <span className="font-medium">planned</span>
            </div>
          </div>
        )}
      </div>

      {/* Execution Steps */}
      <div className="space-y-2">
        {workoutDisplay.steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              {getStepIcon(step.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-700">
                  {step.description}
                </p>
                {step.isOptional && (
                  <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded-full">Optional</span>
                )}
                {step.isAlternative && (
                  <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded-full">Alternative</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Additional Notes */}
      {description && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">{description}</p>
        </div>
      )}
    </div>
  );
};

export default WorkoutExecutionView;
