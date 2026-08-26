// ============================================================================
// WHAT THIS WEEK CAN HOLD — the bound the typed miles and hours live inside.
//
// ⛔ `DECISIONS-2026-08-21-standing-plan.md` §3c, Michael's own call and the oldest open item on the
// Standing Plan: *"THE VOLUME NUMBER STAYS — BOUNDED BOTH ENDS."* The athlete still types a number;
// the number is bounded by what the slots can actually deliver, **so it can no longer be a promise
// the plan breaks.** Cap = the longest option in every slot summed. Floor = the shortest.
//
// ⛔⛔ AND THE CAP MOVES WITH THE SPORT MIX — his words: *"putting the long day on the bike gives a
// different mileage ceiling than running it. Computed from the athlete's slot assignment, never
// fixed."* That is why this is a function of the SLOTS rather than a constant, and why it is
// client-reachable: the wizard recomputes it as the athlete changes a sport, which is a contract the
// library header already wrote down (*"a server round-trip there rebuilds the latency defect that
// was just deleted"*).
//
// ⛔ THE DIAL IS `size`, NOT THE LEVEL. p275: *"Adjusting intensity and estimated threshold figures
// is always better than extending distance or increasing level for this program."* §3d caps session
// length at the book's numbers. So everything here moves `size` inside the level the frame assigned,
// and a target that would need a bigger level is simply out of reach — correctly.
//
// ⛔ AND THE NUMBER NEVER CHOOSES THE SPORTS (Michael, 2026-08-26): *"these picks hold up to 6 — put
// the long day on the run."* The sentence names the lever; the athlete moves it. Type-15-get-15
// regardless of the picks is explicitly not the feature.
// ============================================================================

import {
  buildEnduranceSession, sessionDurationBandSeconds,
  type EnduranceAnchors, type FamilyId, type Level,
} from '../endurance-library/index.ts';

/** One endurance slot as the composer has it once sports are assigned. */
export type SlotSpec = {
  family: FamilyId;
  level: Level;
  archetype?: string;
  sport: 'run' | 'ride' | 'swim';
};

/** What one slot delivers at the two ends of its own dial. */
export type SlotSpan = {
  spec: SlotSpec;
  /** Clocked minutes at `size` 0 and 1. */
  minLo: number;
  minHi: number;
  /** ⚠️ ESTIMATED miles — see `milesOf`. Zero for a ride or a swim. */
  miLo: number;
  miHi: number;
};

const SECONDS_PER_MIN = 60;

/**
 * ⛔⛔ MILES ARE ESTIMATED, AND THE COPY SAYS "ABOUT" BECAUSE OF THIS LINE.
 *
 * ⚠️ `totals.meters` IS NULL FOR EVERY RUN FAMILY IN THIS FRAME — checked, not assumed. They are all
 * time-prescribed (`longrun_Xmin_easypace`, `run_easy_Xmin`, and the interval tokens carry reps
 * rather than a session distance), so there is no prescribed distance to read and the mileage has to
 * be derived from the clock and the athlete's own pace.
 *
 * ⚠️ TWO PACES, BECAUSE ONE WOULD BE WRONG IN BOTH DIRECTIONS. Work at threshold covers more ground
 * per minute than a warm-up does; charging the whole session at easy pace understates a hard run and
 * charging it all at threshold overstates every session in the week. So: work seconds at the
 * session's own anchor, everything else at the athlete's easy pace.
 * ⚠️ NO PACE ON FILE → NO ESTIMATE, rather than a guessed one. A cap computed off an invented pace
 * is the confident-wrong-answer shape this codebase keeps deleting; the caller renders no line.
 */
function milesOf(session: ReturnType<typeof buildEnduranceSession>): number {
  if (session.sport !== 'run') return 0;
  const work = session.anchor.value;
  const easy = session.anchor.vt1SecPerMi ?? work;
  if (!work || !easy || work <= 0 || easy <= 0) return 0;
  const workSec = Math.max(0, session.totals.workSeconds);
  const restSec = Math.max(0, session.totals.clockedSeconds - workSec);
  return workSec / work + restSec / easy;
}

