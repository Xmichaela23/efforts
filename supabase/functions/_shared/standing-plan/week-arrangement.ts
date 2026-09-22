// ============================================================================
// THE WEEK ARRANGEMENT — which calendar day each of the book's numbered days lands on.
//
// ⛔ ONE JUDGE (2026-09-22, Michael: "single source of logic"). The arrangement is scored by the same
// rules that write the week's warnings (`weekConflicts`) and the same p80 lift spacing the calendar move
// uses (`move-check` `offIdeal`). A week the builder picks is a week those two would call the cleanest.
//
// ⛔ WHY IT IS NO LONGER ONLY A ROTATION. A rotation keeps every gap the book prints, and it stays the
// first choice. But p246 prints its two hard runs two days apart, so an athlete who taps two hard days
// back to back cannot be served by any rotation, and the second hard run landed on the heavy leg day
// (Michael's Wednesday + Thursday week, 2026-09-22). Rule 8 (pp.139–145): a neat seven-day microcycle is
// an artificial constraint. So every order of the seven days is tried, and the book's own order wins
// every tie.
//
// THE ORDER OF THE TERMS, each a tie-break for the one before:
//   1. nothing the book fixes (lifts, jump drills) on a day the athlete cannot train — unchanged;
//   2. the long session on the athlete's long day — unchanged;
//   3. ⛔ the fewest warnings from `weekConflicts` on the week this arrangement builds, not counting
//      a warning the book's own printed week carries, plus each day over the calendar's two-session
//      limit (`move-check` `MAX_SESSIONS_A_DAY`);
//   4. the fewest days moved out of the book's order (0 for any rotation);
//   5. lifts of one pattern closest to p80's 3–4 days apart;
//   6. the athlete's hard days on the book's hard days — unchanged;
//   7. lifting on days that already carry a pinned session — unchanged;
//   8. week one's test days after the start date — unchanged.
// ⚠️ With no pins, or pins a rotation serves cleanly, terms 3–5 tie at zero for the rotations and the
// week is exactly the one the rotation chooser built.
// ============================================================================

import { FRAMES, type ColumnKind, type FrameId } from './frames.ts';
import { isLongSlot } from './sport-slots.ts';
import {
  WEEKDAYS, frameDayOn, frameFixedDaysFor, anchorDaysFor, titleCaseDay, weekdayForFrameDay,
  type DayMap, type DayPins, type Weekday,
} from './day-map.ts';
import { weekConflicts, type ConflictRule } from './week-conflicts.ts';
import { placeEnduranceDays, type PlanSession } from './compose.ts';
import { MAX_SESSIONS_A_DAY, offIdeal } from '../move-check/index.ts';

