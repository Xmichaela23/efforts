import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Activity, Bike, Waves, Dumbbell, Move } from 'lucide-react';

interface AllEffortsDropdownProps {
  onSelectWorkout: (workout: any) => void;
}

const AllEffortsDropdown: React.FC<AllEffortsDropdownProps> = ({ onSelectWorkout }) => {
  const { workouts } = useAppContext();

  const completedWorkouts = workouts.filter(workout =>
    workout.workout_status === 'completed' || workout.completedManually
  );

  const getIcon = (type: string) => {
    switch (type) {
      case 'swim': return <Waves className="h-5 w-5 mr-3" />;
      case 'ride': return <Bike className="h-5 w-5 mr-3" />;
      case 'run': return <Activity className="h-5 w-5 mr-3" />;
      case 'strength': return <Dumbbell className="h-5 w-5 mr-3" />;
      case 'mobility': return <Move className="h-5 w-5 mr-3" />;
      default: return <Activity className="h-5 w-5 mr-3" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400 transition-all duration-200 shadow-sm hover:shadow-md"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            padding: '14px 12px',
            borderRadius: '8px',
            fontSize: '15px',
            minHeight: '48px',
            flex: 1,
            maxWidth: '140px'
          }}
        >
          Completed ({completedWorkouts.length})
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 overflow-y-auto bg-white border border-gray-200 shadow-xl"
        style={{borderRadius: '12px', padding: '8px', minWidth: '280px'}}
      >
        {completedWorkouts.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500 text-center">
            No completed efforts yet
          </div>
        ) : (
          completedWorkouts.map((workout) => (
            <DropdownMenuItem
              key={workout.id}
              onClick={() => onSelectWorkout(workout)}
              className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg flex items-start gap-3 cursor-pointer"
              style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '56px'}}
            >
              {getIcon(workout.type)}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate text-gray-900">
                  {workout.name || `${workout.type.charAt(0).toUpperCase() + workout.type.slice(1)}`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {workout.date ? new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  }) : 'No date'}
                  {workout.duration && ` • ${Math.floor(workout.duration / 60)}:${(workout.duration % 60).toString().padStart(2, '0')}`}
                </div>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AllEffortsDropdown;