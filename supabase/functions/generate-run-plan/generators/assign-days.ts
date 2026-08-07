// =============================================================================
// assign-days — the run week's day placement, and the athlete's pins are read
// =============================================================================
//
// ⛔ WHY THIS FILE EXISTS. Placement lived inline in `base-generator.assignDaysToSessions`, which
// six generators inherit, and it was a fixed grid: long run on Sunday, quality on Tuesday/Thursday,
// easy on Monday/Wednesday/Friday, Saturday shut. No input could change any of it. The intake asked
// the athlete which day their long run was and which night their run club met, stored both in
// `preferred_days`, and the generator never read either.
//
// Michael, 2026-08-05, looking at a plan that put an Easy Run on the Wednesday he had just pinned as
// his club night: *"we need to juggle whether run club is quality day ... placement should be
// figured out."* The screen above the picker said **"The plan puts its hard running there."** It did
// not, and nothing anywhere said so.
//
// ⛔ AND IT IS A HARD CONSTRAINT, NOT A SCORING MISS. `SPEC-week-solver` §0a #1: a user-pinned
// anchor is immovable, outranking everything below it. Michael, 2026-07-27: *"the athlete states a
// pin and the engine silently returns a different day — that's the glass-box promise broken at the
// input layer. A wrong placement can at least explain itself; this one can't, because nothing knows
// it happened."*
//
// ⚠️ THIS IS NOT THE WEEK SOLVER, AND IT IS NOT PRETENDING TO BE. `_shared/week-solver.ts` is built
// and has already taken the strength path (`strength-primary-plan.ts:67` — "STEP 1 OF THE
// COLLAPSE"). It has not taken the run generators, and taking them is the §7 collapse, not this
// change. `anchor-honoured.red.test.ts` argued against patching a module scheduled for deletion —
// *"the same call made on Q-206"* — and that argument was right while the only cost was theoretical.
// It stopped being theoretical when a live intake started collecting the pin and promising to honour
// it. What this file does is READ THE TWO PINS AND STOP DROPPING SESSIONS. It adds no scoring, no
// relaxation ladder, no methodology model. When the solver takes these callers, this goes with them.
//
// ⚠️ EXPORTED AS A PURE FUNCTION SO THE TRIPWIRE CAN TEST THE REAL THING. The red tests used to
// assert against a hand-copied mirror of the grid ("lifted verbatim ... it is a mirror, and a mirror
// that drifts is worse than no test"). A mirror can never go green by fixing the original. Now they
// import this.

import type { Session } from '../types.ts';

export const WEEK_ORDER = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;
export type WeekDay = (typeof WEEK_ORDER)[number];

/**
 * The athlete's pins, as stored in `goals.training_prefs.preferred_days`.
 *
 * ⚠️ Day names arrive lowercase from the client (`DayName` in `non-race-goal-seeds.ts`) and
 * Title-case from anything that has already been through a generator. Both are accepted; anything
 * else is discarded rather than guessed at — a pin nobody can resolve is not a pin.
 */
export type PlacementPins = {
  long_run?: string | null;
  quality_run?: string | null;
  easy_run?: string | null;
  /** The days the athlete said they can train. Absent/empty = every day is available. */
  training_days?: string[] | null;
  /** Days declared as FULL rest. Held harder than the derived rest day, released last. */
  rest_days?: string[] | null;
};

const HARD_TAGS = ['hard_run', 'intervals', 'tempo', 'threshold'];

/** Normalise `'wednesday'` / `'Wednesday'` / `'WED'`-ish input to a real weekday, or null. */
export function toWeekDay(v: string | null | undefined): WeekDay | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return WEEK_ORDER.find((d) => d.toLowerCase() === s || d.toLowerCase().startsWith(s.slice(0, 3))) ?? null;
}

/**
 * ⛔ THE REST DAY IS THE DAY BEFORE THE LONG RUN — DERIVED, NOT NAMED.
 *
 * The old code said `const restDays = new Set(['Saturday'])` and its own comment gave the reason:
 * *"Saturday is ALWAYS a rest day (prep for Sunday long run)"*. So Saturday was never really about
 * Saturday — it was about the day before the long run, with Sunday assumed. Deriving it keeps that
 * intent exactly, and keeps today's output byte-identical for every athlete whose long run is on a
 * Sunday, while an athlete who runs long on Saturday now gets their Friday easy instead of a rest
 * day parked in the middle of their week for no reason.
 */
export function dayBeforeLongRun(longRun: WeekDay): WeekDay {
  const i = WEEK_ORDER.indexOf(longRun);
  return WEEK_ORDER[(i + WEEK_ORDER.length - 1) % WEEK_ORDER.length];
}

function isHard(s: Session): boolean {
  return s.tags.some((t) => HARD_TAGS.includes(t));
}

/**
 * Place a week's sessions onto days, honouring the athlete's pins.
 *
 * Order of authority, highest first:
 *  1. A day the session already carries (recovery/taper weeks assign their own — untouched).
 *  2. The athlete's pinned long-run day. Hard constraint; defaults to Sunday when unpinned.
 *  3. The athlete's pinned quality day (their club night) for the week's hard session.
 *  4. The athlete's pinned easy day, when the club run is an easy/social one.
 *  5. The engine's defaults — quality Tuesday/Thursday, easy Monday/Wednesday/Friday.
 *
 * ⛔ NO SESSION IS SILENTLY DROPPED. The old loop `break`-ed out of a day list and, if every day in
 * it was taken, simply never pushed the session — a seven-session week came back with six, and
 * nothing recorded which one went or why. Any session that cannot reach a preferred day now falls
 * through to any free day, and the rest day is released before a session is lost. Rest is a
 * heuristic; a workout the plan said you were doing is not.
 */
