// =============================================================================
// run-pace-calibration — "do we have a pace to build on, and if not, get one"
// =============================================================================
//
// ⛔ WHY THIS IS A MODULE AND NOT A SECOND COPY. The race form already has this: two fields (easy
// pace, 5K pace), a derived-zone preview, and an upsert to `user_baselines`
// (`GoalsScreen.tsx:1126` `handleCalibrationSave`). The marathon card needs the same thing for the
// same reason, and copying it would give the app two calibrations that can drift apart while
// writing to one row.
//
// ⛔ AND THE MATH WAS ALREADY SHIPPED — THIS IS THE THIRD COPY AVOIDED, NOT THE SECOND.
// `GoalsScreen` carries private `VDOT_5K` and `PACE_BY_VDOT` tables. `PACE_BY_VDOT` is a
// **byte-for-byte duplicate** of `PACE_TABLE` in `src/lib/effort-score.ts`, in a different shape.
// So this file computes nothing itself: it calls `calculateEffortScore` / `getPacesFromScore`, the
// engine the rest of the app already uses — `effort_paces` written here is read by
// `generate-run-plan`'s performance_build path, and `_shared/endurance/pace-zones.ts` describes
// itself as "parity-locked to effort-score". Effort-score is canonical; GoalsScreen's copy is the
// outlier.
//
// ⚠️ GOALSCREEN IS NOT REWIRED TO THIS YET. Doing it mid-device-test would put a live surface at
// risk for a tidy-up. Its copy is numerically identical today, so nothing is lying — but that is a
// coincidence that will not survive an edit to one of them. Re-point it in its own change.

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateEffortScore, getPacesFromScore, type TrainingPaces } from './effort-score';

/** The subset of `user_baselines` the pace gate reads. */
export type PaceBenchmarkRow = {
  effort_score?: number | null;
  effort_source_distance?: number | null;
  effort_source_time?: number | null;
  effort_paces?: { race?: number | null } | null;
  learned_fitness?: Record<string, unknown> | null;
} | null | undefined;

/**
 * ⛔ THE SAME PREDICATE THE SERVER USES, AND IT HAS TO STAY THE SAME ONE.
 *
 * `create-goal-and-materialize-plan:3295` refuses a `goal_type: 'speed'` build unless one of four
 * signals is on file. If the intake's idea of "we have a pace" is looser than the server's, the
 * athlete answers a question, walks five more screens, and is turned down at the Build button —
 * which is the dead-end this whole module exists to prevent. If it is tighter, they are asked to
 * calibrate something they already have.
 *
 * ⚠️ Mirrored, not imported: the server predicate is inline in a `@ts-nocheck` handler and cannot
 * be imported from the client. Change one, change both.
 */
export function hasPaceBenchmark(row: PaceBenchmarkRow): boolean {
  if (!row) return false;
  const hasRaceTime = !!row.effort_source_distance && !!row.effort_source_time;
  const hasEffortScore = !!row.effort_score;
  const hasThresholdPace = !!row.effort_paces?.race;
  const lf = (row.learned_fitness ?? {}) as Record<string, unknown>;
  const usable = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const hasLearnedRunPace = usable(lf.run_threshold_pace_sec_per_km) || usable(lf.run_easy_pace_sec_per_km);
  return hasRaceTime || hasEffortScore || hasThresholdPace || hasLearnedRunPace;
}

/** `mm:ss` → seconds. Returns null on anything else; an unparseable pace is not a zero pace. */
export function parsePaceInput(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return sec > 0 ? sec : null;
}

