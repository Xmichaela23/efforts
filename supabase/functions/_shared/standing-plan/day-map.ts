// ============================================================================
// THE DAY MAP — the frame owns the ORDER and the SPACING; the athlete owns the CALENDAR DAYS.
//
// ⛔ THE WORK ORDER SAYS THIS OUTRIGHT: *"THE DAY ORDER IS NOT THE LAW. THE PAIRINGS ARE. He numbers
// days 1-7 and never names a weekday; Rule 8 calls a fixed seven-day microcycle an artificial
// constraint."* p246 numbers its days and names no weekday anywhere.
//
// ⛔ A ROTATION COSTS THE FRAME NOTHING, SO IT IS ALWAYS TRIED FIRST. Every frame day shifts by the
// same amount, so every pairing, every gap between them and the rest day's position survive exactly.
// ⛔ AND SINCE 2026-09-22 IT IS NOT THE ONLY MOVE. When no rotation gives a clean week for the days the
// athlete picked, the book's days are put in another order — see `week-arrangement.ts`, which owns the
// choice. This file keeps the day arithmetic and the types.
//
// ⚠️ AND THE OLD BEHAVIOUR WAS ITSELF AN UNLABELLED ROTATION. `compose.ts` mapped frame day N onto
// weekday N — offset zero — which nobody chose and which put the long run on Saturday for every
// athlete in the world. This file makes that choice explicit and lets the athlete's pins decide it.
// ============================================================================

import { FRAMES, type ColumnKind, type FrameId } from './frames.ts';
import { isHardSlot, isLongSlot } from './sport-slots.ts';

/** ⛔ Monday-first, because `activate-plan:437` `DAY_INDEX` is Monday:1 … Sunday:7 and dates are
 *  computed off `mondayOf(startDate)`. This module and that mapping must agree or a session lands on
 *  the wrong date. */
export const WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;
export type Weekday = typeof WEEKDAYS[number];

export function isWeekday(x: unknown): x is Weekday {
  return typeof x === 'string' && (WEEKDAYS as readonly string[]).includes(titleCaseDay(x));
}

/** `'sunday'` / `'SUNDAY'` / `' Sunday '` → `'Sunday'`. Anything else → `''`. */
export function titleCaseDay(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  const hit = WEEKDAYS.find((d) => d.toLowerCase() === s);
  return hit ?? '';
}

/**
 * ⛔ HOW THE BOOK'S NUMBERED DAYS SIT ON THE CALENDAR (2026-09-22). A number is a rotation: frame day 1
 * lands that many days after Monday and every other day follows in the book's order. An array is a
 * full arrangement: `order[frameDay - 1]` is the weekday index (Monday = 0) that frame day lands on.
 * The array exists because a rotation cannot put two hard days the athlete picked back to back when
 * the book prints them two days apart (`week-arrangement.ts`).
 */
export type DayArrangement = number | readonly number[];

/** The weekday a frame day lands on under a given rotation or arrangement. */
export function weekdayForFrameDay(frameDay: number, offset: DayArrangement): Weekday {
  const d = Math.round(frameDay);
  if (Array.isArray(offset)) {
    const w = (offset as readonly number[])[d - 1];
    if (Number.isInteger(w) && w >= 0 && w < 7) return WEEKDAYS[w];
    return WEEKDAYS[(((d - 1) % 7) + 7) % 7];
  }
  const o = ((Math.round(offset as number) % 7) + 7) % 7;
  return WEEKDAYS[(((d - 1 + o) % 7) + 7) % 7];
}

/** The frame day (1–7) that lands on `weekday` under a given rotation or arrangement. */
export function frameDayOn(weekday: Weekday, offset: DayArrangement): number {
  for (let d = 1; d <= 7; d++) if (weekdayForFrameDay(d, offset) === weekday) return d;
  return WEEKDAYS.indexOf(weekday) + 1;
}

/**
 * ⚠️ A STORED ARRANGEMENT, READ BACK. A block built before 2026-09-22 stored only `day_offset`; a block
 * built after stores `day_order` too, and `day_order` wins when it is a valid arrangement of all seven days.
 */