export function assignDays(sessions: Session[], pins?: PlacementPins | null): Session[] {
  const longRunDay = toWeekDay(pins?.long_run) ?? 'Sunday';
  const pinnedQuality = toWeekDay(pins?.quality_run);
  const pinnedEasy = toWeekDay(pins?.easy_run);
  /**
   * ⛔ THE DAYS THE ATHLETE SAID THEY CAN TRAIN (2026-08-06). Until now the only rest this function
   * knew about was the one it DERIVED — the day before the long run — so "I can't run Thursdays" had
   * nowhere to go. The intake asks now, and an answer nothing reads is the defect this file's own
   * header was written about.
   *
   * ⚠️ A PREFERENCE, NOT A WALL — same rule as the derived rest day directly below. If the week's
   * sessions cannot fit inside the days they gave, the extra session takes a non-training day rather
   * than vanishing: a workout the plan said you were doing outranks a heuristic about your calendar.
   */
  const trainingDays = Array.isArray(pins?.training_days) && pins!.training_days!.length > 0
    ? new Set(pins!.training_days!.map(toWeekDay).filter((d): d is WeekDay => !!d))
    : null;

  const out: Session[] = [];
  const usedDays = new Set<string>();

  // First pass: sessions that already carry a day keep it (recovery/taper weeks set their own).
  for (const s of sessions) {
    if (s.day) {
      usedDays.add(s.day);
      out.push(s);
    }
  }
  const remaining = sessions.filter((s) => !out.includes(s));

  // ⛔ REST IS RELEASED RATHER THAN LOSING A SESSION, and an explicit pin releases it outright — the
  // athlete telling us their club meets the night before their long run is a fact about their week,
  // not a preference for the engine to weigh. The client warns about that collision at the point of
  // entry (`NonRaceBuilder` — hard days want 48–72h); if they keep it, it is kept.
  const restDay = dayBeforeLongRun(longRunDay);
  const pinnedOntoRest = pinnedQuality === restDay || pinnedEasy === restDay;
  const needsEveryDay = sessions.length > WEEK_ORDER.length - 1;
  const restHeld = !pinnedOntoRest && !needsEveryDay ? restDay : null;

  /** Days the athlete asked to have off entirely. Their own answer, so it outranks the derived one. */
  const declaredRest = new Set(
    (pins?.rest_days ?? []).map(toWeekDay).filter((d): d is WeekDay => !!d),
  );
  const free = (d: WeekDay) =>
    !usedDays.has(d) && d !== restHeld && !declaredRest.has(d) && (!trainingDays || trainingDays.has(d));
  /** Second pass: spend the DERIVED rest day, but still not one the athlete asked for. */
  const freeOutsideDeclaredRest = (d: WeekDay) => !usedDays.has(d) && !declaredRest.has(d);
  /** Last resort, so a session is never dropped — see the header. */
  const freeAnywhere = (d: WeekDay) => !usedDays.has(d);
  const take = (s: Session, d: WeekDay) => {
    s.day = d;
    usedDays.add(d);
    out.push(s);
  };
  /** Try each day in order; fall through to ANY free day rather than drop the session. */
  const place = (s: Session, order: readonly WeekDay[]) => {
    for (const d of order) if (free(d)) return take(s, d);
    for (const d of WEEK_ORDER) if (free(d)) return take(s, d);
    // Outside their pinned days, but still honouring the rest they asked for.
    for (const d of WEEK_ORDER) if (freeOutsideDeclaredRest(d)) return take(s, d);
    // Every other day is taken. A workout the plan said you were doing outranks a day off.
    for (const d of WEEK_ORDER) if (freeAnywhere(d)) return take(s, d);
    // Every day in the week is occupied. Nothing is dropped silently — the session keeps whatever
    // day it had and travels on, so a caller counting sessions in equals sessions out still balances.
    out.push(s);
  };

  const dedupe = (days: (WeekDay | null)[]): WeekDay[] => {
    const seen = new Set<WeekDay>();
    const res: WeekDay[] = [];
    for (const d of days) {
      if (d && d !== longRunDay && !seen.has(d)) { seen.add(d); res.push(d); }
    }
    return res;
  };

  // The pin leads, the engine's defaults follow, then whatever is left — so a pinned Wednesday takes
  // the hard session and the SECOND hard session still lands on a sensible default rather than nowhere.
  const qualityOrder = dedupe([pinnedQuality, 'Tuesday', 'Thursday', ...WEEK_ORDER]);
  const easyOrder = dedupe([pinnedEasy, 'Monday', 'Wednesday', 'Friday', ...WEEK_ORDER]);

  for (const s of remaining.filter((x) => x.tags.includes('long_run'))) {
    place(s, [longRunDay]);
  }
  for (const s of remaining.filter((x) => !x.tags.includes('long_run') && isHard(x))) {
    place(s, qualityOrder);
  }
  for (const s of remaining.filter((x) => !x.tags.includes('long_run') && !isHard(x))) {
    place(s, easyOrder);
  }

  return out;
}
