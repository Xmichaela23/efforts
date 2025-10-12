import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
// import { generateWorkoutDisplay } from '../utils/workoutCodes';
import { normalizeDistanceMiles, formatMilesShort, typeAbbrev } from '@/lib/utils';
import { useWeekUnified } from '@/hooks/useWeekUnified';

export type CalendarEvent = {
  date: string | Date;
  label: string;
  href?: string;
  provider?: string;
  _src?: any;
};
// Prefetcher removed to avoid extra fetches on cell click

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

// Backfill guard to avoid repeated server calls per week
const backfilledWeeks = new Set<string>();

// Derive calendar-cell abbreviation + duration (minutes) for planned workouts
function derivePlannedCellLabel(w: any): string | null {
  try {
    if (!w || w.workout_status !== 'planned') return null;
    const steps: string[] = Array.isArray(w.steps_preset) ? w.steps_preset : [];
    const txt = String(w.description || '').toLowerCase();
    const type = String(w.type || '').toLowerCase();
  // Robust duration resolution (authoritative, no legacy fallbacks):
  // total_duration_seconds (row) > computed.total_duration_seconds > sum(computed.steps.seconds) > sum(intervals)
    const comp: any = w?.computed || {};
    let secs = 0;
  const rootTs = Number((w as any)?.total_duration_seconds);
  if (Number.isFinite(rootTs) && rootTs > 0) secs = rootTs;
    const ts = Number(comp?.total_duration_seconds);
  if (secs <= 0 && Number.isFinite(ts) && ts > 0) secs = ts;
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
  const mins = secs > 0 ? Math.round(secs / 60) : 0;
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

    // MOBILITY / PT
    if (type === 'mobility') {
      return `MBL`.trim();
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
  const { items: unifiedItems, loading: unifiedLoading, error: unifiedError } = useWeekUnified(fromISO, toISO);
  // Adapt unified items → planned + workouts shapes expected below
  const unifiedPlanned = unifiedItems.filter((it:any)=> !!it?.planned).map((it:any)=> ({
    id: it.id,
    date: it.date,
    type: it.type,
    workout_status: it.status || 'planned',
    source: 'training_plan',
    provider: 'workouts',
    // Map planned_data fields expected by label derivation; include total for WU/CD
    computed: (it.planned && Array.isArray(it.planned.steps)) ? { steps: it.planned.steps, total_duration_seconds: it.planned.total_duration_seconds } : null,
    total_duration_seconds: it.planned?.total_duration_seconds || null,
    description: it.planned?.description || null,
    tags: it.planned?.tags || null,
    // Pass-through fields used by label derivation and details
    steps_preset: (it as any)?.planned?.steps_preset ?? null,
    strength_exercises: (it as any)?.planned?.strength_exercises ?? null,
    mobility_exercises: (it as any)?.planned?.mobility_exercises ?? null,
    export_hints: (it as any)?.planned?.export_hints ?? null,
    workout_structure: (it as any)?.planned?.workout_structure ?? null,
    friendly_summary: (it as any)?.planned?.friendly_summary ?? null,
    rendered_description: (it as any)?.planned?.rendered_description ?? null,
    training_plan_id: (it as any)?.planned?.training_plan_id ?? null,
  }));
  const unifiedWorkouts = unifiedItems.map((it:any)=> ({
    id: it.id,
    date: it.date,
    type: it.type,
    workout_status: (String(it?.status||'').toLowerCase()==='completed' || (it?.executed && ((it.executed.overall) || (Array.isArray(it.executed.intervals)&&it.executed.intervals.length>0)))) ? 'completed' : 'planned',
    // Provide distance in km if available from executed.overall so labels can render
    distance: (it?.executed?.overall?.distance_m && typeof it.executed.overall.distance_m === 'number')
      ? (it.executed.overall.distance_m / 1000)
      : undefined,
    // Pass sets for strength and mobility so views can read exercise data
    strength_exercises: Array.isArray((it as any)?.executed?.strength_exercises) ? (it as any).executed.strength_exercises : undefined,
    mobility_exercises: Array.isArray((it as any)?.executed?.mobility_exercises) ? (it as any).executed.mobility_exercises : undefined,
    // Include planned_id for linking logic
    planned_id: (it as any)?.executed?.planned_id || undefined,
  }));

  // No legacy backstop: unified feed is authoritative

  // Dev-only diagnostics to verify unified feed → calendar mapping
  if (import.meta.env?.DEV) {
    try {
      // eslint-disable-next-line no-console
      console.debug('[calendar:unified]', {
        fromISO,
        toISO,
        items: unifiedItems?.length || 0,
        plannedCount: unifiedPlanned?.length || 0,
        completedCount: unifiedWorkouts?.length || 0,
        legacyCompleted: 0,
        samplePlanned: unifiedPlanned?.[0] || null,
        sampleCompleted: unifiedWorkouts?.[0] || null,
      });
    } catch {}
  }

  const plannedWeekRows = unifiedPlanned;
  const workoutsWeekRows = [...unifiedWorkouts];
  const plannedLoading = unifiedLoading;
  const workoutsLoading = unifiedLoading;

  // Debounced loading indicator to avoid flicker on fast responses
  const [loadingDebounced, setLoadingDebounced] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const hasItems = (Array.isArray(unifiedItems) && unifiedItems.length>0);
  const loadingWeekRaw = !initialLoadDone && (Boolean(unifiedLoading) && !hasItems);
  useEffect(() => {
    let t: any;
    if (loadingWeekRaw) {
      t = setTimeout(() => setLoadingDebounced(true), 180); // 180ms debounce
    } else {
      setLoadingDebounced(false);
    }
    return () => { if (t) clearTimeout(t); };
  }, [loadingWeekRaw, fromISO, toISO]);

  // Mark initial load complete once we have either data or a settled request
  useEffect(() => {
    if (!unifiedLoading) setInitialLoadDone(true);
  }, [unifiedLoading]);

  // Materialization is server-side now; no client ensure-week

  // Ensure attach + compute sweep runs for the visible week (once per week in session)
  useEffect(() => {
    (async () => {
      try {
        if (!fromISO || backfilledWeeks.has(fromISO)) return;
        backfilledWeeks.add(fromISO);
        // Fire-and-forget; do not block calendar rendering
        supabase.functions.invoke('sweep-week', { body: { week_start: fromISO } }).catch(()=>{});
      } catch {}
    })();
  }, [fromISO]);

  // Prefetch previous and next weeks to warm caches
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(prevStart, 6);
  const nextStart = addDays(weekStart, 7);
  const nextEnd = addDays(nextStart, 6);
  // Prefetching prev/next weeks is disabled to avoid extra work on first paint and to keep hooks stable.

  // Convert workouts to calendar events
  const events = useMemo(() => {
    // Use range-scoped planned rows only; do not fall back to global plannedWorkouts to avoid duplicate/slow paths
    const planned = plannedWeekRows || [];

    // Build lookup of days/types that actually have a completed workout row this week
    // We only treat a planned row as completed if there is a matching completed workout
    const wkDb = Array.isArray(workoutsWeekRows) ? workoutsWeekRows : [];
    // Identify workouts that point to a planned_id (single source of truth)
    const plannedArr = Array.isArray(planned) ? (planned as any[]) : [];
    const workoutIdByPlannedId = new Map<string, string>();
    for (const w of wkDb) {
      try {
        if (String(w?.workout_status||'').toLowerCase()==='completed' && (w as any)?.planned_id) {
          const pid = String((w as any).planned_id);
          workoutIdByPlannedId.set(pid, String((w as any).id));
        }
      } catch {}
    }
    // Keep raw workout rows even when linked; we will suppress the planned row instead so the completed shows
    const wkCombined = wkDb;
    // Build completed keys for date+type from all workouts in week (unfiltered)
    const completedWorkoutKeys = new Set(
      wkDb
        .filter((w:any)=> String(w?.workout_status||'').toLowerCase()==='completed')
        .map((w:any)=> `${String(w.date)}|${String(w.type||w.workout_type||'').toLowerCase()}`)
    );
    // Count how many planned rows exist per date+type (for lightweight suppression heuristic)
    const plannedCountByKey = (() => {
      const m = new Map<string, number>();
      for (const p of plannedArr) {
        try {
          const key = `${String(p.date)}|${String(p.type||'').toLowerCase()}`;
          m.set(key, (m.get(key) || 0) + 1);
        } catch {}
      }
      return m;
    })();
    // Planned rows considered completed only when a workout references them via planned_id
    const completedPlannedKeys = new Set(
      plannedArr
        .filter((p: any) => workoutIdByPlannedId.has(String(p?.id)))
        .map((p: any) => `${String(p.date)}|${String(p.type || '').toLowerCase()}`)
    );

    // Do not suppress workouts based on date/type; rely on explicit links and later de-dupe
    const wkCombinedFiltered = [...wkCombined];
    // Normalize planned statuses:
    // - If a planned row links to a completed workout (either side), force completed ✓
    const mappedPlanned = (planned as any[]).map((p:any)=>{
      if (workoutIdByPlannedId.has(String(p?.id))) {
        return { ...p, workout_status: 'completed' };
      }
      return p;
    });

    const all = [ ...wkCombinedFiltered, ...mappedPlanned ];
    // Filter out planned optionals defensively (tags may be JSON string or array)
    const allFiltered = all.filter((w: any) => {
      const raw = (w as any).tags;
      let tags: any[] = [];
      if (Array.isArray(raw)) tags = raw;
      else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch {} }
      // Hide optional planned rows entirely
      if (tags.map(String).map((t:string)=>t.toLowerCase()).includes('optional')) return false;
      // If this is a planned row that has a completed workout linked via either side, suppress it (completed wins)
      const isPlannedRow = String((w as any).source || '').toLowerCase() === 'training_plan' || String((w as any).provider||'').toLowerCase()==='workouts';
      if (isPlannedRow) {
        if (workoutIdByPlannedId.has(String((w as any).id))) return false;
      }
      return true;
    });

    // Build raw events with consistent labels; collapse exact duplicates by (id) to prevent double materialize artifacts
    const rawAll = allFiltered
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
        const isCompleted = String(w?.workout_status||'').toLowerCase()==='completed';
        const isPlannedLinked = isCompleted && !!(w as any)?.planned_id;
        
        // For linked completed workouts, try to find the planned workout's label
        let labelBase = plannedLabel || [t, milesText].filter(Boolean).join(' ');
        if (isPlannedLinked && !(w as any)?._plannedLabelUsed) {
          // Try to find the linked planned workout to use its label instead
          const plannedId = String((w as any)?.planned_id || '');
          if (plannedId) {
            const linkedPlanned = allFiltered.find((p: any) => 
              String(p?.id) === plannedId && p?.workout_status === 'planned'
            );
            if (linkedPlanned) {
              const plannedLabelForCompleted = derivePlannedCellLabel(linkedPlanned);
              if (plannedLabelForCompleted) {
                labelBase = plannedLabelForCompleted;
                (w as any)._plannedLabelUsed = true;
              }
            }
          }
        }
        
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

    // De-dupe by id with preference to completed over planned
    const byId = new Map<string, any>();
    for (const ev of rawAll) {
      const id = String((ev as any)?._src?.id || '');
      if (!id) { byId.set(`${ev.date}|${ev.label}|${Math.random()}`, ev); continue; }
      const existing = byId.get(id);
      if (!existing) { byId.set(id, ev); continue; }
      const exCompleted = /✓\s*$/.test(String(existing.label||'')) || String((existing as any)?._src?.workout_status||'').toLowerCase()==='completed';
      const curCompleted = /✓\s*$/.test(String(ev.label||'')) || String((ev as any)?._src?.workout_status||'').toLowerCase()==='completed';
      if (curCompleted && !exCompleted) byId.set(id, ev);
    }
    const raw = Array.from(byId.values());

    // Return raw list; we intentionally show all entries (except exact duplicates)
    // Preserve _src on events so UI can open the item directly
    return raw.map(ev => ({ date: ev.date, label: ev.label, href: ev.href, provider: ev.provider, _src: ev._src }));
  }, [workouts, plannedWorkouts, plannedWeekRows, workoutsWeekRows, fromISO, toISO]);

  const handleDayClick = useCallback((day: Date) => {
    const dateStr = toDateOnlyString(day);
    onDateSelect && onDateSelect(dateStr);
  }, [onDateSelect]);

  const handlePrevWeek = useCallback((newRef: Date) => {
    setReferenceDate(newRef);
  }, []);

  const handleNextWeek = useCallback((newRef: Date) => {
    setReferenceDate(newRef);
  }, []);

  // Helper: compute Week 1 start from an anchor row
  const computeWeek1Start = (anchorDate: string, anchorDayNumber: number | null) => {
    const dn = typeof anchorDayNumber === 'number' && anchorDayNumber >= 1 && anchorDayNumber <= 7 ? anchorDayNumber : 1;
    const parts = String(anchorDate).split('-').map((x) => parseInt(x, 10));
    const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    base.setDate(base.getDate() - (dn - 1));
    return new Date(base.getFullYear(), base.getMonth(), base.getDate());
  };

  // ensureWeekForDate removed

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Idle prefetch of neighbor weeks after current week settles
  const [prefetchNeighbors, setPrefetchNeighbors] = useState(false);
  useEffect(() => {
    setPrefetchNeighbors(false);
    if (loadingDebounced) return;
    const t = setTimeout(() => setPrefetchNeighbors(true), 300);
    return () => clearTimeout(t);
  }, [fromISO, toISO, loadingDebounced]);

  // Map events by date (YYYY-MM-DD)
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const d = resolveDate(evt.date);
    const key = toDateOnlyString(d);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(evt);
  }

  if (import.meta.env?.DEV) {
    console.log('WorkoutCalendar - events:', events);
    console.log('WorkoutCalendar - map:', map);
  }

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
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium">Week of {rangeLabel}</h2>
          {loadingDebounced && (
            <span role="status" aria-live="polite" className="text-[11px] text-gray-500">Loading week…</span>
          )}
        </div>
        <button
          aria-label="Next week"
          className="px-3 py-2 min-w-10 rounded hover:bg-zinc-100 active:bg-zinc-200"
          onClick={() => handleNextWeek(addDays(weekEnd, 1))}
        >
          ›
        </button>
      </div>

      {/* 3-column week grid filling remaining height with min cell size */}
      <div className="mobile-calendar grid grid-cols-3 grid-rows-3 w-full flex-1 relative" style={{ rowGap: 0, columnGap: 0, alignContent: 'stretch', alignItems: 'stretch' }}>
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
                {items.length > 0 && (
                  items.map((evt, i) => (
                    <span
                      key={`${key}-${i}`}
                      role="button"
                      tabIndex={0}
                      onClick={(e)=>{ e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} }}
                      onKeyDown={(e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} } }}
                      className="cursor-pointer text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded w-full text-center truncate hover:bg-gray-200"
                    >
                      {evt.label}
                    </span>
                  ))
                )}
                {items.length === 0 && loadingDebounced && (
                  <>
                    <span className="h-[18px] rounded w-full bg-gray-100" />
                    <span className="h-[18px] rounded w-3/4 bg-gray-100" />
                  </>
                )}
                {items.length === 0 && !loadingDebounced && (
                  <span className="text-xs text-gray-400">&nbsp;</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Weekly workload total */}
      <WeeklyWorkloadTotal weekStart={weekStart.toISOString().split('T')[0]} />
      
      {/* Hidden background prefetchers */}
      {prefetchNeighbors && (
        <>
          {/* Prefetch disabled for performance */}
        </>
      )}
    </div>
  );
}

