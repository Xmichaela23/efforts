/**
 * THE definition of a PERFORMED strength set. One source. (D-204, extended by Q-178.)
 *
 * Extracted out of `analyze-strength-workout/index.ts` on 2026-07-13 so it can be pin-tested.
 * D-204 already made it "a single source" by centralizing 6 duplicated copies inside that file;
 * this finishes the job by giving it a home and a fixture. **Do not re-inline it, and do not add
 * a second copy.**
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────────────────────────
 *   A set is PERFORMED iff it carries real WORK — and never if it is an untouched prefill.
 *
 *   The `completed` flag records that the athlete TOUCHED the row.
 *   It does NOT outrank the fact that they logged NOTHING.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THE `completed === true ||` SHORT-CIRCUIT WAS REMOVED (Q-178, found on the live account):
 *
 *   A Farmers Carry set was saved as **"0 reps (RIR 3)"**. D-203 makes "Done" auto-save the
 *   *suggested* RIR so logging stays friction-free — so that row carried `completed: true` and
 *   `rir: 3` while `reps` stayed **0**. The old predicate short-circuited on the flag and called
 *   it PERFORMED. Consequences, all real, all on one screen:
 *
 *     • the exercise MATCHED → D-208's role-weighted exercise-completion (30% of the score) paid
 *       out in full for a lift the athlete did ZERO reps of
 *     • the session scored **98% · Strong**
 *     • the fact packet told the LLM the exercise was performed, and it faithfully wrote
 *       *"sets landed on target across all three lifts"*
 *
 *   That last one is the real damage. `narrative-core/validate.ts` validates prose against the
 *   FACTS — so it cannot catch a lie that is already IN the facts. The LLM containment is sound
 *   and only as honest as the packet. Corrupt the packet and the guard becomes a laundering step.
 *
 * THIS EXTENDS D-204 RATHER THAN REVERSING IT. D-204 ruled that an auto-filled RIR is
 * *"no effort signal, never on target."* A zero-rep set is no effort either. Provenance beats flags.
 *
 * BODYWEIGHT AND TIME-BASED WORK STILL COUNT. The test is "did any WORK get logged", not "was a
 * weight logged": bodyweight = (weight 0, reps > 0) ✅ · carries/planks = (reps 0, duration > 0) ✅.
 */
export interface PerformedSetLike {
  completed?: boolean | null;
  prefilled?: boolean | null;
  reps?: number | null;
  weight?: number | null;
  duration_seconds?: number | null;
}

export function isPerformedStrengthSet(s: PerformedSetLike | null | undefined): boolean {
  // An untouched prefill is the prescription the athlete never engaged — not a performed set,
  // even though it carries the prescribed reps/weight. (D-204.)
  if (s?.completed !== true && s?.prefilled === true) return false;

  // Did any WORK get logged? The flag alone is not work. (Q-178.)
  return (s?.reps != null && s.reps > 0) ||
    (s?.weight != null && s.weight > 0) ||
    (s?.duration_seconds != null && s.duration_seconds > 0);
}
