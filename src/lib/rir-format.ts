// RIR target rendering — one source for how a prescribed target RIR is shown to the athlete.
//
// The engine grades against a precise numeric target (which can be a half-step midpoint, e.g. 2.5 —
// a legitimate field convention: it maps to RPE 7.5 in the RTS/Tuchscherer 0.5-increment system, and
// reads naturally as the "2-3 reps in reserve" range used in RP/hypertrophy programming). But the
// LOGGER is integer-based (you log whole reps in reserve), so:
//   - display a half-step target as its bracket ("2-3"), a whole target as itself ("2"), 5+ capped;
//   - a half-step target highlights BOTH bracketing pills (2 and 3), a whole target highlights one;
//   - any LOGGED value seeded from the target is rounded to a whole rep.

/** How a target RIR renders as TEXT. Half-steps become a bracket range; whole numbers stay single. */
export function formatRirTarget(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 5) return '5+';
  if (Number.isInteger(n)) return String(n);
  return `${Math.floor(n)}-${Math.ceil(n)}`;
}

/** Which integer pills count as "the suggested target" — the bracket for a half-step, one for a whole. */
export function rirSuggestedIntegers(n: number | null | undefined): number[] {
  if (n == null || !Number.isFinite(n)) return [];
  if (n >= 5) return [5];
  if (Number.isInteger(n)) return [n];
  return [Math.floor(n), Math.ceil(n)];
}

/** A whole-rep value to seed a LOGGED set from a (possibly half-step) target. `Math.round` rounds a
 *  .5 tie UP (toward more reps in reserve), so an unconfirmed auto-fill never errs toward grinding. */
export function rirLoggedSeed(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.min(5, Math.round(n));
}
