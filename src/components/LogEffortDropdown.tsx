import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronUp, Waves, Bike, Activity, Dumbbell, Move, CircleDot } from 'lucide-react';

interface LogEffortDropdownProps {
  onSelectType: (type: string) => void;
}

const LogEffortDropdown: React.FC<LogEffortDropdownProps> = ({ onSelectType }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex items-center gap-2 bg-white/[0.05] backdrop-blur-lg border border-white/15 text-gray-300 font-light tracking-wide hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-xl"
          style={{
            fontFamily: 'Inter, sans-serif',
            padding: '14px 16px',
            borderRadius: '1rem',
            fontSize: '15px',
            minHeight: '48px',
            flex: 1,
            maxWidth: '90px'
          }}
        >
          Log
          <ChevronUp className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={10}
        className="bg-white border border-gray-200 shadow-xl"
        style={{borderRadius: '12px', padding: '8px', minWidth: '180px'}}
      >
        <DropdownMenuItem
          onClick={() => onSelectType('log-strength')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Dumbbell className="h-5 w-5 mr-3" />
          Log Strength
        </DropdownMenuItem>
        
        <DropdownMenuItem
          onClick={() => onSelectType('log-run')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Activity className="h-5 w-5 mr-3" />
          Log Run
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-ride')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Bike className="h-5 w-5 mr-3" />
          Log Ride
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-swim')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Waves className="h-5 w-5 mr-3" />
          Log Swim
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-mobility')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <Move className="h-5 w-5 mr-3" />
          Log Mobility
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-pilates-yoga')}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <CircleDot className="h-5 w-5 mr-3" />
          Log Pilates/Yoga
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LogEffortDropdown;