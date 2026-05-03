import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Target, Calendar, CalendarRange, TrendingUp, Plus, ChevronRight, ChevronDown, Flag, Dumbbell, Activity, Bike, Waves, Loader2, Trash2, Pause, Play, Link2, List } from 'lucide-react';
import { differenceInWeeks, format } from 'date-fns';
import { useGoals, Goal, GoalInsert } from '@/hooks/useGoals';
import { supabase, invokeFunction, invokeFunctionFormData, getStoredUserId } from '@/lib/supabase';
import { actualFinishSecondsPreferElapsed, type WorkoutTimeRow } from '@/lib/race-finish-seconds';
import CourseStrategyModal from '@/components/CourseStrategyModal';
import { useAppContext } from '@/contexts/AppContext';
import { resolveEventTargetTimeSeconds } from '@/lib/goal-target-time';
import { parseLocalDate } from '@/lib/dateUtils';
import { findOrphanActivePlanConflictId } from '@/lib/plan-goal-conflict';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { useToast } from '@/components/ui/use-toast';
// Local alias so existing call-sites inside this file don't need renaming
const readStoredUserId = getStoredUserId;

interface GoalsScreenProps {
  onClose: () => void;
  onSelectPlan?: (planId: string) => void;
  onViewAllPlans?: () => void;
  onPlanBuilt?: () => void;
  /** Increment when opening Goals from FAB "Upload course" — expands first active run event goal. */
  expandRunEventForCourseNonce?: number;
  currentPlans?: Array<{ id: string; name: string; currentWeek?: number; status: string; goal_id?: string | null; config?: any; plan_type?: string }>;
  completedPlans?: Array<{ id: string; name: string; status: string; goal_id?: string | null }>;
}

const SPORT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  run: Activity, ride: Bike, swim: Waves, strength: Dumbbell,
  triathlon: Activity, general: Activity, other: Target,
};

const DISTANCE_OPTIONS: Record<string, string[]> = {
  run: ['5K', '10K', 'Half Marathon', 'Marathon', 'Ultra'],
  ride: ['Century', 'Metric Century', 'Gran Fondo'],
  swim: ['Sprint', 'Mile', 'Open Water'],
  triathlon: ['Sprint', 'Olympic', '70.3', 'Ironman'],
};

const METRIC_OPTIONS: Record<string, string[]> = {
  Speed: ['5K time', 'Mile time', '10K time'],
  Strength: ['Squat 1RM', 'Bench 1RM', 'Deadlift 1RM', 'OHP 1RM'],
  Endurance: ['Weekly volume', 'Long run distance'],
  Power: ['FTP', 'Max power'],
};

function getGoalTypeIcon(t: string) {
  return t === 'event' ? Flag : t === 'capacity' ? TrendingUp : t === 'maintenance' ? Activity : Target;
}

function getSportIcon(s: string | null) {
  if (s == null || s === '') return null;
  return SPORT_ICONS[String(s).toLowerCase()] ?? null;
}

function formatPastRaceDate(date: string | null): string | null {
  if (!date) return null;
  return format(new Date(date + 'T12:00:00'), 'M/d/yy');
}

