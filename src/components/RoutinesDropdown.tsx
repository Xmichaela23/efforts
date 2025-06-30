import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Waves, Bike, Activity, Dumbbell, Move } from 'lucide-react';

interface RoutinesDropdownProps {
  onSelectRoutine?: (type: string) => void;
}

const RoutinesDropdown: React.FC<RoutinesDropdownProps> = ({ onSelectRoutine }) => {
  const routineTypes = [
    { type: 'run', label: 'Run', icon: Activity },
    { type: 'ride', label: 'Ride', icon: Bike },
    { type: 'swim', label: 'Swim', icon: Waves },
    { type: 'strength', label: 'Strength', icon: Dumbbell },
    { type: 'mobility', label: 'Mobility', icon: Move }
  ];

  const handleSelect = (type: string) => {
    console.log('Routine selected:', type);
    if (onSelectRoutine) {
      onSelectRoutine(type);
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
            maxWidth: '110px'
          }}
        >
          Routines
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="bg-white border border-gray-200 shadow-xl"
        style={{borderRadius: '12px', padding: '8px', minWidth: '160px'}}
      >
        {routineTypes.map((routine) => {
          const IconComponent = routine.icon;
          return (
            <DropdownMenuItem
              key={routine.type}
              onClick={() => handleSelect(routine.type)}
              className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
              style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
            >
              <IconComponent className="h-5 w-5 mr-3" />
              <span>{routine.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RoutinesDropdown;