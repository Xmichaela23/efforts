import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ChevronDown, ArrowRight, Activity, Bike, Dumbbell, Waves, Move } from 'lucide-react';

interface ActivePlan {
  id: string;
  name: string;
  currentWeek: number;
  type: 'running' | 'cycling' | 'swimming' | 'strength' | 'triathlon';
}

interface PlansDropdownProps {
  onSelectRoutine?: (planId: string) => void;
  onSelectDiscipline?: (discipline: string) => void;
}

const PlansDropdown: React.FC<PlansDropdownProps> = ({ 
  onSelectRoutine,
  onSelectDiscipline
}) => {
  // Mock active plans data - replace with real data later
  const mockActivePlans: ActivePlan[] = [
    {
      id: '1',
      name: 'Marathon Training',
      currentWeek: 8,
      type: 'running'
    },
    {
      id: '2', 
      name: 'Strength Foundation',
      currentWeek: 3,
      type: 'strength'
    }
  ];

  const disciplines = [
    { id: 'run', name: 'Run', icon: Activity },
    { id: 'ride', name: 'Ride', icon: Bike },
    { id: 'strength', name: 'Strength', icon: Dumbbell },
    { id: 'swim', name: 'Swim', icon: Waves },
    { id: 'mobility', name: 'Mobility', icon: Move }
  ];

  const handlePlanSelect = (e: React.MouseEvent, planId: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Selected plan:', planId);
    if (onSelectRoutine) {
      onSelectRoutine(planId);
    }
  };

  const handleDisciplineSelect = (e: React.MouseEvent, disciplineId: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Selected discipline:', disciplineId);
    if (onSelectDiscipline) {
      onSelectDiscipline(disciplineId);
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
        {/* Current Plans */}
        {mockActivePlans.map((plan) => (
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
        
        {mockActivePlans.length > 0 && <DropdownMenuSeparator />}
        
        {/* Discipline Quick Access */}
        {disciplines.map((discipline) => {
          const IconComponent = discipline.icon;
          return (
            <DropdownMenuItem
              key={discipline.id}
              onClick={(e) => handleDisciplineSelect(e, discipline.id)}
              className="flex items-center hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg cursor-pointer"
              style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '12px 16px', minHeight: '44px'}}
            >
              <IconComponent className="h-5 w-5 mr-3" />
              <span className="font-medium">{discipline.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PlansDropdown;