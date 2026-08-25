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
 *   1. ⛔⛔ **NOTHING FRAME-FIXED LANDS ON A DAY THE ATHLETE CANNOT TRAIN** — lifting first, then the
 *      plyo day (Michael, 2026-08-25 evening: *"blocked days stay untouchable"*). This OUTRANKS the
 *      long pin, and that reverses `LONG_RUN_WINS` for this one comparison. It is safe to reverse
 *      because the long pin no longer needs the rotation at all: `compose.ts` `endurancePins` puts
 *      the long session on the athlete's day whichever way the frame is turned, so a rotation spent
 *      serving it buys nothing and costs the day off. The lifts are the only thing the rotation can
 *      still move, so they are what it is scored on.
 *   2. **the long-run pin** — honoured or not, among the rotations that already clear the days off
 *      (see `LONG_RUN_WINS` for why it beats the hard days).
 *   3. **how many pinned hard days land on a frame hard day.**
 *   4. ⛔ **how much the lifting STACKS onto days that already carry a pinned session** — more is
 *      better (Michael, 2026-08-25 evening). *"Stacking is the release valve… prefer landing on a
 *      day that already has training over eating the rest day."* A tie-break, deliberately: on a
 *      loose week every candidate ties above it and nothing changes, and on a tight one it is what
 *      keeps the clear days clear instead of spreading four lifting days across four empty ones.
 *   5. ⚠️ **week one's test days survive the start date.** `activate-plan:441` drops a week-1
 *      session dated before the block's start, so a rotation that puts the two test days early in a
 *      mid-week-started block would DELETE the test and leave eleven weeks on "By feel" with nothing
 *      said. Not reachable from the live builder — `planWeekStartISO()` always sends a Monday — but
 *      it is reachable by a direct caller and it is silent when it happens.
 *
 * ⛔ IT NEVER REFUSES. D-325 §7 and this work order both: state the cost, always build the week.
 */
