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

/** Total weight moved, kept in whichever units each exercise was logged in — never silently converted. */
export function totalVolume(exercises: StrengthExercise[]): { lb: number; kg: number } {
  let lb = 0;
  let kg = 0;
  for (const ex of exercises) {
    const isKg = String(ex?.unit ?? 'lb').toLowerCase().startsWith('kg');
    for (const s of (Array.isArray(ex?.sets) ? ex.sets : []).filter(isPerformedStrengthSet)) {
      const v = (Number(s?.weight) || 0) * (Number(s?.reps) || 0);
      if (v <= 0) continue;
      if (isKg) kg += v; else lb += v;
    }
  }
  return { lb: Math.round(lb), kg: Math.round(kg) };
}

/** The whole posted body: the lifts, the weight moved, and where it came from. */
export function shareBody(exercises: StrengthExercise[]): string {
  const lifts = buildDescription(exercises);
  if (!lifts) return '';
  const vol = totalVolume(exercises);
  const volLine = [
    vol.lb > 0 ? `${vol.lb.toLocaleString('en-US')} lb moved` : '',
    vol.kg > 0 ? `${vol.kg.toLocaleString('en-US')} kg moved` : '',
  ].filter(Boolean).join(' · ');
  return [lifts, '', volLine, 'Logged in Efforts · efforts.work']
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
