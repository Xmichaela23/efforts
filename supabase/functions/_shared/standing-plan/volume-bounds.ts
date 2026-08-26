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
  /** Clocked minutes at `size` 0 and 1. ⛔ MINUTES — the only currency this module speaks. */
  minLo: number;
  minHi: number;
};

const SECONDS_PER_MIN = 60;

/**
 * ⛔⛔ THE MILE ESTIMATE THAT STOOD HERE IS DELETED (Michael, 2026-08-26), and deleting it is the
 * point rather than a side effect.
 *
 * It derived weekly MILES from the clock and the athlete's pace, because the running field asked in
 * miles. His ruling: *"then we use hours."* Viada prescribes in TIME throughout — VT1 by duration
 * (p235, *"the level refers almost strictly to duration"*), LSD in hours, cycling endurance in hours
 * (p239) — so the miles were never his, they were **our conversion at an assumed pace**, and the
 * "about" hedge on every sentence existed only to cover it.
 *
 * ⛔ ASKING IN HOURS REMOVES THE CONVERSION INSTEAD OF HIDING IT. There is no pace in this module
 * any more, no estimate, and nothing to hedge. ⚠️ `target_weekly_miles` still exists and still means
 * miles for its own five readers — it is a different field, not this one renamed.
 */

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
    out.push({
      spec,
      minLo: band.shortest / SECONDS_PER_MIN,
      minHi: band.longest / SECONDS_PER_MIN,
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
  // ⛔ HOURS ON BOTH SPORTS. One currency, the book's own — see the note where the mile estimate
  // used to be. A second unit in this return is how the run field and the ride field came to mean
  // different things in the first place.
  return {
    run: runN === 0 ? EMPTY : {
      floor: sum('run', (s) => s.minLo) / 60,
      cap: sum('run', (s) => s.minHi) / 60,
      sessions: runN,
    },
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
  const lo = mine.reduce((t, s) => t + s.minLo / 60, 0);
  const hi = mine.reduce((t, s) => t + s.minHi / 60, 0);
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

/** `1.75` → `about 1h45`; `0.83` → `about 50 minutes`. Hours in, always. */
/**
 * ⛔⛔ THE OPTIONS, AND THEY ARE THE SAME ON BOTH SPORTS (Michael, 2026-08-26, final): *"no time
 * buckets — 1,2,3,4,5,6 hours for both ride and run. If someone runs an hour a week and they only
 * pick one run, worst case they get the cap on the hard session."*
 *
 * ⛔ ALWAYS OFFERED IN FULL. No per-shape filtering, no ranges, no hiding a sport's field. Earlier
 * drafts filtered the list to what the picks could build and then had to explain the gaps; this
 * needs no explanation because **the low end resolves by itself** — an ask under what the week's
 * fixed sessions already total simply builds those sessions. His own worst case, stated: one hard
 * run, one hour asked, and the athlete gets the ~50-minute hard run the book prescribes.
 * ⚠️ THAT IS WHY NO CAP, FLOOR OR OVER-CAP SENTENCE EXISTS ANYWHERE ON THIS SCREEN. The one line
 * that remains is `fixedHoursLine`, which names what does not move and says the rest is easy.
 */
/**
 * ⛔⛔ THE TOPS TRACE TO THE FRAME'S OWN ARITHMETIC (Michael, 2026-08-26): *"7 and 11 so when people
 * go why? we have something to point to."* Every offered value must be buildable on some shape, and
 * the top must be a number with a derivation behind it.
 *
 * ⛔ THE RIDE'S TOP IS 11, AND IT CHECKS OUT. The widest ride week — all four slots on the bike at
 * their caps (7h05) plus an easy ride on each of the three days the frame leaves clear (3 × 1h40) —
 * reaches **12h05**, and several mixed shapes land at 11h00 and 11h15. Eleven is reachable.
 *
 * ⛔⛔ THE RUN'S TOP IS 6, NOT 7, AND THE ARITHMETIC IS WHY. The widest running week is all four
 * slots as runs at their caps — 5h14 — plus an easy run on each of the same three free days, and
 * p235 puts a level-1 easy run at 25-30 minutes. **5h14 + 3 × 30 min = 6h45.** Seven hours is not
 * buildable on ANY shape, so offering it would put a number on the menu that no week can reach,
 * which is the one thing this list exists to prevent. Six is reachable and is the number to point
 * at. ⚠️ Raising it needs a longer easy run, and p275 forbids stretching a session past its band.
 *
 * ⚠️ A LISTED VALUE MAY STILL EXCEED A PARTICULAR SHAPE — six hours of running is past what a week
 * with one run slot can hold. That case builds at that shape's own maximum and says where the hours
 * went, which is the specified behaviour and not a gap.
 */
export const WEEKLY_HOUR_OPTIONS: Record<'run' | 'ride', number[]> = {
  run: [1, 2, 3, 4, 5, 6],
  ride: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/**
 * ⛔ HOW MUCH EASY WORK THE WEEK CAN STILL TAKE. Michael: *"any additional hour will be programmed
 * easy."* The frame leaves exactly two days with no endurance on them — the two lower-body lifting
 * days — and then the rest day.
 *
 * ⚠️ THE REST DAY IS THE LAST RUNG AND IT IS THE ATHLETE'S TO SPEND. p246 gives the week one full
 * rest day; taking it costs something the frame chose deliberately, so the week says so when it goes.
 * ⚠️ PAST THAT IS STACKING onto a day that already trains, which D-452 permits as the release valve
 * — but it is not counted here, because a week that answers "more hours" by doubling up on the squat
 * day is not what the athlete asked for.
 */
export const FREE_ENDURANCE_DAYS = 2;
export const REST_DAY_RUNG = 1;

/**
 * ⛔ THE SESSION AN EXTRA HOUR IS SPENT ON — the base family at LEVEL 1, the shortest dose the source
 * offers for it: p235's VT1 level 1 is 25-30 min, p239's cycling endurance level 1 is a 60-100 min
 * easy ride. ⚠️ Level 1 rather than the frame's own level, deliberately: an APPENDED session is
 * extra work on a day the week had left clear, and the smallest real dose is the honest unit to add
 * it in. It is also what `advancedTierSessions` already appends.
 * ⛔ MEASURED, NOT WRITTEN DOWN — the hours come from the library at build time, so a band that ever
 * moves on the page moves here with it.
 */
export const EASY_FILL_SPEC: Record<'run' | 'ride', SlotSpec> = {
  run: { family: 'run_vt1', level: 1, sport: 'run' },
  ride: { family: 'ride_endurance', level: 1, archetype: 'steady', sport: 'ride' },
};

/** Hours one appended easy session adds, at its cap. */
export function easyFillHours(sport: 'run' | 'ride', anchors: EnduranceAnchors): number {
  const span = slotSpans([EASY_FILL_SPEC[sport]], anchors)[0];
  return span ? span.minHi / 60 : 0;
}

export function sayHours(n: number): string {
  const mins = Math.round(n * 60 / 5) * 5;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `about ${m} minutes`;
  return m === 0 ? `about ${h}h` : `about ${h}h${String(m).padStart(2, '0')}`;
}

/**
 * ⛔⛔ `capLine`, `volumeLine` AND `verdictFor` ARE DELETED (2026-08-26). They said the week had a
 * CEILING and were silenced hours after shipping when Michael ruled the model — *"any additional
 * hour will be programmed easy"* — and they are removed now rather than kept, because the thing that
 * replaces them exists: `fixedHoursLine` below names what does not move and says where the rest
 * goes. A silenced sentence kept "in case" is dead copy, and dead copy is what this file's own
 * history is made of.
 * ⚠️ `sayHours` survives — the replacement needs it, and it is the only formatter here.
 */

export function fixedHoursLine(
  spans: SlotSpan[],
  sport: 'run' | 'ride',
  isQuality: (s: SlotSpan) => boolean,
  isLong: (s: SlotSpan) => boolean,
): string | null {
  const mine = spans.filter((s) => s.spec.sport === sport);
  const hardSpans = mine.filter(isQuality);
  const longSpans = mine.filter(isLong);
  // ⛔ MINUTES IN THE SPANS, HOURS IN THE SENTENCE. A first draft handed `sayHours` the raw minutes
  // and printed "about 49h50" for a fifty-minute run.
  const hard = hardSpans.reduce((t, s) => t + s.minHi, 0) / 60;
  const long = longSpans.reduce((t, s) => t + s.minHi, 0) / 60;
  if (hard <= 0 && long <= 0) return null;

  const noun = sport === 'run' ? 'run' : 'ride';
  const word = sport === 'run' ? 'running' : 'riding';
  /**
   * ⚠️ THE VERB AGREES WITH THE COUNT, and the standalone-long case gets its own. A first draft
   * built the clauses as a list and printed "At most, the long ride to about 3h30." — a sentence
   * with no verb, on every week whose only fixed session is the long one.
   */
  const hardClause = hard > 0
    ? `The hard ${hardSpans.length === 1 ? `${noun} comes` : `${noun}s come`} to ${sayHours(hard)}`
    : '';
  const longClause = long > 0 ? `the long ${noun} to ${sayHours(long)}` : '';

  const head = hard > 0 && long > 0
    ? `${hardClause} and ${longClause} at most.`
    : hard > 0
      ? `${hardClause} at most.`
      : `The long ${noun} comes to ${sayHours(long)} at most.`;
  return `${head} The rest of the ${word} is easy.`;
}