function formatPastRaceTime(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return null;
  const total = Math.round(Number(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return s === 0 ? `${h}:${String(m).padStart(2, '0')}` : `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseElapsedRaceTimeInput(input: string): number | null {
  const parts = input.trim().split(':').map((p) => Number.parseInt(p, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  // Race cards accept H:MM for marathon-style results such as "4:44".
  if (parts[0] <= 12 && parts[1] < 60) return parts[0] * 3600 + parts[1] * 60;
  return parts[0] * 60 + parts[1];
}

const GoalsScreen: React.FC<GoalsScreenProps> = ({
  onClose, onSelectPlan, onViewAllPlans, onPlanBuilt,
  expandRunEventForCourseNonce = 0,
  currentPlans = [], completedPlans = [],
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { useImperial, refreshPlans } = useAppContext();
  const coachWeek = useCoachWeekContext();
  const { goals, loading, addGoal, deleteGoal, updateGoal, refreshGoals } = useGoals();
  const { toast } = useToast();

  const [showAddGoal, setShowAddGoal] = useState(false);
  // Default to past goals expanded so completed events are visible immediately.
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showCapacityForm, setShowCapacityForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buildingGoalId, setBuildingGoalId] = useState<string | null>(null);
  const [seasonBuilding, setSeasonBuilding] = useState(false);
  const [seasonError, setSeasonError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<{ goalId: string; message: string } | null>(null);
  /** Brief confirmation after a successful `build_existing` (cleared after a few seconds). */
  const [planReadyGoalId, setPlanReadyGoalId] = useState<string | null>(null);
  const [currentBaselines, setCurrentBaselines] = useState<any>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<any>(null);
  const [conflictDialog, setConflictDialog] = useState<{ goal: Goal; conflictPlan: typeof currentPlans[0] } | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ plan: typeof currentPlans[0] } | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [calEasyPace, setCalEasyPace] = useState('');
  const [calFiveKPace, setCalFiveKPace] = useState('');
  const [calSaving, setCalSaving] = useState(false);
  const [goalFlowError, setGoalFlowError] = useState<string | null>(null);

  const [courseByGoal, setCourseByGoal] = useState<
    Record<string, { id: string; name: string; strategy_updated_at: string | null }>
  >({});
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyModalCourseId, setStrategyModalCourseId] = useState<string | null>(null);
  const [courseUploadBusy, setCourseUploadBusy] = useState<string | null>(null);
  const [pendingCourseGoalId, setPendingCourseGoalId] = useState<string | null>(null);
  const goalsCourseFileRef = useRef<HTMLInputElement>(null);
  /** After Arc "Looks right" when plan wasn’t built in Arc (identity-only or no events): show next step on Goals. */
  const [showArcSetupNextStep, setShowArcSetupNextStep] = useState(false);
  /** After Arc built the calendar: compact success on Goals. */
  const [arcPlanReady, setArcPlanReady] = useState<{ planId: string | null } | null>(null);

  // Hydrate follow-up UI from `/goals` navigation state, then strip it so refresh/back doesn’t re-apply.
  useEffect(() => {
    const st = location.state as {
      fromArcSetup?: boolean;
      seasonPlanJustBuilt?: boolean;
      builtPlanId?: string | null;
      needPaceCalibration?: boolean;
    } | null;
    if (!st || Object.keys(st).length === 0) return;

    if (st.needPaceCalibration) setShowCalibration(true);

    if (st.seasonPlanJustBuilt) {
      void refreshPlans?.();
      void refreshGoals();
      setArcPlanReady({ planId: st.builtPlanId ?? null });
      setShowArcSetupNextStep(false);
    } else if (st.fromArcSetup) {
      void refreshGoals();
      setShowArcSetupNextStep(true);
    }

    try {
      navigate(location.pathname, { replace: true, state: {} });
    } catch {
      void 0;
    }
  }, [location.state, location.pathname, navigate, refreshGoals, refreshPlans]);

  useEffect(() => {
    const uid = readStoredUserId();
    if (!uid) return;
    (async () => {
      const { data } = await supabase
        .from('race_courses')
        .select('id, name, goal_id, strategy_updated_at')
        .eq('user_id', uid);
      const m: Record<string, { id: string; name: string; strategy_updated_at: string | null }> = {};
      for (const r of data || []) {
        const gid = r.goal_id as string | null;
        if (gid) {
          m[gid] = {
            id: r.id as string,
            name: String(r.name || 'Course'),
            strategy_updated_at: (r.strategy_updated_at as string) ?? null,
          };
        }
      }
      setCourseByGoal(m);
    })();
  }, [goals, expandedGoalId]);

  useEffect(() => {
    if (!expandRunEventForCourseNonce) return;
    const runEvent = goals.find(
      (g) =>
        g.status === 'active' &&
        g.goal_type === 'event' &&
        (g.sport || '').toLowerCase() === 'run',
    );
    if (runEvent) setExpandedGoalId(runEvent.id);
  }, [expandRunEventForCourseNonce, goals]);

  // Clear stale error whenever the event form opens so a previous failed attempt
  // doesn't show error text before the user has done anything.
  useEffect(() => {
    if (showEventForm) setGoalFlowError(null);
  }, [showEventForm]);

  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventSport, setEventSport] = useState('run');
  const [eventDistance, setEventDistance] = useState('');
  const [eventPriority, setEventPriority] = useState<'A' | 'B' | 'C'>('A');
  const [eventFitness, setEventFitness] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [eventTrainingGoal, setEventTrainingGoal] = useState<'complete' | 'speed' | ''>('');
  const [overrideFitness, setOverrideFitness] = useState(false);
  const [overrideGoal, setOverrideGoal] = useState(false);
  const [eventStrength, setEventStrength] = useState<'none' | 'neural_speed' | 'durability' | 'upper_aesthetics'>('none');
  const [eventStrengthFreq, setEventStrengthFreq] = useState<2 | 3>(2);
  const [overrideStrength, setOverrideStrength] = useState(false);
  const [currentSnapshots, setCurrentSnapshots] = useState<any[]>([]);
  const [athleteMemory, setAthleteMemory] = useState<any>(null);
  const [prefillSource, setPrefillSource] = useState<{ fitness?: string; goal?: string; strength?: string }>({});
  const [planStartDate, setPlanStartDate] = useState('');
  // Separate state for the Build / Build season actions — must not pollute the new-goal form.
  const [buildStartDate, setBuildStartDate] = useState('');

  // Pre-fill fitness + goal + strength from athlete memory and recent snapshots
  useEffect(() => {
    if (!showEventForm) return;
    const sources: { fitness?: string; goal?: string; strength?: string } = {};

    // === Fitness level ===
    if (!eventFitness) {
      const vdot = currentBaselines?.effort_score;
      const weeklyMi = currentBaselines?.current_volume?.run
        ? parseFloat(currentBaselines.current_volume.run) || 0
        : 0;

      if (vdot && vdot > 0) {
        setEventFitness(vdot >= 45 ? 'advanced' : vdot >= 33 ? 'intermediate' : 'beginner');
        sources.fitness = `From your fitness score (${Math.round(vdot)} vDOT)`;
      } else if (weeklyMi > 0) {
        setEventFitness(weeklyMi >= 30 ? 'advanced' : weeklyMi >= 12 ? 'intermediate' : 'beginner');
        sources.fitness = `Avg ${Math.round(weeklyMi)} mi/week`;
      } else if (currentSnapshot) {
        setEventFitness('intermediate');
        sources.fitness = 'Estimated from your activity';
      }
    }

    // === Training goal (complete vs speed) ===
    if (!eventTrainingGoal) {
      const hasPaceData = currentBaselines?.effort_score || currentBaselines?.effort_paces?.race;
      const hasMemoryRunData = athleteMemory?.derived_rules?.run?.efficiency_peak_pace;
      if (hasPaceData || hasMemoryRunData) {
        setEventTrainingGoal('speed');
        sources.goal = 'You have pace history — race for time';
      } else {
        setEventTrainingGoal('complete');
        sources.goal = 'Set to finish goal — change if you want to chase a time';
      }
    }

    // === Strength protocol ===
    if (eventStrength === 'none') {
      // Existing active plan takes priority
      const existingPlan = currentPlans.find(p => p.status === 'active' && p.config?.strength_protocol);
      if (existingPlan?.config?.strength_protocol) {
        setEventStrength(existingPlan.config.strength_protocol);
        setEventStrengthFreq(existingPlan.config.strength_frequency || 2);
        sources.strength = 'Matched to your active plan';
      } else {
        // Check athlete memory for strength 1RM signals
        const strengthRules = athleteMemory?.derived_rules?.strength ?? {};
        const anchorKeys = [
          'squat_1rm_est', 'bench_press_1rm_est', 'deadlift_1rm_est',
          'trap_bar_deadlift_1rm_est', 'overhead_press_1rm_est',
        ];
        const activeLifts = anchorKeys.filter(k => {
          const r = strengthRules[k];
          return r && Number(r.value) > 0 && Number(r.confidence ?? 0) > 0.2;
        });
        // Count recent weeks with any strength volume
        const strengthWeeks = currentSnapshots.filter(s => Number(s.strength_volume_total ?? 0) > 0).length;

        if (activeLifts.length >= 2 || strengthWeeks >= 2) {
          const hasHeavyLifts = ['squat_1rm_est', 'deadlift_1rm_est', 'trap_bar_deadlift_1rm_est']
            .some(k => Number(strengthRules[k]?.value ?? 0) > 100);
          setEventStrength(hasHeavyLifts ? 'neural_speed' : 'durability');
          const weeksLabel = strengthWeeks > 0
            ? `${strengthWeeks}/${currentSnapshots.length} recent weeks included lifting`
            : `${activeLifts.length} lifts tracked`;
          sources.strength = weeksLabel;
        }
      }
    }

    setPrefillSource(sources);
  }, [showEventForm, currentBaselines, currentSnapshot, currentSnapshots, athleteMemory]);
  const [capCategory, setCapCategory] = useState('Speed');
  const [capMetric, setCapMetric] = useState('');
  const [capTarget, setCapTarget] = useState('');
  const [maintSport, setMaintSport] = useState('run');
  const [maintDays, setMaintDays] = useState('4');

  useEffect(() => {
    (async () => {
      const userId = readStoredUserId();
      if (!userId) return;
      const [{ data: bl }, { data: snaps }, { data: mem }] = await Promise.all([
        supabase.from('user_baselines').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('athlete_snapshot')
          .select('week_start,workload_by_discipline,strength_volume_total,run_long_run_duration,workload_total')
          .eq('user_id', userId)
          .order('week_start', { ascending: false })
          .limit(4),
        supabase.from('athlete_memory').select('derived_rules,provenance').eq('user_id', userId).maybeSingle(),
      ]);
      setCurrentBaselines(bl);
      setCurrentSnapshot(snaps?.[0] ?? null);
      setCurrentSnapshots(snaps ?? []);
      setAthleteMemory(mem);
    })();
  }, []);

  const activeGoals = useMemo(() => goals.filter(g => g.status === 'active'), [goals]);
  const inactiveGoals = useMemo(() => goals.filter(g => g.status !== 'active'), [goals]);
  const activeEventGoals = useMemo(
    () => activeGoals.filter(g => g.goal_type === 'event'),
    [activeGoals],
  );
  const multipleEventGoals = activeEventGoals.length >= 2;

  // Must be declared before `seasonPlan` — that memo reads this map; `const` is TDZ until here.
  const plansByGoalId = useMemo(() => {
    const map = new Map<string, (typeof currentPlans)[0]>();
    for (const p of currentPlans) {
      if (p.goal_id) map.set(p.goal_id, p);
      const served = (p.config as { goals_served?: string[] } | undefined)?.goals_served;
      if (Array.isArray(served)) {
        for (const gid of served) {
          if (typeof gid === 'string' && !map.has(gid)) map.set(gid, p);
        }
      }
    }
    const completedMap = new Map<string, (typeof completedPlans)[0]>();
    for (const p of completedPlans) {
      if (p.goal_id) completedMap.set(p.goal_id, p);
      const served = (p.config as { goals_served?: string[] } | undefined)?.goals_served;
      if (Array.isArray(served)) {
        for (const gid of served) {
          if (typeof gid === 'string' && !completedMap.has(gid)) completedMap.set(gid, p);
        }
      }
    }
    for (const [gid, p] of completedMap) {
      if (!map.has(gid)) map.set(gid, p);
    }
    return map;
  }, [currentPlans, completedPlans]);

  // When all active event goals share the same plan, the season plan is already built.
  // Used to swap the banner from "build" → "active" and suppress per-card plan duplication.
  const seasonPlan = useMemo(() => {
    if (!multipleEventGoals) return null;
    const linked = activeEventGoals.map(g => plansByGoalId.get(g.id)).filter(Boolean);
    if (linked.length === 0) return null;
    const uniqueIds = new Set(linked.map(p => p!.id));
    return uniqueIds.size === 1 ? linked[0]! : null;
  }, [multipleEventGoals, activeEventGoals, plansByGoalId]);

  /** A-race / soonest event — same ordering as `handleBuildSeasonPlan` primary. */
  const primaryActiveEventGoal = useMemo(() => {
    const sorted = [...activeEventGoals].sort((a, b) => {
      const pr = (p: string) => (p === 'A' ? 0 : p === 'B' ? 1 : p === 'C' ? 2 : 3);
      const c = pr(a.priority) - pr(b.priority);
      if (c !== 0) return c;
      const da = a.target_date ? new Date(a.target_date + 'T12:00:00').getTime() : 0;
      const db = b.target_date ? new Date(b.target_date + 'T12:00:00').getTime() : 0;
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });
    return sorted[0] ?? null;
  }, [activeEventGoals]);

  async function handleGoalsCourseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const gid = pendingCourseGoalId;
    setPendingCourseGoalId(null);
    if (!file || !gid) return;
    const goal = goals.find((g) => g.id === gid);
    if (!goal) return;
    const linked = plansByGoalId.get(gid);
    const rr = coachWeek.data?.race_readiness;
    const coachPred =
      rr &&
      String(goal.name) === String(rr.goal.name) &&
      (goal.sport || '').toLowerCase() === 'run' &&
      Number.isFinite(rr.predicted_finish_time_seconds) &&
      rr.predicted_finish_time_seconds > 0
        ? rr.predicted_finish_time_seconds
        : null;
    const paceTargetSec = resolveEventTargetTimeSeconds(goal, linked?.config as Record<string, unknown> | undefined);
    if (paceTargetSec == null && coachPred == null) {
      window.alert(
        'No pacing target yet: set a race target on this goal or plan, or open Goals/Home after coach loads so your finish projection is saved — then try again.',
      );
      return;
    }
    setCourseUploadBusy(gid);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', `${goal.name} course`);
      fd.append('goal_id', gid);
      const rd = goal.target_date != null ? String(goal.target_date).slice(0, 10) : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) fd.append('race_date', rd);
      const { data, error } = await invokeFunctionFormData<{ course_id: string }>('course-upload', fd);
      if (error || !data?.course_id) {
        window.alert(error?.message || 'Upload failed');
        return;
      }
      const { error: stErr } = await invokeFunction('course-strategy', { course_id: data.course_id });
      if (stErr) {
        window.alert(stErr.message || 'Strategy generation failed');
        return;
      }
      setCourseByGoal((prev) => ({
        ...prev,
        [gid]: {
          id: data.course_id,
          name: `${goal.name} course`,
          strategy_updated_at: new Date().toISOString(),
        },
      }));
      setStrategyModalCourseId(data.course_id);
      setStrategyModalOpen(true);
    } finally {
      setCourseUploadBusy(null);
    }
  }

  type BackfillStatus =
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'no_workout' }
    | { kind: 'error'; message: string };
  const [backfillStatus, setBackfillStatus] = useState<Record<string, BackfillStatus>>({});
  const autoBackfilledGoalsRef = useRef<Set<string>>(new Set());

  const backfillGoalFromWorkout = async (
    goal: Goal,
    options: { uid: string; planId?: string | null },
  ): Promise<{ ok: true; sec: number } | { ok: false; reason: 'no_workout' | 'error'; message?: string }> => {
    const { uid, planId } = options;
    if (planId) {
      try {
        const { data, error } = await supabase.functions.invoke('complete-race', {
          body: { plan_id: planId },
        });
        const serverErr =
          (data && typeof data === 'object' && typeof (data as any).error === 'string'
            ? (data as any).error
            : '') || '';
        const success = (data as any)?.success === true;
        const actualSec = Number((data as any)?.actual_seconds);
        if (!error && success && Number.isFinite(actualSec) && actualSec > 0) {
          return { ok: true, sec: actualSec };
        }
        const isNoWorkout =
          /no completed run found/i.test(serverErr) ||
          /could not read finish time/i.test(serverErr);
        if (!isNoWorkout) {
          return {
            ok: false,
            reason: 'error',
            message: serverErr || error?.message || 'complete-race failed',
          };
        }
      } catch (e) {
        return { ok: false, reason: 'error', message: (e as Error)?.message || 'complete-race threw' };
      }
    }

    const date = (goal.target_date || '').slice(0, 10);
    if (!date) return { ok: false, reason: 'no_workout' };
    const sport = (goal.sport || 'run').toLowerCase();
    const types = sport === 'ride' ? ['ride'] : sport === 'swim' ? ['swim'] : ['run'];
    const { data: rows, error: wErr } = await supabase
      .from('workouts')
      .select('id, date, type, workout_status, moving_time, elapsed_time, duration, computed')
      .eq('user_id', uid)
      .eq('date', date)
      .eq('workout_status', 'completed')
      .in('type', types);
    if (wErr) {
      return { ok: false, reason: 'error', message: wErr.message };
    }
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) return { ok: false, reason: 'no_workout' };
    let bestSec = 0;
    for (const w of list) {
      const sec = actualFinishSecondsPreferElapsed(w as WorkoutTimeRow);
      if (sec != null && sec > bestSec) bestSec = sec;
    }
    if (bestSec <= 0) return { ok: false, reason: 'no_workout' };
    const currentPrefs =
      goal.training_prefs && typeof goal.training_prefs === 'object'
        ? (goal.training_prefs as Record<string, unknown>)
        : {};
    const { error: uErr } = await supabase
      .from('goals')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_value: bestSec,
        training_prefs: {
          ...currentPrefs,
          manual_athletic_record: true,
          race_result: {
            actual_seconds: bestSec,
            time_source: 'workout_elapsed_preferred',
            completed_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', goal.id)
      .eq('user_id', uid);
    if (uErr) return { ok: false, reason: 'error', message: uErr.message };
    return { ok: true, sec: bestSec };
  };

  const findStaleActivePlanIdsForGoal = (goal: Goal): string[] => {
    const ids = new Set<string>();
    const goalNameNorm = String(goal.name || '').trim().toLowerCase();
    for (const p of currentPlans) {
      if (p.status !== 'active' && p.status !== 'paused') continue;
      let matches = false;
      if (p.goal_id && p.goal_id === goal.id) matches = true;
      const served = (p.config as { goals_served?: string[] } | undefined)?.goals_served;
      if (Array.isArray(served) && served.includes(goal.id)) matches = true;
      if (!matches && goalNameNorm) {
        const planName = String(p.name || '').trim().toLowerCase();
        const raceName = String((p.config as { race_name?: string } | undefined)?.race_name || '')
          .trim()
          .toLowerCase();
        if (planName.includes(goalNameNorm) || raceName === goalNameNorm) matches = true;
      }
      if (matches) ids.add(p.id);
    }
    return [...ids];
  };

  const autoEndedPlansRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const stalePlanIds = new Set<string>();
    for (const g of goals) {
      if (g.goal_type !== 'event') continue;
      const hasResult = g.current_value != null && g.current_value > 0;
      const racePast = !!g.target_date && String(g.target_date).slice(0, 10) < todayIso;
      const inactive = g.status !== 'active';
      if (!(hasResult || (inactive && racePast))) continue;
      for (const pid of findStaleActivePlanIdsForGoal(g)) {
        if (!autoEndedPlansRef.current.has(pid)) stalePlanIds.add(pid);
      }
    }
    if (stalePlanIds.size === 0) return;
    let cancelled = false;
    (async () => {
      let didEnd = false;
      for (const planId of stalePlanIds) {
        autoEndedPlansRef.current.add(planId);
        try {
          const { data, error } = await supabase.functions.invoke('end-plan', {
            body: { plan_id: planId },
          });
          const serverErr =
            (data && typeof data === 'object' && typeof (data as any).error === 'string'
              ? (data as any).error
              : '') || '';
          if (error || (serverErr && !(data as any)?.success)) {
            console.warn('[GoalsScreen] auto end-plan failed', {
              planId,
              err: error?.message || serverErr,
            });
            continue;
          }
          didEnd = true;
        } catch (e) {
          console.warn('[GoalsScreen] auto end-plan threw', e);
        }
      }
      if (cancelled) return;
      if (didEnd) {
        try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('plans:invalidate')); } catch { /* ignore */ }
        try { refreshPlans?.(); } catch { /* ignore */ }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, goals, currentPlans, refreshPlans]);

  useEffect(() => {
    if (loading) return;
    const uid = getStoredUserId();
    if (!uid) return;
    const candidates = goals.filter(
      (g) =>
        g.goal_type === 'event' &&
        g.status !== 'active' &&
        (g.current_value == null || g.current_value <= 0) &&
        !autoBackfilledGoalsRef.current.has(g.id),
    );
    if (candidates.length === 0) return;
    let cancelled = false;
    (async () => {
      let didAnyComplete = false;
      let didEndAnyPlan = false;
      for (const g of candidates) {
        autoBackfilledGoalsRef.current.add(g.id);
        setBackfillStatus((s) => ({ ...s, [g.id]: { kind: 'saving' } }));
        const plan = plansByGoalId.get(g.id);
        const result = await backfillGoalFromWorkout(g, { uid, planId: plan?.id ?? null });
        if (cancelled) return;
        if (result.ok) {
          didAnyComplete = true;
          setBackfillStatus((s) => ({ ...s, [g.id]: { kind: 'idle' } }));
          const stalePlanIds = findStaleActivePlanIdsForGoal(g);
          for (const planId of stalePlanIds) {
            try {
              const { data, error } = await supabase.functions.invoke('end-plan', {
                body: { plan_id: planId },
              });
              const serverErr =
                (data && typeof data === 'object' && typeof (data as any).error === 'string'
                  ? (data as any).error
                  : '') || '';
              if (error || (serverErr && !(data as any)?.success)) {
                console.warn('[GoalsScreen] auto end-plan failed', {
                  planId,
                  err: error?.message || serverErr,
                });
              } else {
                didEndAnyPlan = true;
              }
            } catch (e) {
              console.warn('[GoalsScreen] end-plan threw', e);
            }
          }
        } else if (result.reason === 'no_workout') {
          setBackfillStatus((s) => ({ ...s, [g.id]: { kind: 'no_workout' } }));
        } else {
          setBackfillStatus((s) => ({
            ...s,
            [g.id]: { kind: 'error', message: result.message || 'Could not auto-save' },
          }));
        }
      }
      if (cancelled) return;
      if (didAnyComplete || didEndAnyPlan) {
        try { window.dispatchEvent(new CustomEvent('goals:invalidate')); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('plans:invalidate')); } catch { /* ignore */ }
        refreshGoals();
        if (didEndAnyPlan) {
          try { refreshPlans?.(); } catch { /* ignore */ }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, goals, plansByGoalId, currentPlans, refreshGoals]);

  // Only active plans not linked to any goal
  const activeUnlinkedPlans = useMemo(
    () => currentPlans.filter(p => !p.goal_id && (p.status === 'active' || p.status === 'paused')),
    [currentPlans],
  );

  const totalPlanCount = currentPlans.length + completedPlans.length;

  async function parseFunctionError(error: any, data: any, fallback: string): Promise<{ message: string; code?: string }> {
    if (data && typeof data === 'object') {
      const msg = (data as any).error;
      const code = (data as any).error_code;
      if (typeof msg === 'string' && msg.trim()) return { message: msg, code };
    }

    try {
      const ctx = (error as any)?.context;
      if (ctx?.json) {
        const payload = await ctx.json();
        const msg = payload?.error;
        const code = payload?.error_code;
        if (typeof msg === 'string' && msg.trim()) return { message: msg, code };
      }
    } catch {
      // Ignore parse failures and fall back to generic text
    }

    return { message: error?.message || fallback };
  }

  function resetForms() {
    setShowAddGoal(false); setShowEventForm(false); setShowCapacityForm(false); setShowMaintenanceForm(false);
    setEventName(''); setEventDate(''); setEventSport('run'); setEventDistance(''); setEventPriority('A'); setEventFitness(''); setEventTrainingGoal(''); setOverrideFitness(false); setOverrideGoal(false); setEventStrength('none'); setEventStrengthFreq(2); setOverrideStrength(false); setPrefillSource({}); setPlanStartDate('');
    setCapCategory('Speed'); setCapMetric(''); setCapTarget('');
    setMaintSport('run'); setMaintDays('4');
    setGoalFlowError(null);
  }

  // --- Quick Calibration (two-pace baseline) ---

  const VDOT_5K: [number, number][] = [
    [30,1860],[31,1800],[32,1740],[33,1686],[34,1632],[35,1584],[36,1536],[37,1488],
    [38,1446],[39,1404],[40,1362],[41,1326],[42,1290],[43,1254],[44,1222],[45,1188],
    [46,1158],[47,1128],[48,1098],[49,1072],[50,1044],[51,1020],[52,996],[53,972],
    [54,951],[55,930],[56,909],[57,891],[58,873],[59,855],[60,838],[65,762],[70,696],
    [75,642],[80,594],[85,552],
  ];
  const PACE_BY_VDOT: [number, number, number, number, number, number][] = [
    // vdot, base, race, steady, power, speed  (sec/mile)
    [30,744,682,622,568,534],[32,708,648,592,540,508],[34,672,618,564,516,484],
    [36,642,588,538,492,462],[38,612,562,514,470,442],[40,585,537,491,449,422],
    [42,560,514,470,430,404],[44,536,492,450,412,387],[45,525,482,441,403,379],[46,514,472,432,395,371],
    [48,494,453,415,379,357],[50,474,436,399,365,343],[52,456,419,383,351,330],
    [54,439,403,369,338,318],[56,423,388,355,325,306],[58,408,375,343,314,295],
    [60,394,362,331,303,285],[65,362,332,304,278,262],[70,334,306,280,256,241],
    [75,309,284,260,238,224],[80,287,264,241,221,208],
  ];

  function parsePace(s: string): number | null {
    const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
  }

  function fmtPace(sec: number): string {
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function vdotFrom5KTime(timeSec: number): number {
    if (timeSec >= VDOT_5K[0][1]) return VDOT_5K[0][0];
    if (timeSec <= VDOT_5K[VDOT_5K.length - 1][1]) return VDOT_5K[VDOT_5K.length - 1][0];
    for (let i = 0; i < VDOT_5K.length - 1; i++) {
      const [v1, t1] = VDOT_5K[i], [v2, t2] = VDOT_5K[i + 1];
      if (timeSec <= t1 && timeSec >= t2) {
        return Math.round((v1 + ((t1 - timeSec) / (t1 - t2)) * (v2 - v1)) * 10) / 10;
      }
    }
    return 40;
  }

  function pacesFromVdot(vdot: number): { base: number; race: number; steady: number; power: number; speed: number } {
    const tbl = PACE_BY_VDOT;
    if (vdot <= tbl[0][0]) return { base: tbl[0][1], race: tbl[0][2], steady: tbl[0][3], power: tbl[0][4], speed: tbl[0][5] };
    if (vdot >= tbl[tbl.length - 1][0]) { const l = tbl[tbl.length - 1]; return { base: l[1], race: l[2], steady: l[3], power: l[4], speed: l[5] }; }
    for (let i = 0; i < tbl.length - 1; i++) {
      if (vdot >= tbl[i][0] && vdot <= tbl[i + 1][0]) {
        const f = (vdot - tbl[i][0]) / (tbl[i + 1][0] - tbl[i][0]);
        return {
          base:   Math.round(tbl[i][1] - f * (tbl[i][1] - tbl[i + 1][1])),
          race:   Math.round(tbl[i][2] - f * (tbl[i][2] - tbl[i + 1][2])),
          steady: Math.round(tbl[i][3] - f * (tbl[i][3] - tbl[i + 1][3])),
          power:  Math.round(tbl[i][4] - f * (tbl[i][4] - tbl[i + 1][4])),
          speed:  Math.round(tbl[i][5] - f * (tbl[i][5] - tbl[i + 1][5])),
        };
      }
    }
    return { base: 585, race: 537, steady: 491, power: 449, speed: 422 };
  }

  const isMetric = !useImperial;
  const paceUnit = isMetric ? '/km' : '/mi';

  async function handleCalibrationSave() {
    const easyRaw = parsePace(calEasyPace);
    const fiveKRaw = parsePace(calFiveKPace);
    if (!easyRaw || !fiveKRaw) return;

    setCalSaving(true);
    try {
      const toSecPerMile = (v: number) => isMetric ? Math.round(v * 1.60934) : v;
      const fiveKPerMile = toSecPerMile(fiveKRaw);
      const easyPerMile = toSecPerMile(easyRaw);
      const fiveKTimeSec = Math.round(fiveKPerMile * 3.10686);
      const vdot = vdotFrom5KTime(fiveKTimeSec);
      const paces = pacesFromVdot(vdot);

      const userId = readStoredUserId();
      if (!userId) return;

      await supabase.from('user_baselines').upsert({
        user_id: userId,
        effort_score: vdot,
        effort_source_distance: 5000,
        effort_source_time: fiveKTimeSec,
        effort_paces: paces,
        effort_paces_source: 'calculated',
        effort_score_status: 'self_reported',
        effort_updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      const { data: bl } = await supabase.from('user_baselines').select('*').eq('user_id', userId).maybeSingle();
      setCurrentBaselines(bl);
      setShowCalibration(false);
      setCalEasyPace('');
      setCalFiveKPace('');
    } finally {
      setCalSaving(false);
    }
  }

  function findConflictPlan(goal: Goal) {
    const id = findOrphanActivePlanConflictId(currentPlans, goal.sport);
    return id ? currentPlans.find((p) => p.id === id) ?? null : null;
  }

  function handleBuildPlan(goal: Goal) {
    const conflict = findConflictPlan(goal);
    conflict ? setConflictDialog({ goal, conflictPlan: conflict }) : executeBuildPlan(goal, null);
  }

  async function executeBuildPlan(goal: Goal, _conflictPlanId: string | null): Promise<{ success: boolean; error?: string }> {
    setConflictDialog(null);
    setBuildingGoalId(goal.id);
    setBuildError(null);

    try {
      const buildUserId = readStoredUserId();
      if (!buildUserId) throw new Error('Not signed in');
      const { data, error } = await invokeFunction('create-goal-and-materialize-plan', {
        user_id: buildUserId,
        mode: 'build_existing',
        existing_goal_id: String(goal.id),
        replace_plan_id: _conflictPlanId ? String(_conflictPlanId) : null,
        ...(buildStartDate ? { plan_start_date: buildStartDate } : {}),
      });
      if (error || !data?.success) {
        const parsed = await parseFunctionError(error, data, 'Unable to build and materialize plan');
        if (parsed.code === 'missing_pace_benchmark') setShowCalibration(true);
        throw new Error(parsed.message);
      }

      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      onPlanBuilt?.();
      await refreshGoals();
      setPlanReadyGoalId(goal.id);
      window.setTimeout(() => {
        setPlanReadyGoalId((prev) => (prev === goal.id ? null : prev));
      }, 6000);
      return { success: true };
    } catch (err: any) {
      console.error('Build plan failed:', err);
      const message = err?.message || 'Failed to build plan';
      setBuildError({ goalId: goal.id, message });
      return { success: false, error: message };
    } finally {
      setBuildingGoalId(null);
    }
  }

  /** One combined plan for every active event goal (A/B priority + dates). Not per-goal builds. */
  async function handleBuildSeasonPlan(replacePlanId: string | null = null) {
    const buildUserId = readStoredUserId();
    if (!buildUserId) {
      setSeasonError('Not signed in');
      return;
    }
    const sorted = [...activeEventGoals].sort((a, b) => {
      const pr = (p: string) => (p === 'A' ? 0 : p === 'B' ? 1 : p === 'C' ? 2 : 3);
      const c = pr(a.priority) - pr(b.priority);
      if (c !== 0) return c;
      const da = a.target_date ? new Date(a.target_date + 'T12:00:00').getTime() : 0;
      const db = b.target_date ? new Date(b.target_date + 'T12:00:00').getTime() : 0;
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });
    const primary = sorted[0];
    if (!primary) return;

    setSeasonBuilding(true);
    setSeasonError(null);
    setConflictDialog(null);
    setBuildError(null);
    try {
      const { data, error } = await invokeFunction('create-goal-and-materialize-plan', {
        user_id: buildUserId,
        mode: 'build_existing',
        existing_goal_id: String(primary.id),
        combine: true,
        replace_plan_id: replacePlanId ? String(replacePlanId) : null,
        ...(buildStartDate ? { plan_start_date: buildStartDate } : {}),
      });
      if (error || !data?.success) {
        const parsed = await parseFunctionError(error, data, 'Unable to build season plan');
        if (parsed.code === 'missing_pace_benchmark') setShowCalibration(true);
        throw new Error(parsed.message);
      }
      try {
        window.dispatchEvent(new CustomEvent('planned:invalidate'));
      } catch {
        void 0;
      }
      onPlanBuilt?.();
      await refreshGoals();
      setPlanReadyGoalId(primary.id);
      window.setTimeout(() => {
        setPlanReadyGoalId((prev) => (prev === primary.id ? null : prev));
      }, 6000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to build season plan';
      setSeasonError(message);
    } finally {
      setSeasonBuilding(false);
    }
  }

  // --- Link plan to goal ---

  async function handleLinkPlan(planId: string, goalId: string) {
    try {
      const linkUserId = readStoredUserId();
      if (!linkUserId) throw new Error('Not signed in');

      const { data, error } = await invokeFunction('create-goal-and-materialize-plan', {
        user_id: linkUserId,
        mode: 'link_existing',
        existing_goal_id: String(goalId),
        plan_id: String(planId),
      });
      if (error || !data?.success) {
        const parsed = await parseFunctionError(error, data, 'Unable to link plan');
        throw new Error(parsed.message);
      }

      setLinkDialog(null);
      onPlanBuilt?.();
      refreshGoals();
    } catch (err) {
      console.error('Link plan failed:', err);
    }
  }

  // --- Goal CRUD ---

  async function handleDeleteGoal(goal: Goal) {
    if (!confirm(`Delete "${goal.name}"?`)) return;
    setExpandedGoalId(null);
    toast({
      title: 'Removing race',
      description: `Tearing down plan and rebuilding around remaining races…`,
      duration: 15000,
    });
    const result = await deleteGoal(goal.id);
    toast({
      title: result.ok ? 'Done' : 'Delete failed',
      description: result.message,
      duration: 6000,
    });
    if (result.ok) {
      try { await refreshPlans?.(); } catch {}
      try { await refreshGoals(); } catch {}
    }
  }

  async function handleTogglePause(goal: Goal) {
    await updateGoal(goal.id, { status: goal.status === 'paused' ? 'active' : 'paused' });
  }

  const [existingGoalPrompt, setExistingGoalPrompt] = useState<{ existing: Goal; action?: 'keep' | 'replace' | 'combine' } | null>(null);

  async function handleSaveEvent(directAction?: 'keep' | 'replace' | 'combine') {
    if (!eventName.trim() || !eventDate || !eventFitness || !eventTrainingGoal) return;
    setGoalFlowError(null);

    const sameSportGoal = activeGoals.find(
      g => g.goal_type === 'event' && (g.sport || '').toLowerCase() === String(eventSport ?? '').toLowerCase()
    );
    const crossSportGoal = !sameSportGoal
      ? activeGoals.find(g => g.goal_type === 'event' && g.sport && (g.sport || '').toLowerCase() !== String(eventSport ?? '').toLowerCase())
      : null;

    const conflictGoal = sameSportGoal ?? crossSportGoal ?? null;
    // directAction is passed when the user clicks a choice in the conflict dialog, because
    // React state batching means existingGoalPrompt.action hasn't updated yet at call time.
    const resolvedAction = directAction ?? existingGoalPrompt?.action;
    if (conflictGoal && !resolvedAction) {
      setExistingGoalPrompt({ existing: conflictGoal });
      return;
    }

    setSaving(true);
    try {
      const userId = readStoredUserId();
      if (!userId) throw new Error('Not signed in');

      const action: 'keep' | 'replace' | 'combine' = resolvedAction ?? 'keep';

      // Build payload using only explicit primitives. Avoid `condition && object`
      // spread (which evaluates to `false` when condition is falsy and can leak
      // non-serializable references in some bundler/engine combos on iOS).
      const trainingPrefs: Record<string, string | number> = {
        fitness: String(eventFitness),
        goal_type: String(eventTrainingGoal),
      };
      if (eventStrength !== 'none') {
        trainingPrefs.strength_protocol = String(eventStrength);
        trainingPrefs.strength_frequency = Number(eventStrengthFreq);
      }

      const payload: Record<string, unknown> = {
        user_id: userId,
        action: action === 'combine' ? 'keep' : action,
        combine: action === 'combine',
        priority: eventPriority,
        existing_goal_id: existingGoalPrompt?.existing.id ? String(existingGoalPrompt.existing.id) : null,
        replace_goal_id: action === 'replace' && existingGoalPrompt?.existing.id ? String(existingGoalPrompt.existing.id) : null,
        goal: {
          name: eventName.trim(),
          target_date: String(eventDate),
          sport: String(eventSport),
          distance: eventDistance ? String(eventDistance) : null,
          priority: eventPriority,
          training_prefs: trainingPrefs,
          notes: null,
        },
      };
      if (planStartDate) payload.plan_start_date = String(planStartDate);

      const { data, error } = await invokeFunction('create-goal-and-materialize-plan', payload);
      if (error || !data?.success) {
        const parsed = await parseFunctionError(error, data, 'Unable to create goal and build plan');
        if (parsed.code === 'missing_pace_benchmark') setShowCalibration(true);
        throw new Error(parsed.message);
      }

      setExistingGoalPrompt(null);
      resetForms();
      onPlanBuilt?.();
      refreshGoals();
    } catch (err: any) {
      console.error('Goal create+build flow failed:', err);
      setGoalFlowError(err?.message || 'Unable to build and materialize plan for this goal.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCapacity() {
    if (!capMetric || !capTarget) return;
    setSaving(true);
    await addGoal({ name: `Improve ${capMetric}`, goal_type: 'capacity', target_date: null, sport: null, distance: null, course_profile: {}, target_metric: capMetric, target_value: parseFloat(capTarget), current_value: null, priority: 'A', status: 'active', training_prefs: { category: capCategory }, notes: null });
    setSaving(false); resetForms(); refreshGoals();
  }

  async function handleSaveMaintenance() {
    setSaving(true);
    await addGoal({ name: `${maintSport.charAt(0).toUpperCase() + maintSport.slice(1)} maintenance`, goal_type: 'maintenance', target_date: null, sport: maintSport, distance: null, course_profile: {}, target_metric: null, target_value: null, current_value: null, priority: 'A', status: 'active', training_prefs: { days_per_week: parseInt(maintDays, 10) }, notes: null });
    setSaving(false); resetForms(); refreshGoals();
  }

  // ===================== RENDER =====================

  function renderGoalCard(goal: Goal) {
    const TypeIcon = getGoalTypeIcon(goal.goal_type);
    const SportIcon = getSportIcon(goal.sport);
    const linkedPlan = plansByGoalId.get(goal.id);
    const rrCard = coachWeek.data?.race_readiness;
    const coachPredCard =
      rrCard &&
      String(goal.name) === String(rrCard.goal.name) &&
      (goal.sport || '').toLowerCase() === 'run' &&
      Number.isFinite(rrCard.predicted_finish_time_seconds) &&
      rrCard.predicted_finish_time_seconds > 0
        ? rrCard.predicted_finish_time_seconds
        : null;
    const paceTargetSec =
      coachPredCard ?? resolveEventTargetTimeSeconds(goal, linkedPlan?.config as Record<string, unknown> | undefined);
    const isExpanded = expandedGoalId === goal.id;
    const pastRaceDate = goal.goal_type === 'event' ? formatPastRaceDate(goal.target_date) : null;
    const pastRaceTime = goal.goal_type === 'event' ? formatPastRaceTime(goal.current_value) : null;
    const isInactiveEvent = goal.goal_type === 'event' && goal.status !== 'active';
    const isPastRaceResult = isInactiveEvent && !!pastRaceTime;
    const displayName = isPastRaceResult
      ? [goal.name, pastRaceDate, pastRaceTime].filter(Boolean).join(' ')
      : goal.name;

    return (
      <div key={goal.id} className={`rounded-2xl border p-4 transition-all duration-200 ${isExpanded ? 'border-white/20 bg-white/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}>
        <button className="w-full text-left" onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-white/50" />
              {SportIcon && <SportIcon className="h-4 w-4 text-white/40" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-white/90 truncate">{displayName}</span>
                {goal.priority !== 'A' && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/50">{goal.priority}</span>}
                {goal.status === 'paused' && <span className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-medium text-yellow-400/70">Paused</span>}
                {isPastRaceResult && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300/80">Past</span>}
              </div>
              {isPastRaceResult ? (
                <div className="mt-1 flex items-center gap-2 text-sm text-white/45">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Elapsed finish time</span>
                </div>
              ) : goal.goal_type === 'event' && goal.target_date && (
                <div className="mt-1 flex items-center gap-2 text-sm text-white/50">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{format(new Date(goal.target_date + 'T12:00:00'), 'MMM d, yyyy')}</span>
                  <span className="text-white/30">
                    {(() => {
                      const w = differenceInWeeks(new Date(goal.target_date + 'T12:00:00'), new Date());
                      return w === 1 ? '1 week away' : `${w} weeks away`;
                    })()}
                  </span>
                </div>
              )}
              {goal.goal_type === 'capacity' && (
                <div className="mt-1 flex items-center gap-2 text-sm text-white/50">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>{goal.current_value ?? '?'} → {goal.target_value}</span>
                  {goal.target_metric && <span className="text-white/30">{goal.target_metric}</span>}
                </div>
              )}
              {goal.goal_type === 'maintenance' && (
                <p className="mt-1 text-sm text-white/50">{goal.sport ? `${goal.sport.charAt(0).toUpperCase() + goal.sport.slice(1)} · ` : ''}Ongoing</p>
              )}
            </div>
          </div>
        </button>

        <div className="ml-0 sm:ml-[44px] mt-2">
          {goal.status !== 'active' ? (
            <div className="space-y-2">
              <p className="text-xs text-white/40 leading-relaxed">
                {isPastRaceResult
                  ? 'Saved from your official elapsed race result.'
                  : (() => {
                    const bs = backfillStatus[goal.id];
                    if (bs?.kind === 'saving') return 'Looking up your race result…';
                    if (bs?.kind === 'no_workout')
                      return 'No completed run found on the race date. Add the elapsed time below.';
                    if (bs?.kind === 'error') return `Auto-save error: ${bs.message}. Add it below.`;
                    return 'This goal is no longer active.';
                  })()}
              </p>
              {isInactiveEvent && !isPastRaceResult && backfillStatus[goal.id]?.kind === 'saving' && (
                <div className="flex items-center gap-2 text-xs text-white/55">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving from race workout…</span>
                </div>
              )}
              {isInactiveEvent && !isPastRaceResult && backfillStatus[goal.id]?.kind !== 'saving' && (
                <button
                  type="button"
                  className="w-full rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-left text-xs font-medium text-amber-100/90 hover:bg-amber-500/15 transition-all"
                  onClick={async () => {
                    if (linkedPlan?.id) {
                      const { data, error } = await supabase.functions.invoke('complete-race', {
                        body: { plan_id: linkedPlan.id },
                      });
                      const msg =
                        (data && typeof data === 'object' && typeof (data as any).error === 'string'
                          ? (data as any).error
                          : '') || error?.message || '';
                      if (error || msg) {
                        window.alert(msg || 'Could not save elapsed result from the race workout.');
                        return;
                      }
                      try { window.dispatchEvent(new CustomEvent('goals:invalidate')); } catch {}
                      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                      try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
                      refreshGoals();
                      return;
                    }
                    const input = window.prompt('Elapsed finish time (H:MM or H:MM:SS)', '4:44');
                    if (input == null) return;
                    const seconds = parseElapsedRaceTimeInput(input);
                    if (seconds == null || seconds <= 0) {
                      window.alert('Enter elapsed time like 4:44 or 4:44:00.');
                      return;
                    }
                    const currentPrefs =
                      goal.training_prefs && typeof goal.training_prefs === 'object'
                        ? goal.training_prefs
                        : {};
                    const updated = await updateGoal(goal.id, {
                      status: 'completed',
                      completed_at: new Date().toISOString(),
                      current_value: seconds,
                      training_prefs: {
                        ...currentPrefs,
                        manual_athletic_record: true,
                        race_result: {
                          actual_seconds: seconds,
                          time_source: 'manual_elapsed',
                          completed_at: new Date().toISOString(),
                        },
                      },
                    });
                    if (!updated) {
                      window.alert('Could not save elapsed result. Please try again.');
                      return;
                    }
                    try { window.dispatchEvent(new CustomEvent('goals:invalidate')); } catch {}
                    try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
                    refreshGoals();
                  }}
                >
                  Add elapsed result
                </button>
              )}
            </div>
          ) : linkedPlan ? (
            // When part of a season plan (same plan linked to all event goals), the banner
            // above already shows the plan link — suppress the per-card duplicate.
            seasonPlan && linkedPlan.id === seasonPlan.id ? null : (
              <div className="space-y-1.5">
                {planReadyGoalId === goal.id && (
                  <p className="text-sm font-medium text-teal-300/95">Plan ready</p>
                )}
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm text-white/75 hover:bg-white/[0.07] sm:inline-flex sm:w-auto sm:py-2"
                  onClick={() => onSelectPlan?.(linkedPlan.id)}
                >
                  <span className="min-w-0">
                    Plan: {linkedPlan.name}
                    {linkedPlan.currentWeek != null && <span className="text-white/45"> · Week {linkedPlan.currentWeek}</span>}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
                </button>
              </div>
            )
          ) : (() => {
            const conflictPlan = goal.goal_type === 'event' ? findConflictPlan(goal) : null;

            if (goal.goal_type === 'event' && conflictPlan) {
              return (
                <div className="space-y-2">
                  <p className="text-xs text-white/40">
                    You have an active plan: <span className="text-white/60">{conflictPlan.name}</span>
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-white/[0.08] border border-white/10 px-3 py-2.5 text-xs font-medium text-white/60 hover:bg-white/[0.12] transition-all"
                      disabled={buildingGoalId === goal.id || seasonBuilding}
                      onClick={() => handleLinkPlan(conflictPlan.id, goal.id)}
                    >
                      Link existing plan
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-2 rounded-2xl border border-teal-500/30 bg-teal-950/40 py-3 text-sm font-medium text-teal-100/90 hover:bg-teal-950/55 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={buildingGoalId === goal.id || seasonBuilding}
                      onClick={() => handleBuildPlan(goal)}
                    >
                      {seasonBuilding || buildingGoalId === goal.id ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin opacity-90" />
                          Ending & building…
                        </>
                      ) : (
                        <>
                          <CalendarRange className="h-5 w-5 opacity-90" />
                          {activeEventGoals.length >= 2 ? 'Build season plan' : 'Build Plan'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            }
            if (goal.goal_type === 'event') {
              if (multipleEventGoals) {
                return (
                  <p className="text-xs text-white/40 leading-relaxed">
                    This race is part of your season. Use <span className="text-white/55">Build season plan</span> (above) once — one schedule covers every event (A- and B-race priority), not a separate plan per goal.
                  </p>
                );
              }
              return (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs text-white/45 mb-1 block">Plan starts</span>
                    <input
                      type="date"
                      value={buildStartDate}
                      onChange={(e) => setBuildStartDate(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-white/25 transition-colors [color-scheme:dark]"
                    />
                    {!buildStartDate && (
                      <span className="text-[11px] text-white/30 mt-1 block">Defaults to this Monday.</span>
                    )}
                  </label>
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 rounded-2xl border border-teal-500/30 bg-teal-950/40 py-3 text-sm font-medium text-teal-100/90 hover:bg-teal-950/55 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={buildingGoalId === goal.id || seasonBuilding}
                    onClick={() => handleBuildPlan(goal)}
                  >
                    {buildingGoalId === goal.id ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin opacity-90" />
                        Building…
                      </>
                    ) : (
                      <>
                        <CalendarRange className="h-5 w-5 opacity-90" />
                        Build Plan
                      </>
                    )}
                  </button>
                </div>
              );
            }
            return <p className="text-sm text-white/25">No plan linked</p>;
          })()}
          {buildError?.goalId === goal.id && <p className="mt-1 text-xs text-red-400/70">{buildError.message}</p>}
        </div>

        {!isExpanded && goal.goal_type === 'event' && (goal.sport || '').toLowerCase() === 'run' && (
          (() => {
            const hasCourse = !!courseByGoal[goal.id];
            const isActive = goal.status === 'active';
            // Always show the terrain affordance for run event goals — terrain is course
            // data (not a result) so it's valid to add or re-add it after the race.
            // The only case where we hide is if the goal is cancelled/archived entirely.
            return (
              <div className="ml-[44px] mt-2">
                <button
                  type="button"
                  disabled={courseUploadBusy === goal.id}
                  onClick={() => {
                    if (hasCourse) {
                      setStrategyModalCourseId(courseByGoal[goal.id].id);
                      setStrategyModalOpen(true);
                    } else if (paceTargetSec != null) {
                      setPendingCourseGoalId(goal.id);
                      goalsCourseFileRef.current?.click();
                    } else {
                      setExpandedGoalId(goal.id);
                    }
                  }}
                  className="text-left text-[12px] text-sky-400/85 hover:text-sky-300/90 disabled:opacity-40"
                >
                  {hasCourse
                    ? 'View terrain strategy →'
                    : courseUploadBusy === goal.id
                      ? 'Uploading…'
                      : 'Add terrain course (GPX) →'}
                </button>
              </div>
            );
          })()
        )}

        {isExpanded && goal.goal_type === 'event' && (goal.sport || '').toLowerCase() === 'run' && (
          <div className="mt-3 ml-[44px] border-t border-white/[0.06] pt-3 space-y-2">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-white/45 uppercase">Course</span>
            {paceTargetSec == null ? (
              <p className="text-[11px] text-amber-400/75 leading-snug">
                No race target found for pacing. Link a plan built with a race target time, or set a target finish time on this goal.
              </p>
            ) : courseByGoal[goal.id] ? (
              <button
                type="button"
                onClick={() => {
                  setStrategyModalCourseId(courseByGoal[goal.id].id);
                  setStrategyModalOpen(true);
                }}
                className="text-left text-[12px] text-sky-400/85 hover:text-sky-300/90"
              >
                View terrain strategy →
              </button>
            ) : (
              <button
                type="button"
                disabled={courseUploadBusy === goal.id}
                onClick={() => {
                  setPendingCourseGoalId(goal.id);
                  goalsCourseFileRef.current?.click();
                }}
                className="text-left text-[12px] text-sky-400/85 hover:text-sky-300/90 disabled:opacity-40"
              >
                {courseUploadBusy === goal.id ? 'Uploading…' : 'Add course for terrain strategy →'}
              </button>
            )}
          </div>
        )}

        {isExpanded && (
          <div className="mt-3 ml-[44px] flex items-center gap-2 pt-3 border-t border-white/[0.06]">
            <button onClick={() => handleTogglePause(goal)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-all">
              {goal.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {goal.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => handleDeleteGoal(goal)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400/60 hover:bg-red-400/10 hover:text-red-400/80 transition-all">
              <Trash2 className="h-3.5 w-3.5" />Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderPlanCard(plan: typeof currentPlans[0]) {
    return (
      <div key={plan.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-all duration-200 hover:bg-white/[0.06]">
        <button className="w-full text-left" onClick={() => onSelectPlan?.(plan.id)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium text-white/90">{plan.name}</p>
              {plan.currentWeek != null && <p className="text-sm text-white/50 mt-0.5">Week {plan.currentWeek}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-white/30" />
          </div>
        </button>
        {activeGoals.length > 0 && (
          <button
            className="mt-2 flex items-center gap-1.5 text-xs text-white/35 hover:text-white/55 transition-colors"
            onClick={() => setLinkDialog({ plan })}
          >
            <Link2 className="h-3 w-3" />Link to a goal
          </button>
        )}
      </div>
    );
  }

  // ===================== SUB-SCREENS =====================

  const arcSetupFollowUp =
    showArcSetupNextStep && !loading
      ? multipleEventGoals && seasonPlan
        ? {
            subtitle: 'Your unified schedule is ready.',
            label: 'View training plan',
            disabled: false as const,
            onClick: () => {
              onSelectPlan?.(seasonPlan.id);
              setShowArcSetupNextStep(false);
            },
          }
        : multipleEventGoals
          ? {
              subtitle:
                'Build one calendar for every race. You can set the start date in the section below if you want a specific week-one Monday.',
              label: seasonBuilding ? 'Building…' : 'Build season plan',
              disabled: seasonBuilding,
              onClick: () => {
                void handleBuildSeasonPlan(null);
                setShowArcSetupNextStep(false);
              },
            }
          : primaryActiveEventGoal
            ? plansByGoalId.get(primaryActiveEventGoal.id)
              ? {
                  subtitle: `Open the plan for ${primaryActiveEventGoal.name}.`,
                  label: 'View training plan',
                  disabled: false as const,
                  onClick: () => {
                    const p = plansByGoalId.get(primaryActiveEventGoal.id)!;
                    onSelectPlan?.(p.id);
                    setShowArcSetupNextStep(false);
                  },
                }
              : {
                  subtitle: `Create your schedule for ${primaryActiveEventGoal.name}.`,
                  label: buildingGoalId === primaryActiveEventGoal.id ? 'Building…' : 'Build training plan',
                  disabled: Boolean(buildingGoalId === primaryActiveEventGoal.id || seasonBuilding),
                  onClick: () => {
                    handleBuildPlan(primaryActiveEventGoal);
                    setShowArcSetupNextStep(false);
                  },
                }
            : {
                subtitle: 'Add a race or event to generate a training calendar.',
                label: 'Add goal',
                disabled: false as const,
                onClick: () => {
                  setShowAddGoal(true);
                  setShowArcSetupNextStep(false);
                },
              }
      : null;

  if (showEventForm) return renderEventForm();
  if (showCapacityForm) return renderCapacityForm();
  if (showMaintenanceForm) return renderMaintenanceForm();
  if (showAddGoal) return renderAddGoalSheet();

  // ===================== MAIN SCREEN =====================

  return (
    <div className="flex flex-col h-full">
      {/* Conflict dialog */}
      {conflictDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-5 shadow-2xl">
            <p className="text-base font-medium text-white/90 mb-2">Replace existing plan?</p>
            <p className="text-sm text-white/50 leading-relaxed mb-5">
              You have an active plan: <span className="text-white/70">{conflictDialog.conflictPlan.name}</span>.
              {activeEventGoals.length >= 2 ? (
                <> Ending it will make room for <span className="text-white/70">one season plan that includes all {activeEventGoals.length} of your event goals</span> (A/B priority).</>
              ) : (
                <> This will end it and build a new plan for <span className="text-white/70">{conflictDialog.goal.name}</span>.</>
              )}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConflictDialog(null)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/50 hover:bg-white/[0.06] transition-all">Cancel</button>
              <button
                onClick={() =>
                  activeEventGoals.length >= 2
                    ? void handleBuildSeasonPlan(conflictDialog.conflictPlan.id)
                    : void executeBuildPlan(conflictDialog.goal, conflictDialog.conflictPlan.id)
                }
                className="flex-1 rounded-xl bg-white/[0.15] py-2.5 text-sm font-medium text-white/90 hover:bg-white/[0.22] transition-all"
              >
                {activeEventGoals.length >= 2 ? 'End & build season' : 'End & Build'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link to goal dialog */}
      {linkDialog && activeGoals.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-5 shadow-2xl">
            <p className="text-base font-medium text-white/90 mb-1">Link plan to a goal</p>
            <p className="text-sm text-white/40 mb-4">{linkDialog.plan.name}</p>
            <div className="space-y-2 mb-4">
              {activeGoals.map(g => (
                <button
                  key={g.id}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/80 hover:bg-white/[0.08] transition-all"
                  onClick={() => handleLinkPlan(linkDialog.plan.id, g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
            <button onClick={() => setLinkDialog(null)} className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/50 hover:bg-white/[0.06] transition-all">Cancel</button>
          </div>
        </div>
      )}

      {/* Existing goal prompt */}
      {existingGoalPrompt && !existingGoalPrompt.action && (() => {
        const isCrossSport = (existingGoalPrompt.existing.sport || '').toLowerCase() !== String(eventSport ?? '').toLowerCase();
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-5 shadow-2xl">
              <p className="text-base font-medium text-white/90 mb-2">You already have an active goal</p>
              <p className="text-sm text-white/50 leading-relaxed mb-5">
                <span className="text-white/70">{existingGoalPrompt.existing.name}</span>
                {existingGoalPrompt.existing.target_date && ` · ${format(new Date(existingGoalPrompt.existing.target_date + 'T12:00:00'), 'MMM d')}`}.
                What would you like to do?
              </p>
              <div className="flex flex-col gap-2">
                {isCrossSport && (
                  <button
                    onClick={() => { setExistingGoalPrompt({ ...existingGoalPrompt, action: 'combine' }); handleSaveEvent('combine'); }}
                    className="w-full rounded-xl px-4 py-3 text-left transition-all border border-white/20 bg-white/[0.08] hover:bg-white/[0.12]"
                  >
                    <span className="text-sm font-medium text-white/90">Build combined plan</span>
                    <span className="block text-xs text-white/50 mt-0.5">One unified schedule — shared load budget, hard/easy enforced across both sports</span>
                  </button>
                )}
                <button
                  onClick={() => { setExistingGoalPrompt({ ...existingGoalPrompt, action: 'keep' }); handleSaveEvent('keep'); }}
                  className="w-full rounded-xl px-4 py-3 text-left transition-all border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                >
                  <span className="text-sm font-medium text-white/80">{isCrossSport ? 'Keep separate plans' : 'Keep both'}</span>
                  <span className="block text-xs text-white/35 mt-0.5">{isCrossSport ? 'Two independent plans — no load coordination' : 'Train for both — the new one becomes secondary'}</span>
                </button>
                <button
                  onClick={() => { setExistingGoalPrompt({ ...existingGoalPrompt, action: 'replace' }); handleSaveEvent('replace'); }}
                  className="w-full rounded-xl px-4 py-3 text-left transition-all border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                >
                  <span className="text-sm font-medium text-white/80">Replace it</span>
                  <span className="block text-xs text-white/35 mt-0.5">End {existingGoalPrompt.existing.name} and focus on the new one</span>
                </button>
                <button onClick={() => setExistingGoalPrompt(null)} className="w-full rounded-xl py-2.5 text-sm text-white/40 hover:text-white/60 transition-all">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Calibration modal */}
      {showCalibration && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white/90 mb-1">Quick Calibration</h3>
            <p className="text-sm text-white/40 mb-5">Two paces to set your training zones.</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/50 block mb-1.5">
                  Easy pace — conversational, could hold for an hour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text" inputMode="numeric" placeholder={isMetric ? '6:30' : '10:30'}
                    value={calEasyPace} onChange={e => setCalEasyPace(e.target.value)}
                    className="bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-white/90 text-center text-lg w-28 focus:outline-none focus:border-white/25 transition-colors"
                  />
                  <span className="text-sm text-white/30">{paceUnit}</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-white/50 block mb-1.5">
                  5K pace — fastest you could sustain for ~25 minutes
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text" inputMode="numeric" placeholder={isMetric ? '5:00' : '8:00'}
                    value={calFiveKPace} onChange={e => setCalFiveKPace(e.target.value)}
                    className="bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-white/90 text-center text-lg w-28 focus:outline-none focus:border-white/25 transition-colors"
                  />
                  <span className="text-sm text-white/30">{paceUnit}</span>
                </div>
              </div>

              {parsePace(calEasyPace) && parsePace(calFiveKPace) && (() => {
                const easyS = parsePace(calEasyPace)!, fiveKS = parsePace(calFiveKPace)!;
                if (fiveKS >= easyS) return <p className="text-xs text-red-400/70">5K pace should be faster than easy pace</p>;
                const ratio = easyS / fiveKS;
                if (ratio > 1.8) return <p className="text-xs text-amber-400/60">That's a large gap — double-check your paces</p>;
                const fiveKTime = Math.round((isMetric ? fiveKS * 1.60934 : fiveKS) * 3.10686);
                const vdot = vdotFrom5KTime(fiveKTime);
                const paces = pacesFromVdot(vdot);
                const fmt = (s: number) => fmtPace(isMetric ? s / 1.60934 : s);
                return (
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 space-y-1">
                    <p className="text-xs text-white/40 mb-1.5">Your derived training zones</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-white/40">Easy</span><span className="text-white/70 font-mono">{fmt(paces.base)} {paceUnit}</span>
                      <span className="text-white/40">Tempo</span><span className="text-white/70 font-mono">{fmt(paces.steady)} {paceUnit}</span>
                      <span className="text-white/40">Interval</span><span className="text-white/70 font-mono">{fmt(paces.power)} {paceUnit}</span>
                      <span className="text-white/40">Race</span><span className="text-white/70 font-mono">{fmt(paces.race)} {paceUnit}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCalibration(false); setCalEasyPace(''); setCalFiveKPace(''); }}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/50 hover:bg-white/[0.06] transition-all"
              >Cancel</button>
              <button
                onClick={handleCalibrationSave}
                disabled={!parsePace(calEasyPace) || !parsePace(calFiveKPace) || (parsePace(calFiveKPace)! >= parsePace(calEasyPace)!) || calSaving}
                className="flex-1 rounded-xl bg-white/[0.15] py-2.5 text-sm font-medium text-white/90 hover:bg-white/[0.22] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >{calSaving ? 'Saving...' : 'Set Baseline'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="text-2xl font-semibold text-white/90">Goals</h2>
        <button onClick={onClose} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {arcPlanReady && (
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/40 p-4 mb-4 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-100/95 leading-snug">Season plan ready</p>
              <button
                type="button"
                onClick={() => setArcPlanReady(null)}
                className="rounded-lg p-1 text-white/40 hover:text-white/70 hover:bg-white/10 shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-white/55 mt-2 leading-relaxed">
              Your training calendar is saved. You can open it here or from Home.
            </p>
            {arcPlanReady.planId ? (
              <button
                type="button"
                onClick={() => {
                  onSelectPlan?.(arcPlanReady.planId!);
                  setArcPlanReady(null);
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/15 py-3 text-sm font-medium text-emerald-100/95 hover:bg-emerald-500/25 transition-all"
              >
                <Calendar className="h-4 w-4 opacity-90" />
                View training calendar
              </button>
            ) : null}
          </div>
        )}
        {showArcSetupNextStep && (
          <div className="rounded-2xl border border-teal-500/40 bg-teal-950/45 p-4 mb-4 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-teal-100/95 leading-snug">What’s next</p>
              <button
                type="button"
                onClick={() => setShowArcSetupNextStep(false)}
                className="rounded-lg p-1 text-white/40 hover:text-white/70 hover:bg-white/10 shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {loading ? (
              <p className="text-xs text-white/45 mt-2">Syncing goals from your season setup…</p>
            ) : arcSetupFollowUp ? (
              <>
                <p className="text-xs text-white/55 mt-2 leading-relaxed">{arcSetupFollowUp.subtitle}</p>
                <button
                  type="button"
                  disabled={arcSetupFollowUp.disabled}
                  onClick={arcSetupFollowUp.onClick}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl border border-teal-500/35 bg-teal-500/15 py-3 text-sm font-medium text-teal-100/95 hover:bg-teal-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {arcSetupFollowUp.disabled ? <Loader2 className="h-4 w-4 animate-spin opacity-90" /> : <Calendar className="h-4 w-4 opacity-90" />}
                  {arcSetupFollowUp.label}
                </button>
              </>
            ) : null}
          </div>
        )}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 animate-pulse">
                <div className="h-5 w-2/3 rounded bg-white/10 mb-2" /><div className="h-4 w-1/2 rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : activeGoals.length === 0 && activeUnlinkedPlans.length === 0 && inactiveGoals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="h-10 w-10 text-white/20 mb-4" />
            <p className="text-white/50 text-base">No goals yet</p>
            <p className="text-white/30 text-sm mt-1">Add one to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {multipleEventGoals && (
              <div className="rounded-2xl border border-teal-500/30 bg-teal-950/35 p-4">
                {seasonPlan ? (
                  <>
                    <p className="text-sm text-white/85 font-medium">Season plan active</p>
                    <p className="text-xs text-white/45 leading-relaxed mt-1">
                      One plan covers all {activeEventGoals.length} races (A/B priority).
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelectPlan?.(seasonPlan.id)}
                      className="mt-3 w-full flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm text-white/75 hover:bg-white/[0.07] transition-all"
                    >
                      <span className="min-w-0 truncate">{seasonPlan.name}{seasonPlan.currentWeek != null && <span className="text-white/45"> · Week {seasonPlan.currentWeek}</span>}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-white/85 font-medium">One season, every race</p>
                    <p className="text-xs text-white/45 leading-relaxed mt-1.5">
                      {activeEventGoals.length} event goals. One schedule covers every race (A/B priority) — not a separate plan per goal.
                    </p>
                    <label className="block mt-3">
                      <span className="text-xs text-white/45 mb-1 block">Plan starts</span>
                      <input
                        type="date"
                        value={buildStartDate}
                        onChange={(e) => setBuildStartDate(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-white/25 transition-colors [color-scheme:dark]"
                      />
                      {!buildStartDate && (
                        <span className="text-[11px] text-white/30 mt-1 block">Defaults to this Monday — pick a date to override.</span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleBuildSeasonPlan(null)}
                      disabled={seasonBuilding}
                      className="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl border border-teal-500/40 bg-teal-900/30 py-3 text-sm font-medium text-teal-100/95 hover:bg-teal-900/45 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {seasonBuilding ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin opacity-90" />
                          Building season…
                        </>
                      ) : (
                        <>
                          <CalendarRange className="h-5 w-5 opacity-90" />
                          Build season plan
                        </>
                      )}
                    </button>
                    {seasonError && <p className="mt-2 text-xs text-red-400/80">{seasonError}</p>}
                  </>
                )}
              </div>
            )}
            {activeGoals.map(renderGoalCard)}

            {activeUnlinkedPlans.length > 0 && (
              <>
                {activeGoals.length > 0 && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs font-medium text-white/30 uppercase tracking-wider">Active Plans</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                )}
                {activeUnlinkedPlans.map(renderPlanCard)}
              </>
            )}

            {expandedGoalId === '__past' && inactiveGoals.map(renderGoalCard)}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 px-4 pb-4 pt-2 space-y-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/arc-setup');
          }}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-teal-500/30 bg-teal-950/40 py-3 text-sm font-medium text-teal-100/90 hover:bg-teal-950/55 transition-all"
        >
          <CalendarRange className="h-5 w-5 opacity-90" />
          Plan my season
        </button>
        <button onClick={() => setShowAddGoal(true)} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-white/70 font-medium hover:bg-white/[0.10] transition-all">
          <Plus className="h-5 w-5" />Add Goal
        </button>
        {inactiveGoals.length > 0 && (
          <button
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs text-white/55 hover:text-white/80 transition-colors"
            onClick={() => setExpandedGoalId(prev => prev === '__past' ? null : '__past')}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedGoalId === '__past' ? 'rotate-0' : '-rotate-90'}`} />
            <span>
              Past goals <span className="text-white/40">({inactiveGoals.length})</span>
            </span>
          </button>
        )}
        {completedPlans.length > 0 && (
          <button
            onClick={() => onViewAllPlans?.()}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs text-white/55 hover:text-white/80 transition-colors"
          >
            <List className="h-3.5 w-3.5" />
            <span>
              View past plans <span className="text-white/40">({completedPlans.length})</span>
            </span>
          </button>
        )}
      </div>

      <input
        ref={goalsCourseFileRef}
        type="file"
        accept=".gpx,application/gpx+xml,.xml"
        className="hidden"
        onChange={handleGoalsCourseFile}
      />
      <CourseStrategyModal
        open={strategyModalOpen}
        courseId={strategyModalCourseId}
        onClose={() => {
          setStrategyModalOpen(false);
          setStrategyModalCourseId(null);
        }}
      />
    </div>
  );

  // ===================== FORM SCREENS =====================

  function renderAddGoalSheet() {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-2xl font-semibold text-white/90">New Goal</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="space-y-3">
            {[
              { type: 'event', icon: Flag, title: 'Train for an event', sub: 'Race, competition, or target date' },
              { type: 'capacity', icon: TrendingUp, title: 'Improve a metric', sub: 'Get faster, stronger, or build endurance' },
              { type: 'maintenance', icon: Activity, title: 'Stay consistent', sub: 'Maintain fitness with structured training' },
            ].map(({ type, icon: Icon, title, sub }) => (
              <button key={type} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition-all hover:bg-white/[0.08]"
                onClick={() => { setShowAddGoal(false); type === 'event' ? setShowEventForm(true) : type === 'capacity' ? setShowCapacityForm(true) : setShowMaintenanceForm(true); }}>
                <div className="flex items-center gap-4">
                  <Icon className="h-6 w-6 text-white/60" />
                  <div><p className="text-base font-medium text-white/90">{title}</p><p className="text-sm text-white/40 mt-0.5">{sub}</p></div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            <button className="w-full rounded-xl px-4 py-3 text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all text-left" onClick={() => { resetForms(); navigate('/plans/generate'); }}>Build a custom plan</button>
            <button className="w-full rounded-xl px-4 py-3 text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all text-left" onClick={() => { resetForms(); navigate('/plans/catalog'); }}>Browse plan library</button>
          </div>
        </div>
      </div>
    );
  }

  function renderEventForm() {
    const hasSameSportActiveGoal = activeGoals.some(
      g => g.goal_type === 'event' && (g.sport || '').toLowerCase() === String(eventSport ?? '').toLowerCase()
    );
    const requiresDistance = Boolean(DISTANCE_OPTIONS[eventSport]);

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-xl font-semibold text-white/90">Train for an event</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          {!currentBaselines && !athleteMemory && currentSnapshots.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-white/60">Connect Strava to personalize this</p>
                <p className="text-xs text-white/30 mt-0.5">We'll auto-fill your training level and suggest the right plan</p>
              </div>
              <button onClick={() => { resetForms(); navigate('/connections'); }} className="shrink-0 rounded-lg bg-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/30 transition-colors">Connect</button>
            </div>
          )}
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Name</span>
            <input type="text" placeholder="e.g. Boston Marathon" value={eventName} onChange={e => setEventName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Race Date</span>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors [color-scheme:dark]" />
            </label>
            <label className="block">
              <span className="text-sm text-white/50 mb-1.5 block">Plan Starts</span>
              <input type="date" value={planStartDate} onChange={e => setPlanStartDate(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors [color-scheme:dark]" />
            </label>
          </div>
          {!planStartDate && (
            <p className="text-xs text-white/30 -mt-1">Plan start defaults to this Monday — set a date above to control when training begins.</p>
          )}
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Sport</span>
            <select value={eventSport} onChange={e => { setEventSport(e.target.value); setEventDistance(''); }} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="run">Run</option><option value="ride">Ride</option><option value="swim">Swim</option><option value="triathlon">Triathlon</option><option value="other">Other</option>
            </select>
          </label>
          {DISTANCE_OPTIONS[eventSport] && (
            <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Distance</span>
              <select value={eventDistance} onChange={e => setEventDistance(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
                <option value="">Select distance</option>
                {DISTANCE_OPTIONS[eventSport].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
          {(() => {
            const hasData = !!(currentBaselines || currentSnapshot);
            const fitnessLabels: Record<string, [string, string]> = {
              beginner: ['Building up', '< 12 mi/week or new to structured training'],
              intermediate: ['Consistent', '12–30 mi/week with some race experience'],
              advanced: ['Competitive', '30+ mi/week, chasing PRs'],
            };
            const goalLabels: Record<string, [string, string]> = {
              complete: ['Finish it', 'Comfortable volume build — cross the line healthy'],
              speed: ['Race for time', 'Pace-targeted plan with intervals and tempo work'],
            };

            return (<>
              <div>
                <span className="text-sm text-white/50 mb-1.5 block">Training level</span>
                {hasData && eventFitness && !overrideFitness ? (
                  <div className="rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white/90">{fitnessLabels[eventFitness]?.[0]}</span>
                        <span className="block text-xs text-white/40 mt-0.5">{fitnessLabels[eventFitness]?.[1]}</span>
                        {prefillSource.fitness && <span className="block text-xs text-white/25 mt-1">↑ {prefillSource.fitness}</span>}
                      </div>
                      <button onClick={() => setOverrideFitness(true)} className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 ml-3">Change</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(['beginner', 'intermediate', 'advanced'] as const).map(val => (
                      <button key={val} onClick={() => { setEventFitness(val); if (hasData) setOverrideFitness(false); }} className={`w-full rounded-xl px-4 py-3 text-left transition-all border ${eventFitness === val ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'}`}>
                        <span className={`text-sm font-medium ${eventFitness === val ? 'text-white/90' : 'text-white/50'}`}>{fitnessLabels[val][0]}</span>
                        <span className={`block text-xs mt-0.5 ${eventFitness === val ? 'text-white/50' : 'text-white/25'}`}>{fitnessLabels[val][1]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="text-sm text-white/50 mb-1.5 block">What's your goal?</span>
                {hasData && eventTrainingGoal && !overrideGoal ? (
                  <div className="rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white/90">{goalLabels[eventTrainingGoal]?.[0]}</span>
                        <span className="block text-xs text-white/40 mt-0.5">{goalLabels[eventTrainingGoal]?.[1]}</span>
                        {prefillSource.goal && <span className="block text-xs text-white/25 mt-1">↑ {prefillSource.goal}</span>}
                      </div>
                      <button onClick={() => setOverrideGoal(true)} className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 ml-3">Change</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(['complete', 'speed'] as const).map(val => (
                      <button key={val} onClick={() => { setEventTrainingGoal(val); if (hasData) setOverrideGoal(false); }} className={`w-full rounded-xl px-4 py-3 text-left transition-all border ${eventTrainingGoal === val ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'}`}>
                        <span className={`text-sm font-medium ${eventTrainingGoal === val ? 'text-white/90' : 'text-white/50'}`}>{goalLabels[val][0]}</span>
                        <span className={`block text-xs mt-0.5 ${eventTrainingGoal === val ? 'text-white/50' : 'text-white/25'}`}>{goalLabels[val][1]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="text-sm text-white/50 mb-1.5 block">Strength work</span>
                {(() => {
                  const strengthLabels: Record<string, [string, string]> = {
                    none: ['No strength', 'Running only'],
                    neural_speed: ['Get faster', 'Heavy lifts for power and running economy'],
                    durability: ['Stay healthy', 'Injury prevention with progressive strength'],
                    upper_aesthetics: ['Build upper body', 'Hypertrophy up top, functional legs'],
                  };
                  const hasExisting = eventStrength !== 'none';
                  const freqLabel = `${eventStrengthFreq}x/week`;

                  if (hasExisting && !overrideStrength) return (
                    <div className="rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-white/90">{strengthLabels[eventStrength]?.[0]} · {freqLabel}</span>
                          <span className="block text-xs text-white/40 mt-0.5">{strengthLabels[eventStrength]?.[1]}</span>
                          {prefillSource.strength && <span className="block text-xs text-white/25 mt-1">↑ {prefillSource.strength}</span>}
                        </div>
                        <button onClick={() => setOverrideStrength(true)} className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 ml-3">Change</button>
                      </div>
                    </div>
                  );

                  return (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2">
                        {(['none', 'neural_speed', 'durability', 'upper_aesthetics'] as const).map(val => (
                          <button key={val} onClick={() => { setEventStrength(val); if (val !== 'none') setOverrideStrength(false); }} className={`w-full rounded-xl px-4 py-3 text-left transition-all border ${eventStrength === val ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'}`}>
                            <span className={`text-sm font-medium ${eventStrength === val ? 'text-white/90' : 'text-white/50'}`}>{strengthLabels[val][0]}</span>
                            <span className={`block text-xs mt-0.5 ${eventStrength === val ? 'text-white/50' : 'text-white/25'}`}>{strengthLabels[val][1]}</span>
                          </button>
                        ))}
                      </div>
                      {eventStrength !== 'none' && (
                        <div>
                          <span className="text-xs text-white/40 mb-1.5 block">Sessions per week</span>
                          <div className="flex gap-2">
                            {([2, 3] as const).map(n => (
                              <button key={n} onClick={() => setEventStrengthFreq(n)} className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all border ${eventStrengthFreq === n ? 'border-white/25 bg-white/[0.12] text-white/90' : 'border-white/10 bg-white/[0.04] text-white/40 hover:bg-white/[0.06]'}`}>{n}x/week</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>);
          })()}
          {(() => {
            // Only ask about priority when there's already an active event goal.
            // For a first/only race the answer is always A — don't make the athlete
            // solve a problem that doesn't exist yet.
            const activeEventGoals = activeGoals.filter(g => g.goal_type === 'event');
            if (activeEventGoals.length === 0) return null;

            // Pick the most important existing event to name in the copy.
            const existingPrimary = activeEventGoals.find(g => g.priority === 'A') ?? activeEventGoals[0];
            const existingName = existingPrimary?.name || 'your current race';
            const newName = eventName.trim() || 'this race';

            // Determine whether dates make the priority obvious so we can simplify
            // the copy. If the new race is more than 8 weeks after the existing one
            // the user is probably asking to train sequentially, not competitively.
            const existingDate = existingPrimary?.target_date ? parseLocalDate(String(existingPrimary.target_date).slice(0, 10)) : null;
            const newDate = eventDate ? new Date(eventDate) : null;
            const gapWeeks = existingDate && newDate
              ? Math.round((newDate.getTime() - existingDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
              : null;
            const newRaceIsFirst = gapWeeks != null && gapWeeks < 0;
            const sequentialGap = gapWeeks != null && Math.abs(gapWeeks) > 16;

            type PriorityOption = {
              val: 'A' | 'B' | 'C';
              headline: string;
              detail: string;
            };

            const options: PriorityOption[] = newRaceIsFirst
              ? [
                  { val: 'A', headline: `Peak for ${newName}`, detail: `The plan peaks here — bike and swim volume holds, other sports adjust around your race week.` },
                  { val: 'B', headline: `${newName} is a milestone, not the peak`, detail: `A few days of rest beforehand, but training keeps building toward ${existingName}.` },
                  { val: 'C', headline: `Just a training race`, detail: `No rest — you'll race ${newName} at effort and train straight through.` },
                ]
              : [
                  { val: 'A', headline: `Keep ${existingName} as my main focus`, detail: `Training stays on course — ${newName} gets a short taper but your peak is still ${existingName}.` },
                  { val: 'B', headline: `${newName} is my new priority`, detail: `The plan shifts its peak to ${newName}. ${existingName} becomes the tune-up race.` },
                  { val: 'C', headline: `${newName} is just for fun`, detail: `No rest before it — train straight through and race on feel.` },
                ];

            // When the gap is sequential (> 16 weeks apart), the engine already handles
            // each event as its own cycle. Surface a lighter single-question UI.
            if (sequentialGap) {
              return (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-xs text-white/50 leading-relaxed">
                    These races are far enough apart that the plan will build a full cycle for each — first toward{' '}
                    <span className="text-white/70">{newRaceIsFirst ? newName : existingName}</span>, then recover and rebuild toward{' '}
                    <span className="text-white/70">{newRaceIsFirst ? existingName : newName}</span>.
                    No priority decision needed.
                  </p>
                </div>
              );
            }

            return (
              <div>
                <span className="text-sm text-white/50 mb-1.5 block">Which race matters more to you?</span>
                <div className="flex flex-col gap-2">
                  {options.map(({ val, headline, detail }) => (
                    <button
                      key={val}
                      onClick={() => setEventPriority(val)}
                      className={`w-full rounded-xl px-4 py-3 text-left transition-all border ${
                        eventPriority === val
                          ? 'border-white/25 bg-white/[0.12]'
                          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className={`text-sm font-medium block ${eventPriority === val ? 'text-white/90' : 'text-white/55'}`}>{headline}</span>
                      <span className={`text-xs mt-0.5 block leading-snug ${eventPriority === val ? 'text-white/45' : 'text-white/25'}`}>{detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          {saving ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white/50" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                <span className="text-sm font-medium text-white/80">Building your plan…</span>
              </div>
              <p className="text-xs text-white/40">This can take a few moments. You can leave this screen — your plan will be ready when you come back.</p>
            </div>
          ) : (
            <button onClick={handleSaveEvent} disabled={!eventName.trim() || !eventDate || !eventFitness || !eventTrainingGoal || (requiresDistance && !eventDistance)} className="w-full mt-4 rounded-xl bg-white/[0.15] py-3 text-base font-medium text-white/90 hover:bg-white/[0.20] disabled:opacity-40 disabled:cursor-not-allowed transition-all">Save & Build Plan</button>
          )}
          {!saving && requiresDistance && !eventDistance && (
            <p className="mt-2 text-xs text-white/35">Select a race distance to continue.</p>
          )}
          {!saving && hasSameSportActiveGoal && (
            <p className="mt-2 text-xs text-white/45">
              You already have an active goal in this sport. You will choose to keep both or replace.
            </p>
          )}
          {goalFlowError && (
            <p className="mt-2 text-xs text-red-400/80">{goalFlowError}</p>
          )}
        </div>
      </div>
    );
  }

  function renderCapacityForm() {
    const metrics = METRIC_OPTIONS[capCategory] ?? [];
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-xl font-semibold text-white/90">Improve a metric</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Category</span>
            <select value={capCategory} onChange={e => { setCapCategory(e.target.value); setCapMetric(''); }} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              {Object.keys(METRIC_OPTIONS).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Metric</span>
            <select value={capMetric} onChange={e => setCapMetric(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="">Select metric</option>
              {metrics.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Target value</span>
            <input type="number" value={capTarget} onChange={e => setCapTarget(e.target.value)} placeholder="e.g. 250" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors" />
          </label>
          <button onClick={handleSaveCapacity} disabled={saving || !capMetric || !capTarget} className="w-full mt-4 rounded-xl bg-white/[0.15] py-3 text-base font-medium text-white/90 hover:bg-white/[0.20] disabled:opacity-40 disabled:cursor-not-allowed transition-all">{saving ? 'Saving...' : 'Save Goal'}</button>
        </div>
      </div>
    );
  }

  function renderMaintenanceForm() {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-xl font-semibold text-white/90">Stay consistent</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Sport focus</span>
            <select value={maintSport} onChange={e => setMaintSport(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="run">Run</option><option value="ride">Ride</option><option value="swim">Swim</option><option value="strength">Strength</option><option value="general">General</option>
            </select>
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Days per week</span>
            <select value={maintDays} onChange={e => setMaintDays(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option>
            </select>
          </label>
          <button onClick={handleSaveMaintenance} disabled={saving} className="w-full mt-4 rounded-xl bg-white/[0.15] py-3 text-base font-medium text-white/90 hover:bg-white/[0.20] disabled:opacity-40 disabled:cursor-not-allowed transition-all">{saving ? 'Saving...' : 'Save Goal'}</button>
        </div>
      </div>
    );
  }
};

export default GoalsScreen;
