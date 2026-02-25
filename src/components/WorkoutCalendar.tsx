import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
// import { generateWorkoutDisplay } from '../utils/workoutCodes';
import { normalizeDistanceMiles, formatMilesShort, typeAbbrev, getDisciplinePillClasses, getDisciplineCheckmarkColor } from '@/lib/utils';
import { getDisciplineColorRgb, getDisciplineGlowColor, getDisciplinePhosphorPill, getDisciplineGlowStyle, getDisciplinePhosphorCore } from '@/lib/context-utils';
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { useAppContext } from '@/contexts/AppContext';
import { Calendar, CheckCircle, Info, Activity, Bike, Waves, Dumbbell, Move, CircleDot, type LucideIcon } from 'lucide-react';
import { mapUnifiedItemToPlanned } from '@/utils/workout-mappers';
import { resolveMovingSeconds } from '@/utils/resolveMovingSeconds';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import RescheduleValidationPopup from '@/components/RescheduleValidationPopup';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';

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
  selectedDate?: string;
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

// Discipline icons (concrete symbols for recognition - research-backed)
const DISCIPLINE_ICONS: Record<string, LucideIcon> = {
  run: Activity,
  running: Activity,
  ride: Bike,
  bike: Bike,
  cycling: Bike,
  swim: Waves,
  swimming: Waves,
  strength: Dumbbell,
  strength_training: Dumbbell,
  weight: Dumbbell,
  weights: Dumbbell,
  mobility: Move,
  pilates_yoga: CircleDot,
  pilates: CircleDot,
  yoga: CircleDot,
};

