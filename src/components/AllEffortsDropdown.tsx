import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Activity, Bike, Waves, Dumbbell, Move, TrendingUp, Target, Zap } from 'lucide-react';

interface AllEffortsDropdownProps {
onSelectWorkout: (workout: any) => void;
}

const AllEffortsDropdown: React.FC<AllEffortsDropdownProps> = ({ onSelectWorkout }) => {
const { workouts } = useAppContext();

const completedWorkouts = useMemo(() =>
workouts.filter((workout: any) =>
workout.workout_status === 'completed' || workout.completedManually
), [workouts]);

// Mock analytics data for preview
const mockAnalytics = {
  recoveryStatus: 'Ready',
  fitnessLevel: '72',
  fatigueLevel: '68',
  readiness: '+4',
  trainingStrain: '156',
  personalBests: '3'
};

const getIcon = (type: string) => {
switch (type) {
case 'swim': return <Waves className="h-4 w-4 text-gray-500" />;
case 'ride': return <Bike className="h-4 w-4 text-gray-500" />;
case 'run': return <Activity className="h-4 w-4 text-gray-500" />;
case 'strength': return <Dumbbell className="h-4 w-4 text-gray-500" />;
case 'mobility': return <Move className="h-4 w-4 text-gray-500" />;
default: return <Activity className="h-4 w-4 text-gray-500" />;
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
maxWidth: '140px'
}}
>
Insight
<ChevronDown className="h-4 w-4" />
</Button>
</DropdownMenuTrigger>
<DropdownMenuContent
align="start"
className="max-h-80 overflow-y-auto bg-white border border-gray-200 shadow-xl"
style={{borderRadius: '12px', padding: '8px', minWidth: '320px'}}
>
{/* Analytics Preview Section */}
<div className="px-4 py-3 border-b border-gray-100">
  <div className="flex items-center gap-2 mb-3">
    <TrendingUp className="h-4 w-4 text-gray-600" />
    <span className="font-medium text-sm text-gray-900">Insight</span>
  </div>
  
  <div className="space-y-2 text-sm">
    <div className="flex justify-between">
      <span className="text-gray-600">Recovery Status</span>
      <span className="font-medium text-gray-900">{mockAnalytics.recoveryStatus}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Fitness Level</span>
      <span className="font-medium text-gray-900">{mockAnalytics.fitnessLevel}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Fatigue Level</span>
      <span className="font-medium text-gray-900">{mockAnalytics.fatigueLevel}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Readiness</span>
      <span className="font-medium text-gray-900">{mockAnalytics.readiness}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Training Strain</span>
      <span className="font-medium text-gray-900">{mockAnalytics.trainingStrain}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Personal Bests</span>
      <span className="font-medium text-gray-900">{mockAnalytics.personalBests}</span>
    </div>
  </div>
</div>

{/* Quick Actions */}
<div className="px-4 py-3 border-b border-gray-100">
  <div className="flex items-center gap-2 mb-3">
    <Target className="h-4 w-4 text-gray-600" />
    <span className="font-medium text-sm text-gray-900">Quick Actions</span>
  </div>
  <div className="space-y-2">
    <button className="w-full text-left text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50 py-2 px-2 rounded transition-colors">
      View Trends
    </button>
    <button className="w-full text-left text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50 py-2 px-2 rounded transition-colors">
      Recovery Check
    </button>
  </div>
</div>

{/* Recent Efforts */}
<div className="px-4 py-3">
  <div className="flex items-center gap-2 mb-3">
    <Zap className="h-4 w-4 text-gray-600" />
    <span className="font-medium text-sm text-gray-900">Recent Efforts</span>
  </div>
  
  {completedWorkouts.length === 0 ? (
    <div className="text-sm text-gray-500 text-center py-4">
      No completed efforts yet
    </div>
  ) : (
    <div className="space-y-2 max-h-32 overflow-y-auto">
      {completedWorkouts.slice(0, 3).map((workout) => (
        <div
          key={workout.id}
          onClick={() => onSelectWorkout(workout)}
          className="hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors duration-150 rounded-lg flex items-start gap-3 cursor-pointer p-2"
        >
          {getIcon(workout.type)}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate text-gray-900">
              {workout.name || `${workout.type.charAt(0).toUpperCase() + workout.type.slice(1)}`}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {workout.date ? new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              }) : 'No date'}
              {workout.duration && ` • ${Math.floor(workout.duration / 60)}:${(workout.duration % 60).toString().padStart(2, '0')}`}
            </div>
          </div>
        </div>
      ))}
      {completedWorkouts.length > 3 && (
        <div className="text-xs text-blue-600 text-center py-2 hover:bg-gray-50 rounded-lg cursor-pointer">
          View all {completedWorkouts.length} efforts
        </div>
      )}
    </div>
  )}
</div>
</DropdownMenuContent>
</DropdownMenu>
);
};

export default AllEffortsDropdown;