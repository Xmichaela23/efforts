import React from 'react';
import {
  type SessionInterpretationV1,
} from '@/utils/performance-format';

interface AdherenceChipsProps {
  sessionDetail: {
    workout_id?: string;
    type?: string;
    execution?: {
      execution_score?: number | null;
      pace_adherence?: number | null;
      power_adherence?: number | null;
      duration_adherence?: number | null;
      performance_assessment?: string | null;
      assessed_against?: string | null;
      status_label?: string | null;
      gap_adjusted?: boolean;
    };
    display?: { show_adherence_chips?: boolean };
    plan_context?: { week_label?: string | null };
    completed_totals?: {
      duration_s?: number | null;
      distance_m?: number | null;
      avg_pace_s_per_mi?: number | null;
      swim_pace_per_100_s?: number | null;
    };
    planned_totals?: {
      duration_s?: number | null;
      distance_m?: number | null;
      avg_pace_s_per_mi?: number | null;
      swim_pace_per_100_s?: number | null;
      swim_unit?: 'yd' | 'm' | null;
    };
    classification?: {
      is_structured_interval?: boolean;
      is_pool_swim?: boolean;
      is_easy_like?: boolean;
    };
    session_interpretation?: SessionInterpretationV1;
  } | null;
  hasSessionDetail: boolean;
  noPlannedCompare: boolean;
  hideTopAdherence?: boolean;
  onNavigateToContext?: (workoutId: string) => void;
}

