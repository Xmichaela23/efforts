import { useMemo } from 'react';

export type WorkoutDataNormalized = {
  /** 2026-09-16: the distance in the athlete's own unit, written on the server. */
  distance_display?: string | null;
  /** 2026-09-16: the swim's average stroke rate, averaged on the server. */
  avg_swim_cadence_spm?: number | null;
  /** 2026-09-16: the analyser's zone bins with each one's share of the window written beside it. */
  zones?: unknown;
  distance_m: number | null;
  distance_km: number | null;
  duration_s: number | null;
  elapsed_s: number | null;
  elevation_gain_m: number | null;
  avg_power: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  max_power: number | null;
  max_speed_mps: number | null;
  max_pace_s_per_km: number | null;
  max_cadence_rpm: number | null;
  avg_speed_kmh: number | null;
  avg_speed_mps: number | null;
  avg_pace_s_per_km: number | null;
  /** GRADE-ADJUSTED pace — the pace this run would have been on the flat. Read STRAIGHT from the
   *  server's `computed.overall.avg_gap_s_per_mi` (`_shared/gap.ts`, Minetti metabolic cost — the
   *  model behind Strava GAP / TrainingPeaks NGP). D-186: the client must NEVER re-derive GAP; it
   *  had two hand-rolled approximations once, and both are deleted. This is a read, not a derive.
   *  Null when the run had no usable elevation. */
  gap_pace_s_per_km: number | null;
  avg_running_cadence_spm: number | null;
  avg_cycling_cadence_rpm: number | null;
  avg_swim_pace_per_100m: number | null;
  avg_swim_pace_per_100yd: number | null;
  calories: number | null;
  work_kj: number | null;
  normalized_power: number | null;
  intensity_factor: number | null;
  variability_index: number | null;
  /** Mean watts while power > ~25 W (coasting/stops excluded from numerator). */
  avg_power_pedaling_w: number | null;
  /** 0–100: share of sample clock time above pedaling threshold. */
  pct_time_pedaling: number | null;
  sport: string | null;
  series: any | null;
};

export const useWorkoutData = (workoutData: any): WorkoutDataNormalized => {
  return useMemo(() => {
    // 2026-09-03: some rows reach this hook with `computed` / `metrics` still as JSON STRINGS (the list
    // query hands them through untouched). Every read below does `.computed?.overall`, which is undefined
    // on a string — the grade-adjusted pace tile sat at "—" for exactly this reason while the number was
    // there. Parse once, here, so no reader has to know.
    for (const key of ['computed', 'metrics', 'workout_analysis'] as const) {
      const v = workoutData?.[key];
      if (typeof v === 'string' && v.length > 1) {
        try { workoutData = { ...workoutData, [key]: JSON.parse(v) }; } catch { /* leave it */ }
      }
    }
    // Prefer server-provided display_metrics (smart server, dumb client)
    const dm = workoutData?.display_metrics;
    if (dm && typeof dm === 'object' && Object.keys(dm).length > 0) {
      // 2026-09-03: the server's display numbers did not carry the grade-adjusted pace, and this early
      // return meant nothing below ever ran — the Details tile read "—" with the number sitting in
      // computed.overall. Fill it from there when the server did not send it (still a READ, never a derive).
      const gapFromComputed = (() => {
        const g = Number(workoutData?.computed?.overall?.avg_gap_s_per_mi ?? workoutData?.computed?.overall?.gap_pace_s_per_mi);
        return Number.isFinite(g) && g > 0 ? g / 1.60934 : null;
      })();
      return {
        ...dm,
        gap_pace_s_per_km: (dm as WorkoutDataNormalized).gap_pace_s_per_km ?? gapFromComputed,
        avg_power_pedaling_w: (dm as WorkoutDataNormalized).avg_power_pedaling_w ?? null,
        pct_time_pedaling: (dm as WorkoutDataNormalized).pct_time_pedaling ?? null,
      } as WorkoutDataNormalized;
    }
    /**
     * ⛔ THE PHONE'S OWN DERIVATION LADDER IS DELETED (2026-09-16, Stage 4 session 3).
     *
     * Everything below this point rebuilt `display_metrics` out of the raw row when the server had not
     * sent one: distance from `computed.overall`, pace from the same, swim pace as duration ÷ distance,
     * elapsed as `max(elapsed, moving)`, speed from distance ÷ hours. Same formulas as the server's, a
     * second copy of every one.
     *
     * ⛔ IT COULD ONLY RUN FOR A MOMENT. `workout-detail` writes `display_metrics` on EVERY answer
     * (`index.ts`, unconditional), and this hook had exactly one caller (`CompletedTab`; since 2026-09-26
     * also `SessionZoneCards`, handed the same workout-detail row), so the ladder
     * was reachable only in the frame before the fetch returned. A number that is right for one frame
     * and then replaced is not worth a second copy of the maths.
     *
     * ⚠️ WHAT CHANGES ON SCREEN: that frame now shows nothing in those slots instead of an
     * approximation. Nothing after it changes.
     */
    return {} as WorkoutDataNormalized;
  }, [workoutData]);
};
