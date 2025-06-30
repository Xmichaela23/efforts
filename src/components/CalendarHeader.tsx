import React from 'react';
import NewEffortDropdown from './NewEffortDropdown';
import LogEffortDropdown from './LogEffortDropdown';
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
    <div className="w-full flex justify-start items-center mb-6 md:mb-8 gap-1 flex-nowrap -ml-4">
      {/* 🚨 MORE LEFT: Bigger negative margin to shift further left */}
      <NewEffortDropdown onSelectType={onSelectType} />
      <LogEffortDropdown onSelectType={onSelectType} />
      <RoutinesDropdown onSelectRoutine={onSelectRoutine} />
      <AllEffortsDropdown onSelectWorkout={onSelectWorkout} />
    </div>
  );
};

export default CalendarHeader;