export default function AdherenceChips({
  sessionDetail: sd,
  hasSessionDetail,
  noPlannedCompare,
  hideTopAdherence,
  onNavigateToContext,
}: AdherenceChipsProps) {
  try {
    if (!hasSessionDetail || !sd) return null;
    if (noPlannedCompare) return null;
    if (sd.display?.show_adherence_chips === false) return null;
    if (hideTopAdherence) return null;

    const ex = sd.execution;
    if (sd.execution?.assessed_against === 'actual') return null;

    const executionScore = ex?.execution_score ?? null;
    const paceAdherence = ex?.pace_adherence ?? null;
    const powerAdherence = ex?.power_adherence ?? null;
    const durationAdherence = ex?.duration_adherence ?? null;
    const isGapAdjusted = !!ex?.gap_adjusted;
    const performanceAssessment = ex?.performance_assessment ?? null;
    const isStructured = !!sd.classification?.is_structured_interval;

    const allZero = (executionScore ?? 0) === 0 && (paceAdherence ?? 0) === 0 &&
      (powerAdherence ?? 0) === 0 && (durationAdherence ?? 0) === 0;
    if (allZero) return null;
    const anyVal = executionScore != null || paceAdherence != null ||
      powerAdherence != null || durationAdherence != null;
    if (!anyVal) return null;

    const weekLabel = sd.plan_context?.week_label ?? null;
    const workoutId = sd.workout_id;
    const sportType = String(sd.type || '').toLowerCase();
    const isRide = /ride|bike|cycling/i.test(sportType);
    const isSwim = /swim/i.test(sportType);
    const isPoolSwim = !!sd.classification?.is_pool_swim;

    const completedDurS = sd.completed_totals?.duration_s ?? null;
    const plannedDurS = sd.planned_totals?.duration_s ?? null;
    const durationDelta = (completedDurS != null && plannedDurS != null && plannedDurS > 0)
      ? completedDurS - plannedDurS : null;

    const chip = (label: string, pct: number | null, text: string) => {
      if (pct == null) return null;
      return (
        <div className="flex flex-col items-center px-2">
          <div className="text-sm font-semibold text-gray-100">{pct}%</div>
          <div className="text-[12px] text-gray-300">{label}</div>
          <div className="text-[12px] text-gray-400">{text}</div>
        </div>
      );
    };

    const fmtDeltaTime = (s: number) => {
      const sign = s >= 0 ? '+' : '−';
      const v = Math.abs(Math.round(s));
      const m = Math.floor(v / 60);
      const ss = v % 60;
      return `${sign}${m}:${String(ss).padStart(2, '0')}`;
    };

    // ── Swim (open water only) ───────────────────────────────────────────────
    if (isSwim && !isPoolSwim) {
      const swimUnit = sd.planned_totals?.swim_unit || 'yd';
      const plannedPer100 = sd.planned_totals?.swim_pace_per_100_s ?? null;
      const executedPer100 = sd.completed_totals?.swim_pace_per_100_s ?? null;
      const paceDeltaSec = (plannedPer100 != null && executedPer100 != null)
        ? plannedPer100 - executedPer100 : null;
      const fmtDeltaPer100 = (s: number) => {
        const faster = s > 0;
        const v = Math.abs(s);
        const m = Math.floor(v / 60);
        const ss = Math.round(v % 60);
        return `${m ? `${m}m ` : ''}${ss}s/${swimUnit === 'yd' ? '100yd' : '100m'} ${faster ? 'faster' : 'slower'}`.trim();
      };

      return (
        <div className="w-full pt-1 pb-2">
          {weekLabel && <div className="mb-2 text-center text-xs text-gray-400">{weekLabel}</div>}
          <div className="flex items-center justify-center gap-6 text-center mb-3">
            <div className="flex items-end gap-3">
              {chip('Execution', executionScore, 'Overall adherence')}
              {chip('Pace', paceAdherence, paceDeltaSec != null ? fmtDeltaPer100(paceDeltaSec) : '—')}
              {chip('Duration', durationAdherence, durationDelta != null ? fmtDeltaTime(durationDelta) : '—')}
            </div>
          </div>
          {onNavigateToContext && workoutId && (
            <ViewContextLink workoutId={workoutId} onClick={onNavigateToContext} />
          )}
        </div>
      );
    }

    // ── Ride ─────────────────────────────────────────────────────────────────
    if (isRide) {
      return (
        <div className="w-full pt-1 pb-2">
          {weekLabel && <div className="mb-2 text-center text-xs text-gray-400">{weekLabel}</div>}
          <div className="flex items-center justify-center gap-6 text-center mb-3">
            <div className="flex items-end gap-3">
              {chip('Execution', executionScore, 'Overall adherence')}
              {chip('Power', powerAdherence, 'Time in range')}
              {chip('Duration', durationAdherence, durationDelta != null ? fmtDeltaTime(durationDelta) : '—')}
            </div>
          </div>
          {onNavigateToContext && workoutId && (
            <ViewContextLink workoutId={workoutId} onClick={onNavigateToContext} />
          )}
        </div>
      );
    }

    // ── Run / Walk (default) ─────────────────────────────────────────────────
    const paceChipLabel = isGapAdjusted ? 'GAP' : 'Pace';
    const paceChipSubtitle = isStructured
      ? (isGapAdjusted ? 'Blended interval GAP' : 'Blended interval pace')
      : (isGapAdjusted ? 'Grade-adjusted pace' : 'Pace adherence');

    const showPaceChip = !(sd as any)?.classification?.is_easy_like;

    return (
      <div className="w-full pt-1 pb-2">
        {weekLabel && <div className="mb-2 text-center text-xs text-gray-400">{weekLabel}</div>}
        <div className="flex items-center justify-center gap-6 text-center mb-3">
          <div className="flex items-end gap-3">
            {chip('Execution', executionScore,
              performanceAssessment ? `${performanceAssessment} Performance` : 'Overall adherence')}
            {chip('Duration', durationAdherence, 'Time adherence')}
            {showPaceChip && chip(paceChipLabel, paceAdherence, paceChipSubtitle)}
          </div>
        </div>
        {onNavigateToContext && workoutId && (
          <ViewContextLink workoutId={workoutId} onClick={onNavigateToContext} />
        )}
      </div>
    );
  } catch { return null; }
}

function ViewContextLink({ workoutId, onClick }: { workoutId: string; onClick: (id: string) => void }) {
  return (
    <div className="text-center mb-2">
      <button
        onClick={() => onClick(workoutId)}
        className="text-sm text-gray-200 hover:text-white transition-colors underline underline-offset-2"
      >
        View context
      </button>
    </div>
  );
}
