import React from 'react';
import type {
  RaceReadinessV1,
  RaceFinishProjectionV1,
  FitnessVerdictDivergence,
} from '@/hooks/useCoachWeekContext';
import type { BlockVerdictResult } from '@/lib/analysis/goal-predictor';
import { planWizardRaceDistanceDisplay } from '@/lib/plan-wizard-distance-label';
import { resolveRaceHeader } from '@/lib/race-header';
import { resolveEventTargetTimeSeconds } from '@/lib/goal-target-time';
import { readoutPlateStyle } from '@/lib/readout-plate';
import {
  type PrimaryRaceReadinessRow,
  fmtDate,
  daysSinceYmd,
  fmtGoalClock,
  fmtSignedDeltaVsGoal,
  fmtSignedDeltaVsModel,
  fmtSignedDeltaVsProjection,
  Row,
  Chip,
  Dot,
  assessmentColor,
  assessmentLabel,
  signalToneColor,
  hasRaceProjectionDetail,
} from './state-primitives';

/**
 * RACE — extracted from StateTab 2026-09-01 (Round 0a). No behaviour change.
 * `RaceSection` is verbatim; `StateRaceBlock` is the gate that used to be an inline IIFE in the
 * layout, moved here with its comments so the block above and below it can be reordered.
 */

