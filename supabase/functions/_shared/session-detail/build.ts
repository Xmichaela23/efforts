// =============================================================================
// SESSION_DETAIL_V1 — Build from snapshot slice + workout_analysis
// =============================================================================

import type { SessionDetailV1 } from './types.ts';
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
  observations: string[];
  workoutAnalysis: Record<string, unknown> | null;
  narrativeText: string | null;
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
    observations,
    workoutAnalysis,
    narrativeText,
  } = input;

  const type = normType(workoutType) as SessionDetailV1['type'];
  const wa = workoutAnalysis || {};
  const perf = (wa as any).performance || {};
  const sessionState = (wa as any).session_state_v1 || {};
  const factPacket = (wa as any).fact_packet_v1 || (sessionState?.details as any)?.fact_packet_v1;
  const granular = (wa as any).granular_analysis || {};
  const detailed = (wa as any).detailed_analysis || {};
  const ib = detailed?.interval_breakdown || granular?.interval_breakdown;

  const executionScore =
    Number(actualSession?.execution_score) ??
    (Number.isFinite(perf?.execution_adherence) ? perf.execution_adherence : null) ??
    (Number.isFinite(sessionState?.glance?.execution_score) ? sessionState.glance.execution_score : null);

  const paceAdherence = Number.isFinite(perf?.pace_adherence) ? perf.pace_adherence : null;
  const powerAdherence = Number.isFinite(perf?.power_adherence) ? perf.power_adherence : null;
  const durationAdherence = Number.isFinite(perf?.duration_adherence) ? perf.duration_adherence : null;

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
    },

    observations,
    narrative_text: narrativeText,

    intervals,

    display: {
      show_adherence_chips: showAdherenceChips,
      interval_display_reason: intervalDisplayReason,
      has_measured_execution: hasMeasuredExecution,
    },
  };
}