/** Build one slot at one point of its dial. ⚠️ Returns null when the library refuses the shape. */
function at(spec: SlotSpec, anchors: EnduranceAnchors, size: number) {
  try {
    return buildEnduranceSession({
      family: spec.family, level: spec.level, archetype: spec.archetype, anchors, size,
    });
  } catch {
    // ⚠️ AN ARCHETYPE THE LEVEL DOES NOT OFFER IS NOT A CRASH HERE. The composer resolves that
    // question itself; this module's job is a bound, and a slot it cannot build contributes none.
    return null;
  }
}

/**
 * ⛔ EACH SLOT'S TWO ENDS, MEASURED. Two builds per slot and no more — everything below reuses this.
 *
 * ⚠️ MEASURED RATHER THAN ASSUMED LINEAR. `size` lerps the band linearly, but the block builders
 * round to whole reps and steps, so the interior is a staircase and only the ENDS are exact. That is
 * the whole reason the athlete-facing number says "about", and the reason `sizeFor` below solves on
 * the endpoints and lets the built week land near the answer rather than on it.
 */
export function slotSpans(specs: SlotSpec[], anchors: EnduranceAnchors): SlotSpan[] {
  const out: SlotSpan[] = [];
  for (const spec of specs) {
    /**
     * ⛔⛔ THE DURATION BAND IS `sessionDurationBandSeconds`', NOT THIS FILE'S. It is stage 1's own
     * answer to "shortest and longest this slot can be", it is what the wizard's
     * `standing-plan-week-bounds.ts` already renders the volume field's range from, and a second
     * sum here is precisely the ask-15-get-20 shape both of those exist to kill. ⚠️ The slot's
     * ARCHETYPE is passed, so the bound reflects the shape the athlete actually picked rather than
     * the widest shape the level offers.
     */
    const band = (() => {
      try {
        return sessionDurationBandSeconds(spec.family, spec.level, { anchors, archetype: spec.archetype });
      } catch {
        return null;
      }
    })();
    if (!band) continue;
    /**
     * ⚠️ RUNS ARE STILL BUILT, and only runs, because MILES are not a duration. `milesOf` needs the
     * session's work/rest split and its resolved pace, neither of which a duration band carries.
     * A ride or a swim contributes no mileage and is never built here.
     */
    const lo = spec.sport === 'run' ? at(spec, anchors, 0) : null;
    const hi = spec.sport === 'run' ? at(spec, anchors, 1) : null;
    out.push({
      spec,
      minLo: band.shortest / SECONDS_PER_MIN,
      minHi: band.longest / SECONDS_PER_MIN,
      miLo: lo ? milesOf(lo) : 0,
      miHi: hi ? milesOf(hi) : 0,
    });
  }
  return out;
}

export type VolumeBound = {
  /** The shortest and longest this sport's slots can deliver, in the sport's own unit. */
  floor: number;
  cap: number;
  /** How many sessions the bound is summed over. Zero means the sport is not in this week. */
  sessions: number;
};

/** ⛔ Miles for the run, HOURS for the ride — the units the two fields are typed in. */
export type WeekVolumeBounds = { run: VolumeBound; ride: VolumeBound };

const EMPTY: VolumeBound = { floor: 0, cap: 0, sessions: 0 };

/**
 * ⛔ THE WEEK'S BOUND, PER SPORT — §3c's cap and floor, computed from the athlete's own slot picks.
 *
 * ⚠️ THE ADVANCED TIER'S EXTRA RUNS ARE IN THE ARITHMETIC. `advancedTierSessions` adds one or two
 * easy runs for an athlete whose demonstrated volume earns them, and they are real miles in the
 * built week — a cap that ignored them would understate by a session or two for exactly the athletes
 * closest to the ceiling. ⛔ The TIER's own gate is unchanged and is not this module's business:
 * pass the count in, it is not decided here.
 */
export function weekVolumeBounds(
  specs: SlotSpec[],
  anchors: EnduranceAnchors,
): WeekVolumeBounds {
  const spans = slotSpans(specs, anchors);
  const sum = (sport: 'run' | 'ride', pick: (s: SlotSpan) => number) =>
    spans.filter((s) => s.spec.sport === sport).reduce((t, s) => t + pick(s), 0);
  const count = (sport: 'run' | 'ride') => spans.filter((s) => s.spec.sport === sport).length;
  const runN = count('run');
  const rideN = count('ride');
  return {
    run: runN === 0 ? EMPTY : {
      floor: sum('run', (s) => s.miLo),
      cap: sum('run', (s) => s.miHi),
      sessions: runN,
    },
    // ⚠️ HOURS, because that is the unit the ride field is typed in and the unit the source states
    // the cycling durations in. Converting at the edge would put two units in one number.
    ride: rideN === 0 ? EMPTY : {
      floor: sum('ride', (s) => s.minLo) / 60,
      cap: sum('ride', (s) => s.minHi) / 60,
      sessions: rideN,
    },
  };
}

