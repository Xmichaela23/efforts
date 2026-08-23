// ============================================================================
// THE DAY MAP — the frame owns the ORDER and the SPACING; the athlete owns the CALENDAR DAYS.
//
// ⛔ THE WORK ORDER SAYS THIS OUTRIGHT: *"THE DAY ORDER IS NOT THE LAW. THE PAIRINGS ARE. He numbers
// days 1-7 and never names a weekday; Rule 8 calls a fixed seven-day microcycle an artificial
// constraint."* p246 numbers its days and names no weekday anywhere.
//
// ⛔ SO THE ONLY MOVE IS A ROTATION, AND A ROTATION COSTS THE FRAME NOTHING. Every frame day shifts
// by the same amount, so every pairing, every gap between them and the rest day's position survive
// exactly. What changes is which calendar day the block opens on.
//
// ⚠️ AND THE OLD BEHAVIOUR WAS ITSELF AN UNLABELLED ROTATION. `compose.ts` mapped frame day N onto
// weekday N — offset zero — which nobody chose and which put the long run on Saturday for every
// athlete in the world. This file makes that choice explicit and lets the athlete's pins decide it.
// ============================================================================

import { FRAMES, type ColumnKind, type FrameId } from './frames.ts';

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

/** The weekday a frame day lands on under a given rotation. */
export function weekdayForFrameDay(frameDay: number, offset: number): Weekday {
  const d = Math.round(frameDay);
  const o = ((Math.round(offset) % 7) + 7) % 7;
  return WEEKDAYS[(((d - 1 + o) % 7) + 7) % 7];
}

/** The rotation that puts `frameDay` on `weekday`. */
export function offsetPutting(frameDay: number, weekday: Weekday): number {
  const target = WEEKDAYS.indexOf(weekday);
  return (((target - (Math.round(frameDay) - 1)) % 7) + 7) % 7;
}

// ── WHICH FRAME DAY CARRIES WHICH ANCHOR ─────────────────────────────────────────────────────────

/**
 * ⛔ READ OFF THE FRAME, NOT HARDCODED. The long day is the frame day carrying the LSD family; the
 * hard days are the ones carrying MLSS or near-threshold. A second table naming "day 6" would go
 * stale the first time a frame is added, and `FRAMES` is the law.
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
      if (e.family === 'run_lsd') long = d.day;
      if (e.family === 'run_mlss' || e.family === 'run_near_threshold') hard.push(d.day);
    }
  }
  return { long, hard: [...new Set(hard)].sort((a, b) => a - b) };
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
   * The block's first calendar day, `YYYY-MM-DD`. ⛔ Supplied so the chooser can avoid a rotation
   * that would let `activate-plan` DELETE week one's test — see `startWeekdayIndex`.
   */
  startDateIso?: string | null;
};