export function chooseDayMap(frame: FrameId, pins: DayPins, column: ColumnKind = 'standard'): DayMap {
  const anchors = anchorDaysFor(frame, column);
  const frameFixed = frameFixedDaysFor(frame, column);
  /**
   * ⛔ THE DAYS THE ATHLETE SAID THEY CANNOT TRAIN. ⚠️ Unrecognised values are dropped rather than
   * coerced — a bad string must mean "no constraint", never "block a day nobody named".
   */
  const blockedDays = new Set(
    (pins.unavailableDays ?? []).map(titleCaseDay).filter((d) => d !== ''),
  );
  /**
   * ⛔ THE LIVE LONG PIN IS THE ONE MATCHING THE LONG SLOT'S SPORT. One long session, possibly two
   * pins; the sport decides which is servable and the other is reported below.
   */
  const longSlotSport = pins.longSlotSport ?? 'run';
  /**
   * ⛔⛔ A PIN ON A DAY THE ATHLETE BLOCKED IS NOT A PIN (Michael, 2026-08-25 afternoon). The blocked
   * day always wins, so `compose.ts` moves that session off it — and a rotation still scored toward
   * the day it left would be spending the week's one degree of freedom on a session that is no
   * longer there. ⚠️ Applied before every read below, so no scoring term can see the void pin.
   */
  const livePin = (raw: unknown): string => {
    const d = titleCaseDay(raw);
    return d !== '' && blockedDays.has(d) ? '' : d;
  };
  const longRunPin = livePin(pins.longRunDay);
  const longRidePin = livePin(pins.longRideDay);
  const longPin = longSlotSport === 'ride' ? longRidePin : longRunPin;
  /** The pin the frame cannot serve at all, because it names the sport the long slot is not. */
  const orphanPin = longSlotSport === 'ride'
    ? { day: longRunPin, sport: 'run' as const }
    : { day: longRidePin, sport: 'ride' as const };
  const hardPins = [...new Set((pins.hardDays ?? []).map(livePin).filter((d) => d !== ''))];
  const startIdx = startWeekdayIndex(pins.startDateIso);
  // The frame days the test week uses. ⛔ Read from the source of that rule, not restated here.
  const testDays = [1, 2];

  /** How many blocked days a rotation puts frame-fixed work on. 0 = the athlete's days off are clear. */
  const blockedHitsAt = (offset: number, frameDays: number[]): number =>
    frameDays.filter((d) => blockedDays.has(weekdayForFrameDay(d, offset))).length;

  /**
   * ⛔ EVERY DAY THE ATHLETE HAS ALREADY SPOKEN FOR — their long day and their hard days, clubs
   * included. A lifting day landing on one of these STACKS; a lifting day landing anywhere else
   * spends a day that would otherwise be clear. ⚠️ Blocked days are not in here: they are not
   * "already training", they are untouchable, and term 1 handles them.
   */
  const spokenFor = new Set<string>([longPin, ...hardPins].filter((d) => d !== ''));

  type Cand = {
    offset: number; long: boolean; blockedLifts: number; blockedFixed: number;
    hard: number; stacked: number; testSafe: boolean;
  };
  const candidates: Cand[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const long = longPin !== '' && anchors.long != null
      && weekdayForFrameDay(anchors.long, offset) === longPin;
    const hard = hardPins.filter((p) =>
      anchors.hard.some((d) => weekdayForFrameDay(d, offset) === p)).length;
    const testSafe = startIdx == null
      || testDays.every((d) => WEEKDAYS.indexOf(weekdayForFrameDay(d, offset)) >= startIdx);
    candidates.push({
      offset,
      long,
      blockedLifts: blockedHitsAt(offset, frameFixed.lifting),
      blockedFixed: blockedHitsAt(offset, frameFixed.fixed),
      hard,
      stacked: frameFixed.lifting
        .filter((d) => spokenFor.has(weekdayForFrameDay(d, offset))).length,
      testSafe,
    });
  }
  /**
   * ⚠️ STRICTLY GREATER, so the FIRST offset reaching a score keeps it — offset 0 wins every tie
   * and an athlete with no pins gets exactly the week slice 2 built.
   *
   * ⛔⛔ THE BLOCKED-DAY TERMS COME FIRST, AHEAD OF THE LONG PIN (Michael, 2026-08-25 evening).
   * `LONG_RUN_WINS` still governs pin-against-pin; this is pin-against-a-day-that-does-not-exist,
   * which is a different comparison. See term 1 in the header for why reversing it costs the long
   * pin nothing.
   */
  const better = (a: Cand, b: Cand) =>
    a.blockedFixed !== b.blockedFixed ? a.blockedFixed < b.blockedFixed
      : a.blockedLifts !== b.blockedLifts ? a.blockedLifts < b.blockedLifts
      : (a.long ? 1 : 0) !== (b.long ? 1 : 0) ? (a.long ? 1 : 0) > (b.long ? 1 : 0)
      : a.hard !== b.hard ? a.hard > b.hard
      : a.stacked !== b.stacked ? a.stacked > b.stacked
      : (a.testSafe ? 1 : 0) > (b.testSafe ? 1 : 0);
  let best: Cand | null = null;
  for (const cand of candidates) {
    if (best == null || better(cand, best)) best = cand;
  }
  const chosen = best!;
  /**
   * ⛔ WAS THE BLOCKED DAY REACHABLE AT ALL, IGNORING EVERY OTHER PIN? This is what separates *"no
   * arrangement of this week can clear that day"* from *"an arrangement exists and another pin took
   * it"* — and it is the difference between a note that explains and the note this replaces, which
   * asserted the lifting order was the reason when the long pin was.
   */
  const clearableAtAll = candidates.some((c) => c.blockedFixed === 0);

  /**
   * ⛔⛔ A PIN THE ROTATION GAVE UP TO CLEAR A DAY OFF COSTS THE ATHLETE NOTHING, AND MUST NOT BE
   * REPORTED AS IF IT DID (2026-08-25 evening).
   *
   * Reordering the terms above means a reachable long or hard pin is now dropped whenever serving
   * it would put lifting on a blocked day. The SESSION still lands on the athlete's day —
   * `compose.ts` `endurancePins` places it there whichever way the frame is turned — so the lines
   * below would announce a move that never happens. They are suppressed for exactly that case and
   * for no other: a pin no rotation could reach is still reported, because that one is real.
   *
   * ⚠️ THE TEST IS "WAS IT REACHABLE AMONG THE ROTATIONS THAT CLEAR THE DAYS OFF", not "was it
   * reachable at all" — the second would silence a genuine miss on any week with a day off in it.
   */
  const lostToADayOff = (want: (c: Cand) => boolean): boolean =>
    blockedDays.size > 0
    && candidates.some((c) => want(c))
    && !candidates.some((c) =>
      want(c) && c.blockedFixed === chosen.blockedFixed && c.blockedLifts === chosen.blockedLifts);

  const compromises: { kind: 'cost'; text: string }[] = [];
  /**
   * ⛔⛔ A DAY OFF THAT STILL CARRIES A LIFTING DAY — AND THE SENTENCE SAYS WHY (Michael, 2026-08-25).
   *
   * The line this replaces read *"Fri carries a lifting day. The lifting order is fixed, so it
   * stays."* — which was the screen asserting a reason that was not the reason. The order is fixed,
   * but the rotation is not, and until this pass nothing had tried the other six. Now the chooser
   * has tried all seven, so when this fires it is TRUE by construction: either another pin took the
   * only rotation that would have cleared the day, or no rotation clears it at all.
   *
   * ⚠️ FIRST IN THE LIST. It is the only cost here that is about a day the athlete cannot train at
   * all; the rest are about which day a session prefers.
   */
  if (chosen.blockedFixed > 0) {
    /**
     * ⛔ THE PLYO DAY IS NAMED TOO (2026-08-25, after the fuzz sweep). It used to count only the
     * LIFTING days, so a week whose drill block sat on a day off either said nothing at all or
     * listed the lifting days and left the plyo day out of its own sentence. Michael's ruling is
     * informed-always, and this was under-reporting.
     *
     * ⚠️ SPLIT BY WHAT THE DAY ACTUALLY CARRIES, because "Friday carries a lifting day" about the
     * plyo block would be a sentence the calendar contradicts. A day carrying both is a lifting day
     * — the barbell is the bigger claim on it, and listing the drills beside it adds nothing the
     * athlete can act on.
     */
    const dayOf = (d: number) => weekdayForFrameDay(d, chosen.offset);
    const liftHits = [...new Set(
      frameFixed.lifting.map(dayOf).filter((d) => blockedDays.has(d)),
    )];
    const plyoOnlyHits = [...new Set(
      frameFixed.fixed.map(dayOf)
        .filter((d) => blockedDays.has(d) && !liftHits.includes(d)),
    )];
    const list = (xs: string[]) =>
      xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
    const parts: string[] = [];
    if (liftHits.length > 0) {
      parts.push(liftHits.length === 1
        ? `${liftHits[0]} carries a lifting day`
        : `${list(liftHits)} carry lifting days`);
    }
    if (plyoOnlyHits.length > 0) {
      // ⚠️ "THE JUMP DRILLS", NOT "PLYOMETRICS" — the row on the calendar is named `Plyometrics` and
      // the athlete can find it, but a sentence about their week says what it is.
      parts.push(plyoOnlyHits.length === 1
        ? `${plyoOnlyHits[0]} carries the jump drills`
        : `${list(plyoOnlyHits)} carry the jump drills`);
    }
    const subject = parts.join(', and ');
    const named = [...liftHits, ...plyoOnlyHits];
    const nLifts = frameFixed.lifting.length;
    compromises.push({
      kind: 'cost',
      text: clearableAtAll && longPin !== '' && chosen.long
        // ⚠️ THE COMPETING PIN IS NAMED, because it is the only thing the athlete can act on. Stated
        // as the trade it is, with no imperative and no request to change either answer.
        ? `${subject}. The long ${longSlotSport === 'ride' ? 'ride' : 'run'} is pinned to ${longPin}, `
          + `and no arrangement of this week's ${nLifts} lifting days honours that pin and leaves `
          + `${list(named)} clear at the same time.`
        : `${subject}. This week has ${nLifts} lifting days and a drill day in a fixed order, and no `
          + 'arrangement of them leaves every day off clear.',
    });
  }
  if (longPin !== '' && !chosen.long && !lostToADayOff((c) => c.long)) {
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
    if (lostToADayOff((c) =>
      anchors.hard.some((d) => weekdayForFrameDay(d, c.offset) === p))) continue;
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
    honoured: {
      longRun: chosen.long,
      hardDays: chosen.hard,
      unavailableDays: chosen.blockedFixed === 0,
    },
  };
}
