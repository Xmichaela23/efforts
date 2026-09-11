import FirstRunOverlay from '@/components/FirstRunOverlay';
import FirstRunCard from '@/components/FirstRunCard';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { analysisNeedsAttention, analysisFailureLine } from '@/lib/analysis-state';
import { useWeather } from '@/hooks/useWeather';
import { useAppContext } from '@/contexts/AppContext';
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { Calendar, Clock, Dumbbell, Activity, X, Copy, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildFormGogglesSwimScript } from '@/utils/formGogglesSwimScript';
// ⛔ SAME RULE AS THE CALENDAR AND THE WORKOUT VIEW — one definition of "missed a planned slot".
import { isUnmatchedAgainstPlan } from '@/lib/associate-candidates';
// ⛔ THE SWAP IS THE SERVER'S (2026-09-10, audit H-T15). `swap-session` sends which swaps a session
// offers, with the words each shows, and writes the tap; this file renders the sheet and posts it.
import { useSwapSheet, useSportSwapIds, postSwap, type SwapSheetOption } from '@/hooks/useSwapSheet';
import { formatSwimPace } from '@/utils/workoutFormatting';
import { getDisciplineColor, getDisciplinePillClasses, getDisciplineCheckmarkColor, isBaselineTestWorkout, displayDisciplineOf } from '@/lib/utils';
import { getDisciplineGlowColor, getDisciplineTextClass, SPORT_COLORS, getDisciplineColorRgb, getDisciplineGlowStyle, getDisciplinePhosphorPill, getDisciplinePhosphorCore, formZoneColor } from '@/lib/context-utils';
import { LoadKeyForm } from './LoadBar';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
// ⛔ ONE SWAP PREDICATE, shared by all three surfaces.
import { swappedStructureIsStale } from '@/lib/session-discipline-swap';
// ⛔ ONE PLANNED-SESSION HEADER, shared by all three surfaces. See the component.
import PlannedSessionHeader, { plannedDurationSecondsOf } from './PlannedSessionHeader';
// ⛔ TODAY'S LINES (work order 2026-09-09 §2) — what each set is FOR, under the row that says what
// it is. Every athlete-facing word lives in `@/lib/today-lines`; nothing new is spelled out here.
// ⛔ §3d — a lift and the plyo day swipe as a deck, a ride or run is one glass card.
import TodaySession, { rendersAsSessionCard, TodaySpacingLine } from './SessionDeck';
import { getProviderAttribution } from '@/lib/provider-attribution';
import { GarminDerivedDataLine, ProviderAttributionLine } from './ProviderAttribution';
import { useGarminDataPresence } from '@/hooks/useGarminDataPresence';
import type { CardEmphasis } from './CardDeck';
// ⛔ §3b — the weather block above the date, and the week's load bars + counts under the day.
import TodayWeather from './TodayWeather';
// ⛔ ONE PLANNED-DURATION READER (stage 2). See `src/lib/planned-session/duration.ts`.
import { normalizePlannedSession } from '@/services/plans/normalizer';
import WorkoutExecutionView from './WorkoutExecutionView';
import PlannedWorkoutSummary from './PlannedWorkoutSummary';
import { WorkoutExecutionContainer } from './workout-execution';
import { mapUnifiedItemToCompleted } from '@/utils/workout-mappers';
import { useToast } from '@/components/ui/use-toast';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer';
import { isWatchConnectivityAvailable } from '@/services/watchConnectivity';
import { isWorkoutKitAvailable, scheduleSwimOnWatch, buildSwimPayloadFromWorkout } from '@/services/workoutkit';
import SkipSessionReasonPanel from '@/components/planned/SkipSessionReasonPanel';
import { skipReasonLabel } from '@/lib/skip-session-reasons';
import { useNavigate } from 'react-router-dom';
import { fetchArcContext } from '@/lib/fetch-arc-context';
import type { ArcContextPayload } from '@/lib/fetch-arc-context';
import { buildArcLine, arcLineNeedsGoalsSetup, type ArcForHomeLine } from '@/lib/build-arc-line';
import { invalidateWorkoutScreens } from '@/utils/invalidateWorkoutScreens';

