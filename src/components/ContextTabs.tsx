import React from 'react';
import StateTab from './context/StateTab';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';

interface ContextTabsProps {
  onClose?: () => void;
  onSelectWorkout?: (workout: any) => void;
}

const ContextTabs: React.FC<ContextTabsProps> = () => {
  const coachData = useCoachWeekContext();

  return (
    <div className="w-full h-full flex flex-col overflow-hidden instrument-panel">
      <div aria-hidden="true" className="instrument-panel-texture" />

      <div className="instrument-surface w-full h-full flex flex-col min-h-0">
        <div className="px-1 pt-1 pb-3 flex-shrink-0">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Today</p>
        </div>

        <div aria-hidden="true" className="instrument-divider" />

        <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-1">
          <StateTab coachData={coachData} />
        </div>
      </div>
    </div>
  );
};

export default ContextTabs;
