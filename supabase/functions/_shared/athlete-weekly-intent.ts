/**
 * ═══ ONE SHAPE FOR WHAT THE ATHLETE ASKED FOR ═══════════════════════════════════════════════════
 *
 * Stage 4 of `docs/WORKORDER-finish-the-swaps-2026-08-20.md`. Evidence: §2.0 and §2.6 of
 * `docs/REPORT-session-structure-and-clumping-2026-08-20.md`.
 *
 * ⛔ THE DEFECT THIS FILE EXISTS TO CLOSE. One answer — *"3 rides a week"* — travelled under eight
 * names across three deploy boundaries, and the rule that bounds it was written out FIVE times:
 * two pickers on the wizard, a validator in `create-goal-and-materialize-plan`, a clamp in
 * `generate-strength-plan`, and a clamp in the composer. Three of the five were still capped at 3
 * after the ceiling was raised to 4 on 2026-08-19 — so an athlete who tapped `4` had their answer
 * quietly rewritten by a boundary that had not been told. Nothing anywhere logged it. The plan that
 * came back was plausible, and it was built on a number nobody chose.
 *
 * ⚠️ THE COPIES ARE NOT THE DISEASE — THE UNOWNED RULE IS. Every one of those five sites was
 * individually reasonable when it was written. What was missing is a place for the rule to live, so
 * this is that place, and the rule is stated exactly once.
 *
 * ── WHAT THIS FILE OWNS ───────────────────────────────────────────────────────────────────────
 *
 *   1. **The range and the default.** `RIDE_DAYS_CHOICES` is what the screen renders AND what the
 *      wire accepts AND what the composer clamps to. Raising the ceiling is one edit.
 *   2. **Provenance.** Every resolved number says whether it is the ATHLETE'S ANSWER or OUR DEFAULT
 *      (`IntentSource`). §2.0's three independent "default to 2" clauses were undetectable precisely
 *      because a default and an answer arrived as the same `2`.
 *   3. **The hard-day subtraction, done once.** A hard ride IS one of the picked ride days
 *      (Michael's rule, 2026-08-19: *"one of the runs is the hill session"*). Three sites used to
 *      subtract it and one of them forgot, which put a false shortfall note on a plan that had built
 *      exactly what was asked for.
 *
 * ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────────────────────────
 *
 * ⛔ IT DOES NOT PLACE ANYTHING AND IT DOES NOT DECIDE ANYTHING. It reports the ask. Which day a
 * ride lands on is the solver's; how long it is, is the composer's. A resolver that started
 * choosing would be the inference model deleted on 2026-08-08 growing back under a new name.
 *
 * ⚠️ ALL THREE DISCIPLINES NOW — rides 2026-08-21, run and swim 2026-08-22, one sport at a time as
 * the work order required. ⛔ EACH KEY WAS ADDED IN THE SAME PASS AS ITS READERS. A field declared
 * for a discipline nobody has routed yet is an input with no writer — the starved-input pattern the
 * ENGINE-STATE banner opens with — which is why `run` and `swim` were deliberately ABSENT until the
 * session that wired them.
 *
 * ⚠️ SYMMETRIC WHERE THE FACT IS THE SAME, HONEST WHERE IT IS NOT. All three answer *how often*,
 * *which day is long* and *did the athlete choose this*. They differ on VOLUME because the athlete
 * does: the run is typed in MILES against a pace, the bike in HOURS, and the swim is a bare count
 * that is booked and not coached (D-323 §5). ⛔ Do not flatten those into one field — a shared
 * `volume: number` would need a unit beside it, and a number whose unit lives in another field is
 * the miles-vs-hours confusion this object exists to end.
 */

/**
 * ⛔ THE EASY-PACE FALLBACK IS NOT MINTED HERE. `maintenance-volume-band.ts` owns it and the intake
 * already reasons out loud about the same number, so re-declaring it would put a second 10 in a file
 * whose whole point is one statement per rule. ⚠️ `_shared` importing from `src/lib` is the existing
 * direction for exactly this kind of shared fact — `athlete-snapshot.ts` and `arc-context.ts` do it
 * for the pace and FTP resolvers.
 */
import { FALLBACK_EASY_MIN_PER_MILE } from '../../../src/lib/maintenance-volume-band.ts';

