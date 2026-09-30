/**
 * ⛔ A BODYWEIGHT MOVEMENT THAT TAKES A PLATE (Michael, 2026-09-29: "back extension needs a add weight option" —
 * "it should behave like any other single weightload excercise no? like goblet?"). ONE ANSWER, BOTH SIDES.
 *
 * The logger draws these rows a weight box like the goblet squat's (the "Lb" column, one box, the number typed is
 * the plate held), and the pricer counts `(body weight + plate) × reps` — the same shape a weighted chin-up already
 * prices (D-351). Priced as the plate alone, a set holding 25 lb would score below the same set with no plate.
 * An empty box is legal: the set is body weight alone, priced as before.
 *
 * ⚠️ NOT THE ASSIST ROW. `band-assistance.ts` covers movements where a band or machine HELPS (pull-up, chin-up, dip,
 * GHR) and draws two boxes. Nobody assists a back extension; it is made easier with the bench angle, not a band.
 *
 * ⚠️ EXACT OR FOLDED NAMES ONLY. A fuzzy match is a guess at a neighbour (`resolveExerciseConfig`'s own warning), and
 * `machine back extension` is its own movement with its own weight box (the pad is the load, not the body).
 *
 * FIELD: Hevy and Strong price weighted bodyweight work as `(body weight + added) × reps` — the note on the chin-up
 * clause in `supabase/functions/_shared/workload.ts` `strengthSetVolume`.
 */
import { resolveExerciseConfig } from './exercise-config.ts';

/** Config keys where the body is the load and a held plate adds to it. `back extension` resolves here (SAME_MOVEMENT). */
export const ADDED_WEIGHT_KEYS: ReadonlySet<string> = new Set(['ghd back extension']);

export function takesAddedWeight(name: string): boolean {
  const r = resolveExerciseConfig(String(name ?? ''));
  if (r.via !== 'exact' && r.via !== 'folded') return false;
  return r.matchedKey != null && ADDED_WEIGHT_KEYS.has(r.matchedKey);
}
