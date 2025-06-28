import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Waves, Bike, Activity, Dumbbell } from 'lucide-react';

interface NewEffortDropdownProps {
  onSelectType: (type: string) => void;
}

const NewEffortDropdown: React.FC<NewEffortDropdownProps> = ({ onSelectType }) => {
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
          New effort
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="bg-white border border-gray-200 shadow-lg" 
        style={{borderRadius: '8px', padding: '4px'}}
      >
        <DropdownMenuItem
          onClick={() => onSelectType('swim')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-md"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '8px 12px'}}
        >
          <Waves className="h-4 w-4 mr-2" />
          Swim
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('ride')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-md"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '8px 12px'}}
        >
          <Bike className="h-4 w-4 mr-2" />
          Ride
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('run')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-md"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '8px 12px'}}
        >
          <Activity className="h-4 w-4 mr-2" />
          Run
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('strength')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-md"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '8px 12px'}}
        >
          <Dumbbell className="h-4 w-4 mr-2" />
          Strength
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NewEffortDropdown;