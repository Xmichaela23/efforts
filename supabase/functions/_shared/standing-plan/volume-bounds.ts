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
/**
 * ⛔⛔ THE BASE FAMILIES — the ones whose LEVEL is a dose, and the only ones this ladder touches.
 *
 * p235, VT1, in terms: *"the level refers almost strictly to duration."* For those families the
 * level IS the size, so climbing it is choosing a longer dose of the same session — not adding
 * difficulty. ⛔ QUALITY STAYS LOCKED AT THE FRAME'S LEVEL: p246 assigns `run_mlss`,
 * `run_near_threshold` and `ride_sweet_spot` their levels and p247 prices the one adjacency they
 * create. Nothing here touches them.
 *
 * ⚠️ THE RIDE'S LADDER RESTS ON A READING, AND IT IS RECORDED HERE BECAUSE THE CODE ACTS ON IT.
 * p239 says *"each level is intended to be roughly comparable in overall fatigue."* Read as "each
 * level is comparable to the OTHERS" that sentence denies a ladder — but it cannot mean that on the
 * page's own numbers: level 1 is 60-100 min and level 3 is 3.5-5h, which are not comparable in
 * fatigue by any reading. It must mean the two OPTIONS within a level are comparable, which is also
 * what makes *"do the more intense workouts sparingly"* mean anything, since the second option in
 * each level is the one with sets in it. ⛔ That resolution is OURS, not the page's.
 */
export const BASE_FAMILIES: string[] = ['run_vt1', 'run_lsd', 'ride_endurance'];

export const isBaseFamily = (family: string): boolean => BASE_FAMILIES.includes(family);

/**
 * ⛔ HOW FAR A BASE SESSION MAY CLIMB, IN MINUTES (Michael, 2026-08-26): *"easy run 25-30 → 45-60 →
 * 80-90 min (cap 90), long run to 2.5h; easy ride 60-100 → 2h10-3h30, ride caps per the bands."*
 *
 * ⛔⛔ THE LONG RUN'S CEILING IS 100, NOT 150 — SUPERSEDED THE SAME DAY, AND BY THE BOOK
 * (Michael, 2026-08-26 evening: *"His page says ninety to a hundred minutes use that."*).
 *
 * The 2h30 above was OURS: it was the top of p235's level-2 mixed-terrain band, taken as the long
 * day's cap because nothing tighter had been read. **p247 prescribes 90 to 100 minutes for THIS
 * program's long session**, and a page that names the number outranks a band we clipped ourselves.
 * ⚠️ HIS LATER RULING WINS OVER HIS EARLIER ONE. Both are his and both are dated 2026-08-26; the
 * 2.5h line was written before p247 was read back to him.
 *
 * ⚠️ WHAT IT DOES TO THE LADDER: `run_lsd` level 2 spans 68-150, so it now stops at 100 rather than
 * at the top of its own level, and level 3 (floor 104) is swallowed whole and drops out — which is
 * `ladderOf`'s existing `hi < lo` rule doing its job, not a new one. **The long run can no longer
 * absorb an athlete's extra hours**; they land on the easy sessions.
 *
 * ⚠️ AND THE PAGE FOR THAT IS p93, NOT p134 (corrected 2026-08-27). p93: lower-intensity work
 * *"can be prescribed liberally… the tolerable dose is often so high that many athletes can engage
 * in nearly the maximum effective dose every day and still recover adequately"*, and p106 says
 * consistent exposure is what matters. **p134 is about not BOLTING ON a junk recovery run**, which
 * is a different claim, and citing it for the scaling curve reads as "fill the quality first" — a
 * reading that would build a four-hour week as 95 minutes of threshold against a 25-minute easy run.
 *
 * ⚠️ A CEILING ON TOP OF THE LEVELS, not instead of them. The ladder is still the book's own level
 * bands; this clips it where the ruling is tighter than the top level.
 * ⚠️ B3 BOUNDS IT ANYWAY at *"rarely more than 2h of VT1 in one session"* — both run ceilings sit
 * well inside that, which is the check worth remembering if a cap is ever raised.
 */
export const LADDER_CEILING_MIN: Record<string, number> = {
  run_vt1: 90,
  run_lsd: 100,
  ride_endurance: 300,
};

