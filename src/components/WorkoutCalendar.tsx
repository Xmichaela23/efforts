import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import CalendarHeader from './CalendarHeader';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DISCIPLINE_COLORS = {
  run: 'bg-red-500',
  ride: 'bg-green-500', 
  swim: 'bg-blue-500',
  strength: 'bg-orange-500'
};

interface WorkoutCalendarProps {
  onAddEffort: () => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
  onViewCompleted: () => void;
  onEditEffort: (workout: any) => void;
  onDateSelect?: (dateString: string) => void;
}

export default function WorkoutCalendar({ 
  onAddEffort, 
  onSelectType, 
  onSelectWorkout, 
  onViewCompleted,
  onEditEffort,
  onDateSelect
}: WorkoutCalendarProps) {
  const { workouts } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

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
    
    if (viewMode === 'week') {
      // Week view: show current week
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Start on Sunday
      
      const days = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        days.push(day.getDate());
      }
      return days;
    } else {
      // Month view: existing logic
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
    }
  };

  const getWorkoutsForDate = (day: number) => {
    if (!day) return [];
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    return workouts.filter(w => w.date === dateStr);
  };

  const handleDateClick = (day: number) => {
    if (!day) return;
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    console.log('📅 Calendar date clicked:', day, 'Date string:', dateStr);
    
    if (onDateSelect) {
      onDateSelect(dateStr);
    } else {
      const dayWorkouts = getWorkoutsForDate(day);
      console.log('📅 Date clicked:', day, 'Workouts found:', dayWorkouts);
      
      if (dayWorkouts.length === 1) {
        console.log('✏️ Opening workout for editing:', dayWorkouts[0]);
        onEditEffort(dayWorkouts[0]);
      } else if (dayWorkouts.length > 1) {
        console.log('📝 Multiple workouts, opening first:', dayWorkouts[0]);
        onEditEffort(dayWorkouts[0]);
      } else {
        console.log('➕ No workouts, creating new one for date');
        onAddEffort();
      }
    }
  };

  const days = getDaysInMonth();

  return (
    <div className="w-full">
      <CalendarHeader 
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddEffort={onAddEffort}
        onSelectType={onSelectType}
        onSelectWorkout={onSelectWorkout}
        onViewCompleted={onViewCompleted}
        onEditEffort={onEditEffort}
      />
      
      <Card className="w-full border border-black" style={{borderRadius: 0}}>
        <CardContent className="p-2 md:p-3">
          {/* DRAMATIC: Much closer arrows and darker styling */}
          <div className="flex items-center justify-center gap-4 mb-2 md:mb-3">
            <Button 
              className="bg-transparent text-gray-700 border-none hover:bg-gray-100 hover:text-black p-1 transition-all duration-150" 
              style={{borderRadius: '4px', minWidth: '24px', minHeight: '24px'}}
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </Button>
            <h3 className="text-sm md:text-base font-medium mx-1" style={{fontFamily: 'Inter, sans-serif'}}>
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <Button 
              className="bg-transparent text-gray-700 border-none hover:bg-gray-100 hover:text-black p-1 transition-all duration-150"
              style={{borderRadius: '4px', minWidth: '24px', minHeight: '24px'}}
              onClick={() => navigateMonth(1)}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </Button>
          </div>
          
          <div className={`grid gap-px md:gap-0.5 ${viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}>
            {viewMode === 'month' && DAYS.map(day => (
              <div key={day} className="p-1 md:p-2 text-center font-medium text-xs text-gray-500" style={{fontFamily: 'Inter, sans-serif'}}>
                {day}
              </div>
            ))}
            {viewMode === 'week' && DAYS.map(day => (
              <div key={day} className="p-1 md:p-2 text-center font-medium text-xs text-gray-500" style={{fontFamily: 'Inter, sans-serif'}}>
                {day}
              </div>
            ))}
            {days.map((day, index) => {
              const dayWorkouts = day ? getWorkoutsForDate(day) : [];
              return (
                <div
                  key={index}
                  className={`${viewMode === 'week' ? 'min-h-[80px] md:min-h-[100px]' : 'min-h-[42px] md:min-h-[56px]'} p-1 md:p-2 border border-black ${
                    day ? 'bg-white hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-all duration-150' : ''
                  }`}
                  style={{borderRadius: 0}}
                  onClick={() => day && handleDateClick(day)}
                >
                  {day && (
                    <>
                      <div className="text-xs font-medium mb-1" style={{fontFamily: 'Inter, sans-serif'}}>{day}</div>
                      
                      {dayWorkouts.length > 0 && (
                        <div className={`flex ${viewMode === 'week' ? 'flex-col space-y-1' : 'justify-center items-center space-x-1'} mt-1`}>
                          {dayWorkouts.slice(0, viewMode === 'week' ? 4 : 3).map((workout, idx) => (
                            <div
                              key={workout.id}
                              className={`${viewMode === 'week' 
                                ? 'w-full h-4 rounded-sm text-xs text-white font-medium flex items-center justify-center' 
                                : 'w-1 h-1 md:w-1.5 md:h-1.5 rounded-full'
                              } ${DISCIPLINE_COLORS[workout.type as keyof typeof DISCIPLINE_COLORS]}`}
                              title={workout.name}
                            >
                              {viewMode === 'week' && (
                                <span className="truncate px-1">
                                  {workout.name || workout.type}
                                </span>
                              )}
                            </div>
                          ))}
                          {dayWorkouts.length > (viewMode === 'week' ? 4 : 3) && (
                            <div className="text-xs text-gray-400 font-medium">
                              +{dayWorkouts.length - (viewMode === 'week' ? 4 : 3)}
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
          
          {/* NEW APPROACH: Simple text-based toggle */}
          <div className="text-center mt-4 md:mt-6">
            <button
              className={`text-sm mx-2 px-2 py-1 transition-colors ${
                viewMode === 'month' 
                  ? 'text-gray-900 font-medium underline' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              onClick={() => setViewMode('month')}
              style={{fontFamily: 'Inter, sans-serif', background: 'none', border: 'none'}}
            >
              Month
            </button>
            <span className="text-gray-300">|</span>
            <button
              className={`text-sm mx-2 px-2 py-1 transition-colors ${
                viewMode === 'week' 
                  ? 'text-gray-900 font-medium underline' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              onClick={() => setViewMode('week')}
              style={{fontFamily: 'Inter, sans-serif', background: 'none', border: 'none'}}
            >
              Week
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}