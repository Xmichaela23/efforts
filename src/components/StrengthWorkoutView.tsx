import React from 'react';
import { Dumbbell, Target, Clock, Repeat } from 'lucide-react';
import { WorkoutDisplay, WorkoutStep } from '@/services/plans/templates/workoutDisplayTemplates';

interface StrengthWorkoutViewProps {
  workoutDisplay: WorkoutDisplay;
  className?: string;
}

const StrengthWorkoutView: React.FC<StrengthWorkoutViewProps> = ({
  workoutDisplay,
  className = ''
}) => {
  const getStepIcon = (type: string) => {
    switch (type) {
      case 'main':
        return <Dumbbell className="h-4 w-4 text-blue-600" />;
      default:
        return <Target className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStepColor = (type: string) => {
    switch (type) {
      case 'main':
        return 'border-l-blue-200 bg-blue-50';
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
        </div>
      </div>

      {/* Strength Exercises */}
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
                </div>
                
                {/* Exercise Details */}
                <div className="space-y-1 text-sm text-gray-700">
                  {step.duration && (
                    <div className="flex items-center gap-2">
                      <Repeat className="h-3 w-3 text-gray-500" />
                      <span className="font-medium">{step.duration}</span>
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
                      Rest: {step.recovery}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrengthWorkoutView;
