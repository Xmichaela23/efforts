import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import CalendarHeader from './CalendarHeader';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DISCIPLINE_COLORS = {
  run: 'bg-blue-500',
  ride: 'bg-green-500',
  swim: 'bg-cyan-500',
  strength: 'bg-orange-500'
};

interface WorkoutCalendarProps {
  onAddEffort: () => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
}

export default function WorkoutCalendar({ onAddEffort, onSelectType, onSelectWorkout }: WorkoutCalendarProps) {
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

  const days = getDaysInMonth();

  return (
    <div className="w-full">
      <CalendarHeader 
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddEffort={onAddEffort}
        onSelectType={onSelectType}
        onSelectWorkout={onSelectWorkout}
      />
      
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="sm" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-lg font-normal" style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <Button variant="outline" size="sm" onClick={() => navigateMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(day => (
              <div key={day} className="p-2 text-center font-normal text-sm text-muted-foreground" style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
                {day}
              </div>
            ))}
            {days.map((day, index) => {
              const dayWorkouts = day ? getWorkoutsForDate(day) : [];
              return (
                <div
                  key={index}
                  className={`min-h-[80px] p-1 border rounded-sm ${
                    day ? 'bg-background hover:bg-muted cursor-pointer' : ''
                  }`}
                >
                  {day && (
                    <>
                      <div className="text-sm font-normal mb-1" style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>{day}</div>
                      <div className="space-y-1">
                        {dayWorkouts.map(workout => (
                          <div
                            key={workout.id}
                            className={`text-xs p-1 rounded text-white truncate ${
                              DISCIPLINE_COLORS[workout.type as keyof typeof DISCIPLINE_COLORS]
                            } ${workout.completed_manually ? 'opacity-60' : ''}`}
                            style={{fontFamily: 'Helvetica, Arial, sans-serif'}}
                            onClick={() => onSelectWorkout(workout)}
                          >
                            {workout.name}
                            {workout.completed_manually && ' ✓'}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}