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
  onEditEffort: (workout: any) => void; // FIXED: Added missing prop
}

export default function WorkoutCalendar({ 
  onAddEffort, 
  onSelectType, 
  onSelectWorkout, 
  onViewCompleted,
  onEditEffort // FIXED: Accept the prop
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
    if (!day) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return workouts.filter(w => w.date === dateStr);
  };

  // FIXED: Handle clicking on calendar dates
  const handleDateClick = (day: number) => {
    if (!day) return;
    
    const dayWorkouts = getWorkoutsForDate(day);
    console.log('📅 Date clicked:', day, 'Workouts found:', dayWorkouts);
    
    if (dayWorkouts.length === 1) {
      // Single workout - open it for editing
      console.log('✏️ Opening workout for editing:', dayWorkouts[0]);
      onEditEffort(dayWorkouts[0]);
    } else if (dayWorkouts.length > 1) {
      // Multiple workouts - show picker (for now, open first one)
      console.log('📝 Multiple workouts, opening first:', dayWorkouts[0]);
      onEditEffort(dayWorkouts[0]);
    } else {
      // No workouts - create new one for this date
      console.log('➕ No workouts, creating new one for date');
      onAddEffort();
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
        onEditEffort={onEditEffort} // FIXED: Pass onEditEffort to CalendarHeader
      />
      
      <Card className="w-full border border-black" style={{borderRadius: 0}}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Button 
              className="bg-white text-black border-none hover:bg-black hover:text-white p-3"
              style={{borderRadius: 0, minWidth: '44px', minHeight: '44px'}}
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1} />
            </Button>
            <h3 className="text-lg font-normal" style={{fontFamily: 'Inter, sans-serif'}}>
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <Button 
              className="bg-white text-black border-none hover:bg-black hover:text-white p-3"
              style={{borderRadius: 0, minWidth: '44px', minHeight: '44px'}}
              onClick={() => navigateMonth(1)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1} />
            </Button>
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(day => (
              <div key={day} className="p-2 text-center font-normal text-sm text-[#666666]" style={{fontFamily: 'Inter, sans-serif'}}>
                {day}
              </div>
            ))}
            {days.map((day, index) => {
              const dayWorkouts = day ? getWorkoutsForDate(day) : [];
              return (
                <div
                  key={index}
                  className={`min-h-[60px] p-2 border border-black ${
                    day ? 'bg-white hover:bg-black hover:text-white cursor-pointer' : ''
                  }`}
                  style={{borderRadius: 0}}
                  onClick={() => day && handleDateClick(day)} // FIXED: Click handler for dates
                >
                  {day && (
                    <>
                      <div className="text-sm font-normal mb-2" style={{fontFamily: 'Inter, sans-serif'}}>{day}</div>
                      
                      {/* FIXED: Show colored dots with click functionality */}
                      {dayWorkouts.length > 0 && (
                        <div className="flex justify-center items-center space-x-1 mt-1">
                          {dayWorkouts.slice(0, 4).map((workout, idx) => (
                            <div
                              key={workout.id}
                              className={`w-2.5 h-2.5 rounded-full cursor-pointer hover:scale-110 transition-transform ${
                                DISCIPLINE_COLORS[workout.type as keyof typeof DISCIPLINE_COLORS]
                              }`}
                              title={workout.name}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditEffort(workout);
                              }}
                            />
                          ))}
                          {dayWorkouts.length > 4 && (
                            <div 
                              className="text-xs text-gray-500 cursor-pointer hover:text-gray-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDateClick(day);
                              }}
                            >
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
          
          <div className="flex justify-center mt-4">
            <div className="flex" style={{gap: 0}}>
              <Button
                className={`text-xs px-3 py-1 h-8 border border-black ${
                  viewMode === 'month' ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'
                }`}
                onClick={() => setViewMode('month')}
                style={{fontFamily: 'Inter, sans-serif', borderRadius: 0, borderRight: 'none'}}
              >
                Month
              </Button>
              <Button
                className={`text-xs px-3 py-1 h-8 border border-black ${
                  viewMode === 'week' ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'
                }`}
                onClick={() => setViewMode('week')}
                style={{fontFamily: 'Inter, sans-serif', borderRadius: 0}}
              >
                Week
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}