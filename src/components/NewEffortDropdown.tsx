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
        <Button variant="outline" className="flex items-center gap-2" style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
          New Effort
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onSelectType('swim')} style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
          <Waves className="h-4 w-4 mr-2" />
          Swim
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelectType('ride')} style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
          <Bike className="h-4 w-4 mr-2" />
          Cycle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelectType('run')} style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
          <Activity className="h-4 w-4 mr-2" />
          Run
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelectType('strength')} style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
          <Dumbbell className="h-4 w-4 mr-2" />
          Lift
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NewEffortDropdown;