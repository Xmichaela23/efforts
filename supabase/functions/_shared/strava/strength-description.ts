/**
 * ⛔ WHAT A SHARED LIFT LOOKS LIKE ON STRAVA — the only place that decides it (2026-09-03).
 *
 * Strava's `POST /api/v3/activities` has no structured lifting fields: a manual activity carries a
 * name, a sport type, a start time, an elapsed time and free text. So the session travels as text,
 * and this builds it. Pure functions, no client, so the wording is testable without a network.
 */
import { isPerformedStrengthSet } from '../strength/performed-set.ts';

export type StrengthSet = {
  reps?: number | null;
  weight?: number | null;
  completed?: boolean | null;
  prefilled?: boolean | null;
  duration_seconds?: number | null;
};
export type StrengthExercise = { name?: string | null; unit?: string | null; sets?: StrengthSet[] | null };

/** `strength_exercises` is a jsonb column that has been written as both an array and a string. */
export function parseExercises(raw: unknown): StrengthExercise[] {
  if (Array.isArray(raw)) return raw as StrengthExercise[];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}

/**
 * ⛔ ONE LINE PER EXERCISE, THE WAY A LIFTER WRITES IT DOWN: `Barbell Row  95 lb x 5, 95 lb x 5`.
 * ⚠️ ONLY PERFORMED SETS — `isPerformedStrengthSet` is the same predicate the analyser and the on-screen
 * receipts use, so an untouched prefill (a prescription the athlete never engaged) can never reach a
 * public feed as though it were done.
 * ⚠️ BODYWEIGHT AND TIMED WORK STILL COUNT: a pull-up has no weight, a carry has no reps, and both are
 * work. Each prints in its own shape rather than being dropped or shown as a zero.
 */
export function buildDescription(exercises: StrengthExercise[]): string {
  const lines: string[] = [];
  for (const ex of exercises) {
    const name = String(ex?.name ?? '').trim();
    if (!name) continue;
    const sets = (Array.isArray(ex?.sets) ? ex.sets : []).filter(isPerformedStrengthSet);
    if (!sets.length) continue;
    const unit = String(ex?.unit ?? 'lb').toLowerCase().startsWith('kg') ? 'kg' : 'lb';
    const parts = sets.map((s) => {
      const reps = Number(s?.reps) || 0;
      const weight = Number(s?.weight) || 0;
      const secs = Number(s?.duration_seconds) || 0;
      if (weight > 0 && reps > 0) return `${weight} ${unit} x ${reps}`;
      if (reps > 0) return `${reps} reps`;
      if (secs > 0) return `${secs}s`;
      return '';
    }).filter(Boolean);
    if (parts.length) lines.push(`${name}  ${parts.join(', ')}`);
  }
  return lines.join('\n');
}

/** The whole posted body: the lifts, the weight moved, and where it came from. */
/**
 * ⛔ THE POUNDS ARE THE APP'S ONE VOLUME, PASSED IN (2026-09-15, §8.0 #32). This file summed added weight ×
 * reps of its own, so a weighted pull-up, chin-up or dip counted the plates and not the body — the share said
 * "1,200 lb moved" where Performance and Today said 4,000. The pricing is `completedStrengthVolume`
 * (`_shared/strength/session-volume.ts`: the bar when the box is blank, bodyweight movements, bands, and
 * (body weight + added) × reps on the three assisted movements — Hevy's and Strong's rule; kilogram sets
 * convert inside it). The Strava path prices with it; the phone's share passes the number the server already
 * sent as `session_detail_v1.strength_totals.volume_lb`. The kilogram line goes with the second sum.
 */
export function shareBody(exercises: StrengthExercise[], volumeLb?: number | null): string {
  const lifts = buildDescription(exercises);
  if (!lifts) return '';
  const lb = Math.round(Number(volumeLb) || 0);
  const volLine = lb > 0 ? `${lb.toLocaleString('en-US')} lb moved` : '';
  return [lifts, '', volLine, 'Logged in Efforts · efforts.work']
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
