import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Waves, Bike, Activity, Dumbbell, Move } from 'lucide-react';

interface NewEffortDropdownProps {
  onSelectType: (type: string) => void;
}

const NewEffortDropdown: React.FC<NewEffortDropdownProps> = ({ onSelectType }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex items-center gap-2 text-black hover:text-gray-600 transition-colors"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            padding: '14px 16px',
            fontSize: '15px',
            minHeight: '48px',
            flex: 1,
            maxWidth: '90px',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none'
          }}
        >
          Build
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="bg-white border border-gray-200 shadow-xl"
        style={{borderRadius: '12px', padding: '8px', minWidth: '160px'}}
      >
        <DropdownMenuItem
          onClick={() => onSelectType('run')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Activity className="h-5 w-5 mr-3" />
          Run
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('ride')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Bike className="h-5 w-5 mr-3" />
          Ride
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('swim')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Waves className="h-5 w-5 mr-3" />
          Swim
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('strength')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Dumbbell className="h-5 w-5 mr-3" />
          Strength
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('mobility')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Move className="h-5 w-5 mr-3" />
          Mobility
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NewEffortDropdown;