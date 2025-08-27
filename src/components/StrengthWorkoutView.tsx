import React from 'react';
import { WorkoutDisplay, WorkoutStep } from '@/services/plans/templates/workoutDisplayTemplates';

interface StrengthWorkoutViewProps {
  workoutDisplay: WorkoutDisplay;
  className?: string;
}

const StrengthWorkoutView: React.FC<StrengthWorkoutViewProps> = ({
  workoutDisplay,
  className = ''
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Workout Title */}
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-lg font-semibold text-gray-900">{workoutDisplay.title}</h3>
        <div className="text-sm text-gray-600 mt-1">
          {workoutDisplay.totalDuration}
        </div>
      </div>

      {/* Strength Exercises */}
      <div className="space-y-3">
        {workoutDisplay.steps.map((step, index) => (
          <div key={index} className="border-l-4 border-gray-200 bg-gray-50 pl-4 py-3">
            <div className="space-y-2">
              <div className="font-medium text-gray-900">
                {step.description}
              </div>
              
              {/* Exercise Details */}
              <div className="space-y-1 text-sm text-gray-700">
                {step.duration && (
                  <div>{step.duration}</div>
                )}
                
                {step.target && (
                  <div>{step.target}</div>
                )}
                
                {step.range && (
                  <div className="text-gray-600">{step.range}</div>
                )}
                
                {step.recovery && (
                  <div className="font-medium">{step.recovery}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrengthWorkoutView;
