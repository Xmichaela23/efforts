// =============================================================================
// SESSION_DETAIL_V1 — Build from snapshot slice + workout_analysis
// =============================================================================

import type { SessionDetailV1, SessionInterpretation, DeviationDimension, DeviationDirection } from './types.ts';
import type { LedgerDay, ActualSession, PlannedSession, SessionMatch } from '../athlete-snapshot/types.ts';

function normType(t: string | null | undefined): string {
  const s = String(t || '').toLowerCase().trim();
  if (s.startsWith('run') || s === 'running') return 'run';
  if (s.startsWith('ride') || s.startsWith('cycling') || s.startsWith('bike')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training' || s === 'weights') return 'strength';
  if (s.startsWith('yoga') || s.startsWith('pilates') || s.startsWith('mobility')) return 'mobility';
  return s || 'other';
}

export type SessionDetailInput = {
  workoutId: string;
  workoutDate: string;
  workoutType: string;
  workoutName: string | null;
  ledgerDay: LedgerDay | null;
  actualSession: ActualSession | null;
  match: SessionMatch | null;
  plannedSession: PlannedSession | null;
  /** Raw planned_workouts row with strength_exercises (for strength weight deviation) */
  plannedRowRaw?: { strength_exercises?: any[] } | null;
  /** Completed workout strength_exercises (for strength weight deviation) */
  completedStrengthExercises?: any[] | null;
  observations: string[];
  workoutAnalysis: Record<string, unknown> | null;
  narrativeText: string | null;
  /** Optional: from body_response.load_status for weekly_impact */
  loadStatus?: { status: 'on_target' | 'high' | 'elevated' | 'under'; interpretation?: string } | null;
};

export function buildSessionDetailV1(input: SessionDetailInput): SessionDetailV1 {
  const {
    workoutId,
    workoutDate,
    workoutType,
    workoutName,
    ledgerDay,
    actualSession,
    match,
    plannedSession,
    plannedRowRaw,
    completedStrengthExercises,
    observations,
    workoutAnalysis,
    narrativeText,
    loadStatus,
  } = input;

  const type = normType(workoutType) as SessionDetailV1['type'];
  const wa = workoutAnalysis || {};
  const perf = (wa as any).performance || {};
  const sessionState = (wa as any).session_state_v1 || {};
  const factPacket = (wa as any).fact_packet_v1 || (sessionState?.details as any)?.fact_packet_v1;
  const granular = (wa as any).granular_analysis || {};
  const detailed = (wa as any).detailed_analysis || {};
  const ib = detailed?.interval_breakdown || granular?.interval_breakdown;

  const paceAdherence = Number.isFinite(perf?.pace_adherence) ? perf.pace_adherence : null;
  const powerAdherence = Number.isFinite(perf?.power_adherence) ? perf.power_adherence : null;
  const durationAdherence = Number.isFinite(perf?.duration_adherence) ? perf.duration_adherence : null;

  // Execution: ledger may still carry 0 from legacy rows while performance.* is correct — never let 0 block better sources.
  let executionScore: number | null = null;
  if (actualSession?.execution_score != null && Number.isFinite(Number(actualSession.execution_score))) {
    executionScore = Number(actualSession.execution_score);
  }
  if (executionScore === null && Number.isFinite(perf?.execution_adherence)) {
    executionScore = perf.execution_adherence;
  }
  if (executionScore === null && Number.isFinite(sessionState?.glance?.execution_score)) {
    executionScore = sessionState.glance.execution_score;
  }
  if (executionScore === 0) {
    const fromPerf = Number.isFinite(perf?.execution_adherence) ? perf.execution_adherence : null;
    if (fromPerf != null && fromPerf > 0) {
      executionScore = fromPerf;
    } else {
      const parts: number[] = [];
      if (paceAdherence != null && paceAdherence > 0) parts.push(paceAdherence);
      if (powerAdherence != null && powerAdherence > 0) parts.push(powerAdherence);
      if (durationAdherence != null && durationAdherence > 0) parts.push(durationAdherence);
      if (parts.length > 0) {
        executionScore = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
      }
    }
  }

  const assessedAgainst = factPacket?.derived?.execution?.assessed_against ?? null;
  const hasPlanned = !!plannedSession && !!match?.planned_id;
  const planModified = assessedAgainst === 'actual';
  const allZero =
    (executionScore ?? 0) === 0 &&
    (paceAdherence ?? 0) === 0 &&
    (powerAdherence ?? 0) === 0 &&
    (durationAdherence ?? 0) === 0;

  const showAdherenceChips =
    hasPlanned &&
    !planModified &&
    !allZero &&
    (executionScore != null || paceAdherence != null || powerAdherence != null || durationAdherence != null);

  const intervalDisplay = sessionState?.details?.interval_display || {};
  const intervalDisplayReason = intervalDisplay?.reason ?? null;
  const hasMeasuredExecution =
    executionScore != null || paceAdherence != null || powerAdherence != null || durationAdherence != null;

  const weightDev = computeStrengthWeightDeviation(type, plannedRowRaw, completedStrengthExercises);
  const volumeDev = computeStrengthVolumeDeviation(type, plannedRowRaw, completedStrengthExercises);

  const intervals: SessionDetailV1['intervals'] = [];
  if (ib?.available && Array.isArray(ib.intervals)) {
    for (const iv of ib.intervals) {
      const lower = iv.planned_pace_range_lower ?? iv.planned_pace_range?.lower;
      const upper = iv.planned_pace_range_upper ?? iv.planned_pace_range?.upper;
      intervals.push({
        id: String(iv?.interval_id || iv?.interval_number || intervals.length),
        interval_type: (iv?.interval_type || iv?.kind || 'work') as SessionDetailV1['intervals'][0]['interval_type'],
        interval_number: typeof iv?.interval_number === 'number' ? iv.interval_number : undefined,
        recovery_number: typeof iv?.recovery_number === 'number' ? iv.recovery_number : undefined,
        planned_label: iv?.planned_label ?? String(iv?.interval_type || ''),
        planned_duration_s: Number.isFinite(iv?.planned_duration_s) ? iv.planned_duration_s : null,
        planned_pace_range:
          Number.isFinite(lower) && Number.isFinite(upper)
            ? { lower_sec_per_mi: Number(lower), upper_sec_per_mi: Number(upper) }
            : undefined,
        executed: {
          duration_s: Number.isFinite(iv?.actual_duration_s) ? iv.actual_duration_s : null,
          distance_m: Number.isFinite(iv?.actual_distance_m) ? iv.actual_distance_m : null,
          avg_hr: Number.isFinite(iv?.avg_heart_rate_bpm) ? iv.avg_heart_rate_bpm : null,
          actual_pace_sec_per_mi: Number.isFinite(iv?.actual_pace_min_per_mi)
            ? Math.round(iv.actual_pace_min_per_mi * 60)
            : null,
        },
        pace_adherence_pct: Number.isFinite(iv?.pace_adherence_percent) ? iv.pace_adherence_percent : null,
        duration_adherence_pct: Number.isFinite(iv?.duration_adherence_percent) ? iv.duration_adherence_percent : null,
      });
    }
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    workout_id: workoutId,
    date: workoutDate,
    type,
    name: workoutName || workoutType || 'Workout',

    plan_context: {
      planned_id: match?.planned_id ?? null,
      planned: plannedSession
        ? {
            planned_id: plannedSession.planned_id,
            type: plannedSession.type,
            name: plannedSession.name,
            prescription: plannedSession.prescription,
            duration_seconds: plannedSession.duration_seconds,
            distance_meters: plannedSession.distance_meters,
            load_planned: plannedSession.load_planned,
            strength_prescription: plannedSession.strength_prescription,
          }
        : null,
      match: match
        ? {
            endurance_quality: match.endurance_quality as SessionDetailV1['plan_context']['match']['endurance_quality'],
            strength_quality: match.strength_quality as SessionDetailV1['plan_context']['match']['strength_quality'],
            summary: match.summary,
          }
        : null,
    },

    execution: {
      execution_score: executionScore != null ? Math.round(executionScore) : null,
      pace_adherence: paceAdherence != null ? Math.round(paceAdherence) : null,
      power_adherence: powerAdherence != null ? Math.round(powerAdherence) : null,
      duration_adherence: durationAdherence != null ? Math.round(durationAdherence) : null,
      performance_assessment: granular?.performance_assessment ?? null,
      assessed_against: assessedAgainst,
      status_label: sessionState?.glance?.status_label ?? null,
      gap_adjusted: !!perf?.gap_adjusted,
    },

    observations,
    narrative_text: narrativeText,

    intervals,

    display: {
      show_adherence_chips: showAdherenceChips,
      interval_display_reason: intervalDisplayReason,
      has_measured_execution: hasMeasuredExecution,
    },

    strength_weight_deviation: weightDev,
    strength_volume_deviation: volumeDev,
    session_interpretation: buildSessionInterpretation({
      type,
      match,
      plannedSession,
      executionScore,
      paceAdherence,
      powerAdherence,
      durationAdherence,
      weightDeviation: weightDev,
      volumeDeviation: volumeDev,
      loadStatus,
      planContextSummary: match?.summary ?? null,
      intervals,
    }),
  };
}

/** Lowest pace_adherence_pct among work intervals (when present). */
function minWorkIntervalPacePct(intervals: SessionDetailV1['intervals']): number | null {
  let min: number | null = null;
  for (const iv of intervals) {
    if (iv.interval_type !== 'work') continue;
    const p = iv.pace_adherence_pct;
    if (typeof p === 'number' && Number.isFinite(p)) {
      min = min == null ? p : Math.min(min, p);
    }
  }
  return min;
}

function buildSessionInterpretation(params: {
  type: string;
  match: SessionMatch | null;
  plannedSession: PlannedSession | null;
  executionScore: number | null;
  paceAdherence: number | null;
  powerAdherence: number | null;
  durationAdherence: number | null;
  weightDeviation: SessionDetailV1['strength_weight_deviation'];
  volumeDeviation: SessionDetailV1['strength_volume_deviation'];
  loadStatus?: { status: string; interpretation?: string } | null;
  planContextSummary: string | null;
  intervals: SessionDetailV1['intervals'];
}): SessionInterpretation {
  const {
    type,
    match,
    plannedSession,
    executionScore,
    paceAdherence,
    powerAdherence,
    durationAdherence,
    weightDeviation,
    volumeDeviation,
    loadStatus,
    planContextSummary,
    intervals,
  } = params;

  const deviations: Array<{ dimension: DeviationDimension; direction: DeviationDirection; detail: string }> = [];
  let overall: 'followed' | 'modified' | 'deviated' = 'followed';

  // Strength: weight and volume deviations
  if (type === 'strength' || type === 'mobility') {
    if (weightDeviation?.direction === 'heavier') {
      deviations.push({ dimension: 'weight', direction: 'over', detail: 'Went heavier than planned' });
      overall = 'deviated';
    } else if (weightDeviation?.direction === 'lighter') {
      deviations.push({ dimension: 'weight', direction: 'under', detail: 'Went lighter than planned' });
      overall = 'deviated';
    } else if (weightDeviation?.direction === 'on_target' && (weightDeviation as any)?.message?.includes('heavier') && (weightDeviation as any)?.message?.includes('lighter')) {
      deviations.push({ dimension: 'weight', direction: 'matched', detail: 'Some heavier, some lighter' });
      overall = 'modified';
    }
    if (volumeDeviation?.direction === 'over') {
      const m = volumeDeviation.message.match(/\(([^)]+)\)/);
      const detail = m ? m[1] : 'More sets/reps than planned';
      deviations.push({ dimension: 'volume', direction: 'over', detail });
      overall = 'deviated';
    } else if (volumeDeviation?.direction === 'under') {
      const m = volumeDeviation.message.match(/\(([^)]+)\)/);
      const detail = m ? m[1] : 'Fewer sets/reps than planned';
      deviations.push({ dimension: 'volume', direction: 'under', detail });
      overall = 'deviated';
    }
  }

  // Endurance: pace, duration
  if (type === 'run' || type === 'ride' || type === 'swim') {
    const hasPace = paceAdherence != null || powerAdherence != null;
    const hasDuration = durationAdherence != null;
    const worstWorkPace = minWorkIntervalPacePct(intervals);
    if (hasPace) {
      const pct = paceAdherence ?? powerAdherence ?? 0;
      if (worstWorkPace != null && worstWorkPace < 88) {
        deviations.push({
          dimension: 'pace',
          direction: 'under',
          detail: `Weakest work interval ~${Math.round(worstWorkPace)}% vs prescribed pace (headline pace % is duration-weighted across intervals)`,
        });
        overall = overall === 'followed' ? 'modified' : overall;
      } else if (pct > 105) {
        deviations.push({ dimension: 'pace', direction: 'over', detail: `Pace/power ${Math.round(pct)}% of plan` });
        overall = overall === 'followed' ? 'modified' : overall;
      } else if (pct < 95 && pct > 0) {
        deviations.push({ dimension: 'pace', direction: 'under', detail: `Pace/power ${Math.round(pct)}% of plan` });
        overall = overall === 'followed' ? 'modified' : overall;
      } else if (pct >= 95 && pct <= 105) {
        deviations.push({ dimension: 'pace', direction: 'matched', detail: 'Pace on target (blended across intervals)' });
      }
    }
    if (hasDuration) {
      const pct = durationAdherence ?? 0;
      if (pct > 105) deviations.push({ dimension: 'duration', direction: 'over', detail: `Duration ${Math.round(pct)}% of plan` });
      else if (pct < 95 && pct > 0) deviations.push({ dimension: 'duration', direction: 'under', detail: `Duration ${Math.round(pct)}% of plan` });
      else if (pct >= 95 && pct <= 105) deviations.push({ dimension: 'duration', direction: 'matched', detail: 'Duration on target' });
      if (pct > 105 || (pct < 95 && pct > 0)) overall = overall === 'followed' ? 'modified' : overall;
    }
  }

  // Match quality override
  const eq = match?.endurance_quality;
  const sq = match?.strength_quality;
  if (eq === 'harder' || eq === 'easier' || eq === 'longer' || eq === 'shorter' || sq === 'pushed_hard' || sq === 'dialed_back') {
    overall = 'modified';
  }
  if (eq === 'modified' || eq === 'skipped' || sq === 'modified' || sq === 'skipped') {
    overall = 'deviated';
  }

  const namePrefix = plannedSession?.name ? `${plannedSession.name}. ` : '';
  const intendedStimulus =
    namePrefix + (plannedSession?.prescription ?? planContextSummary ?? 'Complete the planned session');

  let actualStimulus: string;
  let alignment: 'on_target' | 'partial' | 'missed' | 'exceeded' = 'on_target';

  if (type === 'run' || type === 'ride' || type === 'swim') {
    const parts: string[] = [];
    if (executionScore != null) parts.push(`execution ${Math.round(executionScore)}%`);
    if (durationAdherence != null) parts.push(`duration ${Math.round(durationAdherence)}%`);
    if (paceAdherence != null) parts.push(`pace ${Math.round(paceAdherence)}%`);
    else if (powerAdherence != null) parts.push(`power ${Math.round(powerAdherence)}%`);

    const metrics: number[] = [];
    if (executionScore != null) metrics.push(executionScore);
    if (paceAdherence != null) metrics.push(paceAdherence);
    if (powerAdherence != null) metrics.push(powerAdherence);
    if (durationAdherence != null) metrics.push(durationAdherence);

    const minPct = metrics.length ? Math.min(...metrics) : null;
    const maxPct = metrics.length ? Math.max(...metrics) : null;
    const spread = minPct != null && maxPct != null ? maxPct - minPct : 0;

    if (parts.length > 0) {
      actualStimulus = `Versus plan: ${parts.join(', ')}.`;
      if (spread >= 12) {
        actualStimulus += ' Scores diverge — treat the lowest % as the limiting factor, not the highest.';
      }
      const wiv = minWorkIntervalPacePct(intervals);
      if (wiv != null && wiv < 88) {
        actualStimulus +=
          ` One work rep was only ~${Math.round(wiv)}% vs its pace window; the headline pace chip blends all intervals.`;
      }
    } else {
      actualStimulus = planContextSummary ?? 'Session completed';
    }

    if (minPct != null) {
      if (minPct >= 105) {
        alignment = 'exceeded';
      } else if (minPct >= 92) {
        alignment = 'on_target';
      } else if (minPct >= 78) {
        alignment = 'partial';
      } else {
        alignment = 'missed';
      }
    }
  } else {
    const execPct = executionScore ?? paceAdherence ?? powerAdherence ?? durationAdherence;
    if (execPct != null) {
      if (execPct >= 95) {
        actualStimulus = `Executed at ${Math.round(execPct)}% of plan`;
        alignment = execPct >= 105 ? 'exceeded' : 'on_target';
      } else if (execPct >= 80) {
        actualStimulus = `Executed at ${Math.round(execPct)}% of plan`;
        alignment = 'partial';
      } else {
        actualStimulus = `Executed at ${Math.round(execPct)}% of plan`;
        alignment = 'missed';
      }
    } else {
      actualStimulus = planContextSummary ?? 'Session completed';
    }
  }

  const loadStatusMap = loadStatus?.status === 'high' || loadStatus?.status === 'elevated' ? 'over' as const
    : loadStatus?.status === 'under' ? 'under' as const
    : 'on_track' as const;
  const weeklyNote = loadStatus?.interpretation ?? '';

  return {
    plan_adherence: { overall, deviations },
    training_effect: {
      intended_stimulus: intendedStimulus,
      actual_stimulus: actualStimulus,
      alignment,
    },
    weekly_impact: {
      load_status: loadStatusMap,
      note: weeklyNote,
    },
  };
}

