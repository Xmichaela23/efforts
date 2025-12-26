import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowRight } from 'lucide-react';

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

const PlansMenu: React.FC<PlansMenuProps> = ({
  currentPlans = [],
  completedPlans = [],
  onSelectPlan,
  isOpen,
  onOpenChange,
  trigger,
}) => {
  const navigate = useNavigate();

  const handlePlanSelect = (e: React.MouseEvent, planId: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigate('.', { state: { openPlans: true, focusPlanId: planId } });
    onOpenChange(false);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side="top"
        sideOffset={16}
        className="bg-white/[0.08] backdrop-blur-lg border border-white/25 shadow-xl mb-2"
        style={{ borderRadius: '1rem', padding: '12px', minWidth: '280px', maxWidth: '340px' }}
      >
        {/* Plan generation wizard - top priority */}
        <DropdownMenuItem
          onClick={() => { 
            navigate('/plans/generate');
            onOpenChange(false);
          }}
          className="flex flex-col items-start hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1"
          style={{
            fontFamily: 'Inter, sans-serif',
            padding: '12px 16px',
            minHeight: '52px'
          }}
        >
          <span>Build a training plan</span>
          <span className="text-xs text-gray-300 font-light mt-0.5">Guided wizard with personalized periodization</span>
        </DropdownMenuItem>

        {/* Routine builder */}
        <DropdownMenuItem
          onClick={() => { 
            navigate('/plans/build');
            onOpenChange(false);
          }}
          className="flex flex-col items-start hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1"
          style={{
            fontFamily: 'Inter, sans-serif',
            padding: '12px 16px',
            minHeight: '52px'
          }}
        >
          <span>Build a routine</span>
          <span className="text-xs text-gray-300 font-light mt-0.5">Create workout routines using simple language</span>
        </DropdownMenuItem>

        {/* Select from catalog */}
        <DropdownMenuItem
          onClick={() => { 
            navigate('/plans/catalog');
            onOpenChange(false);
          }}
          className="flex items-center justify-between hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1"
          style={{
            fontFamily: 'Inter, sans-serif',
            padding: '12px 16px',
            minHeight: '44px'
          }}
        >
          <span>Select a plan (catalog)</span>
        </DropdownMenuItem>

        {/* Current Plans */}
        {currentPlans.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-2 bg-white/10" />
            {currentPlans.map((plan) => (
              <DropdownMenuItem
                key={plan.id}
                onClick={(e) => handlePlanSelect(e, plan.id)}
                className="flex flex-col items-start hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer mb-1"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  padding: '10px 12px',
                  minHeight: '56px',
                  maxWidth: '320px'
                }}
              >
                <span className="text-xs text-gray-300 mb-0.5">Current plan</span>
                <span className="font-light tracking-normal leading-snug whitespace-normal break-words" style={{ overflow: 'hidden', maxWidth: '300px' }}>
                  {plan.name}
                </span>
                <span className="text-xs text-gray-300 mt-0.5">
                  Week {plan.currentWeek || 1}
                  {plan.status === 'paused' && <span className="ml-2 text-orange-400 font-light">(Paused)</span>}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* Completed Plans - at the bottom */}
        {completedPlans.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-2 bg-white/10" />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate('.', { state: { openPlans: true, showCompleted: true } });
                onOpenChange(false);
              }}
              className="flex items-center justify-between hover:bg-white/[0.12] text-white font-light tracking-wide transition-colors duration-150 rounded-lg cursor-pointer"
              style={{
                fontFamily: 'Inter, sans-serif',
                padding: '12px 16px',
                minHeight: '44px'
              }}
            >
              <span>Completed Plans</span>
              <ArrowRight className="h-4 w-4 text-gray-300" />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PlansMenu;

