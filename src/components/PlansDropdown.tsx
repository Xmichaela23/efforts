import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ChevronDown, ArrowRight, Calendar } from 'lucide-react';
// Planned workouts count removed from this menu to keep it focused on plans

interface Plan {
  id: string;
  name: string;
  currentWeek?: number;
  status: 'active' | 'completed';
  description?: string;
}

interface PlansDropdownProps {
  onSelectRoutine?: (planId: string) => void;
  currentPlans?: Plan[];
  completedPlans?: Plan[];
  onOpenPlanBuilder?: () => void;
}

const PlansDropdown: React.FC<PlansDropdownProps> = ({
  onSelectRoutine,
  currentPlans = [],
  completedPlans = [],
  onOpenPlanBuilder,
}) => {
  // Removed plannedWorkouts surfacing here; keep dropdown focused on plan navigation
  const navigate = useNavigate();
  
  const handlePlanSelect = (e: React.MouseEvent, planId: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Selected plan:', planId);
    if (onSelectRoutine) {
      onSelectRoutine(planId);
    }
  };

  const handleAllPlans = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Opening All Plans interface');
    if (onSelectRoutine) {
      onSelectRoutine('all-plans');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400 transition-all duration-200 shadow-sm hover:shadow-md"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            padding: '14px 12px',
            borderRadius: '8px',
            fontSize: '15px',
            minHeight: '48px',
            flex: 1,
            maxWidth: '110px'
          }}
        >
          Plans
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="bg-white border border-gray-200 shadow-xl"
        style={{borderRadius: '12px', padding: '8px', minWidth: '200px'}}
      >
        {/* Removed the Planned Workouts item to avoid duplication below the plan */}

        {/* Current Plans */}
        {currentPlans.length > 0 && (
          <>
            {currentPlans.map((plan) => (
              <DropdownMenuItem
                key={plan.id}
                onClick={(e) => handlePlanSelect(e, plan.id)}
                className="flex flex-col items-start hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
                style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '50px'}}
              >
                <span className="text-xs text-gray-500 mb-1">Current:</span>
                <span className="font-medium">{plan.name} - Wk {plan.currentWeek}</span>
              </DropdownMenuItem>
            ))}
            
            {completedPlans.length > 0 && (
              <DropdownMenuSeparator className="my-2" />
            )}
          </>
        )}

        {/* Completed Plans */}
        {completedPlans.length > 0 && (
          <>
            {completedPlans.slice(0, 3).map((plan) => (
              <DropdownMenuItem
                key={plan.id}
                onClick={(e) => handlePlanSelect(e, plan.id)}
                className="flex flex-col items-start hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
                style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '50px'}}
              >
                <span className="text-xs text-gray-500 mb-1">Completed:</span>
                <span className="font-medium">{plan.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* Admin: publish template (JSON) */}
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem
          onClick={() => { navigate('/plans/admin'); }}
          className="flex items-center justify-between hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <span>Admin – Add template (JSON)</span>
        </DropdownMenuItem>

        {/* User: select a plan from catalog */}
        <DropdownMenuItem
          onClick={() => { navigate('/plans/catalog'); }}
          className="flex items-center justify-between hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <span>Select a plan (catalog)</span>
        </DropdownMenuItem>

        {/* Show All Plans if there are any plans or as fallback */}
        {(currentPlans.length > 0 || completedPlans.length > 0) && (
          <DropdownMenuSeparator className="my-2" />
        )}
        
        <DropdownMenuItem
          onClick={handleAllPlans}
          className="flex items-center justify-between hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
          style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
        >
          <span>{currentPlans.length === 0 && completedPlans.length === 0 ? 'Current Plans' : 'View Current Plans'}</span>
          <ArrowRight className="h-4 w-4" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PlansDropdown;