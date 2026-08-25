/**
 * WHAT THE BLOCK ASKS OF THE BARBELL — one number, derived from the frame.
 *
 * ⛔ THE ATHLETE SHOULD KNOW WHAT IS OWED BEFORE THEY REACH THE DAY PICKER (Michael, 2026-08-25).
 * Strong Focus is chosen on step 4 and the lifting days are not named until step 7's week list, so
 * the commitment that defines the block was the last thing on screen rather than the first.
 *
 * ⛔⛔ DERIVED FROM THE FRAME'S OWN COLUMN, NOT FROM `Frame.liftingDays` AND NOT HARDCODED.
 * `liftingDays: 4` is a declared field beside the table it describes, so it is a second statement of
 * the same fact and can drift from it — exactly the doubled disease this repo keeps deleting. The
 * column is what `compose.ts` actually emits sessions from, so counting it cannot be wrong.
 * ⚠️ Measured 2026-08-25: the declared field and the derived count agree at 4 for `strength_5k`,
 * standard and taper. If they ever disagree, the column is right and the field is stale.
 *
 * ⚠️ THERE IS NO 3-DAY STACKED FALLBACK ON THIS PATH TODAY. `generate-strength-plan:1003` says so
 * outright — *"SPEC §1 — four days, locked. No 3-day option in V1."* The derivation below returns
 * whatever the frame carries, so a 3-day frame added later needs no change here; nothing is pinned
 * to four.
 */
// ⚠️ RELATIVE, NOT `@shared` — the alias is Vite's and does not resolve under `deno test`, which is
// where this file's agreement-with-the-frame test runs. Same reason as `standing-plan-week-bounds`.
import { FRAMES } from '../../supabase/functions/_shared/standing-plan/index.ts';

/** Days in a frame column that carry at least one barbell session. */
export function liftingDaysForFrame(frameId: keyof typeof FRAMES = 'strength_5k'): number {
  const frame = FRAMES[frameId];
  if (!frame) return 0;
  return frame.columns.standard.filter((d) => (d.strength?.length ?? 0) > 0).length;
}

/** `4` → `'Four'`. Small numbers read as words in a sentence; the summary line keeps the digit. */
const WORD: Record<number, string> = {
  1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
};

/**
 * ⛔ THE LINE ON THE CHOOSING STEP. COPY-VOICE: a fact and its consequence, no imperative, no
 * encouragement, no second person as the subject of an obligation.
 *
 * ⚠️ "FITS AROUND THEM" IS THE BLOCK'S ACTUAL SHAPE, not a reassurance — the lifting is the spine
 * and `compose.ts` places the endurance into what the frame leaves, which is the same sentence the
 * week step's rules section makes. ⛔ Do not soften it to "should fit" or warm it with "don't
 * worry": both were considered and both are the register this app does not use.
 */
export function liftingCommitmentLine(frameId: keyof typeof FRAMES = 'strength_5k'): string | null {
  const n = liftingDaysForFrame(frameId);
  if (n <= 0) return null;
  return `${WORD[n] ?? n} lifting days a week. Your endurance fits around them. `
    + 'Riding has less impact on lift gains than running.';
}
