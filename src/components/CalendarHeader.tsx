import React from 'react';
import NewEffortDropdown from './NewEffortDropdown';
import RoutinesDropdown from './RoutinesDropdown';
import AllEffortsDropdown from './AllEffortsDropdown';

interface CalendarHeaderProps {
  viewMode: 'month' | 'week';
  onViewModeChange: (mode: 'month' | 'week') => void;
  onAddEffort: () => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
  onViewCompleted: () => void;
  onEditEffort: (workout: any) => void;
  onSelectRoutine?: (type: string) => void;
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  viewMode,
  onViewModeChange,
  onAddEffort,
  onSelectType,
  onSelectWorkout,
  onViewCompleted,
  onEditEffort,
  onSelectRoutine
}) => {
  console.log('🔧 CalendarHeader received onEditEffort:', !!onEditEffort);
  
  return (
    <div className="flex justify-end items-center mb-4 md:mb-6 gap-2 md:gap-3">
      {/* REFINED: Beautiful ghost buttons with perfect proportions */}
      <NewEffortDropdown onSelectType={onSelectType} />
      <RoutinesDropdown onSelectRoutine={onSelectRoutine} />
      <AllEffortsDropdown onSelectWorkout={onSelectWorkout} />
    </div>
  );
};

export default CalendarHeader;