/** Monday = 0 … Sunday = 6. Null when there is no usable date. */
function startWeekdayIndex(iso: string | null | undefined): number | null {
  const t = Date.parse(`${String(iso ?? '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return (new Date(t).getUTCDay() + 6) % 7;
}

/**
 * ⚠️ NOT A COST. p144 prescribes the cut this line reports, so it must not push a week away from the
 * book's order.
 */
const NOT_A_COST: ConflictRule[] = ['easy_run_with_heavy_legs'];

/** Every order of the seven days: the seven rotations first (offset 0 first), then the rest. */
function allOrders(): number[][] {
  const rotations: number[][] = [];
  for (let o = 0; o < 7; o++) rotations.push([0, 1, 2, 3, 4, 5, 6].map((d) => (d + o) % 7));
  const key = (xs: number[]) => xs.join('');
  const seen = new Set(rotations.map(key));
  const out = [...rotations];
  const walk = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) { if (!seen.has(key(prefix))) out.push(prefix); return; }
    for (let i = 0; i < rest.length; i++) walk([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
  };
  walk([], [0, 1, 2, 3, 4, 5, 6]);
  return out;
}
const ORDERS = allOrders();

/** Days moved out of the book's order: the fewest frame days off any single rotation, and that rotation. */
function distanceFromBook(order: number[]): { moved: number; offset: number } {
  let best = { moved: 8, offset: 0 };
  for (let o = 0; o < 7; o++) {
    const moved = order.filter((w, i) => w !== (i + o) % 7).length;
    if (moved < best.moved) best = { moved, offset: o };
  }
  return best;
}

/**
 * ⛔ THE WEEK THIS ARRANGEMENT BUILDS, IN THE SHAPE `weekConflicts` READS. Each frame day's lifting,
 * jump drills and endurance, on the weekday the arrangement gives it — and each pinned endurance
 * session on its pinned day, the way `compose.ts` `enduranceDayFor` places it (pins win, hard pins by
 * position in the frame's order).
 */
function skeletonWeek(args: {
  frame: FrameId; column: ColumnKind; order: number[];
  longPin: string; hardPins: string[]; longSlotSport: 'run' | 'ride' | 'swim'; blocked: string[];
}): PlanSession[] {
  const out: PlanSession[] = [];
  const S = (day: string, type: string, name: string, tags: string[]): PlanSession =>
    ({ day, type, name, tags, description: '', duration: 45 });
  // ⛔ THE COMPOSER'S OWN PLACEMENT — pins, the arrangement, and the step off a day off.
  const placed = placeEnduranceDays({
    frame: args.frame, column: args.column, dayOffset: args.order,
    endurancePins: {
      long: (args.longPin || null) as Weekday | null,
      hard: args.hardPins.map((d) => (d || null) as Weekday | null),
    },
    unavailableDays: args.blocked,
  } as never).days;
  for (const d of FRAMES[args.frame].columns[args.column]) {
    const wd = weekdayForFrameDay(d.day, args.order);
    if (d.strength.length > 0) {
      out.push(S(wd, 'strength', d.label ?? 'Strength', d.lowerRole ? [`lower:${d.lowerRole}`] : []));
    }
    if (d.plyo === true) out.push(S(wd, 'strength', 'Plyo warm-up', ['plyo']));
    d.endurance.forEach((slot, i) => {
      const long = isLongSlot(slot);
      const family = String(slot.family);
      const sport = long
        ? (args.longSlotSport === 'ride' ? 'ride' : 'run')
        : family.startsWith('ride_') ? 'ride' : 'run';
      out.push(S(placed.get(`${d.day}:${i}`) ?? wd, sport, family, [`family:${family}`, `sport:${sport}`]));
    });
  }
  return out;
}

/**
 * ⛔ p80 SPACING, THROUGH THE CALENDAR MOVE'S OWN RULE. Frame days that open on the same lift pattern
 * (bench on both upper days; squat and deadlift trading places on both lower days) are the same lift
 * twice a week, and p80 wants those 3–4 days apart.
 */
function spacingCost(frame: FrameId, column: ColumnKind, order: number[]): number {
  const byPattern = new Map<string, number[]>();
  for (const d of FRAMES[frame].columns[column]) {
    const patterns = new Set<string>();
    for (const s of d.strength) {
      if (s.intent !== 'ME' && s.intent !== 'DE') continue;
      if (s.role !== 'competition') continue;
      patterns.add(String(s.pattern));
      if (s.rotatesWith) patterns.add(String(s.rotatesWith));
    }
    for (const p of patterns) byPattern.set(p, [...(byPattern.get(p) ?? []), order[d.day - 1]]);
  }
  let cost = 0;
  for (const days of byPattern.values()) {
    if (days.length < 2) continue;
    const sorted = [...days].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 7;
      cost += offIdeal(next - sorted[i]);
    }
  }
  return cost;
}

/**
 * ⛔ CHOOSE THE ARRANGEMENT, AND STATE WHAT IT COST. See the header for the terms and their order.
 * ⛔ IT NEVER REFUSES. D-325 §7: state the cost, always build the week.
 */
export function chooseDayMap(
  frame: FrameId,
  pins: DayPins,
  column: ColumnKind = 'standard',
  /**
   * ⚠️ `rotationsOnly` IS THE CHOOSER AS IT WAS BEFORE 2026-09-22 — the seven rotations, ranked on the
   * pins alone. Tests that need a week which clashes on purpose (to check a warning's words) use it;
   * the builder never does.
   */
  opts: { rotationsOnly?: boolean } = {},
): DayMap {
  const anchors = anchorDaysFor(frame, column);
  const frameFixed = frameFixedDaysFor(frame, column);
  const blockedDays = new Set(
    (pins.unavailableDays ?? []).map(titleCaseDay).filter((d) => d !== ''),
  );
  const longSlotSport = pins.longSlotSport ?? 'run';
  /** ⛔ A PIN ON A DAY THE ATHLETE BLOCKED IS NOT A PIN (Michael, 2026-08-25). */
  const livePin = (raw: unknown): string => {
    const d = titleCaseDay(raw);
    return d !== '' && blockedDays.has(d) ? '' : d;
  };
  const longRunPin = livePin(pins.longRunDay);
  const longRidePin = livePin(pins.longRideDay);
  const longPin = longSlotSport === 'ride' ? longRidePin : longRunPin;
  const orphanPin = longSlotSport === 'ride'
    ? { day: longRunPin, sport: 'run' as const }
    : { day: longRidePin, sport: 'ride' as const };
  /** ⚠️ POSITIONAL, as `compose.ts` reads them: the first hard pin is the frame's first hard slot. */
  const hardByPosition = (pins.hardDays ?? []).map(livePin);
  const hardPins = [...new Set(hardByPosition.filter((d) => d !== ''))];
  const startIdx = startWeekdayIndex(pins.startDateIso);
  // OURS — `TEST_DAY_LIFTS` the test sessions sit on frame days 1 and 2 (working-number.ts).
  const testDays = [1, 2];
  const spokenFor = new Set<string>([longPin, ...hardPins].filter((d) => d !== ''));

  type Cand = {
    order: number[]; offset: number; long: boolean; blockedLifts: number; blockedFixed: number;
    hard: number; stacked: number; testSafe: boolean;
    warnings: number; moved: number; spacing: number;
  };
  const blockedHits = (order: number[], frameDays: number[]) =>
    frameDays.filter((d) => blockedDays.has(weekdayForFrameDay(d, order))).length;

  const candidates: Cand[] = (opts.rotationsOnly ? ORDERS.slice(0, 7) : ORDERS).map((order) => {
    const { moved, offset } = distanceFromBook(order);
    return {
      order,
      offset,
      long: longPin !== '' && anchors.long != null && weekdayForFrameDay(anchors.long, order) === longPin,
      blockedLifts: blockedHits(order, frameFixed.lifting),
      blockedFixed: blockedHits(order, frameFixed.fixed),
      hard: hardPins.filter((p) => anchors.hard.some((d) => weekdayForFrameDay(d, order) === p)).length,
      stacked: frameFixed.lifting.filter((d) => spokenFor.has(weekdayForFrameDay(d, order))).length,
      testSafe: startIdx == null
        || testDays.every((d) => WEEKDAYS.indexOf(weekdayForFrameDay(d, order)) >= startIdx),
      warnings: -1,
      moved,
      spacing: spacingCost(frame, column, order),
    };
  });

  /**
   * ⚠️ THE WARNINGS ARE COUNTED ONLY WHERE THEY CAN DECIDE. Terms 1–2 come first, so only the candidates
   * that tie best on those are judged — the same answer as judging all of them, for less work.
   */
  const head = (c: Cand) => [c.blockedFixed, c.blockedLifts, c.long ? 0 : 1];
  const cmpHead = (a: Cand, b: Cand) => {
    const x = head(a), y = head(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  /**
   * ⛔ A WARNING THE BOOK'S OWN WEEK CARRIES IS NOT COUNTED. p274 prints heavy legs the day before the
   * long run; the week says so, and the chooser must not move the book's days to get away from its own
   * page. Keyed by rule and FRAME days, so the same warning at any rotation is recognised.
   */
  const IDENTITY = [0, 1, 2, 3, 4, 5, 6];
  // ⚠️ THE SESSIONS ARE PART OF THE KEY: p278 prints a VO2 ride and a sweet spot ride together, which
  // does not make two sweet spot rides on that day the book's own pair.
  const keyOf = (w: { rule: ConflictRule; days: Weekday[]; sessions: string[] }, order: number[]) =>
    `${w.rule}|${w.days.map((d) => frameDayOn(d, order)).sort((a, b) => a - b).join(',')}|${[...w.sessions].sort().join(',')}`;
  const printed = new Set(
    weekConflicts({
      sessions: skeletonWeek({ frame, column, order: IDENTITY, longPin: '', hardPins: [], longSlotSport, blocked: [] }),
      frame, column, dayOffset: IDENTITY,
    }).map((w) => keyOf(w, IDENTITY)),
  );
  const top = candidates.reduce((best, c) => (cmpHead(c, best) < 0 ? c : best), candidates[0]);
  const finalists = candidates.filter((c) => cmpHead(c, top) === 0);
  for (const c of finalists) {
    if (opts.rotationsOnly) { c.warnings = 0; continue; }
    const sessions = skeletonWeek({
      frame, column, order: c.order,
      // ⚠️ THE RAW PINS, NOT `livePin`'s: the composer still places a pin that sits on a day off and then
      // steps it off that day, and the judged week has to be that week.
      longPin: titleCaseDay(longSlotSport === 'ride' ? pins.longRideDay : pins.longRunDay),
      hardPins: (pins.hardDays ?? []).map(titleCaseDay),
      longSlotSport, blocked: [...blockedDays],
    });
    /**
     * ⛔ THE CALENDAR MOVE'S DAY LIMIT, COUNTED THE SAME WAY (`move-check` `sessionsOn`: the jump drills
     * ride with their day and do not count). A day over it is one more warning.
     */
    const perDay = new Map<string, number>();
    for (const x of sessions) if (!x.tags.includes('plyo')) perDay.set(x.day, (perDay.get(x.day) ?? 0) + 1);
    const crowded = [...perDay.values()].filter((n) => n > MAX_SESSIONS_A_DAY).length;
    c.warnings = crowded + weekConflicts({ sessions, frame, column, dayOffset: c.order })
      .filter((w) => !NOT_A_COST.includes(w.rule) && !printed.has(keyOf(w, c.order))).length;
  }

  /** ⚠️ STRICTLY BETTER, so the first candidate reaching a score keeps it — rotations first, offset 0 first. */
  const better = (a: Cand, b: Cand) =>
    a.warnings !== b.warnings ? a.warnings < b.warnings
      : a.moved !== b.moved ? a.moved < b.moved
      : a.spacing !== b.spacing ? a.spacing < b.spacing
      : a.hard !== b.hard ? a.hard > b.hard
      : a.stacked !== b.stacked ? a.stacked > b.stacked
      : (a.testSafe ? 1 : 0) > (b.testSafe ? 1 : 0);
  let best: Cand | null = null;
  for (const cand of finalists) {
    if (best == null || better(cand, best)) best = cand;
  }
  const chosen = best!;
  const clearableAtAll = candidates.some((c) => c.blockedFixed === 0);

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
    const dayOf = (d: number) => weekdayForFrameDay(d, chosen.order);
    const liftHits = [...new Set(
      frameFixed.lifting.map(dayOf).filter((d) => blockedDays.has(d)),
    )];
    const plyoOnlyHits = [...new Set(
      frameFixed.fixed.map(dayOf)
        .filter((d) => blockedDays.has(d) && !liftHits.includes(d)),
    )];
    const list = (xs: string[]) =>
      xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
    // ⚠️ "THE JUMP DRILLS", NOT "PLYOMETRICS" — the row on the calendar is named `Plyometrics` and
    // the athlete can find it, but a sentence about their week says what it is.
    /**
     * ⛔ PLAIN WORDS OR NOTHING (Michael, 2026-08-26: "the way you talk makes no sense", on
     * "carries a lifting day… no arrangement… honours that pin"). The sentence is one lifter
     * telling another what happened: the day off, what landed on it, and why it would not fit
     * anywhere else. No "carries", no "honours", no "arrangement".
     */
    const named = [...liftHits, ...plyoOnlyHits];
    const what = [
      liftHits.length === 0 ? '' : liftHits.length === 1 ? 'a lifting day' : 'lifting days',
      plyoOnlyHits.length > 0 ? 'the jump drills' : '',
    ].filter(Boolean).join(' and ');
    // OURS — `chooseDayMap` compromise note wording; the counts in it are the frame's lifting days (Viada p246 / p274) and the athlete's pins, no number of ours.
    const offClause = `${list(named)} ${named.length === 1 ? 'is a day off' : 'are days off'}, `
      + `but the week still puts ${what} there`;
    const nLifts = frameFixed.lifting.length;
    const longName = `long ${longSlotSport === 'ride' ? 'ride' : 'run'}`;
    // OURS — `chooseDayMap` compromise note wording (see above).
    compromises.push({
      kind: 'cost',
      text: clearableAtAll && longPin !== '' && chosen.long
        ? `${offClause} — ${nLifts} lifting days plus the ${longPin} ${longName} don't fit any other way.`
        : `${offClause} — the week's sessions don't fit without ${named.length === 1 ? 'it' : 'them'}.`,
    });
  }
  /**
   * ⛔⛔ THE MISSED-LONG-PIN "rather than" SENTENCE IS DELETED — the same falsehood as the
   * missed-hard-pin one below (2026-08-26). `compose.ts`'s `enduranceDayFor` returns the athlete's
   * long pin UNCONDITIONALLY (`if (role === 'long' && pins.long) return pins.long`), so a long pin
   * the ROTATION could not reach is still honoured in the built week, and "The long run is on
   * Saturday rather than Sunday" described a discarded intermediate step. What survives is the one
   * case that stays true on the calendar: a pin on a week that has no long session to place.
   */
  if (longPin !== '' && anchors.long == null && !lostToADayOff((c) => c.long)) {
    const longName = `long ${longSlotSport === 'ride' ? 'ride' : 'run'}`;
    compromises.push({
      kind: 'cost',
      // OURS — `chooseDayMap` compromise note wording (see above).
      text: `Taper weeks have no ${longName}, so there is nothing to put on ${longPin}.`,
    });
  }
  /**
   * ⛔⛔ THE MISSED-HARD-PIN COMPROMISE IS DELETED, NOT REWORDED (Michael, 2026-08-26: "I wanna get
   * rid of this ai slop" → "what are you trying to say" → "its not even right" — and his built week
   * proved the last one: the note claimed Tuesday and Friday "could not be reached" while the
   * calendar showed the Hard Ride ON Tuesday and the Hard Run ON Friday).
   *
   * It was FALSE BY CONSTRUCTION under pins-win: this function chooses the LIFTING rotation, and a
   * hard pin the rotation cannot reach is still honoured downstream — `compose.ts`'s endurance
   * pinning places the session on the tapped day regardless. So the sentence described a discarded
   * intermediate step, never the built week. The client knew: `NonRaceBuilder`'s tiered-notes
   * comment (pins-win, 2026-08-25) says these rotation lines "describe an intermediate step rather
   * than the built week" and drops them wholesale on step 7 — but the confirm screen rendered the
   * server's copy unfiltered. One source of truth: the server stops writing it.
   *
   * ⚠️ AND THE PINS IT NAMED WERE OFTEN NOBODY'S — Q-287's phantom seeds (an untouched wizard
   * writes hard-day defaults that read back as athlete choices) made it fire on picks no one made.
   * That write is still Q-287's open work; nothing here fixes it, this just stops narrating it.
   *
   * ⚠️ SCOPE: the hard-pin block only. The blocked-day and long-pin compromises above state facts
   * about days that stay true in the built week; they stand.
   */
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
      // OURS — `chooseDayMap` compromise note wording (see above).
      text: `This week has one long session, and it's a ${kept}. The long `
        + `${orphanPin.sport} on ${orphanPin.day} isn't in it.`,
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
    order: [...chosen.order],
    weekdayFor: (frameDay: number) => weekdayForFrameDay(frameDay, chosen.order),
    compromises,
    honoured: {
      longRun: chosen.long,
      hardDays: chosen.hard,
      unavailableDays: chosen.blockedFixed === 0,
    },
  };
}