function normExName(s: string): string {
  return String(s || '').toLowerCase().trim();
}

function matchPlannedToCompleted(plannedExs: any[], compEx: any): any | null {
  return plannedExs.find(
    (p: any) => normExName(p?.name) === normExName(compEx?.name),
  ) ?? null;
}

function computeStrengthWeightDeviation(
  type: string,
  plannedRowRaw: { strength_exercises?: any[] } | null | undefined,
  completedStrengthExercises: any[] | null | undefined,
): SessionDetailV1['strength_weight_deviation'] {
  if (type !== 'strength' && type !== 'mobility') return null;
  const plannedExs = Array.isArray(plannedRowRaw?.strength_exercises) ? plannedRowRaw.strength_exercises : [];
  const compExs = Array.isArray(completedStrengthExercises) ? completedStrengthExercises : [];
  if (plannedExs.length === 0 || compExs.length === 0) return null;

  let anyHeavier = false;
  let anyLighter = false;
  for (const compEx of compExs) {
    const plannedEx = matchPlannedToCompleted(plannedExs, compEx);
    if (!plannedEx) continue;
    const plannedW = Number(plannedEx.weight) || (Array.isArray(plannedEx.sets)?.[0] ? Number(plannedEx.sets[0]?.weight) || 0 : 0);
    if (plannedW <= 0) continue;
    const sets = Array.isArray(compEx?.sets) ? compEx.sets : [];
    const bestActual = Math.max(0, ...sets.map((s: any) => Number(s?.weight) || 0));
    if (bestActual <= 0) continue;
    if (bestActual > plannedW * 1.05) anyHeavier = true;
    else if (bestActual < plannedW * 0.95) anyLighter = true;
  }

  if (anyHeavier && !anyLighter) {
    return {
      direction: 'heavier',
      message: 'You went heavier than planned — intentional?',
      show_prompt: true,
    };
  }
  if (anyLighter && !anyHeavier) {
    return {
      direction: 'lighter',
      message: 'You went lighter than planned — intentional?',
      show_prompt: true,
    };
  }
  if (anyHeavier && anyLighter) {
    return {
      direction: 'on_target',
      message: 'Some exercises heavier, some lighter than planned.',
      show_prompt: false,
    };
  }
  return null;
}