/** Re-exported so a caller can name the fallback it is about to admit to the athlete. */
export { FALLBACK_EASY_MIN_PER_MILE };

/** Whether a resolved number is the athlete's own answer or a default we supplied for them. */
export type IntentSource = 'answered' | 'default';

/**
 * ⛔ THE ONE STATEMENT OF THE RIDE-COUNT RANGE. The wizard's chips, the wire validator and the
 * composer's clamp all read this array — see the file header for what happened when they did not.
 *
 * ⚠️ 1 IS A REAL ANSWER. It was `>= 2` on the run side once and a one-run week was dropped on the
 * floor; the ride has always allowed one and must keep allowing it.
 */
export const RIDE_DAYS_CHOICES = [1, 2, 3, 4] as const;
export const RIDE_DAYS_MIN = RIDE_DAYS_CHOICES[0];
export const RIDE_DAYS_MAX = RIDE_DAYS_CHOICES[RIDE_DAYS_CHOICES.length - 1];

/**
 * ⛔ THE ONLY NUMBER IN THIS FILE THAT IS OURS RATHER THAN THE ATHLETE'S, and the only reason it is
 * tolerable is that every consumer can now see it is ours (`askedDaysSource: 'default'`).
 *
 * Two rides is the nominal shape a weekly total is split across when the athlete gave hours and
 * never answered the count. ⚠️ Do not add a second default anywhere else — a default at every hop is
 * what guarantees a dropped answer can never surface (§2.0).
 */
export const RIDE_DAYS_DEFAULT = 2;

/**
 * ⛔ TWO HOURS, AND IT IS NO LONGER A NUMBER NOBODY CHOSE (Michael, 2026-08-21).
 *
 * ⚠️ IT WAS FLAGGED AS EXACTLY THAT ON 2026-08-21 — *"the last unowned number on the ride chain"* —
 * and the ruling is to KEEP it and record where it comes from, not to change it.
 *
 * **It is the bottom of Viada's own entry-level cycling dose** — Michael, ruling on it: *"roughly
 * an hour for the hard ride and an hour to ninety minutes for the easy one, across two rides."*
 * Viada's Level 1 cycling endurance (p239) is a **60–100-min easy ride below 75%**, and the Level 1
 * quality session beside it runs about the same. Two of those is two hours, and two rides is the
 * shape this default is dividing by (`RIDE_DAYS_DEFAULT`).
 *
 * So the number an athlete falls to when they keep a bike and type nothing is the **smallest dose
 * the source prescribes**, not a round number picked because it divides well. See
 * `docs/SOURCE-viada-hybrid-athlete.md` §D2.
 *
 * ⚠️ IT IS STILL OURS AND STILL SAYS SO. `hoursSource: 'default'` is stamped on it and
 * `generate-strength-plan` logs when it fires — a defensible default is still a default, and the
 * athlete's own number always wins.
 */
export const RIDE_HOURS_DEFAULT = 2;

/**
 * ⛔ THE RUN COUNT'S RANGE. Same 1-4 as the ride, and 1 IS A REAL ANSWER (Michael, 2026-08-19): the
 * floor here was a hard 2 — Hickson's maintenance dose — so an athlete who asked for ONE run got TWO
 * built, and the screen and the plan disagreed about the week the athlete had described. That is an
 * argument for what to RECOMMEND, never for overriding a stated answer.
 *
 * ⚠️ THE STRENGTH PATH'S CARD OFFERS 2/3/4 AND THE WIRE ACCEPTS 1. That is NOT the ride's defect
 * inverted: a wire accepting MORE than a screen offers loses nothing, where a screen offering more
 * than the wire accepts silently rewrites an answer. `create-goal` validates against this range and
 * is the only layer that could REJECT a legal answer, so it is the one that must read the constant.
 */
export const RUN_DAYS_CHOICES = [1, 2, 3, 4] as const;
export const RUN_DAYS_MIN = RUN_DAYS_CHOICES[0];
export const RUN_DAYS_MAX = RUN_DAYS_CHOICES[RUN_DAYS_CHOICES.length - 1];