// Component for expandable workout cards with fixed height
const WorkoutCardExpandable: React.FC<{
  workout: any;
  workoutType: string;
  baselines: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  getDisciplinePhosphorCore: (type: string) => string;
}> = ({ workout, workoutType, baselines, isExpanded, onToggleExpand, getDisciplinePhosphorCore }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  
  // Check if content exceeds fixed height
  useEffect(() => {
    if (contentRef.current && !isExpanded) {
      // Use a small delay to ensure content is rendered
      setTimeout(() => {
        if (contentRef.current) {
          const scrollHeight = contentRef.current.scrollHeight;
          const clientHeight = contentRef.current.clientHeight;
          setNeedsExpansion(scrollHeight > clientHeight + 5); // 5px tolerance
        }
      }, 100);
    } else {
      setNeedsExpansion(false);
    }
  }, [isExpanded, workout]);
  
  return (
    <div className="space-y-1">
      <div
        ref={contentRef}
        style={{
          maxHeight: isExpanded ? 'none' : '120px', // Fixed height when collapsed
          overflow: isExpanded ? 'visible' : 'hidden',
          position: 'relative',
          transition: 'max-height 0.3s ease-out',
        }}
      >
        <PlannedWorkoutSummary workout={workout} baselines={baselines} hideLines={false} />
        {/* Fade gradient when collapsed and content overflows */}
        {!isExpanded && needsExpansion && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '40px',
              background: 'linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.9))',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      {(needsExpansion || isExpanded) && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpand();
          }}
          className="text-xs font-light mt-1 w-full text-left"
          style={{ 
            color: getDisciplinePhosphorCore(workoutType),
            opacity: 0.7,
            cursor: 'pointer',
          }}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
};

interface TodaysEffortProps {
  selectedDate?: string;
  onAddEffort: (type: string, date?: string) => void;
  onViewCompleted: () => void;
  onEditEffort?: (workout: any) => void;
}

const TodaysEffort: React.FC<TodaysEffortProps> = ({ 
  selectedDate, 
  onAddEffort, 
  onViewCompleted, 
  onEditEffort 
}) => {
  const navigate = useNavigate();
  const { useImperial, workouts, loading, loadUserBaselines, detailedPlans } = useAppContext();

  /**
   * Connection health (docs/WORKORDER-plumbing-2026-09-07.md §4): the providers whose stored token
   * the server has marked needs_reauth. One line under Today while it is so; tapping it leaves for
   * Connections. RLS limits both tables to the athlete's own rows; a missing `health` column (the
   * migration not yet pasted) answers 400 and reads as nothing to say.
   */
  const [reauthProviders, setReauthProviders] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [uc, dc] = await Promise.all([
          supabase.from('user_connections').select('provider,health').eq('health', 'needs_reauth'),
          supabase.from('device_connections').select('provider,health').eq('health', 'needs_reauth'),
        ]);
        const rows = [...(uc.data || []), ...(dc.data || [])] as Array<{ provider?: string }>;
        const names = Array.from(new Set(rows.map((r) => String(r?.provider || '').toLowerCase()).filter(Boolean)));
        if (!cancelled) setReauthProviders(names);
      } catch {
        if (!cancelled) setReauthProviders([]);
      }
    };
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  const reauthLine = (() => {
    if (!reauthProviders.length) return null;
    const label = (p: string) => (p === 'garmin' ? 'Garmin' : p === 'strava' ? 'Strava' : p);
    const names = reauthProviders.map(label);
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `${who} ${names.length === 1 ? 'needs' : 'need'} reconnecting ›`;
  })();
  const [homeArc, setHomeArc] = useState<ArcContextPayload | null>(null);
  const [homeArcReady, setHomeArcReady] = useState(false);
  const [displayWorkouts, setDisplayWorkouts] = useState<any[]>([]);
  /** §3g — the form number's only source. Same payload `LoadBar` reads on State. */
  const coachWeek = useCoachWeekContext();
  /**
   * docs/WORKORDER-garmin-strava-attribution-2026-09-09.md §3 — the form number is DERIVED from
   * Garmin device-sourced rows, so the header block carries Garmin's derived-data line under it
   * (Garmin API Brand Guidelines v6.30.2025). Only with a Garmin connection or a Garmin row in the
   * loaded window, and only under a form line — with no number there is nothing derived to attribute.
   */
  const garminDerived = useGarminDataPresence();
  const [baselines, setBaselines] = useState<any | null>(null);
  const [dayLoc, setDayLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locTried, setLocTried] = useState(false);
  const [cityName, setCityName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /**
   * ⛔ §3d — the grid drifts against the scroll and the bleed follows the session in view. Both are
   * read off ONE scroll listener (below): a second listener on the same element is a second thing
   * running on every frame of a drag.
   * ⚠️ `sessionInView` IS AN INDEX INTO `displayWorkouts`, resolved from which session card is
   * nearest the top of the panel. 0 until the athlete scrolls, so the screen opens on the day's
   * first session exactly as §3b.4 left it.
   */
  const [parallax, setParallax] = useState(0);
  const [sessionInView, setSessionInView] = useState(0);
  const sessionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [selectedPlannedWorkout, setSelectedPlannedWorkout] = useState<any | null>(null);
  const [executingWorkout, setExecutingWorkout] = useState<any | null>(null);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [skippingSession, setSkippingSession] = useState(false);
  const [plannedDrawerStep, setPlannedDrawerStep] = useState<'detail' | 'skip' | 'swap'>('detail');
  const [swappingSession, setSwappingSession] = useState(false);
  /**
   * ⛔ THE SWAP'S SCOPE (work order 2026-09-09 §6) — the same Just today / Rest of plan the lift
   * swap offers. ⚠️ IT RESETS TO "just today" EVERY TIME THE SHEET OPENS: rewriting the rest of
   * a plan is not a setting to inherit from the last session the athlete happened to change.
   */
  const [swapRestOfPlan, setSwapRestOfPlan] = useState(false);
  // The open session's sheet, as `swap-session` sends it.
  const swapSheet = useSwapSheet(selectedPlannedWorkout?.id ? String(selectedPlannedWorkout.id) : null);
  const [dismissedNotes, setDismissedNotes] = useState<Set<string>>(new Set());
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedPlannedWorkout) setPlannedDrawerStep('detail');
  }, [selectedPlannedWorkout]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await fetchArcContext();
        if (!cancelled) {
          setHomeArc(a);
          setHomeArcReady(true);
        }
      } catch {
        if (!cancelled) {
          setHomeArc(null);
          setHomeArcReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const arcLineText = useMemo(
    () => (homeArcReady ? buildArcLine(homeArc as ArcForHomeLine) : ''),
    [homeArcReady, homeArc]
  );
  const arcNeedsGoals = useMemo(() => arcLineNeedsGoalsSetup(homeArc as ArcForHomeLine), [homeArc]);

  /**
   * ⛔ THE BLOCK LABEL, RIGHT-ALIGNED ON THE DATE LINE (Michael, 2026-09-09). It is the FIRST
   * segment of the arc line — "Build block", "Recovery", "Base" — which used to have a row of its
   * own under the date. ⚠️ THE STRING IS NOT REBUILT HERE: it is `buildArcLine`'s output, cut at the
   * separator that line already uses, so the label and the sentence cannot drift.
   * ⚠️ NOT WHEN THE ARC LINE IS THE SEASON CTA — that one is a door and keeps its own row.
   */
  const blockLabel = useMemo(() => {
    if (!homeArcReady || !arcLineText || arcNeedsGoals) return null;
    const head = arcLineText.split('·')[0]?.trim();
    return head || null;
  }, [homeArcReady, arcLineText, arcNeedsGoals]);


  // Use local timezone to derive YYYY-MM-DD as seen by the user
  const today = new Date().toLocaleDateString('en-CA');
  const activeDate = selectedDate || today;

  // Helper functions for week calculation
  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setHours(0, 0, 0, 0);
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    return d;
  };

  const addDays = (date: Date, n: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  };

  const toDateOnlyString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // Calculate week range for training plan context (needs week range to work properly)
  const activeDateObj = new Date(activeDate + 'T12:00:00');
  const weekStart = startOfWeek(activeDateObj);
  const weekEnd = addDays(weekStart, 6);
  const fromISO = toDateOnlyString(weekStart);
  const toISO = toDateOnlyString(weekEnd);

  // Format week range for "Week of" header
  const formatWeekRange = (start: Date, end: Date) => {
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    
    if (sameMonth && sameYear) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}`;
    } else if (sameYear) {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
    } else {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
    }
  };

  /**
   * ⛔ DAY NAVIGATION ON THE DATE LINE (Michael, 2026-09-09) — a chevron each side and a horizontal
   * swipe, one day at a time, past or future with no stops. ⚠️ IT REUSES `week:navigate`: that event
   * means "make this the active date", which is exactly what this asks for, and a second event doing
   * the same thing to the same state is how two navigations start disagreeing. Only its NAME is
   * about weeks, and renaming it would touch the calendar for nothing.
   */
  const handleDayNav = (direction: 'prev' | 'next') => {
    const next = addDays(new Date(activeDate + 'T12:00:00'), direction === 'prev' ? -1 : 1);
    window.dispatchEvent(new CustomEvent('week:navigate', { detail: { date: toDateOnlyString(next) } }));
  };

  /**
   * ⛔ THE SWIPE IS THE DATE LINE'S AND STOPS THERE. The decks below run their own pointer handlers,
   * so a gesture that starts here must not travel — `stopPropagation` on every phase, and
   * `touchAction: 'pan-y'` so a vertical scroll still scrolls rather than being eaten.
   */
  const dateSwipe = useRef<{ x: number; moved: number } | null>(null);

  const handleWeekNav = (direction: 'prev' | 'next') => {
    const newDate = direction === 'prev' 
      ? addDays(weekStart, -7) 
      : addDays(weekEnd, 1);
    // Dispatch event for AppLayout to update selectedDate
    window.dispatchEvent(new CustomEvent('week:navigate', { detail: { date: toDateOnlyString(newDate) } }));
  };

  // Unified lookup - use week range for training plan context, but filter items to active date
  const { items: allUnifiedItems = [], weeklyStats, loading: unifiedLoading, trainingPlanContext } = useWeekUnified(fromISO, toISO);
  // First card (2026-09-07): an athlete with no plan at all gets two doors in the empty space
  // where a session would sit, instead of a 38%-opacity line that vanishes when one fetch fails.
  // `detailedPlans` is every plan on the account (AppContext), `trainingPlanContext` the week's.
  const noPlanYet = !loading && !unifiedLoading && !trainingPlanContext
    && Object.keys(detailedPlans ?? {}).length === 0;
  
  // ⛔ WHICH OF THE WEEK'S SESSIONS CARRY THE SWAP GLYPH — the server's answer (`swap-session`, 2026-09-10).
  const weekPlannedIds = useMemo(
    () => (Array.isArray(allUnifiedItems) ? allUnifiedItems : [])
      .map((it: any) => it?.planned_workout?.id)
      .filter(Boolean)
      .map(String),
    [allUnifiedItems],
  );
  const sportSwapIds = useSportSwapIds(weekPlannedIds);

  // Filter to only items for the active date
  const unifiedItems = allUnifiedItems.filter((item: any) => {
    const itemDate = String(item?.date || '').slice(0, 10);
    return itemDate === activeDate;
  });

  // No persistence: we will use ephemeral geolocation below for today's weather
  // Hard fetch of sets for today's completed strength if missing (dev-time only)
  useEffect(() => {
    (async () => {
      try {
        const todayStrength = (Array.isArray(unifiedItems) ? unifiedItems : []).find((it:any)=> String(it?.date).slice(0,10)===activeDate && String(it?.type||'').toLowerCase()==='strength' && String(it?.status||'').toLowerCase()==='completed');
        if (!todayStrength) return;
        const hasSets = Array.isArray(todayStrength?.executed?.strength_exercises) && todayStrength.executed.strength_exercises.length>0;
        if (hasSets) return;
        const { data } = await supabase.from('workouts').select('id,strength_exercises').eq('id', String(todayStrength.id)).maybeSingle();
        if (data && Array.isArray((data as any).strength_exercises)) {
          try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
        }
      } catch {}
    })();
  }, [unifiedItems, activeDate]);

  // Only fetch weather for today (we don't have historical weather data)
  const isTodayDate = activeDate === today;
  const { weather, heatNote } = useWeather({
    lat: dayLoc?.lat,
    lng: dayLoc?.lng,
    timestamp: `${activeDate}T12:00:00`,
    enabled: !!dayLoc && isTodayDate, // Only enable for today
  });

  const { toast } = useToast();
  
  // Expanded details toggle per workout (id → boolean)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sendingToGarmin, setSendingToGarmin] = useState<string | null>(null);
  // Bottom-sheet swim controls (D-165): pool selector + Copy-for-FORM, matching the Planned tab.
  const [savingPool, setSavingPool] = useState(false);
  const [localPlannedPool, setLocalPlannedPool] = useState<{ lengthM: number } | null>(null);

  // Pool choices (metres; matches the post-workout feedback popup so the prefill lines up).
  const POOL_CHOICES = [
    { value: '25yd', label: '25 yd', unit: 'yd' as const, meters: 22.86 },
    { value: '25m', label: '25 m', unit: 'm' as const, meters: 25 },
    { value: '50m', label: '50 m', unit: 'm' as const, meters: 50 },
  ];

  // Set the pool on the PLANNED swim → flows to the post-workout feedback prefill (PostWorkoutFeedback
  // reads the linked planned pool). Writes both columns the resolver/analyzer read.
  const setPlannedPool = async (choice: { unit: 'yd' | 'm'; meters: number }) => {
    if (!selectedPlannedWorkout?.id) return;
    try {
      setSavingPool(true);
      await supabase
        .from('planned_workouts')
        .update({ pool_unit: choice.unit, pool_length_m: choice.meters, plan_pool_length_m: choice.meters } as any)
        .eq('id', selectedPlannedWorkout.id);
      setLocalPlannedPool({ lengthM: choice.meters });
      try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch { /* */ }
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch { /* */ }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to save pool length', variant: 'destructive' });
    } finally {
      setSavingPool(false);
    }
  };

  // Copy-for-FORM-Goggles — same script + UX as the Planned tab (StructuredPlannedView).
  const handleCopyFormGoggles = async () => {
    const script = buildFormGogglesSwimScript(selectedPlannedWorkout);
    if (!script) {
      toast({ title: 'Nothing to copy', description: 'This swim needs materialized steps. Try after the plan is activated.', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(script);
      toast({ title: 'Copied for FORM Goggles', description: 'FORM → Custom Workouts → Create From Text, then paste.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Allow clipboard access for this site and try again.', variant: 'destructive' });
    }
  };
  const [sendingToWatch, setSendingToWatch] = useState<string | null>(null);
  const [watchAvailable, setWatchAvailable] = useState(false);
  // WorkoutKit (pool-swim "Send to Apple Watch", D-196 item 2) — iOS-native only.
  const [workoutKitAvailable, setWorkoutKitAvailable] = useState(false);

  // Check if Apple Watch is available (on iOS native app)
  useEffect(() => {
    isWatchConnectivityAvailable().then(setWatchAvailable);
    isWorkoutKitAvailable().then(setWorkoutKitAvailable);
  }, []);
  
  // Send workout to Garmin
  const handleSendToGarmin = async (e: React.MouseEvent, workout: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      setSendingToGarmin(workout.id);
      const userId = getStoredUserId();
      if (!userId) {
        toast({ title: 'Error', description: 'Please log in to send to Garmin', variant: 'destructive' });
        return;
      }
      
      const { data: result, error } = await supabase.functions.invoke('send-workout-to-garmin', {
        body: { workoutId: workout.id, userId: userId }
      });
      
      if (error) {
        toast({ title: 'Error', description: `Failed to send: ${error.message}`, variant: 'destructive' });
      } else if (result?.success) {
        toast({ title: 'Sent!', description: 'Workout sent to Garmin' });
      } else {
        toast({ title: 'Error', description: result?.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to send to Garmin', variant: 'destructive' });
    } finally {
      setSendingToGarmin(null);
    }
  };
  
  // Check if workout is endurance type
  const isEnduranceType = (type: string) => {
    const t = (type || '').toLowerCase();
    return ['run', 'ride', 'bike', 'swim', 'cycling'].includes(t);
  };
  
  // Check if workout can be executed on phone (run or ride only for now)
  const isPhoneExecutable = (type: string) => {
    const t = (type || '').toLowerCase();
    return ['run', 'ride', 'bike', 'cycling'].includes(t);
  };

  // Provider + device attribution for completed imports (Strava/Garmin) — LIFTED to
  // src/lib/provider-attribution.ts (docs/WORKORDER-garmin-strava-attribution-2026-09-09.md) so the
  // done card, the Week tab and the drawer read the same answer. `getProviderAttribution` is imported.

  // Compact metrics line for completed endurance workouts (matches the older “detail” cards)
  const getCompactEnduranceMetrics = (w: any): string[] => {
    try {
      const type = String(w?.type || '').toLowerCase();
      const overall = (w as any)?.computed?.overall || (w as any)?.overall || {};
      const distM = Number(overall?.distance_m ?? overall?.distanceMeters ?? overall?.distance_meters);
      // ⛔ THE SERVER'S MOVING TIME (2026-09-10, audit H-D10) — `moving_seconds`, not a ladder over `overall`.
      const durS = Number(w?.moving_seconds);
      const avgHr = Number(overall?.avg_hr ?? w?.avg_heart_rate ?? w?.metrics?.avg_heart_rate);
      const elevM = Number(overall?.elevation_gain_m ?? w?.elevation_gain ?? w?.metrics?.elevation_gain);

      const parts: string[] = [];

      // distance
      if (Number.isFinite(distM) && distM > 0) {
        if (type === 'swim') {
          const yards = Math.round(distM / 0.9144);
          const meters = Math.round(distM);
          parts.push(useImperial ? `${yards.toLocaleString()} yd` : `${meters.toLocaleString()} m`);
        } else {
          parts.push(useImperial ? `${(distM / 1609.34).toFixed(1)} mi` : `${(distM / 1000).toFixed(1)} km`);
        }
      }

      // pace / speed / swim pace
      if (Number.isFinite(durS) && durS > 0 && Number.isFinite(distM) && distM > 0) {
        if (type === 'run' || type === 'walk') {
          const miles = distM / 1609.34;
          const paceMinPerMile = (durS / 60) / miles;
          const mm = Math.floor(paceMinPerMile);
          const ss = Math.round((paceMinPerMile - mm) * 60);
          parts.push(`${mm}:${String(ss).padStart(2, '0')}/mi`);
        } else if (type === 'ride' || type === 'bike' || type === 'cycling') {
          const avgSpeedMps = Number(overall?.avg_speed_mps) || distM / durS;
          if (Number.isFinite(avgSpeedMps) && avgSpeedMps > 0) {
            const mph = avgSpeedMps * 2.237;
            parts.push(`${Math.round(mph * 10) / 10} mph`);
          }
        } else if (type === 'swim') {
          const preferYards = !!useImperial;
          const denom = preferYards ? (distM / 0.9144) / 100 : distM / 100;
          if (denom > 0) {
            const per100 = durS / denom;
            parts.push(`${formatSwimPace(per100)} ${preferYards ? '/100yd' : '/100m'}`);
          }
        }
      }

      // hr
      if (Number.isFinite(avgHr) && avgHr > 0) parts.push(`${Math.round(avgHr)} bpm`);

      // elevation (runs/rides)
      if ((type === 'run' || type === 'walk' || type === 'ride' || type === 'bike' || type === 'cycling') && Number.isFinite(elevM) && elevM > 0) {
        parts.push(useImperial ? `${Math.round(elevM * 3.28084)} ft` : `${Math.round(elevM)} m`);
      }

      return parts.filter(Boolean).slice(0, 4);
    } catch {
      return [];
    }
  };
  
  /**
   * ⛔ THE PHONE SENDS THE TAP (2026-09-10, audit H-T09). `mark-planned-complete` marks the planned row
   * done and, for a run, walk or ride, creates the finished row with the planned session's own length.
   * This used to insert that row here, with a length from the phone's duration reader or 30 minutes
   * when it found none.
   */
  const handleMarkComplete = async (workout: any) => {
    try {
      setMarkingComplete(true);
      const { data, error } = await supabase.functions.invoke('mark-planned-complete', {
        body: { planned_id: workout.id },
      });
      if (error || !data?.success) {
        const detail = (data as { error?: string } | null)?.error || error?.message || 'Unknown error';
        toast({ title: 'Error', description: `Failed to mark as complete: ${detail}`, variant: 'destructive' });
        return;
      }
      toast({ title: 'Workout marked as complete', variant: 'success' });
      setSelectedPlannedWorkout(null);
      // Refresh the view - the RPE popup will appear via realtime subscription
      invalidateWorkoutScreens();
    } catch (err) {
      console.error('Error marking workout as complete:', err);
      toast({ title: 'Error', description: 'Failed to mark workout as complete', variant: 'destructive' });
    } finally {
      setMarkingComplete(false);
    }
  };

  /**
   * ⛔ THE TAP IS POSTED; THE SERVER WRITES (2026-09-10, audit H-T15). `swap-session` re-derives the
   * option from the stored row, writes it (and each later repeat for "Rest of plan"), expands the new
   * sessions through `materialize-plan` and returns the toast's words. This handler used to resolve
   * the patch, write it, expand it and loop the later rows itself.
   *
   * ⚠️ NEVER BLOCKED. A swap with warnings is still applied — the warnings are shown beside the
   * button, not in place of it. That is the guardrail rule: warn, do not gate.
   */
  const handleApplyDisciplineSwap = async (workout: any, option: SwapSheetOption, restOfPlan = false) => {
    const userId = getStoredUserId();
    if (!userId || !workout?.id) {
      toast({ title: 'Error', description: 'Please log in to change a session', variant: 'destructive' });
      return;
    }
    setSwappingSession(true);
    try {
      const { receipt } = await postSwap(String(workout.id), option.id, restOfPlan);
      toast({ title: receipt, variant: 'default' });
      setSelectedPlannedWorkout(null);
      setPlannedDrawerStep('detail');
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
    } catch (err: any) {
      toast({ title: 'Could not swap this session', description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSwappingSession(false);
    }
  };

  const handleApplySkip = async (workout: any, reason: string | null, note: string | null) => {
    const userId = getStoredUserId();
    if (!userId || !workout?.id) {
      toast({ title: 'Error', description: 'Please log in to skip a session', variant: 'destructive' });
      return;
    }
    setSkippingSession(true);
    try {
      const patch = {
        workout_status: 'skipped' as const,
        skip_reason: reason && reason.trim() ? reason.trim() : null,
        skip_note: note && note.trim() ? note.trim() : null,
      };
      const { error } = await supabase.from('planned_workouts').update(patch).eq('id', workout.id).eq('user_id', userId);
      if (error) throw error;
      toast({ title: 'Session skipped', variant: 'default' });
      setSelectedPlannedWorkout(null);
      setPlannedDrawerStep('detail');
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
    } catch (err: any) {
      toast({
        title: 'Could not skip session',
        description: err?.message || 'Try again',
        variant: 'destructive',
      });
    } finally {
      setSkippingSession(false);
    }
  };
  
  // Send to Apple Watch — POOL SWIM ONLY via WorkoutKit (D-196 item 2).
  // On-device: builds the payload from computed.steps + pool length/unit and
  // schedules a CustomWorkout via the native WorkoutKit plugin. No edge fn, no userId.
  const handleSendToWatch = async (e: React.MouseEvent, workout: any) => {
    e.preventDefault();
    e.stopPropagation();

    const type = String(workout?.type || workout?.workout_type || '').toLowerCase();
    if (type !== 'swim') {
      toast({ title: 'Pool swims only', description: 'Send to Apple Watch currently supports pool swims.', variant: 'destructive' });
      return;
    }

    try {
      setSendingToWatch(workout.id);

      const payload = buildSwimPayloadFromWorkout(workout);
      if (!payload) {
        toast({ title: 'Nothing to send', description: 'This swim needs materialized steps and a pool length.', variant: 'destructive' });
        return;
      }

      const scheduled = await scheduleSwimOnWatch(payload);
      if (scheduled) {
        toast({ title: 'Sent to Apple Watch', description: 'Pool swim scheduled. Open the Workout app on your watch.' });
        setSelectedPlannedWorkout(null);
      } else {
        toast({ title: 'Error', description: 'Failed to schedule on Apple Watch', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to send to Apple Watch', variant: 'destructive' });
    } finally {
      setSendingToWatch(null);
    }
  };
  
  // Check if workout is strength/mobility type
  const isStrengthOrMobility = (type: string) => {
    const t = (type || '').toLowerCase();
    return ['strength', 'mobility', 'pilates_yoga'].includes(t);
  };
  
  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // If today and no location yet, ask once and use ephemeral location (no persistence)
  useEffect(() => {
    if (locTried) return;
    if (activeDate !== today) return;
    if (dayLoc) return;
    setLocTried(true);
    try {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        setDayLoc({ lat: Number(pos.coords.latitude), lng: Number(pos.coords.longitude) });
      }, () => { /* ignore */ }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    } catch {}
  }, [activeDate, today, dayLoc, locTried]);

  // Secondary attempt: if initial geolocation didn't run (e.g., blocked), try once more on mount
  useEffect(() => {
    if (dayLoc) return;
    if (activeDate !== today) return;
    if (locTried) return;
    try {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        setDayLoc({ lat: Number(pos.coords.latitude), lng: Number(pos.coords.longitude) });
      });
    } catch {}
  }, [activeDate, today, dayLoc, locTried]);

  // Reverse geocoding to get city name from coordinates
  useEffect(() => {
    if (!dayLoc || activeDate !== today) {
      setCityName(null);
      return;
    }

    // Use OpenStreetMap Nominatim for reverse geocoding (free, no API key needed)
    const fetchCityName = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${dayLoc.lat}&lon=${dayLoc.lng}&format=json&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'Efforts App' // Required by Nominatim
            }
          }
        );
        const data = await response.json();
        let city = data.address?.city || 
                   data.address?.town || 
                   data.address?.village || 
                   data.address?.municipality ||
                   data.address?.county ||
                   null;
        
        // Make city names clearer for well-known cities
        if (city) {
          const cityLower = city.toLowerCase();
          // New York -> New York City
          if (cityLower === 'new york' || cityLower.includes('new york') && !cityLower.includes('city')) {
            city = 'New York City';
          }
          // Los Angeles -> Los Angeles (already clear)
          // San Francisco -> San Francisco (already clear)
          // Chicago -> Chicago (already clear)
          // etc.
        }
        
        setCityName(city);
      } catch (err) {
        // Silently fail - city name is optional
        setCityName(null);
      }
    };

    fetchCityName();
  }, [dayLoc, activeDate, today]);

  // Check if any workout is expanded
  const hasExpandedWorkout = Object.values(expanded).some(Boolean);


  const dateWorkoutsMemo = useMemo(() => {
    const items = Array.isArray(unifiedItems) ? unifiedItems : [];
    
    // Trust get-week completely - it already figured out what to show
    // If status='completed', show executed data
    // If status='planned', show planned data
    //
    /**
     * ⚠️ THE ONE PLACE STAGE 3 CHANGES BEHAVIOUR, AND IT IS A NARROW ONE — flagged, not slipped in.
     *
     * The other three call sites filter `!!it?.planned` before mapping, so the client fallback there
     * was unreachable. This one maps EVERY item, so the planned branch could receive an item with no
     * `planned` block — and `mapUnifiedItemToPlanned` answered with a stub built from `{}`: no name,
     * no tags, no plan, `workout_status: 'planned'`. A nameless placeholder card.
     *
     * ⛔ WHEN THAT HAPPENS: only for an item `get-week` could not classify — an executed row with no
     * `computed.overall`, no intervals, no logged sets AND no planned link, so its status resolves to
     * `null` rather than `'completed'` (`get-week:881`). A workout that has not been computed yet.
     *
     * ⚠️ SUCH AN ITEM IS NOW DROPPED FROM THE DAY rather than rendered as a blank planned card. If
     * that placeholder was load-bearing, restore it here — not by reviving the client mapper.
     */
    return items
      .map((it:any) => {
        const isCompleted = String(it?.status||'').toLowerCase()==='completed';
        if (isCompleted) {
          const row = it?.completed_workout ?? mapUnifiedItemToCompleted(it);
          /**
           * ⛔ THE PERFORMANCE PAYLOAD AND THE NAME RIDE ON THE ITEM, NOT INSIDE `completed_workout`
           * (2026-09-09). `get-week` emits `workout_analysis` and `name` at the item's top level; the
           * server's `completed_workout` block carries neither, and this branch prefers that block —
           * so the completed card reached the screen with no `session_detail_v1` and the four
           * Performance tiles had nothing to draw.
           * ⚠️ THE BLOCK STILL WINS WHERE IT HAS A VALUE. This only fills what it does not carry, so
           * a row whose analysis genuinely has not run still shows no tiles — the honest state.
           */
          return {
            ...row,
            workout_analysis: row?.workout_analysis ?? it?.workout_analysis ?? null,
            name: row?.name ?? it?.name ?? null,
          };
        }
        return it?.planned_workout ?? null;
      })
      .filter(Boolean);
  }, [unifiedItems]);

  // FIXED: React to selectedDate prop changes properly - use a stable dependency
  useEffect(() => {
    // Split into activated (no 'optional') and optional
    const activated = dateWorkoutsMemo.filter((w:any)=> !(Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional')));
    const optionals = dateWorkoutsMemo.filter((w:any)=> Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional'));
    // ⛔ THE DAY'S ORDER IS THE SERVER'S (2026-09-10, audit H-T16): get-week stamps `day_order` on
    // every row (`_shared/day-order.ts`). The phone sorted each day itself until now; that rule is gone.
    const rank = (w: any): number => (Number.isFinite(Number(w?.day_order)) ? Number(w.day_order) : Number.MAX_SAFE_INTEGER);
    const sortByDayOrder = (arr: any[]): any[] => [...arr].sort((a, b) => rank(a) - rank(b));
    const next = [...sortByDayOrder(activated), ...sortByDayOrder(optionals)];
    // ⛔ ONLY WRITE WHEN THE ORDER ACTUALLY CHANGED. This used to call setDisplayWorkouts
    // unconditionally with a fresh array, so EVERY run of this effect set state → rerender → and if
    // any dep re-reffed (they are memos over objects), the effect ran again. Forever.
    //
    // "Maximum update depth exceeded" was firing in the thousands per page load — 18,000+ in one
    // session — which is also what buried every other console error underneath it.
    //
    // ⚠️ Identity comparison, not deep equality: the elements are the same workout objects either
    // way, so the only thing this effect can legitimately change is their ORDER. If the same objects
    // come back in the same order there is nothing to write.
    // (The comment above records this exact disease being fixed once already, at 813 pending fetches.
    // Guarding the write is the fix that does not depend on every upstream memo staying stable.)
    setDisplayWorkouts((prev: any[]) => {
      if (Array.isArray(prev) && prev.length === next.length && prev.every((w, i) => w === next[i])) {
        return prev;
      }
      return next;
    });
  }, [dateWorkoutsMemo, activeDate]);
  // Helper to clean authored codes from text (mirrors PlannedWorkoutView)
  const stripCodes = (text?: string) => String(text || '')
    .replace(/\[(?:cat|plan):[^\]]+\]\s*/gi, '')
    .replace(/\[[A-Za-z0-9_:+\-x\/]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();


  // Load baselines for planned summaries
  useEffect(() => {
    (async () => {
      try {
        const b = await loadUserBaselines();
        setBaselines(b || null);
      } catch (e) {
        setBaselines(null);
      }
    })();
  }, [loadUserBaselines]);

  // Icons removed - using text-only interface

  // Icon colors removed - using text-only interface

  // Format rich workout display - different for planned vs completed
  const formatRichWorkoutDisplay = (workout: any) => {
    const discipline = getDisplaySport(workout);
    // Display Moving Time (mm:ss) for non-strength; blank for strength
    const duration = (() => {
      if (workout.type === 'strength') return '';
      // ⛔ THE SERVER'S NUMBERS (2026-09-10, audit H-T01 / H-D10): moving time done, planned length ahead.
      const sec = workout.workout_status === 'completed' ? Number(workout.moving_seconds) : plannedDurationSecondsOf(workout);
      if (Number.isFinite(sec as any) && (sec as number) > 0) {
        const s = Math.round(sec as number);
        const m = Math.floor(s/60);
        const ss = s % 60;
        return `${m}:${String(ss).padStart(2,'0')}`;
      }
      return '';
    })();
    const isCompleted = workout.workout_status === 'completed';
    
    // Get metrics/description based on workout status
    const truncate = (text: string, max = 120) => {
      if (!text) return '';
      return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
    };

    // Distance helpers
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371000; // meters
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const computeDistanceKm = (w: any): number | null => {
      // Priority 1: explicit km field
      const dk = w?.distance_km ?? w?.metrics?.distance_km;
      if (typeof dk === 'number' && isFinite(dk) && dk > 0) return dk;
      // Priority 2: explicit meters field → convert to km
      const m = w?.distance_meters ?? w?.metrics?.distance_meters ?? w?.strava_data?.original_activity?.distance;
      if (typeof m === 'number' && isFinite(m) && m > 0) return m / 1000;
      // Priority 3: generic distance → assume km (pipelines normalize to km)
      if (typeof w?.distance === 'number' && isFinite(w.distance) && w.distance > 0) return w.distance;
      if (typeof w?.distance === 'string') {
        const parsed = parseFloat(w.distance);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      // gps_track fallback
      const track = Array.isArray(w?.gps_track) ? w.gps_track : null;
      if (track && track.length > 1) {
        let meters = 0;
        for (let i = 1; i < track.length; i++) {
          const a = track[i - 1];
          const b = track[i];
          if (a?.lat != null && a?.lng != null && b?.lat != null && b?.lng != null) {
            meters += haversine(a.lat, a.lng, b.lat, b.lng);
          }
        }
        if (meters > 0) return meters / 1000;
      }
      // steps fallback (~0.78 m per step average)
      const steps = w?.steps ?? w?.metrics?.steps;
      if (typeof steps === 'number' && steps > 0) return (steps * 0.78) / 1000;
      return null;
    };

    const getMetrics = () => {
      if (!isCompleted) {
        // PLANNED: Prefer precomputed friendly text if present
        const storedText = (workout as any).rendered_description;
        if (typeof storedText === 'string' && storedText.trim().length > 0) {
          // Planned cards should reflect the pre-rendered text only
          return [truncate(storedText, 200)];
        }
        // No stored text → do not synthesize from fallbacks anymore
        return [truncate(stripCodes(workout.description || ''), 200)];
      }
      
      // COMPLETED: Show actual metrics
      if (workout.type === 'strength') {
        // Strength: show clean summary (exercise count + total volume)
        const parseSets = (x:any)=> {
          if (Array.isArray(x)) return x;
          if (typeof x === 'string') { try { const p = JSON.parse(x); return Array.isArray(p) ? p : []; } catch { return []; } }
          return [];
        };
        const normalizeExercises = (src:any): any[] => {
          if (!src) return [];
          if (Array.isArray(src)) return src.map((ex:any)=> ({ ...ex, sets: parseSets(ex?.sets) }));
          if (typeof src === 'string') { try { const p = JSON.parse(src); return Array.isArray(p) ? p.map((ex:any)=> ({ ...ex, sets: parseSets(ex?.sets) })) : []; } catch { return []; } }
          return [];
        };
        const exercises = (()=>{
          const a = normalizeExercises(workout.strength_exercises);
          if (a.length) return a;
          const c = normalizeExercises((workout as any)?.completed_exercises);
          if (c.length) return c;
          const b = normalizeExercises((workout as any)?.computed?.strength_exercises);
          return b;
        })();
        
        if (exercises.length > 0) {
          /**
           * ⛔ THE WEIGHT MOVED IS THE SERVER'S `strength_volume_lb` (2026-09-10, audit H-T04). This
           * summed reps × weight here and skipped every 0 lb set, so a chin-up or a banded set counted
           * nothing on this line while the Performance tab counted it. The set count is the server's too
           * (`strength_sets_completed`, performed sets only); the phone counted every set on the row.
           */
          const totalVolume = Number((workout as any)?.strength_volume_lb) || 0;
          const totalSets = Number((workout as any)?.strength_sets_completed) || 0;

          const metrics: any[] = [];
          metrics.push({ icon: Dumbbell, value: `${exercises.length} exercises` });
          if (totalSets > 0) {
            metrics.push({ icon: Activity, value: `${totalSets} sets` });
          }
          if (totalVolume > 0) {
            const volumeK = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : `${totalVolume}`;
            metrics.push({ icon: Activity, value: `${volumeK} lb` });
          }
          return metrics;
        }

        return [{ icon: Dumbbell, value: 'No exercises' }];
      } else if (workout.type === 'mobility') {
        // Mobility: show clean summary (exercise count + duration)
        const parseList = (src:any): any[] => {
          if (Array.isArray(src)) return src;
          if (typeof src === 'string') { try { const p = JSON.parse(src); return Array.isArray(p) ? p : []; } catch { return []; } }
          return [];
        };
        const items = parseList((workout as any)?.mobility_exercises) || parseList((workout as any)?.computed?.mobility_exercises);
        if (items.length > 0) {
          const metrics: any[] = [];
          metrics.push({ icon: Dumbbell, value: `${items.length} exercises` });
          
          // Calculate total sets if available
          let totalSets = 0;
          items.forEach((it: any) => {
            const dur = String(it?.duration || '');
            const m = dur.match(/(\d+)\s*[x×]/i);
            if (m) totalSets += parseInt(m[1], 10);
            else totalSets += 1; // Default 1 set if not specified
          });
          if (totalSets > 0) {
            metrics.push({ icon: Activity, value: `${totalSets} sets` });
          }
          
          return metrics;
        }
        return [{ icon: Dumbbell, value: 'No exercises' }];
      } else if (workout.type === 'pilates_yoga') {
        // Pilates/Yoga: show session type, duration, RPE, and focus areas
        const metadata = (workout as any)?.workout_metadata || {};
        const sessionType = metadata.session_type || 'other';
        const rpe = metadata.session_rpe;
        const focusAreas = metadata.focus_area || [];
        const duration = workout.duration || 0;
        
        const sessionTypeLabels: { [key: string]: string } = {
          'pilates_mat': 'Pilates Mat',
          'pilates_reformer': 'Pilates Reformer',
          'yoga_flow': 'Yoga Flow',
          'yoga_restorative': 'Yoga Restorative',
          'yoga_power': 'Yoga Power',
          'yoga_hot': 'Yoga Flow', // Backward compatibility - map to Yoga Flow
          'other': 'Pilates/Yoga'
        };
        
        const metrics: any[] = [];
        metrics.push({ icon: Activity, value: sessionTypeLabels[sessionType] || 'Pilates/Yoga' });
        if (duration > 0) {
          metrics.push({ icon: Clock, value: `${duration}min` });
        }
        if (typeof rpe === 'number' && rpe >= 1 && rpe <= 10) {
          metrics.push({ icon: Activity, value: `RPE ${rpe}/10` });
        }
        if (focusAreas.length > 0) {
          const focusLabels = focusAreas.map((area: string) => {
            return area.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          });
          metrics.push({ icon: Activity, value: focusLabels.join(', ') });
        }
        
        return metrics.length > 0 ? metrics : [{ icon: Activity, value: 'Pilates/Yoga Session' }];
      } else {
        // Endurance: distance, pace/speed, power (rides), heart rate, elevation (unified executed.overall only)
        const isRun = workout.type === 'run' || workout.type === 'walk';
        const isSwim = workout.type === 'swim';
        const isRide = workout.type === 'ride' || workout.type === 'bike';
        const overall = (workout as any)?.computed?.overall || {};
        const distM = Number(overall?.distance_m ?? overall?.distanceMeters);
        // ⛔ THE SERVER'S MOVING TIME (2026-09-10, audit H-D10).
        const durS = Number((workout as any)?.moving_seconds);
        // Prefer canonical m/s; if missing, derive from distance_m / duration_s_moving
        let avgSpeedMpsOverall = Number(overall?.avg_speed_mps);
        if (!(Number.isFinite(avgSpeedMpsOverall) && avgSpeedMpsOverall > 0) && Number.isFinite(distM) && distM > 0 && Number.isFinite(durS) && durS > 0) {
          avgSpeedMpsOverall = distM / durS;
        }
        const avgPowerW = Number(overall?.avg_power_w ?? (workout as any)?.avg_power);
        // Distance text
        let distance = 'N/A';
        if (Number.isFinite(distM) && distM > 0) {
          if (useImperial) distance = `${(distM/1609.34).toFixed(1)} mi`;
          else distance = `${(distM/1000).toFixed(1)} km`;
        }
        // Pace/Speed
        let paceSpeed = 'N/A';
        if (isSwim) {
                // Single source of truth: use server-computed overall stats only
          if (Number.isFinite(distM) && distM > 0 && Number.isFinite(durS) && durS > 0) {
                  const preferYards = !!useImperial;
            const per100 = preferYards ? (durS / ((distM / 0.9144) / 100)) : (durS / (distM / 100));
                  paceSpeed = `${formatSwimPace(per100)} ${preferYards ? '/100yd' : '/100m'}`;
                }
        } else if (isRun && Number.isFinite(distM) && distM > 0 && Number.isFinite(durS) && durS > 0) {
          // Pace min/mi from overall
          const miles = distM / 1609.34;
          const paceMinPerMile = (durS / 60) / miles;
          const minutes = Math.floor(paceMinPerMile);
          const seconds = Math.round((paceMinPerMile - minutes) * 60);
          paceSpeed = `${minutes}:${String(seconds).padStart(2,'0')}/mi`;
        } else if (isRide && (Number.isFinite(avgSpeedMpsOverall) && avgSpeedMpsOverall > 0)) {
          const speedMph = avgSpeedMpsOverall * 2.237;
          paceSpeed = `${Math.round(speedMph * 10) / 10} mph`;
        }

        const heartRate = Number(overall?.avg_hr ?? workout.avg_heart_rate ?? workout.metrics?.avg_heart_rate);
        const hrDisplay = (Number.isFinite(heartRate) && heartRate > 0) ? `${Math.round(heartRate)} bpm` : 'N/A';
        const elevationM = Number(overall?.elevation_gain_m ?? workout.elevation_gain ?? workout.metrics?.elevation_gain);
        const elevationFt = (Number.isFinite(elevationM) && elevationM > 0) ? `${Math.round(elevationM * 3.28084)} ft` : 'N/A';

        // Power text for rides (Avg W and %FTP when FTP is known)
        const powerText = (isRide && Number.isFinite(avgPowerW) && avgPowerW > 0) ? `${Math.round(avgPowerW)} W` : undefined;

        // For swims, only show distance and average pace
        if (isSwim) {
          // Prefer server overall; fall back to pool metadata or generic distance/duration
          const preferYards = !!useImperial; // user preference from baselines
          const comp = (workout as any)?.computed?.overall;
          let distM: number | null = Number(comp?.distance_m);
          // ⛔ THE SERVER'S MOVING TIME (2026-09-10, audit H-D10) — no second reader below it.
          const durS: number | null = Number((workout as any)?.moving_seconds);
          if (!(Number.isFinite(distM) && (distM as number) > 0)) {
            // Try pool metadata
            const poolLenM = Number((workout as any)?.pool_length_m ?? (workout as any)?.pool_length);
            const nLengths = Number((workout as any)?.number_of_active_lengths);
            if (Number.isFinite(poolLenM) && Number.isFinite(nLengths) && poolLenM > 0 && nLengths > 0) {
              distM = poolLenM * nLengths;
            } else {
              // Try swim_data.lengths sum
              try {
                const lengths = Array.isArray((workout as any)?.swim_data?.lengths) ? (workout as any).swim_data.lengths : [];
                const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
                if (sum > 0) distM = sum; // meters
              } catch {}
            }
          }
          // As a last resort, distance from km field
          if (!(Number.isFinite(distM) && (distM as number) > 0)) {
            const km = computeDistanceKm(workout);
            if (Number.isFinite(km) && (km as number) > 0) distM = (km as number) * 1000;
          }
          const yards = (Number.isFinite(distM) && (distM as number) > 0) ? Math.round((distM as number) / 0.9144) : null;
          const meters = (Number.isFinite(distM) && (distM as number) > 0) ? Math.round(distM as number) : null;
          const distText = preferYards
            ? (yards != null ? `${yards.toLocaleString()} yd` : 'N/A')
            : (meters != null ? `${meters.toLocaleString()} m` : 'N/A');
          const durText = (Number.isFinite(durS) && (durS as number) > 0)
            ? (()=>{ const s=Math.round(durS as number); const m=Math.floor(s/60); const ss=s%60; return `${m}:${String(ss).padStart(2,'0')}`; })()
            : 'N/A';
          const per100 = (Number.isFinite(durS) && (durS as number) > 0 && ((preferYards && yards && yards>0) || (!preferYards && meters && meters>0)))
            ? (()=>{ const denom = preferYards ? (yards as number)/100 : (meters as number)/100; const per = (durS as number) / denom; return `${formatSwimPace(per)}/${preferYards ? '100yd' : '100m'}`; })()
            : 'N/A';
          return [distText, durText, per100];
        }
        
        // Add workload if available
        const workload = (workout as any).workload_actual || (workout as any).workload_planned;
        const workloadText = workload ? `${workload}` : undefined;
        
        return [distance, paceSpeed, powerText, hrDisplay, elevationFt, workloadText].filter(Boolean) as any;
      }
    };
    
    return { discipline, duration, metrics: getMetrics() };
  };

  const activateOptional = async (w: any) => {
    try {
      const t: string[] = Array.isArray(w?.tags) ? w.tags : [];
      const next = t.filter((x:string)=> x.toLowerCase() !== 'optional');
      await fetch('/api/activate-optional', { method: 'POST', body: JSON.stringify({ id: w.id, tags: next }) }).catch(()=>{});
      try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
    } catch {}
  };

  // Get discipline name
  // Display label: prefer provider sport when present (e.g., Hike, Gravel Ride)
  // Also detect indoor/treadmill runs from trainer flag or missing GPS
  const getDisplaySport = (workout: any): string => {
    // A 1RM/baseline test is measurement, not training — surface it as a test on Today (Q-097/Q-102).
    if (isBaselineTestWorkout(workout)) return '1RM Test';
    const type = String(workout?.type || '').toLowerCase();
    const provider = workout?.strava_data?.original_activity?.sport_type
      || workout?.provider_sport
      || '';
    
    // Check for indoor/treadmill indicators - must be STABLE to avoid UI flicker
    const isTrainer = workout?.strava_data?.original_activity?.trainer === true;
    // Check GPS data - handle both array and JSON string formats
    const gpsTrack = workout?.gps_track;
    const hasGpsTrack = (Array.isArray(gpsTrack) && gpsTrack.length > 0) || 
                        (typeof gpsTrack === 'string' && gpsTrack.length > 10);
    // Check start position as fallback indicator
    const hasStartPosition = Number.isFinite(workout?.start_position_lat) && 
                             workout?.start_position_lat !== 0;
    // Only classify as indoor if we're sure: trainer flag OR (gps_track explicitly empty AND no start position)
    const isConfirmedIndoor = isTrainer || 
                              (Array.isArray(gpsTrack) && gpsTrack.length === 0 && !hasStartPosition);
    const isIndoorRun = (type === 'run' || type === 'walk') && isConfirmedIndoor;

    // For indoor runs, return "Indoor Run" or "Treadmill"
    if (isIndoorRun && type === 'run') {
      return isTrainer ? 'Treadmill' : 'Indoor Run';
    }
    if (isIndoorRun && type === 'walk') {
      return 'Indoor Walk';
    }

    if (typeof provider === 'string' && provider.trim().length > 0) {
      // Title case
      const label = provider.replace(/_/g, ' ');
      return label.charAt(0).toUpperCase() + label.slice(1);
    }

    return getDisciplineName(workout?.type);
  };

  const getDisciplineName = (type: string): string => {
    switch (type) {
      case 'run': return 'Run';
      case 'walk': return 'Walk';
      case 'ride': 
      case 'bike': return 'Ride';
      case 'swim': return 'Swim';
      case 'strength': return 'Lift';
      case 'mobility': return 'Mobility';
      case 'pilates_yoga': return 'Pilates/Yoga';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  // Get workout type/focus
  const getWorkoutType = (workout: any): string => {
    // Check for specific workout types in name or description
    const name = workout.name?.toLowerCase() || '';
    const description = workout.description?.toLowerCase() || '';
    const text = `${name} ${description}`;

    // Cardio workout types
    if (text.includes('tempo') || text.includes('threshold')) return 'Tempo';
    if (text.includes('endurance') || text.includes('long')) return 'Endurance';
    if (text.includes('intervals') || text.includes('intervals')) return 'Intervals';
    if (text.includes('drills') || text.includes('technique')) return 'Drills';
    if (text.includes('easy') || text.includes('recovery')) return 'Easy';
    if (text.includes('hard') || text.includes('race')) return 'Hard';

    // Strength workout types
    if (text.includes('upper') || text.includes('push')) return 'Upper';
    if (text.includes('lower') || text.includes('legs')) return 'Lower';
    if (text.includes('compound') || text.includes('full')) return 'Compound';
    if (text.includes('core') || text.includes('abs')) return 'Core';

    // Default types
    switch (workout.type) {
      case 'run': return 'Easy';
      case 'walk': return 'Easy';
      case 'ride': return 'Endurance';
      case 'swim': return 'Drills';
      case 'strength': return 'Compound';
      case 'mobility': return 'Stretch';
      case 'pilates_yoga': return 'Flexibility';
      default: return 'Workout';
    }
  };

  // Format duration
  const formatDuration = (duration: any): string => {
    if (!duration) return '';
    
    const minutes = typeof duration === 'number' ? duration : parseInt(duration);
    if (isNaN(minutes)) return '';
    
    if (minutes < 60) {
      return `${minutes}min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours}h`;
      } else {
        return `${hours}h ${remainingMinutes}min`;
      }
    }
  };

  // Format the date for display - compact format with date included
  const formatDisplayDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Check if it's today, yesterday, or tomorrow
    const isToday = dateString === today.toLocaleDateString('en-CA');
    const isYesterday = dateString === yesterday.toLocaleDateString('en-CA');
    const isTomorrow = dateString === tomorrow.toLocaleDateString('en-CA');

    // Get compact date format (e.g., "Aug 9")
    const compactDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    /**
     * ⛔ TODAY DOES NOT SAY "TODAY" (Michael, 2026-09-09, on the device). It sits under a tab that
     * already says Today, on the screen Home opens on — so the word was the second time the athlete
     * was told, and it cost the weekday. `Wed, Sep 9` says the same thing and says which day it is.
     * ⚠️ YESTERDAY AND TOMORROW KEEP THEIRS. Their tab still says "Today", so those two words are
     * the only thing telling the athlete they have walked off it.
     */
    if (isToday) {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } else if (isYesterday) {
      return `Yesterday, ${compactDate}`;
    } else if (isTomorrow) {
      return `Tomorrow, ${compactDate}`;
    } else {
      // Format as "Mon, Jan 15" for other dates
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  /**
   * ⛔ §3d — ONE SCROLL LISTENER FEEDS BOTH the grid's drift and the bleed's colour. It runs on
   * every frame of a flick, so it does no work beyond reading `scrollTop` and a handful of
   * `offsetTop`s, and it writes state only when the resolved session actually changes.
   *
   * ⚠️ `offsetTop`, NOT `getBoundingClientRect` — the rect forces layout on a scrolling element and
   * this is the one place in the file that would do it sixty times a second.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      setParallax(Math.round(top * 0.25));
      // The session in view is the LAST one whose top has passed the panel's upper third.
      const line = top + el.clientHeight * 0.34;
      let next = 0;
      sessionRefs.current.forEach((node, i) => {
        // ⚠️ `offsetTop === 0` ON A LATER SESSION MEANS "NOT LAID OUT YET", not "at the top". The
        // first pass runs before layout settles, and without this guard every session satisfied the
        // test at once — the LAST one won and the screen opened on the wrong sport's colour.
        if (!node) return;
        if (i > 0 && node.offsetTop === 0) return;
        if (node.offsetTop <= line) next = i;
      });
      setSessionInView((prev) => (prev === next ? prev : next));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [displayWorkouts]);

  /**
   * ⛔ WHICH CARD LEADS (§3e.2) — the first PLANNED session, not simply row zero. On a day whose
   * first row is already logged, the work still in front of the athlete is the thing to lead with;
   * the finished row is a record.
   * ⚠️ A DAY THAT IS ALL DONE STILL LEADS WITH ITS FIRST ROW, so a completed day has a top of the
   * page like every other day rather than going uniformly quiet.
   */
  /**
   * ═══ §3g — WHAT IS LEFT OF LOAD ON TODAY ═══════════════════════════════════════════════════════
   *
   * ⛔ THE CARD IS GONE — fitness, fatigue, form, the run / bike / lifted row and the bars deck.
   * State keeps its own load plate and the Week tab's bar carries the week's hours and miles; Today
   * was printing a third copy of both, on the screen with the least room for them.
   *
   * ⛔ ONE NUMBER SURVIVES: `form −21 · optimal`. Form is the only one of the three that says
   * anything about TODAY — fitness and fatigue are the week's story, and the athlete opening this
   * screen is asking whether to train now. The word carries the colour and the number never does
   * (`formZoneColor`, the same owner State's bar reads), because the zone is what the number MEANS.
   *
   * ⛔ IT IS READ, NEVER COMPUTED. `weekly_state_v1.load.fitness_fatigue` off the coach payload, the
   * same field `LoadBar` and the card that used to sit here both read. Nothing is derived on Today.
   *
   * ⚠️ ABSENT UNTIL THERE IS A NUMBER. An account with nothing analysed yet gets no line at all
   * rather than a dash — the old card's "no sessions logged yet" was a sentence about the database.
   */
  const [showFormKey, setShowFormKey] = useState(false);

  /**
   * ⛔ THE ⓘ OPENS STATE'S OWN KEY, NOT A COPY (Michael 2026-09-10). `LoadKeyForm` is the component
   * State's LOAD ⓘ renders — the approved sentence and the coach's zone table — imported, not
   * reworded here. Both halves read the SAME payload object this line's number comes from, so the
   * "Today: 47 − 63 = −16" arithmetic in the key can never disagree with the number above it.
   */
  const formKey = useMemo(() => {
    const load = coachWeek.data?.weekly_state_v1?.load as {
      fitness_fatigue?: { fitness: number | null; fatigue: number | null; form: number | null; fitness_prior?: number | null; fatigue_prior?: number | null } | null;
      form_zones?: Array<{ range: string; word: string; meaning: string; current: boolean }>;
    } | undefined;
    const ff = load?.fitness_fatigue ?? null;
    if (!ff || ff.form == null || !Number.isFinite(Number(ff.form))) return null;
    return { ff, zones: load?.form_zones };
  }, [coachWeek.data]);

  const formLine = useMemo(() => {
    const load = coachWeek.data?.weekly_state_v1?.load as { fitness_fatigue?: { form?: number | null }; label?: string | null } | undefined;
    const raw = load?.fitness_fatigue?.form;
    if (raw == null || !Number.isFinite(Number(raw))) return null;
    const n = Math.round(Number(raw));
    // ⛔ THE ZONE WORD IS THE COACH'S `load.label` (audit 2026-09-10, H-B08) — the same word State's bar prints.
    const zone = load?.label ?? null;
    // ⛔ A TYPOGRAPHIC MINUS, as the work order prints it (`form −21 · optimal`).
    const shown = n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : '0';
    return (
      <span className="inline-flex items-baseline gap-1 tabular-nums whitespace-nowrap">
        {/* ⛔ THE NUMBER IS THE SESSION CARDS' BODY SIZE AND THE WORDS ARE ONE STEP DOWN (Michael
            2026-09-10) — the card set every line at 13px under session cards whose bodies run 15px,
            and read as a footnote to them. 15 / 13 / 12 is `SessionDeck`'s own scale (its body rows
            are text-[15px], its meta 13, its smallest 12), so the card now wears the deck's type. */}
        <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>form</span>
        {/* ⛔ THE SAME ⓘ STATE'S LOAD LABEL CARRIES (LoadBar.tsx) — same glyph, same dim treatment, and
            it opens the same component. It sits after the WORD, where State's sits after "LOAD", not
            at the end of the reading. It never opens State: the tap is swallowed, or reading the key
            would navigate away from it. */}
        {formKey ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowFormKey((o) => !o); }}
            aria-label="What does form mean?"
            aria-expanded={showFormKey}
            className="bg-transparent border-none p-0 cursor-pointer text-white/45 align-baseline text-[13px]"
          >
            ⓘ
          </button>
        ) : null}
        <span className="text-[15px]" style={{ color: 'rgba(255,255,255,0.92)' }}>{shown}</span>
        {zone ? (
          <>
            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.38)' }}>·</span>
            <span className="text-[13px]" style={{ color: formZoneColor(zone) }}>{zone}</span>
          </>
        ) : null}
      </span>
    );
  }, [coachWeek.data, formKey, showFormKey]);

  /**
   * The week's own totals, off the rows already loaded. ⚠️ THE SAME SOURCE THE WEEK TAB'S BAR IS
   * COUNTED FROM — `weeklyStats.distances` for the endurance mileage and `weeklyStats.strength_volume_lb`
   * for the weight moved, both what `get-week` returned. Nothing is fetched and nothing is derived here.
   *
   * ⚠️ POUNDS, NOT SESSIONS. The Week bar counts lifts as sessions because a bar's job is
   * planned-versus-done; this line is "what did the week come to", and for lifting that is the
   * weight that moved.
   */
  const weekTotalsLine = useMemo(() => {
    const d = (weeklyStats as { distances?: { run_meters?: number; cycling_meters?: number } } | null)?.distances;
    const toDist = (m: number) => (useImperial ? m / 1609.34 : m / 1000);
    const unit = useImperial ? 'mi' : 'km';
    // ⛔ EACH TOTAL WEARS ITS SPORT'S COLOUR AS A DOT, NEVER AS TEXT (Michael 2026-09-10). Same
    // construction as State's load rows and the week-mix legend: a colour chip carries the sport,
    // the words and the number stay white. `getDisciplineColor` is the one owner of those colours
    // (SPORT_COLORS — run yellow, ride green, strength orange); no hex is written here.
    const parts: Array<{ sport: string; label: string | null; value: string }> = [];
    // ⛔ THE SPORT LEADS, THEN ITS NUMBER (approved 2026-09-09). "11.2 mi run" puts the unit before
    // the noun and reads backwards aloud; "run 11.2 mi" is what a person says.
    if ((d?.run_meters ?? 0) > 0) parts.push({ sport: 'run', label: 'run', value: `${toDist(d!.run_meters!).toFixed(1)} ${unit}` });
    if ((d?.cycling_meters ?? 0) > 0) parts.push({ sport: 'ride', label: 'ride', value: `${toDist(d!.cycling_meters!).toFixed(1)} ${unit}` });

    /**
     * ⛔ THE WEEK'S WEIGHT MOVED IS `weekly_stats.strength_volume_lb` (2026-09-10, audit H-T05). The
     * server prices every set the way the Performance tab does; this used to sum reps × weight over the
     * week's items here and skip every 0 lb set.
     */
    const volume = Number((weeklyStats as { strength_volume_lb?: unknown } | null)?.strength_volume_lb) || 0;
    if (volume > 0) {
      const shown = useImperial ? volume : volume * 0.453592;
      // ⚠️ NO WORD IN FRONT OF THE WEIGHT — the orange dot is what says "lifting", exactly as it did
      // when this entry was a bare number in the joined string.
      parts.push({ sport: 'strength', label: null, value: `${Math.round(shown).toLocaleString()} ${useImperial ? 'lb' : 'kg'}` });
    }

    // ⚠️ NOTHING LOGGED IS NO LINE AT ALL, rather than a lone separator with an empty tail.
    if (parts.length === 0) return null;
    return (
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {parts.map((p) => (
          <span key={p.sport} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-1px]"
              style={{ backgroundColor: getDisciplineColor(p.sport) }}
            />
            {p.label ? <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{p.label}</span> : null}
            <span className="text-[15px]" style={{ color: 'rgba(255,255,255,0.92)' }}>{p.value}</span>
          </span>
        ))}
      </span>
    );
  }, [weeklyStats, allUnifiedItems, useImperial]);

  const leadSessionId = useMemo(() => {
    const rows = Array.isArray(displayWorkouts) ? displayWorkouts : [];
    const firstPlanned = rows.find((w) => String(w?.workout_status ?? '').toLowerCase() !== 'completed');
    return (firstPlanned ?? rows[0])?.id ?? null;
  }, [displayWorkouts]);

  const isPastDate = activeDate < today;
  const isToday = activeDate === today;



  const blockLoading = unifiedLoading && !Array.isArray(dateWorkoutsMemo) ? true : false;
  if (blockLoading) {
    return (
      <div className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ height: 'var(--todays-h)' }}>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  // (Reverted) no horizontal scroll state

  // Calculate header height for scroll container positioning
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(40); // Start with reasonable default

  useEffect(() => {
    if (headerRef.current) {
      const updateHeight = () => {
        const height = headerRef.current?.offsetHeight || 40;
        setHeaderHeight(height);
      };
      // Update immediately
      updateHeight();
      // Also update after a short delay to catch any layout changes
      const timeoutId = setTimeout(updateHeight, 100);
      const resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(headerRef.current);
      return () => {
        clearTimeout(timeoutId);
        resizeObserver.disconnect();
      };
    }
  }, [weather]);

  return (
    <div className="w-full h-full flex flex-col" style={{ position:'relative', overflow: 'hidden', zIndex: 0 }}>
      {/**
        * Omni-inspired diamond-grid texture (matches reference).
        *
        * ⛔ IT DRIFTS AGAINST THE SCROLL (work order §3d) — about a quarter of scroll speed, so the
        * cards read as floating over the grid rather than painted onto it. ⚠️ ONLY THE FOUR LINE
        * LAYERS MOVE; the vignette stays centred, or the dark corners would slide off the panel.
        */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0.28,
          mixBlendMode: 'soft-light',
          backgroundColor: 'rgba(0,0,0,0.25)',
          backgroundImage: `
            linear-gradient(45deg, rgba(255,255,255,0.22) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.18) 1px, transparent 1px),
            linear-gradient(45deg, rgba(255,255,255,0.10) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.08) 1px, transparent 1px),
            radial-gradient(ellipse at center, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 100%)
          `,
          backgroundSize: '26px 26px, 26px 26px, 52px 52px, 52px 52px, cover',
          backgroundPosition: `center ${-parallax}px, center ${-parallax}px, center ${-parallax}px, center ${-parallax}px, center`,
        }}
      />
      {/**
        * Glow-field behind the Today panel (the “Today halo”).
        *
        * ⛔ THE COLOUR FOLLOWS THE DAY (work order 2026-09-09 §3b.4). The bleed used to burn all five
        * sport hues at once, every day — the visual language's *"soft sport-colour bleed from the
        * top"* rendered as a rainbow that said nothing about what the athlete is doing. It now takes
        * the colour of the day's FIRST session, off the same tag-keyed display discipline the
        * sessions themselves wear, so the top of the screen and the first card agree.
        *
        * ⚠️ A REST DAY KEEPS THE NEUTRAL BLEED — the five-hue field below. With nothing planned there
        * is no sport to take a colour from, and picking one would be decoration claiming to be
        * information.
        */}
      {(() => {
        /**
         * ⛔ THE BLEED FOLLOWS THE SESSION IN VIEW (§3d), not just the day's first one (§3b.4).
         * Lift orange becomes ride green as the ride card scrolls up. `sessionInView` is the index
         * the scroll handler resolves; before a scroll it is 0, so the screen still opens on the
         * first session's colour and §3b.4 is unchanged for a day nobody scrolls.
         */
        const inView = displayWorkouts[Math.min(sessionInView, Math.max(0, displayWorkouts.length - 1))];
        const rgb = inView ? getDisciplineColorRgb(displayDisciplineOf(inView)) : null;
        return (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-16px',
              right: '-16px',
              top: '-24px',
              height: '220px',
              zIndex: 0,
              pointerEvents: 'none',
              mixBlendMode: 'screen',
              backgroundImage: rgb
                ? `
            radial-gradient(320px 150px at 28% 42%, rgba(${rgb}, 0.30) 0%, rgba(${rgb}, 0.0) 74%),
            radial-gradient(300px 160px at 68% 52%, rgba(${rgb}, 0.18) 0%, rgba(${rgb}, 0.0) 74%)
          `
                : `
            radial-gradient(200px 120px at 18% 40%, rgba(255, 215, 0, 0.28) 0%, rgba(255, 215, 0, 0.0) 72%),
            radial-gradient(220px 140px at 40% 52%, rgba(255, 140, 66, 0.20) 0%, rgba(255, 140, 66, 0.0) 72%),
            radial-gradient(220px 140px at 60% 52%, rgba(183, 148, 246, 0.18) 0%, rgba(183, 148, 246, 0.0) 72%),
            radial-gradient(200px 120px at 82% 40%, rgba(74, 158, 255, 0.18) 0%, rgba(74, 158, 255, 0.0) 72%),
            radial-gradient(260px 170px at 50% 72%, rgba(239, 68, 68, 0.14) 0%, rgba(239, 68, 68, 0.0) 76%)
          `,
              opacity: 0.60,
              filter: 'blur(24px) saturate(1.12)',
              transform: 'translateZ(0)',
              transition: 'background-image 300ms ease',
            }}
          />
        );
      })()}
      {/* First-run card sits ABOVE the Today panel: inside it, it ate the panel's fixed height and
          pushed the session rows under the fold (seen on the demo account, 2026-09-07). */}
      {!noPlanYet ? (
        <div className="flex-shrink-0 px-2 pt-2 pb-1" style={{ position: 'relative', zIndex: 1 }}>
          <FirstRunCard id="home">Tap a session to open it.</FirstRunCard>
        </div>
      ) : null}
      <FirstRunOverlay active={noPlanYet} />
      {/* No plan yet: the one door, above the panel (2026-09-08). */}
      {noPlanYet ? (
          <div className="flex-shrink-0 px-2 pt-2 pb-1" style={{ position: 'relative', zIndex: 1 }}>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div>
                <button
                  type="button"
                  onClick={() => navigate('/goals')}
                  className="w-full text-left rounded-xl border border-white/25 bg-white/[0.08] px-4 py-3 text-white/90 text-sm"
                >
                  Build a training or race plan ›
                </button>
              </div>
            </div>
          </div>
      ) : null}
      {/* Scrollable container for Today panel */}
      <div 
        ref={scrollRef}
        className="scrollbar-hide flex flex-col h-full"
        style={{ 
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Today Panel Header - Live instrument cockpit (sticky, raised, glowing) */}
        <div 
          ref={headerRef}
          className="mb-1.5 flex-shrink-0" 
          style={{ 
            position: 'sticky',
            top: 0,
            zIndex: 20,
            // Opaque base + Omni texture so scroll content doesn't show through
            backgroundColor: '#000000',
            // Option 1 lighting: keep texture, but bias glow to a top-left “key light” (white)
            backgroundImage: `
              radial-gradient(ellipse at 18% 0%, rgba(255, 255, 255, 0.18) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 45%, rgba(255, 255, 255, 0.06) 0%, transparent 62%),
              linear-gradient(45deg, rgba(255,255,255,0.18) 1px, transparent 1px),
              linear-gradient(-45deg, rgba(255,255,255,0.14) 1px, transparent 1px),
              linear-gradient(45deg, rgba(255,255,255,0.08) 1px, transparent 1px),
              linear-gradient(-45deg, rgba(255,255,255,0.06) 1px, transparent 1px)
            `,
            backgroundSize: 'cover, cover, 26px 26px, 26px 26px, 52px 52px, 52px 52px',
            backgroundPosition: 'center, center, center, center, center, center',
            backgroundBlendMode: 'screen, screen, soft-light, soft-light, soft-light, soft-light',
            overflow: 'hidden',
            // Omni-inspired illuminated border that blends
            border: '0.5px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px', // Rounded corners for mounted instrument feel
            // ⛔ 14 px, ONE BLOCK (§3e.1). The date row and the weather are one quiet object now, so
            // the block's own padding is the only inset either of them gets.
            padding: '14px',
            // Panel depth: top-left key light + neutral depth (rainbow reserved for the horizon/road)
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.05) inset,
              inset 0 1px 0 rgba(255,255,255,0.20),
              inset 0 -1px 0 rgba(0,0,0,0.45),
              0 10px 22px rgba(0,0,0,0.55),
              /* subtle spectrum halo so “Today” reads as active */
              0 0 18px rgba(255,255,255,0.05),
              0 0 26px rgba(255,215,0,0.10),
              0 0 34px rgba(255,140,66,0.08),
              0 0 30px rgba(183,148,246,0.06),
              0 0 30px rgba(74,158,255,0.06),
              0 0 40px rgba(239, 68, 68, 0.05)
            `,
            // Keep aligned to the instrument panel surface (no “floating” offsets)
            marginLeft: 0,
            marginRight: 0,
            marginTop: 0,
          }}
        >
          <div className="space-y-0.5">
            {/**
              * ⛔ ONE LINE, NOT FOUR (Michael, 2026-09-09): the date, the plan week and the phase
              * run together, with the block label right-aligned and small on the same line. Four
              * stacked lines above the sessions is what pushed LOAD off a 390×844 screen.
              * ⚠️ NOTHING NEW IS SAID. `formatDisplayDate`, `currentWeek`, `focus` and the arc's
              * block label are the strings that were already here, joined with the separator this
              * line already used. The city and the race countdown keep their own line below, since
              * neither is about the day.
              */}
            <div
              className="flex items-baseline justify-between gap-2"
              style={{ touchAction: 'pan-y' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                dateSwipe.current = { x: e.clientX, moved: 0 };
              }}
              onPointerMove={(e) => {
                if (!dateSwipe.current) return;
                e.stopPropagation();
                dateSwipe.current.moved = e.clientX - dateSwipe.current.x;
                /**
                 * ⛔ CAPTURE ONLY ONCE IT IS A DRAG, NOT ON EVERY TOUCH. Two failures, one each way:
                 *   · WITHOUT capture, the pointerup landed on whichever chevron the swipe had
                 *     travelled over, so that button's click fired `prev` while the swipe fired
                 *     `next` and the date did not move.
                 *   · CAPTURING ON pointerdown retargets the pointer events to this row, so the
                 *     browser dispatches the following `click` here rather than on the button — and
                 *     the chevrons stopped working entirely.
                 * Capturing at the 8 px mark separates them: a tap never captures and reaches its
                 * button; a drag captures and finishes here.
                 */
                if (Math.abs(dateSwipe.current.moved) > 8) {
                  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* older webviews */ }
                }
              }}
              onPointerUp={(e) => {
                const g = dateSwipe.current;
                dateSwipe.current = null;
                if (!g) return;
                e.stopPropagation();
                // Same 60 px the decks use, so one gesture threshold governs the screen.
                if (g.moved < -60) handleDayNav('next');
                else if (g.moved > 60) handleDayNav('prev');
              }}
              onPointerCancel={(e) => { e.stopPropagation(); dateSwipe.current = null; }}
            >
              <button
                type="button"
                aria-label="Previous day"
                /* ⚠️ A DRAG IS NOT A TAP — the same rule the decks keep. */
                onClick={(e) => { e.stopPropagation(); if (Math.abs(dateSwipe.current?.moved ?? 0) > 8) return; handleDayNav('prev'); }}
                className="p-0.5 -ml-1 rounded-xl flex-shrink-0 self-center text-white/40 hover:text-white/85 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span
                className="text-[0.82rem] font-light tracking-wide truncate"
                style={{
                  color: 'rgba(255, 255, 255, 1.0)',
                  textShadow: '0 0 3px rgba(255, 240, 200, 0.25), 0 0 6px rgba(255, 240, 200, 0.15), 0 0 2px rgba(255, 255, 255, 0.2)',
                  lineHeight: 1.05,
                }}
              >
                {formatDisplayDate(activeDate)}
                {trainingPlanContext?.currentWeek ? (
                  <span style={{ color: getDisciplinePhosphorCore('run'), opacity: 0.72 }}>
                    {' · '}Week {trainingPlanContext.currentWeek}
                  </span>
                ) : null}
                {/* ⛔ THE WORDS AFTER THE WEEK ARE THE SERVER'S (2026-09-10): a standing plan's name,
                    "Test" or "Light week"; a race plan's phase. `focus` only for a get-week that
                    predates `weekLabel`. */}
                {(trainingPlanContext?.weekLabel !== undefined ? trainingPlanContext?.weekLabel : trainingPlanContext?.focus) ? (
                  <span style={{ color: getDisciplinePhosphorCore('run'), opacity: 0.72 }}>
                    {' · '}{trainingPlanContext?.weekLabel !== undefined ? trainingPlanContext.weekLabel : trainingPlanContext.focus}
                  </span>
                ) : null}
              </span>
              {/* ⛔ NO BLOCK LABEL ON A STANDING PLAN — it has no build or peak to name. Race plans keep it. */}
              {blockLabel && !trainingPlanContext?.standingPlan ? (
                <span
                  className="text-[0.62rem] font-light tracking-wide flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.38)', lineHeight: 1.05 }}
                >
                  {blockLabel}
                </span>
              ) : null}
              <button
                type="button"
                aria-label="Next day"
                onClick={(e) => { e.stopPropagation(); if (Math.abs(dateSwipe.current?.moved ?? 0) > 8) return; handleDayNav('next'); }}
                className="p-0.5 -mr-1 rounded-xl flex-shrink-0 self-center text-white/40 hover:text-white/85 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* The race countdown. ⚠️ IT SITS ABOVE THE WEATHER, not below it: §3e.1 says the block
                ENDS at the sunrise line, and a countdown after it would be the empty band again.
                ⚠️ THE CITY LEFT THIS LINE for the sunrise/sunset row inside the weather — it says
                where the reading came from, not what day it is. */}
            {(trainingPlanContext?.raceDate && (trainingPlanContext?.weeksToRace ?? 0) > 0) ? (
              <div className="flex items-center gap-1 flex-wrap text-[0.68rem] font-light tracking-normal" style={{ color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.1 }}>
                <span style={{ color: getDisciplinePhosphorCore('run'), opacity: 0.62 }}>
                  {trainingPlanContext.weeksToRace} {trainingPlanContext.weeksToRace === 1 ? 'wk' : 'wks'} till {trainingPlanContext.raceName || 'race'}
                </span>
              </div>
            ) : null}

            {/**
              * ⛔ THE WEATHER IS INSIDE THIS BLOCK, NOT A CARD IN IT (§3e.1). It had 12 px of margin
              * and 16 px of padding of its own, which drew a second surface inside a surface — the
              * "second card" the go rules out. It now sits in the block's own 14 px, one line of
              * air under the date, and the block ends where its sunrise line does.
              * ⚠️ TODAY ONLY. There is no historical weather to show for another day.
              */}
            {/**
              * ⛔ THE HEADER IS THE DATE AND THE WEATHER, NOTHING ELSE (Michael, 2026-09-10). The form
              * line, the week's totals and the Garmin line moved to the status card at the bottom of
              * Today — one block per subject.
              * ⚠️ TODAY ONLY. There is no historical weather to show for another day.
              */}
            {weather && isTodayDate ? (
              <div style={{ marginTop: 8 }}>
                <TodayWeather weather={weather} city={cityName} />
              </div>
            ) : null}
          </div>
        </div>

        {reauthLine ? (
          <div className="flex-shrink-0 px-2 pt-2">
            <button
              type="button"
              onClick={() => navigate('/connections')}
              className="m-0 w-full cursor-pointer border-none bg-transparent p-0 text-left"
              style={{
                fontSize: '0.72rem',
                fontWeight: 400,
                letterSpacing: '0.02em',
                color: 'rgba(255, 205, 130, 0.9)',
              }}
              aria-label="A connection needs reconnecting — open Connections"
            >
              {reauthLine}
            </button>
          </div>
        ) : null}

        {/* ⚠️ THE ARC LINE KEEPS ITS OWN ROW ONLY WHEN IT IS A DOOR. Its block label now rides on
            the date line; the rest of the sentence is still worth a line when it asks for a tap. */}
        {homeArcReady && arcLineText && arcNeedsGoals && !noPlanYet ? (
          <div className="flex-shrink-0 px-2 pt-1">
            {arcNeedsGoals ? (
              <button
                type="button"
                onClick={() => navigate('/goals')}
                className="m-0 w-full cursor-pointer border-none bg-transparent p-0 text-left"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  color: 'rgba(255, 255, 255, 0.38)',
                }}
              >
                {arcLineText}
              </button>
            ) : (
              <p
                className="m-0"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  color: 'rgba(255, 255, 255, 0.38)',
                }}
              >
                {arcLineText}
              </p>
            )}
          </div>
        ) : null}


        {/* Content area
            Option C: slightly wider rail + Today blocks get a small bleed.
            Calendar/week strip spacing is untouched (handled in `WorkoutCalendar`). */}
        <div className="px-2 overflow-x-hidden" style={{ paddingBottom: hasExpandedWorkout ? 120 : 56 }}>
        {displayWorkouts.length === 0 ? (
          // Empty state - show "Rest" if there's an active plan, otherwise "No effort"
          <div className="px-4 py-10">
            <p className="text-center text-lg font-medium italic" style={{ color: 'rgba(255, 255, 255, 0.25)' }}>
              {trainingPlanContext
                ? 'Rest'
                : isPastDate
                  ? 'No effort logged'
                  : 'No effort scheduled'
              }
            </p>
          </div>
        ) : (
          // Tap opens bottom sheet (planned) or detail (completed). Each planned session carries the
          // day's own lines beneath it — work order 2026-09-09 §2.
          <div>
            {/* ⛔ THE SPACING LINE, ABOVE THE SESSIONS AND CARRYING NO SPORT COLOUR (§2b). It shows
                only on a day that is a lift and a ride or run; every other day gets nothing. */}
            <TodaySpacingLine rows={displayWorkouts as never} />
            {/* ⛔ 14 px BETWEEN SESSIONS (Michael, 2026-09-09). Each deck and card already
                carries its own 14 px bottom margin, so the list adds none — two gaps stacked is
                what pushed LOAD under the fold on a two-session day. */}
            {/**
              * ⛔ THE FIRST SESSION IS THE BIG THING (§3e.2), AND IT IS THE FIRST PLANNED ONE — not
              * simply row zero. On a day whose first row is already logged, the work still in front
              * of the athlete is the thing to lead with; the finished row is a record.
              * ⚠️ A DAY THAT IS ALL DONE STILL LEADS WITH ITS FIRST ROW rather than going uniformly
              * quiet, so a completed day has a top of the page like every other day.
              */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {displayWorkouts.map((workout, sessionIdx) => {
                const emphasis: CardEmphasis = workout?.id === leadSessionId ? 'lead' : 'quiet';
                /* ⛔ ONE MEASURED WRAPPER PER SESSION, so the scroll handler can say which one is in
                   view without every card having to know its own index. */
                const wrap = (node: React.ReactNode) => (
                  <div key={workout.id} ref={(el) => { sessionRefs.current[sessionIdx] = el; }}>
                    {node}
                  </div>
                );
                /**
                 * ⛔⛔ TODAY IS ONE CARD OBJECT AT THREE STATES. A planned lift or plyo day swipes as
                 * a deck, a planned ride or run is one glass card, and a COMPLETED session is the
                 * same card greyed (Michael, 2026-09-09). ⚠️ THE PILL ROW BELOW IS NOW ONLY FOR A
                 * SKIPPED SESSION, which says why it was skipped and is not a reading of anything.
                 *
                 * ⛔ AND A DONE SESSION OPENS ON PERFORMANCE, not in the planned drawer.
                 * `handleEditEffort` already routes a completed row there (`AppLayout`: *"Completed:
                 * open on Performance tab"*), so this asks for the door that exists.
                 */
                const isCompletedRow = (w: { workout_status?: unknown }) =>
                  String(w?.workout_status ?? '').toLowerCase() === 'completed';
                if (rendersAsSessionCard(workout as never, isPastDate)) {
                  return wrap(
                    <TodaySession
                      session={workout as never}
                      useImperial={useImperial}
                      isPastDate={isPastDate}
                      emphasis={emphasis}
                      onOpen={() => (isCompletedRow(workout)
                        ? onEditEffort?.(workout)
                        : setSelectedPlannedWorkout(workout))}
                    />,
                  );
                }

                const workoutType = workout.type || workout.workout_type || '';
                /**
                 * ⛔ THE DISPLAY DISCIPLINE FEEDS THE COLOUR; THE WIRE TYPE STILL FEEDS THE
                 * REASONING (2026-09-09). The plyo day is `type: 'strength'` and must not wear
                 * strength's orange — the same seam the calendar draws its magenta chip from. Only
                 * the pill, the glow and the title colour move; `isEnduranceType` below keeps
                 * asking the real type, because that question is about what the session IS.
                 */
                const displayType = displayDisciplineOf(workout);
                const isCompleted = workout.workout_status === 'completed';
                const isSkipped = String(workout.workout_status || '').toLowerCase() === 'skipped';
                const isPlannedRow = !isCompleted;
                const glowState: 'idle' | 'week' | 'done' | 'active' = isCompleted ? 'done' : 'week';
                const phosphorPill = getDisciplinePhosphorPill(displayType, glowState);
                const pillRgb = getDisciplineColorRgb(displayType);
                const providerAttr = isCompleted ? getProviderAttribution(workout) : { source: null as any };
                const showImportAttribution = isCompleted && !!providerAttr?.source;
                const showEnduranceDetails = isCompleted && isEnduranceType(workoutType);
                const compactMetrics = showEnduranceDetails ? getCompactEnduranceMetrics(workout) : [];

                const title = (() => {
                  // Delegates to the shared canonical title helper — single source of truth
                  // across PlannedWorkoutSummary / AllPlansInterface / TodaysEffort. Closes the
                  // ENGINE-STATE Known Broken label-divergence entry.
                  const derived = deriveWorkoutTitle(workout as any);
                  return derived || getDisplaySport(workout);
                })();

                const skipSubtitle = (() => {
                  if (!isSkipped) return null;
                  const label = skipReasonLabel(workout.skip_reason);
                  const note = typeof workout.skip_note === 'string' && workout.skip_note.trim() ? workout.skip_note.trim() : '';
                  if (label && note) return `${label} — ${note.length > 48 ? `${note.slice(0, 48)}…` : note}`;
                  if (note) return note.length > 56 ? `${note.slice(0, 56)}…` : note;
                  return label;
                })();

                /**
                 * ⛔ THE SWAP GLYPH — SAME GATE AS THE OTHER TWO SURFACES, RENDERED IN THE HEADER.
                 *
                 * ⚠️ IT USED TO BE `absolute top-2 right-2`, WHICH IS WHERE THE DURATION SITS. The
                 * glyph and the `63:00` were stacked on the same pixels, so the control existed in
                 * the DOM and could not be seen — reported as "the top card has no glyph" while the
                 * gate was answering correctly all along. It now goes in the header's action slot,
                 * beside the duration rather than on top of it.
                 *
                 * ⛔ A `<span role="button">`, NOT A `<button>` — the row itself IS a `<button>`, and
                 * nesting one inside another is invalid HTML that browsers may drop or relocate.
                 */
                const swapGlyph = (() => {
                  if (!isPlannedRow || isCompleted) return null;
                  // ⛔ THE SERVER SAYS WHICH SESSIONS OFFER A SPORT SWAP (`swap-session`, 2026-09-10).
                  if (!sportSwapIds.has(String(workout?.id ?? ''))) return null;
                  const openSwap = () => {
                    setSelectedPlannedWorkout(workout);
                    setSwapRestOfPlan(false);
                    setPlannedDrawerStep('swap');
                  };
                  return (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Swap sport for this session"
                      title="Swap sport"
                      className="p-1 -m-1 rounded-lg text-white/45 hover:text-white/85 hover:bg-white/[0.08] transition-colors cursor-pointer inline-flex items-center"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openSwap(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openSwap(); }
                      }}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </span>
                  );
                })();

                return (
                  <button
                    key={workout.id}
                    type="button"
                    className={`w-full text-left transition-all relative ${!isCompleted ? 'backdrop-blur-md' : ''} ${phosphorPill.className}`}
                    style={{
                      ...phosphorPill.style,
                      borderRadius: '10px',
                      padding: '0.52rem 0.78rem',
                      opacity: isSkipped ? 0.72 : 1,
                      // Filled (completed) should read like backlit phosphor glass, not fog:
                      // reduce blur radius ~30% on filled state only.
                      ...(isCompleted
                        ? {
                            backdropFilter: 'blur(11.2px)',
                            WebkitBackdropFilter: 'blur(11.2px)',
                          }
                        : null),
                      // Dimensional / “special” feel (gloss + bevel + subtle depth)
                      backgroundImage: isCompleted
                        ? `
                          radial-gradient(120% 120% at 26% 18%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.00) 52%),
                          radial-gradient(120% 140% at 86% 110%, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.00) 58%),
                          linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 55%, rgba(0,0,0,0.22) 100%)
                        `
                        : `
                          radial-gradient(120% 120% at 26% 18%, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.00) 52%),
                          radial-gradient(120% 140% at 86% 110%, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.00) 58%),
                          linear-gradient(180deg, rgba(${pillRgb},0.14) 0%, rgba(${pillRgb},0.06) 55%, rgba(0,0,0,0.22) 100%)
                        `,
                      backgroundBlendMode: 'screen, multiply, normal',
                      backgroundClip: 'padding-box',
                      // Inset stroke so it feels “mounted”
                      boxShadow: phosphorPill.style.boxShadow
                        ? `${phosphorPill.style.boxShadow},
                           0 2px 8px rgba(0,0,0,0.45),
                           0 14px 26px rgba(0,0,0,0.16),
                           inset 0 1px 0 rgba(255,255,255,0.22),
                           inset 0 -1px 0 rgba(0,0,0,0.40),
                           inset 0 0 0 0.5px rgba(255,255,255,0.08)`
                        : `0 2px 8px rgba(0,0,0,0.45),
                           0 14px 26px rgba(0,0,0,0.16),
                           inset 0 1px 0 rgba(255,255,255,0.22),
                           inset 0 -1px 0 rgba(0,0,0,0.40),
                           inset 0 0 0 0.5px rgba(255,255,255,0.08)`,
                      borderWidth: '0.5px',
                      // ⛔ ONE STEP QUIETER WHEN IT IS NOT THE DAY'S FIRST SESSION (§3e.2). This is
                      // the fallback row — a skipped session, or one this file still draws itself —
                      // and it follows the same rule the card object does.
                      ...(emphasis === 'quiet' ? { opacity: isSkipped ? 0.72 : 0.88 } : null),
                      transform: 'translateZ(0)',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isPlannedRow) {
                        setSelectedPlannedWorkout(workout);
                        return;
                      }
                      onEditEffort && onEditEffort(workout);
                    }}
                  >
                    {/**
                      * ⛔ THE CUE, NOT A SECOND CONTROL. Michael asked for a swap symbol on Today's
                      * Effort to take the athlete to the swap. It OPENS THE DRAWER at the swap step —
                      * it does not swap anything itself, because a one-tap discipline change on a
                      * card the athlete may have brushed past is not a decision, it is an accident.
                      *
                      * ⚠️ IT ONLY APPEARS WHERE A SWAP EXISTS: an unstarted planned ENDURANCE session
                      * that is not the long one. A glyph that opens an empty sheet teaches the athlete
                      * to ignore glyphs.
                      */}
                    {/**
                      * ⛔ THE MISS, ON THE CARD (2026-08-08). A completed activity that left a planned
                      * session owed says so here, so the athlete does not have to open it to find out.
                      * Tapping the card opens the activity, where the link button lives.
                      */}
                    {/**
                      * ⛔ THE MISS, ON THE CARD (2026-08-08). A completed activity that left a planned
                      * session owed says so here, so the athlete does not have to open it to find out.
                      * Tapping the card opens the activity, where the link button lives.
                      *
                      * ⛔ IT MOVED OUT OF THE CORNER (2026-09-03, Michael: "move it"). It was pinned
                      * `absolute top-2 right-2` — the same row the provider attribution uses — so it
                      * printed ON TOP of "Garmin Connect (Forerunner 965)". It now rides inline after the
                      * title's ✓, on the left of a `justify-between` row whose right side is the provider
                      * block: two things that cannot collide because they are in the same flow.
                      */}
                    {/**
                      * ⛔ PLANNED ROWS USE THE SHARED HEADER (2026-08-09) — the same component the
                      * drawer and the full planned screen render, so all three agree on the title's
                      * sport colour, on the duration, and on where the swap control sits.
                      *
                      * ⚠️ COMPLETED ROWS KEEP THE BLOCK BELOW. A completed row's right-hand side is
                      * provider attribution (Strava/Garmin), not a planned duration, and its title
                      * carries the ✓ — a different header for a different kind of row, not a second
                      * opinion about the same one.
                      */}
                    {isPlannedRow ? (
                      <PlannedSessionHeader
                        workout={workout}
                        size="card"
                        /* Titles-only list — the description belongs to the drawer, not the card. */
                        description={null}
                        action={swapGlyph}
                        durationExtra={(() => {
                          // ⚠️ NOT ON A SWAPPED ROW — its `computed` still holds the SOURCE sport's session.
                          // ⛔ The server's total and unit (2026-09-10, audit H-T20); a row without one prints nothing.
                          const swimChip = String(workout.type || '').toLowerCase() === 'swim'
                            && !swappedStructureIsStale(workout as never)
                            ? ((workout as any)?.computed?.swim_distance?.label || null)
                            : null;
                          return swimChip ? (
                            <span className="text-[11px] text-blue-200/95">
                              {swimChip}
                            </span>
                          ) : null;
                        })()}
                      />
                    ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="font-medium tracking-normal text-base"
                        style={{
                          color: isCompleted ? 'rgba(255, 255, 255, 0.92)' : getDisciplinePhosphorCore(displayType),
                          // Legibility: slight dark edge + faint discipline bloom
                          textShadow: isCompleted
                            ? `0 1px 1px rgba(0,0,0,0.65), 0 0 8px rgba(0,0,0,0.45)`
                            : `0 1px 1px rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.35), 0 0 14px rgba(${pillRgb},0.10)`,
                        }}
                      >
                        {title}
                        {isCompleted && (
                          <span
                            aria-label="Completed"
                            className="inline-flex items-center justify-center flex-shrink-0 ml-2"
                            style={{
                              color: 'rgba(255, 255, 255, 0.95)',
                              fontSize: 14,
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                          >
                            ✓
                          </span>
                        )}
                        {/* "Failed" on screen (plumbing §3): a small dot; the card says why when opened. */}
                        {isCompleted && analysisNeedsAttention(workout as never) && (
                          <span
                            aria-label={analysisFailureLine(workout as never) || 'Analysis failed'}
                            title={analysisFailureLine(workout as never) || 'Analysis failed'}
                            className="inline-block w-1.5 h-1.5 rounded-full ml-2 align-middle bg-amber-300/85"
                          />
                        )}
                        {isCompleted && isUnmatchedAgainstPlan(
                          workout as never,
                          (Array.isArray(unifiedItems) ? unifiedItems : [])
                            .map((it: { planned?: unknown }) => it?.planned ?? null)
                            .filter(Boolean) as never,
                        ) && (
                          <span
                            className="ml-2 align-middle text-[10px] font-normal text-amber-300/85"
                            title="Didn't match a planned session — tap to link it"
                          >
                            unlinked
                          </span>
                        )}
                      </div>

                      {/* Right side: import attribution. The planned duration is the shared
                          header's job now, so this branch is completed-only. */}
                      {showImportAttribution ? (
                        /* Garmin API Brand Guidelines v6.30.2025 / developers.strava.com/guidelines —
                           the shared line (src/components/ProviderAttribution.tsx): "Garmin [device
                           model]", "Garmin [model] via Strava", or the Powered by Strava mark. */
                        <ProviderAttributionLine workout={workout} className="flex-shrink-0" style={{ opacity: 0.78 }} />
                      ) : null}
                    </div>
                    )}

                    {isSkipped && (
                      <div
                        className="mt-1 text-[11px] font-light leading-snug"
                        style={{ color: 'rgba(255,255,255,0.42)' }}
                      >
                        Skipped{skipSubtitle ? ` · ${skipSubtitle}` : ''}
                      </div>
                    )}

                    {/* Completed endurance details + import attribution */}
                    {showEnduranceDetails && (
                      <div className="mt-2">
                        <div
                          className="tabular-nums"
                          style={{
                            color: 'rgba(255,255,255,0.78)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {compactMetrics.map((m, idx) => (
                            <span
                              key={idx}
                              className="text-xs font-light"
                              style={{
                                textShadow: '0 1px 1px rgba(0,0,0,0.55), 0 0 8px rgba(0,0,0,0.35)',
                              }}
                            >
                              {m}
                              {idx < compactMetrics.length - 1 ? (
                                <span style={{ color: 'rgba(255,255,255,0.35)' }}>{' \u00A0\u00A0'}</span>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {/* ⛔ THE SPACING LINE MOVED TO THE TOP OF THE DAY (work order 2026-09-09 §2.1), and it
                gained the second half the page always had: what to do when the two sessions cannot
                be six to eight hours apart. The block that stood here printed the lead sentence
                alone, keyed off the row's TYPE rather than its tags, and counted a swim or a walk as
                the endurance half of a pairing p145 writes about a ride or a run. See
                `TodaySpacingLine` above the list. */}

          </div>
        )}
        {/**
          * ═══ THE STATUS CARD, AT THE BOTTOM OF TODAY (Michael, 2026-09-10) ═════════════════════
          *
          * ⛔ ONE BLOCK PER SUBJECT. The header is the day and its weather; this card is where the
          * athlete stands: form, the week's totals, and Garmin's derived-data line last. The three
          * lines are the ones the header carried, off the same readers — nothing is recomputed.
          * ⛔ THE CARD IS THE DOOR TO STATE, through `open:state`, the event `TrainingBaselines`
          * already fires. ⚠️ No sport colour: it belongs to no session.
          * ⚠️ THE GARMIN LINE KEEPS ITS RULE: a Garmin connection or row, and a form number to credit.
          * ⚠️ NO NUMBERS, NO CARD — an account with nothing analysed or logged gets nothing here.
          */}
        {formLine || weekTotalsLine ? (
          /**
           * ⚠️ A DIV, NOT A BUTTON, SINCE THE ⓘ WENT IN (2026-09-10) — a button inside a button is
           * invalid HTML and the inner one stops working. The card keeps the role, the label and the
           * keyboard behaviour a button gave it; the ⓘ is the only real <button> inside it.
           */
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); try { window.dispatchEvent(new CustomEvent('open:state')); } catch { /* no window */ } }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault(); e.stopPropagation();
              try { window.dispatchEvent(new CustomEvent('open:state')); } catch { /* no window */ }
            }}
            aria-label="Form and the week so far — open State"
            className="block w-full text-left cursor-pointer"
            style={{
              borderRadius: 14,
              padding: '10px 14px',
              background: 'linear-gradient(180deg, rgba(19,21,27,0.72), rgba(11,12,16,0.84))',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {formLine ? <span className="block font-light">{formLine}</span> : null}
            {showFormKey && formKey ? (
              /* ⚠️ The card grows to fit it (Michael 2026-09-10) — the key is not scrolled or clipped. */
              <div onClick={(e) => e.stopPropagation()} className="mt-1.5 max-w-[min(100%,360px)]">
                <LoadKeyForm ff={formKey.ff} zones={formKey.zones} />
              </div>
            ) : null}
            {weekTotalsLine ? (
              <span
                className="block font-light tabular-nums"
                style={{ color: 'rgba(255,255,255,0.72)', marginTop: formLine ? 6 : 0 }}
              >
                {weekTotalsLine}
              </span>
            ) : null}
            {/* ⚠️ THE SMALLEST TEXT ON THE CARD, AND IT STAYS AT 12px — Garmin's line is attribution,
                not a reading. The lines above it grew; it did not, so it is still the smallest. */}
            {garminDerived && formLine ? (
              <GarminDerivedDataLine className="text-[12px]" style={{ marginTop: 6 }} />
            ) : null}
          </div>
        ) : null}
        </div>
        </div>

      {/* Planned Workout Bottom Sheet */}
      <Drawer
        open={!!selectedPlannedWorkout}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPlannedWorkout(null);
            setPlannedDrawerStep('detail');
          }
        }}
      >
        <DrawerContent 
          className="bg-black/90 backdrop-blur-xl border-white/20"
          style={{ maxHeight: '85vh' }}
        >
          <DrawerHeader className="text-left">
            {plannedDrawerStep === 'skip' ? (
              <>
                <DrawerTitle className="text-white font-light tracking-wide text-lg">Skip this session?</DrawerTitle>
                <DrawerDescription className="text-white/55 font-light text-[13px]">
                  Optional — sharing why helps your coach interpret the week. You can skip without sharing.
                </DrawerDescription>
              </>
            ) : (
              <>
                {/**
                  * ⛔ ONE HEADER, SHARED WITH THE OTHER TWO SURFACES (2026-08-09) —
                  * `PlannedSessionHeader`. It renders the sport-coloured title and the duration on
                  * one line and the description BELOW it. This drawer previously did the opposite:
                  * `DrawerDescription` printed the description ABOVE, and `PlannedWorkoutSummary`
                  * then printed the title and `63:00` under it.
                  *
                  * ⚠️ `DrawerTitle` AND `DrawerDescription` STAY MOUNTED, SCREEN-READER-ONLY. Radix
                  * derives the dialog's accessible name from the title and its `aria-describedby`
                  * from the description, and warns when either is missing — so deleting them to fix
                  * the layout would trade a visual bug for an accessibility one. They carry the same
                  * strings the visible header renders; only the presentation moved.
                  */}
                <DrawerTitle className="sr-only">
                  {selectedPlannedWorkout ? deriveWorkoutTitle(selectedPlannedWorkout as any) : 'Planned Workout'}
                </DrawerTitle>
                <DrawerDescription className="sr-only">
                  {String(
                    (selectedPlannedWorkout as any)?.rendered_description
                    || (selectedPlannedWorkout as any)?.description
                    || 'Planned session details',
                  )}
                </DrawerDescription>
                <PlannedSessionHeader
                  workout={selectedPlannedWorkout}
                  size="panel"
                  description={(() => {
                    const w = selectedPlannedWorkout;
                    const sheetSkipped = w && String(w.workout_status || '').toLowerCase() === 'skipped';
                    if (sheetSkipped) {
                      const label = skipReasonLabel(w.skip_reason);
                      const note = typeof w.skip_note === 'string' && w.skip_note.trim() ? w.skip_note.trim() : '';
                      const parts = ['Skipped'];
                      if (label) parts.push(label);
                      if (note) parts.push(note);
                      return parts.join(' · ');
                    }
                    /**
                     * ⛔ NO PLACEHOLDER (§8, 2026-09-09). This read `|| 'No description available'`,
                     * so a session with nothing to say said so — a sentence that tells the athlete
                     * about the DATABASE, never about the session, sitting where the session's own
                     * words belong. A row with no description now renders nothing at all and the
                     * drawer closes up around it.
                     */
                    const desc = w?.rendered_description || w?.description || '';
                    if (!String(desc).trim()) return null;
                    // ⛔ NO STRIDES TOOLTIP (2026-09-10, audit H-T08). Its definition ("approx. 100m",
                    // "95% of max speed") had no source; the description prints as written.
                    return desc;
                  })()}
                />
              </>
            )}
          </DrawerHeader>
          
          <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: '50vh' }}>
            {selectedPlannedWorkout && plannedDrawerStep === 'detail' && (() => {
              const coachingNote = (selectedPlannedWorkout as any)?.computed?.coaching_note as string | undefined;
              const dismissKey = coachingNote ? `efforts.coaching_note.dismissed.${selectedPlannedWorkout.id}` : null;
              const isDismissed = dismissKey
                ? (dismissedNotes.has(dismissKey) || localStorage.getItem(dismissKey) === '1')
                : true;
              return (
                <>
                  {coachingNote && !isDismissed && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5">
                      <p className="flex-1 text-sm leading-snug text-white/60">{coachingNote}</p>
                      <button
                        type="button"
                        aria-label="Dismiss coaching note"
                        className="mt-0.5 shrink-0 text-white/30 hover:text-white/60 text-base leading-none"
                        onClick={() => {
                          if (dismissKey) {
                            localStorage.setItem(dismissKey, '1');
                            setDismissedNotes((prev) => new Set([...prev, dismissKey]));
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <PlannedWorkoutSummary
                    workout={selectedPlannedWorkout}
                    baselines={baselines as any}
                    hideLines={false}
                    /**
                     * ⛔ THE DRAWER HEADER ALREADY PRINTED THIS (2026-08-09). `PlannedSessionHeader`
                     * above renders `rendered_description || description`, and this block's
                     * subtitle falls back to the SAME string — so a plain planned run showed
                     * "~50 min easy…" twice on one screen.
                     *
                     * ⚠️ THE FIRST ATTEMPT PUT THIS PROP ON THE WRONG INSTANCE. There are two
                     * `PlannedWorkoutSummary` usages in this file — one at :87 inside the collapsible
                     * summary helper, and this one, which is the drawer's. The prop went on :87, so
                     * it fired somewhere the athlete was not looking and the drawer was untouched.
                     * A unit test could not catch that: the component was correct, the CALL SITE
                     * was wrong.
                     */
                    suppressDescriptionFallback
                    /**
                     * ⛔ THE HEADER IS ABOVE THIS (2026-08-09). `PlannedSessionHeader` in the
                     * DrawerHeader renders the sport-coloured title and `63:00`; without this the
                     * component prints both again a few pixels lower. That second copy is the
                     * "~63 min printed twice" on this surface.
                     */
                    hideHeader
                    /* §3h — the planned lift drawer is a plain list: name · sets × reps · weight. */
                    plainLiftList
                  />
                  {/* ⛔ RULING 7 (Michael 2026-09-02): a hot day changes nothing in the zone — heart rate simply
                      reads high while the run is still conversational. ONE line, today only (the weather here
                      is today's, ephemeral), only on a run whose steps are prescribed by heart rate.
                      ⛔ THE LINE AND WHEN IT SHOWS ARE `get-weather`'s (2026-09-10, audit H-T07): `heat_note`,
                      sent above the heat model's own 60°F reference. The phone's 75°F is gone. */}
                  {(() => {
                    try {
                      const w: any = selectedPlannedWorkout;
                      const isRun = /run/i.test(String(w?.type ?? w?.workout_type ?? ''));
                      const steps: any[] = Array.isArray(w?.computed?.steps) ? w.computed.steps : [];
                      const byHeartRate = isRun && steps.some((st) => st?.prescription === 'heart_rate');
                      if (!byHeartRate || !isTodayDate || !heatNote) return null;
                      return (
                        <p className="mt-2 text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.62)' }}>
                          {heatNote}
                        </p>
                      );
                    } catch { return null; }
                  })()}
                </>
              );
            })()}
          </div>

          <DrawerFooter
            className="border-t border-white/10 pt-4"
            style={{
              // Subtle discipline-tinted “instrument shelf” behind the controls
              ...(selectedPlannedWorkout
                ? (() => {
                    const raw = String(selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                    const baseType =
                      raw === 'walk' || raw === 'running' ? 'run' :
                      raw === 'bike' || raw === 'cycling' ? 'ride' :
                      raw;
                    const rgb = getDisciplineColorRgb(baseType);
                    return {
                      backgroundImage: `
                        radial-gradient(220px 120px at 20% 0%, rgba(${rgb}, 0.10) 0%, rgba(${rgb}, 0.0) 70%),
                        radial-gradient(260px 140px at 80% 0%, rgba(${rgb}, 0.08) 0%, rgba(${rgb}, 0.0) 72%),
                        linear-gradient(to bottom, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.55) 100%)
                      `,
                      backgroundBlendMode: 'screen, screen, normal',
                    } as React.CSSProperties;
                  })()
                : {}),
            }}
          >
            <div className="flex flex-col gap-3 w-full">
              {(() => {
                const w = selectedPlannedWorkout;
                const sheetSkipped = w && String(w.workout_status || '').toLowerCase() === 'skipped';
                /**
                 * ⛔ THE OPTIONS ARE THE SERVER'S (2026-09-10, audit H-T15): the way back first, then
                 * the machine and the hike, then the sports — each with its label, its line and its
                 * warnings. `useSwapSheet` fetched them for the open session.
                 */
                const swapOptions: SwapSheetOption[] = w && swapSheet ? swapSheet.options : [];
                if (plannedDrawerStep === 'swap' && w) {
                  return (
                    <div className="flex flex-col gap-2 w-full">
                      {/* ⛔ MICHAEL'S HEADER (2026-09-09), sent by `swap-session` with every other word here. */}
                      <div className="text-[13px] text-white/70 pb-1">{swapSheet?.header}</div>
                      {/* ⛔ THE SAME TWO CHOICES THE LIFT SWAP OFFERS (work order §6). Just today is the
                          default — one row — and Rest of plan writes this session's later repeats too.
                          ⛔ AN EASY SESSION OFFERS JUST TODAY ONLY (Michael, 2026-09-10). Easy work can
                          be any sport on any day; swapping every later easy ride for a run is a
                          different plan, not a swap. Hard and long sessions keep both. */}
                      <div className="flex items-center gap-2 pb-1">
                        <button
                          type="button"
                          onClick={() => setSwapRestOfPlan(false)}
                          className={`px-2.5 py-1 rounded-xl text-[12px] border transition-colors ${!swapRestOfPlan ? 'border-teal-300/60 bg-teal-400/15 text-teal-100' : 'border-white/15 bg-white/[0.04] text-white/70 hover:text-white/80'}`}
                        >Just today</button>
                        {swapSheet?.rest_of_plan ? (
                          <button
                            type="button"
                            onClick={() => setSwapRestOfPlan(true)}
                            className={`px-2.5 py-1 rounded-xl text-[12px] border transition-colors ${swapRestOfPlan ? 'border-teal-300/60 bg-teal-400/15 text-teal-100' : 'border-white/15 bg-white/[0.04] text-white/70 hover:text-white/80'}`}
                          >Rest of plan</button>
                        ) : null}
                      </div>
                      {swapOptions.map((opt) => (
                        <button
                          /* ⚠️ THE KEY IS THE KIND AND THE TARGET — a machine and a sport swap can
                             both carry the same `to`, so `to` alone repeats. */
                          key={opt.id}
                          type="button"
                          disabled={swappingSession}
                          onClick={() => handleApplyDisciplineSwap(w, opt, swapRestOfPlan && swapSheet?.rest_of_plan === true)}
                          className="w-full px-4 py-3 rounded-xl text-left text-white border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                        >
                          {/* ⛔ 15 / 13 px (Michael, 2026-09-11) — the Today card's own sizes. The paces line is
                              what says what the workout is, and it was the smallest text on the sheet. */}
                          <div className="text-[15px] font-medium">{opt.label}</div>
                          {/* ⛔ THE SESSION YOU GET, OR THE MACHINE'S / THE WAY BACK'S APPROVED LINE —
                              resolved by the server with the same resolver the tap writes with. */}
                          {opt.line ? <div className="text-[13px] text-white/55 mt-1">{opt.line}</div> : null}
                          {/* ⛔ WARN, NEVER GATE — the button above still works. */}
                          {opt.warnings.map((warn) => (
                            <div key={warn} className="text-[12px] text-amber-200/80 mt-1">{warn}</div>
                          ))}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="w-full px-4 py-2 rounded-xl text-[13px] text-white/55 hover:text-white/80"
                        onClick={() => setPlannedDrawerStep('detail')}
                      >
                        Back
                      </button>
                    </div>
                  );
                }
                if (plannedDrawerStep === 'skip' && w) {
                  return (
                    <SkipSessionReasonPanel
                      sessionTitle={String(w.name || w.rendered_description || w.description || 'Session')}
                      busy={skippingSession}
                      onBack={() => setPlannedDrawerStep('detail')}
                      onSkipWithoutReason={() => handleApplySkip(w, null, null)}
                      onConfirmSkip={(r, n) => handleApplySkip(w, r, n)}
                    />
                  );
                }
                if (sheetSkipped && w) {
                  return (
                    <button
                      type="button"
                      className="w-full px-4 py-3 rounded-xl font-medium tracking-wide text-white border border-white/15 bg-white/[0.04]"
                      onClick={() => setSelectedPlannedWorkout(null)}
                    >
                      Close
                    </button>
                  );
                }
                return (
                  <>
              {/* ⛔ THE SWAP ENTRY. Endurance sessions only, and only when there is somewhere to go —
                  a long session and a one-sport athlete both correctly offer nothing, so the control
                  hides rather than opening an empty sheet. */}
              {swapOptions.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setSwapRestOfPlan(false); setPlannedDrawerStep('swap'); }}
                  className="w-full px-4 py-3 rounded-xl font-medium tracking-wide text-white/85 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Swap sport
                </button>
              )}
              {/* Logger shortcut (Strength/Mobility/Pilates-Yoga) */}
              {selectedPlannedWorkout && (() => {
                const raw = String(selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                const isLoggerType = raw === 'strength' || raw === 'mobility' || raw === 'pilates_yoga';
                if (!isLoggerType) return null;

                const rgb = getDisciplineColorRgb(raw);
                const core = getDisciplinePhosphorCore(raw);
                const border = `rgba(${rgb}, 0.55)`;

                return (
                  <button
                    className="w-full px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: border,
                      borderWidth: '0.5px',
                      borderStyle: 'solid',
                      // Omni-ish chrome: bevel + faint grid + discipline glow
                      backgroundImage: `
                        radial-gradient(120% 120% at 26% 18%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.00) 52%),
                        radial-gradient(120% 140% at 86% 110%, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.00) 58%),
                        linear-gradient(45deg, rgba(255,255,255,0.10) 1px, transparent 1px),
                        linear-gradient(-45deg, rgba(255,255,255,0.08) 1px, transparent 1px),
                        linear-gradient(180deg, rgba(${rgb},0.12) 0%, rgba(${rgb},0.05) 55%, rgba(0,0,0,0.22) 100%)
                      `,
                      backgroundBlendMode: 'screen, multiply, soft-light, soft-light, normal',
                      boxShadow: `
                        0 0 0 1px rgba(255,255,255,0.05) inset,
                        inset 0 1px 0 rgba(255,255,255,0.14),
                        inset 0 -1px 0 rgba(0,0,0,0.45),
                        0 10px 20px rgba(0,0,0,0.24),
                        0 0 22px rgba(${rgb}, 0.10)
                      `,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.10)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        onEditEffort &&
                          onEditEffort({
                            ...selectedPlannedWorkout,
                            __openLogger: true,
                          });
                      } finally {
                        setSelectedPlannedWorkout(null);
                      }
                    }}
                  >
                    Go to workout
                  </button>
                );
              })()}

              <button
                type="button"
                disabled={skippingSession || markingComplete}
                onClick={() => setPlannedDrawerStep('skip')}
                className="w-full py-2.5 rounded-xl text-[13px] font-light text-white/45 border border-white/12 hover:text-white/60 hover:border-white/18 disabled:opacity-40"
              >
                Skip session…
              </button>

              {/* Top row: Start on Phone and Send to Garmin - side by side with yellow outlines */}
              <div className="flex gap-2 w-full">
                {selectedPlannedWorkout && isPhoneExecutable(selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '') && (() => {
                  const workoutType = (selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                  const isRun = ['run', 'running', 'walk'].includes(workoutType);
                  const isRide = ['ride', 'bike', 'cycling'].includes(workoutType);
                  const baseType = isRun ? 'run' : (isRide ? 'ride' : 'run');
                  const sportColor = getDisciplinePhosphorCore(baseType);
                  const rgb = getDisciplineColorRgb(baseType);
                  const border = `rgba(${rgb}, 0.55)`;
                  
                  return (
                    <button
                      className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                      style={{
                        backgroundColor: 'transparent',
                        borderColor: border,
                        borderWidth: '0.5px',
                        borderStyle: 'solid',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={() => {
                        setExecutingWorkout(selectedPlannedWorkout);
                        setSelectedPlannedWorkout(null);
                      }}
                    >
                      Start on Phone
                    </button>
                  );
                })()}
                
                {selectedPlannedWorkout && isEnduranceType(selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '') && (() => {
                  const workoutType = (selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                  const isRun = ['run', 'running', 'walk'].includes(workoutType);
                  const isRide = ['ride', 'bike', 'cycling'].includes(workoutType);
                  const baseType = isRun ? 'run' : (isRide ? 'ride' : 'run');
                  const sportColor = getDisciplinePhosphorCore(baseType);
                  const rgb = getDisciplineColorRgb(baseType);
                  const border = `rgba(${rgb}, 0.55)`;
                  
                  return (
                    <button
                      className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                      style={{
                        backgroundColor: 'transparent',
                        borderColor: border,
                        borderWidth: '0.5px',
                        borderStyle: 'solid',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={(e) => {
                        handleSendToGarmin(e, selectedPlannedWorkout);
                      }}
                    >
                      {sendingToGarmin === selectedPlannedWorkout?.id ? 'Sending...' : 'Send to Garmin'}
                    </button>
                  );
                })()}
              </div>

              {/* Swim-only (D-165): pool selector + Copy-for-FORM-Goggles + Apple Watch placeholder.
                  Mirrors the Planned tab so the home/calendar bottom sheet isn't a downgraded surface. */}
              {selectedPlannedWorkout && String(selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase() === 'swim' && (() => {
                const rgb = getDisciplineColorRgb('swim');
                const border = `rgba(${rgb}, 0.55)`;
                const curMeters = localPlannedPool?.lengthM ?? Number(selectedPlannedWorkout.pool_length_m ?? selectedPlannedWorkout.pool_length);
                const activeVal = Number.isFinite(curMeters)
                  ? (POOL_CHOICES.find((c) => Math.abs(c.meters - curMeters) < 0.6)?.value ?? null)
                  : null;
                return (
                  <>
                    <div className="w-full">
                      <div className="text-xs text-white/50 mb-1.5">Pool length</div>
                      <div className="flex gap-2 w-full">
                        {POOL_CHOICES.map((c) => (
                          <button
                            key={c.value}
                            disabled={savingPool}
                            onClick={() => setPlannedPool(c)}
                            className="flex-1 px-3 py-2 rounded-xl text-sm font-light text-white border transition-all disabled:opacity-50"
                            style={{ borderColor: border, borderWidth: '0.5px', borderStyle: 'solid', backgroundColor: activeVal === c.value ? `rgba(${rgb}, 0.18)` : 'transparent' }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={handleCopyFormGoggles}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium tracking-wide text-white border transition-all"
                        style={{ borderColor: border, borderWidth: '0.5px', borderStyle: 'solid', backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <Copy className="h-4 w-4 opacity-80" aria-hidden />
                        Copy for FORM Goggles
                      </button>
                      {workoutKitAvailable && (
                        <button
                          disabled={sendingToWatch === selectedPlannedWorkout?.id}
                          onClick={(ev) => handleSendToWatch(ev, selectedPlannedWorkout)}
                          className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide text-white border transition-all disabled:opacity-50"
                          style={{ borderColor: border, borderWidth: '0.5px', borderStyle: 'solid', backgroundColor: 'transparent' }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          {sendingToWatch === selectedPlannedWorkout?.id ? 'Sending...' : 'Send to Apple Watch'}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Bottom row: Mark as Complete and Close - evenly spaced with yellow outlines */}
              <div className="flex gap-2 w-full">
                {selectedPlannedWorkout && (() => {
                  const workoutType = (selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                  const isRun = ['run', 'running', 'walk'].includes(workoutType);
                  const isRide = ['ride', 'bike', 'cycling'].includes(workoutType);
                  const baseType = isRun ? 'run' : (isRide ? 'ride' : workoutType);
                  const sportColor = getDisciplinePhosphorCore(baseType);
                  const rgb = getDisciplineColorRgb(baseType);
                  const border = `rgba(${rgb}, 0.55)`;
                  
                  return (
                    <>
                      <button
                        className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                        style={{
                          backgroundColor: 'transparent',
                          borderColor: border,
                          borderWidth: '0.5px',
                          borderStyle: 'solid',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => handleMarkComplete(selectedPlannedWorkout)}
                        disabled={markingComplete}
                      >
                        {markingComplete ? 'Marking...' : 'Mark as Complete'}
                      </button>
                      <button
                        className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                        style={{
                          backgroundColor: 'transparent',
                          borderColor: border,
                          borderWidth: '0.5px',
                          borderStyle: 'solid',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => setSelectedPlannedWorkout(null)}
                      >
                        Close
                      </button>
                    </>
                  );
                })()}
              </div>
                  </>
                );
              })()}
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      
      {/* Workout Execution Modal - Rendered via Portal to avoid z-index conflicts */}
      {executingWorkout && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black">
          <WorkoutExecutionContainer
            plannedWorkoutId={executingWorkout.id}
            plannedWorkoutStructure={executingWorkout.computed || { steps: [], total_duration_seconds: 0 }}
            workoutType={['ride', 'bike', 'cycling'].includes((executingWorkout.type || executingWorkout.workout_type || '').toLowerCase()) ? 'ride' : 'run'}
            workoutDescription={executingWorkout.rendered_description || executingWorkout.description || executingWorkout.name}
            onClose={() => setExecutingWorkout(null)}
            onComplete={(workoutId) => {
              setExecutingWorkout(null);
              // Refresh the view
              window.dispatchEvent(new CustomEvent('workouts:invalidate'));
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default TodaysEffort;