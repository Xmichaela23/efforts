import React from 'react';
import TodaysEffort from './TodaysEffort';
import NewEffortDropdown from './NewEffortDropdown';
import AllEffortsDropdown from './AllEffortsDropdown';
import { Button } from '@/components/ui/button';

interface CalendarHeaderProps {
  viewMode: 'month' | 'week';
  onViewModeChange: (mode: 'month' | 'week') => void;
  onAddEffort: () => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  viewMode,
  onViewModeChange,
  onAddEffort,
  onSelectType,
  onSelectWorkout
}) => {
  return (
    <div className="flex justify-between items-center mb-6">
      <div className="flex gap-4 flex-1">
        <TodaysEffort onAddEffort={onAddEffort} />
        <NewEffortDropdown onSelectType={onSelectType} />
        <AllEffortsDropdown onSelectWorkout={onSelectWorkout} />
      </div>
      
      <div className="flex gap-1 w-[15%] ml-auto">
        <Button
          variant={viewMode === 'month' ? 'default' : 'outline'}
          onClick={() => onViewModeChange('month')}
          className="flex-1 text-xs px-1 py-1 h-6 bg-black text-white hover:bg-gray-800"
          style={{fontFamily: 'Helvetica, Arial, sans-serif'}}
        >
          Month
        </Button>
        <Button
          variant={viewMode === 'week' ? 'default' : 'outline'}
          onClick={() => onViewModeChange('week')}
          className="flex-1 text-xs px-1 py-1 h-6 bg-black text-white hover:bg-gray-800"
          style={{fontFamily: 'Helvetica, Arial, sans-serif'}}
        >
          Week
        </Button>
      </div>
    </div>
  );
};

export default CalendarHeader;