/**
 * ⛔ TWO RUNS, AND IT WAS THE OUTERMOST OF A FOUR-DEEP DEFAULT CHAIN (Q-270). The same 2 was supplied
 * at `create-goal`, twice inside `generate-strength-plan`, and again as the composer's
 * `DEFAULT_ENDURANCE_SESSIONS` floor — four independently reasonable clauses which together meant a
 * dropped answer could never surface. Stated once here now.
 *
 * ⚠️ IT IS HICKSON'S MAINTENANCE DOSE — the frequency an aerobic base holds on at — so it is a
 * defensible number and still ours. `askedDaysSource: 'default'` says so, and the door logs it.
 */
export const RUN_DAYS_DEFAULT = 2;

/**
 * ⛔ SWIM STAYS MINIMAL BY STANDING DECISION (D-323 §5 — booked, not coached). The app holds the
 * time; it does not write the session. ⚠️ This object CONSOLIDATES where the count is stored and
 * does nothing else — no swim capability, no swim features.
 *
 * ⚠️ THE SCREEN OFFERS 1/2/3 AND THE WIRE ACCEPTS UP TO 4, AND THAT ASYMMETRY IS DELIBERATE. A wire
 * that accepts more than a screen offers loses nothing — it is how a goal row stored under an older
 * picker still rebuilds. ⛔ The RIDE's bug was the other direction: a screen offering 4 while a hop
 * downstream clamped to 3, silently rewriting an answer the athlete had given.
 */
export const SWIM_DAYS_CHOICES = [1, 2, 3] as const;
export const SWIM_DAYS_MAX = 4;

/**
 * The athlete's ride week, resolved. ⛔ READ-ONLY DOWNSTREAM — nothing below the builder recomputes
 * a field on this object, which is the whole point of it existing.
 */
export type RideAsk<D extends string = string> = {
  /**
   * The athlete gave us a bike — an intake object, or top-level weekly hours.
   * ⚠️ HOURS FROM EITHER SOURCE COUNT (2026-07-29). A bike-primary athlete whose hours arrived as
   * `target_weekly_ride_hours` with no `bike{}` object failed an object-presence test, and the pass
   * that turns hours into rides never ran.
   */
  declared: boolean;
  /** The block contains riding: they declared one, or the bike is the primary endurance sport. */
  selected: boolean;
  /** Weekly ride hours as stated. `null` means never stated — NOT zero. */
  hours: number | null;
  hoursSource: IntentSource;
  /** Weekly hours with our default applied. ⚠️ Only meaningful when `declared`. */
  hoursOrDefault: number;
  /** The long-ride day, already resolved to a calendar day. `null` when unset or unrecognised. */
  longDay: D | null;
  /** Ride days as picked, clamped to the range above. `0` when there is no riding in the block. */
  askedDays: number;
  askedDaysSource: IntentSource;
};

/**
 * The athlete's ride week with the hard rides seated. ⛔ READ-ONLY DOWNSTREAM — nothing below the
 * builder recomputes a field on this object, which is the whole point of it existing.
 */
export type RideIntent<D extends string = string> = RideAsk<D> & {
  /** How many of `askedDays` are hard rides. Supplied — the gate that decides it is the composer's. */
  hardCount: number;
  /**
   * There is a long ride: they named a day AND a session is left over once the hard rides are
   * seated. ⚠️ The pin says they WANT one; it cannot say there is room for one.
   */
  hasLongDay: boolean;
  /** Ride days the easy/long pass has to fill — `askedDays` with the hard rides taken out. */
  daysAfterHard: number;
  /** Easy rides wanted — `daysAfterHard` with the long ride taken out too. */
  easyWanted: number;
};

/**
 * The athlete's run week, resolved. ⛔ READ-ONLY DOWNSTREAM, same contract as the ride.
 *
 * ⚠️ THERE IS NO `declared` HERE AND THAT IS NOT AN OVERSIGHT. The bike has two gates — *did they
 * give us a bike* (`declared`) and *is there riding in this block* (`selected`) — because a
 * bike-PRIMARY athlete who typed no hours is selected without being declared, and the two drive
 * different emitters. The run has one gate. Adding a second for symmetry would be a field with no
 * question behind it.
 */
