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
import { FRAMES, type EnduranceExperience, type FrameId } from './frames.ts';
import { FAMILIES } from '../endurance-library/index.ts';
import { FAMILY_LABEL } from './session-vocabulary.ts';
import { fill, lengthWords, RIDES_COPY, RUNS_COPY, runsCommitmentLine } from './setup-copy.ts';

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
/**
 * ⛔ THE FIRST SENTENCE CAME OFF BOTH ROWS (2026-09-18, book-language pass 2). "A series of near-threshold efforts"
 * stood over the MLSS row, which p231 puts in zone 4, above threshold; neither sentence was a page's words, and a row
 * keyed on the sport cannot know which page its session is on. What is left operates the app.
 */
/**
 * ⛔ "Choose the workout on the day." CAME OFF BOTH ROWS (2026-09-18, round 3): on no page. No page gives words for
 * this row, so it prints nothing (Michael, 2026-09-18: "If the book gives no words for something, print nothing").
 */
export const HARD_ROW_LINE: Record<SlotSport, string | null> = {
  run: null,
  ride: null,
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
    /** ⛔ THE RUNS SCREEN'S WORDS AND ROWS (2026-09-13) — the phone prints these and holds none of them. */
    commitment_line: string | null;
    sub_line: string;
    length_label: string;
    extra?: {
      label: string;
      line: string;
      options: { count: number; label: string }[];
      rows: { title: string; session: string; length: string; card: string }[];
    };
    long_option_labels: Record<string, string>;
    rows: Array<{ key: SlotKey; title: string; session: string; length: string | null; is_long: boolean }>;
  } | null;
  /** ⛔ RIDE + STRENGTH'S RIDES SCREEN (2026-09-13): the question, its answers and the rides each count holds. */
  ride_strength_week: {
    count_label: string;
    counts: Array<{ count: number; label: string; rows: Array<{ key: SlotKey; line: string }> }>;
    /** The page's own count, shown selected until the athlete picks. */
    default_count: number;
    easy_line: string;
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
      .filter((m) => m <= rsw.longRunChipCeilingMinutes)
      // OURS — two chips under 5 minutes apart read as the same choice ("104" / "105"); the shorter one stays.
      .filter((m, i, all) => i === 0 || m - all[i - 1] >= 5);
    // The ruled default where the ladder offers it, else the middle of what it offers.
    // OURS — `enduranceIntakeReadout` falls back to the middle long-run option when the frame's default is not offered.
    const def = options.length === 0
      ? null
      : options.includes(rsw.longRunDefaultMinutes)
        ? rsw.longRunDefaultMinutes
        : options[Math.floor((options.length - 1) / 2)];
    const sessionName = (family: string, archetype: string | null | undefined): string => {
      const fam = (FAMILIES as Record<string, { label?: string; archetypes?: { id: string; label?: string }[] }>)[family];
      if (!fam) return '';
      if (archetype) {
        const a = (fam.archetypes ?? []).find((x) => x.id === archetype);
        if (a?.label) return a.label;
      }
      return fam.label ?? '';
    };
    const seen: Record<string, number> = { hard: 0, easy: 0, long: 0 };
    const rows = frameSlots(frame).map((row) => {
      seen[row.role] += 1;
      const n = seen[row.role];
      const label = row.role === 'long' ? RUNS_COPY.row_label.long
        : row.role === 'easy' ? (n > 1 ? fill(RUNS_COPY.row_label.easy_n, { n }) : RUNS_COPY.row_label.easy)
          : fill(RUNS_COPY.row_label.hard_n, { n });
      return {
        key: row.key,
        title: fill(RUNS_COPY.row, { day: row.frameDay, label }),
        session: sessionName(row.family, row.archetype ?? null),
        length: row.role === 'long' ? null : row.role === 'easy'
          ? (rsw.easyRunRangeByLevel?.[row.level]
            ? `${rsw.easyRunRangeByLevel[row.level]![0]}–${rsw.easyRunRangeByLevel[row.level]![1]} min`  // Viada p235
            : lengthWords(rsw.easyRunMinutes))
          : RUNS_COPY.length_varies,
        is_long: row.role === 'long',
      };
    });
    return {
      easy_run_minutes: rsw.easyRunMinutes, long_run_options: options, long_run_default: def,
      // ⛔ THE TOP LINE COUNTS THE RUNS BY WHAT THEY ARE (Michael, 2026-09-22): "4 runs a week: 2 hard, 1 short and
      // easy, 1 long and easy." Counted off the frame's own slots; null on a week that is not all runs.
      commitment_line: (() => {
        const all = frameSlots(frame);
        if (runsCommitmentLine(frame) == null || all.length === 0) return null;
        const n = (role: string) => all.filter((r) => r.role === role).length;
        const parts = (['hard', 'easy', 'long'] as const).filter((r) => n(r) > 0)
          .map((r) => fill(RUNS_COPY.runs_part[r], { n: n(r) }));
        return fill(RUNS_COPY.runs_line, { runs: all.length, parts: parts.join(', ') });
      })(),
      sub_line: fill(RUNS_COPY.sub, { minutes: rsw.easyRunMinutes }),
      length_label: RUNS_COPY.length_label,
      long_option_labels: Object.fromEntries(options.map((m) => [String(m), lengthWords(m)])),
      rows,
      // ⛔ THE ATHLETE'S EXTRA EASY RUNS (Viada p247 "one or two VT1 sessions"), built as VT1 level 1 (p235).
      extra: !rsw.offersExtraEasyRuns ? undefined : {
        label: fill(RUNS_COPY.extra_label, { minutes: rsw.easyRunMinutes }),
        line: RUNS_COPY.extra_line,
        options: [0, 1, 2].map((n) => ({ count: n, label: RUNS_COPY.extra_chip[n] })),
        rows: [1, 2].map((n) => ({
          title: fill(RUNS_COPY.extra_row, { n }),
          session: sessionName('run_vt1', null),
          length: lengthWords(rsw.easyRunMinutes),
          card: fill(RUNS_COPY.extra_card, { length: lengthWords(rsw.easyRunMinutes) }),
        })),
      },
    };
  })();

  // ⛔ A RIDE ROW IS NAMED THE WAY THE BUILT ROW WILL BE (2026-09-19): the workout's own name when the frame names one,
  // its type otherwise. Both read from `source-rules.ts` through `FAMILY_LABEL` / the option's label.
  const rideRowName = (family: string, archetype: string | null): string => {
    const a = archetype
      ? (FAMILIES as Record<string, { archetypes?: { id: string; label?: string }[] }>)[family]?.archetypes?.find((x) => x.id === archetype)
      : null;
    return a?.label ?? (FAMILY_LABEL as Record<string, string>)[family] ?? '';
  };
  const rideStrengthWeek = (() => {
    const f = FRAMES[frame];
    const fewer = f?.fewerRidesDropsSlot;
    if (!f?.printedWeekOnly || !fewer) return null;
    const all = frameSlots(frame);
    const forCount = (count: number) => all
      .filter((row) => !(count === fewer.rideCount && row.frameKey === `${fewer.day}:${fewer.index}`))
      .map((row) => ({
        key: row.key,
        line: fill(RIDES_COPY.row, { day: row.frameDay, name: rideRowName(row.family, row.archetype ?? null) }),
      }));
    return {
      count_label: RIDES_COPY.count_label,
      counts: [fewer.rideCount, all.length].map((count) => ({ count, label: RIDES_COPY.count_chip[count] ?? String(count), rows: forCount(count) })),
      default_count: all.length,
      easy_line: RIDES_COPY.easy_line,
    };
  })();

  // ⛔ THE HISTORY LINE IS GONE WITH THE LOGGED-MILES GATE (2026-09-22): extra easy runs are the athlete's pick.
  const tierLine: string | null = null;

  return {
    frame,
    slots,
    archetypes: { ...(args.archetypes ?? {}) },
    rows,
    experience_chips: chips,
    has_bounds: { run: !!bounds.runMilesInput, ride: !!bounds.rideHours },
    is_lower_bound: bounds.isLowerBound,
    run_strength_week: runStrengthWeek,
    ride_strength_week: rideStrengthWeek,
    tier_line: tierLine,
  };
}
