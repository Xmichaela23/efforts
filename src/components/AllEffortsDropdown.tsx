import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Activity, Bike, Waves, Dumbbell, Move, Target, Zap } from 'lucide-react';

interface AllEffortsDropdownProps {
onSelectWorkout: (workout: any) => void;
}

const AllEffortsDropdown: React.FC<AllEffortsDropdownProps> = ({ onSelectWorkout }) => {
const { workouts } = useAppContext();

const completedWorkouts = useMemo(() =>
workouts.filter((workout: any) =>
workout.workout_status === 'completed' || workout.completedManually
), [workouts]);


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
className="flex items-center gap-2 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-0 focus:border-0 active:outline-none active:ring-0 active:border-0"
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
              {workout.date ? new Date(workout.date + 'T12:00:00').toLocaleDateString('en-US', {
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