export type RunAsk<D extends string = string> = {
  /**
   * There is running in this block. ⛔ SELECTION NEEDS A POSITIVE SIGNAL — `enduranceFrequency`
   * arrives from `create-goal` with a default of 2 even for a bike-only athlete, so reading THAT as
   * selection invents a sport nobody asked for. It is: the run is the primary sport, OR they typed
   * miles, OR they named a long-run day, OR they asked for a hard run.
   */
  selected: boolean;
  /** Weekly miles as typed. `null` means never stated — NOT zero. ⛔ MILES, because that is the unit
   *  the athlete types the run in; the bike is hours (D-323 §6) and the two must not be averaged. */
  miles: number | null;
  milesSource: IntentSource;
  /** The athlete's easy pace in MIN PER MILE, resolved upstream. `null` = not learned yet. */
  easyPaceMinPerMile: number | null;
  paceSource: IntentSource;
  /**
   * Pace with our fallback applied. ⚠️ THE PLAN'S OWN COPY ADMITS THIS ONE OUT LOUD — *"estimated at
   * 12:00/mi until we learn your easy pace"* — which is the standard every default in this file is
   * held to and the only one that currently reaches the athlete.
   */
  paceOrFallback: number;
  /** The long-run day, already resolved to a calendar day. `null` when unset or unrecognised. */
  longDay: D | null;
  /** Run days as picked, clamped to the range above. `0` when there is no running in the block. */
  askedDays: number;
  askedDaysSource: IntentSource;
};

/**
 * The run week with the hard runs seated.
 *
 * ⛔ `hasLongDay` DOES NOT MEAN THE SAME THING AS THE RIDE'S, AND THE DIFFERENCE IS REAL. A long RIDE
 * exists only when the athlete PINNED a day for it — the engine never invents one. A long RUN exists
 * whenever a session is left over after the hard days are seated, pinned or not, because an unpinned
 * long run falls to `DEFAULT_LONG_DAY`. ⚠️ Making these two agree would either invent a long ride
 * nobody asked for or delete the long run of every athlete who never answered that question.
 */
export type RunIntent<D extends string = string> = RunAsk<D> & {
  /** How many of `askedDays` are hard runs. Supplied — the §7 gate that decides it is the composer's. */
  hardCount: number;
  /** A long run exists when a session is left over once the hard ones are seated. */
  hasLongDay: boolean;
  /** Run days the easy/long pass has to fill — `askedDays` with the hard runs taken out. */
  daysAfterHard: number;
  /** Easy runs wanted — `daysAfterHard` with the long run taken out too. */
  easyWanted: number;
};

/**
 * ⛔ THE SWIM IS A COUNT AND NOTHING ELSE, ON PURPOSE (D-323 §5). Booked, not coached: the athlete
 * says how many, the app holds the time and writes no session. There is no long day, no volume and
 * no pace here because the app does not prescribe any of them.
 *
 * ⚠️ `swim_volume` IS COLLECTED AT INTAKE AND STORED, AND IS NOT IN THIS OBJECT. It has no reader —
 * putting it here would be the starved-input pattern this file's header warns about. It joins when
 * something consumes it.
 */
export type SwimIntent = {
  /** There is swimming in this block. */
  selected: boolean;
  /** Swim days as picked, clamped to `SWIM_DAYS_MAX`. `0` when there is no swimming. */
  askedDays: number;
  askedDaysSource: IntentSource;
};

/**
 * ⚠️ THE DAY TYPE IS THE CALLER'S. Placement owns which strings are calendar days; this file only
 * carries the one the caller's own resolver returned, so a composer keeps its `DayName` and a client
 * keeps its `string` without either of them casting.
 */
export type AthleteWeeklyIntent<D extends string = string> = {
  run: RunIntent<D>;
  bike: RideIntent<D>;
  swim: SwimIntent;
};

/**
 * ⛔ `null` MEANS "NOT AN ANSWER", NOT "ZERO". Absent, empty, `0` and `NaN` are all the same
 * statement — the athlete did not tell us — and the caller decides what to do about it. Applying a
 * default here would put the third copy of it back.
 *
 * ⚠️ ROUND THEN CLAMP is the composer's original order, kept verbatim. ⛔ AND IT IS NOT LOAD-BEARING
 * — checked by mutation on 2026-08-21, and swapping the two makes no difference on any input, since
 * both bounds are integers. Recorded because the comment that stood here claimed it WAS, and a false
 * "do not touch this" is worse than none: the next reader would have preserved an order that carries
 * nothing while looking for the real constraint elsewhere.
 */
