import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { CoachWeekContextV1 } from '@/hooks/useCoachWeekContext';
import { useExerciseLog } from '@/hooks/useExerciseLog';
import { formatLocalDate } from '@/lib/dateUtils';
// [D-374 → Step 2] The SAME axis the server gates coaching language on, so the row that renders and
// the verdict that fills it can never disagree about what a main lift is. `coached` is true on
// exactly one type row and that row is built from `MAIN_BARBELL_LIFTS`, so this is the same answer
// `isMainBarbellLift` gave — asked as a capability, from the table that also says what to render
// instead. See SPEC-strength-language, Step 2.
import { capabilitiesForExercise } from '@/lib/exercise-role';
import LoadBar from '@/components/LoadBar';
import { supabase, getStoredUserId, invokeFunctionFormData, invokeFunction } from '@/lib/supabase';
import { resolveEventTargetTimeSeconds } from '@/lib/goal-target-time';
import CourseStrategyModal from '@/components/CourseStrategyModal';
import { pickRaceFinishProjectionV1FromCoachData, pickRaceReadinessFromCoachData } from '@/lib/coach-payload';
import { actualFinishSecondsPreferElapsed, type WorkoutTimeRow } from '@/lib/race-finish-seconds';
import { fetchArcContext } from '@/lib/fetch-arc-context';
import type { ArcReadiness } from '@/lib/arc-types';
import { shouldShowNudge } from '@/lib/nudge-policy';
import StatePerformanceSection from '@/components/context/StatePerformanceSection';
import StateHubTabs, { type StateLens } from '@/components/context/StateHubTabs';
import StateAdjustLens from '@/components/context/StateAdjustLens';
import { buildLoadHeadline, statusVolumeLabel } from '@/lib/load-headline';
import { loadRead } from '@/lib/load-read';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { useSwimBaselineNudge } from '@/hooks/useSwimBaselineNudge';
import { useAppContext } from '@/contexts/AppContext';
import StrengthLoggedSets from './StrengthLoggedSets';
import StateNextBlock from './StateNextBlock';
import StateSignalBlock from './StateSignalBlock';
import StateSwimNudge from './StateSwimNudge';
import StateRaceBlock from './StateRaceBlock';
import StateWeekExecution from './StateWeekExecution';
import StateReadinessRow from './StateReadinessRow';
import StateBodyBlock from './StateBodyBlock';
import StateRaceDayBar from './StateRaceDayBar';
import StateLastRaceCard from './StateLastRaceCard';
import StateHeaderBlock from './StateHeaderBlock';

import {
  isNudgeSnoozed,
  snoozeNudge,
  type CoachDataProp,
  type VisibleSignal,
  type PrimaryRaceReadinessRow,
  isRaceWeekClosed,
  isRunPrimary,
  goalMetaFromGoalLite,
} from './state-primitives';


