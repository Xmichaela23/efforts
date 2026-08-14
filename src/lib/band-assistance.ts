/**
 * ⛔ ON THIS MOVEMENT, DOES A BAND MEAN *HELP* RATHER THAN *RESISTANCE*? ONE ANSWER, BOTH SIDES.
 * SPEC-strength-language, Step 5.
 *
 * `resistance_level` on a logged set is deliberately overloaded: on a band pull-apart the band IS
 * the load; on a chin-up the band CANCELS part of it. Same field, opposite meanings, and only the
 * exercise says which. So whatever decides that has to be ONE thing — and until now it was two.
 *
 * ── THE BUG THIS EXISTS TO KILL (measured 2026-08-02) ────────────────────────────────────────────
 * The **logger** asked a substring question (`/dip|chinup|pullup/` on the de-spaced name) and the
 * **pricer** asked an exact-key question (`bandMeansAssistance`, a 3-member set keyed on
 * `canonicalize()` output). On **"Band Assisted Pull Up"** they split: the name canonicalizes to
 * `band_assisted_pull_up`, which is not in the pricer's set.
 *
 * So the logger offered the athlete an ASSIST box, they typed 40, and the pricer read that 40 as the
 * band being the LOAD. The same performed set — 5 reps, 40 lb of assistance, 180 lb athlete —
 * priced **200** instead of **700**. Not a rounding difference: a 3.5× error, driven purely by which
 * of two spellings the exercise happened to carry.
 *
 * ── WHY THE FIX IS HERE AND NOT IN `canonicalize()` ──────────────────────────────────────────────
 * ⛔ `canonicalize` IS THE PARKED Q-249 LANDMINE. It is the grouping key for `exercise_log` and the
 * State strength trend, so widening it to fold `band_assisted_pull_up` into `pullup` would silently
 * RE-GROUP the athlete's entire lifting history. The name resolver is not the thing that is wrong —
 * the GATE is. Fixed at the gate.
 *
 * ── WHY THIS RULE, AND WHAT IT COST TO CHECK ────────────────────────────────────────────────────
 * This is the LOGGER's rule, adopted as the shared one, because it was measured to be a strict
 * SUPERSET of the pricer's over a 289-name pool (config + role table + every alias string in
 * `canonicalize.ts` + hand-written variants): **zero names lost, six gained** — `band assisted pull
 * up`, `banded chin up`, `weighted dip`, `assisted pull-up`, `ring dips`. Every gain is a qualified
 * form of the same three movements. Nothing that was priced as assistance stops being.
 *
 * ⚠️ THE DIRECTION MATTERS. A superset can only turn ADD into ASSIST, never the reverse, and ASSIST
 * is the conservative side: it prices a helped set off body weight instead of off a band number.
 * Had it gone the other way, sets would have silently re-priced downward.
 *
 * ⚠️ SUBSTRING, NOT WORD-BOUNDARY, AND IT IS DELIBERATE. De-spacing is what lets "Band Assisted Pull
 * Up" match `pullup` at all. It was checked against the whole pool for false positives; there are
 * none, because no other movement name contains these three letter-runs.
 *
 * ⚠️ MIRRORS, AND MUST KEEP MIRRORING, the assistance INPUT the logger offers. If the logger ever
 * offers an assist box on a fourth movement, it gains a stem here — or a set of assisted reps starts
 * getting priced as band-only work again, which is exactly the split above.
 */

/**
 * The movements where a band is assistance. For the first three, Wendler's own progression is band
 * or machine assistance, walked down until the athlete can do clean reps at body weight.
 *
 * ⛔ `gluteham` ADDED 2026-08-13 (Michael: "glute ham raises needs a band assisted slot — like
 * chin ups, pull ups and dips"). Same shape as the others: a band anchored in front cancels part of
 * the athlete's weight, and walking the tension down is the progression. Measured before adding,
 * per this file's own method: over the full name pool (config + role table + assistance catalog)
 * the stem hits exactly the two GHR spellings and nothing else. ⚠️ The pull-up progression's chin
 * counter is unaffected — it filters on /chin|pull up/ BEFORE asking `isAssistedSet`.
 */
export const BAND_ASSIST_STEMS = ['pullup', 'chinup', 'dip', 'gluteham'] as const;

/**
 * Does a band on THIS movement mean help rather than resistance?
 *
 * Accepts either a raw display name ("Band Assisted Pull Up") or a canonical key
 * (`band_assisted_pull_up`) — punctuation, spacing and case are stripped before the test, so both
 * forms land on the same answer. That is the whole point: the two sides were passing different
 * spellings of the same movement and getting different answers.
 */
export function isBandAssistedMovement(name: string): boolean {
  const tight = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!tight) return false;
  return BAND_ASSIST_STEMS.some((stem) => tight.includes(stem));
}
