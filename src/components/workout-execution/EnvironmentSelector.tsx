/**
 * EnvironmentSelector - Choose Indoor vs Outdoor
 * 
 * First screen after tapping "Start Workout" on a planned workout.
 * Determines sensor requirements and execution mode.
 */

import React from 'react';
import type { WorkoutEnvironment, WorkoutEquipment } from '@/types/workoutExecution';
import { getDisciplineColorRgb, getDisciplineTextClassVariant, getDisciplineBorderClass } from '@/lib/context-utils';

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
  // Discipline colors - using centralized color system
  const rgb = getDisciplineColorRgb(workoutType);
  const accentClasses = {
    text: getDisciplineTextClassVariant(workoutType, '400'),
    border: getDisciplineBorderClass(workoutType, '30'),
    hoverBorder: `hover:${getDisciplineBorderClass(workoutType, '60')}`,
  };
  
  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)',
        backgroundImage: `
          radial-gradient(circle at 20% 50%, rgba(${rgb}, 0.08) 0%, transparent 60%),
          radial-gradient(circle at 80% 80%, rgba(${rgb}, 0.05) 0%, transparent 60%),
          radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%),
          linear-gradient(225deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%)
        `,
        backgroundAttachment: 'fixed'
      }}
      onClick={onBack}
    >
      {/* Content wrapper - stops propagation */}
      <div onClick={(e) => e.stopPropagation()}>
        {/* Header Card */}
        <div 
          className="backdrop-blur-xl border-2 rounded-2xl mx-3 mt-3 mb-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]"
          style={{
            background: `linear-gradient(135deg, rgba(${rgb},0.15) 0%, rgba(${rgb},0.05) 50%, rgba(255,255,255,0.03) 100%)`,
            borderColor: `rgba(${rgb}, 0.3)`
          }}
        >
          <div className="flex items-center justify-between px-4 py-4">
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
        <div className="flex-1 flex flex-col justify-center px-3 pb-20 pt-20">
          <h2 className="text-white text-lg font-light text-center mb-8">
            Where will you {isRun ? 'run' : 'ride'}?
          </h2>
          
          <div className="space-y-3">
            {/* Outdoor Option */}
            <button
              onClick={() => onSelect('outdoor')}
              className="w-full backdrop-blur-xl border-2 rounded-2xl p-5 
                       shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]
                       hover:bg-white/[0.08] transition-all duration-300"
              style={{
                background: `linear-gradient(135deg, rgba(${rgb},0.12) 0%, rgba(${rgb},0.04) 50%, rgba(255,255,255,0.02) 100%)`,
                borderColor: `rgba(${rgb}, 0.3)`
              }}
            >
              <div className="text-white text-lg font-light">Outdoor</div>
              <div className="text-gray-400 text-sm font-light mt-1">
                GPS tracking enabled
              </div>
            </button>
            
            {/* Indoor Option */}
            <button
              onClick={() => onSelect('indoor', isRun ? 'treadmill' : 'trainer')}
              className="w-full backdrop-blur-xl border-2 rounded-2xl p-5 
                       shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]
                       hover:bg-white/[0.08] transition-all duration-300"
              style={{
                background: `linear-gradient(135deg, rgba(${rgb},0.12) 0%, rgba(${rgb},0.04) 50%, rgba(255,255,255,0.02) 100%)`,
                borderColor: `rgba(${rgb}, 0.3)`
              }}
            >
              <div className="text-white text-lg font-light">Indoor</div>
              <div className="text-gray-400 text-sm font-light mt-1">
                {isRun ? 'Treadmill / Track' : 'Trainer'}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentSelector;

