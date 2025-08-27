import React from 'react';
import { generateDetailedWorkoutTemplate, WorkoutComputed, UserBaselines, isStrengthWorkout } from '@/services/plans/templates/workoutDisplayTemplates';
import { Clock, Target, Repeat, Play } from 'lucide-react';
import StrengthWorkoutView from './StrengthWorkoutView';

interface WorkoutDetailViewProps {
  computed: WorkoutComputed;
  baselines: UserBaselines;
  workoutType: string;
  description?: string;
  className?: string;
}

const WorkoutDetailView: React.FC<WorkoutDetailViewProps> = ({
  computed,
  baselines,
  workoutType,
  description,
  className = ''
}) => {
  const workoutDisplay = generateDetailedWorkoutTemplate(computed, baselines, workoutType, description);

  // If this is a strength workout, use the strength-specific view
  if (isStrengthWorkout(computed)) {
    return <StrengthWorkoutView workoutDisplay={workoutDisplay} className={className} />;
  }

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

  const getStepColor = (type: string) => {
    switch (type) {
      case 'warmup':
        return 'border-l-green-200 bg-green-50';
      case 'main':
        return 'border-l-blue-200 bg-blue-50';
      case 'recovery':
        return 'border-l-gray-200 bg-gray-50';
      case 'cooldown':
        return 'border-l-red-200 bg-red-50';
      case 'option':
        return 'border-l-purple-200 bg-purple-50';
      case 'alternative':
        return 'border-l-orange-200 bg-orange-50';
      default:
        return 'border-l-gray-200 bg-gray-50';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Workout Title */}
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-lg font-semibold text-gray-900">{workoutDisplay.title}</h3>
        <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
          <Clock className="h-4 w-4" />
          <span>{workoutDisplay.totalDuration}</span>
          {workoutDisplay.totalDurationRange && (
            <span className="text-gray-500">(range: {workoutDisplay.totalDurationRange})</span>
          )}
        </div>
      </div>

      {/* Workout Steps */}
      <div className="space-y-3">
        {workoutDisplay.steps.map((step, index) => (
          <div key={index} className={`border-l-4 pl-4 py-3 ${getStepColor(step.type)}`}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {getStepIcon(step.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">{step.description}</span>
                  {step.repeats && (
                    <span className="text-sm text-gray-500">({step.repeats} reps)</span>
                  )}
                  {step.isOptional && (
                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded-full">Optional</span>
                  )}
                  {step.isAlternative && (
                    <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded-full">Alternative</span>
                  )}
                </div>
                
                {/* Step Details */}
                <div className="space-y-1 text-sm text-gray-700">
                  {step.duration && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-gray-500" />
                      <span>{step.duration}</span>
                    </div>
                  )}
                  
                  {step.target && (
                    <div className="flex items-center gap-2">
                      <Target className="h-3 w-3 text-gray-500" />
                      <span>{step.target}</span>
                    </div>
                  )}
                  
                  {step.range && (
                    <div className="text-gray-600 ml-5">
                      {step.range}
                    </div>
                  )}
                  
                  {step.recovery && (
                    <div className="text-gray-600 ml-5">
                      Recovery: {step.recovery}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Additional Notes */}
      {description && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">{description}</p>
        </div>
      )}
    </div>
  );
};

export default WorkoutDetailView;