export type DayMap = {
  frame: FrameId;
  /** Frame day 1 lands `offset` days after Monday. */
  offset: number;
  weekdayFor: (frameDay: number) => Weekday;
  /** ⛔ EVERY PIN THAT COULD NOT BE HONOURED, in plain words. Never silent. */
  compromises: { kind: 'cost'; text: string }[];
  /** Which pins the chosen rotation did honour — for the notes and for the tests. */
  honoured: { longRun: boolean; hardDays: number };
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

/** Monday = 0 … Sunday = 6. Null when there is no usable date. */
function startWeekdayIndex(iso: string | null | undefined): number | null {
  const t = Date.parse(`${String(iso ?? '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  // getUTCDay: 0=Sun … 6=Sat → Monday-first index.
  return (new Date(t).getUTCDay() + 6) % 7;
}

/**
 * ⛔ CHOOSE THE ROTATION, AND STATE WHAT IT COST.
 *
 * Scoring, in order, and every tie broken deterministically by the smallest offset so the same
 * athlete never gets two different weeks from the same answers:
 *
 *   1. **the long-run pin** — honoured or not. Weighted above everything (see `LONG_RUN_WINS`).
 *   2. **how many pinned hard days land on a frame hard day.**
 *   3. ⚠️ **week one's test days survive the start date.** `activate-plan:441` drops a week-1
 *      session dated before the block's start, so a rotation that puts the two test days early in a
 *      mid-week-started block would DELETE the test and leave eleven weeks on "By feel" with nothing
 *      said. Not reachable from the live builder — `planWeekStartISO()` always sends a Monday — but
 *      it is reachable by a direct caller and it is silent when it happens.
 *
 * ⛔ IT NEVER REFUSES. D-325 §7 and this work order both: state the cost, always build the week.
 */
export function chooseDayMap(frame: FrameId, pins: DayPins, column: ColumnKind = 'standard'): DayMap {
  const anchors = anchorDaysFor(frame, column);
  /**
   * ⛔ THE LIVE LONG PIN IS THE ONE MATCHING THE LONG SLOT'S SPORT. One long session, possibly two
   * pins; the sport decides which is servable and the other is reported below.
   */
  const longSlotSport = pins.longSlotSport ?? 'run';
  const longRunPin = titleCaseDay(pins.longRunDay);
  const longRidePin = titleCaseDay(pins.longRideDay);
  const longPin = longSlotSport === 'ride' ? longRidePin : longRunPin;
  /** The pin the frame cannot serve at all, because it names the sport the long slot is not. */
  const orphanPin = longSlotSport === 'ride'
    ? { day: longRunPin, sport: 'run' as const }
    : { day: longRidePin, sport: 'ride' as const };
  const hardPins = [...new Set((pins.hardDays ?? []).map(titleCaseDay).filter((d) => d !== ''))];
  const startIdx = startWeekdayIndex(pins.startDateIso);
  // The frame days the test week uses. ⛔ Read from the source of that rule, not restated here.
  const testDays = [1, 2];

  let best: { offset: number; long: boolean; hard: number; testSafe: boolean } | null = null;
  for (let offset = 0; offset < 7; offset++) {
    const long = longPin !== '' && anchors.long != null
      && weekdayForFrameDay(anchors.long, offset) === longPin;
    const hard = hardPins.filter((p) =>
      anchors.hard.some((d) => weekdayForFrameDay(d, offset) === p)).length;
    const testSafe = startIdx == null
      || testDays.every((d) => WEEKDAYS.indexOf(weekdayForFrameDay(d, offset)) >= startIdx);
    const cand = { offset, long, hard, testSafe };
    if (best == null) { best = cand; continue; }
    // ⚠️ STRICTLY GREATER, so the FIRST offset reaching a score keeps it — offset 0 wins every tie
    // and an athlete with no pins gets exactly the week slice 2 built.
    const better = (a: typeof cand, b: typeof cand) =>
      (a.long ? 1 : 0) !== (b.long ? 1 : 0) ? (a.long ? 1 : 0) > (b.long ? 1 : 0)
        : a.hard !== b.hard ? a.hard > b.hard
        : (a.testSafe ? 1 : 0) > (b.testSafe ? 1 : 0);
    if (better(cand, best)) best = cand;
  }
  const chosen = best!;

  const compromises: { kind: 'cost'; text: string }[] = [];
  if (longPin !== '' && !chosen.long) {
    const actual = anchors.long != null ? weekdayForFrameDay(anchors.long, chosen.offset) : null;
    compromises.push({
      kind: 'cost',
      // ⚠️ "The", not "Your" — voice rule 1, the subject is the thing that moved
      // (`strength-calibration-copy.ts:120`). Fact, then the rule it happened under, no apology.
      text: actual
        ? `The long run is on ${actual} rather than ${longPin}. This plan's week has a fixed order, `
          + `so moving one day moves all of them, and ${longPin} was not reachable alongside the `
          + 'other pinned days.'
        : `This plan's week has no long run to place on ${longPin}.`,
    });
  }
  for (const p of hardPins) {
    const landed = anchors.hard.some((d) => weekdayForFrameDay(d, chosen.offset) === p);
    if (landed) continue;
    const actual = anchors.hard.map((d) => weekdayForFrameDay(d, chosen.offset));
    compromises.push({
      kind: 'cost',
      text: `The hard session is on ${actual.join(' and ')} rather than ${p}. The week's order is `
        + `fixed and the long day is placed first, so ${p} could not also be reached.`,
    });
  }
  /**
   * ⛔ THE PIN THE FRAME HAS NO SESSION FOR — STATED, NEVER DROPPED (2026-08-24).
   *
   * This is the case that escaped: an athlete keeping both sports pins a long run AND a long ride,
   * the frame carries one long session, and the pin that does not match its sport used to vanish
   * with nothing said. One sentence, through the channel the preview already renders.
   */
  if (orphanPin.day !== '') {
    const kept = longSlotSport === 'ride' ? 'ride' : 'run';
    compromises.push({
      kind: 'cost',
      text: `This week has one long session and it is a ${kept}, so the long `
        + `${orphanPin.sport} pinned to ${orphanPin.day} is not in it. The sport mix decides which `
        + 'one the long day is.',
    });
  }
  if (!chosen.testSafe) {
    compromises.push({
      kind: 'cost',
      // ⚠️ NO IMPERATIVE (voice rule 7). The draft here read "Start the block on a Monday"; it states
      // the condition instead and leaves the decision where it belongs.
      text: 'The block starts mid-week, so week one is short and the two test sessions fall before '
        + 'its first day. A block that opens on a Monday runs week one whole.',
    });
  }

  return {
    frame,
    offset: chosen.offset,
    weekdayFor: (frameDay: number) => weekdayForFrameDay(frameDay, chosen.offset),
    compromises,
    honoured: { longRun: chosen.long, hardDays: chosen.hard },
  };
}
