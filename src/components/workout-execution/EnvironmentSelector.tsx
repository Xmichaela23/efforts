/**
 * EnvironmentSelector - Choose Indoor vs Outdoor
 * 
 * First screen after tapping "Start Workout" on a planned workout.
 * Determines sensor requirements and execution mode.
 */

import React from 'react';
import { Trees, Home, Footprints } from 'lucide-react';
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
            className="w-full bg-white/[0.05] backdrop-blur-lg border-2 border-white/25 rounded-2xl p-6 
                     hover:bg-white/[0.08] hover:border-white/40 transition-all duration-300
                     flex items-center gap-4 group"
          >
            <div className="w-14 h-14 rounded-xl bg-green-500/20 border border-green-500/30 
                          flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
              <Trees className="w-7 h-7 text-green-400" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-white text-lg font-light">Outdoor</div>
              <div className="text-gray-400 text-sm font-light">
                GPS tracking enabled
              </div>
            </div>
          </button>
          
          {/* Indoor Option */}
          <button
            onClick={() => onSelect('indoor', isRun ? 'treadmill' : 'trainer')}
            className="w-full bg-white/[0.05] backdrop-blur-lg border-2 border-white/25 rounded-2xl p-6 
                     hover:bg-white/[0.08] hover:border-white/40 transition-all duration-300
                     flex items-center gap-4 group"
          >
            <div className="w-14 h-14 rounded-xl bg-blue-500/20 border border-blue-500/30 
                          flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
              <Home className="w-7 h-7 text-blue-400" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-white text-lg font-light">Indoor</div>
              <div className="text-gray-400 text-sm font-light">
                {isRun ? 'Treadmill / Track' : 'Trainer'}
              </div>
            </div>
          </button>
          
          {/* Track option for running (appears after indoor selection in a real app) */}
          {/* For MVP, we treat track as indoor with manual laps later */}
        </div>
      </div>
    </div>
  );
};

export default EnvironmentSelector;

