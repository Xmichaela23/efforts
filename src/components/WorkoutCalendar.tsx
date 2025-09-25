import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
// import { generateWorkoutDisplay } from '../utils/workoutCodes';
import { normalizeDistanceMiles, formatMilesShort, typeAbbrev } from '@/lib/utils';
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { useWorkoutsRange } from '@/hooks/useWorkoutsRange';

export type CalendarEvent = {
  date: string | Date;
  label: string;
  href?: string;
  provider?: string;
};
// Background prefetcher: warms unified week cache without rendering
function WeekPrefetcher({ fromISO, toISO }: { fromISO: string; toISO: string }) {
  useWeekUnified(fromISO, toISO);
  return null;
}

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

// Cache the computed Week 1 Monday anchor per plan to avoid repeated reads
const planStartMondayCache = new Map<string, string>(); // planId -> ISO (YYYY-MM-DD)
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
  // Backstop: legacy completed workouts (temporary until unified feed is fully reliable)
  const { rows: legacyWorkouts = [], loading: legacyLoading } = useWorkoutsRange(fromISO, toISO);
  // Adapt unified items → planned + workouts shapes expected below
  const unifiedPlanned = unifiedItems.filter((it:any)=> !!it?.planned).map((it:any)=> ({
    id: it.id,
    date: it.date,
    type: it.type,
    workout_status: it.status || 'planned',
    // Map planned_data fields expected by label derivation
    computed: (it.planned && Array.isArray(it.planned.steps)) ? { steps: it.planned.steps, total_duration_seconds: it.planned.total_duration_seconds } : (it.planned || null),
    total_duration_seconds: it.planned?.total_duration_seconds || null,
    description: it.planned?.description || null,
    tags: it.planned?.tags || null,
  }));
  const unifiedWorkouts = unifiedItems.map((it:any)=> ({
    id: it.id,
    date: it.date,
    type: it.type,
    workout_status: (String(it?.status||'').toLowerCase()==='completed') ? 'completed' : 'planned',
    // Provide distance in km if available from executed.overall so labels can render
    distance: (it?.executed?.overall?.distance_m && typeof it.executed.overall.distance_m === 'number')
      ? (it.executed.overall.distance_m / 1000)
      : undefined,
    // keep shape minimal; calendar only uses status, date, type, maybe planned_id
  }));

  const legacyCompleted = Array.isArray(legacyWorkouts)
    ? legacyWorkouts.filter((w:any)=> String(w?.workout_status||'').toLowerCase()==='completed').map((w:any)=> ({
        id: w.id,
        date: w.date,
        type: w.type,
        workout_status: 'completed',
        distance: (typeof (w as any)?.distance === 'number' ? (w as any).distance : undefined),
      }))
    : [];

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
        legacyCompleted: legacyCompleted?.length || 0,
        samplePlanned: unifiedPlanned?.[0] || null,
        sampleCompleted: unifiedWorkouts?.[0] || null,
      });
    } catch {}
  }

  const plannedWeekRows = unifiedPlanned;
  const workoutsWeekRows = [...unifiedWorkouts, ...legacyCompleted];
  const plannedLoading = unifiedLoading;
  const workoutsLoading = unifiedLoading;

  // Debounced loading indicator to avoid flicker on fast responses
  const [loadingDebounced, setLoadingDebounced] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const hasItems = (Array.isArray(unifiedItems) && unifiedItems.length>0) || (Array.isArray(legacyCompleted) && legacyCompleted.length>0);
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

  // Auto-materialize the visible week once on first load if the week is entirely empty and a plan exists
  const [materializeTriedISO, setMaterializeTriedISO] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        if (!currentPlans || currentPlans.length === 0) return;
        if (!fromISO) return;
        if (materializeTriedISO === fromISO) return;
        // Only consider materialization when the unified query completed without errors
        if (unifiedLoading || unifiedError) return;
        const emptyWeek = (!Array.isArray(unifiedItems) || unifiedItems.length === 0);
        if (!emptyWeek) return;
        setMaterializeTriedISO(fromISO);
        await ensureWeekForDate(weekStart);
      } catch {}
    })();
  }, [fromISO, weekStart.getTime(), Array.isArray(unifiedItems)?unifiedItems.length:0, unifiedLoading, unifiedError, currentPlans?.[0]?.id]);

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
    // Identify planned rows explicitly linked to a completed workout (authoritative association)
    const plannedArr = Array.isArray(planned) ? (planned as any[]) : [];
    const linkedCompletedIds = new Set(
      plannedArr
        .map((p: any) => p?.completed_workout_id)
        .filter((id: any) => id != null)
        .map((id: any) => String(id))
    );
    // Also consider workouts that point to a planned_id as linked completions
    const workoutIdByPlannedId = new Map<string, string>();
    for (const w of wkDb) {
      try {
        if (String(w?.workout_status||'').toLowerCase()==='completed' && (w as any)?.planned_id) {
          const pid = String((w as any).planned_id);
          workoutIdByPlannedId.set(pid, String((w as any).id));
          linkedCompletedIds.add(String((w as any).id));
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
    // Planned rows considered completed if linked via either side OR marked completed
    const completedPlannedKeys = new Set(
      plannedArr
        .filter((p: any) => p?.completed_workout_id || workoutIdByPlannedId.has(String(p?.id)) || String(p?.workout_status || '').toLowerCase() === 'completed')
        .map((p: any) => `${String(p.date)}|${String(p.type || '').toLowerCase()}`)
    );

    // Do not suppress workouts based on date/type; rely on explicit links and later de-dupe
    const wkCombinedFiltered = [...wkCombined];
    // Normalize planned statuses:
    // - If a planned row links to a completed workout (either side), force completed ✓
    const mappedPlanned = (planned as any[]).map((p:any)=>{
      if (p?.completed_workout_id || workoutIdByPlannedId.has(String(p?.id))) {
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
        if ((w as any)?.completed_workout_id) return false;
        if (workoutIdByPlannedId.has(String((w as any).id))) return false;
        // Heuristic: if a completed workout exists on the same date and type, suppress the planned row
        const keyDT = `${String((w as any).date)}|${String((w as any).type||'').toLowerCase()}`;
        if (completedWorkoutKeys.has(keyDT)) return false;
      }
      return true;
    });

    // Build raw events with consistent labels (no collapsing; show all entries)
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
        const isCompleted = String(w?.workout_status||'').toLowerCase()==='completed';
        const isPlannedLinked = isCompleted && !!(w as any)?.planned_id;
        return {
          date: w.date,
          label: `${labelBase}${isCompleted ? (isPlannedLinked ? ' P✓' : ' ✓') : ''}`,
          href: `#${w.id}`,
          provider: w.provider || deriveProvider(w),
          _sigType: t,
          _sigMiles: miles != null ? Math.round(miles * 10) / 10 : -1, // 1dp signature
          _src: w,
        } as any;
      });

    // Return raw list; we intentionally show all entries (no collapsing)
    return raw.map(ev => ({ date: ev.date, label: ev.label, href: ev.href, provider: ev.provider }));
  }, [workouts, plannedWorkouts, plannedWeekRows, workoutsWeekRows, fromISO, toISO]);

  const handleDayClick = async (day: Date) => {
    const dateStr = toDateOnlyString(day);
    // On any day click, ensure that week is materialized, then invalidate caches
    try { void ensureWeekForDate(day); } catch {}
    if (onDateSelect) onDateSelect(dateStr);
  };

  const handlePrevWeek = async (newRef: Date) => {
    setReferenceDate(newRef);
  };

  const handleNextWeek = async (newRef: Date) => {
    setReferenceDate(newRef);
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
      const planId = String(activePlan.id);

      // Resolve start Monday for Week 1 using cache → DB probe → plan config fallback
      let startMondayISO = planStartMondayCache.get(planId) || '';
      if (!startMondayISO) {
        try {
          const { data: w1 } = await supabase
            .from('planned_workouts')
            .select('date, day_number')
            .eq('training_plan_id', planId)
            .eq('week_number', 1)
            .order('day_number', { ascending: true })
            .limit(1);
          if (Array.isArray(w1) && w1.length > 0) {
            const anchor = w1[0] as any;
            const w1Start = computeWeek1Start(String(anchor.date), Number(anchor.day_number));
            startMondayISO = toDateOnlyString(w1Start);
          }
        } catch {}
      }
      if (!startMondayISO) {
        try {
          const { data: planRow } = await supabase
            .from('plans')
            .select('config')
            .eq('id', planId)
            .maybeSingle();
          const sel = String((planRow as any)?.config?.user_selected_start_date || '').slice(0, 10);
          if (sel) {
            const parts = sel.split('-').map((x) => parseInt(x, 10));
            const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
            startMondayISO = toDateOnlyString(startOfWeek(base));
          }
        } catch {}
      }
      if (!startMondayISO) startMondayISO = toDateOnlyString(startOfWeek(new Date()));
      planStartMondayCache.set(planId, startMondayISO);

      const tgtStart = startOfWeek(d);
      const diffDays = Math.round((resolveDate(toDateOnlyString(tgtStart)).getTime() - resolveDate(startMondayISO).getTime()) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);

      // Robust existence check to avoid duplicate materialization on weak count responses
      let needsMaterialize = false;
      try {
        const q = await supabase
          .from('planned_workouts')
          .select('id', { count: 'exact', head: true } as any)
          .eq('training_plan_id', planId)
          .eq('week_number', weekNumber);
        const cnt = (q as any)?.count;
        if (typeof cnt === 'number') {
          needsMaterialize = cnt === 0;
        } else {
          // Fallback probe without head: read one row to determine existence
          const probe = await supabase
            .from('planned_workouts')
            .select('id')
            .eq('training_plan_id', planId)
            .eq('week_number', weekNumber)
            .limit(1);
          const rows = Array.isArray((probe as any)?.data) ? (probe as any).data : [];
          needsMaterialize = rows.length === 0;
        }
      } catch { needsMaterialize = false; /* on error, do not materialize blindly */ }

      if (needsMaterialize) {
        try {
          const mod = await import('@/services/plans/ensureWeekMaterialized');
          await mod.ensureWeekMaterialized(planId, weekNumber);
          try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
        } catch {}
      }

      // Background pre-materialize neighbor weeks (only if missing)
      const neighborWeeks = [weekNumber - 1, weekNumber + 1].filter((n) => n >= 1);
      for (const nw of neighborWeeks) {
        setTimeout(async () => {
          try {
            const q = await supabase
              .from('planned_workouts')
              .select('id', { count: 'exact', head: true } as any)
              .eq('training_plan_id', planId)
              .eq('week_number', nw);
            const cnt = (q as any)?.count ?? 0;
            if (!(Number.isFinite(cnt) && cnt > 0)) {
              const mod = await import('@/services/plans/ensureWeekMaterialized');
              await mod.ensureWeekMaterialized(planId, nw);
              try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
            }
          } catch {}
        }, 50);
      }
    } catch {}
  };

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
                {items.length > 0 && (
                  items.map((evt, i) => (
                    <span key={`${key}-${i}`} className="text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded w-full text-center truncate">
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
      {/* Hidden background prefetchers */}
      {prefetchNeighbors && (
        <>
          {(() => {
            const prevStartISO = toDateOnlyString(addDays(weekStart, -7));
            const prevEndISO = toDateOnlyString(addDays(weekStart, -1));
            return <WeekPrefetcher fromISO={prevStartISO} toISO={prevEndISO} />;
          })()}
          {(() => {
            const nextStartISO = toDateOnlyString(addDays(weekEnd, 1));
            const nextEndISO = toDateOnlyString(addDays(weekEnd, 7));
            return <WeekPrefetcher fromISO={nextStartISO} toISO={nextEndISO} />;
          })()}
        </>
      )}
    </div>
  );
}