// ============================================================================
// STRENGTH FREQUENCY POLICY  (Q-088 / D-220)
//
// The SINGLE owner of "how many strength sessions per week is this athlete
// allowed". Replaces the `2 | 3` literal that the concurrent-matrix audit found
// scattered 5-deep across the chassis (see
// docs/AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md).
//
// Freq-4 is a strength-focus MODE, gated on ENDURANCE posture: the interference
// budget scales with endurance recovery load (Rønnestad — a strength develop
// block pairs with a ~20–30% reduction in concurrent endurance volume). So a
// 4-day strength week is only legal when endurance is NOT itself developing.
//
// Spec: docs/SPEC-q088-freq4-run-path.md.
// ============================================================================

/**
 * The authoritative per-discipline posture enum — matches
 * `sanitizePerDisciplinePosture` (create-goal-and-materialize-plan/non-race-routing.ts),
 * whose allowlist is exactly {develop, maintain, out}. There is NO `parked` /
 * `none` / `maintenance` value — a wrong string here would silently fall to the
 * develop ceiling (3), which is the safe direction but masks an intent.
 */
export type EndurancePosture = 'develop' | 'maintain' | 'out';

/**
 * The strength-frequency ceiling for a given endurance posture.
 * - `develop`  → 3: concurrent ceiling. A 4th strength day competes with the
 *   develop endurance block's recovery (tri is further capped at 2 elsewhere).
 * - `maintain` → 4: endurance is held, not developed → budget for a 4-day split.
 * - `out`      → 4: endurance parked entirely → full strength-focus.
 * Absent / unknown posture defaults to `develop` (the safe, concurrent ceiling)
 * so a missing or misspelled string can never silently unlock freq-4.
 */
export function strengthFrequencyCeiling(posture?: EndurancePosture | string | null): 0 | 1 | 2 | 3 | 4 {
  switch (posture) {
    case 'maintain':
    case 'out':
      return 4;
    case 'develop':
      return 3;
    default:
      return 3; // absent / unknown ≡ develop (safe)
  }
}

/**
 * Clamp a requested strength frequency to what the endurance posture allows.
 *
 * Provably a NO-OP for every requested ≤ 3: `min(req, 3) === req` and
 * `min(req, 4) === req` for all `req ≤ 3`, regardless of posture. So existing
 * plans stay byte-identical; the gate only ever PERMITS a 4 to survive, and only
 * when endurance is `maintain` / `out`.
 */
export function effectiveStrengthFrequency(
  requested: number,
  posture?: EndurancePosture | string | null,
): number {
  const req = Number.isFinite(requested) ? requested : 0;
  return Math.min(req, strengthFrequencyCeiling(posture));
}
