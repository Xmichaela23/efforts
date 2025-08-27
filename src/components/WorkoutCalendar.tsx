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

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
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
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchStartT, setTouchStartT] = useState<number | null>(null);

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

  // Map events by date (YYYY-MM-DD)
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const d = resolveDate(evt.date);
    const key = toDateOnlyString(d);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(evt);
  }

  console.log('WorkoutCalendar - events:', events);
  console.log('WorkoutCalendar - map:', map);

  const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: "short" });
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: "short" });
  const rangeLabel = `${monthFmt.format(weekStart)} ${weekStart.getDate()} – ${monthFmt.format(
    weekEnd
  )} ${weekEnd.getDate()}`;

  return (
    <div
      className="w-full max-w-md mx-auto flex flex-col h-full touch-pan-y"
      onTouchStart={(e) => {
        const t = e.changedTouches[0];
        setTouchStartX(t.clientX);
        setTouchStartY(t.clientY);
        setTouchStartT(Date.now());
      }}
      onTouchMove={(e) => {
        // prevent accidental vertical scroll from cancelling quick horizontal swipes
        if (touchStartX == null || touchStartY == null) return;
        const t = e.changedTouches[0];
        const dx = Math.abs(t.clientX - touchStartX);
        const dy = Math.abs(t.clientY - touchStartY);
        if (dx > dy && dx > 10) {
          // hint browser we intend to handle this
          e.preventDefault();
        }
      }}
      onTouchEnd={(e) => {
        try {
          if (touchStartX == null || touchStartY == null || touchStartT == null) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStartX;
          const dy = t.clientY - touchStartY;
          const dt = Date.now() - touchStartT;
          // Quick horizontal swipe: threshold ~40px, vertical drift small, duration < 700ms
          if (Math.abs(dx) > 40 && Math.abs(dy) < 60 && dt < 700) {
            if (dx < 0) {
              handleNextWeek(addDays(weekEnd, 1));
            } else {
              handlePrevWeek(addDays(weekStart, -1));
            }
          }
        } finally {
          setTouchStartX(null);
          setTouchStartY(null);
          setTouchStartT(null);
        }
      }}
    >
      {/* Header with week range and navigation */}
      <div className="flex items-center justify-between mb-0">
        <button
          aria-label="Previous week"
          className="px-3 py-2 min-w-10 rounded hover:bg-zinc-100 active:bg-zinc-200"
          onClick={() => handlePrevWeek(addDays(weekStart, -1))}
        >
          ‹
        </button>
        <h2 className="text-base font-medium">Week of {rangeLabel}</h2>
        <button
          aria-label="Next week"
          className="px-3 py-2 min-w-10 rounded hover:bg-zinc-100 active:bg-zinc-200"
          onClick={() => handleNextWeek(addDays(weekEnd, 1))}
        >
          ›
        </button>
      </div>

      {/* 3-column week grid filling remaining height with min cell size */}
      <div className="grid grid-cols-3 grid-rows-3 w-full flex-1" style={{ rowGap: 0, columnGap: 0 }}>
        {weekDays.map((d) => {
          const key = toDateOnlyString(d);
          const items = map.get(key) ?? [];
          const isToday = toDateOnlyString(new Date()) === key;

          return (
            <button
              type="button"
              key={key}
              onClick={() => handleDayClick(d)}
              className={[
                "w-full h-full min-h-[var(--cal-cell-h)] border border-gray-200 p-2 flex flex-col justify-between items-stretch",
                isToday ? "bg-gray-100" : "bg-white hover:bg-gray-50",
              ].join(" ")}
            >
              {/* Top row: Day + Date inline */}
              <div className="flex items-baseline justify-start">
                <div className="text-[11px] tracking-wide text-gray-900 font-medium uppercase">
                  {weekdayFmt.format(d)}
                </div>
                <div className="ml-2 text-sm text-gray-500">{d.getDate()}</div>
              </div>

              {/* Bottom area: Event labels anchored at bottom */}
              <div className="flex flex-col gap-1 items-start">
                {items.length === 0 ? (
                  <span className="text-xs text-gray-400">&nbsp;</span>
                ) : (
                  items.map((evt, i) => (
                    <span key={`${key}-${i}`} className="text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded w-full text-center truncate">
                      {evt.label}
                    </span>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}