import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  name: string;
  currentWeek?: number;
  status: 'active' | 'completed' | 'paused';
}

interface PlansMenuProps {
  currentPlans?: Plan[];
  completedPlans?: Plan[];
  onSelectPlan?: (planId: string) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}

// Movement threshold in pixels - if touch moves more than this, it's a swipe, not a tap
const SWIPE_THRESHOLD = 12;

const PlansMenu: React.FC<PlansMenuProps> = ({
  currentPlans = [],
  completedPlans = [],
  onSelectPlan,
  isOpen,
  onOpenChange,
  trigger,
}) => {
  const navigate = useNavigate();
  
  // Track touch for swipe detection - only open on confirmed taps
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handlePlanSelect = (planId: string) => {
    navigate('.', { state: { openPlans: true, focusPlanId: planId } });
    onOpenChange(false);
  };

  const handleItemClick = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
      {/* Anchor for positioning - wraps the trigger button */}
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
              onOpenChange(!isOpen);
            }
            // If movement exceeded threshold, this was a swipe - do nothing
            
            e.preventDefault();
          }}
          onTouchCancel={() => {
            touchStartRef.current = null;
          }}
          onClick={(e) => {
            // For mouse clicks on desktop, toggle the menu
            // Check if this came from a touch event by looking at recent touch
            if (touchStartRef.current) {
              // Touch already handled it
              e.preventDefault();
              return;
            }
            onOpenChange(!isOpen);
          }}
          style={{ display: 'contents' }}
        >
          {trigger}
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="center"
          sideOffset={16}
          className={cn(
            "z-50 rounded-2xl border border-white/25 bg-black/80 backdrop-blur-xl p-3 shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=top]:slide-in-from-bottom-2 duration-200"
          )}
          style={{ minWidth: '280px', maxWidth: '340px' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Plan generation wizard - top priority */}
          <button
            onClick={() => handleItemClick(() => navigate('/plans/generate'))}
            className="flex flex-col items-start w-full hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 text-left"
            style={{ fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '52px' }}
          >
            <span>Build a training plan</span>
            <span className="text-xs text-gray-300 font-light mt-0.5">Guided wizard with personalized periodization</span>
          </button>

          {/* Routine builder */}
          <button
            onClick={() => handleItemClick(() => navigate('/plans/build'))}
            className="flex flex-col items-start w-full hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 text-left"
            style={{ fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '52px' }}
          >
            <span>Build a routine</span>
            <span className="text-xs text-gray-300 font-light mt-0.5">Create workout routines using simple language</span>
          </button>

          {/* Select from catalog */}
          <button
            onClick={() => handleItemClick(() => navigate('/plans/catalog'))}
            className="flex items-center justify-between w-full hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1"
            style={{ fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px' }}
          >
            <span>Select a plan (catalog)</span>
          </button>

          {/* Current Plans */}
          {currentPlans.length > 0 && (
            <>
              <div className="my-2 h-px bg-white/10" />
              {currentPlans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => handlePlanSelect(plan.id)}
                  className="flex flex-col items-start w-full hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1 text-left"
                  style={{ fontFamily: 'Inter, sans-serif', padding: '10px 12px', minHeight: '56px', maxWidth: '320px' }}
                >
                  <span className="text-xs text-gray-300 mb-0.5">Current plan</span>
                  <span className="font-light tracking-normal leading-snug whitespace-normal break-words" style={{ overflow: 'hidden', maxWidth: '300px' }}>
                    {plan.name}
                  </span>
                  <span className="text-xs text-gray-300 mt-0.5">
                    Week {plan.currentWeek || 1}
                    {plan.status === 'paused' && <span className="ml-2 text-orange-400 font-light">(Paused)</span>}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* Completed Plans - at the bottom */}
          {completedPlans.length > 0 && (
            <>
              <div className="my-2 h-px bg-white/10" />
              <button
                onClick={() => handleItemClick(() => navigate('.', { state: { openPlans: true, showCompleted: true } }))}
                className="flex items-center justify-between w-full hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer"
                style={{ fontFamily: 'Inter, sans-serif', padding: '12px 16px', minHeight: '44px' }}
              >
                <span>Completed Plans</span>
                <ArrowRight className="h-4 w-4 text-gray-300" />
              </button>
            </>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

export default PlansMenu;