/** One rung: a level and the minutes it spans, already clipped to the family's ceiling. */
export type Rung = {
  level: Level;
  lo: number;
  hi: number;
  /**
   * ⛔⛔ THE `size` THAT BUILDS `hi` — 1 on a rung the ceiling does not touch, and less on one it
   * does (2026-08-26).
   *
   * ⛔ THE DEFECT IT FIXES, found the moment a ceiling first landed INSIDE a level. `size` is handed
   * to the session builder as a position in the LIBRARY's band, and while every ceiling sat at or
   * above its band's top, the clipped top and the band's top were the same number and `size` 1 was
   * right by accident. Drop `run_lsd` to 100 against a 68-140 band and the top of the rung still
   * asked for `size` 1 — a 140-minute run under a 100-minute cap. **The cap leaked by the whole
   * width of the clip.**
   *
   * ⚠️ SOLVED BY MEASUREMENT, NOT BY PROPORTION. This module's own rule is that only the ENDS of a
   * band are exact — the builder rounds to whole reps and steps, so the interior is a staircase and
   * a linear inversion still overshot by four minutes. `ladderOf` bisects on real builds and takes
   * the largest size that lands AT OR UNDER the ceiling.
   *
   * ⚠️ UNCLIPPED RUNGS ARE UNCHANGED, ARITHMETICALLY IDENTICAL TO BEFORE THIS FIELD EXISTED.
   */
  sizeHi: number;
};

export type SlotSpan = {
  spec: SlotSpec;
  /** Clocked minutes at `size` 0 and 1. ⛔ MINUTES — the only currency this module speaks. */
  minLo: number;
  minHi: number;
  /**
   * ⛔ EVERY DOSE THIS SLOT CAN TAKE, in order. One rung for a quality slot — its frame level, and
   * that is the whole ladder. Several for a base slot: the frame's level and every level above it,
   * which is what lets an easy run hold more hours without a second easy run appearing.
   */
  rungs: Rung[];
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
    const rungs = ladderOf(spec, anchors);
    if (rungs.length === 0) continue;
    out.push({
      spec,
      minLo: rungs[0].lo,
      minHi: rungs[rungs.length - 1].hi,
      rungs,
    });
  }
  return out;
}

/**
 * ⛔ THE RUNGS ONE SLOT CAN TAKE — its frame level, and for a BASE family every level above it.
 *
 * ⛔⛔ THE DURATION OF EACH RUNG IS `sessionDurationBandSeconds`', NOT THIS FILE'S. That function is
 * stage 1's own answer to "shortest and longest this slot can be" and is what the wizard's
 * `standing-plan-week-bounds.ts` already renders; a second sum here is the ask-15-get-20 shape both
 * of those exist to kill. ⚠️ The slot's ARCHETYPE is passed, so the rung reflects the shape the
 * athlete actually picked. ⚠️ A level the library refuses for this archetype is skipped rather than
 * guessed at — the archetype list varies by level and the library owns which is offered.
 *
 * ⚠️ CLIMBING STARTS AT THE FRAME'S LEVEL AND ONLY GOES UP. p246 assigns the level; the ladder is
 * about holding MORE hours, so a slot never drops below the dose the frame prescribed.
 */
export function ladderOf(spec: SlotSpec, anchors: EnduranceAnchors): Rung[] {
  const ceiling = LADDER_CEILING_MIN[spec.family] ?? Infinity;
  const top: Level = isBaseFamily(spec.family) ? 3 : spec.level;
  const out: Rung[] = [];
  for (let level = spec.level; level <= top; level++) {
    const band = (() => {
      try {
        return sessionDurationBandSeconds(spec.family, level as Level, {
          anchors, archetype: spec.archetype,
        });
      } catch {
        return null;
      }
    })();
    if (!band) continue;
    const lo = band.shortest / SECONDS_PER_MIN;
    const full = band.longest / SECONDS_PER_MIN;
    // ⚠️ A RUNG THE CEILING HAS SWALLOWED WHOLE IS NOT A RUNG. Its floor is already past the cap,
    // so offering it would prescribe past the ruling that set the cap.
    if (Math.min(full, ceiling) < lo) continue;
    if (full <= ceiling) {
      out.push({ level: level as Level, lo, hi: full, sizeHi: 1 });
      continue;
    }
    /**
     * ⛔ THE CEILING LANDS INSIDE THIS LEVEL, so the top of the rung has to be SOLVED. See
     * `Rung.sizeHi` for why proportion is not good enough: the builder's interior is a staircase.
     * ⚠️ TWELVE BUILDS, AND ONLY FOR A CLIPPED RUNG. Every other rung costs nothing, and
     * `buildEnduranceSession` is arithmetic over the library's own numbers.
     */
    const clockMin = (size: number): number | null => {
      const built = at({ ...spec, level: level as Level }, anchors, size);
      const secs = (built as { totals?: { clockedSeconds?: number } } | null)?.totals?.clockedSeconds;
      return typeof secs === 'number' && secs > 0 ? secs / SECONDS_PER_MIN : null;
    };
    const floorMin = clockMin(0);
    // ⚠️ THE MEASURED FLOOR IS THE ONE THAT DECIDES. A level whose shortest build is already past
    // the cap is swallowed whole, whatever the stated band says.
    if (floorMin == null || floorMin > ceiling) continue;
    let below = 0;
    let above = 1;
    let bestSize = 0;
    let bestMin = floorMin;
    for (let i = 0; i < 12; i++) {
      const mid = (below + above) / 2;
      const m = clockMin(mid);
      if (m != null && m <= ceiling) { bestSize = mid; bestMin = m; below = mid; } else { above = mid; }
    }
    out.push({ level: level as Level, lo, hi: bestMin, sizeHi: bestSize });
  }
  return out;
}

