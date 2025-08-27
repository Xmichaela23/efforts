import React, { useState, useMemo } from 'react';
import { generateWorkoutDisplay } from '../utils/workoutCodes';

export type CalendarEvent = {
  date: string | Date;
  label: string;
  href?: string;
};

interface WorkoutCalendarProps {
  onAddEffort: () => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
  onViewCompleted: () => void;
  onEditEffort: (workout: any) => void;
  onDateSelect: (date: string) => void;
  onSelectRoutine?: (type: string) => void;
  onOpenPlanBuilder?: () => void;
  currentPlans?: any[];
  completedPlans?: any[];
  workouts?: any[];
  plannedWorkouts?: any[];
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateOnlyString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveDate(input: string | Date) {
  if (input instanceof Date) return input;
  const [y, m, d] = input.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-[80px] truncate items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] leading-4 text-zinc-700">
      {children}
    </span>
  );
}

export default function WorkoutCalendar({
  onAddEffort,
  onSelectType,
  onSelectWorkout,
  onViewCompleted,
  onEditEffort,
  onDateSelect,
  onSelectRoutine,
  onOpenPlanBuilder,
  currentPlans = [],
  completedPlans = [],
  workouts = [],
  plannedWorkouts = []
}: WorkoutCalendarProps) {
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());

  // Convert workouts to calendar events
  const events = useMemo(() => {
    const all = [
      ...(Array.isArray(workouts) ? workouts : []),
      ...(Array.isArray(plannedWorkouts) ? plannedWorkouts : []),
    ];

    return all
      .filter((w: any) => {
        if (!w || !w.date) return false;
        
        const today = new Date().toLocaleDateString('en-CA');
        if (w.date >= today) {
          const isPlanned = w.workout_status === 'planned' || !w.workout_status;
          const isCompleted = w.workout_status === 'completed';
          return isPlanned || isCompleted;
        } else {
          return true;
        }
      })
      .map((workout: any) => {
        const workoutDisplay = generateWorkoutDisplay(workout);
        const isCompleted = workout.workout_status === 'completed';
        
        return {
          date: workout.date,
          label: `${workoutDisplay}${isCompleted ? ' ✓' : ''}`,
          href: `#${workout.id}`
        };
      });
  }, [workouts, plannedWorkouts]);

  const handleDayClick = (day: Date) => {
    const dateStr = toDateOnlyString(day);
    if (onDateSelect) {
      onDateSelect(dateStr);
    }
  };

  const handlePrevWeek = (newRef: Date) => {
    setReferenceDate(newRef);
  };

  const handleNextWeek = (newRef: Date) => {
    setReferenceDate(newRef);
  };

  const weekStart = startOfWeek(referenceDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);

  // Group events by YYYY-MM-DD
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const d = resolveDate(evt.date);
    const key = toDateOnlyString(d);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(evt);
  }

  const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: "short" });
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: "short" });

  const rangeLabel = `${monthFmt.format(weekStart)} ${weekStart.getDate()} – ${monthFmt.format(
    weekEnd
  )} ${weekEnd.getDate()}`;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Today banner */}
      <div className="text-sm text-zinc-600 mb-2">
        {new Intl.DateTimeFormat('en-US', {
          weekday: "long",
          month: "short",
          day: "numeric",
        }).format(new Date())}
      </div>

      {/* Range header */}
      <div className="flex items-center justify-between mb-2">
        <button
          aria-label="Previous week"
          className="px-2 py-1 rounded hover:bg-zinc-100"
          onClick={() => handlePrevWeek(addDays(weekStart, -1))}
        >
          ‹
        </button>
        <h2 className="text-xl font-semibold">Week of {rangeLabel}</h2>
        <button
          aria-label="Next week"
          className="px-2 py-1 rounded hover:bg-zinc-100"
          onClick={() => handleNextWeek(addDays(weekEnd, 1))}
        >
          ›
        </button>
      </div>

      {/* 7-col grid: headers then dates */}
      <div className="grid grid-cols-7 gap-y-1 text-center select-none">
        {weekDays.map((d) => (
          <div key={`hdr-${d.toISOString()}`} className="text-xs tracking-wide text-zinc-500">
            {weekdayFmt.format(d).toUpperCase()}
          </div>
        ))}

        {weekDays.map((d) => {
          const key = toDateOnlyString(d);
          const items = map.get(key) ?? [];
          const isToday = toDateOnlyString(new Date()) === key;

          return (
            <div
              key={key}
              onClick={() => handleDayClick(d)}
              className={[
                "relative h-16 rounded-xl border border-zinc-200 hover:border-zinc-300 transition-colors px-1 pt-1 cursor-pointer",
                isToday ? "ring-1 ring-zinc-900/10 bg-zinc-50" : "bg-white",
              ].join(" ")}
            >
              <div className="text-sm font-medium text-zinc-900">{d.getDate()}</div>

              {/* Chips */}
              <div className="mt-1 flex flex-col gap-1 items-center">
                {items.length === 0 ? (
                  <span className="text-[10px] text-zinc-400">&nbsp;</span>
                ) : (
                  items.map((evt, i) => (
                    <Chip key={`${key}-${i}`}>{evt.label}</Chip>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}