function RaceSection({
  projection,
  rr,
  goalMeta,
  planWizardDistance,
  planWizardTargetSeconds,
  primaryRaceReadiness,
  onOpenKeyRun,
  resolvedGoalId,
  courseRow,
  courseBusy,
  onAddCourse,
  onViewStrategy,
  /** When set, RACE shows official chip time and hides the training “Projected” model. */
  officialResult,
  /**
   * After race day: logged run on the race (elapsed not moving), with model projection for comparison.
   * Replaces the big “Projected” block until the user records an official result and ends the plan.
   */
  postRaceUnofficial,
  blockVerdict,
  divergence,
}: {
  projection: RaceFinishProjectionV1 | null;
  rr: RaceReadinessV1 | null;
  goalMeta: { name: string; weeks_out: number; distance: string; target_time_seconds: number | null } | null;
  /** From coach `plan.active_plans[].distance` (same as Plan Wizard / plan config). */
  planWizardDistance: string | null;
  /** `plans.config.target_time` from coach (Plan Wizard / generate-run-plan). Shown when coach RFP row is absent. */
  planWizardTargetSeconds: number | null;
  primaryRaceReadiness?: PrimaryRaceReadinessRow | null;
  onOpenKeyRun?: (workoutId: string) => void;
  resolvedGoalId: string | null;
  courseRow: { id: string; name: string } | null;
  courseBusy: boolean;
  onAddCourse: () => void;
  onViewStrategy: () => void;
  officialResult: {
    actual_seconds: number;
    goal_target_seconds: number | null;
    modelProjected?: { seconds: number; display: string } | null;
  } | null;
  postRaceUnofficial: { loggedSeconds: number; workoutId: string; daysAfterRace: number } | null;
  /** D-212 Piece 4 — block-adaptation third axis (the N-way room), rendered compact + drivers-gated. */
  blockVerdict: BlockVerdictResult | null;
  /** D-212 Cut 2 — spine↔projection divergence for the displayed goal; null/empty = aligned, render nothing. */
  divergence: FitnessVerdictDivergence | null;
}) {
  const distLabel = planWizardRaceDistanceDisplay(
    planWizardDistance ?? rr?.goal.distance ?? goalMeta?.distance ?? null,
  );
  // H4 (Q-107): the weeks-out + real-race gate are resolved below (they need hasAnyFinishTime) via
  // resolveRaceHeader — never fabricate a "0w out" countdown from the `?? 0` default.

  const statedSec = goalMeta?.target_time_seconds ?? null;
  const wizardSec =
    planWizardTargetSeconds != null && Number.isFinite(planWizardTargetSeconds) && planWizardTargetSeconds > 0
      ? Math.round(planWizardTargetSeconds)
      : null;
  /**
   * Stated goal: plan config / wizard first (intent), then goal meta, then coach plan_goal mirror.
   * No client-side pace math.
   */
  const statedGoalDisplay =
    wizardSec != null
      ? fmtGoalClock(wizardSec)
      : statedSec != null
        ? fmtGoalClock(statedSec)
        : projection?.plan_goal_display ?? null;

  const modelProjected = rr
    && Number.isFinite(rr.predicted_finish_time_seconds) &&
    rr.predicted_finish_time_seconds > 0
    ? { seconds: rr.predicted_finish_time_seconds, display: rr.predicted_finish_display }
    : null;

  if (officialResult) {
    return (
      <div className="px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase shrink-0">RACE</span>
          <span className="text-[13px] text-white/55 text-right leading-snug">{distLabel} · result on file</span>
        </div>
        {statedGoalDisplay != null && (
          <div className="flex flex-col gap-0.5">
            <p className="text-[12px] text-white/65 leading-snug">Your goal</p>
            <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
              {statedGoalDisplay}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px] text-white/65 leading-snug">Completed</p>
          <span className="text-[22px] font-semibold tabular-nums text-emerald-300/90 tracking-tight">
            {fmtGoalClock(officialResult.actual_seconds)}
          </span>
          <p className="text-[12px] text-white/60 leading-snug max-w-[min(100%,320px)]">
            Official finish: elapsed (chip) time, not moving time. Training “projected” is replaced after you save this result.
          </p>
        </div>
        {officialResult.goal_target_seconds != null && (
          <p className="text-[13px] text-white/50">
            {fmtSignedDeltaVsGoal(officialResult.actual_seconds, officialResult.goal_target_seconds)}
          </p>
        )}
        {officialResult.modelProjected && (
          <p className="text-[13px] text-white/50 leading-snug">
            Model had projected {officialResult.modelProjected.display} · {fmtSignedDeltaVsModel(officialResult.actual_seconds, officialResult.modelProjected.seconds)}
          </p>
        )}
      </div>
    );
  }

  if (postRaceUnofficial) {
    const wk = postRaceUnofficial.daysAfterRace;
    const postLabel = wk === 1 ? '1 day after race' : wk < 7 ? `${wk} days after race` : 'after your race';
    return (
      <div className="px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase shrink-0">RACE</span>
          <span className="text-[13px] text-white/55 text-right leading-snug">{distLabel} · {postLabel}</span>
        </div>
        {statedGoalDisplay != null && (
          <div className="flex flex-col gap-0.5">
            <p className="text-[12px] text-white/65 leading-snug">Your goal</p>
            <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
              {statedGoalDisplay}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px] text-white/65 leading-snug">Your finish (from log)</p>
          <span className="text-[22px] font-semibold tabular-nums text-emerald-300/90 tracking-tight">
            {fmtGoalClock(postRaceUnofficial.loggedSeconds)}
          </span>
          <p className="text-[12px] text-white/60 leading-snug max-w-[min(100%,320px)]">
            Elapsed (chip) time if your device reported it; otherwise we fall back to other durations. The large “Projected” block is hidden after race day so this stays primary.
          </p>
        </div>
        {modelProjected && (
          <div className="space-y-1">
            <p className="text-[12px] text-white/65 leading-snug">Model had projected (pre-race)</p>
            <p className="text-[20px] font-semibold tabular-nums text-white/75">
              {modelProjected.display}
            </p>
            <p className="text-[13px] text-white/50">
              {fmtSignedDeltaVsModel(postRaceUnofficial.loggedSeconds, modelProjected.seconds)}
            </p>
          </div>
        )}
        <p className="text-[12px] text-white/60 leading-snug">
          Race result auto-saves to My Record once your run is logged. The plan then moves to past on its own.
        </p>
      </div>
    );
  }
  /** Server fitness clock — prefer full race_readiness so headline matches delta + sections (same model path). */
  const projectedFromTraining =
    rr?.predicted_finish_display ??
    projection?.fitness_projection_display ??
    (projection &&
    projection.source_kind &&
    projection.source_kind !== 'plan_target' &&
    projection.anchor_display
      ? projection.anchor_display
      : null);
  const hasProjection = projectedFromTraining != null;
  const showProjectionPlaceholder = statedGoalDisplay != null && !hasProjection;
  const hasAnyFinishTime = statedGoalDisplay != null || hasProjection;
  // H4 (Q-107): gate the RACE header on a REAL race — no fabricated "0w out" from the `?? 0` default.
  const { hasRealRace, weeksOut: raceWeeksOut } = resolveRaceHeader({
    readinessWeeksOut: rr?.goal?.weeks_out ?? null,
    goalMetaWeeksOut: goalMeta?.weeks_out ?? null,
    hasAnyFinishTime,
  });

  return (
    <div className="px-3 py-3 space-y-2.5">
      {/* Header: goal + weeks out */}
      <div className="flex items-center justify-between gap-3">
        <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase shrink-0">RACE</span>
        {hasRealRace && (
          <span className="text-[13px] text-white/55 text-right leading-snug">{distLabel}{raceWeeksOut != null ? ` — ${raceWeeksOut}w out` : ''}</span>
        )}
      </div>

      {/* Goal (intent) vs projected finish (server fitness); terrain refines projected server-side when applicable. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-3 min-w-0 flex-1">
          {statedGoalDisplay != null && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[12px] text-white/65 leading-snug">Your goal</p>
              <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
                {statedGoalDisplay}
              </span>
            </div>
          )}
          {hasProjection && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[12px] text-white/65 leading-snug">Projected</p>
              <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
                {projectedFromTraining}
              </span>
              {rr && (
                <p className="text-[12px] text-white/32 leading-snug max-w-[280px]">
                  Matches the gap and details below — one model, from your threshold, fade over distance, and data confidence.
                </p>
              )}
            </div>
          )}
          {showProjectionPlaceholder && (
            <p className="text-[13px] text-white/55 leading-snug pr-1">
              Can’t project a finish time yet (race date on the goal/plan, or baselines).
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
          {rr?.delta_display && (
            <span className={`text-[14px] font-medium tabular-nums ${assessmentColor(rr.assessment)}`}>
              {rr.delta_display}
            </span>
          )}
          {rr && (
            <span className={`text-[12px] font-semibold uppercase tracking-wider ${assessmentColor(rr.assessment)}`}>
              {assessmentLabel(rr.assessment)}
            </span>
          )}
        </div>
      </div>

      {/* Factual projection: framing + grouped sections (server); legacy flat list still supported */}
      {rr?.projection_display?.sections && rr.projection_display.sections.length > 0 && (
        <div className="space-y-3 pt-0.5">
          <p className="text-[12px] text-white/60 uppercase tracking-wide">From your data</p>
          {rr.projection_display.framing ? (
            <p className="text-[13px] text-white/60 leading-relaxed">{rr.projection_display.framing}</p>
          ) : null}
          {rr.projection_display.sections.map((sec) => (
            <div key={sec.label} className="space-y-1.5">
              <p className="text-[12px] font-semibold tracking-[0.1em] text-white/65 uppercase">{sec.label}</p>
              <ul className="list-disc pl-4 space-y-1 text-[13px] text-white/65 leading-relaxed">
                {sec.lines.map((line, i) => (
                  <li key={`${sec.label}-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {rr?.projection_facts && rr.projection_facts.length > 0 && !(rr.projection_display?.sections?.length) && (
        <div className="space-y-1.5 pt-0.5">
          <p className="text-[12px] text-white/60 uppercase tracking-wide">From your data</p>
          <ul className="list-disc pl-4 space-y-1.5 text-[13px] text-white/60 leading-relaxed">
            {rr.projection_facts.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {projection?.mismatch_blurb && !hasRaceProjectionDetail(rr) && (
        <p className="text-[13px] text-white/50 leading-relaxed">{projection.mismatch_blurb}</p>
      )}
      {!hasAnyFinishTime && (
        <p className="text-[13px] text-white/60 leading-snug">
          Add a race target in your plan to see your goal and projection.
        </p>
      )}

      {/* Target comparison — full race_readiness only */}
      {rr?.target_finish_display && (
        <div className="flex items-baseline gap-2 text-[13px] text-white/55">
          <span>Target {rr.target_finish_display}</span>
          <Dot />
          <span>Race pace {rr.predicted_race_pace_display}</span>
        </div>
      )}

      {/* VDOT trend */}
      {rr && (
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="text-white/55">VDOT {rr.current_vdot.toFixed(1)}</span>
          {rr.plan_vdot != null && rr.vdot_delta != null && rr.vdot_direction !== 'stable' && (
            <>
              <Dot />
              <span className={rr.vdot_direction === 'improved' ? 'text-emerald-400/85' : 'text-amber-400/85'}>
                {rr.vdot_delta > 0 ? '+' : ''}{rr.vdot_delta.toFixed(1)} since plan start
              </span>
            </>
          )}
        </div>
      )}

      {/* Legacy narrative — hidden when projection display supplies factual copy */}
      {rr && !hasRaceProjectionDetail(rr) && (
        <p className="text-[13px] text-white/65 leading-relaxed">{rr.assessment_message}</p>
      )}

      {resolvedGoalId && (
        <div className="pt-0.5">
          {courseBusy ? (
            <p className="text-[13px] text-white/60">Working on course…</p>
          ) : courseRow ? (
            <button
              type="button"
              onClick={onViewStrategy}
              className="w-full text-left text-[13px] text-sky-400/85 hover:text-sky-300/90 py-1"
            >
              View terrain strategy → <span className="text-white/60">{courseRow.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddCourse}
              className="w-full text-left text-[13px] text-sky-400/85 hover:text-sky-300/90 py-1"
            >
              Add course for terrain strategy based on your data →
            </button>
          )}
        </div>
      )}

      {/* KEY RUN — primary long-run race readiness (single signal; full block on Performance) */}
      {primaryRaceReadiness && onOpenKeyRun && (
        <button
          type="button"
          onClick={() => onOpenKeyRun(primaryRaceReadiness.workout_id)}
          className="w-full text-left rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-3 space-y-2.5 mt-1 active:opacity-90"
        >
          <span className="text-[12px] font-medium text-white/65 uppercase tracking-wide">Key run</span>
          <p className="text-[13px] text-white/50 tabular-nums">
            {fmtDate(primaryRaceReadiness.workout_date)} · {primaryRaceReadiness.distance_miles}mi
          </p>
          <p className="text-[14px] font-semibold text-white/90 leading-snug">{primaryRaceReadiness.headline}</p>
          {!!String(primaryRaceReadiness.tactical_instruction || '').trim() && (
            <div className="rounded-md border border-white/15 bg-white/[0.08] px-2.5 py-2">
              <span className="text-[12px] font-medium text-white/65 uppercase tracking-wide">Race day</span>
              <p className="text-[13px] text-white/85 mt-0.5 leading-snug">{primaryRaceReadiness.tactical_instruction}</p>
            </div>
          )}
          {!!String(primaryRaceReadiness.projection || '').trim() && (
            <p className="text-[13px] text-white/65 leading-relaxed">{primaryRaceReadiness.projection}</p>
          )}
          <span className="text-[13px] font-normal text-white/60">View full analysis →</span>
        </button>
      )}

      {/* Training signals */}
      {rr && rr.training_signals.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
          {rr.training_signals.map((s, i) => (
            <span key={i} className="text-[13px]">
              <span className="text-white/50">{s.label}</span>{' '}
              <span className={signalToneColor(s.tone)}>{s.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Pace zones */}
      {rr && (
        <div className="flex items-center gap-3 pt-0.5 text-[12px] text-white/65">
          <span>Easy {rr.pace_zones.easy}</span>
          <span>Threshold {rr.pace_zones.threshold}</span>
          <span>Race {rr.pace_zones.race}</span>
        </div>
      )}

      {/* Modifiers */}
      {rr && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-white/55">
          {rr.data_source === 'plan_targets' && (
            <span className="italic">Based on plan targets</span>
          )}
          {rr.durability_factor < 0.97 && (
            <span>Durability adj {((1 - rr.durability_factor) * 100).toFixed(1)}%</span>
          )}
          {rr.durability_factor >= 1.0 && (
            <span className="text-emerald-400/40">Durability +{((rr.durability_factor - 1) * 100).toFixed(1)}%</span>
          )}
          {rr.confidence_adjustment_pct > 0 && (
            <span>Confidence adj +{rr.confidence_adjustment_pct.toFixed(1)}%</span>
          )}
        </div>
      )}

      {/* Fitness verdicts (D-212 N-way room) — the block-adaptation third axis, beside the projection.
          Drivers-gated honesty: a seeded block_verdict (empty drivers, e.g. goal_probability 50) is the
          DORMANT "needs data" state, NOT a real probability — show a muted line, never a fake %. block_verdict
          null → hide. The colored-% branch is dark until block-adaptation data exists (Q-080). */}
      {blockVerdict && (
        blockVerdict.drivers.length === 0 ? (
          <p className="text-[13px] text-white/60 pt-0.5">Goal trajectory · needs more comparable sessions</p>
        ) : (
          <div className="flex items-baseline gap-2 pt-0.5 text-[13px]">
            <span className="text-white/50">Goal trajectory</span>
            <span className={
              blockVerdict.goal_probability_pct >= 70 ? 'text-emerald-400/85'
              : blockVerdict.goal_probability_pct >= 40 ? 'text-amber-400/85'
              : 'text-rose-400/85'
            }>{blockVerdict.goal_probability_pct}% on track</span>
          </div>
        )
      )}

      {/* D-212 Cut 2 — spine↔projection divergence: shown ONLY when verdicts genuinely disagree
          ("on-track finish, but swim sliding"). No divergence → render nothing (never "all agree"). */}
      {divergence && divergence.observations.length > 0 && (
        <div className="pt-0.5 space-y-0.5">
          {divergence.observations.map((o, i) => (
            <p key={i} className="text-[13px] text-amber-400/70 leading-snug">{o.note}</p>
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * The RACE gate — was an inline IIFE in StateTab's layout until 2026-09-01 (Round 0a).
 * Logic and comments carried across verbatim. Returns null on the same two tests, so the plate's
 * `divide-y` sees exactly what it saw before (a null render draws no DOM node and no divider).
 */
export default function StateRaceBlock(props: {
  raceFinishProjection: RaceFinishProjectionV1 | null;
  officialForRace: React.ComponentProps<typeof RaceSection>['officialResult'];
  postRaceUnofficial: React.ComponentProps<typeof RaceSection>['postRaceUnofficial'];
  raceYmdForActivePlan: string | null;
  raceReadiness: RaceReadinessV1 | null;
  goalMeta: React.ComponentProps<typeof RaceSection>['goalMeta'];
  blockVerdict: BlockVerdictResult | null;
  divergence: FitnessVerdictDivergence | null;
  planWizardDistance: string | null;
  planWizardTargetSeconds: number | null;
  primaryRaceReadiness?: PrimaryRaceReadinessRow | null;
  resolvedGoalId: string | null;
  courseRow: { id: string; name: string } | null;
  courseBusy: boolean;
  onAddCourse: () => void;
  onViewStrategy: () => void;
  onOpenKeyRun?: (workoutId: string) => void;
}) {
  // item 5 (Arc source-gate — relevance earned by live data, else null): RACE requires an
  // actual race signal, NOT a bare active plan. A non-race plan (e.g. Get Stronger) has
  // has_active_plan=true but no goal/projection → this used to render an empty RACE header.
  // (This is the QUICK half of the Q-120 overlap — a render narrowing, no logic added, so it
  // does not complicate the full Q-120 readiness-gating redesign.)
  // RACE only when there is a REAL race. Hard race artifacts (a computed projection / official
  // result) always qualify. A soft goal or readiness qualifies ONLY with an actual race DATE —
  // because goalMetaFromGoalLite defaults distance to 'marathon', so `goalMeta` is truthy for ANY
  // linked goal (incl. a non-race "Get Stronger" plan), which was leaking an empty RACE prompt.
  const hasRaceContent =
    props.raceFinishProjection ||
    props.officialForRace ||
    props.postRaceUnofficial ||
    (!!props.raceYmdForActivePlan && (props.raceReadiness || props.goalMeta));
  if (!hasRaceContent) return null;
  const upcomingDays = daysSinceYmd(props.raceYmdForActivePlan);
  const stillRaceWeek = upcomingDays == null || upcomingDays <= 7;
  if (!stillRaceWeek) return null;
  return (
    <RaceSection
      projection={props.raceFinishProjection}
      rr={props.raceReadiness}
      blockVerdict={props.blockVerdict}
      divergence={props.divergence}
      goalMeta={props.goalMeta}
      planWizardDistance={props.planWizardDistance}
      planWizardTargetSeconds={props.planWizardTargetSeconds}
      primaryRaceReadiness={props.primaryRaceReadiness}
      resolvedGoalId={props.resolvedGoalId}
      courseRow={props.courseRow}
      courseBusy={props.courseBusy}
      onAddCourse={props.onAddCourse}
      onViewStrategy={props.onViewStrategy}
      onOpenKeyRun={props.onOpenKeyRun}
      officialResult={props.officialForRace}
      postRaceUnofficial={props.officialForRace ? null : props.postRaceUnofficial}
    />
  );
}