export function normalizeRideDays(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.max(RIDE_DAYS_MIN, Math.min(RIDE_DAYS_MAX, Math.round(n)));
}

/**
 * Weekly ride hours from the two places they can arrive. ⛔ HOURS, NEVER MILES (D-323 §6) — the
 * engine turns hours into sessions and has never learned a ride speed, so miles would be a number
 * it cannot honour.
 *
 * ⚠️ THE NESTED VALUE WINS and the top-level one is the fallback, not a second owner. Both are
 * carried because the bike-primary path populates only the second.
 */
export function normalizeRideHours(nested: unknown, topLevel: unknown): number | null {
  const inner = Number(nested);
  if (inner > 0) return inner;
  const outer = Number(topLevel);
  return outer > 0 ? outer : null;
}

export type RideAskInput<D extends string = string> = {
  /** The intake's bike object, as it arrives. An empty object still counts as "declared". */
  bike?: { hours?: number; days?: number; longRideDay?: string } | null;
  /** Top-level weekly ride hours — the bike-PRIMARY path's only carrier. */
  targetWeeklyRideHours?: number;
  /** Is the bike the block's primary endurance discipline? */
  primaryIsBike: boolean;
  /**
   * ⛔ THE CALLER'S DAY VOCABULARY, NOT OURS. Placement owns which strings are calendar days; this
   * file owns the ask. Handing the resolver in keeps it that way — an `asDay` copy here would be a
   * sixth statement of a rule that already has an owner.
   *
   * ⚠️ OPTIONAL, because the two callers want different halves of this object. The wire door reads
   * the ask to see whether the athlete's ANSWER arrived and never looks at the day; the composer
   * reads the day and passes its own `asDay`. Absent → a trimmed non-empty string, which is the
   * weakest honest answer and deliberately not a calendar.
   */
  resolveDay?: (v: unknown) => D | null;
};

/**
 * ⛔ STEP ONE: WHAT THEY ASKED FOR, WITH NOTHING SUBTRACTED. This half is answerable at the wire
 * door, before anything is known about hard days or FTP — which is the point, because the door is
 * where a dropped answer has to be noticed.
 */
export function resolveRideAsk<D extends string = string>(input: RideAskInput<D>): RideAsk<D> {
  const declared = !!input.bike || Number(input.targetWeeklyRideHours) > 0;
  const selected = declared || input.primaryIsBike;

  const hours = normalizeRideHours(input.bike?.hours, input.targetWeeklyRideHours);
  const days = normalizeRideDays(input.bike?.days);

  const resolveDay = input.resolveDay
    ?? ((v: unknown) => {
      const t = String(v ?? '').trim();
      return (t ? t : null) as D | null;
    });

  return {
    declared,
    selected,
    hours,
    hoursSource: hours == null ? 'default' : 'answered',
    hoursOrDefault: hours ?? RIDE_HOURS_DEFAULT,
    longDay: declared ? resolveDay(input.bike?.longRideDay) : null,
    askedDays: selected ? (days ?? RIDE_DAYS_DEFAULT) : 0,
    askedDaysSource: days == null ? 'default' : 'answered',
  };
}

/**
 * ⛔ HOW MANY EASY SESSIONS A WEEK WANTS, ONCE THE NAMED ONES ARE SEATED. Sport-agnostic on purpose:
 * the composer applies it to the bike, and `src/lib/suggest-hard-days.ts` — the wizard's suggester
 * and health badge — applies it to the run AND the bike. That file held its own copy of this line,
 * which is a second opinion about the athlete's week rendered on the screen where they would notice
 * it first, and its own header forbids exactly that (*"a lightweight good-enough placer here would
 * be a second opinion … the doubled disease"*).
 *
 * ⚠️ THE ORDER OF THE TWO SUBTRACTIONS DOES NOT MATTER and neither does whether the long day is
 * tested for room first: `max(0, a - h - L)` and `max(0, max(0, a - h) - (L && a > h))` agree on
 * every input, which is why the two copies never diverged and why nobody noticed there were two.
 */
export function easySessionsWanted(
  askedDays: number,
  hasLongDay: boolean,
  hardCount: number,
): number {
  return Math.max(0, askedDays - hardCount - (hasLongDay ? 1 : 0));
}

