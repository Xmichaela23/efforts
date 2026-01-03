import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
// import { generateWorkoutDisplay } from '../utils/workoutCodes';
import { normalizeDistanceMiles, formatMilesShort, typeAbbrev, getDisciplinePillClasses, getDisciplineCheckmarkColor } from '@/lib/utils';
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { useAppContext } from '@/contexts/AppContext';
import { Calendar, CheckCircle, Info } from 'lucide-react';
import { mapUnifiedItemToPlanned } from '@/utils/workout-mappers';
import { resolveMovingSeconds } from '@/utils/resolveMovingSeconds';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
    
    // Check if workout is optional
    const raw = (w as any).tags;
    let tags: any[] = [];
    if (Array.isArray(raw)) tags = raw;
    else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch {} }
    const isOptional = tags.map(String).map((t:string)=>t.toLowerCase()).includes('optional');
    
    // Use single source of truth for duration calculation
    const secs = resolveMovingSeconds(w);
    const mins = secs && secs > 0 ? Math.round(secs / 60) : 0;
    const durStr = mins > 0 ? `${mins}:00` : '';

    const has = (pat: RegExp) => steps.some(s => pat.test(s)) || pat.test(txt);

    // RUN
    if (type === 'run') {
      let label = '';
      if (has(/interval_/i) && has(/5kpace|10kpace|rep|vo2/i)) label = `RN-VO2 ${durStr}`.trim();
      else if (has(/longrun_/i) || /long\b/.test(txt)) label = `RN-LR ${durStr}`.trim();
      else if (has(/tempo_/i)) label = `RN-TMP ${durStr}`.trim();
      else if (has(/speed_|strides_/i)) label = `RN-INT-SP ${durStr}`.trim();
      else if (has(/hill|hills?/i)) label = `RN-INT-HL ${durStr}`.trim();
      else label = `RN ${durStr}`.trim();
      return isOptional ? `OPT ${label}` : label;
    }

    // BIKE - Always show duration
    if (type === 'ride' || type === 'bike') {
      // For optional bikes, just show "OPT BK" with duration
      if (isOptional) {
        return durStr ? `OPT BK ${durStr}`.trim() : 'OPT BK';
      }
      // Always include duration for bikes when available
      let label = '';
      if (has(/bike_vo2_/i) || has(/vo2/i)) label = `BK-VO2${durStr ? ` ${durStr}` : ''}`.trim();
      else if (has(/bike_thr_/i)) label = `BK-THR${durStr ? ` ${durStr}` : ''}`.trim();
      else if (has(/bike_ss_/i)) label = `BK-SS${durStr ? ` ${durStr}` : ''}`.trim();
      else if (has(/endurance|z2|long\s*ride/i)) label = `BK-LR${durStr ? ` ${durStr}` : ''}`.trim();
      else if (has(/recovery/i)) label = `BK-REC${durStr ? ` ${durStr}` : ''}`.trim();
      else label = `BK${durStr ? ` ${durStr}` : ''}`.trim();
      return label;
    }

    // SWIM - Always show duration
    if (type === 'swim') {
      // For optional swims, just show "OPT SM" with duration
      if (isOptional) {
        return durStr ? `OPT SM ${durStr}`.trim() : 'OPT SM';
      }
      let label = '';
      if (has(/swim_intervals_/i)) label = durStr ? `SM-INT ${durStr}`.trim() : 'SM-INT';
      else if (has(/technique|drill|drills|swim_drills_/i)) label = durStr ? `SM-DRL ${durStr}`.trim() : 'SM-DRL';
      else label = durStr ? `SM ${durStr}`.trim() : 'SM';
      return label;
    }

    // MOBILITY / PT
    if (type === 'mobility') {
      const label = `MBL`.trim();
      return isOptional ? `OPT ${label}` : label;
    }

    // PILATES/YOGA - Show specific type based on session_type
    if (type === 'pilates_yoga') {
      const metadata = (w as any)?.workout_metadata || {};
      const sessionType = metadata.session_type;
      let label = '';
      if (sessionType) {
        if (sessionType.startsWith('pilates_')) {
          if (sessionType === 'pilates_reformer') label = `PLT-REF ${durStr}`.trim();
          else if (sessionType === 'pilates_mat') label = `PLT-MAT ${durStr}`.trim();
          else label = `PLT ${durStr}`.trim();
        } else if (sessionType.startsWith('yoga_')) {
          if (sessionType === 'yoga_power') label = `YGO-PWR ${durStr}`.trim();
          else if (sessionType === 'yoga_flow') label = `YGO-FLW ${durStr}`.trim();
          else if (sessionType === 'yoga_restorative') label = `YGO-RST ${durStr}`.trim();
          else label = `YGO ${durStr}`.trim();
        }
      }
      if (!label) {
        // Fallback: try to infer from name/description with better patterns
        const nameLower = String(w.name || '').toLowerCase();
        const descLower = String(w.description || '').toLowerCase();
        const combined = (nameLower + ' ' + descLower).toLowerCase();
        
        // Check for specific yoga types first (more specific)
        if (/yoga.*power|ashtanga|power.*yoga/i.test(combined)) label = `YGO-PWR ${durStr}`.trim();
        else if (/yoga.*flow|vinyasa|flow.*yoga/i.test(combined)) label = `YGO-FLW ${durStr}`.trim();
        else if (/yoga.*restorative|yin.*yoga|restorative.*yoga/i.test(combined)) label = `YGO-RST ${durStr}`.trim();
        else if (/yoga/i.test(combined)) label = `YGO ${durStr}`.trim();
        // Check for specific pilates types
        else if (/reformer/i.test(combined) && !/mat/i.test(combined)) label = `PLT-REF ${durStr}`.trim();
        else if (/mat/i.test(combined) && !/reformer/i.test(combined)) label = `PLT-MAT ${durStr}`.trim();
        // If both mentioned, prefer reformer (more specific equipment)
        else if (/reformer/i.test(combined)) label = `PLT-REF ${durStr}`.trim();
        else if (/mat/i.test(combined)) label = `PLT-MAT ${durStr}`.trim();
        // Generic pilates
        else if (/pilates/i.test(combined)) label = `PLT ${durStr}`.trim();
        // Last resort: check if name is just "Session" and use description
        else if (nameLower === 'session' || nameLower === 'pilates session' || nameLower === 'yoga session') {
          if (/reformer/i.test(descLower)) label = `PLT-REF ${durStr}`.trim();
          else if (/mat/i.test(descLower)) label = `PLT-MAT ${durStr}`.trim();
          else if (/yoga/i.test(descLower)) label = `YGO ${durStr}`.trim();
          else if (/pilates/i.test(descLower)) label = `PLT ${durStr}`.trim();
        }
        if (!label) label = `PY ${durStr}`.trim(); // Generic fallback
      }
      return isOptional ? `OPT ${label}` : label;
    }

    // STRENGTH - Abbreviate names consistently for calendar cells
    if (type === 'strength') {
      // For optional strength, just show "OPT STG"
      if (isOptional) {
        return 'OPT STG';
      }
      // Check workout_structure.title first (from plans), then workout.name
      const stTitle = String((w as any)?.workout_structure?.title || '').trim();
      const name = stTitle || String(w.name || '').trim();
      let label = '';
      if (name && name.toLowerCase() !== 'strength') {
        // Strip date suffix like "Strength - 11/24/2025"
        let cleanName = name.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
        // Strip modifiers like "- DELOAD", "- Volume", "- Power"
        cleanName = cleanName.replace(/\s*-\s*(DELOAD|Volume|Power|Endurance|Hybrid)$/i, '').trim();
        
        // Abbreviate based on name pattern
        const nameLower = cleanName.toLowerCase();
        if (/^upper/i.test(cleanName)) label = 'Upper STG';
        else if (/^lower/i.test(cleanName)) label = 'Lower STG';
        else if (/^full/i.test(cleanName)) label = 'Full STG';
        else label = 'STG';
      } else {
        // Fallback to abbreviation logic if no name
        const hasCompound = /squat|deadlift|bench|ohp/.test(txt);
        const hasAccessory = /chin|row|pull|lunge|accessor/i.test(txt);
        const hasCore = /core/.test(txt);
        if (hasCompound) label = 'STG-CMP';
        else if (hasAccessory) label = 'STG-ACC';
        else if (hasCore) label = 'STG-CORE';
        else label = 'STG';
      }
      return label;
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
  const [workloadTooltipOpen, setWorkloadTooltipOpen] = useState(false);
  const { useImperial } = useAppContext();

  // Week bounds for planned fetch
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = addDays(weekStart, 6);
  const fromISO = toDateOnlyString(weekStart);
  const toISO = toDateOnlyString(weekEnd);
  const { items: unifiedItems, weeklyStats, trainingPlanContext, loading: unifiedLoading, error: unifiedError } = useWeekUnified(fromISO, toISO);
  // Adapt unified items → planned + workouts shapes expected below
  // Use mapper - SINGLE SOURCE OF TRUTH
  const unifiedPlanned = unifiedItems
    .filter((it:any)=> !!it?.planned)
    .map((it:any)=> mapUnifiedItemToPlanned(it));
  // Only include completed workouts (items with executed data)
  // Planned-only items are already covered by unifiedPlanned to avoid duplicates
  const unifiedWorkouts = unifiedItems
    .filter((it:any) => {
      // Only include if it has executed data (completed workout)
      return it?.executed && (
        it.executed.overall || 
        (Array.isArray(it.executed.intervals) && it.executed.intervals.length > 0) ||
        String(it?.status||'').toLowerCase() === 'completed'
      );
    })
    .map((it:any)=> ({
      id: it.id,
      date: it.date,
      type: it.type,
      workout_status: 'completed' as const,
      // Provide distance in km if available from executed.overall so labels can render
      distance: (it?.executed?.overall?.distance_m && typeof it.executed.overall.distance_m === 'number')
        ? (it.executed.overall.distance_m / 1000)
        : undefined,
      // Pass sets for strength and mobility so views can read exercise data
      strength_exercises: Array.isArray((it as any)?.executed?.strength_exercises) ? (it as any).executed.strength_exercises : undefined,
      mobility_exercises: Array.isArray((it as any)?.executed?.mobility_exercises) ? (it as any).executed.mobility_exercises : undefined,
      // Include planned_id for linking logic - it's at top level of unified item, not in executed
      planned_id: (it as any)?.planned_id || undefined,
    }));

  // No legacy backstop: unified feed is authoritative


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
    // Debug: log if no links found
    if (workoutIdByPlannedId.size === 0 && wkDb.length > 0) {
      console.log('[Calendar] No linked workouts found. Sample workout:', wkDb[0], 'has planned_id?', !!(wkDb[0] as any)?.planned_id);
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
    
    // Filter out planned workouts that are linked to completed workouts BEFORE adding them
    // (completed workouts already in wkCombinedFiltered will show, so we don't need the planned version)
    // planned is already mapped via plannedWeekRows → unifiedPlanned, so just filter it
    const mappedPlanned = plannedArr
      .filter((p:any) => {
        // Don't include planned workouts that are linked to a completed workout
        // The completed workout will show instead
        return !workoutIdByPlannedId.has(String(p?.id));
      });

    const all = [ ...wkCombinedFiltered, ...mappedPlanned ];
    // Don't filter out optional workouts - show them like Today's Efforts does
    // (Today's Efforts shows both activated and optional workouts)
    const allFiltered = all;

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
        const t = typeAbbrev(w.type || w.workout_type || w.activity_type || '', w);
        const isCompleted = String(w?.workout_status||'').toLowerCase()==='completed';
        const isPlannedLinked = isCompleted && !!(w as any)?.planned_id;
        
        // Determine checkmark based on status
        let checkmark = '';
        if (isCompleted) {
          checkmark = ' ✓'; // Single checkmark for all completed workouts
        }
        // No checkmark for planned workouts
        
        // For linked completed workouts, try to find the planned workout's label
        let labelBase = plannedLabel;
        if (!labelBase) {
          // Fallback: calculate duration for planned workouts (runs, rides, swims)
          const isPlanned = String(w?.workout_status||'').toLowerCase() === 'planned';
          const type = String(w?.type || '').toLowerCase();
          if (isPlanned && (type === 'run' || type === 'ride' || type === 'bike' || type === 'swim')) {
            // Use single source of truth for duration calculation
            const secs = resolveMovingSeconds(w);
            const mins = secs && secs > 0 ? Math.round(secs / 60) : 0;
            const durStr = mins > 0 ? `${mins}:00` : '';
            labelBase = durStr ? `${t} ${durStr}`.trim() : t;
          } else {
            // For completed workouts or other types, use miles if available
            labelBase = [t, milesText].filter(Boolean).join(' ');
          }
        } else {
          // If plannedLabel exists but doesn't have duration for bikes/swims, try to add it
          const type = String(w?.type || '').toLowerCase();
          const isPlanned = String(w?.workout_status||'').toLowerCase() === 'planned';
          if (isPlanned && (type === 'ride' || type === 'bike' || type === 'swim')) {
            // Check if label already has duration (contains "m" or "min")
            const hasDuration = /\d+m|\d+\s*min/i.test(labelBase);
            if (!hasDuration) {
              // Use single source of truth for duration calculation
              const secs = resolveMovingSeconds(w);
              const mins = secs && secs > 0 ? Math.round(secs / 60) : 0;
              const durStr = mins > 0 ? `${mins}:00` : '';
              if (durStr) {
                labelBase = `${labelBase} ${durStr}`.trim();
              }
            }
          }
        }
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
          label: `${labelBase}${checkmark}`,
          href: `#${w.id}`,
          provider: w.provider || deriveProvider(w),
          _sigType: t,
          _sigMiles: miles != null ? Math.round(miles * 10) / 10 : -1, // 1dp signature
          _src: w,
        } as any;
      });

    // De-dupe by id with preference to completed over planned
    // Only dedupe exact same ID (true duplicates), not different workouts on same day
    const byId = new Map<string, any>();
    for (const ev of rawAll) {
      const id = String((ev as any)?._src?.id || '');
      if (!id) { 
        // No ID - use date+type+label as key to avoid duplicates
        const date = String(ev.date || '');
        const type = String((ev as any)?._src?.type || '').toLowerCase();
        const label = String(ev.label || '').replace(/✓+$/, '').trim();
        const key = `${date}|${type}|${label}`;
        byId.set(key, ev); 
        continue; 
      }
      const existing = byId.get(id);
      if (!existing) { 
        byId.set(id, ev); 
        continue; 
      }
      // Same ID - prefer completed over planned
      const exCompleted = /✓+$/.test(String(existing.label||'')) || String((existing as any)?._src?.workout_status||'').toLowerCase()==='completed';
      const curCompleted = /✓+$/.test(String(ev.label||'')) || String((ev as any)?._src?.workout_status||'').toLowerCase()==='completed';
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


  const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: "short" });
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: "short" });
  const rangeLabel = `${monthFmt.format(weekStart)} ${weekStart.getDate()} – ${monthFmt.format(
    weekEnd
  )} ${weekEnd.getDate()}`;

  return (
    <div
      className="w-full max-w-md mx-auto flex flex-col h-full touch-pan-y bg-transparent"
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
      {/* Week header - fixed position above calendar */}
      <div 
        className="flex items-center justify-between py-2 px-2 mb-1 rounded-xl border border-white/20"
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }}
      >
        <button
          aria-label="Previous week"
          className="px-3 py-2 min-w-10 rounded hover:bg-white/10 active:bg-white/20 text-white/80"
          onClick={() => handlePrevWeek(addDays(weekStart, -1))}
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-light tracking-normal text-white">Week of {rangeLabel}</h2>
          {loadingDebounced && (
            <span role="status" aria-live="polite" className="text-[11px] text-white/50">Loading…</span>
          )}
        </div>
        <button
          aria-label="Next week"
          className="px-3 py-2 min-w-10 rounded hover:bg-white/10 active:bg-white/20 text-white/80"
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
                "mobile-calendar-cell w-full h-full min-h-[var(--cal-cell-h)] bg-white/[0.03] backdrop-blur-md border border-white/20 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] p-3 flex flex-col justify-between items-stretch",
                "hover:bg-white/[0.05] transition-all",
              ].join(" ")}
            >
              {/* Top row: Day + Date inline */}
              <div className="flex items-baseline justify-start">
                <div className="text-sm font-light tracking-wider text-foreground uppercase">
                  {weekdayFmt.format(d)}
                </div>
                <div className="ml-2 text-sm text-muted-foreground">{d.getDate()}</div>
              </div>

              {/* Bottom area: Event labels anchored at bottom */}
              <div className="flex flex-col gap-1 items-start">
                {items.length > 0 && (
                  items.map((evt, i) => {
                    // Check actual workout_status from _src
                    const workoutStatus = String((evt?._src?.workout_status || '')).toLowerCase();
                    const isCompleted = workoutStatus === 'completed';
                    const workoutType = String(evt?._src?.type || evt?._src?.workout_type || '').toLowerCase();
                    const disciplineColors = getDisciplinePillClasses(workoutType, isCompleted);
                    
                    return (
                      <span
                        key={`${key}-${i}`}
                        role="button"
                        tabIndex={0}
                        onClick={(e)=>{ e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} }}
                        onKeyDown={(e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} } }}
                        className={`cursor-pointer text-xs px-2 py-1 rounded-xl w-full text-center truncate transition-all backdrop-blur-sm font-light tracking-wide ${disciplineColors}`}
                      >
                        {(() => {
                          const label = String(evt.label || '');
                          const hasCheckmark = /✓+$/.test(label);
                          if (hasCheckmark && isCompleted) {
                            const labelText = label.replace(/✓+$/, '').trim();
                            return (
                              <>
                                {labelText}
                                <span className={getDisciplineCheckmarkColor(workoutType)}> ✓</span>
                              </>
                            );
                          }
                          return label;
                        })()}
                      </span>
                    );
                  })
                )}
                
                
                {items.length === 0 && loadingDebounced && (
                  <>
                    <span className="h-[18px] rounded w-full bg-white/[0.03]" />
                    <span className="h-[18px] rounded w-3/4 bg-white/[0.03]" />
                  </>
                )}
                {items.length === 0 && !loadingDebounced && (
                  <span className="text-xs text-muted-foreground/50">&nbsp;</span>
                )}
              </div>
            </button>
          );
        })}
        
        {/* Fill remaining cells to complete 3x3 grid */}
        {Array.from({ length: 9 - weekDays.length }).map((_, index) => {
          const isLastCell = index === (9 - weekDays.length - 1);
          const isSecondLastCell = index === (9 - weekDays.length - 2);
          
          // Skip the second-to-last cell since we're merging it with the last cell
          if (isSecondLastCell) return null;
          
          return (
            <div 
              key={`empty-${index}`}
              className={`mobile-calendar-cell w-full h-full min-h-[var(--cal-cell-h)] bg-white/[0.03] backdrop-blur-md border border-white/20 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] p-3 flex flex-col justify-start items-start ${
                isLastCell ? 'col-span-2' : ''
              }`}
            >
              {/* Weekly context and workload spans the last two cells */}
              {isLastCell && (
                <div className="space-y-2">
                  {/* Total Workload with counts */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-light tracking-normal">Total Workload</span>
                    <Popover open={workloadTooltipOpen} onOpenChange={setWorkloadTooltipOpen}>
                      <PopoverTrigger asChild>
                        <button 
                          type="button" 
                          className="inline-flex items-center touch-manipulation"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setWorkloadTooltipOpen(!workloadTooltipOpen);
                          }}
                        >
                          <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="max-w-xs p-4" sideOffset={8}>
                        <div className="text-xs space-y-2">
                          <div>
                            <strong>Total Workload</strong>
                            <br />
                            Tracks your weekly training stress by combining workout duration and intensity.
                          </div>
                          <div>
                            <strong>How it works:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                              <li>Longer workouts = higher workload</li>
                              <li>Harder efforts = higher workload</li>
                              <li>Different disciplines use appropriate metrics (pace/power for endurance, weight×reps for strength, RPE for yoga)</li>
                            </ul>
                          </div>
                          <div>
                            <strong>The numbers:</strong>
                            <br />
                            📅 <strong>Planned:</strong> Total scheduled training stress (includes optional workouts)
                            <br />
                            ✓ <strong>Completed:</strong> Actual training stress from finished workouts
                          </div>
                          <div className="pt-1 border-t border-gray-200">
                            <strong>Why it matters:</strong> Use this to balance hard weeks (high workload) with recovery weeks (lower workload) and track your training progression over time.
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span className="text-sm">{weeklyStats.planned}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      <span className="text-sm">{weeklyStats.completed}</span>
                    </div>
                  </div>
                  
                  {/* All Metrics - grouped together */}
                  {(() => {
                    // Collect all metrics in one array
                    const metrics: Array<{ label: string; value: string }> = [];
                    
                    // Distance Totals - server-provided
                    if (weeklyStats.distances) {
                      if (weeklyStats.distances.run_meters > 0) {
                        metrics.push({
                          label: 'Run:',
                          value: useImperial 
                            ? `${(weeklyStats.distances.run_meters / 1609.34).toFixed(1)} mi`
                            : `${(weeklyStats.distances.run_meters / 1000).toFixed(1)} km`
                        });
                      }
                      if (weeklyStats.distances.swim_meters > 0) {
                        metrics.push({
                          label: 'Swim:',
                          value: useImperial
                            ? `${Math.round(weeklyStats.distances.swim_meters / 0.9144)} yd`
                            : `${Math.round(weeklyStats.distances.swim_meters)} m`
                        });
                      }
                      if (weeklyStats.distances.cycling_meters > 0) {
                        metrics.push({
                          label: 'Bike:',
                          value: useImperial
                            ? `${(weeklyStats.distances.cycling_meters / 1609.34).toFixed(1)} mi`
                            : `${(weeklyStats.distances.cycling_meters / 1000).toFixed(1)} km`
                        });
                      }
                    }
                    
                    // Total Volume Load - calculated from strength workouts
                    let totalVolumeLoad = 0;
                    for (const item of unifiedItems) {
                      if (String(item?.type || '').toLowerCase() === 'strength') {
                        const executedExercises = Array.isArray(item?.executed?.strength_exercises) 
                          ? item.executed.strength_exercises 
                          : [];
                        
                        for (const ex of executedExercises) {
                          if (!ex || !Array.isArray(ex.sets)) continue;
                          
                          const isTimeBased = ex.name?.toLowerCase().includes('plank') || 
                                            ex.name?.toLowerCase().includes('wall sit') ||
                                            ex.name?.toLowerCase().includes('hold') ||
                                            ex.sets.some((s: any) => s.duration_seconds && s.duration_seconds > 0 && (!s.reps || s.reps === 0));
                          
                          if (isTimeBased) continue;
                          
                          for (const set of ex.sets) {
                            if (set.completed === false) continue;
                            
                            const weight = Number(set.weight) || 0;
                            const reps = Number(set.reps) || 0;
                            
                            if (weight > 0 && reps > 0) {
                              totalVolumeLoad += weight * reps;
                            }
                          }
                        }
                      }
                    }
                    
                    if (totalVolumeLoad > 0) {
                      metrics.push({
                        label: 'Strength:',
                        value: `${totalVolumeLoad.toLocaleString()} ${useImperial ? 'lb' : 'kg'}`
                      });
                    }
                    
                    // Total Pilates/Yoga Hours
                    let totalMinutes = 0;
                    for (const item of unifiedItems) {
                      if (String(item?.type || '').toLowerCase() === 'pilates_yoga') {
                        const secs = resolveMovingSeconds(item);
                        if (secs && secs > 0) {
                          totalMinutes += Math.round(secs / 60);
                        }
                      }
                    }
                    
                    if (totalMinutes > 0) {
                      const hours = Math.floor(totalMinutes / 60);
                      const mins = totalMinutes % 60;
                      const hoursDisplay = hours > 0 
                        ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
                        : `${mins}m`;
                      metrics.push({
                        label: 'Pilates/Yoga:',
                        value: hoursDisplay
                      });
                    }
                    
                    // Total Workout Hours - sum of all workout durations
                    let totalWorkoutMinutes = 0;
                    for (const item of unifiedItems) {
                      const type = String(item?.type || '').toLowerCase();
                      // Skip strength (volume-based, not time-based) and mobility (no duration typically)
                      if (type === 'strength' || type === 'mobility') continue;
                      
                      const secs = resolveMovingSeconds(item);
                      if (secs && secs > 0) {
                        totalWorkoutMinutes += Math.round(secs / 60);
                      }
                    }
                    
                    if (totalWorkoutMinutes > 0) {
                      const hours = Math.floor(totalWorkoutMinutes / 60);
                      const mins = totalWorkoutMinutes % 60;
                      const hoursDisplay = hours > 0 
                        ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
                        : `${mins}m`;
                      metrics.push({
                        label: 'Total:',
                        value: hoursDisplay
                      });
                    }
                    
                    if (metrics.length > 0) {
                      return (
                        <div className="space-y-1 pt-1">
                          {metrics.map((metric, index) => (
                            <div key={index} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{metric.label}</span>
                              <span className="font-light tracking-normal text-foreground">{metric.value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
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
    <div className="w-full text-left">
      <div className="text-xs text-gray-500">Total Workload</div>
      <div className="text-sm font-medium text-gray-700">
        {loading ? '...' : `${completedWorkload} / ${plannedWorkload}`}
      </div>
      <div className="text-xs text-gray-500">completed / planned</div>
    </div>
  );
}