export function storedArrangement(dayOrder: unknown, dayOffset: unknown): DayArrangement {
  if (Array.isArray(dayOrder) && dayOrder.length === 7
    && new Set(dayOrder).size === 7
    && dayOrder.every((w) => Number.isInteger(w) && w >= 0 && w < 7)) {
    return dayOrder as number[];
  }
  return Number(dayOffset) || 0;
}

/** The rotation that puts `frameDay` on `weekday`. */
export function offsetPutting(frameDay: number, weekday: Weekday): number {
  const target = WEEKDAYS.indexOf(weekday);
  return (((target - (Math.round(frameDay) - 1)) % 7) + 7) % 7;
}

// ── WHICH FRAME DAY CARRIES WHICH ANCHOR ─────────────────────────────────────────────────────────

/**
 * ⛔ READ OFF THE FRAME, NOT HARDCODED. A second table naming "day 6" would go stale the first time a
 * frame is added, and `FRAMES` is the law.
 *
 * ⛔⛔ AND IT ASKS THE ONE OWNER NOW (2026-08-30). This was a FOURTH hand-maintained copy of "which
 * slot is long, which are hard" — `if (e.family === 'run_lsd')` and a two-family test for hard —
 * beside `HARDNESS`/`isLongSlot`, `anchorRoleOf` and `week-conflicts.ts`. It keyed on RUN families
 * only, so the All Rounder's natively-prescribed `Cyc AnA` (p274 day 2) and `Cyc endurance` (day 4)
 * would have returned no anchor day at all: no pin, no placement, and nothing said. Same silent
 * class as the `HARD_FAMILIES` defect fixed earlier today.
 * ⚠️ IT ANSWERS IDENTICALLY FOR EVERY SLOT WRITTEN BEFORE ROLES EXISTED — `run_lsd` is the only long
 * family in `HARDNESS`'s companion test, and `run_mlss`/`run_near_threshold` are exactly the two
 * families ranked at or above 3.
 */
export function anchorDaysFor(frame: FrameId, column: ColumnKind = 'standard'): {
  long: number | null;
  hard: number[];
} {
  const days = FRAMES[frame]?.columns[column] ?? [];
  let long: number | null = null;
  const hard: number[] = [];
  for (const d of days) {
    for (const e of d.endurance) {
      if (isLongSlot(e)) long = d.day;
      else if (isHardSlot(e)) hard.push(d.day);
    }
  }
  return { long, hard: [...new Set(hard)].sort((a, b) => a - b) };
}

/**
 * ⛔ WHICH FRAME DAYS CARRY WORK THE ROTATION CANNOT MOVE — read off `FRAMES`, same law as
 * `anchorDaysFor`. The lifting order, its spacing and the plyo day are the frame; only ENDURANCE
 * steps out of it (`compose.ts` `enduranceDayFor`). So when the athlete blocks a day, these are the
 * days that have to be rotated OFF it, and the endurance is not — it moves on its own.
 */
export function frameFixedDaysFor(frame: FrameId, column: ColumnKind = 'standard'): {
  lifting: number[];
  /** Lifting plus the plyo-only day: everything the rotation carries that is not endurance. */
  fixed: number[];
} {
  const days = FRAMES[frame]?.columns[column] ?? [];
  const lifting = days.filter((d) => d.strength.length > 0).map((d) => d.day);
  const fixed = days
    .filter((d) => d.strength.length > 0 || d.plyo === true)
    .map((d) => d.day);
  return { lifting, fixed };
}

// ── CHOOSING THE ROTATION ────────────────────────────────────────────────────────────────────────

