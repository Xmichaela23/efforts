import { paceBand, type IntervalBand } from "../_shared/session-detail/interval-compare.ts";

/**
 * WHAT THE POST-RUN SCREEN PRINTS, DECIDED HERE (2026-09-10, audit H-D15).
 *
 * The phone used to grade each rep green or amber by averaging its own GPS samples and call
 * "Execution: N%" the share of reps in range, coloured at 80 and 60 with no source. VIEW DETAILS on
 * the same screen showed the server's `computed.overall.execution_score`. index.ts awaits recompute-workout
 * before calling this, so the row is scored by the time this runs: the work steps' average pace and band come from
 * `computed.intervals` (compute-workout-summary) read against the planned step's range with the same
 * rule the Performance tab uses (`paceBand`), and the score is the server's.
 */
export interface PhoneWorkoutSummary {
  execution_score: number | null;
  avg_hr: number | null;
  /** Work steps only, in plan order. */
  intervals: Array<{ planned_step_id: string | null; avg_pace_s_per_mi: number | null; band: IntervalBand | null }>;
}

export function buildPhoneWorkoutSummary(
  computed: any,
  plannedSteps: any[],
  avgHr: number | null | undefined,
): PhoneWorkoutSummary {
  const rangeById = new Map<string, { lower_sec_per_mi: number; upper_sec_per_mi: number }>();
  for (const st of Array.isArray(plannedSteps) ? plannedSteps : []) {
    const r = st?.pace_range;
    if (st?.id && r && Number(r.lower) > 0 && Number(r.upper) > 0) {
      rangeById.set(String(st.id), { lower_sec_per_mi: Number(r.lower), upper_sec_per_mi: Number(r.upper) });
    }
  }
  const rows: any[] = Array.isArray(computed?.intervals) ? computed.intervals : [];
  const intervals = rows
    .filter((iv) => String(iv?.kind ?? iv?.role ?? '').toLowerCase() === 'work')
    .map((iv) => {
      const id = iv?.planned_step_id != null ? String(iv.planned_step_id) : null;
      const pace = Number(iv?.executed?.avg_pace_s_per_mi);
      const avg = Number.isFinite(pace) && pace > 0 ? Math.round(pace) : null;
      return { planned_step_id: id, avg_pace_s_per_mi: avg, band: paceBand(avg, id ? rangeById.get(id) : undefined) };
    });
  const score = Number(computed?.overall?.execution_score);
  return {
    execution_score: Number.isFinite(score) ? Math.round(score) : null,
    avg_hr: Number.isFinite(Number(avgHr)) && Number(avgHr) > 0 ? Math.round(Number(avgHr)) : null,
    intervals,
  };
}
