import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Waves, Bike, Activity, Dumbbell } from 'lucide-react';

interface RoutinesDropdownProps {
  onSelectRoutine?: (type: string) => void;
}

const RoutinesDropdown: React.FC<RoutinesDropdownProps> = ({ onSelectRoutine }) => {
  const routineTypes = [
    { type: 'swim', label: 'Swim', icon: Waves },
    { type: 'ride', label: 'Ride', icon: Bike },
    { type: 'run', label: 'Run', icon: Activity },
    { type: 'strength', label: 'Strength', icon: Dumbbell }
  ];

  const handleSelect = (type: string) => {
    // Placeholder - doesn't do anything yet as requested
    console.log('Routine selected:', type);
    if (onSelectRoutine) {
      onSelectRoutine(type);
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
          Routines
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="bg-white border border-gray-200 shadow-lg"
        style={{borderRadius: '8px', padding: '4px'}}
      >
        {routineTypes.map((routine) => {
          const IconComponent = routine.icon;
          return (
            <DropdownMenuItem
              key={routine.type}
              onClick={() => handleSelect(routine.type)}
              className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-md"
              style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '8px 12px'}}
            >
              <IconComponent className="h-4 w-4 mr-2" />
              <span>{routine.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RoutinesDropdown;