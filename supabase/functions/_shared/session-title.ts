/**
 * ⛔ ONE TITLE FOR A PLANNED SESSION, SENT BY THE SERVER TO EVERY READER (2026-09-18, book-language pass 1, audit
 * item 29).
 *
 * The calendar sync sent "Maximum Effort: Upper" / "Ride — Endurance" to Garmin and Intervals.icu, while the manual
 * Garmin send, the plan download (`plans.csv`) and State's NEXT row sent the stored name ("ME: Upper" / "Ride").
 * They all read this now: the stored name with a lifting day's intent spelled as the book spells it
 * (`intent-title.ts`, p219) and a bare "Run" / "Ride" upgraded the way every screen already upgrades it
 * (`src/lib/derive-workout-title.ts`).
 *
 * ⚠️ DISPLAY ONLY. The stored name is unchanged; nothing may match on this string.
 */
import { deriveWorkoutTitle, type WorkoutLike } from '../../../src/lib/derive-workout-title.ts';
import { intentTitle } from './intent-title.ts';

export function sessionTitle(row: (WorkoutLike & { name?: string | null }) | null | undefined): string {
  if (!row) return deriveWorkoutTitle(row);
  return deriveWorkoutTitle({ ...row, intent_title: intentTitle(row?.name) || null });
}
