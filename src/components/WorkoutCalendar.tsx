import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { analysisNeedsAttention, analysisFailureLine } from '@/lib/analysis-state';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, getStoredUserId } from '@/lib/supabase';
// import { generateWorkoutDisplay } from '../utils/workoutCodes';
import { normalizeDistanceKm, normalizeDistanceMiles, formatMilesShort, typeAbbrev, isBaselineTestWorkout, isPlyoSession, displayDisciplineOf } from '@/lib/utils';
import { getDisciplineColor, getDisciplineColorRgb, getDisciplineGlowColor, getDisciplinePhosphorPill, getDisciplineGlowStyle, getDisciplinePhosphorCore, STATUS_COLORS } from '@/lib/context-utils';
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { useAppContext } from '@/contexts/AppContext';
import { Activity, ArrowLeftRight, Bike, Link2Off, Waves, Dumbbell, Move, CircleDot, Zap, type LucideIcon } from 'lucide-react';
import { isDisciplineSwapped } from '@/lib/session-discipline-swap';
// ⛔ ONE GATE FOR "CAN THIS BE SWAPPED" — the server's, the same answer Today's cards use. See the glyph.
import { useSportSwapIds } from '@/hooks/useSwapSheet';
// ⛔ THE SAME "did this miss a planned slot" RULE the workout view uses — never a second copy.
import { isUnmatchedAgainstPlan } from '@/lib/associate-candidates';
// ⛔ THE SERVER'S NUMBERS, READ (2026-09-10, audit H-T01 / H-D10 / H-T04): `planned_duration_seconds`
// ahead, `moving_seconds` and `strength_volume_lb` once done. The phone resolvers are deleted.
import { plannedDurationSecondsOf } from './PlannedSessionHeader';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
import { GARMIN_BLUE } from '@/components/ProviderAttribution';
import { garminDevicesForWeek } from '@/lib/provider-attribution';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { LogTypeMenuContent } from '@/components/LogFAB';
import RescheduleValidationPopup from '@/components/RescheduleValidationPopup';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
// ⚠️ `LoadBar` IS NO LONGER IMPORTED HERE — the load card it fed left this screen for Today
// (2026-09-09), and came off Today too (§3g). `LoadBar` itself lives on, on State.
// ⚠️ `weekExecTotals` went with it — it fed that card's planned/done inputs and nothing else on this
// screen. This week's planned-versus-done is `weekTotals` below, counted off the rows on screen.
import { invalidateWorkoutScreens } from '@/utils/invalidateWorkoutScreens';
import { fetchWeekUnified } from '@/lib/fetchWeekUnified';
import { orderDayWorkoutsByTimingThenDiscipline } from '@/lib/pairing-timing';
import { useStrengthOrderingPreference } from '@/lib/use-strength-ordering-preference';

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
  /** §3f — a session line opens THAT DAY on the Today tab. */
  onOpenToday?: (dateISO: string) => void;
  selectedDate?: string;
  onSelectRoutine?: (type: string) => void;
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
  /**
   * ⛔ THE PLYO DAY GETS THE BOLT, NOT THE DUMBBELL (Michael, 2026-08-25). It is `type: 'strength'`
   * on the wire, so it drew a dumbbell — which said "lifting" in the one glyph the magenta chip
   * exists to stop saying. A drill day is jumps and skips and there is no bar in it.
   *
   * ⚠️ THE ENTRY IS LOAD-BEARING, not decoration: without a row here `resolveDisciplineForIcon`
   * falls `plyo` through its label regexes to the `run` default and the chip silently draws the
   * run icon.
   */
  plyo: Zap,
};

