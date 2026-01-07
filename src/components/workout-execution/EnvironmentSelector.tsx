/**
 * EnvironmentSelector - Choose Indoor vs Outdoor
 * 
 * First screen after tapping "Start Workout" on a planned workout.
 * Determines sensor requirements and execution mode.
 */

import React from 'react';
import type { WorkoutEnvironment, WorkoutEquipment } from '@/types/workoutExecution';

interface EnvironmentSelectorProps {
  workoutType: 'run' | 'ride';
  onSelect: (environment: WorkoutEnvironment, equipment?: WorkoutEquipment) => void;
  onBack: () => void;
}

export const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({
  workoutType,
  onSelect,
  onBack,
}) => {
  const isRun = workoutType === 'run';
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-800 via-zinc-900 to-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button 
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <span className="text-white/60 text-sm font-light tracking-wide">
          WHERE?
        </span>
        <div className="w-12" /> {/* Spacer for centering */}
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col justify-center px-6 pb-20">
        <h2 className="text-white text-lg font-light text-center mb-8">
          Where will you {isRun ? 'run' : 'ride'}?
        </h2>
        
        <div className="space-y-4">
          {/* Outdoor Option */}
          <button
            onClick={() => onSelect('outdoor')}
            className="w-full bg-white/[0.05] backdrop-blur-lg border-2 border-white/25 rounded-2xl p-5 
                     hover:bg-white/[0.08] hover:border-green-500/50 transition-all duration-300"
          >
            <div className="text-white text-lg font-light">Outdoor</div>
            <div className="text-gray-400 text-sm font-light mt-1">
              GPS tracking enabled
            </div>
          </button>
          
          {/* Indoor Option */}
          <button
            onClick={() => onSelect('indoor', isRun ? 'treadmill' : 'trainer')}
            className="w-full bg-white/[0.05] backdrop-blur-lg border-2 border-white/25 rounded-2xl p-5 
                     hover:bg-white/[0.08] hover:border-blue-500/50 transition-all duration-300"
          >
            <div className="text-white text-lg font-light">Indoor</div>
            <div className="text-gray-400 text-sm font-light mt-1">
              {isRun ? 'Treadmill / Track' : 'Trainer'}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentSelector;