/**
 * ⛔⛔ WHICH SPORTS ARE BELOW THE WEEK THE FRAME WOULD BUILD THEM — the low-volume tier's gate, and
 * it is DERIVED rather than picked (2026-08-27).
 *
 * ⛔ THE QUESTION THE TIER IS ACTUALLY ASKING is *"would the standard column hand this athlete more
 * than they already do?"* — so the honest gate is that comparison, not a threshold. The frame's own
 * floor is computable: every slot at its printed level, at the shortest dose the source offers. The
 * athlete's side is their logged minutes. Below the floor, the tier applies.
 *
 * ⛔ AND IT REPLACES A NUMBER THAT WAS OURS. The first version of this gate was twenty miles a week,
 * reasoned as *"the standard column's four run sessions total about three hours twenty at their
 * shortest, which is twenty miles at an easy ten-minute mile."* **That reasoning IS this function** —
 * the number was the arithmetic written down. Deriving it removes the invented figure, removes the
 * pace conversion inside it, and extends to the bike without inventing a second one.
 *
 * ⚠️ MEASURED ON THE FRAME'S LEVELS, NEVER THE TIER'S. Pass the specs as the frame prints them; the
 * floor of a week already lowered by the tier would let an athlete out of it again the next time the
 * question is asked.
 * ⚠️ PER SPORT, AND ONLY THE SPORTS THE WEEK ACTUALLY CARRIES. A mixed athlete's two run slots floor
 * far lower than four do, so the comparison is against their own week rather than a notional one.
 * ⚠️ UNKNOWN TAKES THE SMALLER WEEK. No logged sessions is not evidence of volume, and §0h's rule is
 * that an unknown week is not licence to hand out the ceiling.
 */
export function lowVolumeSports(
  frameSpecs: SlotSpec[],
  anchors: EnduranceAnchors,
  demonstratedWeeklyMinutes: { run?: number | null; ride?: number | null } | null | undefined,
): Array<'run' | 'ride'> {
  const bounds = weekVolumeBounds(frameSpecs, anchors);
  const out: Array<'run' | 'ride'> = [];
  for (const sport of ['run', 'ride'] as const) {
    const bound = bounds[sport];
    // ⚠️ A SPORT WITH NO SLOTS HAS NO FLOOR TO BE UNDER. Nothing to lower, nothing to decide.
    if (!bound || bound.sessions === 0) continue;
    const minutes = Number(demonstratedWeeklyMinutes?.[sport]);
    if (!Number.isFinite(minutes) || minutes <= 0) { out.push(sport); continue; }
    if (minutes < bound.floor * 60) out.push(sport);
  }
  return out;
}

/**
 * ⛔ WHERE A SLOT SITS AT DIAL POSITION `t` — the ladder walked as one continuous dial.
 *
 * ⛔⛔ THE RUNGS ARE TRAVERSED BY THEIR OWN LENGTHS, and the jump between them is a JUMP. p235 gives
 * level 1 as 25-30 min and level 2 as 45-60: there is no 35-minute easy run in the book, so the dial
 * steps over that gap rather than inventing a dose in it. The function stays monotonic, which is all
 * the solve needs.
 * ⚠️ `t` IS ACROSS THE WHOLE LADDER, not within one level — that is what makes a single dial per
 * sport move a quality slot inside its band and a base slot up its levels at the same time.
 */
