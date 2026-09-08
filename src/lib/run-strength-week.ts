/**
 * ⛔⛔ THE RUN + STRENGTH WEEK'S NUMBERS — the pure half of `RunStrengthWeekCard`
 * (`WORKORDER-run-strength-rotate-2026-09-07.md`).
 *
 * ⛔ IT IS A LIB FILE SO A TEST CAN CALL IT. The card is JSX behind the `@/` alias, which is Vite's
 * and does not resolve under `deno test` — the same reason `standing-plan-week-bounds.ts` imports
 * the engine relatively and says so. **A rule about which lengths may be offered has to be runnable,
 * because the whole claim is that every offered length is one the composer builds.**
 */
import { slotLengthOptions } from './standing-plan-week-bounds';
import type { SlotSelection } from './standing-plan-week-copy';
import type { FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';

/**
 * ⛔ THE LONG RUN'S CEILING ON THIS SCREEN — 90 minutes, and p247's own cap is 100. The chips stop
 * one rung short so the cap is never touched by a default (Michael, 2026-09-07). The rung values
 * themselves are the LIBRARY'S — `slotLengthOptions` returns the lengths the composer can build
 * exactly, and offering anything else would be the screen promising a session the plan does not
 * contain.
 */
export const LONG_RUN_CHIP_CEILING_MIN = 90;
/** ⛔ THE DEFAULT LENGTH, Michael's own: the middle chip. Falls back to the middle of whatever the
 *  ladder offers, so a library change moves the default with it rather than stranding it. */
export const LONG_RUN_DEFAULT_MIN = 75;
/**
 * ⛔ THE EASY RUN IS LOCKED AT 30 MINUTES — p246's VT1 slot at level 1, whose ladder is 25 to 30
 * (p235: *"the level refers almost strictly to duration"*). The row states it and asks nothing.
 * ⚠️ 30 IS THE TOP OF THAT RUNG AND IT BUILDS EXACTLY, measured through `rungForMinutes`: the ask
 * resolves inside the slot's own ladder, so this is a length the composer delivers rather than one
 * it rounds away.
 */
export const EASY_RUN_FIXED_MIN = 30;

/**
 * ⛔ THE SECOND LINE — what the screen leaves open, and what it does not. Fact-first, no imperative
 * beyond the one control's own name, no author on the screen.
 * ⚠️ THE 30 IS READ FROM THE CONSTANT the row is built from, so the sentence and the session cannot
 * come apart. The header above it is `runWeekCommitmentLine`, counted off the frame.
 */
export const RUN_STRENGTH_WEEK_SUB =
  `Pick how long the long run is. The easy run is ${EASY_RUN_FIXED_MIN} minutes. `
  + 'The two hard runs rotate.';

/**
 * ⛔ THE LENGTHS THE LONG-RUN CHIPS OFFER. The ladder's own options, capped at 90.
 * ⚠️ EVERY ONE OF THEM BUILDS EXACTLY. `slotLengthOptions` exists because the ladder has GAPS —
 * a round number between two rungs is a length the engine will not build, and a chip offering one
 * would be the ask-15-get-20 defect in a new place. Measured 2026-09-07 for `run_lsd` level 2: the
 * rung runs 68 to 100 minutes, so the honest chips are **68, 75 and 90**. A 60-minute chip was
 * named in the work order and is NOT offered: 60 sits below the rung's floor and builds 68, which
 * is the screen promising an hour and the plan delivering more.
 */
export function longRunLengthOptions(
  slots: SlotSelection,
  opts: { baselines?: unknown; frame?: FrameId },
): number[] {
  const lengths = slotLengthOptions('long', slots, {
    baselines: opts.baselines as never, frame: opts.frame ?? 'strength_5k',
  });
  return (lengths?.options ?? []).filter((m) => m <= LONG_RUN_CHIP_CEILING_MIN);
}

/** ⛔ THE CHIP THAT OPENS SELECTED. The ruled default where the ladder offers it, else its middle. */
export function longRunDefaultMinutes(options: number[]): number | null {
  if (options.length === 0) return null;
  if (options.includes(LONG_RUN_DEFAULT_MIN)) return LONG_RUN_DEFAULT_MIN;
  return options[Math.floor((options.length - 1) / 2)];
}
