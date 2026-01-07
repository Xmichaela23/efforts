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
  
  // Discipline colors - teal for run, green for ride
  const accentClasses = isRun 
    ? { text: 'text-teal-400', border: 'border-teal-500/30', hoverBorder: 'hover:border-teal-500/60' }
    : { text: 'text-green-400', border: 'border-green-500/30', hoverBorder: 'hover:border-green-500/60' };
  
  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)',
      }}
    >
      {/* Header Card */}
      <div className="bg-white/[0.05] backdrop-blur-xl border-2 border-white/20 py-4 mb-4 mx-3 mt-3 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between px-4">
          <button 
            onClick={onBack}
            className="text-sm px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300"
          >
            ← Back
          </button>
          <span className={`text-sm font-medium ${accentClasses.text}`}>
            {isRun ? 'Run' : 'Ride'}
          </span>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col justify-center px-3 pb-20">
        <h2 className="text-white text-lg font-light text-center mb-8">
          Where will you {isRun ? 'run' : 'ride'}?
        </h2>
        
        <div className="space-y-3">
          {/* Outdoor Option */}
          <button
            onClick={() => onSelect('outdoor')}
            className={`w-full bg-white/[0.05] backdrop-blur-xl border-2 ${accentClasses.border} rounded-2xl p-5 
                     shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]
                     hover:bg-white/[0.08] ${accentClasses.hoverBorder} transition-all duration-300`}
          >
            <div className="text-white text-lg font-light">Outdoor</div>
            <div className="text-gray-400 text-sm font-light mt-1">
              GPS tracking enabled
            </div>
          </button>
          
          {/* Indoor Option */}
          <button
            onClick={() => onSelect('indoor', isRun ? 'treadmill' : 'trainer')}
            className={`w-full bg-white/[0.05] backdrop-blur-xl border-2 ${accentClasses.border} rounded-2xl p-5 
                     shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]
                     hover:bg-white/[0.08] ${accentClasses.hoverBorder} transition-all duration-300`}
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