function resolveDisciplineForIcon(workoutType: string, label: string): string {
  const type = workoutType.toLowerCase();
  if (type && DISCIPLINE_ICONS[type]) return type;
  const labelLower = label.toLowerCase();
  if (/^rn[- ]|run|rnvo2|rn-lr|rn-tmp|rn-int/.test(labelLower)) return 'run';
  if (/^bk|bike|ride|cycling/.test(labelLower)) return 'ride';
  if (/^sm|swim|swimming/.test(labelLower)) return 'swim';
  if (/plyo/.test(labelLower)) return 'plyo';
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
    
    // ⛔ The server's planned length (`planned_duration_seconds`) — never resolved here.
    const secs = plannedDurationSecondsOf(w);
    const mins = secs && secs > 0 ? Math.round(secs / 60) : 0;
    const durStr = mins > 0 ? `${mins}:00` : '';

    const has =(pat: RegExp) => steps.some(s => pat.test(s)) || pat.test(txt);

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
      // 2026-05-22: tag-first dispatch. The session-factory emits authoritative
      // classification via tags (long_ride, brick, easy, recovery, group_ride, etc.).
      // Tags are unambiguous; the older token/text regex dispatch matched broad
      // shared terms ("z2", "endurance") that the Easy Ride + Long Ride both carry,
      // so a Friday Easy Ride rendered as "BK-LR" — same chip as the Saturday Long
      // Ride. Tag dispatch fixes that. Token/text regex remains as a fallback for
      // legacy plans materialized before specific tags were emitted.
      const tagsLower = tags.map(String).map((t: string) => t.toLowerCase());
      const hasTag = (t: string) => tagsLower.includes(t);
      const isGroupRideAnchor =
        hasTag('group_ride') || hasTag('anchor') || has(/group_ride|group\s*ride/i);

      /**
       * ⛔⛔ THE `band:` TAG DECIDES HARD FROM EASY, AND NOTHING ELSE MAY (§3e.5, device finding).
       *
       * A swapped anaerobic ride was labelled `BK-EZ`. The row carries `band:above` and
       * `family:ride_anaerobic` — it is the hardest session in the week — and it reached the easy
       * branch because the dispatch below never asked the band at all: it asked for an `easy` or
       * `recovery` TAG, then fell through to a regex over the description, and a composed ride's
       * prose says "easy" in its warm-up sentence.
       *
       * ⚠️ AND THE FALLBACK IS THE OTHER HALF OF THE BUG. `has(/recovery|easy/i)` matched text, so a
       * hard session whose cue mentions easy spinning was labelled easy. Both the tag branch and the
       * text branch are now gated behind the band: a row the composer banded `near` or `above` can
       * never be labelled easy, whatever its words say.
       */
      const bandTag = tagsLower.find((t) => t.startsWith('band:'))?.slice('band:'.length) ?? null;
      const bandedHard = bandTag === 'near' || bandTag === 'above';
      const bandedEasy = bandTag === 'vt1_or_easier';

      if (isGroupRideAnchor) label = 'Group Ride';
      // Tag-first dispatch (authoritative).
      else if (hasTag('brick')) label = `BK-BRK${durStr ? ` ${durStr}` : ''}`.trim();
      else if (hasTag('openers')) label = `BK-OPN${durStr ? ` ${durStr}` : ''}`.trim();
      else if (hasTag('long_ride')) label = `BK-LR${durStr ? ` ${durStr}` : ''}`.trim();
      // ⚠️ A BANDED-HARD ROW SKIPS THIS ENTIRELY, tag or no tag.
      else if (!bandedHard && (hasTag('recovery') || hasTag('easy'))) label = `BK-EZ${durStr ? ` ${durStr}` : ''}`.trim();
      // Token / text fallback (legacy plans without authoritative tags).
      else if (has(/bike_vo2_/i) || has(/vo2/i)) label = `BK-VO2${durStr ? ` ${durStr}` : ''}`.trim();
      else if (has(/bike_thr_/i)) label = `BK-THR${durStr ? ` ${durStr}` : ''}`.trim();
      else if (has(/bike_ss_/i)) label = `BK-SS${durStr ? ` ${durStr}` : ''}`.trim();
      else if (has(/long\s*ride|long_ride/i)) label = `BK-LR${durStr ? ` ${durStr}` : ''}`.trim();
      // ⛔ THE TEXT FALLBACK NEEDS THE BAND TO AGREE, or an unbanded row. It may never overrule one.
      else if ((bandedEasy || bandTag == null) && has(/recovery|easy/i)) label = `BK-EZ${durStr ? ` ${durStr}` : ''}`.trim();
      else label = `BK${durStr ? ` ${durStr}` : ''}`.trim();
      return label;
    }

    // SWIM — duration + the server's total and unit (2026-09-10, audit H-T20: materialize-plan writes it)
    if (type === 'swim') {
      const dist: string | null = w?.computed?.swim_distance?.label || null;
      const distPart = dist ? ` ${dist}` : '';
      // For optional swims, just show "OPT SM" with duration
      if (isOptional) {
        return durStr ? `OPT SM ${durStr}${distPart}`.trim() : dist ? `OPT SM${distPart}`.trim() : 'OPT SM';
      }
      let label = '';
      if (has(/swim_intervals_/i)) label = durStr ? `SM-INT ${durStr}${distPart}`.trim() : `SM-INT${distPart}`.trim();
      else if (has(/technique|drill|drills|swim_drills_/i))
        label = durStr ? `SM-DRL ${durStr}${distPart}`.trim() : `SM-DRL${distPart}`.trim();
      else label = durStr ? `SM ${durStr}${distPart}`.trim() : `SM${distPart}`.trim();
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
      // A 1RM/baseline TEST is measurement, not training — label it as such (Q-097/Q-102).
      if (isBaselineTestWorkout(w)) return 'TEST';
      /**
       * ⛔ THE PLYOMETRIC DRILL DAY IS NOT A LIFTING DAY, AND THE CHIP SAID IT WAS (2026-08-25).
       * It arrives `type: 'strength'` from `standing-plan/compose.ts`, so every branch below read it
       * as a lift and drew `STG` — a four-lift week showed five identical orange chips.
       * ⚠️ THE TAG DECIDES. `isPlyoSession` is the one reader; the name is a display string.
       */
      if (isPlyoSession(w)) return isOptional ? 'OPT PLYO' : 'PLYO';
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
  onOpenToday,
  selectedDate,
  onSelectRoutine,
  currentPlans = [],
  completedPlans = [],
  workouts = [],
  plannedWorkouts = []
}: WorkoutCalendarProps) {
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  /** §3e.3 — which day's add menu is open. One at a time; null is closed. */
  const [addMenuDate, setAddMenuDate] = useState<string | null>(null);


  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchStartT, setTouchStartT] = useState<number | null>(null);
  const { useImperial } = useAppContext();
  const { updatePlannedWorkout, deletePlannedWorkout } = usePlannedWorkouts({ fetchWindowedPlanned: false });
  const coachCtx = useCoachWeekContext();
  
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

  /**
   * ⛔ ONE MOVE, TWO GESTURES (§3f). The mouse's drop and the finger's press-and-hold both end here,
   * so the validation, the warnings and the confirm popup cannot differ between them. This was
   * inline in `handleDrop`, which is why touch had no move at all.
   */
  const beginReschedule = useCallback(async (workout: any, targetDate: string) => {
    if (!workout?.id) return;
    const oldDate = workout.date || toDateOnlyString(new Date());
    if (oldDate === targetDate) return;

    try {
      const { data, error } = await supabase.functions.invoke('validate-reschedule', {
        body: { workout_id: workout.id, new_date: targetDate },
      });
      if (error) {
        console.error('Validation error:', error);
        return;
      }
      setValidationResult(data);
      setReschedulePending({
        workoutId: workout.id,
        oldDate,
        newDate: targetDate,
        workoutName: workout.name || `${workout.type} workout`,
      });
      setShowValidationPopup(true);
    } catch (err) {
      console.error('Error validating reschedule:', err);
    }
  }, []);

  // Handle drop - validate and show popup
  const handleDrop = async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const workout = draggedWorkout;
    setDraggedWorkout(null);
    await beginReschedule(workout, targetDate);
  };

  /**
   * ═══ §3f — PRESS AND HOLD TO MOVE A SESSION ════════════════════════════════════════════════════
   *
   * ⛔ HTML5 DRAG DOES NOT EXIST ON TOUCH. `draggable` + `dragstart` fire for a mouse and never for
   * a finger, so the move this calendar has always had was a desktop-only feature on a phone-first
   * app. The finger gets its own path to the SAME move — `beginReschedule`, one owner, so the touch
   * path can never validate differently from the mouse path.
   *
   * ⚠️ THE HOLD IS WHAT SEPARATES IT FROM A TAP AND FROM A SCROLL. 450 ms, cancelled by any travel
   * over 10 px before it fires — a thumb that starts moving was scrolling or swiping the week, and
   * stealing that gesture is how a calendar becomes impossible to scroll past.
   */
  const daysGridRef = useRef<HTMLDivElement | null>(null);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; row: any; from: string } | null>(null);
  const [touchDragId, setTouchDragId] = useState<string | null>(null);
  const [touchDragOver, setTouchDragOver] = useState<string | null>(null);
  /** Refs as well as state: the native listener below reads them without re-binding on every drag. */
  const touchDragRef = useRef<{ row: any; from: string; over: string | null } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPress.current?.timer) clearTimeout(longPress.current.timer);
    longPress.current = null;
    touchDragRef.current = null;
    setTouchDragId(null);
    setTouchDragOver(null);
  }, []);

  const beginLongPress = useCallback((e: React.TouchEvent, row: any, from: string) => {
    const planned = String(row?.workout_status ?? '').toLowerCase() !== 'completed';
    if (!planned || !row?.id) return;
    const t = e.touches[0];
    if (!t) return;
    if (longPress.current?.timer) clearTimeout(longPress.current.timer);
    longPress.current = {
      x: t.clientX,
      y: t.clientY,
      row,
      from,
      timer: setTimeout(() => {
        touchDragRef.current = { row, from, over: null };
        setTouchDragId(String(row.id));
        // ⚠️ A NUDGE SO THE HOLD IS FELT, where the device offers one. Silent on the rest.
        try { (navigator as { vibrate?: (n: number) => void }).vibrate?.(12); } catch { /* not offered */ }
      }, 450),
    };
  }, []);

  /**
   * ⛔ A NATIVE, NON-PASSIVE `touchmove` — React's own is passive, and a passive listener cannot
   * call `preventDefault()`. Without that call the page keeps scrolling under a session the athlete
   * is trying to carry to another day, which is not a drag, it is a fight.
   *
   * ⚠️ IT ONLY TAKES THE GESTURE ONCE THE HOLD HAS FIRED. Before that it does the opposite job:
   * any travel over 10 px CANCELS the pending hold and hands the gesture back to the page.
   */
  useEffect(() => {
    const el = daysGridRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;

      const pending = longPress.current;
      if (pending?.timer && !touchDragRef.current) {
        if (Math.abs(t.clientX - pending.x) > 10 || Math.abs(t.clientY - pending.y) > 10) {
          clearTimeout(pending.timer);
          longPress.current = null;
        }
        return;
      }
      if (!touchDragRef.current) return;

      e.preventDefault();
      const under = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
      const day = under?.closest('[data-day]') as HTMLElement | null;
      const over = day?.getAttribute('data-day') ?? null;
      if (touchDragRef.current.over !== over) {
        touchDragRef.current.over = over;
        setTouchDragOver(over);
      }
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  const endLongPress = useCallback(() => {
    const drag = touchDragRef.current;
    if (longPress.current?.timer) clearTimeout(longPress.current.timer);
    longPress.current = null;
    touchDragRef.current = null;
    setTouchDragId(null);
    setTouchDragOver(null);
    if (drag?.over && drag.over !== drag.from) void beginReschedule(drag.row, drag.over);
  }, [beginReschedule]);

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
      invalidateWorkoutScreens();

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
  const queryClient = useQueryClient();
  const weekStaleMs = (import.meta.env?.DEV ? 5 : 60) * 60 * 1000;
  const { items: unifiedItems, weeklyStats, trainingPlanContext, loading: unifiedLoading, error: unifiedError } = useWeekUnified(fromISO, toISO);

  // Warm previous/next week in React Query so swipe/navigation hits cache (matches useWeekUnified staleTime)
  useEffect(() => {
    const uid = getStoredUserId();
    if (!uid || !fromISO || !toISO) return;
    const prefetch = (from: string, to: string) => {
      void queryClient.prefetchQuery({
        queryKey: ['weekUnified', 'me', uid, from, to],
        queryFn: () => fetchWeekUnified(from, to),
        staleTime: weekStaleMs,
      });
    };
    const prevMon = addDays(weekStart, -7);
    const prevSun = addDays(weekStart, -1);
    prefetch(toDateOnlyString(prevMon), toDateOnlyString(prevSun));
    const nextMon = addDays(weekStart, 7);
    const nextSun = addDays(weekStart, 13);
    prefetch(toDateOnlyString(nextMon), toDateOnlyString(nextSun));
  }, [queryClient, fromISO, toISO, weekStaleMs]);

  // ⛔ THE SERVER'S CONTRACT, NOT A CLIENT COPY (stage 3). `get-week` attaches `planned_workout` to
  // exactly the items that carry `planned`, which is the filter directly above — so the old
  // `?? mapUnifiedItemToPlanned(it)` fallback was unreachable here and is gone with the mapper.
  const unifiedPlanned = unifiedItems
    .filter((it:any)=> !!it?.planned)
    .map((it:any)=> it.planned_workout);
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
    // (`completedWorkoutKeys` — a date+type set — was deleted with its only consumer below. It
    //  suppressed a planned row whenever any completed session of the same sport existed that day.
    //  ⚠️ `plannedCountByKey` and `completedPlannedKeys` below are ALSO unused, and already were
    //  before this change — left in place rather than swept up in an unrelated edit.)
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
    
    // A PLANNED ROW IS HIDDEN ONLY WHEN SOMETHING IS ACTUALLY LINKED TO IT.
    //
    // ⛔ THE DATE+TYPE CLAUSE IS GONE. It read: "never show planned when completed exists for
    // date+type (handles missing planned_id from auto-attach)" — and that parenthesis is the whole
    // story. It was COVER FOR A BROKEN ATTACH. When auto-attach silently failed to set a
    // `planned_id`, the day drew a planned row beside its own completed twin and looked duplicated,
    // so the calendar suppressed the planned side by day and sport instead.
    //
    // The attach is now honest: it DECLINES a session whose lifts don't match the planned day
    // rather than guessing (see `strengthSessionsShareTheWork`). So an unlinked planned row on a
    // day you trained is no longer a bookkeeping artefact — it is real, prescribed work you have
    // not done, and hiding it is the calendar lying about what is left.
    //
    // Michael, 2026-07-29, on a Tuesday carrying a logged Overhead Press and a planned Back Squat:
    // *"it doesnt materialze on 7/28"*. The row was fine — 5 steps, an hour, status `planned`. It
    // was suppressed here.
    //
    // ⚠️ `get-week` ALREADY SENDS BOTH (`get-week/index.ts:1054` — "Add the planned row as a
    // separate item so UI shows both"). The server was right and the client was overriding it; this
    // is the client catching up, not a new behaviour.
    //
    // ⚠️ WHAT THIS CAN NOW DRAW that it did not before: a completed session and an unlinked planned
    // session of the same sport on one day. In every case that reaches here — a declined content
    // match, two planned rows on one day (ambiguous, never guessed), or an ingest where attach never
    // ran — that IS the truth, and the second row carries an Attach control.
    const mappedPlanned = plannedArr
      .filter((p:any) => !workoutIdByPlannedId.has(String(p?.id)));

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
            // ⛔ The server's planned length — never resolved here.
            const secs = plannedDurationSecondsOf(w);
            const mins = secs && secs > 0 ? Math.round(secs / 60) : 0;
            const durStr = mins > 0 ? `${mins}:00` : '';
            labelBase = durStr ? `${t} ${durStr}`.trim() : t;
          } else {
            // Strength/mobility have no meaningful distance — just show the type abbreviation
            const isStrengthLike = /strength|mobility|pilates/i.test(String(w?.type || ''));
            labelBase = isStrengthLike ? t : [t, milesText].filter(Boolean).join(' ');
          }
        } else {
          // If plannedLabel exists but doesn't have duration for bikes/swims, try to add it
          const type = String(w?.type || '').toLowerCase();
          const isPlanned = String(w?.workout_status||'').toLowerCase() === 'planned';
          if (isPlanned && (type === 'ride' || type === 'bike' || type === 'swim')) {
            // Already has duration: explicit min text, or clock mm:ss / h:mm:ss (planned chips use "28:00")
            const hasDuration =
              /\d+m\b|\d+\s*min\b/i.test(labelBase) ||
              /\b\d{1,4}:\d{2}\b/.test(labelBase);
            if (!hasDuration) {
              // ⛔ The server's planned length — never resolved here.
              const secs = plannedDurationSecondsOf(w);
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
        
        // A 1RM/baseline TEST reads as a test on the calendar, not a strength session (Q-097/Q-102).
        // Covers unlinked completed tests via name; linked ones already resolve via the planned label above.
        if (isBaselineTestWorkout(w)) labelBase = 'TEST';

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

  /**
   * ⛔ COMPLETED ACTIVITIES THAT MISSED A PLANNED SLOT — TrainingPeaks shows this in the week, not
   * only inside the activity, so an athlete learns about a miss while looking at their calendar
   * rather than by opening something (2026-08-08).
   *
   * ⚠️ IT IS NOT "unlinked". An extra easy spin on a rest day is unlinked and has missed nothing —
   * `isUnmatchedAgainstPlan` requires the DAY to still owe a planned session, which is exactly the
   * swap-then-did-the-other-sport case. A marker that fires on every extra teaches people to ignore
   * markers.
   */
  const unmatchedIds = useMemo(() => {
    const rows = (events ?? []).map((e) => (e as { _src?: unknown })?._src).filter(Boolean) as Array<Record<string, unknown>>;
    const byDay = new Map<string, Array<Record<string, unknown>>>();
    for (const r of rows) {
      const d = String(r?.date ?? '').slice(0, 10);
      const arr = byDay.get(d) ?? [];
      arr.push(r);
      byDay.set(d, arr);
    }
    const ids: Set<string> = new Set();
    for (const [, dayRows] of byDay) {
      const planned = dayRows.filter((r) => String(r?.workout_status ?? '').toLowerCase() !== 'completed'
        || !!r?.completed_workout_id);
      for (const r of dayRows) {
        if (isUnmatchedAgainstPlan(r as never, planned as never)) ids.add(String(r?.id ?? ''));
      }
    }
    ids.delete('');
    return ids;
  }, [events]);

  /**
   * ⛔ WHICH SESSIONS CAN BE SWAPPED — the server's answer for the week's rows (`swap-session`,
   * 2026-09-10, audit H-T15), the same question Today's cards ask, so the chip and the control agree.
   */
  const eventRowIds = useMemo(
    () => (events ?? []).map((e) => String((e as { _src?: { id?: unknown } })?._src?.id ?? '')).filter(Boolean),
    [events],
  );
  const swappableIds = useSportSwapIds(eventRowIds);


  // Day-stacked ordering (Bug: calendar cells ignored strength_ordering_preference —
  // 4th consumer the May-13 consolidation never wired up). One week-level dominant
  // planId (single-plan weeks are the overwhelmingly common case; same first-found
  // approximation TodaysEffort accepts per-day). Pref drives the shared
  // orderDayWorkoutsByTimingThenDiscipline helper applied per day-cell below.
  const weekPlanId = useMemo<string | null>(() => {
    const found = events.find((e: any) => e?._src?.training_plan_id)?._src?.training_plan_id;
    return typeof found === 'string' && found ? found : null;
  }, [events]);
  const { value: weekOrderingPref } = useStrengthOrderingPreference(weekPlanId);

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


  /**
   * ⛔ THE WEEK BAR PRINTS `weekly_stats` (2026-09-10, audit H-T03). Its two totals were summed here
   * off the rows on screen, and a finished session's planned row is hidden there, so its ACTUAL time
   * was added to "Planned" — the plan grew as the athlete trained. get-week now counts them
   * (`get-week/week-totals.ts`): planned minutes and metres at each session's planned length, done at
   * its moving time and recorded distance, lifts counted. The only thing left here is the unit.
   */
  const weekTotals = useMemo(() => {
    const ws = (weeklyStats ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const toDist = (m: number) => (useImperial ? m / 1609.34 : m / 1000);
    return {
      plannedMin: n(ws.planned_minutes),
      doneMin: n(ws.done_minutes),
      plannedMiles: toDist(n(ws.planned_meters)),
      doneMiles: toDist(n(ws.done_meters)),
      liftsPlanned: n(ws.lifts_planned),
      liftsDone: n(ws.lifts_done),
    };
  }, [weeklyStats, useImperial]);

  /** The week's own devices, off the rows already on screen. Absent when none of them are Garmin. */
  const garminDevices = useMemo(
    () => garminDevicesForWeek(
      weekDays.flatMap((day) => (map.get(toDateOnlyString(day)) ?? []).map((evt: any) => evt?._src).filter(Boolean)),
    ),
    [weekDays, map],
  );

  const distanceUnitLabel = useImperial ? 'mi' : 'km';

  /**
   * ⛔ HOW LONG, THE ONE WAY (§3f). `1h 06m` · `37m`. The minutes are zero-padded ONLY beside an
   * hour, which is what the mockup prints and what stops `1h 6m` reading as a typo.
   */
  const fmtDur = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };

  /** How much of the week's planned work is done. Clamped, because a long day can overshoot. */
  const weekProgressPct = weekTotals.plannedMin > 0
    ? Math.max(0, Math.min(1, weekTotals.doneMin / weekTotals.plannedMin))
    : 0;

  /**
   * ⛔ WHAT A SESSION LINE SAYS ON THE RIGHT (§3f): the LENGTH while it is still ahead, the REAL
   * NUMBERS once it is done — `3.6 mi · 37m` for a ride or run, `8,817 lb` for a lift.
   *
   * ⚠️ A LIFT PRINTS NEITHER DISTANCE NOR, WHEN DONE, ITS DURATION. Its mileage is nothing and the
   * time it took is the least interesting thing about it; the weight moved is the fact.
   */
  const sessionLineMeta = (row: any, imperial: boolean): string => {
    const done = String(row?.workout_status ?? '').toLowerCase() === 'completed';
    const isLift = String(row?.type ?? row?.workout_type ?? '').toLowerCase() === 'strength';
    // ⛔ THE SERVER'S TIME (2026-09-10, audit H-D10): `moving_seconds` once done, the planned length ahead.
    const secs = done ? Number(row?.moving_seconds) : plannedDurationSecondsOf(row);
    const mins = secs && secs > 0 ? Math.round(secs / 60) : 0;

    if (isLift && done) {
      /**
       * ⛔ THE WEIGHT MOVED IS `strength_volume_lb`, PRICED BY THE SERVER (2026-09-10, audit H-T04). This
       * summed reps × weight here and skipped every 0 lb set, so a chin-up, a band or an empty bar
       * counted nothing on the Week row and something on the Performance tab.
       */
      const volume = Number(row?.strength_volume_lb) || 0;
      if (volume > 0) {
        const shown = imperial ? volume : volume * 0.453592;
        return `${Math.round(shown).toLocaleString()} ${imperial ? 'lb' : 'kg'}`;
      }
      return mins > 0 ? fmtDur(mins) : '';
    }

    const parts: string[] = [];
    if (done) {
      const km = normalizeDistanceKm(row);
      if (km != null && Number.isFinite(km) && km > 0) {
        parts.push(imperial ? `${(km * 0.621371).toFixed(1)} ${distanceUnitLabel}` : `${km.toFixed(1)} ${distanceUnitLabel}`);
      }
    }
    if (mins > 0) parts.push(fmtDur(mins));
    return parts.join(' · ');
  };

  /**
   * A sport token plus an alpha, for today's wash. ⚠️ THE TOKENS ARE HEX (`SPORT_COLORS`), so this
   * is the one place that needs to turn one into an `rgba` rather than every call site guessing.
   */
  const hexA = (hex: string, alpha: number): string => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  };

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
      className="w-full flex-1 flex flex-col touch-pan-y bg-transparent relative min-h-0 overflow-y-auto"
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

      {/**
        * ⛔ WHERE THIS WEEK'S NUMBERS CAME OFF, ONCE (2026-09-09). Garmin API Brand Guidelines
        * v6.30.2025 permit a global attribution — "such as in a header or footer" — for a
        * multi-entry display, as an alternative to attributing every entry. Seven rows of one-line
        * sessions are that display, and the per-row line it replaces is in this file's history two
        * hunks up.
        *
        * ⛔ 12 px, AND NEVER IN A TOOLTIP OR A COLLAPSED SECTION — the same guidelines: "Never bury
        * the Garmin attribution in tooltips, footnotes or expandable containers."
        *
        * ⚠️ NO STRAVA MARK. This is a list of DEVICES; Strava's own attribution stays on Today's
        * done card, which is a summary card rather than a multi-entry display and keeps its
        * per-entry line. ⚠️ ABSENT ON A WEEK WITH NO GARMIN DATA — an attribution to nothing is
        * noise, not compliance.
        */}
      {garminDevices.length > 0 ? (
        <div
          className="px-1 pb-1.5 text-[12px] font-light truncate"
          style={{ color: GARMIN_BLUE, position: 'relative', zIndex: 1 }}
        >
          {garminDevices.join(' · ')}
        </div>
      ) : null}

      {/**
        * ═══ §3f — DONE OVER PLANNED, ONE BAR ════════════════════════════════════════════════════
        *
        * ⛔ IT REPLACES THE TWO-LINE Planned / Done TEXT (§3e.4 shipped that; the mockup replaces
        * it). Two stacked sentences of numbers made the athlete do the division themselves; the bar
        * IS the division, and the two figures stay beside it for the athlete who wants them.
        *
        * ⛔ THE FILL IS THE RUN → RIDE GRADIENT, the same two sport tokens the rest of the app uses.
        * ⚠️ NUMBERS COUNTED OFF THE ROWS ALREADY ON SCREEN — nothing fetched, nothing recomputed by
        * a second reader. A figure here that disagreed with the lines under it is worse than none.
        */}
      {(weekTotals.plannedMin > 0 || weekTotals.doneMin > 0 || weekTotals.liftsPlanned > 0) ? (
        <div
          className="grid items-center gap-2.5 px-1 pb-2.5 text-[0.7rem] font-light tabular-nums"
          style={{ gridTemplateColumns: 'auto 1fr auto', color: 'rgba(255,255,255,0.38)', position: 'relative', zIndex: 1 }}
        >
          <span style={{ color: 'rgba(255,255,255,0.62)' }}>
            Done {fmtDur(weekTotals.doneMin)}
            {weekTotals.doneMiles >= 0.05 ? ` · ${weekTotals.doneMiles.toFixed(0)} ${distanceUnitLabel}` : ''}
          </span>
          <span
            aria-hidden="true"
            className="block rounded-full overflow-hidden"
            style={{ height: 4, background: 'rgba(255,255,255,0.08)' }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.round(weekProgressPct * 100)}%`,
                background: `linear-gradient(90deg, ${getDisciplineColor('run')}, ${getDisciplineColor('ride')})`,
                transition: 'width 320ms ease',
              }}
            />
          </span>
          <span>
            Planned {fmtDur(weekTotals.plannedMin)}
            {weekTotals.plannedMiles >= 0.05 ? ` · ${weekTotals.plannedMiles.toFixed(0)} ${distanceUnitLabel}` : ''}
            {weekTotals.liftsPlanned > 0 ? ` · ${weekTotals.liftsPlanned} ${weekTotals.liftsPlanned === 1 ? 'lift' : 'lifts'}` : ''}
          </span>
        </div>
      ) : null}

      {/**
        * ═══ §3f — SEVEN ROWS, AND A SESSION IS A LINE ═══════════════════════════════════════════
        *
        * Michael, 2026-09-09: the Week tab *"feels like an afterthought"*. It was seven little cards
        * of chips floating in a pane; the mockup makes it a week — rows edge to edge that divide the
        * pane between them, and a session written out rather than abbreviated into a badge.
        *
        * ⛔ ROWS FILL THE PANE, `1fr` EACH, WITH A HAIRLINE BETWEEN. No gaps, no card chrome, no
        * space below Sunday. The row IS the day; the line between two days is all the structure the
        * eye needs.
        *
        * ⛔ A SESSION IS A LINE: sport dot · name · length or real numbers · a mark at the right.
        * The name is the row's OWN name, not a code derived from it — every abbreviation this screen
        * used to print (`BK-EZ`, `RN-LR`, `ST`) was a private alphabet the athlete had to learn, and
        * it was wrong often enough to be worse than nothing.
        */}
      <div
        ref={daysGridRef}
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, 1fr)',
          flex: 1,
          minHeight: 0,
          borderTop: '1px solid rgba(255,255,255,0.10)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {weekDays.map((d) => {
          const key = toDateOnlyString(d);
          /** One reading of "today" per row — a miss is a day that has GONE, so today is never one. */
          const todayKey = toDateOnlyString(new Date());
          const items = orderDayWorkoutsByTimingThenDiscipline(
            map.get(key) ?? [],
            weekOrderingPref,
            (e: any) => e?._src,
          );
          const isToday = todayKey === key;
          const isPast = key < todayKey;

          /**
           * ⛔ TODAY IS LIT IN ITS FIRST SESSION'S COLOUR (the mockup) — the wash and the 3 px bar
           * both. The day's own work is what colours it; a fixed accent would say the same thing on
           * a lifting Tuesday and a long-ride Saturday.
           * ⚠️ A TODAY WITH NOTHING ON IT gets a neutral bar rather than a borrowed sport colour.
           */
          const leadSport = items.length > 0 ? displayDisciplineOf(items[0]?._src) : null;
          const todayColour = leadSport ? getDisciplineColor(leadSport) : 'rgba(242,240,236,0.55)';

          return (
            <PopoverPrimitive.Root
              key={key}
              open={addMenuDate === key}
              onOpenChange={(o) => setAddMenuDate(o ? key : null)}
            >
            <PopoverPrimitive.Anchor asChild>
            {/**
              * ⛔ A `div`, NOT A `button`. It contains the session lines, which are controls of their
              * own — a button inside a button is invalid HTML that browsers may drop or relocate,
              * and this row used to be exactly that.
              *
              * ⚠️ THE ONLY NEW WORDS ON THIS SCREEN ARE Done, Planned AND Rest. `Add a session` is
              * the row's accessible name, approved with §3e; it is not printed.
              */}
            <div
              data-day={key}
              role="button"
              tabIndex={0}
              aria-label="Add a session"
              onClick={() => { handleDayClick(d); setAddMenuDate(key); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDayClick(d); setAddMenuDate(key); } }}
              onDragOver={(e) => handleDragOver(e, key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, key)}
              className="grid items-center relative cursor-pointer transition-colors"
              style={{
                gridTemplateColumns: '52px 1fr',
                borderBottom: '1px solid rgba(255,255,255,0.10)',
                paddingLeft: 10,
                paddingRight: 2,
                minWidth: 0,
                background: isToday
                  ? `linear-gradient(90deg, ${hexA(todayColour, 0.12)}, transparent 70%)`
                  : dragOverDate === key || touchDragOver === key
                    ? 'rgba(255,255,255,0.05)'
                    : 'transparent',
              }}
            >
              {/* ⛔ TODAY'S 3 px BAR, at the pane's left edge. */}
              {isToday ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2,
                    background: todayColour, boxShadow: `0 0 10px ${todayColour}`,
                  }}
                />
              ) : null}

              {/* The day. Weekday small and dim, the number large. */}
              <div
                className="text-[12px] uppercase"
                style={{ color: 'rgba(242,240,236,0.36)', lineHeight: 1.15, letterSpacing: '0.04em' }}
              >
                {weekdayFmt.format(d)}
                {/* One weight and one colour on every day, past or future — the date column is a fixed
                    reference and carries no state (Michael, 2026-09-09: 10–13 read bolder than 7–9). State
                    lives on the session lines. tabular-nums so 7 and 10 sit on the same column. */}
                <b className="block text-[18px] font-normal tabular-nums" style={{ color: 'rgba(242,240,236,0.85)', letterSpacing: 0 }}>
                  {d.getDate()}
                </b>
              </div>

              <div className="flex flex-col gap-1 min-w-0">
                {items.length === 0 ? (
                  /* ⛔ `Rest` ONLY WHERE A PLAN SAYS SO. A day with no plan behind it has nothing to
                     say about itself, and calling it rest would be the app inventing a prescription. */
                  trainingPlanContext ? (
                    <span className="text-[14px] italic" style={{ color: 'rgba(242,240,236,0.36)' }}>Rest</span>
                  ) : null
                ) : items.map((evt: any, i: number) => {
                  const row = evt?._src;
                  const done = String(row?.workout_status ?? '').toLowerCase() === 'completed';
                  const planned = !done && String(row?.workout_status ?? '').toLowerCase() !== 'skipped';
                  const missed = planned && isPast;
                  const swapped = isDisciplineSwapped(row as never);
                  const sport = displayDisciplineOf(row);
                  const colour = getDisciplineColor(sport);
                  /* ⚠️ THE ROW'S OWN NAME, and the sport word only when it has none — never a code. */
                  const name = deriveWorkoutTitle(row as never) || String(row?.type ?? '').replace(/^./, (c: string) => c.toUpperCase());
                  const meta = sessionLineMeta(row, useImperial);

                  return (
                    <div
                      key={`${key}-${i}`}
                      role="button"
                      tabIndex={0}
                      draggable={planned && !!row?.id}
                      onDragStart={(e) => planned && row?.id && handleDragStart(e, row)}
                      onDragEnd={handleDragEnd}
                      /**
                       * ⛔ A DONE LINE OPENS THE SESSION, A PLANNED LINE OPENS THE DAY (2026-09-09).
                       * Both used to go to Today, which on a finished session is a detour: the
                       * athlete tapping a logged ride wants what it DID, and that is the Performance
                       * tab — `onEditEffort` is the same door Today's own done card uses, and
                       * `AppLayout` already routes a completed row there.
                       * ⚠️ PLANNED IS UNCHANGED. Work still ahead belongs on the day it sits in.
                       */
                      onClick={(e) => { e.stopPropagation(); if (done) onEditEffort?.(row); else onOpenToday?.(key); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (done) onEditEffort?.(row); else onOpenToday?.(key); } }}
                      /* ⛔ PRESS AND HOLD TO MOVE IT (§3f). See `beginLongPress` — HTML5 drag never
                         fires on touch, so the finger gets its own path to the SAME move. */
                      onTouchStart={(e) => beginLongPress(e, row, key)}
                      onTouchEnd={endLongPress}
                      onTouchCancel={cancelLongPress}
                      className="grid items-center gap-2.5 text-[15px] min-w-0"
                      style={{
                        gridTemplateColumns: '10px minmax(0,1fr) auto 16px',
                        opacity: touchDragId && touchDragId === String(row?.id ?? '') ? 0.45 : 1,
                        cursor: planned && row?.id ? 'grab' : 'pointer',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block rounded-full"
                        style={{
                          width: 8, height: 8,
                          background: missed ? STATUS_COLORS.risk : colour,
                          boxShadow: done || missed ? 'none' : `0 0 8px ${colour}`,
                          opacity: done ? 0.6 : 1,
                        }}
                      />
                      <span
                        className="truncate"
                        style={{ color: missed ? STATUS_COLORS.risk : done ? 'rgba(242,240,236,0.36)' : 'rgba(242,240,236,1)' }}
                      >
                        {name}
                      </span>
                      <span
                        className="text-[14px] tabular-nums flex-shrink-0 inline-flex items-baseline gap-1.5"
                        style={{ color: done ? 'rgba(242,240,236,0.36)' : 'rgba(242,240,236,0.62)' }}
                      >
                        {/* ⛔ NO PER-ROW ATTRIBUTION HERE ANY MORE (2026-09-09). "Garmin Forerunner
                            965" after every set of numbers doubled the width of a line whose whole
                            job is a name and a length, and on a two-session day it pushed both off
                            the row. Garmin API Brand Guidelines v6.30.2025 allow a GLOBAL
                            attribution "such as in a header or footer" for a multi-entry display,
                            which is exactly what seven rows of sessions are — see the device line
                            under the week header. */}
                        {meta}
                      </span>
                      {/* ⛔ ONE MARK, OR NOTHING: a check when it is done, the swap arrow when the
                          row no longer matches the plan. Never both — a swapped session that is done
                          is done, and that is the fact worth the pixels. */}
                      <span className="text-[14px] text-right flex-shrink-0" style={{ width: 16 }}>
                        {done ? (
                          <span aria-label="Done" style={{ color: getDisciplineColor('ride') }}>✓</span>
                        ) : swapped ? (
                          <ArrowLeftRight
                            aria-label="Swapped"
                            className="inline-block w-3.5 h-3.5"
                            style={{ color: missed ? STATUS_COLORS.risk : 'rgba(242,240,236,0.36)' }}
                          />
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            </PopoverPrimitive.Anchor>
            {/* ⚠️ `bottom` and `start`, so the menu opens under the day it belongs to. */}
            <LogTypeMenuContent
              side="bottom"
              align="start"
              sideOffset={6}
              onSelect={(t) => { setAddMenuDate(null); onSelectType?.(t); }}
            />
            </PopoverPrimitive.Root>
          );
        })}
      </div>
        
      {/* ⛔ THE LOAD CARD IS GONE FROM BOTH SCREENS. It sat here at the bottom of the calendar, moved
          to Today (2026-09-09), and came off Today as well (§3g) — `WeekLoadCard` and
          `TodayWeekBlocks` are deleted. State keeps its own load plate; this tab's own answer to
          "how much of the week is done" is the bar under the header. */}

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