export type DayPins = {
  /** The athlete's long-run day. The block's primary anchor everywhere in this app. */
  longRunDay?: string | null;
  /**
   * ⛔ THE LONG-RIDE DAY — AND THE FRAME HAS ONLY ONE LONG SLOT (the compromise wire, 2026-08-24).
   *
   * An athlete who keeps both sports can pin both long days. `strength_5k` carries **one** long
   * session, so at most one of those pins is servable, and until now the other was **dropped in
   * silence** — the case that escaped on 2026-08-24. Which pin is live depends on which sport the
   * assigner gave the long slot; the other one becomes a stated cost, never a deletion.
   */
  longRideDay?: string | null;
  /**
   * Which sport `assignSports` put on the long slot. ⚠️ Absent means run, which is the frame as
   * transcribed and the answer for every athlete with any running in the mix.
   */
  longSlotSport?: 'run' | 'ride' | 'swim';
  /** Days they pinned a hard session to. */
  hardDays?: (string | null | undefined)[];
  /**
   * ⛔⛔ DAYS THE ATHLETE CANNOT TRAIN — A PIN LIKE ANY OTHER (Michael, 2026-08-25).
   *
   * The rule: *"an unavailable day is a hard pin like any other, and the solver must JUGGLE before
   * it warns."* The lifting frame has seven rotations and one of them may well land the frame's
   * empty day on the day the athlete blocked — so the chooser TRIES, and lifting sits on a blocked
   * day only when no rotation can satisfy every pin at once.
   *
   * ⚠️ ENDURANCE IS NOT SCORED HERE. It is movable by definition and `compose.ts` steps it off a
   * blocked day on its own, so scoring it would make the rotation pay for a cost that does not
   * exist. Only `frameFixedDaysFor` — the lifts and the plyo day — is at stake.
   * ⚠️ ABSENT OR EMPTY IS TODAY'S ROTATION EXACTLY: every candidate scores zero and the ordering
   * below is unchanged.
   */
  unavailableDays?: (string | null | undefined)[];
  /**
   * The block's first calendar day, `YYYY-MM-DD`. ⛔ Supplied so the chooser can avoid a rotation
   * that would let `activate-plan` DELETE week one's test — see `startWeekdayIndex`.
   */
  startDateIso?: string | null;
};

export type DayMap = {
  frame: FrameId;
  /** Frame day 1 lands `offset` days after Monday. */
  offset: number;
  /**
   * ⛔ WHERE EVERY FRAME DAY LANDS — `order[frameDay - 1]` = weekday index, Monday = 0. Equal to the
   * rotation at `offset` unless the chooser had to change the book's order (`week-arrangement.ts`).
   */
  order: number[];
  weekdayFor: (frameDay: number) => Weekday;
  /** ⛔ EVERY PIN THAT COULD NOT BE HONOURED, in plain words. Never silent. */
  compromises: { kind: 'cost'; text: string }[];
  /** Which pins the chosen rotation did honour — for the notes and for the tests. */
  honoured: {
    longRun: boolean;
    hardDays: number;
    /**
     * ⛔ TRUE WHEN NOTHING THE ROTATION CARRIES LANDS ON A DAY THE ATHLETE BLOCKED — the lifting days
     * AND the plyo day.
     *
     * ⚠️ IT READ `blockedLifts === 0` UNTIL THE FUZZ SWEEP FOUND IT (2026-08-25). The scorer already
     * ranked on `blockedFixed`, which includes the plyo day; this reported on lifting alone. So a
     * rotation that cleared all four lifting days and dropped the plyo block onto the day off came
     * back HONOURED with no note at all, and the athlete got a drill session on a day they had said
     * they could not train, in silence. The scorer and the report now answer the same question.
     * ⚠️ Also true when nothing was blocked — "nothing to honour" and "honoured" are the same week,
     * and a caller reading this to decide whether to warn must not warn on the empty case.
     */
    unavailableDays: boolean;
  };
};

/**
 * ⚠️ THE LONG RUN WINS WHEN PINS FIGHT, AND THAT IS THE APP'S EXISTING ORDER RATHER THAN A NEW
 * JUDGEMENT. `preferred_days.long_run` is the anchor `place-week` solves around, the one
 * `create-goal` forwards on every path, and the only day the intake has always asked for. A hard
 * session is a session; the long day is the week's shape.
 */
export const LONG_RUN_WINS =
  'When two pinned days cannot both be honoured the long day wins. It is the anchor the rest of the '
  + 'week is built around, and it is the one this app has always asked for first.';

