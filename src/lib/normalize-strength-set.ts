/**
 * ⛔ THE ONE SHAPE FOR "A COMPLETED STRENGTH SET, HANDED TO THE CLIENT" (2026-08-11).
 *
 * Read by the SERVER hydrators (`get-week`, `workout-detail` scope=workout AND scope=session) and by
 * the client reconstructions (`StrengthPerformanceSummary`, `StrengthCompletedView`). Five copies of
 * this job existed, each a HAND-LISTED whitelist — `{reps, weight, rir, completed, prefilled}` — and
 * every one of them silently dropped whatever the logger had started writing that wasn't on its list.
 * That is exactly how band assist vanished: `resistance_level` is saved on every dip/chin/pull-up set,
 * and the object that WINS the mobile merge (`workout-detail` scope=workout → `hydratedCompleted`,
 * which overrides the get-week row) rebuilt the set without it, so Performance showed "10 reps" with
 * no assist no matter what any downstream reader did. `amrap` and `duration_seconds` were lost the
 * same way on the paths that rebuilt sets by hand.
 *
 * ── THE RULE: SPREAD FIRST, COERCE THE KNOWN FIELDS ON TOP ─────────────────────────────────────
 *
 * A new field added at the logger survives to the screen by default — a reader has to go out of its
 * way to LOSE data, not to keep it. The known numeric/boolean fields are still coerced to stable
 * types so consumers can trust them (`typeof s.rir === 'number'`, `s.weight > 0`), but everything
 * else — `resistance_level`, `amrap`, `duration_seconds`, `difficulty`, `weight_display`, any future
 * addition — rides through untouched.
 *
 * ⚠️ THIS IS SHAPE ONLY, NOT FILTERING. The D-204 "drop untouched prefills" rule is a SEPARATE
 * question (`isUntouchedPrefill` below), because the server paths deliberately DON'T filter — they
 * carry `prefilled`/`completed` through and let the client decide (StrengthCompareTable filters on
 * its own). Only the surfaces that want a performed-only receipt (StrengthCompletedView) filter.
 * Keep the two questions apart or a server hydrator starts hiding sets a client still needs to grade.
 *
 * ⚠️ PURE MODULE, DENO + BROWSER. No imports, no platform APIs — the server reaches it by relative
 * path (`../../../../src/lib/normalize-strength-set.ts`) exactly as it reaches `assistance-slot.ts`,
 * and the client by `@/lib/normalize-strength-set`. A private copy on either side re-opens this bug.
 */

/**
 * The completed-set contract. The named fields are the ones readers coerce and depend on; the index
 * signature is the whole point of this file — any field the logger writes (and any it writes NEXT)
 * rides through, so a reader can never lose data by accident. Kept in sync with what
 * `StrengthCompareTable.fmt()` reads: reps / weight / weight_display / rir / amrap / duration_seconds
 * / resistance_level, plus `difficulty` (the top-set word) and the D-204 `prefilled`/`completed` flags.
 */
export interface CompletedStrengthSet {
  reps: number;
  weight: number;
  rir?: number;
  completed: boolean;
  prefilled: boolean;
  resistance_level?: number;
  amrap?: boolean;
  duration_seconds?: number;
  weight_display?: string;
  difficulty?: string;
  [key: string]: any;
}

/** Coerce one completed set to the client shape WITHOUT dropping any field it arrived with. */
export function normalizeCompletedStrengthSet(set: unknown): CompletedStrengthSet {
  if (!set || typeof set !== 'object') {
    return { reps: 0, weight: 0, completed: false, prefilled: false };
  }
  const s = set as Record<string, any>;
  return {
    // Everything the set carried — resistance_level, amrap, duration_seconds, difficulty,
    // weight_display, and anything the logger adds next — survives by default.
    ...s,
    // The known fields, coerced to the types consumers rely on.
    reps: Number(s.reps ?? 0) || 0,
    weight: Number(s.weight ?? 0) || 0,
    rir: typeof s.rir === 'number' ? s.rir : undefined,
    completed: Boolean(s.completed),
    // D-204: preserve prefill provenance so readers can drop untouched prefills.
    prefilled: Boolean(s.prefilled),
  };
}

/**
 * The completed-exercise wrapper, same rule. Spread-first so exercise-level facts the readers
 * consume — `substituted_for` (Q-181 declared swap), `set_plan`, `load_prescribed` — survive the
 * hydration instead of being whitelisted off. `sets` is always the normalized array; a legacy
 * compact shape (`sets` as a count) is expanded into that array so no consumer sees two shapes.
 */
export function normalizeCompletedStrengthExercise(exercise: unknown, index: number): any {
  const ex = (exercise && typeof exercise === 'object') ? exercise as Record<string, any> : {};
  const rawSets = ex.sets;
  const sets = Array.isArray(rawSets)
    ? rawSets.map(normalizeCompletedStrengthSet)
    : Array.from({ length: Math.max(1, Number(ex.sets || 0)) }, () =>
        normalizeCompletedStrengthSet({ reps: Number(ex.reps || 0) || 0, weight: Number(ex.weight || 0) || 0, completed: false }));
  return {
    ...ex,
    id: ex.id || `temp-${index}`,
    name: ex.name || '',
    sets,
    reps: Number(ex.reps || 0) || 0,
    weight: Number(ex.weight || 0) || 0,
    notes: ex.notes || '',
    weightMode: ex.weightMode || 'same',
  };
}

/**
 * D-204: a pure untouched prefill — the prescription pre-filled into the logger that the athlete
 * never engaged (`completed !== true && prefilled === true`). ONE definition so every surface that
 * wants a performed-only receipt draws the same line; legacy sets that predate the flag lack it and
 * are kept. Shape and filtering are separate on purpose — see the note at the top of this file.
 */
export function isUntouchedPrefill(set: unknown): boolean {
  if (!set || typeof set !== 'object') return false;
  const s = set as Record<string, any>;
  return s.completed !== true && s.prefilled === true;
}
