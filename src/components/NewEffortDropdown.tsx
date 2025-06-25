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
          className="flex items-center gap-2 bg-black text-white border-none hover:bg-black" 
          style={{
            fontFamily: 'Inter, sans-serif', 
            fontWeight: 500,
            padding: '12px 24px',
            borderRadius: 0
          }}
        >
          New Effort
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="bg-white border border-black" style={{borderRadius: 0}}>
        <DropdownMenuItem 
          onClick={() => onSelectType('swim')} 
          className="hover:bg-black hover:text-white"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500}}
        >
          <Waves className="h-4 w-4 mr-2" />
          Swim
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => onSelectType('ride')} 
          className="hover:bg-black hover:text-white"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500}}
        >
          <Bike className="h-4 w-4 mr-2" />
          Ride
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => onSelectType('run')} 
          className="hover:bg-black hover:text-white"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500}}
        >
          <Activity className="h-4 w-4 mr-2" />
          Run
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => onSelectType('strength')} 
          className="hover:bg-black hover:text-white"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500}}
        >
          <Dumbbell className="h-4 w-4 mr-2" />
          Strength
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NewEffortDropdown;