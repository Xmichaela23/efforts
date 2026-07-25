/**
 * THE planned↔executed matcher for strength. One source. (Q-181.)
 *
 * Extracted out of `analyze-strength-workout/index.ts` on 2026-07-14 so it can be pin-tested.
 * **This is the core of every strength execution score.** Do not write a second matcher.
 *
 * ── THE RULE (Q-181) ──────────────────────────────────────────────────────────────────────────
 *   THE SLOT IS THE UNIT OF ADHERENCE, NOT THE EXERCISE NAME.
 *
 *   A DECLARED swap is not a skip. An exercise that simply DIDN'T HAPPEN still is.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY. Matching was BY NAME ONLY (exact, then a fuzzy `includes()`), and no substitution concept
 * existed anywhere in the codebase. So an honest swap — hip thrust instead of the planned Bulgarian
 * split squat — was read as TWO separate failures:
 *
 *   the planned lift   -> matched:false  -> a SKIP, dragging the 30%-weighted exercise-completion term
 *   the work he DID    -> planned:null   -> dropped from the denominator. ZERO CREDIT.
 *
 * Penalised for what he didn't do, and unpaid for what he did. The app could not tell a substitution
 * from a skip BECAUSE NOBODY EVER TOLD IT.
 *
 * FIELD STANDARD (researched 2026-07-14; see docs/SPEC-exercise-substitution.md §2): no commercial
 * strength app treats the EXERCISE as the unit of adherence — they treat the SLOT (the movement pattern
 * the program prescribed). ABC Trainerize's substitution filters are literally "Same muscle group /
 * Same Equipment / Same movement". Fitbod auto-substitutes same-muscle at equivalent intensity. RP
 * Hypertrophy swaps mid-cycle from a library. Built with Science swaps "while keeping the plan
 * structurally sound." **Swap within the slot and NOTHING WAS MISSED — so no app docks you for it.**
 *
 * THE DECLARATION IS WHAT MAKES IT A SWAP. `substituted_for` is written by the athlete's Swap action
 * (mirroring the `prefilled` / `rir_autofilled` / `from_previous` provenance pattern: a flag that
 * records HOW WE KNOW, stamped at the point of truth). **We never INFER a substitution** — if the
 * athlete just logs a different exercise with no declaration, that is an unplanned exercise PLUS a
 * skip, and it must read that way. (Law 2: ask, don't guess.)
 */

export interface MatchableExercise {
  name?: string;
  /** Q-181: set by the athlete's Swap action — the PLANNED exercise name this replaces. */
  substituted_for?: string | null;
  [k: string]: unknown;
}

export interface ExerciseMatch {
  name: string;
  planned: unknown | null;
  executed: unknown | null;
  matched: boolean;
  /** Q-181: true when this match exists only because the athlete DECLARED a swap. */
  substituted?: boolean;
  /** Q-181: what the athlete actually did, when it differs from the planned name. */
  substituted_with?: string;
}

/** Normalize exercise names for matching. Strips punctuation, so "Farmer's Carry" === "Farmers Carry". */
export function normalizeExerciseName(name: string): string {
  return String(name || '').toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\b(curls?|curl)\b/gi, 'curl')
    .replace(/\b(squats?|squat)\b/gi, 'squat')
    .replace(/\b(deadlifts?|deadlift)\b/gi, 'deadlift')
    .replace(/\b(nordic\s*curl|nordic)\b/gi, 'nordic curl');
}

/** Flat planned shape → the nested {sets: []} shape the executed side uses. */
export function normalizePlannedExercise(planned: any): any {
  if (Array.isArray(planned?.sets)) return planned;

  const numSets = typeof planned?.sets === 'number' ? planned.sets : 0;
  // D-316: parse, don't pass through. A rep RANGE ("5-8") would otherwise land in
  // LoggedSet.reps as a STRING and leak a non-numeric into every downstream consumer.
  const reps = typeof planned?.reps === 'number'
    ? planned.reps
    : (Number.parseInt(String(planned?.reps ?? ''), 10) || 0);
  const weight = typeof planned?.weight === 'number' ? planned.weight : 0;
  const durationSeconds = planned?.duration_seconds || null;
  const rir = planned?.rir || null;

  const sets = [];
  for (let i = 0; i < numSets; i++) {
    sets.push({ reps, weight, duration_seconds: durationSeconds, rir, completed: false });
  }
  return { ...planned, sets };
}

export function matchExercises(
  plannedExercises: any[],
  executedExercises: any[],
): ExerciseMatch[] {
  const planned = Array.isArray(plannedExercises) ? plannedExercises : [];
  const executed = Array.isArray(executedExercises) ? executedExercises : [];
  const matches: ExerciseMatch[] = [];
  const consumed = new Set<unknown>();

  for (const p of planned) {
    const normalizedPlanned = normalizePlannedExercise(p);
    const plannedName = normalizeExerciseName(p?.name);

    // ── Q-181, TIER 0: A DECLARED SWAP WINS OVER EVERYTHING ─────────────────────────────────────
    // Checked BEFORE the name match, on purpose. The athlete told us what this replaces; that is the
    // strongest signal available and it outranks any string heuristic.
    let exec = executed.find((e) =>
      !consumed.has(e) &&
      e?.substituted_for &&
      normalizeExerciseName(String(e.substituted_for)) === plannedName
    );
    if (exec) {
      consumed.add(exec);
      matches.push({
        name: p?.name,
        planned: normalizedPlanned,
        executed: exec,
        matched: true,          // NOT a skip. The slot was filled.
        substituted: true,
        substituted_with: String(exec?.name ?? ''),
      });
      continue;
    }

    // Tier 1: exact name.
    exec = executed.find((e) => !consumed.has(e) && normalizeExerciseName(e?.name) === plannedName);

    // Tier 2: fuzzy contains (legacy behaviour — preserved).
    if (!exec) {
      exec = executed.find((e) => {
        if (consumed.has(e)) return false;
        const en = normalizeExerciseName(e?.name);
        return !!en && !!plannedName && (en.includes(plannedName) || plannedName.includes(en));
      });
    }

    if (exec) {
      consumed.add(exec);
      matches.push({ name: p?.name, planned: normalizedPlanned, executed: exec, matched: true });
    } else {
      // ⛔ THE GUARD. An exercise that simply did not happen is STILL A SKIP. A swap the athlete
      // DECLARED is forgiven; a miss is not. Forgiving a real skip would be a score that lies in the
      // athlete's favour — the exact failure mode CANON-arc-inference-model.md exists to prevent, and
      // a far worse bug than the one Q-181 fixes.
      matches.push({ name: p?.name, planned: normalizedPlanned, executed: null, matched: false });
    }
  }

  // Executed exercises that answered to nothing planned → genuinely unplanned extra work.
  for (const e of executed) {
    if (consumed.has(e)) continue;
    matches.push({ name: String(e?.name ?? ''), planned: null, executed: e, matched: false });
  }

  return matches;
}
