import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Waves, Bike, Activity, Dumbbell, Move, CircleDot, X } from 'lucide-react';

interface LogFABProps {
  onSelectType: (type: string) => void;
}

const LogFAB: React.FC<LogFABProps> = ({ onSelectType }) => {
  const [isOpen, setIsOpen] = useState(false);

  const workoutTypes = [
    { type: 'log-strength', label: 'Log Strength', icon: Dumbbell },
    { type: 'log-run', label: 'Log Run', icon: Activity },
    { type: 'log-ride', label: 'Log Ride', icon: Bike },
    { type: 'log-swim', label: 'Log Swim', icon: Waves },
    { type: 'log-mobility', label: 'Log Mobility', icon: Move },
    { type: 'log-pilates-yoga', label: 'Log Pilates/Yoga', icon: CircleDot },
  ];

  return (
    <div className="flex-shrink-0">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-12 h-12 rounded-full bg-white/[0.08] backdrop-blur-lg border-2 border-white/35 text-white font-light hover:bg-white/[0.12] hover:border-white/50 transition-all duration-300 flex items-center justify-center flex-shrink-0 shadow-lg hover:shadow-xl p-0"
            style={{
              fontFamily: 'Inter, sans-serif',
              minHeight: '48px',
              boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 4px 12px rgba(0, 0, 0, 0.3)',
              color: 'white',
            }}
          >
            {isOpen ? (
              <X className="h-5 w-5 stroke-[2] stroke-white" style={{ color: 'white' }} />
            ) : (
              <Plus className="h-5 w-5 stroke-[2] stroke-white" style={{ color: 'white' }} />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          sideOffset={16}
          className="bg-white/[0.08] backdrop-blur-lg border border-white/25 shadow-xl mb-2"
          style={{ borderRadius: '1rem', padding: '12px', minWidth: '220px' }}
        >
          {workoutTypes.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem
                key={item.type}
                onClick={() => {
                  onSelectType(item.type);
                  setIsOpen(false);
                }}
                className="hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  padding: '12px 16px',
                  minHeight: '44px'
                }}
              >
                <Icon className="h-5 w-5 mr-3" />
                {item.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default LogFAB;

