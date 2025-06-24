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
        <Button variant="outline" className="flex items-center gap-2" style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
          All Efforts ({workouts.length})
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {workouts.map((workout) => (
          <DropdownMenuItem 
            key={workout.id} 
            onClick={() => onSelectWorkout(workout)}
            style={{fontFamily: 'Helvetica, Arial, sans-serif'}}
          >
            {getIcon(workout.type)}
            <div>
              <div className="font-normal">
                {workout.type.charAt(0).toUpperCase() + workout.type.slice(1)}
              </div>
              <div className="text-sm text-gray-500">
                {workout.date ? new Date(workout.date).toLocaleDateString() : 'No date'}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AllEffortsDropdown;