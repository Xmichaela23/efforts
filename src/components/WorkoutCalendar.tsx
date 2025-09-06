import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
// import { generateWorkoutDisplay } from '../utils/workoutCodes';
import { normalizeDistanceMiles, formatMilesShort, typeAbbrev } from '@/lib/utils';
import { usePlannedRange } from '@/hooks/usePlannedRange';
import { useWorkoutsRange } from '@/hooks/useWorkoutsRange';

export type CalendarEvent = {
  date: string | Date;
  label: string;
  href?: string;
  provider?: string;
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
  // Anchor weeks to Monday
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  d.setHours(0, 0, 0, 0);
  const diff = (day + 6) % 7; // Sun->6, Mon->0, Tue->1, ...
  d.setDate(d.getDate() - diff);
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

function providerPriority(w: any): number {
  const p = (w?.provider || '').toLowerCase();
  if (!p || p === 'manual' || p === 'workouts') return 3;
  if (p === 'garmin') return 2;
  if (p === 'strava') return 1;
  return 0;
}

function deriveProvider(w: any): string {
  const id = String(w?.id || '');
  const name = String(w?.friendly_name || w?.name || '').toLowerCase();
  const p = String(w?.provider || '').toLowerCase();
  if (p) return p;
  if (w?.isGarminImported || w?.garmin_activity_id || id.startsWith('garmin_') || name.includes('garmin')) return 'garmin';
  if (w?.strava_data || w?.strava_activity_id || id.startsWith('strava_')) return 'strava';
  if (w?.source === 'training_plan') return 'workouts';
  return 'workouts';
}

// Derive calendar-cell abbreviation + duration (minutes) for planned workouts
function derivePlannedCellLabel(w: any): string | null {
  try {
    if (!w || w.workout_status !== 'planned') return null;
    const steps: string[] = Array.isArray(w.steps_preset) ? w.steps_preset : [];
    const txt = String(w.description || '').toLowerCase();
    const type = String(w.type || '').toLowerCase();
    // Robust duration resolution: computed > sum(computed.steps) > sum(intervals) > duration field
    const comp: any = w?.computed || {};
    let secs = 0;
    const ts = Number(comp?.total_duration_seconds);
    if (Number.isFinite(ts) && ts > 0) secs = ts;
    if (secs <= 0 && Array.isArray(comp?.steps) && comp.steps.length > 0) {
      try {
        secs = comp.steps.reduce((a: number, s: any) => a + (Number(s?.seconds) || 0), 0);
      } catch {}
    }
    if (secs <= 0 && Array.isArray(w?.intervals) && w.intervals.length > 0) {
      try {
        const sumIntervals = (arr: any[]): number => arr.reduce((acc: number, it: any) => {
          if (Array.isArray(it?.segments) && Number(it?.repeatCount) > 0) {
            const segSum = it.segments.reduce((s: number, sg: any) => s + (Number(sg?.duration) || 0), 0);
            return acc + segSum * Number(it.repeatCount);
          }
          return acc + (Number(it?.duration) || 0);
        }, 0);
        const sInt = sumIntervals(w.intervals);
        if (Number.isFinite(sInt) && sInt > 0) secs = sInt;
      } catch {}
    }
    if (secs <= 0 && typeof w.duration === 'number') secs = Math.max(0, Math.round(w.duration * 60));
    const mins = secs > 0 ? Math.round(secs / 60) : (typeof w.duration === 'number' ? w.duration : 0);
    const durStr = mins > 0 ? `${mins}m` : '';

    const has = (pat: RegExp) => steps.some(s => pat.test(s)) || pat.test(txt);

    // RUN
    if (type === 'run') {
      if (has(/longrun_/i) || /long\b/.test(txt)) return `RN-LR ${durStr}`.trim();
      if (has(/tempo_/i)) return `RN-TMP ${durStr}`.trim();
      if (has(/interval_/i) && has(/5kpace|10kpace|rep|vo2/i)) return `RN-INT-VO2 ${durStr}`.trim();
      if (has(/speed_|strides_/i)) return `RN-INT-SP ${durStr}`.trim();
      if (has(/hill|hills?/i)) return `RN-INT-HL ${durStr}`.trim();
      return `RN ${durStr}`.trim();
    }

    // BIKE
    if (type === 'ride' || type === 'bike') {
      if (has(/bike_vo2_/i)) return `BK-INT-VO2 ${durStr}`.trim();
      if (has(/bike_thr_/i)) return `BK-THR ${durStr}`.trim();
      if (has(/bike_ss_/i)) return `BK-SS ${durStr}`.trim();
      if (has(/endurance|z2|long\s*ride/i)) return `BK-LR ${durStr}`.trim();
      return `BK ${durStr}`.trim();
    }

    // SWIM
    if (type === 'swim') {
      if (has(/swim_intervals_/i)) return `SM-INT ${durStr}`.trim();
      if (has(/technique|drill|drills|swim_drills_/i)) return `SM-DRL ${durStr}`.trim();
      return `SM ${durStr}`.trim();
    }

    // STRENGTH (apply mixed rule priority: Compounds > Accessory > Core)
    if (type === 'strength') {
      // Prefer minutes from steps token strength_main_XXmin over row.duration (which may reflect multi-session day totals)
      const mmTok = steps.join(' ').toLowerCase().match(/strength_main_(\d+)min/);
      const minsFromSteps = mmTok ? parseInt(mmTok[1], 10) : undefined;
      const effMins = (typeof minsFromSteps === 'number' && minsFromSteps > 0)
        ? `${minsFromSteps}m`
        : durStr;
      const hasCompound = /squat|deadlift|bench|ohp/.test(txt);
      const hasAccessory = /chin|row|pull|lunge|accessor/i.test(txt);
      const hasCore = /core/.test(txt);
      if (hasCompound) return `STG-CMP ${effMins}`.trim();
      if (hasAccessory) return `STG-ACC ${effMins}`.trim();
      if (hasCore) return `STG-CORE ${effMins}`.trim();
      return `STG ${effMins}`.trim();
    }

    return null;
  } catch { return null; }
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

  // Week bounds for planned fetch
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = addDays(weekStart, 6);
  const fromISO = toDateOnlyString(weekStart);
  const toISO = toDateOnlyString(weekEnd);
  const { rows: plannedWeekRows } = usePlannedRange(fromISO, toISO);
  const { rows: workoutsWeekRows } = useWorkoutsRange(fromISO, toISO);

  // Prefetch previous and next weeks to warm caches
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(prevStart, 6);
  const nextStart = addDays(weekStart, 7);
  const nextEnd = addDays(nextStart, 6);
  usePlannedRange(toDateOnlyString(prevStart), toDateOnlyString(prevEnd));
  usePlannedRange(toDateOnlyString(nextStart), toDateOnlyString(nextEnd));
  useWorkoutsRange(toDateOnlyString(prevStart), toDateOnlyString(prevEnd));
  useWorkoutsRange(toDateOnlyString(nextStart), toDateOnlyString(nextEnd));

  // Convert workouts to calendar events
  const events = useMemo(() => {
    const planned = (plannedWeekRows && plannedWeekRows.length > 0) ? plannedWeekRows : (Array.isArray(plannedWorkouts) ? plannedWorkouts : []);

    // Build a quick lookup of days/types that already have a completed planned row
    const completedPlannedKeys = new Set(
      (planned as any[])
        .filter((p: any) => String(p?.workout_status || '').toLowerCase() === 'completed')
        .map((p: any) => `${String(p.date)}|${String(p.type || '').toLowerCase()}`)
    );

    // Always merge DB range rows with provider rows from app state for this week
    const wkDb = Array.isArray(workoutsWeekRows) ? workoutsWeekRows : [];
    const wkStateProvider = (Array.isArray(workouts) ? workouts : [])
      .filter((w: any) => {
        if (!w || !w.date) return false;
        // Only include provider-origin rows (avoid duplicating DB rows)
        const id = String(w.id || '');
        const isProvider = id.startsWith('garmin_') || id.startsWith('strava_') || !!w.isGarminImported || !!w.strava_data || !!w.garmin_activity_id || !!w.strava_activity_id;
        if (!isProvider) return false;
        return w.date >= fromISO && w.date <= toISO;
      })
      .map((w: any) => ({ ...w, provider: deriveProvider(w) }));

    // If a planned row has been marked completed for the same date+type,
    // suppress the generic workout DB row to avoid duplicate "ST ✓" labels.
    const wkCombined = [...wkDb, ...wkStateProvider].filter((w: any) => {
      try {
        const key = `${String(w.date)}|${String(w.type || w.workout_type || '').toLowerCase()}`;
        return !completedPlannedKeys.has(key);
      } catch { return true; }
    });
    const all = [ ...wkCombined, ...planned ];
    // Filter out planned optionals defensively (tags may be JSON string or array)
    const allFiltered = all.filter((w: any) => {
      const raw = (w as any).tags;
      let tags: any[] = [];
      if (Array.isArray(raw)) tags = raw;
      else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch {} }
      return !tags.map(String).map((t:string)=>t.toLowerCase()).includes('optional');
    });

    // Build raw events with consistent labels
    const raw = allFiltered
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
      .map((w: any) => {
        const miles = normalizeDistanceMiles(w);
        const milesText = miles != null ? formatMilesShort(miles, 1) : '';
        const plannedLabel = derivePlannedCellLabel(w);
        const t = typeAbbrev(w.type || w.workout_type || w.activity_type || '');
        const labelBase = plannedLabel || [t, milesText].filter(Boolean).join(' ');
        const isCompleted = w.workout_status === 'completed';
        return {
          date: w.date,
          label: `${labelBase}${isCompleted ? ' ✓' : ''}`,
          href: `#${w.id}`,
          provider: w.provider || deriveProvider(w),
          _sigType: t,
          _sigMiles: miles != null ? Math.round(miles * 10) / 10 : -1, // 1dp signature
          _src: w,
        } as any;
      });

    // Dedupe: same day + type + ~same miles → keep best provider
    const byDay = new Map<string, any[]>();
    for (const ev of raw) {
      const key = String(ev.date);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(ev);
    }

    const deduped: CalendarEvent[] = [];
    for (const [day, list] of byDay.entries()) {
      const buckets = new Map<string, any>();
      for (const ev of list) {
        const isPlanned = String(ev.provider || '').toLowerCase() === 'workouts';
        // Do not merge distinct planned rows; key them by id. Still dedupe provider-origin events.
        const bKey = isPlanned ? `planned|${String(ev._src?.id || ev.href || '')}` : `${ev._sigType}|${ev._sigMiles}`;
        const existing = buckets.get(bKey);
        if (!existing) {
          buckets.set(bKey, ev);
        } else {
          const keep = providerPriority(ev._src) >= providerPriority(existing._src) ? ev : existing;
          buckets.set(bKey, keep);
        }
      }
      for (const kept of buckets.values()) {
        deduped.push({ date: day, label: kept.label, href: kept.href, provider: kept.provider });
      }
    }

    return deduped;
  }, [workouts, plannedWorkouts, plannedWeekRows, workoutsWeekRows, fromISO, toISO]);

  const handleDayClick = async (day: Date) => {
    const dateStr = toDateOnlyString(day);
    // On any day click, ensure that week is materialized, then invalidate caches
    try { await ensureWeekForDate(day); } catch {}
    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
    if (onDateSelect) onDateSelect(dateStr);
  };

  const handlePrevWeek = async (newRef: Date) => {
    setReferenceDate(newRef);
    try { await ensureWeekForDate(newRef); } catch {}
    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
  };

  const handleNextWeek = async (newRef: Date) => {
    setReferenceDate(newRef);
    try { await ensureWeekForDate(newRef); } catch {}
    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
  };

  // Helper: compute Week 1 start from an anchor row
  const computeWeek1Start = (anchorDate: string, anchorDayNumber: number | null) => {
    const dn = typeof anchorDayNumber === 'number' && anchorDayNumber >= 1 && anchorDayNumber <= 7 ? anchorDayNumber : 1;
    const parts = String(anchorDate).split('-').map((x) => parseInt(x, 10));
    const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    base.setDate(base.getDate() - (dn - 1));
    return new Date(base.getFullYear(), base.getMonth(), base.getDate());
  };

  // Ensure week materialized for a date based on active plan
  const ensureWeekForDate = async (d: Date) => {
    try {
      const activePlan = Array.isArray(currentPlans) && currentPlans.length > 0 ? currentPlans[0] : null;
      if (!activePlan || !activePlan.id) return;
      // Find Week 1 anchor
      const { data: w1 } = await supabase
        .from('planned_workouts')
        .select('date, day_number')
        .eq('training_plan_id', activePlan.id)
        .eq('week_number', 1)
        .order('day_number', { ascending: true })
        .limit(1);
      if (!Array.isArray(w1) || w1.length === 0) return;
      const anchor = w1[0] as any;
      const w1Start = computeWeek1Start(String(anchor.date), Number(anchor.day_number));
      const tgtStart = startOfWeek(d);
      const diffDays = Math.round((resolveDate(toDateOnlyString(tgtStart)).getTime() - resolveDate(toDateOnlyString(w1Start)).getTime()) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(diffDays / 7) + 1;
      if (!Number.isFinite(weekNumber) || weekNumber < 1) return;
      const mod = await import('@/services/plans/ensureWeekMaterialized');
      await mod.ensureWeekMaterialized(String(activePlan.id), weekNumber);
    } catch {}
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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
      <div className="mobile-calendar grid grid-cols-3 grid-rows-3 w-full flex-1" style={{ rowGap: 0, columnGap: 0, alignContent: 'stretch', alignItems: 'stretch' }}>
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
                "mobile-calendar-cell w-full h-full min-h-[var(--cal-cell-h)] border border-gray-200 p-2 flex flex-col justify-between items-stretch",
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