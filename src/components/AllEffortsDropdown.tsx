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
        <Button
          className="flex items-center gap-2 bg-white text-black border border-black hover:bg-black hover:text-white"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            padding: '12px 24px',
            borderRadius: 0
          }}
        >
          All efforts ({workouts.length})
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto bg-white border border-black" style={{borderRadius: 0}}>
        {workouts.map((workout) => (
          <DropdownMenuItem
            key={workout.id}
            onClick={() => onSelectWorkout(workout)}
            className="hover:bg-black hover:text-white"
            style={{fontFamily: 'Inter, sans-serif', fontWeight: 500}}
          >
            {getIcon(workout.type)}
            <div>
              <div className="font-normal">
                {workout.type.charAt(0).toUpperCase() + workout.type.slice(1)}
              </div>
              <div className="text-sm text-[#666666]">
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