/**
 * ⛔ STEP TWO: SEAT THE HARD RIDES. A hard ride IS one of the picked ride days — Michael's rule,
 * *"one of the runs is the hill session"* — and this is the only place the subtraction happens.
 * Three sites used to do it and one of them forgot, which printed *"You asked for 3 ride days; the
 * week had room for 2"* on a week that had built all three.
 *
 * ⛔ `hardRideCount` IS SUPPLIED, NOT DERIVED. Whether a hard day survives depends on the §7 gate —
 * a hard ride with no FTP is dropped — and that gate lives in the composer with the resolvers that
 * feed it. Deriving a second answer to it here is exactly the disease.
 */
export function seatRideIntent<D extends string = string>(
  ask: RideAsk<D>,
  hardRideCount: number,
): RideIntent<D> {
  const hardCount = Math.max(0, Math.round(Number(hardRideCount) || 0));
  const hasLongDay = ask.selected && !!ask.longDay && ask.askedDays > hardCount;
  const daysAfterHard = Math.max(0, ask.askedDays - hardCount);
  return {
    ...ask,
    hardCount,
    hasLongDay,
    daysAfterHard,
    easyWanted: easySessionsWanted(ask.askedDays, hasLongDay, hardCount),
  };
}

/** Both steps, for a caller that has the hard-day count already. */
export function buildRideIntent<D extends string = string>(
  input: RideAskInput<D>,
  hardRideCount: number,
): RideIntent<D> {
  return seatRideIntent(resolveRideAsk(input), hardRideCount);
}

/**
 * Run days. ⚠️ SAME `null` CONTRACT AS THE RIDE — absent, `0` and `NaN` are all "not an answer".
 * ⛔ `0` IS NOT "no running": that is `selected: false`, decided by the four positive signals on
 * `RunAsk`. A `0` arriving in this field is a malformed input, and the composer's own comment said
 * so before this function existed.
 */
export function normalizeRunDays(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.max(RUN_DAYS_MIN, Math.min(RUN_DAYS_MAX, Math.round(n)));
}

