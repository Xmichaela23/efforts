/**
 * TIME UNDER A HEART-RATE CEILING — the one measurement of "did they hold it easy", for any sport.
 *
 * ⛔ MEASURED AS TIME UNDER THE CEILING, NEVER AS AN AVERAGE. This is the whole point of the file.
 * A hilly session pushes HR up on every climb; an average punishes terrain and reads as indiscipline
 * on a session that was 90% correctly executed. The share of time at or under the ceiling is what a
 * coach means by "keep it easy", and it is what the field actually displays — Garmin, Strava,
 * TrainingPeaks and intervals.icu all show time-in-zone for an aerobic session, not average HR.
 * Seiler's polarized work states its 80/20 in TIME below the first threshold for the same reason.
 *
 * ⚠️ NO DRIFT CORRECTION, DELIBERATELY (ruled by Michael 2026-08-02: *"straight — that's the whole
 * point"*). A long easy session drifts: two hours in, heart rate climbs even when the effort was
 * perfect, so a well-executed long run scores lower here. No shipped app corrects for this — they
 * report time-in-zone straight and report decoupling separately, which is exactly what the HR row on
 * the session screen already does. Correcting here would invent a number nobody measured, and the
 * drift is already explained one row down.
 *
 * ⚠️ THE CEILING IS NOT THIS FILE'S JOB, and it is NOT shared. Run and ride resolve their own, and
 * they are deliberately different: running HR sits 5-10 bpm ABOVE cycling at the same perceived
 * effort (upright posture, more active muscle mass, weight-bearing). See `_shared/easy-hr.ts` (run,
 * Friel Z2 at 89% LTHR / 80%-of-max bootstrap) and `_shared/ride-easy-hr.ts` (ride, 89% LTHR /
 * 75%-of-max bootstrap). Both files say it outright: DO NOT unify them.
 */

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export type TimeUnderCeiling = {
  /** Share of sampled time at or under the ceiling, 0-100. */
  pct: number;
  /** Seconds at or under the ceiling. Samples are 1 Hz, so a sample IS a second. */
  under_s: number;
  /** Seconds of usable heart rate — NOT the session duration. Dropped samples are not counted. */
  total_s: number;
};

/**
 * The measurement. Null when there is no ceiling or no usable heart rate — we abstain rather than
 * report a zero we did not observe.
 *
 * ⚠️ `total_s` IS THE HEART-RATE COVERAGE, NOT THE SESSION LENGTH. A strap that drops for ten minutes
 * yields a smaller total, and saying "22 of 35 min" off the session length would then be a claim about
 * time nobody measured. The surface renders these two numbers, so they must be the same population.
 */
export function timeUnderCeiling(
  hrSamples: Array<number | null | undefined>,
  ceiling: number | null,
): TimeUnderCeiling | null {
  if (!ceiling || !Array.isArray(hrSamples)) return null;
  let total = 0, under = 0;
  for (const raw of hrSamples) {
    const hr = num(raw);
    // OURS — `timeUnderCeiling` a reading above 240 bpm is a strap artefact: no outside source
    if (hr == null || hr > 240) continue; // strap artefacts are not evidence of anything
    total++;
    if (hr <= ceiling) under++;
  }
  if (total === 0) return null;
  return { pct: Math.round((under / total) * 100), under_s: under, total_s: total };
}

/**
 * Seconds spent moving with heart rate at or under the ceiling — the Execution score's numerator on an easy session
 * (`./execution-score.ts`, Garmin's time in the target range). A stop is not time in range, as a paused watch does
 * not count it; a second with no heart rate is not in range either.
 * ⚠️ `seconds` and `moving` are the caller's: a run's analyzer sample is one second (`duration_s`), a ride's is the
 * gap to the next sample on its own clock; a run passes the run pace rule's stopped line (`./run-pace.ts`), a ride
 * the same line on speed and every second when it recorded no speed at all (a trainer).
 */
export function movingSecondsUnderCeiling(
  samples: ReadonlyArray<{ seconds: number; hr: number | null | undefined; moving: boolean }>,
  ceiling: number | null,
): number | null {
  if (!ceiling || !samples.length) return null;
  let under = 0;
  for (const x of samples) {
    const dt = Number(x?.seconds);
    if (!(dt > 0) || !x.moving) continue;
    const hr = num(x.hr);
    if (hr == null || hr > 240) continue;
    if (hr <= ceiling) under += dt;
  }
  return under;
}

/** Share of sampled time at or under the ceiling, 0-100. Thin wrapper over the measurement above. */
export function timeUnderCeilingPct(
  hrSamples: Array<number | null | undefined>,
  ceiling: number | null,
): number | null {
  return timeUnderCeiling(hrSamples, ceiling)?.pct ?? null;
}
