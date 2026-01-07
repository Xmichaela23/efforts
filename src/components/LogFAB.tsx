import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Plus, Waves, Bike, Activity, Dumbbell, Move, CircleDot, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Movement threshold in pixels - if touch moves more than this, it's a swipe, not a tap
const SWIPE_THRESHOLD = 12;

interface LogFABProps {
  onSelectType: (type: string) => void;
}

const LogFAB: React.FC<LogFABProps> = ({ onSelectType }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Track touch for swipe detection - only open on confirmed taps
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const workoutTypes = [
    { type: 'log-strength', label: 'Log Strength', icon: Dumbbell },
    { type: 'log-run', label: 'Log Run', icon: Activity },
    { type: 'log-ride', label: 'Log Ride', icon: Bike },
    { type: 'log-swim', label: 'Log Swim', icon: Waves },
    { type: 'log-mobility', label: 'Log Mobility', icon: Move },
    { type: 'log-pilates-yoga', label: 'Log Pilates/Yoga', icon: CircleDot },
  ];

  const handleSelect = (type: string) => {
    onSelectType(type);
    setIsOpen(false);
  };

  return (
    <div className="flex-shrink-0">
      <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
        <PopoverPrimitive.Anchor asChild>
          <div
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (touch) {
                touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
              }
            }}
            onTouchEnd={(e) => {
              if (!touchStartRef.current) return;
              
              const touch = e.changedTouches[0];
              if (!touch) {
                touchStartRef.current = null;
                return;
              }
              
              const dx = Math.abs(touch.clientX - touchStartRef.current.x);
              const dy = Math.abs(touch.clientY - touchStartRef.current.y);
              const distance = Math.sqrt(dx * dx + dy * dy);
              const duration = Date.now() - touchStartRef.current.time;
              
              touchStartRef.current = null;
              
              // Only toggle if it was a tap (small movement, reasonable duration)
              if (distance < SWIPE_THRESHOLD && duration < 500) {
                setIsOpen(!isOpen);
              }
              
              e.preventDefault();
            }}
            onTouchCancel={() => {
              touchStartRef.current = null;
            }}
            onClick={(e) => {
              if (touchStartRef.current) {
                e.preventDefault();
                return;
              }
              setIsOpen(!isOpen);
            }}
          >
            <Button
              variant="ghost"
              className="w-10 h-10 rounded-full bg-white/[0.08] backdrop-blur-lg border-2 border-white/35 text-white font-light hover:bg-white/[0.12] hover:border-white/50 transition-all duration-300 flex items-center justify-center flex-shrink-0 shadow-lg hover:shadow-xl p-0"
              style={{
                fontFamily: 'Inter, sans-serif',
                minHeight: '42px',
                minWidth: '42px',
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 4px 12px rgba(0, 0, 0, 0.3)',
                color: 'white',
              }}
            >
              {isOpen ? (
                <X className="h-4 w-4 stroke-[2] stroke-white" style={{ color: 'white' }} />
              ) : (
                <Plus className="h-4 w-4 stroke-[2] stroke-white" style={{ color: 'white' }} />
              )}
            </Button>
          </div>
        </PopoverPrimitive.Anchor>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="top"
            align="end"
            sideOffset={16}
            className={cn(
              "z-50 rounded-2xl border border-white/25 bg-black/80 backdrop-blur-xl p-3 shadow-xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "data-[side=top]:slide-in-from-bottom-2 duration-200"
            )}
            style={{ minWidth: '220px' }}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {workoutTypes.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  onClick={() => handleSelect(item.type)}
                  className="flex items-center w-full hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 last:mb-0"
                  style={{ fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px' }}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.label}
                </button>
              );
            })}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
};

export default LogFAB;