function resolveDisciplineForIcon(workoutType: string, label: string): string {
  const type = workoutType.toLowerCase();
  if (type && DISCIPLINE_ICONS[type]) return type;
  const labelLower = label.toLowerCase();
  if (/^rn[- ]|run|rnvo2|rn-lr|rn-tmp|rn-int/.test(labelLower)) return 'run';
  if (/^bk|bike|ride|cycling/.test(labelLower)) return 'ride';
  if (/^sm|swim|swimming/.test(labelLower)) return 'swim';
  if (/stg|strength|upper|lower|full|cmp|acc|core/.test(labelLower)) return 'strength';
  if (/mbl|mobility|pilates|yoga|plt|ygo|py/.test(labelLower)) return 'pilates_yoga';
  return 'run'; // default fallback
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
  selectedDate,
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
  const { updatePlannedWorkout, deletePlannedWorkout } = usePlannedWorkouts();
  
  // Drag and drop state
  const [draggedWorkout, setDraggedWorkout] = useState<any>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [reschedulePending, setReschedulePending] = useState<{ workoutId: string; oldDate: string; newDate: string; workoutName: string } | null>(null);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, workout: any) => {
    const workoutStatus = String(workout?.workout_status || '').toLowerCase();
    // Only allow dragging planned workouts
    if (workoutStatus === 'planned' && workout?.id) {
      setDraggedWorkout(workout);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', workout.id);
      // Make drag image semi-transparent
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5';
      }
    } else {
      e.preventDefault();
    }
  };

  // Handle drag end
  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedWorkout(null);
    setDragOverDate(null);
  };

  // Handle drag over (for drop zone highlighting)
  const handleDragOver = (e: React.DragEvent, date: string) => {
    if (draggedWorkout) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverDate(date);
    }
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  // Handle drop - validate and show popup
  const handleDrop = async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setDragOverDate(null);

    if (!draggedWorkout || !draggedWorkout.id) return;

    const oldDate = draggedWorkout.date || toDateOnlyString(new Date());
    
    // Don't validate if dropping on same date
    if (oldDate === targetDate) {
      setDraggedWorkout(null);
      return;
    }

    try {
      // Call validation edge function
      const { data, error } = await supabase.functions.invoke('validate-reschedule', {
        body: {
          workout_id: draggedWorkout.id,
          new_date: targetDate
        }
      });

      if (error) {
        console.error('Validation error:', error);
        return;
      }

      // Show validation popup
      setValidationResult(data);
      setReschedulePending({
        workoutId: draggedWorkout.id,
        oldDate,
        newDate: targetDate,
        workoutName: draggedWorkout.name || `${draggedWorkout.type} workout`
      });
      setShowValidationPopup(true);
      setDraggedWorkout(null);
    } catch (err) {
      console.error('Error validating reschedule:', err);
    }
  };

  // Handle confirm reschedule
  const handleConfirmReschedule = async () => {
    if (!reschedulePending || !updatePlannedWorkout) return;

    try {
      // Delete conflicting workouts (same type on same day)
      if (validationResult?.conflicts?.sameTypeWorkouts) {
        for (const conflict of validationResult.conflicts.sameTypeWorkouts) {
          try {
            await deletePlannedWorkout(conflict.id);
            console.log(`[Calendar] Deleted conflicting workout: ${conflict.id}`);
          } catch (err) {
            console.error(`[Calendar] Error deleting conflict ${conflict.id}:`, err);
            // Continue anyway - the move will still work
          }
        }
      }

      await updatePlannedWorkout(reschedulePending.workoutId, {
        date: reschedulePending.newDate
      });

      // Invalidate to refresh calendar
      window.dispatchEvent(new CustomEvent('workouts:invalidate'));
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      window.dispatchEvent(new CustomEvent('week:invalidate'));

      setShowValidationPopup(false);
      setReschedulePending(null);
      setValidationResult(null);
    } catch (err) {
      console.error('Error rescheduling workout:', err);
    }
  };

  // Handle cancel
  const handleCancelReschedule = () => {
    setShowValidationPopup(false);
    setReschedulePending(null);
    setValidationResult(null);
  };

  // Handle suggestion click
  const handleSuggestionClick = async (date: string) => {
    if (!reschedulePending) return;

    try {
      // Re-validate for suggested date
      const { data, error } = await supabase.functions.invoke('validate-reschedule', {
        body: {
          workout_id: reschedulePending.workoutId,
          new_date: date
        }
      });

      if (error) {
        console.error('Validation error:', error);
        return;
      }

      setValidationResult(data);
      setReschedulePending({
        ...reschedulePending,
        newDate: date
      });
    } catch (err) {
      console.error('Error validating suggestion:', err);
    }
  };

  // Sync referenceDate when week:navigate event is dispatched (from TodaysEffort)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      try {
        const date = e.detail?.date;
        if (date) {
          setReferenceDate(new Date(date + 'T12:00:00'));
        }
      } catch {}
    };
    window.addEventListener('week:navigate', handler as any);
    return () => window.removeEventListener('week:navigate', handler as any);
  }, []);

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
    .map((it:any)=> it?.planned_workout ?? mapUnifiedItemToPlanned(it));
  // Only include completed workouts (items with executed data)
  // Pass FULL unified item so UI receives complete data (executed, planned, computed) without patching
  const unifiedWorkouts = unifiedItems
    .filter((it:any) => {
      return it?.executed && (
        it.executed.overall || 
        (Array.isArray(it.executed.intervals) && it.executed.intervals.length > 0) ||
        String(it?.status||'').toLowerCase() === 'completed'
      );
    })
    .map((it:any)=> ({
      ...it,
      workout_status: 'completed' as const,
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

  // For the “road”: bias to complementary colors so the glow supports pills instead of washing them out.
  const contrastRgbForType = (t: string): string => {
    const type = String(t || '').toLowerCase();
    // Map discipline → complementary-ish wash (keep subtle and cool-biased)
    if (type === 'run') return '74, 158, 255'; // blue against yellow
    if (type === 'strength') return '183, 148, 246'; // purple against orange
    if (type === 'mobility') return '255, 215, 0'; // yellow against purple
    if (type === 'swim') return '255, 140, 66'; // warm against blue
    if (type === 'bike') return '239, 68, 68'; // red against green
    return '255, 255, 255';
  };

  // VERTICAL TIMELINE PREVIEW - Replace grid with timeline list
  return (
    <div
      className="w-full flex-1 flex flex-col touch-pan-y bg-transparent relative min-h-0"
      style={{ position: 'relative' }}
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
      {/* Subtle “printed” texture over the whole calendar (glass-safe) */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0.10,
          mixBlendMode: 'soft-light',
          backgroundImage: `
            radial-gradient(circle at 18% 28%, rgba(255,255,255,0.06) 0.9px, transparent 1.7px),
            radial-gradient(circle at 72% 42%, rgba(255,255,255,0.05) 0.9px, transparent 1.7px),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.030) 0px, rgba(255,255,255,0.030) 1px, transparent 1px, transparent 9px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, transparent 1px, transparent 9px),
            linear-gradient(45deg, rgba(255,255,255,0.10) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.08) 1px, transparent 1px)
          `,
          backgroundSize: '18px 18px, 22px 22px, cover, cover, 44px 44px, 44px 44px',
          backgroundPosition: '0 0, 8px 10px, center, center, center, center',
          backgroundBlendMode: 'soft-light, soft-light, soft-light, soft-light, soft-light, soft-light',
          filter: 'blur(0.18px) contrast(1.04)',
          transform: 'translateZ(0)',
        }}
      />

      {/* Week Navigation - Bright timeline header (compact) */}
      <div 
        className="flex items-center justify-between py-0.5 mb-0.5 relative"
        style={{
          /* Glassy header strip (frosted, not opaque) */
          backgroundColor: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(18px) saturate(1.18)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.18)',
          backgroundImage: `
            radial-gradient(ellipse at 18% 0%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.0) 58%),
            radial-gradient(ellipse at 86% 40%, rgba(74,158,255,0.08) 0%, rgba(74,158,255,0.0) 70%),
            radial-gradient(ellipse at 30% 55%, rgba(183,148,246,0.06) 0%, rgba(183,148,246,0.0) 72%),
            linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 52%, rgba(0,0,0,0.06) 100%)
          `,
          backgroundBlendMode: 'screen, screen, screen, normal',
          // narrower “week strip”
          padding: '0.24rem 0.40rem',
          borderRadius: '5px',
          zIndex: 5,
          // Omni-inspired illuminated border
          border: '0.5px solid rgba(255, 255, 255, 0.14)',
          boxShadow: `
            /* Option 1 lighting: top-left key light + neutral depth (let the road be the spectrum emitter) */
            0 0 0 1px rgba(255,255,255,0.05) inset,
            inset 0 1px 0 rgba(255,255,255,0.22),
            inset 0 -1px 0 rgba(0,0,0,0.35),
            0 10px 22px rgba(0,0,0,0.32),
            0 0 22px rgba(255,255,255,0.07)
          `,
        }}
      >
        <button
          aria-label="Previous week"
          className="px-1.5 py-1 min-w-7 rounded hover:bg-white/5 active:bg-white/8 transition-colors"
          style={{ color: 'rgba(255, 255, 255, 0.7)' }}
          onClick={() => handlePrevWeek(addDays(weekStart, -7))}
        >
          ‹
        </button>
        <span className="text-xs font-light tracking-normal" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
          {rangeLabel}
        </span>
        <button
          aria-label="Next week"
          className="px-1.5 py-1 min-w-7 rounded hover:bg-white/5 active:bg-white/8 transition-colors"
          style={{ color: 'rgba(255, 255, 255, 0.7)' }}
          onClick={() => handleNextWeek(addDays(weekEnd, 1))}
        >
          ›
        </button>
      </div>

      {/* Vertical Timeline - Days as horizontal rows (training log style) - always show all 7 days */}
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, auto)', gap: 4, flexShrink: 0, paddingBottom: 4, position: 'relative', zIndex: 1 }}>
        {weekDays.map((d) => {
          const key = toDateOnlyString(d);
          const items = map.get(key) ?? [];
          const isToday = toDateOnlyString(new Date()) === key;
          const isSelected = !!selectedDate && selectedDate === key;
          const isActiveDay = isToday || isSelected;

          // Row-level road wash reacts to the workouts in this day.
          const rowTypes = Array.from(
            new Set(
              (items || [])
                .map((evt: any) => String(evt?._src?.type || evt?._src?.workout_type || '').toLowerCase())
                .filter(Boolean)
            )
          ).slice(0, 3);
          const washA = contrastRgbForType(rowTypes[0] || '');
          const washB = contrastRgbForType(rowTypes[1] || rowTypes[0] || '');
          const washC = contrastRgbForType(rowTypes[2] || rowTypes[1] || rowTypes[0] || '');

          return (
            <button
              type="button"
              key={key}
              onClick={() => handleDayClick(d)}
              onDragOver={(e) => handleDragOver(e, key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, key)}
              className={[
                // compact rows so Today can breathe
                "w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all",
                "hover:bg-white/[0.02]",
                dragOverDate === key ? "ring-1 ring-white/20 bg-white/[0.03]" : "",
              ].join(" ")}
              style={{
                position: 'relative',
                borderRadius: '6px',
                // Omni-inspired illuminated border that blends
                border: isToday ? '0.5px solid rgba(255, 255, 255, 0.18)' : '0.5px solid rgba(255, 255, 255, 0.12)',
                background: isToday
                  ? `
                      /* dial back internal glow; keep a readable dark bed */
                      radial-gradient(ellipse at left, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.18) 100%),
                      radial-gradient(ellipse at 24% 50%, rgba(255, 215, 0, 0.10) 0%, rgba(255, 215, 0, 0.0) 70%),
                      radial-gradient(ellipse at 76% 50%, rgba(74, 158, 255, 0.08) 0%, rgba(74, 158, 255, 0.0) 72%)
                    ` // Today: lower internal wash, keep focus on pills
                  : isSelected
                    ? 'radial-gradient(ellipse at left, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.18) 100%)' // Selected: eye-catch, but less than Today
                  : 'radial-gradient(ellipse at left, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.25) 100%)', // Week rows: mid glow
                opacity: 1.0,
                // More visible Omni glow for today
                boxShadow: isToday
                  ? `
                      inset 0 0 0 1px rgba(255,255,255,0.10),
                      0 0 20px rgba(255, 215, 0, 0.18),
                      0 0 28px rgba(255, 140, 66, 0.12),
                      0 0 24px rgba(183, 148, 246, 0.11),
                      0 0 22px rgba(74, 158, 255, 0.10),
                      0 0 34px rgba(239, 68, 68, 0.07)
                    `.replace(/\s+/g,' ').trim()
                  : isSelected
                    ? 'inset 0 0 0 1px rgba(255,255,255,0.07), 0 0 16px rgba(255,255,255,0.10), 0 0 22px rgba(74,158,255,0.10)'
                    : 'none',
              }}
            >
              {/* Reactive “road tint” that adapts to the row’s workout types.
                  Kept at the edges + behind a dark center so pills stay clean. */}
              {items.length > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 6,
                    pointerEvents: 'none',
                    zIndex: 0,
                    // Edge-biased emission + center suppression
                    backgroundImage: `
                      radial-gradient(140px 48px at 12% 55%, rgba(${washA}, 0.14) 0%, rgba(${washA}, 0.0) 72%),
                      radial-gradient(160px 56px at 88% 55%, rgba(${washB}, 0.14) 0%, rgba(${washB}, 0.0) 74%),
                      radial-gradient(220px 70px at 50% 40%, rgba(${washC}, 0.08) 0%, rgba(${washC}, 0.0) 78%),
                      linear-gradient(90deg,
                        rgba(0,0,0,0.45) 0%,
                        rgba(0,0,0,0.00) 26%,
                        rgba(0,0,0,0.00) 74%,
                        rgba(0,0,0,0.45) 100%
                      )
                    `,
                    backgroundBlendMode: 'screen, screen, screen, normal',
                    opacity: 0.60,
                    filter: 'blur(10px) saturate(1.05)',
                    transform: 'translateZ(0)',
                  }}
                />
              )}
              {/* Side-gutter texture lives INSIDE the row (so it isn't covered by the row's own background) */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 6,
                  pointerEvents: 'none',
                  zIndex: 0,
                  opacity: 0.14,
                  // Keep visible on iOS: avoid exotic blend modes
                  mixBlendMode: 'normal',
                  backgroundImage: `
                    /* LEFT rail + fade-in */
                    linear-gradient(90deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.00) 46%),
                    /* RIGHT rail + fade-in */
                    linear-gradient(270deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.00) 46%),
                    /* left ticks (kept near edge via local gradient weighting) */
                    repeating-linear-gradient(155deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 1px, rgba(255,255,255,0.0) 1px, rgba(255,255,255,0.0) 18px),
                    /* right ticks */
                    repeating-linear-gradient(25deg, rgba(255,255,255,0.020) 0px, rgba(255,255,255,0.020) 1px, rgba(255,255,255,0.0) 1px, rgba(255,255,255,0.0) 20px),
                    /* center suppression so it reads as "sides" */
                    linear-gradient(90deg, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.55) 32%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.00) 100%)
                  `,
                  backgroundSize: 'auto, auto, auto, auto, auto',
                  backgroundPosition: 'left top, right top, left top, right top, center',
                  backgroundBlendMode: 'screen, screen, normal, normal, normal',
                  filter: 'blur(0.2px)',
                }}
              />
              {/* Left: Day label - bright and visible (compact) */}
              <div className="flex-shrink-0 w-9 text-left" style={{ position: 'relative', zIndex: 1 }}>
                <div
                  className="text-xs font-light leading-tight"
                  style={{
                    color: isActiveDay ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.75)',
                    textShadow: isToday
                      ? '0 0 8px rgba(255,215,0,0.28), 0 0 14px rgba(255,140,66,0.20), 0 0 14px rgba(183,148,246,0.16)'
                      : isSelected
                        ? '0 0 8px rgba(255,255,255,0.14), 0 0 12px rgba(74,158,255,0.12)'
                      : 'none',
                  }}
                >
                  {weekdayFmt.format(d)}
                </div>
                <div
                  className="text-xs font-light tabular-nums leading-tight"
                  style={{
                    color: isActiveDay ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.7)',
                    textShadow: isToday
                      ? '0 0 10px rgba(255,215,0,0.34), 0 0 16px rgba(74,158,255,0.18), 0 0 20px rgba(239,68,68,0.12)'
                      : isSelected
                        ? '0 0 10px rgba(255,255,255,0.18), 0 0 16px rgba(74,158,255,0.14)'
                      : 'none',
                  }}
                >
                  {d.getDate()}
                </div>
              </div>

              {/* Right: Workout chips - horizontal flow (compact) */}
              <div className="flex-1 flex items-center gap-1 flex-wrap min-h-[20px]" style={{ position: 'relative', zIndex: 1 }}>
                {items.length > 0 && (
                  items.map((evt, i) => {
                    // Check actual workout_status from _src
                    const workoutStatus = String((evt?._src?.workout_status || '')).toLowerCase();
                    const isCompleted = workoutStatus === 'completed';
                    const workoutType = String(evt?._src?.type || evt?._src?.workout_type || '').toLowerCase();
                    
                    // Determine glow state based on date and status
                    // Fill rule: ONLY completed workouts get fills. Today's uncompleted workouts = no fill.
                    // State hierarchy: Completed (done, filled) > Today (active, no fill, strongest glow) > This Week (week, no fill) > Future (idle, no fill)
                    let glowState: 'idle' | 'week' | 'done' | 'active' = 'idle';
                    if (isCompleted) {
                      glowState = 'done'; // Completed workouts get fill and medium-high glow
                    } else if (isToday) {
                      glowState = 'active'; // Today's uncompleted workouts get strongest glow but NO fill
                    } else {
                      // Check if this week (within current week range)
                      const workoutDate = evt?._src?.date || key;
                      const today = new Date();
                      const currentWeekStart = startOfWeek(today);
                      const currentWeekEnd = new Date(currentWeekStart);
                      currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
                      currentWeekEnd.setHours(23, 59, 59, 59);
                      
                      const workoutDateObj = new Date(workoutDate + 'T12:00:00');
                      const isThisWeek = workoutDateObj >= currentWeekStart && workoutDateObj <= currentWeekEnd;
                      
                      glowState = isThisWeek ? 'week' : 'idle'; // This week = medium glow, future = very faint
                    }
                    
                    const phosphorPill = getDisciplinePhosphorPill(workoutType, glowState);
                    const pillRgb = getDisciplineColorRgb(workoutType);
                    const isDone = glowState === 'done';
                    
                    const isPlanned = workoutStatus === 'planned';
                    const workoutId = evt?._src?.id;

                    const renderLabel = () => {
                      const label = String(evt.label || '').replace(/✓+$/, '').trim();
                      const discipline = resolveDisciplineForIcon(workoutType, label);
                      const IconComponent = DISCIPLINE_ICONS[discipline] || Activity;

                      const renderDisciplineIcon = (completed: boolean) => (
                        <span
                          aria-label={completed ? 'Completed' : 'Planned'}
                          className="inline-flex items-center justify-center tabular-nums flex-shrink-0"
                          style={{
                            marginLeft: 6,
                            width: 16,
                            height: 16,
                            verticalAlign: 'middle',
                          }}
                        >
                          <IconComponent
                            size={14}
                            strokeWidth={2}
                            style={{
                              color: completed ? 'rgba(255, 255, 255, 0.9)' : 'rgba(245, 245, 245, 0.5)',
                              opacity: completed ? 1 : 0.85,
                            }}
                          />
                        </span>
                      );

                      const renderCompletedCheckmark = () => (
                        <span
                          aria-label="Completed"
                          className="inline-flex items-center justify-center flex-shrink-0"
                          style={{
                            marginLeft: 4,
                            color: 'rgba(255, 255, 255, 0.95)',
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                        >
                          ✓
                        </span>
                      );

                      const parts = label.match(/(\d+\.?\d*[a-z]?|:?\d+)/g) || [];
                      const content = (() => {
                        if (parts.length > 0) {
                          const nonNumericParts = label.split(/(\d+\.?\d*[a-z]?|:?\d+)/g);
                          return nonNumericParts.map((part, idx) => {
                            const isNumeric = parts.includes(part);
                            return isNumeric ? (
                              <span key={idx} className="tabular-nums">{part}</span>
                            ) : part;
                          });
                        }
                        return label;
                      })();

                      if (isCompleted) {
                        return (
                          <>
                            {content}
                            {renderDisciplineIcon(true)}
                            {renderCompletedCheckmark()}
                          </>
                        );
                      }

                      return (
                        <>
                          {content}
                          {renderDisciplineIcon(false)}
                        </>
                      );
                    };
                    
                    return (
                      isDone ? (
                        <span
                          key={`${key}-${i}`}
                          role="button"
                          tabIndex={0}
                          draggable={isPlanned && !!workoutId}
                          onDragStart={(e) => isPlanned && workoutId && handleDragStart(e, evt._src)}
                          onDragEnd={handleDragEnd}
                          onClick={(e)=>{ e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} }}
                          onKeyDown={(e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} } }}
                          className={`text-xs px-2 py-[0.38rem] flex-shrink-0 transition-all font-medium tracking-normal ${phosphorPill.className} ${isPlanned && workoutId ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                          style={{
                            ...phosphorPill.style,
                            // Stamp > pill: squarer corners + slightly “pressed” feel
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            lineHeight: '1.24',
                            // A: grey ink fill with a colored rim (no “power-up” glow)
                            // White denotes completed
                            color: 'rgba(245,245,245,0.92)',
                            textShadow: `0 1px 1px rgba(0,0,0,0.75)`,
                            backdropFilter: 'blur(2px)',
                            WebkitBackdropFilter: 'blur(2px)',
                            // Darker “ink” bed so completed reads quieter
                            backgroundColor: 'rgba(8, 8, 8, 0.72)',
                            backgroundImage: `
                              linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%),
                              radial-gradient(80% 90% at 35% 25%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.00) 60%),
                              radial-gradient(90% 120% at 70% 120%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.00) 60%),
                              /* subtle grain (non-lane) */
                              repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 1px, rgba(255,255,255,0.0) 1px, rgba(255,255,255,0.0) 22px)
                            `,
                            backgroundBlendMode: 'screen, normal, multiply, soft-light',
                            backgroundClip: 'padding-box',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            boxShadow: `
                              0 0 0 1px rgba(255,255,255,0.10) inset,
                              0 0 0 2px rgba(0,0,0,0.24) inset,
                              0 2px 8px rgba(0,0,0,0.42)
                            `.replace(/\s+/g,' ').trim(),
                            whiteSpace: 'nowrap',
                            transform: 'translateZ(0)',
                          }}
                        >
                          {renderLabel()}
                        </span>
                      ) : (
                        <span
                          key={`${key}-${i}`}
                          role="button"
                          tabIndex={0}
                          draggable={isPlanned && !!workoutId}
                          onDragStart={(e) => isPlanned && workoutId && handleDragStart(e, evt._src)}
                          onDragEnd={handleDragEnd}
                          onClick={(e)=>{ e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} }}
                          onKeyDown={(e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); e.stopPropagation(); try { onEditEffort && evt?._src && onEditEffort(evt._src); } catch {} } }}
                          // Non-completed returns to a pill, but keep it calm: low fill, low glow.
                          className={`text-xs px-2 py-[0.38rem] flex-shrink-0 transition-all font-medium tracking-normal ${phosphorPill.className} ${isPlanned && workoutId ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                          style={{
                            ...phosphorPill.style,
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            lineHeight: '1.24',
                            // Calm, readable capsule (no “note” shine)
                            backgroundImage: `
                              linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 100%),
                              radial-gradient(90% 110% at 30% 20%, rgba(${pillRgb},0.10) 0%, rgba(${pillRgb},0.00) 58%),
                              radial-gradient(100% 120% at 70% 120%, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.00) 60%)
                            `,
                            backgroundBlendMode: 'screen, normal, multiply',
                            backdropFilter: 'blur(2px)',
                            WebkitBackdropFilter: 'blur(2px)',
                            // Planned/upcoming uses discipline color in the text; rim stays subtle
                            border: `1px solid rgba(${pillRgb}, 0.18)`,
                            boxShadow: `
                              0 0 0 1px rgba(255,255,255,0.06) inset,
                              0 2px 8px rgba(0,0,0,0.35)
                            `.replace(/\s+/g,' ').trim(),
                            color: getDisciplinePhosphorCore(workoutType),
                            textShadow: `0 1px 1px rgba(0,0,0,0.60)`,
                            whiteSpace: 'nowrap',
                            transform: 'translateZ(0)',
                          }}
                        >
                          {renderLabel()}
                        </span>
                      )
                    );
                  })
                )}
                
                
                {items.length === 0 && loadingDebounced && (
                  <>
                    <span className="h-[18px] rounded w-full bg-white/[0.03]" />
                    <span className="h-[18px] rounded w-3/4 bg-white/[0.03]" />
                  </>
                )}
                {items.length === 0 && !loadingDebounced && (() => {
                  const isRestDay = trainingPlanContext;
                  if (isRestDay) {
                    return (
                      <span className="text-xs italic" style={{ color: 'rgba(255, 255, 255, 0.2)' }}>Rest</span>
                    );
                  }
                  return null;
                })()}
              </div>
            </button>
          );
        })}
      </div>
        
      {/* Total Workload - Flex sibling that fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {(() => {
          // Collect all metrics
          const metrics: Array<{ label: string; value: string }> = [];
          
          // Distance Totals - server-provided
          if (weeklyStats.distances) {
            if (weeklyStats.distances.run_meters > 0) {
              const runValue = useImperial 
                ? `${(weeklyStats.distances.run_meters / 1609.34).toFixed(1)} mi`
                : `${(weeklyStats.distances.run_meters / 1000).toFixed(1)} km`;
              metrics.push({
                label: 'Run:',
                value: runValue,
                isNumeric: true
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
            const strengthValue = `${totalVolumeLoad.toLocaleString()} ${useImperial ? 'lb' : 'kg'}`;
            metrics.push({
              label: 'Strength:',
              value: strengthValue,
              isNumeric: true
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
          
          // Total Workout Hours
          let totalWorkoutMinutes = 0;
          for (const item of unifiedItems) {
            const type = String(item?.type || '').toLowerCase();
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
          
          // Mobile fit: keep this block compact so Home doesn't require scrolling
          const compactMetrics = metrics.filter((m) => {
            const label = String(m?.label || '').toLowerCase();
            return (
              label.includes('run') ||
              label.includes('swim') ||
              label.includes('bike') ||
              label.includes('strength') ||
              label.includes('total')
            );
          });

          return (
            // Let the footer absorb extra height so swim/bike lines can fit,
            // while keeping day row sizing unchanged.
            <div className="pt-3 pb-4 border-t border-white/10 flex flex-col justify-end" style={{ height: '100%' }}>
              {/* Spacer to push content down */}
              <div className="flex-1" />
              
              <div className="space-y-3" style={{ fontSize: '0.875rem' }}>
                {/* Total Workload header */}
                <div 
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg flex-wrap"
                  style={{
                    background: 'radial-gradient(ellipse at center top, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.25) 100%)',
                    border: '0.5px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  <span className="font-light tracking-normal" style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.9rem' }}>Total Workload</span>
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
                        <Info className="w-3 h-3 cursor-pointer" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
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
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255, 255, 255, 0.6)' }} aria-hidden />
                    <span className="text-[0.7rem] font-light" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Planned</span>
                    <span className="tabular-nums" style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.875rem' }}>{weeklyStats.planned}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255, 255, 255, 0.6)' }} aria-hidden />
                    <span className="text-[0.7rem] font-light" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Done</span>
                    <span className="tabular-nums" style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.875rem' }}>{weeklyStats.completed}</span>
                  </div>
                </div>
                
                {/* All Metrics - label and value next to each other */}
                {compactMetrics.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {compactMetrics.map((metric, index) => {
                      const labelLower = String(metric.label || '').toLowerCase();
                      let disciplineType = '';
                      if (labelLower.includes('run')) disciplineType = 'run';
                      else if (labelLower.includes('strength')) disciplineType = 'strength';
                      else if (labelLower.includes('swim')) disciplineType = 'swim';
                      else if (labelLower.includes('bike')) disciplineType = 'bike';
                      else if (labelLower.includes('pilates') || labelLower.includes('yoga') || labelLower.includes('mobility')) disciplineType = 'mobility';
                      
                      const labelColor = disciplineType ? getDisciplinePhosphorCore(disciplineType) : 'rgba(255, 255, 255, 0.9)';
                      
                      return (
                        <div key={index} className="flex items-center gap-2 min-w-0">
                          <span className="font-light leading-tight" style={{ color: labelColor, fontSize: '0.875rem' }}>
                            {metric.label}
                          </span>
                          <span 
                            className="font-light tabular-nums leading-tight"
                            style={{
                              color: 'rgba(255, 255, 255, 0.85)',
                              fontSize: '0.875rem'
                            }}
                          >
                            {metric.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
      
      {/* Hidden background prefetchers */}
      {prefetchNeighbors && (
        <>
          {/* Prefetch disabled for performance */}
        </>
      )}

      {/* Validation Popup */}
      {showValidationPopup && validationResult && reschedulePending && (
        <RescheduleValidationPopup
          workoutId={reschedulePending.workoutId}
          workoutName={reschedulePending.workoutName}
          oldDate={reschedulePending.oldDate}
          newDate={reschedulePending.newDate}
          validation={validationResult}
          onConfirm={handleConfirmReschedule}
          onCancel={handleCancelReschedule}
          onSuggestionClick={handleSuggestionClick}
        />
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