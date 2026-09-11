/**
 * THE ENDURANCE INTAKE'S NUMBERS, WORKED OUT BY THE SERVER (2026-09-10, audit H-W05, H-P06, H-W10).
 *
 * The builder's endurance step prints what this returns and works none of it out:
 *
 *   rows               per row: the lengths it may be set to, the length it is fixed at, or that its
 *                      length varies week to week (`slotLengthOptions`, `slotFixedMinutes`), and on a
 *                      hard row the sentence that stands where the shape list used to (`HARD_ROW_LINE`).
 *   experience_chips   the two chips per sport and every number on them (`experienceChips`).
 *   has_bounds         whether each sport's slots hold a week worth an hours dial, and whether a total
 *                      is a floor because some recoveries carry no stated length (`weekBounds`).
 *   run_strength_week  the Run + Strength screen's long-run chips, their default and the easy run's
 *                      length — the frame's numbers (`Frame.runStrengthWeek`) on the `run_lsd` ladder.
 *   tier_line          the history sentence, from the same demonstrated run volume the composer reads.
 *
 * Every number comes from the functions the composer sizes and builds with, so the screen and the
 * block read one derivation. The row answers are the screen's own keys (`hard1`, `easy`, `long`…).
 */
import {
  experienceChips,
  slotFixedMinutes,
  slotLengthOptions,
  slotLengthRange,
  weekBounds,
  type ExperienceChoice,
} from '../../../../src/lib/standing-plan-week-bounds.ts';
import {
  forcedSportFor,
  frameSlots,
  HARD_SHAPE_IS_ENGINES,
  hardSlotKeysFor,
  weekIsDayOrdered,
  type SlotKey,
  type SlotSelection,
  type SlotSport,
} from '../../../../src/lib/standing-plan-week-copy.ts';
import type { EnduranceBaselines } from '../endurance-library/index.ts';
import { advancedTierSessions, FRAMES, type EnduranceExperience, type FrameId } from './frames.ts';

export type IntakeRow = {
  /** The sport these numbers were worked out for — the phone uses a row only while it still matches. */
  sport: SlotSport | null;
  /** The lengths an easy or long row may be set to. Null on a quality row, or with no sport yet. */
  length_options: number[] | null;
  /** The length a quality row is fixed at, when its shape is pinned. */
  fixed_minutes: number | null;
  /** A quality row whose shape rotates, so no single length is true. */
  length_varies: boolean;
  /**
   * The shortest and longest that rotating row will be, in minutes — the ends of the shapes it rotates
   * through, each at the length the block builds it (`slotLengthRange`). Null wherever `length_varies`
   * is false.
   */
  length_range: { min: number; max: number } | null;
  /**
   * ⛔ WHAT A HARD ROW SAYS UNDER ITS SPORT — MICHAEL'S OWN SENTENCES, APPROVED 2026-09-11. It stands
   * where the shape list used to (`HARD_SHAPE_IS_ENGINES`). Null on every other row, and on a hard
   * row with no sport answered yet.
   */
  hard_line: string | null;
};

/**
 * ⛔⛔ THE TWO SENTENCES, VERBATIM (Michael, 2026-09-11). The phone prints what is in this object and
 * composes nothing — the row it sits on offers no shape to name, so the line is what tells the
 * athlete what the session IS and that the workout itself is still theirs on the day.
 *
 * ⚠️ KEYED ON THE ROW'S ANSWERED SPORT, not on the frame's family: a hard row switched from a ride to
 * a run must read the run's sentence, and the sport is the only thing the athlete answers there.
 * ⚠️ BOTH PASS `voiceViolation` — measured, not assumed. "Choose" is not on its banned list; the four
 * imperatives it bans are stay, keep, try and consider.
 * ⚠️ AND THE SECOND HALF IS A PROMISE ABOUT A BUILT SESSION. See the work order note recorded with
 * this change: the app has no path today that changes a built session's SHAPE — the Instead sheet
 * offers the sport, the machine, the long day's hike and the way back, and nothing else.
 */
export const HARD_ROW_LINE: Record<SlotSport, string> = {
  run: 'A series of near-threshold efforts. Choose the workout on the day.',
  ride: 'A series of efforts near or above threshold. Choose the workout on the day.',
};

export type EnduranceIntakeReadout = {
  frame: FrameId;
  /** The answers and workout picks these numbers describe, after the frame's own fixed rows. */
  slots: SlotSelection;
  archetypes: Partial<Record<SlotKey, string>>;
  rows: Partial<Record<SlotKey, IntakeRow>>;
  experience_chips: Record<SlotSport, ExperienceChoice>;
  has_bounds: { run: boolean; ride: boolean };
  is_lower_bound: boolean;
  run_strength_week: {
    easy_run_minutes: number;
    long_run_options: number[];
    long_run_default: number | null;
  } | null;
  tier_line: string | null;
};

