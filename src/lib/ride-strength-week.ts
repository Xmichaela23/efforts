/**
 * ⛔ THE RIDE + STRENGTH WEEK SCREEN'S FACTS AND WORDS (WORKORDER-ride-strength-2026-09-13 §4).
 *
 * Kept out of the card so a test can run them: no React, no path aliases. The rows are `frameSlots`,
 * the names are the plan's own session names (`FAMILY_LABEL`), and which ride a four-ride week leaves
 * out is the frame's declaration (`Frame.fewerRidesDropsSlot`). Nothing here names a frame.
 */
import { frameSlots, type FrameSlot } from './standing-plan-week-copy.ts';
import { FAMILY_LABEL } from '../../supabase/functions/_shared/standing-plan/session-vocabulary.ts';
import { FRAMES, type FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';
import type { FamilyId } from '../../supabase/functions/_shared/endurance-library/index.ts';

/** ⛔ APPROVED (Michael, 2026-09-13). The plan does not lengthen easy rides; the athlete may (p137, p275). */
export const EASY_RIDE_LONGER_LINE = 'If easy rides are kept conversational, use your own judgement to go longer.';

/** ⛔ APPROVED (Michael, 2026-09-13) — the question and its two answers. */
export const RIDE_COUNT_LABEL = 'Rides a week';
export const RIDE_COUNT_CHIP: Record<4 | 5, string> = { 4: 'Four rides', 5: 'Five rides' };

/** The counts the frame offers: the fewer-rides count and the page's own. One option when it offers none. */
export function rideCountOptions(frame: FrameId): Array<4 | 5> {
  const fewer = FRAMES[frame]?.fewerRidesDropsSlot;
  const all = frameSlots(frame).length;
  return (fewer ? [fewer.rideCount, all] : [all]) as Array<4 | 5>;
}

/** The rides a week of this many holds, in the frame's day order. */
export function ridesForCount(frame: FrameId, rideCount: number): FrameSlot[] {
  const fewer = FRAMES[frame]?.fewerRidesDropsSlot;
  return frameSlots(frame).filter((row) =>
    !(fewer && rideCount === fewer.rideCount && row.frameKey === `${fewer.day}:${fewer.index}`));
}

/** One row: the page's day and the plan's own name for the session. ⛔ APPROVED (Michael, 2026-09-13). */
export function rideRowLine(row: Pick<FrameSlot, 'frameDay' | 'family'>): string {
  return `Day ${row.frameDay} · ${FAMILY_LABEL[row.family as FamilyId] ?? ''}`;
}