export type SizeSolve = {
  /** The dial position every slot of this sport is built at. */
  size: number;
  /** Where the answer landed against the athlete's ask. */
  verdict: 'at_target' | 'over_cap' | 'under_floor' | 'no_target';
  /** What the week will hold at that size, in the sport's unit. */
  expected: number;
};

/**
 * ⛔ WHERE TO SET THE DIAL SO THE WEEK LANDS ON THE NUMBER THE ATHLETE TYPED.
 *
 * ⛔ SOLVED ON THE MEASURED ENDPOINTS, NOT SEARCHED. Total duration is monotonic in `size` and the
 * band it lerps is linear, so one division answers it — and the alternative, bisection, would have
 * cost sixteen thousand extra session builds every time the fuzz harness runs. The staircase in the
 * interior is why the built week lands NEAR the number rather than on it, which is what "about"
 * in the athlete-facing line is honest about.
 *
 * ⚠️ ONE SIZE FOR THE WHOLE SPORT rather than per session. A per-slot solve would let the engine
 * shrink the long ride to nothing while leaving a hard session at full length, which is a different
 * week rather than a smaller one — and §3d's whole point is that a session may not leave its own
 * band. Moving every slot together keeps the week's SHAPE and changes only its size.
 * ⚠️ ABSENT TARGET IS NOT ZERO. No number typed means no opinion, and the dial stays at the
 * library's own default — the midpoint every block before this shipped at.
 */
export const DEFAULT_SIZE = 0.5;

export function sizeFor(
  spans: SlotSpan[],
  sport: 'run' | 'ride',
  target: number | null | undefined,
): SizeSolve {
  const mine = spans.filter((s) => s.spec.sport === sport);
  const lo = mine.reduce((t, s) => t + (sport === 'run' ? s.miLo : s.minLo / 60), 0);
  const hi = mine.reduce((t, s) => t + (sport === 'run' ? s.miHi : s.minHi / 60), 0);
  const want = Number(target);
  if (mine.length === 0 || !Number.isFinite(want) || want <= 0) {
    return { size: DEFAULT_SIZE, verdict: 'no_target', expected: lo + (hi - lo) * DEFAULT_SIZE };
  }
  // ⚠️ A SPORT WITH NO RANGE AT ALL — every slot flat, as the level-3 sweet-spot block is. The dial
  // cannot move it, so the answer is its one length and the verdict says which side of it the ask is.
  if (hi <= lo) {
    return {
      size: DEFAULT_SIZE,
      verdict: want > hi ? 'over_cap' : want < lo ? 'under_floor' : 'at_target',
      expected: lo,
    };
  }
  if (want >= hi) return { size: 1, verdict: want > hi ? 'over_cap' : 'at_target', expected: hi };
  if (want <= lo) return { size: 0, verdict: want < lo ? 'under_floor' : 'at_target', expected: lo };
  const size = (want - lo) / (hi - lo);
  return { size: Math.min(1, Math.max(0, size)), verdict: 'at_target', expected: want };
}

// ── WHAT THE ATHLETE READS ───────────────────────────────────────────────────────────────────────
//
// ⛔ `COPY-VOICE.md`'s grammar: **[observable fact], [conditional consequence]**. Subject is the
// picks or the week, never "you" (rule 1). No imperatives — the lever is stated, not ordered
// (rule 7). "About", because the mileage is an estimate and `milesOf` says why (rule 5 wants a
// number; rule 6 forbids fake precision, and these two meet at "about").
//
// ⛔ AND IT NAMES THE LEVER, WHICH IS THE WHOLE POINT (Michael, 2026-08-26): *"these picks hold up
// to 6 — put the long day on the run."* A ceiling with no way past it is a wall; a ceiling with the
// lever beside it is a choice. ⛔ The engine never pulls that lever itself — the number sizes the
// week, it never re-points a slot to another sport.

