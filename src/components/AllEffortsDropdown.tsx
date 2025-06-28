import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Activity, Bike, Waves, Dumbbell } from 'lucide-react';

interface AllEffortsDropdownProps {
  onSelectWorkout: (workout: any) => void;
}

const AllEffortsDropdown: React.FC<AllEffortsDropdownProps> = ({ onSelectWorkout }) => {
  const { workouts } = useAppContext();
  
  // Filter for completed workouts only
  const completedWorkouts = workouts.filter(workout => 
    workout.workout_status === 'completed' || workout.completedManually
  );

  const getIcon = (type: string) => {
    switch (type) {
      case 'swim': return <Waves className="h-4 w-4 mr-2" />;
      case 'ride': return <Bike className="h-4 w-4 mr-2" />;
      case 'run': return <Activity className="h-4 w-4 mr-2" />;
      case 'strength': return <Dumbbell className="h-4 w-4 mr-2" />;
      default: return <Activity className="h-4 w-4 mr-2" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex items-center gap-2 bg-transparent text-gray-600 border border-gray-300 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-400 transition-all duration-150"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '14px'
          }}
        >
          Completed efforts ({completedWorkouts.length})
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="max-h-64 overflow-y-auto bg-white border border-gray-200 shadow-lg" 
        style={{borderRadius: '8px', padding: '4px', minWidth: '220px'}}
      >
        {completedWorkouts.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500 text-center">
            No completed efforts yet
          </div>
        ) : (
          completedWorkouts.map((workout) => (
            <DropdownMenuItem
              key={workout.id}
              onClick={() => onSelectWorkout(workout)}
              className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-md flex items-start gap-2"
              style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '8px 12px'}}
            >
              {getIcon(workout.type)}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {workout.name || `${workout.type.charAt(0).toUpperCase() + workout.type.slice(1)}`}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
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