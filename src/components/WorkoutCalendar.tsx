import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import NewEffortDropdown from './NewEffortDropdown';
import LogEffortDropdown from './LogEffortDropdown';
import RoutinesDropdown from './RoutinesDropdown';
import AllEffortsDropdown from './AllEffortsDropdown';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DISCIPLINE_COLORS = {
  run: 'bg-red-500',
  ride: 'bg-green-500', 
  swim: 'bg-blue-500',
  strength: 'bg-orange-500'
};

interface WorkoutCalendarProps {
  onAddEffort: (type: string, date?: string) => void; // FIXED: Match AppLayout interface
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
  onViewCompleted: () => void;
  onEditEffort: (workout: any) => void;
  onDateSelect?: (dateString: string) => void;
  onSelectRoutine?: (type: string) => void;
}

export default function WorkoutCalendar({ 
  onAddEffort, 
  onSelectType, 
  onSelectWorkout, 
  onViewCompleted,
  onEditEffort,
  onDateSelect,
  onSelectRoutine
}: WorkoutCalendarProps) {
  const { workouts } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());

  const navigateMonth = (direction: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const getWorkoutsForDate = (day: number) => {
    if (!day || !workouts) return [];
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    // DEBUG: Log what workouts exist
    console.log('🔍 All workouts:', workouts);
    console.log('🔍 Looking for date:', dateStr);
    
    const filtered = workouts.filter(w => w && w.date === dateStr) || [];
    console.log('🔍 Found workouts for', dateStr, ':', filtered);
    
    return filtered;
  };

  const handleDateClick = (day: number) => {
    if (!day) return;
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    console.log('📅 Calendar date clicked:', day, 'Date string:', dateStr);
    console.log('📅 Year:', year, 'Month:', month, 'Day:', dayStr);
    console.log('📅 Full date string length:', dateStr.length, 'Content:', JSON.stringify(dateStr));
    
    // FIXED: ONLY select the date - don't automatically open workouts
    if (onDateSelect) {
      onDateSelect(dateStr);
    }
    
    // Don't automatically open workouts for editing
    // Let the user interact with TodaysEffort component to edit workouts
    // Or click "Add effort" to create new ones
  };

  const days = getDaysInMonth();

  return (
    <div className="w-full">
      <div className="w-full flex justify-center items-center mb-2 gap-1 flex-nowrap">
        <NewEffortDropdown onSelectType={onSelectType} />
        <LogEffortDropdown onSelectType={onSelectType} />
        <RoutinesDropdown onSelectRoutine={onSelectRoutine} />
        <AllEffortsDropdown onSelectWorkout={onSelectWorkout} />
      </div>
      
      <div className="w-full bg-white">
        <div className="p-1">
          <div className="flex items-center justify-center gap-6 mb-3">
            <Button 
              className="bg-transparent text-gray-700 border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]" 
              style={{borderRadius: '8px'}}
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </Button>
            <h3 className="text-lg sm:text-xl font-semibold mx-4 min-w-[180px] text-center" style={{fontFamily: 'Inter, sans-serif'}}>
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <Button 
              className="bg-transparent text-gray-700 border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]"
              style={{borderRadius: '8px'}}
              onClick={() => navigateMonth(1)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </Button>
          </div>
          
          <div className="grid gap-0 grid-cols-7 mb-3">
            {DAYS.map(day => (
              <div key={day} className="p-1 text-center font-semibold text-xs text-gray-600" style={{fontFamily: 'Inter, sans-serif'}}>
                {day}
              </div>
            ))}
            {days.map((day, index) => {
              const dayWorkouts = day ? getWorkoutsForDate(day) : [];
              return (
                <div
                  key={index}
                  className="min-h-[60px] p-1 bg-white hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-all duration-200 hover:shadow-md rounded-md"
                  onClick={() => day && handleDateClick(day)}
                >
                  {day && (
                    <>
                      <div className="text-sm font-semibold mb-1 text-gray-900" style={{fontFamily: 'Inter, sans-serif'}}>{day}</div>
                      
                      {dayWorkouts.length > 0 && (
                        <div className="flex justify-center items-center space-x-1 mt-1">
                          {dayWorkouts.slice(0, 4).map((workout, idx) => (
                            <div
                              key={workout.id || idx} // FIXED: Fallback key in case id is missing
                              className={`w-2 h-2 rounded-full shadow-sm ${DISCIPLINE_COLORS[workout.type as keyof typeof DISCIPLINE_COLORS] || 'bg-gray-500'}`}
                              title={workout.name || workout.type}
                            />
                          ))}
                          {dayWorkouts.length > 4 && (
                            <div className="text-xs text-gray-500 font-medium">
                              +{dayWorkouts.length - 4}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}