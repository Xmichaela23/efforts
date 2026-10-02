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
 *   ride_strength_week the Ride + Strength screen: its rows, the length chips (`Frame.rideWeek`) and
 *                      the switch on each optional ride — read off the frame's own slots and roles.
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
import { FRAMES, isJoinedSlot, planCeilingFor, type EnduranceExperience, type FrameId } from './frames.ts';
import { FAMILIES } from '../endurance-library/index.ts';
import { FAMILY_LABEL } from './session-vocabulary.ts';
import { composeWeek } from './compose.ts';
import { defaultCompetitionLifts } from './frame-resolver.ts';
import { sessionLengthRangeLabel } from '../../../../src/lib/standing-plan-week-copy.ts';
import { fill, JOINED_ROW, lengthWords, RIDES_COPY, RUNS_COPY, runsCommitmentLine } from './setup-copy.ts';
import { ladderOf } from './volume-bounds.ts';
import { resolveEnduranceAnchors } from '../endurance-library/index.ts';

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
    /** On a race plan only (2026-10-02): the line under the long run's chips, keyed by each chip's minutes. */
    long_grows_lines?: Record<string, string>;
    rows: Array<{
      key: SlotKey; title: string; session: string; length: string | null; is_long: boolean;
      /** An easy row with chips (2026-09-23): the frame's tiers, the first selected. */
      options?: number[]; option_labels?: Record<string, string>; default_minutes?: number;
    }>;
  } | null;
  /**
   * ⛔ THE RIDES SCREEN, SHAPED LIKE THE RUNS SCREEN (Michael, 2026-09-27): one row per ride (a joined ride named
   * "{first}, then {second}"), the length chips (the long ride, and the midweek easy ride that Friday's follows), and a
   * switch on each optional ride. Built off the frame's
   * own slots and roles, so a cycling frame that declares `rideWeek` gets it by adding the frame only.
   */
  ride_strength_week: {
    /** Null where the plan's own line is not yet approved (`RIDES_COPY.sub_by_frame`). */
    sub_line: string | null;
    length_label: string;
    /**
     * `length` — the chips on a ride whose length the rider picks (`Frame.rideWeek`). `key` is the row the pick is stored
     * under; a ride that follows another's length (`sameLengthAs`, p281's Friday = Tuesday) carries the leader's key, so
     * the phone shows the chips once, on the first of those rows still in the week. `default` is the first chip at the
     * ride's own printed level, selected until the rider picks.
     */
    rows: Array<{
      key: SlotKey; line: string; is_long: boolean;
      /** An optional ride carries a switch on its own row, on by default (the week as printed), and this line under its name. */
      optional: boolean; optional_line: string | null;
      /** A ride with no length pick: the shortest and longest this ride builds across the block's standard weeks, both
       *  parts of a joined ride together ("37 min–1h08"; Michael 2026-09-28: "this section should show all the times"). */
      time_line: string | null;
      length: {
        key: SlotKey; options: number[]; labels: Record<string, string>; default: number | null;
        /** On a ride held to another's length: "Same length as Day N." — shown while that ride is in the week. */
        same_as: string | null;
      } | null;
      /**
       * ⛔ THE LEVEL CHIPS on a ride the page prints as a range (p279 day 1, "level 2 to 3"; the rider picks). `key` is the
       * row the pick is stored under; `default` the slot's own level. Null on every other ride. ⚠️ `label` and each
       * option's `label` are null until Michael approves the words (`RIDES_COPY.level_label` / `level_chip`) — the phone
       * draws the chips only when they are present.
       */
      level: {
        key: SlotKey; label: string | null; default: number;
        options: Array<{ level: number; label: string | null }>;
      } | null;
    }>;
    /** Null where the plan's own line is not yet approved (`RIDES_COPY.easy_line_by_frame`). */
    easy_line: string | null;
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

/** The joined second part that follows this frame slot in the standard column, when there is one. */
function joinedPartOf(frame: FrameId, frameKey: string) {
  const [fd, idx] = frameKey.split(':').map(Number);
  const next = FRAMES[frame].columns.standard.find((d) => d.day === fd)?.endurance[idx + 1];
  return isJoinedSlot(next) ? next! : null;
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
    // ⛔ A RUN-ONLY FRAME'S UNANSWERED ROW IS A RUN (2026-09-23): the long-run chips read the long slot's sport, and
    // with no answer yet the screen showed none. p246 / p250 print every slot as a run.
    if (!slots[s.key] && !(FRAMES[frame].enduranceSports ?? []).includes('ride') && s.family.startsWith('run_')) {
      slots[s.key] = 'run';
    }
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
    // ⛔ THE FRAME'S THREE CHIPS (2026-09-23), kept only where the ladder can build them (its min–max band).
    const band = slotLengthOptions('long', slots, { baselines, frame });
    const options = rsw.longRunChips.filter((m) => band != null && m >= Math.floor(band.min) && m <= Math.ceil(band.max));
    // The ruled default where the ladder offers it, else the middle of what it offers.
    // OURS — `enduranceIntakeReadout` falls back to the middle long-run option when the frame's default is not offered.
    // The first chip is selected (Michael, 2026-09-23).
    const def = options.length > 0 ? options[0] : null;
    const sessionName = (family: string, archetype: string | null | undefined): string => {
      const fam = (FAMILIES as Record<string, { label?: string; archetypes?: { id: string; label?: string }[] }>)[family];
      if (!fam) return '';
      if (archetype) {
        const a = (fam.archetypes ?? []).find((x) => x.id === archetype);
        if (a?.label) return a.label;
      }
      return fam.label ?? '';
    };
    /**
     * ⛔ THE SHAPE A SLOT BUILDS IN THE SAMPLE WEEK (week two), read off the composed week by its `slot:` tag. Composed
     * once, on the first row that asks. ⚠️ The frame's printed sports and the athlete's experience answer — the two
     * inputs this screen holds that move a hard slot's shapes. A week that cannot compose names nothing.
     */
    let sampleWeek: Array<{ tags?: string[] }> | null = null;
    const sampleWeekArchetype = (frameKey: string): string | null => {
      if (sampleWeek == null) {
        try {
          sampleWeek = (composeWeek({
            frame, week: 2, column: 'standard', competitionLifts: defaultCompetitionLifts(),
            seed1RMs: { bench: 135, squat: 185, deadlift: 225, overheadPress: 95 }, equipment: null, roundTo: 5,
            baselines: baselines as never, enduranceExperience: args.experience ?? null,
          } as never).sessions ?? []) as Array<{ tags?: string[] }>;
        } catch { sampleWeek = []; }
      }
      const s = sampleWeek.find((x) => (x.tags ?? []).includes(`slot:${frameKey}`));
      return s?.tags?.find((t) => t.startsWith('archetype:'))?.slice('archetype:'.length) ?? null;
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
        session: (() => {
          // ⛔ ONE SESSION OF TWO PARTS (p245 / p253): the second part is named on the first part's row.
          const next = joinedPartOf(frame, row.frameKey);
          if (!next) return sessionName(row.family, row.archetype ?? null);
          // ⛔ AND ITS FIRST PART IS THE SAMPLE WEEK'S OWN SESSION where the frame rotates it (Your week shows week two;
          // Michael, 2026-09-24: "use that week's sprint name"). ⛔ READ OFF THE COMPOSED WEEK TWO (2026-09-29): the hard
          // slots' shapes are chosen together for the whole block (`hard-rotation.ts`), so no week-number formula here
          // can name what week two builds.
          const own = sessionName(row.family, sampleWeekArchetype(row.frameKey) ?? row.archetype ?? null);
          const second = next.family === 'run_vt1' ? RUNS_COPY.joined_easy : sessionName(next.family, next.archetype ?? null);
          return fill(JOINED_ROW, { first: own, second });
        })(),
        length: row.role === 'long' ? null : row.role === 'easy'
          ? (rsw.easyRunRangeByLevel?.[row.level]
            ? `${rsw.easyRunRangeByLevel[row.level]![0]}–${rsw.easyRunRangeByLevel[row.level]![1]} min`  // Viada p235
            : lengthWords(rsw.easyRunMinutes))
          : RUNS_COPY.length_varies,
        is_long: row.role === 'long',
        // ⛔ AN EASY RUN WITH CHIPS (Run Lead's day 4): the frame's tiers, the first selected (2026-09-23).
        ...(row.role === 'easy' && rsw.easyRunChipsByLevel?.[row.level]
          ? {
            options: rsw.easyRunChipsByLevel[row.level]!,
            option_labels: Object.fromEntries(rsw.easyRunChipsByLevel[row.level]!.map((m) => [String(m), lengthWords(m)])),
            default_minutes: rsw.easyRunChipsByLevel[row.level]![0],
          }
          : {}),
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
        line: RUNS_COPY.extra_line_by_frame[frame] ?? RUNS_COPY.extra_line,
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
    if (!f?.printedWeekOnly || !f.rideWeek) return null;
    const all = frameSlots(frame);
    const slotOf = (frameKey: string) => {
      const [fd, idx] = frameKey.split(':').map(Number);
      return f.columns.standard.find((d) => d.day === fd)?.endurance[idx];
    };
    // ⛔ THE CHIPS A SLOT CAN BUILD — inside its ladder from its smaller tier (`lengthFromLevel`) up — and the first one at
    // its own printed level opens selected (the runs screen's "first chip selected", 2026-09-23).
    const anchors = resolveEnduranceAnchors(baselines as never);
    /**
     * ⛔ EACH RIDE'S MINUTES AS THE BLOCK BUILDS THEM (2026-09-29): the composer's own standard weeks 2 to 12 (week 1 is
     * the test week), read off each session's `slot:` tag — so the row states lengths the rider will actually ride, the
     * rotating shapes included, and never a second computation of "how long is this session".
     */
    const builtMinutes: Array<Record<string, number>> = [];
    for (let week = 2; week <= 12; week++) {
      try {
        const wk = composeWeek({
          frame, week, column: 'standard', competitionLifts: defaultCompetitionLifts(),
          seed1RMs: { bench: 135, squat: 185, deadlift: 225, overheadPress: 95 }, equipment: null, roundTo: 5,
          baselines: baselines as never,
        } as never);
        const byKey: Record<string, number> = {};
        for (const sess of (wk.sessions ?? []) as Array<{ tags?: string[]; duration?: number }>) {
          const k = (sess.tags ?? []).find((t) => t.startsWith('slot:'))?.slice(5);
          if (k && Number(sess.duration) > 0) byKey[k] = (byKey[k] ?? 0) + Number(sess.duration);
        }
        builtMinutes.push(byKey);
      } catch { /* a week that cannot compose states nothing */ }
    }
    const timeLineFor = (keys: string[]) => {
      const totals = builtMinutes
        .map((byKey) => keys.every((k) => byKey[k] != null) ? keys.reduce((a, k) => a + byKey[k], 0) : null)
        .filter((n): n is number => n != null);
      return totals.length ? sessionLengthRangeLabel({ min: Math.min(...totals), max: Math.max(...totals) }) : null;
    };
    const lengthFor = (frameKey: string) => {
      const slot = slotOf(frameKey);
      const chips = f.rideWeek!.chips[frameKey];
      const owner = all.find((r) => r.frameKey === frameKey);
      if (!slot || !chips || !owner) return null;
      // ⛔ THE PLAN'S OWN LONG-RIDE CAP where it states one (p279, p239 level 3) — the same reader the composer uses.
      const ceilingMin = planCeilingFor(frame, slot.family, slot.role);
      const ladder = (level: number) => ladderOf({
        family: slot.family as never, level: level as never, role: slot.role,
        sport: String(slot.family).startsWith('ride_') ? 'ride' : 'run',
        ...(ceilingMin ? { ceilingMin } : {}),
      } as never, anchors);
      const pick = ladder(slot.lengthFromLevel ?? slot.level);
      const own = ladder(slot.level);
      const options = chips.filter((m) => pick.some((r) => m >= Math.round(r.lo) && m <= Math.round(r.hi)));
      const ownFloor = own.length > 0 ? Math.round(own[0].lo) : null;
      return {
        key: owner.key,
        options,
        labels: Object.fromEntries(options.map((m) => [String(m), lengthWords(m)])),
        default: options.find((m) => ownFloor != null && m >= ownFloor) ?? options[0] ?? null,
        same_as: null as string | null,
      };
    };
    const rows = all.map((row) => {
      const next = joinedPartOf(frame, row.frameKey);
      const name = rideRowName(row.family, row.archetype ?? null);
      // A ride's own chips, or the chips of the ride its (joined) length follows.
      const leads = f.rideWeek!.chips[row.frameKey] ? row.frameKey : next?.sameLengthAs ?? slotOf(row.frameKey)?.sameLengthAs ?? null;
      return {
        key: row.key,
        line: fill(RIDES_COPY.row, {
          day: row.frameDay,
          name: next ? fill(JOINED_ROW, { first: name, second: rideRowName(next.family, next.archetype ?? null) }) : name,
        }),
        is_long: row.role === 'long',
        optional: slotOf(row.frameKey)?.optional === true,
        optional_line: slotOf(row.frameKey)?.optional === true ? RIDES_COPY.optional_line_by_frame[frame] ?? null : null,
        time_line: (() => {
          if (leads) return null;
          const [fd, idx] = row.frameKey.split(':').map(Number);
          return timeLineFor(next ? [row.frameKey, `${fd}:${idx + 1}`] : [row.frameKey]);
        })(),
        length: (() => {
          const l = leads ? lengthFor(leads) : null;
          if (!l || leads === row.frameKey) return l;
          const leader = all.find((r) => r.frameKey === leads);
          return { ...l, same_as: leader ? fill(RIDES_COPY.same_length, { day: leader.frameDay }) : null };
        })(),
        level: (() => {
          const choices = slotOf(row.frameKey)?.levelChoices ?? [];
          if (choices.length < 2) return null;
          return {
            key: row.key,
            label: RIDES_COPY.level_label,
            default: Number(slotOf(row.frameKey)!.level),
            options: choices.map((lv) => ({
              level: Number(lv),
              label: RIDES_COPY.level_chip ? fill(RIDES_COPY.level_chip, { level: lv }) : null,
            })),
          };
        })(),
      };
    });
    const perFrame = <T,>(byFrame: Partial<Record<FrameId, T>>, fallback: T): T =>
      (frame in byFrame ? byFrame[frame] as T : fallback);
    return {
      sub_line: perFrame<string | null>(RIDES_COPY.sub_by_frame, RIDES_COPY.sub),
      length_label: RUNS_COPY.length_label,
      rows,
      easy_line: perFrame<string | null>(RIDES_COPY.easy_line_by_frame, RIDES_COPY.easy_line),
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