// Weekly Workload Total Component
function WeeklyWorkloadTotal({ weekStart }: { weekStart: string }) {
  const [completedWorkload, setCompletedWorkload] = useState<number>(0);
  const [plannedWorkload, setPlannedWorkload] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeeklyWorkload = async () => {
      try {
        setLoading(true);
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setCompletedWorkload(0);
          setPlannedWorkload(0);
          setLoading(false);
          return;
        }
        
        const { data, error } = await supabase.functions.invoke('weekly-workload', {
          body: {
            user_id: user.id,
            week_start_date: weekStart
          }
        });

        if (error) {
          console.error('Error fetching weekly workload:', error);
          setCompletedWorkload(0);
          setPlannedWorkload(0);
        } else {
          setCompletedWorkload(data?.total_actual || 0);
          setPlannedWorkload(data?.total_planned || 0);
        }
      } catch (error) {
        console.error('Error fetching weekly workload:', error);
        setCompletedWorkload(0);
        setPlannedWorkload(0);
      } finally {
        setLoading(false);
      }
    };

    fetchWeeklyWorkload();
  }, [weekStart]);

  return (
    <div className="absolute bottom-2 right-2 p-2">
      <div className="text-right">
        <div className="text-xs text-gray-500">Total Workload</div>
        <div className="text-sm font-medium text-gray-700">
          {loading ? '...' : `${completedWorkload} / ${plannedWorkload}`}
        </div>
        <div className="text-xs text-gray-500">completed / planned</div>
      </div>
    </div>
  );
}