export function rungAt(rungs: Rung[], t: number): { level: Level; size: number; minutes: number } {
  const clamped = Math.min(1, Math.max(0, t));
  const spans = rungs.map((r) => Math.max(0, r.hi - r.lo));
  const total = spans.reduce((a, b) => a + b, 0);
  // ⚠️ EVERY RUNG FLAT (a fixed dose at every level) — the dial cannot move it, so it takes the
  // rung `t` lands in by position rather than by length, and its one length is the answer.
  /**
   * ⛔ THE DIAL POSITION INSIDE A RUNG IS SCALED BY `sizeHi` — 1 on an unclipped rung, so this is
   * the same multiplication by one the function always did. On a rung the ceiling cut, the top of
   * the dial is the size that BUILDS the cap rather than the size that builds the band's top.
   */
  if (total <= 0) {
    const i = Math.min(rungs.length - 1, Math.floor(clamped * rungs.length));
    return { level: rungs[i].level, size: 0, minutes: rungs[i].lo };
  }
  let want = clamped * total;
  for (let i = 0; i < rungs.length; i++) {
    const span = spans[i];
    if (want > span && i < rungs.length - 1) { want -= span; continue; }
    const within = span > 0 ? Math.min(1, want / span) : 0;
    return {
      level: rungs[i].level,
      size: within * rungs[i].sizeHi,
      minutes: rungs[i].lo + within * span,
    };
  }
  const last = rungs[rungs.length - 1];
  return { level: last.level, size: last.sizeHi, minutes: last.hi };
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
  const at = (t: number) => mine.reduce((sum, s) => sum + rungAt(s.rungs, t).minutes, 0) / 60;
  const lo = at(0);
  const hi = at(1);
  const want = Number(target);
  if (mine.length === 0 || !Number.isFinite(want) || want <= 0) {
    return { size: DEFAULT_SIZE, verdict: 'no_target', expected: at(DEFAULT_SIZE) };
  }
  if (hi <= lo) {
    return {
      size: DEFAULT_SIZE,
      verdict: want > hi ? 'over_cap' : want < lo ? 'under_floor' : 'at_target',
      expected: lo,
    };
  }
  if (want >= hi) return { size: 1, verdict: want > hi ? 'over_cap' : 'at_target', expected: hi };
  if (want <= lo) return { size: 0, verdict: want < lo ? 'under_floor' : 'at_target', expected: lo };
  /**
   * ⛔⛔ BISECTED, NOT INTERPOLATED, AND THE LADDER IS WHY. The old solve divided across one linear
   * band, which was exact while every slot had a single dose range. A base slot now walks several
   * levels with a JUMP between them — p235 offers no 35-minute easy run — so the total is a
   * staircase and a straight line through its ends lands in the risers.
   *
   * ⚠️ IT COSTS NOTHING. `rungAt` is arithmetic over numbers `slotSpans` already measured; no session
   * is built inside this loop. Twenty-four halvings put `t` inside a ten-thousandth, and the only
   * builds are the ones the composer makes afterwards at the chosen rung.
   * ⚠️ MONOTONIC BY CONSTRUCTION — every rung's minutes rise with `t` and the rungs are in order — so
   * the bisection cannot get stuck on a plateau it should have stepped over.
   */
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (at(mid) < want) low = mid; else high = mid;
  }
  const t = (low + high) / 2;
  return { size: t, verdict: 'at_target', expected: at(t) };
}

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

/**
 * ⛔ HOURS ONE APPENDED EASY SESSION ADDS — ITS OWN LEVEL'S CAP, NOT THE TOP OF THE LADDER.
 *
 * ⛔⛔ THE DEFECT THIS FIXES (found 2026-08-26 while measuring the week's floor). `slotSpans` climbs
 * BASE families, and the fill spec is a base family — so `minHi` was the top of the whole ladder
 * rather than the dose actually appended. An easy run fill was measured at **1h30** while the
 * placement below builds it at level 1, size 1: **30 minutes.** The ride was worse — measured at
 * five hours against a 1h40 session.
 *
 * ⛔ WHAT IT COST, IN THE ONLY PLACE IT IS READ. `easyFillFor` divides the gap between the ask and
 * the week's cap by this number and rounds to the nearest session. Three times too large means a gap
 * of forty minutes bought NO easy run where it should have bought one — so a six-hour running ask
 * built five and a half and said the week was full, on a menu whose own comment says every offered
 * value must be buildable.
 *
 * ⚠️ `rungs[0]` IS THE SPEC'S OWN LEVEL, which is what the placement builds. One rung, one dose, one
 * number — the same figure on both sides of the arithmetic.
 */
export function easyFillHours(sport: 'run' | 'ride', anchors: EnduranceAnchors): number {
  const span = slotSpans([EASY_FILL_SPEC[sport]], anchors)[0];
  const rung = span?.rungs[0];
  return rung ? rung.hi / 60 : 0;
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
