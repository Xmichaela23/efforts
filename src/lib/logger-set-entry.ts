/**
 * ⛔ THE SET ROW'S ENTRY RULES — what Next walks, and what the check fills (2026-09-24,
 * docs/WORKORDER-logger-set-entry-2026-09-24.md §1 and §2).
 *
 * Two rules the logger's row and its check share, kept here so the two cannot drift and so each empty-box
 * case has a fixture. Both read the row AS RENDERED: the boxes the grid drew and the grey number each empty
 * box shows. Neither knows a movement name or a plan — the row answers those before it asks.
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/logger-set-entry.test.ts
 *
 * FIELD — Strong and Hevy, as the work order states them: the keypad's confirm on a field is "Next" and opens
 * the same set's next field; the check fills an empty field from the greyed value its placeholder shows.
 */

/** The keypad's four fields, as `StrengthLogger` names them (`KeypadField`). */
export type KeypadField = 'reps' | 'weight' | 'rir' | 'band';

/**
 * The boxes one set row renders, in the order the athlete fills them: the load first, then reps, then RIR.
 *   `load`  — 'weight' is the plain weight cell; 'assist' is the assist-capable pair (band help left, added
 *             weight right); 'band' is a band's load; null is no load box (bodyweight, plyo, an unloaded hold).
 *   `reps`  — the reps cell renders a keypad button (a duration hold renders a clock instead; an "until"
 *             row with nothing to type renders no cell).
 *   `rir`   — the RIR column renders on this exercise and the set is not a hold.
 */
export type SetBoxes = {
  load: 'weight' | 'assist' | 'band' | null;
  reps: boolean;
  rir: boolean;
};

/**
 * ⛔ THE BOXES AFTER `from` ON THIS ROW — the ones Next opens, in order. Where a box does not exist (a
 * bodyweight row has no weight box; a heavy row has no RIR column) it is skipped, and an empty answer means
 * the confirm is the last one: it commits and closes.
 * ⚠️ The load box is never a "next": it is the first box on every row that has one, and the assist pair's
 * two halves are mutually exclusive by construction (typing one clears the other), so Next from either half
 * goes to reps, not to the other half.
 */
export function keypadChainAfter(boxes: SetBoxes, from: KeypadField): Array<'reps' | 'rir'> {
  const later: Array<'reps' | 'rir'> = [];
  if (from === 'weight' || from === 'band') {
    if (boxes.reps) later.push('reps');
    if (boxes.rir) later.push('rir');
  } else if (from === 'reps') {
    if (boxes.rir) later.push('rir');
  }
  return later;
}

/** What the row knows about its two number boxes at the moment the check is tapped. */
export type CheckFillInput = {
  boxes: SetBoxes;
  /** The weight box holds no number (0 or unset). */
  weightEmpty: boolean;
  /** The greyed suggestion the plain weight cell shows over an empty box (D-406 `weight_suggested`), else null. */
  weightGhost: number | null;
  /** `repsAreBlank(set)` — no count, and no typed zero. */
  repsBlank: boolean;
  /** What the empty reps cell shows: the row's target as printed ("8", "6-12", "25 total"), or null. */
  repsPlaceholder: string | null;
  /** A measurement set — the AMRAP top set, a rep-max test, any set of the baseline test or the retest. */
  isTest: boolean;
  isWarmup: boolean;
  isDuration: boolean;
};

export type CheckFillResult = {
  /** Written onto the set with the completion — only numbers the athlete saw in the box. */
  fill: { weight?: number; reps?: number };
  /** The box the check must open instead of completing, or null. */
  block: 'reps' | null;
};

/**
 * ⛔ WHAT THE CHECK DOES WITH AN EMPTY BOX (§2).
 *   · weight, empty, grey suggestion shown  → filled with the suggestion (the athlete saw it)
 *   · weight, empty, nothing shown          → completes as before (a load of nothing is a claim the row can
 *                                             already make: a bodyweight movement the catalogue does not know
 *                                             renders a weight box and is logged at 0)
 *   · reps, empty, a number shown           → filled with the number
 *   · reps, empty, a band ("6-12"), a total ("25 total"), "AMRAP", or nothing → blocks; the reps keypad opens
 *   · a measurement set never fills reps: the count IS the result
 *   · a warm-up set and a hold are exempt, as they were (the ramp's reps are hint text; a hold records seconds)
 * RIR is not here: an empty RIR box already has its own prompt on the check (the adjust strip in
 * `handleSetComplete`), and a second one would be a double ask.
 * ⚠️ Nothing is written that was not on screen: the fill is the ghost or the printed target, never a guess.
 */
export function checkFillFor(i: CheckFillInput): CheckFillResult {
  const fill: CheckFillResult['fill'] = {};
  if (i.boxes.load === 'weight' && i.weightEmpty && i.weightGhost != null && Number.isFinite(i.weightGhost) && i.weightGhost > 0) {
    fill.weight = i.weightGhost;
  }
  if (i.isDuration || i.isWarmup || !i.repsBlank) return { fill, block: null };
  if (i.isTest) return { fill, block: 'reps' };
  const text = String(i.repsPlaceholder ?? '').trim();
  const n = /^\d+$/.test(text) ? parseInt(text, 10) : NaN;
  if (Number.isFinite(n) && n > 0) {
    fill.reps = n;
    return { fill, block: null };
  }
  return { fill, block: 'reps' };
}