function getPlannedSetsAndReps(plannedEx: any): { sets: number; totalReps: number } {
  const sets = typeof plannedEx?.sets === 'number' ? plannedEx.sets : (Array.isArray(plannedEx?.sets) ? plannedEx.sets.length : 0);
  const repsPerSet = typeof plannedEx?.reps === 'number' ? plannedEx.reps : (parseInt(String(plannedEx?.reps || '0'), 10) || 0);
  return { sets, totalReps: sets * repsPerSet };
}

function getActualSetsAndReps(compEx: any): { sets: number; totalReps: number } {
  const setsArr = Array.isArray(compEx?.sets) ? compEx.sets : [];
  const totalReps = setsArr.reduce((sum, s) => sum + (Number(s?.reps) || 0), 0);
  return { sets: setsArr.length, totalReps };
}

function computeStrengthVolumeDeviation(
  type: string,
  plannedRowRaw: { strength_exercises?: any[] } | null | undefined,
  completedStrengthExercises: any[] | null | undefined,
): SessionDetailV1['strength_volume_deviation'] {
  if (type !== 'strength' && type !== 'mobility') return null;
  const plannedExs = Array.isArray(plannedRowRaw?.strength_exercises) ? plannedRowRaw.strength_exercises : [];
  const compExs = Array.isArray(completedStrengthExercises) ? completedStrengthExercises : [];
  if (plannedExs.length === 0 || compExs.length === 0) return null;

  const overDetails: string[] = [];
  const underDetails: string[] = [];
  for (const compEx of compExs) {
    const plannedEx = matchPlannedToCompleted(plannedExs, compEx);
    if (!plannedEx) continue;
    const planned = getPlannedSetsAndReps(plannedEx);
    const actual = getActualSetsAndReps(compEx);
    const name = String(compEx?.name || plannedEx?.name || 'exercise').trim();
    if (planned.sets === 0 && planned.totalReps === 0) continue;

    if (actual.sets > planned.sets || (planned.totalReps > 0 && actual.totalReps > planned.totalReps)) {
      const parts: string[] = [];
      if (actual.sets > planned.sets) parts.push(`${actual.sets} sets instead of ${planned.sets}`);
      if (planned.totalReps > 0 && actual.totalReps > planned.totalReps) parts.push(`${actual.totalReps} reps instead of ${planned.totalReps}`);
      overDetails.push(parts.length ? `${parts.join(', ')} on ${name}` : name);
    } else if (actual.sets < planned.sets || (planned.totalReps > 0 && actual.totalReps < planned.totalReps * 0.9)) {
      const parts: string[] = [];
      if (actual.sets < planned.sets) parts.push(`${actual.sets} sets instead of ${planned.sets}`);
      if (actual.totalReps < planned.totalReps && planned.totalReps > 0) parts.push(`${actual.totalReps} reps instead of ${planned.totalReps}`);
      underDetails.push(parts.length ? `${parts.join(', ')} on ${name}` : name);
    }
  }

  if (overDetails.length > 0 && underDetails.length === 0) {
    const detail = overDetails.length === 1 ? overDetails[0] : `${overDetails.length} exercises over plan`;
    return {
      direction: 'over',
      message: `You did more volume than planned${detail ? ` (${detail})` : ''} — intentional?`,
      show_prompt: true,
    };
  }
  if (underDetails.length > 0 && overDetails.length === 0) {
    const detail = underDetails.length === 1 ? underDetails[0] : `${underDetails.length} exercises under plan`;
    return {
      direction: 'under',
      message: `You did less volume than planned${detail ? ` (${detail})` : ''} — intentional?`,
      show_prompt: true,
    };
  }
  if (overDetails.length > 0 && underDetails.length > 0) {
    return {
      direction: 'on_target',
      message: 'Some exercises over plan, some under.',
      show_prompt: false,
    };
  }
  return null;
}