export default function StateTab({
  coachData,
  onClose,
  onSelectWorkout,
}: {
  coachData: CoachDataProp;
  onClose?: () => void;
  onSelectWorkout?: (workout: any) => void;
}) {
  const navigate = useNavigate();
  const { data, loading, error, refresh, revalidating } = coachData;
  const coachBusy = loading || Boolean(revalidating);
  const { liftTrends } = useExerciseLog(8);
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null); // D-232 BODY-row provenance tap
  const [stateLens, setStateLens] = useState<StateLens>('status'); // State-as-hub: Status / Adjust / Schedule (D-316)
  // Strength per-lift detail is COLLAPSED by default (Michael 2026-07-16) — the e1RM dot is the read;
  // the per-lift "from your logged sets" list is drill-down, folded until tapped.
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null);
  const [stateCourseRow, setStateCourseRow] = useState<{ id: string; name: string } | null>(null);
  const [courseBusy, setCourseBusy] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyCourseId, setStrategyCourseId] = useState<string | null>(null);
  const stateCourseFileRef = useRef<HTMLInputElement>(null);
  const [fetchedOfficialResult, setFetchedOfficialResult] = useState<{
    actual_seconds: number;
    goal_target_seconds: number | null;
  } | null>(null);
  const [postRaceUnofficial, setPostRaceUnofficial] = useState<{
    loggedSeconds: number;
    workoutId: string;
    daysAfterRace: number;
  } | null>(null);
  const [longitudinalSignals, setLongitudinalSignals] = useState<unknown>(null);
  // Daily check-in readiness (Q-049). Named distinctly from the local
  // `readiness`/`readiness_state` (cycling form) used further down in render.
  const [checkinReadiness, setCheckinReadiness] = useState<ArcReadiness | null>(null);
  const [nudgeDismissNonce, setNudgeDismissNonce] = useState(0);
  const swimNudge = useSwimBaselineNudge(); // D-200: honored-swim-gated swim re-test nudge (State only)
  const { useImperial } = useAppContext(); // imperial → yards, metric → meters — for the SWIM sessions row distance

  useEffect(() => {
    fetchArcContext().then((arc) => {
      setLongitudinalSignals(arc?.longitudinal_signals ?? null);
      setCheckinReadiness((arc?.readiness as ArcReadiness | null) ?? null);
    });
  }, []);

  const nudgeDecision = shouldShowNudge(longitudinalSignals as Parameters<typeof shouldShowNudge>[0]);
  // D-302 slice 2: the grinding read (RIR below prescription) is rendered on the STRENGTH READ itself
  // (StatePerformanceSection), not as a nudge — so it lives in one place next to the e1RM verdict. Pulled
  // from the nudge allow-list (nudge-policy.ts) so it can't also fire a banner. One fact, one home.
  const strengthFatigue = Array.isArray(longitudinalSignals)
    && (longitudinalSignals as Array<{ id?: string }>).some((s) => s?.id === 'strength_rir_below_prescription');
  // nudgeDismissNonce is incremented on dismiss to force re-evaluation of isNudgeSnoozed.
  const showNudge =
    nudgeDismissNonce >= 0 &&
    nudgeDecision.show &&
    !!nudgeDecision.nudge_kind &&
    !!nudgeDecision.headline &&
    !isNudgeSnoozed(nudgeDecision.nudge_kind);

  const raceReadiness = pickRaceReadinessFromCoachData(data as CoachWeekContextV1 | null);
  const raceFinishProjection = pickRaceFinishProjectionV1FromCoachData(data as CoachWeekContextV1 | null);

  useEffect(() => {
    const gc = (data as CoachWeekContextV1 | null)?.goal_context;
    const planId = data?.weekly_state_v1?.plan?.plan_id ?? null;
    const goalFromPlan =
      planId && gc?.goals ? gc.goals.find(g => g.plan_id === planId && isRunPrimary(g)) : undefined;

    const goalIdFromCoach =
      raceFinishProjection?.goal_id?.trim() ||
      raceReadiness?.goal?.id?.trim() ||
      gc?.primary_event?.id?.trim() ||
      goalFromPlan?.id?.trim() ||
      null;

    if (!goalIdFromCoach) {
      setResolvedGoalId(null);
      setStateCourseRow(null);
      return;
    }
    const uid = getStoredUserId();
    if (!uid) return;
    let cancelled = false;

    (async () => {
      let goalId: string | null = goalIdFromCoach;

      if (!goalId && raceReadiness) {
        const { data: goalsRows, error: goalsErr } = await supabase
          .from('goals')
          .select('id, name, status, sport')
          .eq('user_id', uid)
          .eq('status', 'active');
        if (goalsErr) {
          console.warn('[StateTab] goals lookup failed:', goalsErr.message);
          if (!cancelled) {
            setResolvedGoalId(null);
            setStateCourseRow(null);
          }
          return;
        }
        const g = (goalsRows || []).find(
          (x: { name?: string; sport?: string | null }) =>
            String(x.name || '') === raceReadiness.goal.name && String(x.sport || '').toLowerCase() === 'run',
        ) as { id: string } | undefined;
        goalId = g?.id ?? null;
      }

      if (!goalId || cancelled) {
        if (!cancelled) {
          setResolvedGoalId(null);
          setStateCourseRow(null);
        }
        return;
      }
      if (!cancelled) setResolvedGoalId(goalId);
      const { data: rc } = await supabase.from('race_courses').select('id, name').eq('goal_id', goalId).maybeSingle();
      if (cancelled) return;
      if (rc?.id) setStateCourseRow({ id: rc.id as string, name: String(rc.name || 'Course') });
      else setStateCourseRow(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    raceFinishProjection?.goal_id,
    raceReadiness?.goal?.id,
    raceReadiness?.goal?.name,
    raceReadiness?.goal?.weeks_out,
    data?.weekly_state_v1?.plan?.plan_id,
    (data as CoachWeekContextV1 | null)?.goal_context?.primary_event?.id,
    (data as CoachWeekContextV1 | null)?.goal_context?.goals
      ?.map(g => `${g.id}:${g.plan_id ?? '-'}`)
      .join('|'),
    raceFinishProjection ? 1 : 0,
    raceReadiness ? 1 : 0,
  ]);

  useEffect(() => {
    if (!resolvedGoalId) {
      setFetchedOfficialResult(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: row, error: rowErr } = await supabase
        .from('goals')
        .select('status, current_value, target_time, goal_type')
        .eq('id', resolvedGoalId)
        .maybeSingle();
      if (cancelled) return;
      if (rowErr || !row) {
        setFetchedOfficialResult(null);
        return;
      }
      if (
        String((row as { goal_type?: string }).goal_type) === 'event' &&
        String((row as { status?: string }).status) === 'completed' &&
        typeof (row as { current_value?: number }).current_value === 'number' &&
        (row as { current_value: number }).current_value > 0
      ) {
        const cv = (row as { current_value: number }).current_value;
        const tt = (row as { target_time?: number | null }).target_time;
        setFetchedOfficialResult({
          actual_seconds: Math.round(cv),
          goal_target_seconds:
            tt != null && Number.isFinite(Number(tt)) && Number(tt) > 0 ? Math.round(Number(tt)) : null,
        });
      } else {
        setFetchedOfficialResult(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedGoalId]);

  useEffect(() => {
    const d = data as CoachWeekContextV1 | null;
    if (!d?.weekly_state_v1) {
      setPostRaceUnofficial(null);
      return;
    }
    if (fetchedOfficialResult) {
      setPostRaceUnofficial(null);
      return;
    }
    const wsv0 = d.weekly_state_v1;
    const asY0 = d.as_of_date?.slice(0, 10) || '';
    const gc0 = d.goal_context;
    const planId0 = wsv0.plan?.plan_id ?? null;
    const gLink =
      planId0 && gc0?.goals
        ? gc0.goals.find(g => g.plan_id === planId0 && isRunPrimary(g))
        : undefined;
    const planA = (d as CoachWeekContextV1 & { plan?: { active_plans?: Array<{ plan_id?: string; race_date?: string | null }> } }).plan
      ?.active_plans;
    const entry0 = planId0 && planA ? planA.find(p => p.plan_id === planId0) : undefined;
    const raceY0 =
      gLink?.target_date?.slice(0, 10) ||
      (entry0?.race_date ? String(entry0.race_date).slice(0, 10) : null);
    if (!raceY0 || asY0 <= raceY0) {
      setPostRaceUnofficial(null);
      return;
    }
    const t0 = new Date(raceY0 + 'T12:00:00').getTime();
    const t1 = new Date(asY0 + 'T12:00:00').getTime();
    const dayDiff = Math.floor((t1 - t0) / 86400000);
    if (dayDiff < 1) {
      setPostRaceUnofficial(null);
      return;
    }
    const lcr = d.last_completed_race;
    if (lcr) {
      if (resolvedGoalId && lcr.goal_id === resolvedGoalId) {
        setPostRaceUnofficial(null);
        return;
      }
      if (gLink?.id && lcr.goal_id === gLink.id) {
        setPostRaceUnofficial(null);
        return;
      }
      if (gc0?.primary_event?.id && lcr.goal_id === gc0.primary_event.id) {
        setPostRaceUnofficial(null);
        return;
      }
    }
    const uid = getStoredUserId();
    if (!uid) {
      setPostRaceUnofficial(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: wrows, error: wErr } = await supabase
        .from('workouts')
        .select('id, date, type, workout_status, moving_time, elapsed_time, duration, computed, name')
        .eq('user_id', uid)
        .eq('date', raceY0)
        .eq('workout_status', 'completed');
      if (cancelled) return;
      if (wErr) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      const rows = Array.isArray(wrows) ? wrows : [];
      if (rows.length === 0) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      const runish = (t: string) => {
        const x = (t || '').toLowerCase();
        return x === 'run' || x === 'running' || !x;
      };
      const runs = rows.filter((r) => runish(String((r as { type?: string }).type || '')));
      let pick: (typeof rows)[0] | null = null;
      if (runs.length === 1) pick = runs[0] ?? null;
      else if (runs.length > 1) {
        const dist = (r: (typeof rows)[0]) => {
          const m = Number(
            (r as { computed?: { overall?: { distance_m?: number } } })?.computed?.overall?.distance_m,
          );
          return Number.isFinite(m) && m > 0 ? m : 0;
        };
        pick = runs.reduce((a, b) => (dist(a) >= dist(b) ? a : b));
      }
      if (!pick) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      const sec = actualFinishSecondsPreferElapsed(pick as WorkoutTimeRow);
      if (sec == null || !Number.isFinite(sec) || sec <= 0) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      if (!cancelled) {
        setPostRaceUnofficial({
          loggedSeconds: sec,
          workoutId: String((pick as { id: string }).id),
          daysAfterRace: dayDiff,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, resolvedGoalId, fetchedOfficialResult]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-4 h-4 animate-spin text-white/65" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="py-8 text-center text-[13px] text-white/50">{error ?? 'No data'}</div>;
  }

  const wsv = data.weekly_state_v1;
  if (!wsv) return <div className="py-8 text-center text-[13px] text-white/50">Loading state…</div>;

  const week = wsv.week;
  // ⛔ THE SAME planned-vs-done SOURCE THE BAR READS (2026-09-01) — `wsv.week_execution_v1.counts`,
  // summed across disciplines, handed to the programme-aware load read. No second notion of "missed".
  const weekExecTotals = (() => {
    const counts = ((wsv as any).week_execution_v1?.counts ?? []) as Array<{ planned?: number; done?: number }>;
    return {
      planned: counts.reduce((s, c) => s + (Number(c?.planned) || 0), 0),
      done: counts.reduce((s, c) => s + (Number(c?.done) || 0), 0),
    };
  })();
  const load = wsv.load;
  const rm = ((data as any)?.response_model ?? (wsv as any)?.response_model) as {
    visible_signals: Array<VisibleSignal>;
    overall_training_read?: { summary: string; tone: 'positive' | 'warning' | 'neutral' | 'info' } | null;
    strength: { per_lift: Array<{ canonical_name: string; display_name: string; e1rm_trend: string; rir_current: number | null; sufficient: boolean; last_session_date?: string | null }> };
    endurance: unknown;
    assessment: { label: string; signals_concerning: number };
  } | undefined;
  const snap = (data as any)?.athlete_snapshot ?? null;
  const loadStatus = snap?.body_response?.load_status ?? null;
  const primaryRaceReadiness: PrimaryRaceReadinessRow | null = data?.primary_race_readiness ?? null;

  const gc = (data as CoachWeekContextV1).goal_context;
  const pe = gc?.primary_event;

  const goalMetaPrimary = pe ? goalMetaFromGoalLite(pe, gc?.upcoming_races) : null;
  const projGid = raceFinishProjection?.goal_id?.trim();
  const goalForProj = projGid && gc?.goals ? gc.goals.find(x => x.id === projGid) : undefined;
  const goalMetaFromProjection = goalForProj ? goalMetaFromGoalLite(goalForProj, gc?.upcoming_races) : null;
  const activePlanId = wsv.plan.plan_id;
  const goalLinkedToPlan =
    activePlanId && gc?.goals
      ? gc.goals.find(g => g.plan_id === activePlanId && isRunPrimary(g))
      : undefined;
  const goalMetaFromPlanLink = goalLinkedToPlan
    ? goalMetaFromGoalLite(goalLinkedToPlan, gc?.upcoming_races)
    : null;
  const goalMeta = goalMetaPrimary ?? goalMetaFromProjection ?? goalMetaFromPlanLink ?? null;

  const planRoot = (
    data as CoachWeekContextV1 & {
      plan?: {
        active_plans?: Array<{
          plan_id?: string | null;
          distance?: string | null;
          is_primary?: boolean;
          plan_target_finish_seconds?: number | null;
        }>;
      };
    }
  ).plan;
  const activePlans = planRoot?.active_plans;
  const planWizardDistance =
    (activePlanId && activePlans?.find(p => p.plan_id === activePlanId)?.distance) ??
    activePlans?.find(p => p.is_primary)?.distance ??
    activePlans?.[0]?.distance ??
    null;
  const planWizardTargetSeconds =
    (activePlanId && activePlans?.find(p => p.plan_id === activePlanId)?.plan_target_finish_seconds) ??
    activePlans?.find(p => p.is_primary)?.plan_target_finish_seconds ??
    activePlans?.[0]?.plan_target_finish_seconds ??
    null;

  const asYmd = data.as_of_date?.slice(0, 10) || '';
  const activePlanEntry = activePlanId ? activePlans?.find(p => p.plan_id === activePlanId) : undefined;
  const raceYmdForActivePlan =
    goalLinkedToPlan?.target_date?.slice(0, 10) ||
    (activePlanEntry?.race_date ? String(activePlanEntry.race_date).slice(0, 10) : null);

  const lastCompletedRace = data.last_completed_race ?? null;
  const officialFromCoach =
    lastCompletedRace &&
    ((resolvedGoalId && lastCompletedRace.goal_id === resolvedGoalId) ||
      (pe?.id && lastCompletedRace.goal_id === pe.id) ||
      (goalLinkedToPlan?.id && lastCompletedRace.goal_id === goalLinkedToPlan.id) ||
      (projGid && lastCompletedRace.goal_id === projGid))
      ? {
          actual_seconds: lastCompletedRace.actual_seconds,
          goal_target_seconds: lastCompletedRace.goal_target_seconds,
        }
      : null;
  const baseOfficial = fetchedOfficialResult ?? officialFromCoach;
  const modelFromRr =
    raceReadiness &&
    Number.isFinite(raceReadiness.predicted_finish_time_seconds) &&
    raceReadiness.predicted_finish_time_seconds > 0
      ? {
          seconds: raceReadiness.predicted_finish_time_seconds,
          display: raceReadiness.predicted_finish_display,
        }
      : null;
  const officialForRace = baseOfficial
    ? { ...baseOfficial, modelProjected: modelFromRr }
    : null;
  const lastRaceClosed = lastCompletedRace ? isRaceWeekClosed(lastCompletedRace.target_date) : false;
  const showTopLastRaceCard = Boolean(lastCompletedRace && !officialForRace && !lastRaceClosed);
  const showRecordRaceComplete =
    Boolean(
      wsv.plan.has_active_plan &&
        activePlanId &&
        raceYmdForActivePlan &&
        asYmd >= raceYmdForActivePlan &&
        goalLinkedToPlan &&
        isRunPrimary(goalLinkedToPlan) &&
        String(goalLinkedToPlan.goal_type || 'event') === 'event' &&
        !officialForRace,
    );
  /** Top amber bar would duplicate the in-RACE button after race day (post-race view scrolls that far). */
  const showAmberRecordBar = showRecordRaceComplete && !postRaceUnofficial;

  async function handleStateCourseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !resolvedGoalId) return;
    const uid = getStoredUserId();
    const { data: gRow } = await supabase.from('goals').select('name').eq('id', resolvedGoalId).maybeSingle();
    let planRows: { config?: Record<string, unknown> }[] | null = null;
    if (uid) {
      const { data } = await supabase
        .from('plans')
        .select('config')
        .eq('user_id', uid)
        .eq('goal_id', resolvedGoalId)
        .order('updated_at', { ascending: false })
        .limit(5);
      planRows = data;
    }
    let paceTargetSec =
      raceReadiness?.target_finish_time_seconds != null &&
      Number.isFinite(raceReadiness.target_finish_time_seconds) &&
      raceReadiness.target_finish_time_seconds > 0
        ? raceReadiness.target_finish_time_seconds
        : null;
    if (paceTargetSec == null) {
      for (const p of planRows || []) {
        const t = resolveEventTargetTimeSeconds({}, (p as { config?: Record<string, unknown> }).config ?? null);
        if (t != null) {
          paceTargetSec = t;
          break;
        }
      }
    }
    const coachPredSec =
      raceFinishProjection &&
      raceFinishProjection.goal_id === resolvedGoalId &&
      Number.isFinite(raceFinishProjection.anchor_seconds) &&
      raceFinishProjection.anchor_seconds > 0
        ? raceFinishProjection.anchor_seconds
        : raceReadiness &&
            (raceReadiness.goal.id === resolvedGoalId ||
              String(gRow?.name || '') === String(raceReadiness.goal.name)) &&
            Number.isFinite(raceReadiness.predicted_finish_time_seconds) &&
            raceReadiness.predicted_finish_time_seconds > 0
          ? raceReadiness.predicted_finish_time_seconds
          : null;
    if (paceTargetSec == null && coachPredSec == null) {
      window.alert(
        'No pacing target yet: set a race target on the goal or plan, or refresh State and try again.',
      );
      return;
    }
    setCourseBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', `${String(gRow?.name || raceReadiness?.goal?.name || 'Race')} course`);
      fd.append('goal_id', resolvedGoalId);
      const rd =
        gRow?.target_date != null
          ? String(gRow.target_date).slice(0, 10)
          : raceReadiness?.goal?.target_date != null
            ? String(raceReadiness.goal.target_date).slice(0, 10)
            : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) fd.append('race_date', rd);
      const { data: up, error: upErr } = await invokeFunctionFormData<{ course_id: string }>('course-upload', fd);
      if (upErr || !up?.course_id) {
        window.alert(upErr?.message || 'Upload failed');
        return;
      }
      const { error: stErr } = await invokeFunction('course-strategy', { course_id: up.course_id });
      if (stErr) {
        window.alert(stErr.message || 'Strategy failed');
        return;
      }
      setStateCourseRow({ id: up.course_id, name: `${String(gRow?.name || raceReadiness?.goal?.name || 'Race')} course` });
      setStrategyCourseId(up.course_id);
      setStrategyModalOpen(true);
    } finally {
      setCourseBusy(false);
    }
  }

  // ── WEEK header ──────────────────────────────────────────────────────────
  const weekLabel = week.index != null ? `WK ${week.index}` : 'WEEK';

  // ── BODY row — endurance signals only (strength signals go in STRENGTH row) ─
  const visibleSignals = (rm?.visible_signals ?? []).filter((s) => s.category === 'endurance');

  // ── STRENGTH row — server-computed per_lift from response_model ──────────
  // ⛔ THE CAP MUST NOT RUN BEFORE THE MAIN-LIFT FILTER — that is what hid the Overhead Press.
  //
  // `per_lift` arrives in `Object.entries(learned_fitness.strength_1rms)` order, and the coach
  // builds it for SEVEN lifts (the four, plus hip_thrust / trap_bar_deadlift / barbell_row). With
  // `.slice(0, 5)` applied first, positions 6-7 were cut BEFORE anything asked whether they were
  // main lifts — so an athlete whose press sorted sixth simply lost the row, with 6 logged sessions
  // and a typed baseline both present. Reproduced exactly: seven in, the cap keeps squat /
  // bench_press / deadlift / hip_thrust / trap_bar_deadlift, and the [D-374] filter then strips the
  // two accessories, leaving three rows and no press.
  //
  // ⚠️ IT WAS LATENT BEFORE [D-374] AND THAT IS WHY NOBODY SAW IT. The section used to render all
  // five sliced rows including accessories, so it looked full while the press was already missing.
  // Filtering after the cap didn't create the bug; it made it visible by dropping the row count.
  //
  // `perLift` KEEPS the old shape (sufficient + first 5) because `StateAdjustLens` reads it below
  // and this is not a change to that surface — only the card's own list is re-derived.
  const perLiftSufficient = (rm?.strength?.per_lift ?? []).filter((l: any) => l.sufficient);
  const perLift = perLiftSufficient.slice(0, 5);
  // ⛔ [D-374] "FROM YOUR LOGGED SETS" IS A MAIN-LIFT SECTION. Every row in it reads
  // `Working ~120 vs your 150 baseline` — a comparison against a TESTED 1RM. You test a max on the
  // four barbell lifts; you do not test one on a Hip Thrust. So an accessory can never fill that
  // column, and before [D-373] it fell through to the raw verdict and printed a red "back off
  // weight" instead. D-373 silenced the command; this removes the row that had nothing to say.
  // ⚠️ FILTERED HERE, NOT SERVER-SIDE, ON PURPOSE. `per_lift` is a shared contract — the coach reads
  // it for strength maxes (`coach/index.ts:3557`) and the block model iterates it (`block.ts:322`).
  // Narrowing it at the source would quietly change that reasoning. This is a DISPLAY choice about
  // which rows belong in one section, made with the same shared classifier the server gates on, so
  // the two cannot drift. `perLift` itself is left intact for the adjust lens below.
  // ⛔ Accessories are not being hidden as unimportant — they have no home YET. Per Michael's
  // direction on [Q-251], by-feel work should be read against the athlete's OWN history (reps at a
  // weight, volume over weeks), never against a tested max. That row is unbuilt. See [Q-253].
  // FILTER FIRST, THEN CAP — off the uncapped list, so a main lift can never be cut by an accessory
  // that happened to sort ahead of it. The cap is kept at the same 5 as a display bound; after the
  // filter it has nothing to cut in practice (the previous program has four slots, and only a variant like a
  // trap-bar deadlift adds a fifth main-class row).
  const perLiftMain = perLiftSufficient
    .filter((l: { canonical_name?: string | null }) =>
      capabilitiesForExercise(String(l?.canonical_name ?? '')).coached)
    .slice(0, 5);

  // ── "How your sessions went" — REBUILT (docs/STATE-WEEK-EXECUTION.md). The old per-discipline
  //    execution-row builders (run/ride/strength/swim `efficiency_label` chips) lived here and were
  //    DELETED: steady run/bike rows carried a FITNESS verdict that duplicated PERFORMANCE ("aerobic
  //    base needs work" said twice), and interval/execution % belongs to session detail, not this
  //    section. The section now renders neutral planned-vs-done COUNTS + one composed accent, off
  //    `wsv.week_execution_v1` (server-owned), further down in the JSX. ──

  // ── NEXT row ─────────────────────────────────────────────────────────────
  /**
   * ⛔⛔ TODAY IS NOT ON THIS SCREEN (Michael, 2026-09-01, FIXLIST 2d):
   * *"I dont think we need today reflected on state screen or next — its a broader picture."*
   * Today's session belongs to the day screen; State is the arc around it.
   *
   * ⛔ THE SERVER'S FIELD IS CORRECT AND IS NOT CHANGED. `key_sessions_remaining` is documented as
   * *"from as_of_date (inclusive), excluding completed planned rows"* (`coach/types.ts:221`) and
   * built that way at `coach/index.ts:1200` — today is listed BECAUSE it is not done yet. That is the
   * right answer to the question the coach is asking, and the coach asks it for more than this row:
   * `hasUpcomingLong` (`coach/index.ts:739`) reads the same field to write race-week guidance. Moving
   * the exclusion into that filter would silently change race-week copy for a State-screen ruling.
   * ⚠️ SO THE NARROWING LIVES HERE, ON THE ONE SURFACE IT WAS RULED FOR, and `StateTab` is the only
   * client reader of the field (checked). This is a display scope, not a second definition of
   * "remaining" — nothing here re-decides what is left, it chooses what this screen shows.
   *
   * ⚠️ LOCAL DATE, NOT UTC. `toISOString().slice(0,10)` is tomorrow's date for anyone west of UTC in
   * the evening, which would drop tomorrow's session as well as today's. `formatLocalDate` is the
   * repo's own helper for exactly this.
   *
   * ⚠️ AND THE ROW KEEPS ITS NAME. "NEXT" was only inaccurate because today was in it; with today
   * gone the word is correct, so this closes the rename rather than needing copy.
   */
  const sessionsRemaining = data.week?.key_sessions_remaining ?? [];
  const todayYmd = formatLocalDate(new Date());
  const nextSessions = sessionsRemaining
    .filter((s) => String(s?.date || '').slice(0, 10) > todayYmd)
    .slice(0, 3);

  // ── intent summary + readiness — server-computed ─────────────────────────
  const intentSummary = wsv.week.intent_summary ?? null;
  // 2026-08-11: the week-narrative blurb is retired from the UI (Michael — no value; it narrated the
  // planned-vs-actual bar directly beneath it and could contradict it). The server still computes
  // `coach.narrative` via composeCoachWeekInsight (_shared/insights/coach-week-insights.ts, D-306) — now
  // UNRENDERED / orphaned. Left for the app-wide audit to delete the composer + payload field (a bigger
  // call with its own ripples than a client render cut). This surface is client-only, no deploy.
  const raceWeekGuidance = wsv.coach?.grounded_race_week_guidance_v1;
  const trends = wsv.trends;
  const readinessLabel = trends.readiness_label;
  const readiness = trends.readiness_state;
  const readinessWhy = trends.readiness_why ?? null; // D-232: FATIGUED "Why:" — now NON-RPE factors only
  const readinessSuggestion = trends.readiness_suggestion ?? null; // D-232: loaded-legs one-line suggestion
  const readinessRpeDriver = trends.readiness_rpe_driver ?? null; // BODY-row driver (RPE clause only, Whoop pattern)
  const readinessColor =
    readiness === 'fresh' ? 'text-emerald-400/90' :
    readiness === 'adapting' ? 'text-sky-400/85' :
    readiness === 'overreached' ? 'text-red-400/90' :
    readiness === 'fatigued' ? 'text-amber-400/90' :
    'text-white/60';

  // #4 — deterministic glance headline (load + readiness + fitness, observation never a prescription).
  // The full LLM narrative goes behind an "open for more" expand (collapsed by default).
  // D-260/D-266: the LOAD verdict reads the RECONCILED load_status (the two-key engine, sole verdict
  // authority) — not raw ACWR. ACWR stays the gauge number only. If the server verdict is absent, the
  // headline omits the load slot (no ACWR-word fallback — ACWR never mints a verdict).
  // ⛔ THE HEADLINE READS THE SAME LOAD DECISION AS THE BAR (2026-09-01, Round 3) — one call to the
  // shared `loadRead`, the SAME inputs the LoadBar read uses (weekExecTotals · has_active_plan ·
  // week.intent). The glance headline speaks ONLY on a plain over-CONDITION (kind === 'condition',
  // i.e. high with no plan to compare against); it goes quiet whenever the bar read is quiet — a
  // prescribed-hard week, or high on-plan without added work — so the two surfaces cannot disagree.
  // ⚠️ buildLoadHeadline itself stays plan-blind (it is shared with the server printer, 27-function
  // closure); the gate lives HERE, at the one call site, keyed off the shared decision, not a second
  // copy of the rule. The server-side alignment of the function is filed as a leftover.
  const loadReadForHeadline = loadRead(
    loadStatus?.status,
    week.intent === 'taper' || week.intent === 'peak' || week.intent === 'test',
    wsv.plan.has_active_plan === true,
    weekExecTotals.planned,
    weekExecTotals.done,
  );
  const loadHeadline = loadReadForHeadline?.kind === 'condition'
    ? buildLoadHeadline({
        loadLabel: statusVolumeLabel(loadStatus?.status),
        readinessState: readiness,
        readinessLabel, // D-232: refined chip label wins so the headline can't contradict the chip
        fitnessDirection: (trends as any).fitness_direction,
        isTaperOrPeak: week.intent === 'taper' || week.intent === 'peak',
        acwr: load.acwr, // D-268 Phase 5: "headroom" only when load is genuinely light (server-computed acwr)
      })
    : null;


  // ── Cross-training signal (server-computed) ──────────────────────────────

  const hasUpcomingEvent = Boolean(pe || goalMeta || raceFinishProjection || raceReadiness);
  const isAimless = !wsv.plan.has_active_plan && !hasUpcomingEvent && !officialForRace && !postRaceUnofficial;
  // Arc-grounded empty-state copy authored by coach (response model). Falls back to a minimal
  // generic line only if the server payload is missing the field (e.g. older cache row).
  const serverEmptyState = wsv.empty_state ?? null;
  const aimlessHeadline = serverEmptyState?.headline ?? 'No active plan — training stays general fitness.';
  const aimlessSubtext =
    serverEmptyState?.subtitle ??
    'Mostly easy aerobic work, one harder day, and your usual strength. Without a goal to shape the week, back-to-back hard days add up faster than they help.';
  const aimlessCtaLabel = serverEmptyState?.cta_label ?? 'Set a goal';
  const aimlessCtaAction = serverEmptyState?.cta_action ?? 'create_goal';
  const aimlessCtaTarget = aimlessCtaAction === 'plan_season' ? '/goals' : '/goals';

  // Q-107 H3 nest: the per-lift rows render NESTED under the STRENGTH trend row inside
  // StatePerformanceSection (below), framed "from your logged sets" as provisional detail — so a
  // confident per-lift line can't read as a second, competing "STRENGTH" top-line when the spine
  // trend says needs-data. All state/handlers stay here; only the rendered node is passed down.
  /**
   * ⛔⛔ EVERY OTHER LIFT THE ATHLETE LOGGED — SECONDARIES AND ACCESSORIES (work order item 5).
   *
   * ⛔ THE COMMENT ON `perLiftMain` SAID IT OUTRIGHT: *"Accessories are not being hidden as
   * unimportant — they have no home YET… That row is unbuilt."* This is that home, and it is
   * deliberately **not a new surface**: they hang in the "from your logged sets" section that already
   * exists, under the lifts already there.
   *
   * ⛔⛔ NOT A PICKER, AND THAT IS THE RULING (Michael, 2026-08-28). He asked directly whether this
   * means a dropdown of every accessory. **It does not, and a dropdown is the answer to reject.**
   * Field standard (Strong, Hevy): the summary carries only the main lifts as cards, and every other
   * lift's record lives on that lift itself, seen where it was already the subject. **No list to
   * scroll, no lift selector on the State screen.** These rows appear only because the athlete logged
   * them, inside a section that is folded by default.
   *
   * ⛔ RECORDS AND BEST SETS, NOT A MAX LINE. *"Nobody trends a 1RM here."* An accessory has no tested
   * max to trend against and needs no reference number, so it gets the heaviest set it has ever
   * carried — which is the Hevy solution and is lighter than the gate. ⚠️ So this needs NONE of item
   * 4's "needs a recent max" problem, and works for an athlete with no maxes at all.
   *
   * ⚠️ NO NEW QUERY AND NO SERVER CHANGE. `liftTrends` (`useExerciseLog`, already fetched above for
   * the main lifts) covers EVERY logged canonical with two or more sessions — accessories included,
   * plan or no plan. Trace before building: the data was already on the screen's own hook.
   */
  const mainCanonicals = new Set(perLiftMain.map((l: { canonical_name?: string | null }) => String(l?.canonical_name ?? '')));
  const otherLifts = liftTrends
    .filter((t) => !mainCanonicals.has(t.canonical))
    .map((t) => {
      // ⛔ THE RECORD IS THE HEAVIEST SET, decided on WEIGHT — not on the estimate. An estimate ranks
      // by reps (D-417's whole lesson: a 105 × 35 read as a 225 "max"), and for a lift with no tested
      // max the estimate has nothing honest to stand on anyway.
      const best = t.entries.reduce(
        (b, e) => (Number(e.best_weight) > Number(b?.best_weight ?? 0) ? e : b),
        null as (typeof t.entries)[number] | null,
      );
      return { canonical: t.canonical, displayName: t.displayName, best, sessions: t.entries.length };
    })
    .filter((l) => l.best != null && Number(l.best!.best_weight) > 0)
    // ⚠️ Most-trained first, so the lifts the athlete actually repeats lead. Capped: this is a folded
    // detail list, not an inventory, and an uncapped one would BE the scrollable list just rejected.
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);

  const strengthPerLiftDetail: React.ReactNode = (perLiftMain.length > 0 || otherLifts.length > 0) ? (
    // ⛔ THE GATE STAYS HERE, NOT INSIDE THE COMPONENT (Round 0b, 2026-09-01).
    //    `StatePerformanceSection` tests this value for TRUTHINESS to decide whether to draw a
    //    standalone detail block. An element that renders null is still truthy, so the emptiness
    //    test cannot move inside <StrengthLoggedSets>.
    <StrengthLoggedSets perLiftMain={perLiftMain} otherLifts={otherLifts} liftTrends={liftTrends} />
  ) : null;

  return (
    <div className="pt-1 pb-4">
      {/* State-as-hub lens switcher (D-316): Status = the screen you know; Adjust/Schedule are new. */}
      <StateHubTabs value={stateLens} onChange={setStateLens} />

      {stateLens === 'adjust' && <StateAdjustLens perLift={perLift} />}
      {stateLens === 'schedule' && (
        <div className="px-2 py-10 text-center text-white/40 text-[13px] leading-snug">
          Schedule — rearrange your week: drag a session and everything re-flows around it. Coming next.
        </div>
      )}

      {stateLens === 'status' && (<>
      {/* ── Header ── */}
      <StateHeaderBlock
        weekLabel={weekLabel}
        isAimless={isAimless}
        aimlessHeadline={aimlessHeadline}
        aimlessSubtext={aimlessSubtext}
        aimlessCtaAction={aimlessCtaAction}
        aimlessCtaLabel={aimlessCtaLabel}
        onAimlessCta={() => navigate(aimlessCtaTarget)}
        intentSummary={intentSummary}
        loadHeadline={loadHeadline}
        readinessWhy={readinessWhy}
        readinessSuggestion={readinessSuggestion}
        raceWeekGuidance={raceWeekGuidance}
        coachBusy={coachBusy}
        onRefresh={() => refresh()}
      />

      {/* ── THE STRENGTH READ (2026-08-28) — one card per main lift, HEAVY DAYS ONLY. Its own plate,
          above load and body, because it is a different clock and a different question: load and body
          report the rolling last seven days off the athlete's sessions, this reports whether the bar
          is going up across the block. Renders nothing at all until a lift has a heavy session logged
          in the block (ruled: no placeholder, no dashes) — so it is absent in week 1, which is the two
          tests, by construction.

          ⚠️ IT DOES NOT REPLACE "from your logged sets" BELOW, deliberately. That section is the
          Strong/Hevy set history Michael asked for on 2026-08-11 and it answers a different question
          (what did I lift, when). The same instruction the work order gives for the run row applies
          here: do not delete what exists to make room.
          ⚠️ AND THAT SECTION READS `useExerciseLog` DIRECTLY — a client query, so it is already an
          exception to smart-server/dumb-client. This work did not widen it: every number on these
          cards is server-decided. Not fixed here. */}

      {/* Section clock label: LOAD + BODY are the FAST clock (how the last 7 days feel vs typical).
          Named once here; per-row specifics (WTD pts, RPE receipt) inherit it. */}
      {/* ⛔ THE WEEK'S LIFTING BELONGS TO THE WEEK (2026-08-29). It was sitting on the trends plate
          below, so the screen carried TWO "this week" reads with thirteen weeks of charts wedged
          between them. Hoisted here so the load plate holds one clock: what the last seven days
          were, in every unit the app has for them. */}
      <div className="px-1 mb-1 text-[12px] text-white/50 lowercase">load · rolling last 7 days vs your typical week</div>

      {/* READOUT PLATES (2026-08-15) — State wears the workout Details tab's card language
          (`readoutPlateStyle`, shared from src/lib/readout-plate.ts). The law from the logger
          palette applies: a discipline colour only ever means its discipline. These top sections
          (LOAD / BODY / the week mix) are MULTI-SPORT, so their plate is NEUTRAL — the sport
          colours inside them are data (bars, legend chips), never the card's own chrome. The
          per-discipline plates live in <StatePerformanceSection>, where a card belongs to one
          sport and may wear it. */}
      <div className="galaxy-card readout-texture readout-texture--spectral rounded-2xl divide-y divide-white/[0.055]" style={readoutPlateStyle(undefined, { galaxy: true })}>

        {/* LOAD — full-width gauge + sparkline */}
        <LoadBar
          load={load}
          loadStatus={loadStatus}
          weekIntent={week.intent}
          hasActivePlan={wsv.plan.has_active_plan === true}
          plannedThisWeek={weekExecTotals.planned}
          doneThisWeek={weekExecTotals.done}
        />

        {showTopLastRaceCard && lastCompletedRace && <StateLastRaceCard lastCompletedRace={lastCompletedRace} />}

        {showAmberRecordBar && <StateRaceDayBar />}

        {/* BODY */}
        <StateBodyBlock
          visibleSignals={visibleSignals}
          readinessRpeDriver={readinessRpeDriver}
          onOpenAdjust={() => setStateLens('adjust')}
        />

        {/* READINESS — athlete-reported energy/soreness/sleep (Q-049 Phase 1, D-144).
            Raw + distinct sliders; shown ONLY when a recent check-in exists (no-data
            on absent, per Q3). Neutral tone — Phase 1 is visible-only, no good/bad
            judgement encoded. Trend arrow per signal (newest vs oldest in window)
            when ≥3 check-ins. */}
        {checkinReadiness?.latest && <StateReadinessRow checkinReadiness={checkinReadiness} />}

        {/* "How your sessions went · last 7 days" — REBUILT (docs/STATE-WEEK-EXECUTION.md). Neutral
            per-discipline planned-vs-done COUNTS + at most ONE composed accent. No fitness verdicts here
            (that is PERFORMANCE, below); interval/execution % lives in session detail. Server owns the
            accent; this renders it (Law 4). Three states: counts+accent / counts-only / nothing. */}
        <StateWeekExecution wsv={wsv} week={week} />

        {/* ⛔ THE WEEKLY LIFTING CARD MOVED TO THE STRENGTH PLATE (Round 3 pass 1, 2026-09-01) — one
            owner per sport. It was here in the LOAD section (moved from the trends plate 2026-08-29);
            it now renders under the strength cards in <StatePerformanceSection>, its natural owner.
            ⚠️ History, so the move is traceable: this block held "what the week bought each muscle" in
            Viada's own units — a WEEK's fact, not a trend — and read as an orphan under the charts,
            which is why it was pulled out of trends; consolidating strength gives it a home. */}

      </div>

      <div className="px-1 mb-1 mt-3 text-[12px] text-white/50 lowercase">trends · the arc behind this week</div>

      {/* ⛔ ORDER: WHAT IS TRUE NOW, THEN WHAT IS TRENDING (2026-08-29, Michael: *"shouldn't
          ACWR be at the top?"*). It is the field's order and it was inverted here: TrainingPeaks
          opens on fitness / fatigue / form, Intervals.icu the same, Whoop on today's recovery.
          This screen opened on a 13-week efficiency chart — a trend — on a screen called State.
          The load plate above is the NOW; everything below it is the arc behind it. */}
      {/* ⛔ THE RUN CARDS MOVED TO THE RUN PLATE (Round 3 pass 2, 2026-09-01) — one owner per sport.
          <StateTrendsBlock> held the run efficiency cards and nothing else after pass 1 moved the
          rides to bike; run now renders on its own plate inside <StatePerformanceSection> below, so
          this block is retired from the screen. The "trends · the arc behind this week" heading above
          still introduces the Fitness section that follows. */}

      {/* PERFORMANCE — STATE v2 per-discipline trend (perf where data exists, adherence fallback). Under review; not yet shipped. */}
      {/* ⛔ `block` is the block-identity card the coach payload has carried since v150 — protocol,
          goal, week-in-cycle, deload, the plain phase word. The fitness rows below RENDER it; they
          do not re-derive any of it (Law 4). `planWeek` is the server's already-gated week number
          (null before a plan starts and after it ends), so the two always agree.
          Sits OUTSIDE the neutral plates: its rows are per-discipline, and each wears its own
          sport-keyed plate inside the section. */}
      <StatePerformanceSection strengthDetail={strengthPerLiftDetail} stateDisplay={wsv.trends?.display} primaryDiscipline={(wsv.plan as any)?.primary_discipline ?? null} planWeek={week.index ?? null} block={planRoot?.block ?? null} strengthFatigue={strengthFatigue} hasActivePlan={wsv.plan.has_active_plan === true} asOf={data.as_of_date ?? null} />

      <div className="mt-2 galaxy-card readout-texture readout-texture--spectral rounded-2xl divide-y divide-white/[0.055]" style={readoutPlateStyle(undefined, { galaxy: true })}>

        {/* SWIM re-test nudge (D-200) — fires after ≥4 weeks + ≥4 honored swims; auto-clears when the
            threshold is updated/tested (lastUpdatedAt moves). Dismiss = 7-day snooze (shared pattern). */}
        {swimNudge?.show && nudgeDismissNonce >= 0 && !isNudgeSnoozed('swim_retest') && (
          <StateSwimNudge
            weeksSince={swimNudge.weeksSince}
            onDismiss={() => setNudgeDismissNonce((n) => n + 1)}
          />
        )}

        {/* SIGNAL — longitudinal nudge, only when there's an actionable signal */}
        {showNudge && (
          <StateSignalBlock
            severity={nudgeDecision.severity}
            headline={nudgeDecision.headline}
            nudgeKind={nudgeDecision.nudge_kind!}
            onDismiss={() => setNudgeDismissNonce((n) => n + 1)}
            onReviewWithArc={() => navigate('/arc-setup', { state: { arcNudgeSeed: nudgeDecision.headline } })}
          />
        )}

        {/* STRENGTH per-lift detail moved (Q-107 H3) — now nested under the STRENGTH trend row inside
            <StatePerformanceSection> above (passed as strengthDetail). No second "STRENGTH" header. */}

        {/* RACE — visible during the build and through race week; disappears 7 days after the race. */}
        <StateRaceBlock
          raceFinishProjection={raceFinishProjection}
          officialForRace={officialForRace}
          postRaceUnofficial={postRaceUnofficial}
          raceYmdForActivePlan={raceYmdForActivePlan}
          raceReadiness={raceReadiness}
          goalMeta={goalMeta}
          blockVerdict={data?.goal_prediction?.block_verdict ?? null}
          divergence={
            (data?.fitness_verdict_divergence ?? []).find(
              (d) => d.goal_id === raceReadiness?.goal?.id || d.goal_name === raceReadiness?.goal?.name,
            ) ?? null
          }
          planWizardDistance={planWizardDistance}
          planWizardTargetSeconds={planWizardTargetSeconds ?? null}
          primaryRaceReadiness={primaryRaceReadiness}
          resolvedGoalId={resolvedGoalId}
          courseRow={stateCourseRow}
          courseBusy={courseBusy}
          onAddCourse={() => stateCourseFileRef.current?.click()}
          onViewStrategy={() => {
            if (stateCourseRow?.id) {
              setStrategyCourseId(stateCourseRow.id);
              setStrategyModalOpen(true);
            }
          }}
          onOpenKeyRun={
            onSelectWorkout
              ? (workoutId) => {
                  onClose?.();
                  onSelectWorkout({ id: workoutId, workout_status: 'completed', type: 'run' });
                }
              : undefined
          }
        />

        {/* NEXT — ⛔ PLAN-DEPENDENT (2026-09-01). "What's next" is a prescription; with no active plan
            there is nothing to render, and the block's "week complete" empty-chip would read wrong.
            Gate on `has_active_plan` so it disappears cleanly (absent, not an empty header). */}
        {wsv.plan.has_active_plan === true && <StateNextBlock nextSessions={nextSessions} />}
      </div>

      {/* ⛔ THE ORPHAN "STANDARD FOCUS" PLAN-NAME LABEL IS REMOVED (2026-09-01, cosmetic) — it sat
          alone at the bottom of the scroll with nothing around it. The plan is identified where it is
          acted on (the plan/adjust surfaces), not as a trailing label here. */}

      <input
        ref={stateCourseFileRef}
        type="file"
        accept=".gpx,application/gpx+xml,.xml"
        className="hidden"
        onChange={handleStateCourseFile}
      />
      <CourseStrategyModal
        open={strategyModalOpen}
        courseId={strategyCourseId}
        onClose={() => {
          setStrategyModalOpen(false);
          setStrategyCourseId(null);
        }}
      />
      </>)}
    </div>
  );
}
