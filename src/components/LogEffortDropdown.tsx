import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Waves, Bike, Activity, Dumbbell, Move, CircleDot } from 'lucide-react';

interface LogEffortDropdownProps {
  onSelectType: (type: string) => void;
}

const LogEffortDropdown: React.FC<LogEffortDropdownProps> = ({ onSelectType }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex-1 flex items-center justify-center bg-white/[0.05] backdrop-blur-lg border text-gray-300 font-light tracking-wide transition-all duration-300 shadow-lg hover:shadow-xl border-white/15 hover:bg-white/[0.08] hover:text-white hover:border-white/20"
          style={{
            fontFamily: 'Inter, sans-serif',
            padding: '12px 16px',
            borderRadius: '1rem',
            fontSize: '15px',
            minHeight: '48px'
          }}
        >
          Log
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side="top"
        sideOffset={16}
        className="bg-white/[0.08] backdrop-blur-lg border border-white/25 shadow-xl mb-2"
        style={{ borderRadius: '1rem', padding: '12px', minWidth: '220px' }}
      >
        <DropdownMenuItem
          onClick={() => onSelectType('log-strength')}
          className="hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
          style={{fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px'}}
        >
          <Dumbbell className="h-5 w-5 mr-3" />
          Log Strength
        </DropdownMenuItem>
        
        <DropdownMenuItem
          onClick={() => onSelectType('log-run')}
          className="hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
          style={{fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px'}}
        >
          <Activity className="h-5 w-5 mr-3" />
          Log Run
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-ride')}
          className="hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
          style={{fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px'}}
        >
          <Bike className="h-5 w-5 mr-3" />
          Log Ride
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-swim')}
          className="hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
          style={{fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px'}}
        >
          <Waves className="h-5 w-5 mr-3" />
          Log Swim
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-mobility')}
          className="hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
          style={{fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px'}}
        >
          <Move className="h-5 w-5 mr-3" />
          Log Mobility
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectType('log-pilates-yoga')}
          className="hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
          style={{fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px'}}
        >
          <CircleDot className="h-5 w-5 mr-3" />
          Log Pilates/Yoga
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LogEffortDropdown;