/** The engine's `${frameDay}:${index}` keys back to the screen's row keys. */
export function rowKeyedFromFrameKeys<T>(
  frame: FrameId,
  byFrameKey: Record<string, T> | null | undefined,
): Partial<Record<SlotKey, T>> {
  const out: Partial<Record<SlotKey, T>> = {};
  if (!byFrameKey) return out;
  for (const s of frameSlots(frame)) {
    if (byFrameKey[s.frameKey] !== undefined) out[s.key] = byFrameKey[s.frameKey];
  }
  return out;
}

export function enduranceIntakeReadout(args: {
  frame: FrameId;
  /** The athlete's sport per row, as answered so far. */
  answers: SlotSelection;
  /** The workout picked inside each hard row, when one was picked. */
  archetypes?: Partial<Record<SlotKey, string>>;
  experience?: EnduranceExperience | null;
  baselines?: unknown;
  /** The easy pace the block is built on, sec/mi — turns run minutes into the miles a dial asks. */
  easyPaceSecPerMi?: number | null;
  /** The composer's demonstrated run volume — see `demonstratedRunVolume`. */
  demonstrated?: { weeklyMiles: number | null; source: string } | null;
}): EnduranceIntakeReadout {
  const frame = args.frame;
  const baselines = (args.baselines ?? {}) as EnduranceBaselines;
  // ⛔ A ROW THE FRAME ANSWERS CARRIES THE FRAME'S SPORT, whatever an older draft tapped there.
  const slots: SlotSelection = { ...args.answers };
  for (const s of frameSlots(frame)) {
    const forced = forcedSportFor(s.key, frame);
    if (forced) slots[s.key] = forced;
  }
  const dayOrdered = weekIsDayOrdered(frame);
  const hardKeys = hardSlotKeysFor(frame);

  const rows: Partial<Record<SlotKey, IntakeRow>> = {};
  for (const s of frameSlots(frame)) {
    const lengths = dayOrdered ? slotLengthOptions(s.key, slots, { baselines, frame }) : null;
    const fixed = dayOrdered
      ? slotFixedMinutes(s.key, slots, { baselines, frame, archetype: args.archetypes?.[s.key] ?? null })
      : null;
    const rowSport = slots[s.key] ?? null;
    rows[s.key] = {
      sport: rowSport,
      length_options: lengths?.options ?? null,
      fixed_minutes: fixed,
      length_varies: dayOrdered && hardKeys.includes(s.key) && lengths == null && fixed == null
        && rowSport != null,
      length_range: dayOrdered && hardKeys.includes(s.key) && lengths == null && fixed == null && rowSport != null
        ? slotLengthRange(s.key, slots, { baselines, frame, archetype: args.archetypes?.[s.key] ?? null })
        : null,
      // ⛔ ONLY A HARD ROW WHOSE SHAPE THE ENGINE OWNS, and only once its sport is answered.
      hard_line: HARD_SHAPE_IS_ENGINES && hardKeys.includes(s.key) && rowSport
        ? HARD_ROW_LINE[rowSport]
        : null,
    };
  }

  const bounds = weekBounds(slots, {
    baselines, experience: args.experience ?? null, frame, easyPaceSecPerMi: args.easyPaceSecPerMi ?? null,
  });
  const chips = experienceChips(slots, { baselines, archetypes: args.archetypes, frame });

  const rsw = FRAMES[frame]?.runStrengthWeek;
  const runStrengthWeek = (() => {
    if (!rsw) return null;
    const options = (slotLengthOptions('long', slots, { baselines, frame })?.options ?? [])
      .filter((m) => m <= rsw.longRunChipCeilingMinutes);
    // The ruled default where the ladder offers it, else the middle of what it offers.
    const def = options.length === 0
      ? null
      : options.includes(rsw.longRunDefaultMinutes)
        ? rsw.longRunDefaultMinutes
        : options[Math.floor((options.length - 1) / 2)];
    return { easy_run_minutes: rsw.easyRunMinutes, long_run_options: options, long_run_default: def };
  })();

  const tierLine = (() => {
    const d = args.demonstrated;
    if (!d) return null;
    const extra = advancedTierSessions(d.weeklyMiles);
    if (extra <= 0) return null;
    // The frame's own endurance slots plus the tier's extra runs — four on Run + Strength, five on
    // Standard Focus. The phone printed four on both.
    const total = frameSlots(frame).length + extra;
    return `Your history supports a ${total}-session endurance week — ${extra} extra easy `
      + `run${extra === 1 ? '' : 's'} (${d.source}).`;
  })();

  return {
    frame,
    slots,
    archetypes: { ...(args.archetypes ?? {}) },
    rows,
    experience_chips: chips,
    has_bounds: { run: !!bounds.runMilesInput, ride: !!bounds.rideHours },
    is_lower_bound: bounds.isLowerBound,
    run_strength_week: runStrengthWeek,
    tier_line: tierLine,
  };
}