/** `4.3` → `about 4 miles`; `1.75` → `about 1h45`. The unit each field is typed in. */
export function sayMiles(n: number): string {
  return `about ${Math.round(n)} ${Math.round(n) === 1 ? 'mile' : 'miles'}`;
}

export function sayHours(n: number): string {
  const mins = Math.round(n * 60 / 5) * 5;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `about ${m} minutes`;
  return m === 0 ? `about ${h}h` : `about ${h}h${String(m).padStart(2, '0')}`;
}

/**
 * ⛔ THE VERDICT FROM A BOUND ALONE — for a caller that already HAS the cap and the floor and does
 * not need the dial.
 *
 * ⚠️ IT EXISTS SO THE WIZARD DOES NOT COMPUTE A THIRD BOUND. `standing-plan-week-bounds.ts` has
 * summed the screen's slots since 2026-08-24 and the volume field already ranges over its answer;
 * asking it again here would be the ask-15-get-20 shape one layer up. The client passes what it
 * already has and gets the same sentence the composer writes.
 */
export function verdictFor(bound: VolumeBound, target: number | null | undefined): SizeSolve {
  const want = Number(target);
  if (bound.sessions === 0 || !Number.isFinite(want) || want <= 0) {
    return { size: DEFAULT_SIZE, verdict: 'no_target', expected: bound.cap };
  }
  if (want > bound.cap) return { size: 1, verdict: 'over_cap', expected: bound.cap };
  if (want < bound.floor) return { size: 0, verdict: 'under_floor', expected: bound.floor };
  return { size: DEFAULT_SIZE, verdict: 'at_target', expected: want };
}

/**
 * ⛔ THE LIVE LINE UNDER THE FIELD — §3c's *"up to about X miles a week on this plan."* Recomputed
 * by the wizard as the athlete changes a sport, which is why it lives here and not on a screen.
 *
 * ⚠️ NULL WHEN THE SPORT IS NOT IN THE WEEK, or when no pace is on file to estimate miles from —
 * `milesOf` returns zero rather than guessing, and a "up to about 0 miles" line would be the
 * confident wrong answer this codebase keeps deleting. Silence is the honest arm.
 */
export function capLine(bound: VolumeBound, sport: 'run' | 'ride'): string | null {
  if (bound.sessions === 0 || bound.cap <= 0) return null;
  const say = sport === 'run' ? sayMiles : sayHours;
  return `These picks hold up to ${say(bound.cap)} a week.`;
}

/**
 * ⛔ WHAT THE WEEK SAYS WHEN THE NUMBER AND THE PICKS DISAGREE — and it says which way, because
 * "over" and "under" need different answers. Null when the ask is inside the bound: a week that
 * delivers the number says nothing, which is what makes the other two worth reading.
 *
 * ⚠️ THE LEVER IS ONLY OFFERED WHERE IT EXISTS. "Put the long day on the run" is a true sentence
 * only while the long day is a ride; on an all-run week the ceiling is the frame's own and there is
 * nothing to move, so the line states the ceiling and stops.
 */
export function volumeLine(
  solve: SizeSolve,
  bound: VolumeBound,
  sport: 'run' | 'ride',
  opts: { longSlotSport?: 'run' | 'ride' | 'swim' } = {},
): string | null {
  if (solve.verdict === 'at_target' || solve.verdict === 'no_target') return null;
  if (bound.sessions === 0 || bound.cap <= 0) return null;
  const say = sport === 'run' ? sayMiles : sayHours;
  if (solve.verdict === 'over_cap') {
    const leverAvailable = sport === 'run' && opts.longSlotSport === 'ride';
    return leverAvailable
      ? `These picks hold up to ${say(bound.cap)} a week. The long day is a ride — moving it to the `
        + 'run is what holds more.'
      : `These picks hold up to ${say(bound.cap)} a week, and the week is built at that ceiling.`;
  }
  // ⛔ THE FLOOR IS REAL AND §3c BOUNDS BOTH ENDS. The source has one: bouts under 10-15 minutes do
  // not trigger adaptations (p107), so the sessions cannot shrink past the shortest option the book
  // offers. The line states where the shortest week lands rather than the rule behind it.
  return `These picks run ${say(bound.floor)} a week at the shortest.`;
}
