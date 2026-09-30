/**
 * ⛔ THE WEEK SWEEP SKIPS A WORKOUT THAT IS ALREADY DONE (2026-09-30).
 *
 * The calendar calls sweep-week once per week per app launch. It used to attach and summarise every
 * workout in the week, every launch. For a workout that was already linked, the attach step clears its
 * interval match and planned steps and re-runs the summary and the analysis (auto-attach-planned,
 * "sync_existing_link"). So every launch re-analysed the whole week: each saved Performance summary went
 * out of date and was rebuilt on the next open, and each write sent the phone a change event that
 * re-fetched the week.
 *
 * Attach is skipped when the link is settled both ways (workout → planned row → the same workout, marked
 * completed) and a linked run, ride, swim or walk has its planned steps (computed.planned_steps_light — the
 * same test ensure-planned-ready uses). A workout with no link still tries to attach; with no match that
 * writes nothing. The summary is skipped when one exists (computed.overall) and those planned steps are in.
 * Anything else runs as before. A linked workout whose planned row is outside the week is attached again,
 * as before.
 */

export type SweepWorkoutRow = {
  id: string;
  type?: string | null;
  planned_id?: string | null;
  /** `computed->overall` */
  overall?: unknown;
  /** `computed->planned_steps_light` */
  planned_steps_light?: unknown;
};

export type SweepPlannedRow = {
  id: string;
  completed_workout_id?: string | null;
  workout_status?: string | null;
};

/** Planned steps are an endurance comparison; a linked strength or mobility row is done once linked and summarised. */
const ENDURANCE = new Set(['run', 'ride', 'swim', 'walk']);

export function planSweep(
  workouts: SweepWorkoutRow[],
  plannedRows: SweepPlannedRow[],
): { attachIds: string[]; computeIds: Set<string> } {
  const plannedById = new Map(plannedRows.map((p) => [String(p.id), p]));
  const hasSummary = (r: SweepWorkoutRow) => r.overall != null && typeof r.overall === 'object';
  const hasPlannedSteps = (r: SweepWorkoutRow) => !ENDURANCE.has(String(r.type || '').toLowerCase())
    || (Array.isArray(r.planned_steps_light) && r.planned_steps_light.length > 0);
  const linkSettled = (r: SweepWorkoutRow) => {
    const p = plannedById.get(String(r.planned_id));
    return !!p && String(p.completed_workout_id) === String(r.id) && p.workout_status === 'completed';
  };
  const needsAttach = (r: SweepWorkoutRow) => !r.planned_id || !linkSettled(r) || !hasPlannedSteps(r);
  const needsCompute = (r: SweepWorkoutRow) => !hasSummary(r) || (!!r.planned_id && !hasPlannedSteps(r));
  return {
    attachIds: workouts.filter(needsAttach).map((r) => String(r.id)),
    computeIds: new Set(workouts.filter(needsCompute).map((r) => String(r.id))),
  };
}