/** seconds → `m:ss`. */
export function formatPaceInput(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type CalibrationResult = {
  /** vDOT — stored as `effort_score`. */
  score: number;
  paces: TrainingPaces;
  /** The 5K time implied by the typed 5K pace, in seconds — stored as `effort_source_time`. */
  fiveKTimeSec: number;
  /** The typed easy pace, sec/MILE — stored as `performance_numbers.easyPace` (the typed seed). */
  easyPaceSecPerMi: number;
};

/** seconds → "mm:ss" race clock, the shape `performance_numbers.fiveK` has always held. */
export function formatRaceClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * ⛔ THE ONE DERIVATION (2026-09-02, D-461). Every pace the app derives from a 5K comes from this
 * function and nowhere else. Input: the 5K as a race clock in seconds. Output: the `effort_*` columns
 * on `user_baselines`, which the 25-odd readers of `effort_paces` keep reading unchanged.
 *
 * Before this there were FOUR writers (the race wizard with its own inline vDOT tables, the strength
 * wizard, `generate-run-plan`, and `materialize-plan` recomputing and writing back on every build) and
 * TWO stored 5Ks (`performance_numbers.fiveK` from Baselines, `effort_source_time` from the wizards).
 * Now: the 5K lives in `performance_numbers.fiveK`, and whoever saves it calls this.
 */
export function effortFieldsFromFiveKTimeSec(fiveKTimeSec: number): {
  effort_score: number;
  effort_source_distance: number;
  effort_source_time: number;
  effort_paces: TrainingPaces;
  effort_paces_source: 'calculated';
  effort_score_status: 'self_reported';
  effort_updated_at: string;
} {
  const score = calculateEffortScore(5000, fiveKTimeSec);
  return {
    effort_score: score,
    effort_source_distance: 5000,
    effort_source_time: Math.round(fiveKTimeSec),
    effort_paces: getPacesFromScore(score),
    effort_paces_source: 'calculated',
    effort_score_status: 'self_reported',
    effort_updated_at: new Date().toISOString(),
  };
}

/**
 * Two self-reported paces → the effort score and training paces the plan will be built from.
 *
 * ⚠️ THE 5K PACE IS THE ONE THAT DOES THE WORK. The easy pace is asked because it is the number an
 * athlete can answer confidently and it sanity-checks the other (5K must be faster), but the score
 * is derived from the 5K only — that is what `calculateEffortScore` takes.
 *
 * Returns null when either pace is unusable or the pair is incoherent, so a caller can stay silent
 * rather than store a number nobody can stand behind.
 */
export function calibrationFromPaces(input: {
  easyPace: string;
  fiveKPace: string;
  isMetric: boolean;
}): CalibrationResult | null {
  const easyRaw = parsePaceInput(input.easyPace);
  const fiveKRaw = parsePaceInput(input.fiveKPace);
  if (!easyRaw || !fiveKRaw) return null;
  // ⛔ A 5K SLOWER THAN EASY IS NOT A SLOW ATHLETE, IT IS A SWAPPED PAIR. Storing it would hand the
  // plan a score computed from the wrong field.
  if (fiveKRaw >= easyRaw) return null;

  const toSecPerMile = (v: number) => (input.isMetric ? Math.round(v * 1.60934) : v);
  const fiveKPerMile = toSecPerMile(fiveKRaw);
  const fiveKTimeSec = Math.round(fiveKPerMile * 3.10686);
  const score = calculateEffortScore(5000, fiveKTimeSec);
  return { score, paces: getPacesFromScore(score), fiveKTimeSec, easyPaceSecPerMi: toSecPerMile(easyRaw) };
}

/**
 * Persist a calibration to `user_baselines`, in the shape the pace gate reads.
 *
 * ⚠️ `effort_score_status: 'self_reported'` is not decoration — it is how every downstream surface
 * knows this number came from the athlete's own estimate rather than a measured race, and the
 * distinction is the difference between a fact and a claim.
 */
export async function saveCalibration(
  supabase: SupabaseClient,
  userId: string,
  result: CalibrationResult,
): Promise<{ error: string | null }> {
  // ⛔ WRITES THE 5K WHERE BASELINES KEEPS IT, then the ONE derivation (D-461).
  const { data: row } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', userId).maybeSingle();
  const pn = { ...((row?.performance_numbers as Record<string, unknown> | null) ?? {}) } as Record<string, unknown>;
  pn.fiveK = formatRaceClock(result.fiveKTimeSec);
  // `easyPace` is NOT written (D-462): easy is a heart-rate zone; no reader takes a typed easy pace.
  const { error } = await supabase.from('user_baselines').upsert({
    user_id: userId,
    performance_numbers: pn,
    ...effortFieldsFromFiveKTimeSec(result.fiveKTimeSec),
  }, { onConflict: 'user_id' });
  return { error: error ? error.message : null };
}