/** Weekly run miles as typed. ⛔ MILES, never hours — the run's unit, and the bike's is hours. */
export function normalizeRunMiles(raw: unknown): number | null {
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** The athlete's easy pace, min per mile. `null` = not learned yet, which is not the same as slow. */
export function normalizeEasyPace(raw: unknown): number | null {
  const n = Number(raw);
  return n > 0 ? n : null;
}

/**
 * Swim days. ⛔ CLAMPED TO `SWIM_DAYS_MAX`, which is the wire's long-standing rule and is wider than
 * the screen offers — see the constant for why that direction is safe.
 */
export function normalizeSwimDays(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(SWIM_DAYS_MAX, Math.round(n));
}

export type RunAskInput<D extends string = string> = {
  /** Weekly miles from intake. */
  targetWeeklyMiles?: number;
  /** The athlete's easy pace in min/mi, from `resolveCurrentRunEasyPace`. ⛔ FED, NOT RE-DERIVED. */
  easyPaceMinPerMile?: number;
  /** How many days they run, from intake. */
  enduranceFrequency?: number;
  longRunDay?: string;
  /** Is the run the block's primary endurance discipline? */
  primaryIsRun: boolean;
  /**
   * ⛔ DOES THE ATHLETE HAVE A HARD RUN. It is one of the four signals that make the run SELECTED —
   * an athlete who asked for a hill session is running, whatever else they did or did not type.
   * ⚠️ A COUNT IS NOT NEEDED HERE, only whether there is one; the count seats the sessions later.
   */
  hasHardRun: boolean;
  /** ⛔ THE CALLER'S DAY VOCABULARY, NOT OURS — same contract as the ride's. */
  resolveDay?: (v: unknown) => D | null;
};

/**
 * ⛔ STEP ONE: WHAT THEY ASKED FOR, WITH NOTHING SUBTRACTED. Answerable at the wire door, which is
 * where a dropped answer has to be noticed.
 */
export function resolveRunAsk<D extends string = string>(input: RunAskInput<D>): RunAsk<D> {
  const resolveDay = input.resolveDay
    ?? ((v: unknown) => {
      const t = String(v ?? '').trim();
      return (t ? t : null) as D | null;
    });

  const miles = normalizeRunMiles(input.targetWeeklyMiles);
  const pace = normalizeEasyPace(input.easyPaceMinPerMile);
  const days = normalizeRunDays(input.enduranceFrequency);

  // ⛔ FOUR POSITIVE SIGNALS, ANY ONE OF THEM. Never `enduranceFrequency`, which arrives defaulted.
  const selected = input.primaryIsRun || miles != null
    || !!resolveDay(input.longRunDay) || input.hasHardRun;

  return {
    selected,
    miles,
    milesSource: miles == null ? 'default' : 'answered',
    easyPaceMinPerMile: pace,
    paceSource: pace == null ? 'default' : 'answered',
    paceOrFallback: pace ?? FALLBACK_EASY_MIN_PER_MILE,
    longDay: selected ? resolveDay(input.longRunDay) : null,
    askedDays: selected ? (days ?? RUN_DAYS_DEFAULT) : 0,
    askedDaysSource: days == null ? 'default' : 'answered',
  };
}

/**
 * ⛔ STEP TWO: SEAT THE HARD RUNS. *"One of the runs is the hill session"* — Michael, counting his own
 * week. A hard run is one of the picked run days, not an extra one; the same rule the ride takes.
 *
 * ⛔ AND THE LONG RUN IS A SESSION, NOT AN EXTRA (found 2026-08-19). This was floored at 1 so that
 * *"a 2-run week with two hard runs still leaves a run to be long"* — which built THREE sessions
 * against an answer of two. `daysAfterHard` is the leftover, floored at ZERO, and the long day exists
 * only when it is positive:
 * ```
 *   asked 1, hard 0 -> 1 long        asked 2, hard 1 -> long + hard
 *   asked 1, hard 1 -> 1 hard        asked 2, hard 2 -> 2 hard    (was long + 2 hard = 3)
 *   asked 3, hard 1 -> long + easy + hard
 * ```
 */
export function seatRunIntent<D extends string = string>(
  ask: RunAsk<D>,
  hardRunCount: number,
): RunIntent<D> {
  const hardCount = Math.max(0, Math.round(Number(hardRunCount) || 0));
  const daysAfterHard = ask.selected ? Math.max(0, ask.askedDays - hardCount) : 0;
  const hasLongDay = ask.selected && daysAfterHard > 0;
  return {
    ...ask,
    hardCount,
    hasLongDay,
    daysAfterHard,
    easyWanted: ask.selected ? easySessionsWanted(ask.askedDays, hasLongDay, hardCount) : 0,
  };
}

/** Both steps, for a caller that has the hard-run count already. */
export function buildRunIntent<D extends string = string>(
  input: RunAskInput<D>,
  hardRunCount: number,
): RunIntent<D> {
  return seatRunIntent(resolveRunAsk(input), hardRunCount);
}

/**
 * The swim ask. ⛔ ONE STEP, because there is nothing to seat — the swim takes days nothing else
 * wanted and has no hard session, no long day and no volume the app prescribes.
 */
export function resolveSwimAsk(input: { swimDays?: number }): SwimIntent {
  const days = normalizeSwimDays(input.swimDays);
  return {
    selected: days != null,
    askedDays: days ?? 0,
    // ⚠️ NO DEFAULT IS SUPPLIED FOR THE SWIM and that is the standing decision, not an omission. An
    // unanswered swim is no swim; the app never books a session the athlete did not ask for.
    askedDaysSource: days == null ? 'default' : 'answered',
  };
}

/**
 * ⛔ THE ONE PLACE A SUPPLIED DEFAULT IS ANNOUNCED. §2.0's finding was that three independent
 * "default to 2" clauses sat on this chain and **only one of them logged when it fired** — so a
 * dropped answer never appeared as missing, it appeared as a plausible plan.
 *
 * Returns the fields that fell back, so a caller can log them. Empty array = everything is theirs.
 */
export function suppliedDefaults(ask: RideAsk<string>): string[] {
  const out: string[] = [];
  if (ask.selected && ask.askedDaysSource === 'default') out.push('ride_days');
  if (ask.declared && ask.hoursSource === 'default') out.push('ride_hours');
  return out;
}
