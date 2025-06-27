import React from 'react';
import TodaysEffort from './TodaysEffort';
import NewEffortDropdown from './NewEffortDropdown';
import AllEffortsDropdown from './AllEffortsDropdown';

interface CalendarHeaderProps {
  viewMode: 'month' | 'week';
  onViewModeChange: (mode: 'month' | 'week') => void;
  onAddEffort: () => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
  onViewCompleted: () => void;
  onEditEffort: (workout: any) => void;
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  viewMode,
  onViewModeChange,
  onAddEffort,
  onSelectType,
  onSelectWorkout,
  onViewCompleted,
  onEditEffort
}) => {
  return (
    <div className="flex justify-between items-start mb-6 gap-6">
      <div className="flex-1">
        <TodaysEffort 
          onAddEffort={onAddEffort} 
          onViewCompleted={onViewCompleted}
          onEditEffort={onEditEffort}
        />
      </div>
      <div className="flex gap-4">
        <NewEffortDropdown onSelectType={onSelectType} />
        <AllEffortsDropdown onSelectWorkout={onSelectWorkout} />
      </div>
    </div>
  );
};

export default CalendarHeader;