// ============================================================================
// STRENGTH FOCUS (BARBELL, 4-DAY) — the Get Stronger composer
//
// V1 is **Wendler's 5/3/1 in its endurance-athlete configuration**. Contract:
// docs/SPEC-get-stronger.md. Sequencing: docs/BUILD-ORDER-strength-spine.md.
// Homes: docs/ARCH-strength-spine.md.
//
// ⛔ THIS FILE DOES NOT OWN THE LOADING. Every percentage, rep count and increment
// comes from `loading/wendler-531.ts` (Layer 2) so race plans can reach the same
// protocol at a maintenance dose. The previous composer kept its loading private —
// its own header said so — which is exactly why the protocol would be authored twice.
// Do not reintroduce a percentage curve here.
//
// What this file owns: the day grid, session assembly, the endurance underneath, and
// the plan-shape output contract.
//
// ── Replaced 2026-07-25 (was: the ATR block — base/power/deload/peak + AMRAP retest,
// a 72→94% ramp, and a separate retest week). That protocol assembled a block from five
// sources and produced ~8 unmarked invented numbers. Wendler publishes a complete
// parameter set for this athlete with none. The frozen-retest-weight problem deleted
// itself with the retest week: under 5/3/1 the last set of the ANCHOR cycle IS the test.
// ⚠️ Corrected 2026-07-27 — this read "every third week", which the code contradicts:
// `wendler-531.ts:61` fires the open set only when `kind === 'anchor' && !isDeload`, so weeks 9-11
// of twelve. Weeks 1-8 carry plain fives. See D-326 (the gauge is near-blind for eight of twelve).
// ============================================================================

import { getExerciseConfig } from '../../../../src/lib/exercise-config.ts';
// ⛔ ONE SOURCE FOR WENDLER'S ESTIMATOR. The inverse lives beside the forward direction in
// `estimate-1rm.ts`; re-deriving `e1RM ÷ (1 + r × 0.0333)` here would be a second copy of the
// coefficient the athlete is invited to check our arithmetic against.
import { weightForReps } from '../../../../src/lib/estimate-1rm.ts';
import { strengthFocusDescription } from '../../../../src/lib/strength-focus-copy.ts';
import {
  FALLBACK_EASY_MIN_PER_MILE as FALLBACK_EASY_MIN_PER_MILE_SHARED,
  // ⛔ THE MAINTENANCE DOSE IS NOT MINTED HERE. ~2×/wk, 60 min — Hickson 1981, Spiering 2021, and
  // already the floor this app reasons about at intake. One number, one owner.
  MAINTENANCE_FLOOR_MIN,
  volumeStateForMiles,
} from '../../../../src/lib/maintenance-volume-band.ts';
import {
  type AssistancePhase,
  type AssistanceScaleInputs,
  ASSISTANCE_GUIDANCE,
  ASSISTANCE_MERGED_DAY_REPS,
  assistanceTotalReps,
  resolveEnduranceTier,
} from '../../../../src/lib/assistance-menu.ts';
// ⛔ D-407 — THE PER-DAY PICKER. `resolveAssistance` / `assistanceSubstitutionNote` are gone with the
// re-roling model they served; the athlete now picks each day's three movements and the composer
// simply renders them. See `src/lib/assistance-catalog.ts`.
import {
  type AssistanceWeekPrefs,
  LIFT_DAYS,
  liftDayForMainLift,
  normalizeAssistancePrefs,
  resolveDayAssistance,
} from '../../../../src/lib/assistance-catalog.ts';
// The tracked pull-up progression (Wendler 2nd ed p.35 / Forever pp.26,33). Opt-in, and it pins the
// pull category across the week — see `resolveDayAssistance`'s `pullup` argument.
import {
  GRIP_LABEL,
  CHIN_SESSIONS_PER_WEEK,
  gripForSession,
  movementForGrip,
  pullupDoseNote,
  SESSION_STANDARD_MINUTES,
  SESSION_STANDARD_REPS,
  WEIGHTED_DAY,
  WEIGHTED_DAY_REPS,
  weeklyVolumeFor,
} from '../../../../src/lib/pullup-progression.ts';
import {
  type BlockShapeInputs,
  type BlockWeek,
  type CycleKind,
  blockLayoutFor,
  blockWeeks,
  buildWeekMap,
  cyclesForBlock,
  deloadSingleSets,
  setsForWeek,
  tmTestSets,
  warmupSetsForWeek,
  weightForSet,
  BAR_LB,
  BAR_LB_LIGHT,
  barFloorForWorkingNumber,
  TM_TEST_PASS_REPS,
  WEEKS_PER_CYCLE,
  type WendlerSet,
  workingNumberForCycles,
  workingNumberFrom1RM,
  type WorkingNumberVerdict,
} from './loading/wendler-531.ts';
// ⛔ Placement is NOT this file's job any more. `place-week.ts` owns "what day does the bar go on",
// reading its clearances from `_shared/schedule-session-constraints.ts` — the same law the race-side
// optimizer reads. This file states the lifts and the endurance underneath; the solver states the days.
import {
  type DayName,
  DAYS as PLACEMENT_DAYS,
  type EndurancePin,
  MIN_STACK_GAP_H,
  placeLiftingWeek,
} from './place-week.ts';
import { requiredAdjacencyHours } from '../../_shared/schedule-session-constraints.ts';
// ⛔ THE OPTIMIZER'S OWN SPACING MEASURE, not a second one. See the run-day ranking below.
import { easyRunAnchorAdjacencyPenalty } from '../../_shared/week-optimizer.ts';
// ⛔ STEP 1 OF THE COLLAPSE (SPEC-week-solver §7). Placement now comes from the ONE solver rather
// than from `place-week`'s filter-and-take-first-legal-answer. `place-week` still owns the
// arithmetic screens the intake shows; only the PLACEMENT half moved.
const SOLVER_DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;

import {
  type Anchor as SolverAnchor,
  type FlexibleSession as SolverFlexible,
  solve as solveWeek,
  type SolverDay,
} from '../../_shared/week-solver.ts';


/** The four lifts, in lb. **All four are required** — the entry gate gets this far only
 *  when every one is on file (SPEC §0). Missing one leaves a lifting day with no weight. */
export type OneRepMaxes = {
  bench: number;
  squat: number;
  deadlift: number;
  overheadPress: number;
};

/**
 * ⛔ THE TERRAIN THE HARD RUN IS ACTUALLY RUN ON — the athlete's pick, never inferred.
 *
 * `4 × 3 min` uphill assumes a climb you can run for three minutes, and the engine has no way to
 * know whether one exists. It is not a property of the athlete's fitness, their sport or their
 * postures — it is a property of the ground outside their door, and the only source for it is them.
 *
 * ⚠️ THIS IS NOT AN INTAKE QUESTION AND MUST NOT BECOME ONE (doctrine §2.0, decided 2026-07-26):
 * *"No 'do you have a hill?' step… availability reveals itself in the choice."* It is a menu on the
 * D-327 hard-day card the athlete is already looking at, revealed under "Hard run" the same way the
 * day picker is. A binary question would also be unanswerable — a "no" tells us nothing about
 * whether they have a treadmill.
 *
 * ⚠️ ABSENT MEANS `hill_3min`, which is what every block built before this shipped. The field is
 * additive: an old goal with no terrain on its hard day builds exactly the week it built yesterday.
 *
 * Ranked on the block's own axis — VO2max stimulus bought at the least cost to the legs:
 *   `hill_3min` / `treadmill`  >  `hill_short`  >  `flat`
 */
export type HardRunTerrain =
  /** A climb you can run hard for three minutes. The default, and the best session here. */
  | 'hill_3min'
  /** A short climb. Shorter reps buy less time at the top end — see `shortHillSession`. */
  | 'hill_short'
  /** No hill outside, but a treadmill. The belt IS the grade, so the impact discount is real
   *  rather than approximated — this is a peer of `hill_3min`, not a lesser option. */
  | 'treadmill'
  /**
   * ⛔ LAST RESORT, AND THE ONLY OPTION THAT COSTS THE LIFTING. No climb, no treadmill, no bike.
   *
   * ⚠️ THE DOCTRINE CONTRADICTED ITSELF HERE AND §2.0 WON (ruled 2026-08-06). §2.1 lists "long flat
   * intervals at VO2 intensity" as PROHIBITED during a strength block — and that is exactly this
   * session. §2.0 offers flat as a legitimate athlete choice with a stated cost. §2.0 governs: it is
   * the newer and deliberate rule, and §2.1's blanket ban was written when a hill was assumed
   * available. For an athlete with none of the other three, the alternative to this is **no hard
   * aerobic session at all**, which is worse. §2.1 carries a back-annotation saying so.
   *
   * ⛔ SO THE COPY HAS TO CARRY THE COST OUT LOUD — that is the condition the ruling came with, not
   * a nicety. Flat keeps the impact transient the other three options remove, the lifting is what
   * pays for it, and the card says a cheap treadmill or trainer would serve them better.
   */
  | 'flat';

export type StrengthPrimaryArgs = {
  durationWeeks: number;
  /** The athlete's four barbell maxes. Required — there is no path in without them. */
  oneRepMaxes: OneRepMaxes;
  /**
   * ⛔ THE PRIMARY maintained endurance discipline. null = strength-only.
   *
   * ⚠️ SINGULAR, AND THAT WAS THE BUG. An athlete who sets BOTH run and bike to `maintain` got run
   * and lost the bike entirely — `create-goal-and-materialize-plan:2432` read
   * `run === 'maintain' ? 'run' : bike === 'maintain' ? 'bike' : null`, so the bike posture, the
   * long-ride day and the weekly ride hours were all collected and then discarded. Twelve weeks with
   * an empty Saturday and no ride in the block.
   *
   * Kept as the primary because it drives the RUN volume band and the run-frequency spread. The bike
   * now rides alongside it in `bike` below rather than competing for this slot.
   */
  enduranceSport: 'run' | 'bike' | null;
  /**
   * The bike, when the athlete maintains one. Independent of `enduranceSport` — both can be present,
   * which is the case this whole field exists to stop losing.
   *
   * ⛔ `hours` is HOURS, never miles (D-323 §6): the engine turns hours into sessions and has never
   * learned a ride speed, so miles would be a number it cannot honour.
   */
  bike?: {
    /** Weekly ride hours from intake. */
    hours?: number;
    /**
     * How many days those hours spread across (1-3), from intake.
     *
     * ⛔ THE RUN HAS ALWAYS ASKED THIS AND THE BIKE DID NOT, so the composer held a weekly total with
     * nothing to divide it by and invented a split — a 20-hour week came out as ONE 1,200-minute
     * ride. Absent → 2, and that default is the only number here that is still a choice rather than
     * the athlete's answer.
     */
    days?: number;
    /** Long-ride day from intake. Becomes a `long_ride` pin, so the bar is placed around it. */
    longRideDay?: string;
  } | null;
  enduranceFrequency: number;
  goalName?: string;
  /** Get Stronger maintenance-endurance band (run only). Typed weekly miles + the athlete's easy
   *  pace (min/mi) → the run volume. Absent → the fixed ~2×35min default. */
  targetWeeklyMiles?: number;
  easyPaceMinPerMile?: number;
  /** Preferred long-run day from intake. CONSTRAINED to Sat/Sun (heavy lower is Tue/Fri). */
  longRunDay?: string;
  /**
   * The athlete's ONE hard aerobic day, and the discipline it belongs to (D-327 — a strength-led
   * block carries exactly one; the intake greys the second).
   *
   * ⛔ COLLECTED SINCE 2026-07-25 AND DROPPED UNTIL NOW. `create-goal-and-materialize-plan` forwarded
   * only `long_run` out of `preferred_days`, so this reached the goal row and stopped. The composer
   * has never seen it.
   *
   * ⚠️ ARRIVING IS NOT THE SAME AS BEING HONOURED. Placement today is the hardcoded Mon/Tue/Thu/Fri
   * grid below; this pin is carried so `place-week.ts` can be handed BOTH pins in the same shape it
   * already expects (day + kind + label + canSplitDay) when the grid is replaced. Until then it is
   * available and unused — deliberately, and that is the next change, not an oversight.
   *
   * The doctrine's two pins are this and `longRunDay`; everything else moves around them.
   * See docs/DOCTRINE-aerobic-maintenance.md §6 and ARCH-strength-spine.md §0.6.
   */
  /**
   * ⛔ UP TO TWO HARD DAYS, ANY MIX (§1i, 2026-08-17). Two runs, two rides, one of each, one, or
   * none. This was `hardDay?: {...}` — a single optional object — and the whole path below it was
   * built on there being at most one: one pin, mutually-exclusive `hardDayIsRun`/`hardDayIsRide`
   * booleans, two volume budgets each keyed on the one discipline, and two emitters of which the
   * comment said *"at most one of these two branches ever fires"*. All of that moved with this.
   *
   * ⛔ REPLACED, NOT WIDENED ALONGSIDE. There is no `hardDay` singular any more — the standing rule
   * is replace = delete the old, and a one-day field beside a two-day array is how a caller keeps
   * writing the dead one.
   *
   * ⚠️ CAPPED AT TWO, AND THE CAP LIVES AT THE DOOR ({@link MAX_HARD_DAYS}). Three hard days is not
   * a shape this block's recovery model has been reasoned about for, and silently building one
   * because a caller sent it would be the engine agreeing to something nobody designed.
   *
   * ⚠️ ONE PER DAY. Two hard sessions on one calendar day is not two hard days, it is a double —
   * a different question with a different cost, and not one §1i asked for.
   */
  hardDays?: Array<{
    /**
     * ⛔ OPTIONAL AS OF THE §1i PLACEMENT MODEL (slice 8, 2026-08-17). Absent means **the engine
     * proposes one** — a prescribed hard day arrives pre-placed and the athlete moves it, rather
     * than being assembled from parts. A CLUB day still needs its day: only the athlete knows when
     * the club meets, and an app-placed club session would be an invented appointment.
     * ⚠️ Absent and MALFORMED are different answers — see the normaliser.
     */
    day?: string;
    discipline: 'run' | 'bike';
    /** Run terrain — the athlete's pick. Absent → `hill_3min`. Ignored when `discipline` is
     *  `bike`: the ride has one shape (Helgerud `4 × 4`) and no terrain question. */
    terrain?: HardRunTerrain;
    /**
     * ⛔ WHOSE SESSION IS IT (§1i). `prescribed` — the app owns the content, writes the template and
     * can progress it. `club` — the athlete already attends it and does whatever the group does.
     *
     * ⚠️ BOTH ARE HARD DAYS FOR PLACEMENT. A club run costs the same recovery as a prescribed one,
     * so it takes a pin, it takes its discipline's volume out of the week, and it counts toward the
     * competing-stress band. What it does NOT get is a session template or an interval prescription:
     * the app cannot prescribe 4 × 3 min uphill into a group ride, and claiming to would be the
     * "score that lies" in prescription form. Booked, not coached — the same rule as swim.
     *
     * Absent → `prescribed`, which is what every block built before §1i was.
     */
    ownership?: 'prescribed' | 'club';
  }>;
  /**
   * Weekly bike hours from intake (D-323 §6 — hours, never miles: the engine turns hours into
   * sessions and has never learned a ride speed).
   * ⛔ Same drop as `hardDay`: written at NonRaceBuilder.tsx:319, stored on the goal, ZERO readers
   * under supabase/functions until this wire. Carried now so the bike pass has it to consume.
   */
  targetWeeklyRideHours?: number;
  /**
   * ⛔ THE NUMBERS THE HARD SESSIONS PRICE OFF (§7, 2026-08-17). **FED, NOT RE-DERIVED.** All three
   * come from resolvers that already exist and are already the single source of truth for their
   * fact: `resolve-current-ftp.ts`, `resolve-current-run-pace.ts` (threshold), and
   * `resolve-current-5k-pace.ts`. `generate-strength-plan` resolved ONLY the easy pace and nothing
   * else reached here — the starved-input pattern §7 names, the same shape as the run-pace resolver
   * that was written, tested and never once ran. ⛔ Do not write a fourth resolver.
   *
   * ⚠️ THEY ARE ALSO THE GATE. A session that cannot state a pace or a wattage cannot get faster on
   * purpose, so a hard day for a discipline whose number is missing is DROPPED with a compromise
   * line rather than built as a prescription nobody can follow. See `hardDayGate` below.
   */
  ftpWatts?: number | null;
  /** sec per MILE, from `resolveCurrentRunThresholdPace`. */
  thresholdPaceSecPerMi?: number | null;
  /**
   * sec per MILE, from `resolveCurrent5kPace`. ⛔ THE RUN GATE TESTS THIS, NOT A THRESHOLD PACE —
   * §7: *"there is no independent threshold pace on the athlete"*; the app derives it as 5K + 20
   * s/mi when nothing measured exists (`materialize-plan`'s own rule). So the number that has to be
   * present is the 5K, and the session copy says which of the two it used.
   */
  fiveKPaceSecPerMi?: number | null;
  /**
   * The athlete's assistance picks — **twelve now, not three** (D-407).
   *
   * ⛔ ANY STORED SHAPE IS ACCEPTED. `normalizeAssistancePrefs` migrates the old flat
   * `{push, pull, single_leg_core}` that every pre-2026-08-13 goal carries, and absent → the balanced
   * default week, so skipping the card still produces a complete block. Typed `unknown` on purpose:
   * this arrives straight off `goals.training_prefs.assistance_picks` and pretending it is already
   * the current shape is how a persisted-key migration gets skipped.
   */
  assistancePicks?: unknown;
  /**
   * ⛔ THE ATHLETE'S DECLARED STRENGTH EQUIPMENT (`user_baselines.equipment.strength`), for the
   * BUILD-TIME assistance gate (2026-08-13). Raw chip strings ("Barbell + plates", "Dumbbells" …) —
   * `canPerform`/`athleteEquipmentToKeys` own the translation. Absent/empty degrades to ungated,
   * the same §0h rule as everywhere else: unknown means "we have not asked", never "owns nothing".
   */
  athleteEquipment?: string[] | null;
  /** ⛔ SWIM IS A COURTESY, NOT A PRESCRIPTION (D-323 item 5). Number of swims to BOOK per week;
   *  0 or absent → none. See `swimSessions` for what the app is and is not claiming here. */
  swimDays?: number;
  /**
   * ⛔ WHAT EACH CYCLE EARNED, per lift — Wendler's 95% validity check, finally reachable.
   *
   * `verdicts[i]` is earned in cycle i+1 and decides what cycle i+2 carries: `advance` (+5/+10),
   * `reset` (−10%), `hold` (unchanged — the session was not done, so there is nothing to advance on).
   *
   * ⚠️ ABSENT MEANS ADVANCE, which is byte-identical to the old calendar-only behaviour. This is the
   * seam; the reader that computes verdicts from LOGGED reps cannot live here, because this composer
   * authors all twelve weeks before a single set has been performed.
   */
  cycleVerdicts?: Partial<Record<keyof OneRepMaxes, readonly WorkingNumberVerdict[]>>;
  /**
   * ⛔ HOW MANY CYCLES BUILD BEFORE THE ONES THAT MEASURE (2026-07-28). Continuity across the four
   * main lifts, plus the overrides. Absent → `unknown` → 2 leaders + 1 anchor, which is exactly the
   * shape this block had before the input existed. A pure addition.
   */
  blockShape?: BlockShapeInputs;
  /** `performance_numbers.pullupMaxReps` — the one tested accessory capacity that exists. */
  pullupMaxReps?: number;
  /**
   * ⛔ WHERE THE PREVIOUS BLOCK ENDED — per lift, absolute lb. Present on a SECOND or later block.
   *
   * Absent → derive from the 1RM, which is the first-block path and stays byte-identical. A missing
   * prior is a new athlete, not a signal (§0h).
   *
   * ⚠️ This is the END of the previous block, not its start. `plans.config.training_max` stores the
   * START, so the caller replays the cycle progression to find where it finished — the same function
   * the block itself used, so the two cannot drift.
   */
  priorTrainingMax?: Partial<OneRepMaxes> | null;
};

/** ONE prescribed set. `weight` is absolute lb — resolved at authoring off the stored working
 *  number, never a percentage the athlete's moving 1RM could re-resolve later. */
type PlannedSet = { weight: number; reps: number; amrap?: boolean; warmup?: boolean };

type StrengthExercise = {
  name: string;
  /** ⛔ OPTIONAL, because an assistance row genuinely has no set count — it carries a REP TOTAL the
   *  athlete splits however they like. It was `1`, which rendered as "1×25" and asserted a single
   *  set of twenty-five that the prescription never asked for. Absent is the honest value; a main
   *  lift still carries its three. */
  sets?: number;
  reps: number | string;
  weight: string | number;
  /** True fraction of the athlete's 1RM (0–1) for the top set. Feeds the RIR chart (D-322).
   *  Absent on bodyweight rows — a lift with no bar has no percentage. */
  percent_1rm?: number;
  /** ⛔ false = the engine states the movement and the reps and NOTHING about the weight. Assistance
   *  work is auto-regulated by design (see `assistanceRows`); materialize must not derive a load for
   *  it, and the logger must not show one. Absent/true → every other row behaves as before. */
  load_prescribed?: boolean;
  /** ⛔ A STARTING POINT FOR THE LOGGER'S ENTRY BOX — NOT A PRESCRIPTION, AND NOT A QUIETER `weight`
   *  (D-406). It rides ONLY on assistance rows, always alongside `load_prescribed: false`, and the
   *  two do not contradict: the plan still declines to name a load, and this is a number the athlete
   *  can start from and immediately overwrite.
   *  ⚠️ NO SURFACE MAY RENDER THIS AS WHAT THE PLAN ASKED FOR. "By feel" stays the prescription
   *  everywhere it is shown today — the compare table's own words: *"by feel is not decoration, it
   *  is the prescription."* A surface that prints this number as a target has reintroduced the
   *  forced progression on a secondary movement that the load rule exists to prevent.
   *  ⚠️ ABSENT on bodyweight movements, on movements with no coefficient, and whenever the athlete's
   *  maxes cannot answer. Absent means "no suggestion", never "zero". */
  weight_suggested?: number;
  /**
   * ⛔ TRUE ON THE SUPPLEMENTAL ROW — the FSL block that follows the main lift on a leader week
   * (§1e). It carries the SAME `name` as the main lift on purpose (it is the same movement), and
   * this flag is what lets the logger group the two under one heading instead of rendering two
   * exercises with one name. Absent/false on every other row.
   */
  supplemental?: boolean;
  /**
   * A short label the logger renders under the exercise name. ⚠️ NOT part of the identity — every
   * name-matched read (the planned↔executed matcher, the compare table, Garmin's step builder) keys
   * on `name` alone, which is why the supplemental keeps the main lift's name and says what it is
   * here instead.
   */
  notes?: string;
  /** ⛔ THE PER-SET PRESCRIPTION. 5/3/1 is three sets at three weights; the app's one-weight-per-
   *  exercise shape cannot say that, and copying the top set onto all three prefills the phone with
   *  a weight the athlete was not asked to lift twice a session, four days a week, for twelve weeks.
   *  `weight`/`reps` above stay the TOP set so every existing consumer is unchanged. */
  set_plan?: PlannedSet[];
};

type PlanSession = {
  day: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  strength_exercises?: StrengthExercise[];
  steps_preset?: string[];
  tags: string[];
};

type ArcPhase = { name: string; start_week: number; end_week: number; weeks_in_phase: number };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// ── The week (SPEC §1) ───────────────────────────────────────────────────────
// FOUR DAYS, locked. One main lift per day, same day every week. Wed/Sat endurance, Sun off.
// Which lift lands on which day is CONVENTION (SPEC §3, T3) — ours, not Wendler's.
const MAIN_LIFTS: Array<{
  day: string;
  name: string;
  ref: keyof OneRepMaxes;
  isLower: boolean;
  focus: 'upper' | 'lower';
}> = [
  // ⛔ THIS IS WENDLER'S ORDER, VERBATIM (2nd ed. p.11), AND IT IS NOT ARBITRARY ANY MORE.
  //
  //     Day 1                     Day 2       Day 3          Day 4
  //     Standing Military Press   Deadlift    Bench Press    Squat
  //
  // Suggested days, same page: Mon/Tue/Thu/Fri · Sun/Mon/Wed/Fri · Sun/Mon/Wed/Thu — the `day` values
  // below are the first of those. ⚠️ They are a FALLBACK ONLY; `week-solver` places the bar around
  // the athlete's endurance days and the solved day wins (see `dayForLift`). What this array actually
  // fixes is the ORDER and the pairings.
  //
  // ⛔ IT USED TO BE Bench · Squat · OHP · Deadlift — the same two pairings (a press, then a lower
  // lift) with the halves swapped, so it alternated correctly and simply was not the book's sequence.
  // Michael, 2026-08-05, reading his own week: *"shouldnt it go BP Squat OHP DL? isnt that whats in
  // the book?"* — it is not; the book leads with the press. Changed to match rather than to explain
  // the difference away.
  { day: 'Monday',   name: 'Overhead Press', ref: 'overheadPress',  isLower: false, focus: 'upper' },
  { day: 'Tuesday',  name: 'Deadlift',       ref: 'deadlift',       isLower: true,  focus: 'lower' },
  { day: 'Thursday', name: 'Bench Press',    ref: 'bench',          isLower: false, focus: 'upper' },
  { day: 'Friday',   name: 'Back Squat',     ref: 'squat',          isLower: true,  focus: 'lower' },
];

/**
 * ⛔ THIS WAS `['Wednesday', 'Saturday']` — TWO HARDCODED WEEKDAYS — AND IT IS NOW A COUNT (2026-08-08).
 *
 * It was doing two unrelated jobs under one name. Its LENGTH is the default number of endurance
 * sessions a Strong Focus week carries, which is a real default and survives here. Its CONTENTS were
 * a placement decision — Wednesday and Saturday, chosen by nobody, honoured by an athlete who never
 * asked for either — and placement is the engine's job. `SPEC-week-solver` §0c: the law's currency is
 * hours between named sessions, never forbidden or favoured weekdays.
 *
 * ⚠️ THE DEFAULT LONG DAY IS SEPARATE AND DELIBERATELY UNCHANGED. `DEFAULT_LONG_DAY` below is the
 * anchor an unpinned athlete gets, and it is still Saturday — the last of the old pair — so nobody
 * who never answered the long-run question sees their week move.
 */
const DEFAULT_ENDURANCE_SESSIONS = 2;

/** The long-run/ride day for an athlete who never named one. The anchor, not a placement rule. */
const DEFAULT_LONG_DAY = 'Saturday';

/**
 * ⛔ TWO HARD ENDURANCE DAYS IS THE CEILING (§1i, 2026-08-17) — two runs, two rides, or one of each.
 *
 * It is a cap and not a target: one, or none, is unchanged and is still the common week. Two is what
 * the athlete chasing speed can now ask for, and the copy says plainly that one HOLDS top-end
 * fitness while two BUILDS it (Hickson: frequency and duration can fall a long way and hold; only
 * intensity loses it — and one interval session a week sits below the improvement threshold for a
 * trained athlete).
 *
 * ⚠️ THREE IS NOT "TWO PLUS ONE". This block's recovery model — the 48h heavy-leg clearances, the
 * assistance band's competing-stress reading, the one protected rest day — has been reasoned about
 * at zero, one and two. Building a third because a caller sent it would be the engine agreeing to a
 * week nobody designed, so the extra entries are dropped at the door rather than honoured.
 */
const MAX_HARD_DAYS = 2;

/** A finite, positive number or null. ⚠️ Guarded BEFORE `Number()` — `Number(null)` is 0, and 0 is
 *  not a pace or a wattage; reading it as one is the documented repeat bug in this codebase. */
function asPositiveNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── The session (SPEC §1) ────────────────────────────────────────────────────
// 1. jumps or throws  2. the main lift  3. the supplemental (leaders)  4. the three assistance slots.

/**
 * ⛔ THE JUMP DOSE SCALES WITH THE PHASE, THE SAME DIRECTION AS THE ASSISTANCE — Forever p.18:
 * *less* jumps and throws in a leader, *more* in an anchor. It was a flat `3×5` on every week.
 *
 * | phase | total | source |
 * |---|---|---|
 * | leader   | 10 | p.18 "less jumps and throws"; p.22's tables print 10 total |
 * | anchor   | 15 | p.18 "more jumps and throws" — his anchor range is 15–20 |
 * | 7th-week | 10 | p.22, the light standalone week |
 *
 * ⚠️ 15 IS THE BOTTOM OF HIS ANCHOR RANGE, AND THAT PICK IS OURS (T3). 20 landings on the same day as
 * a 95% single and a rep-out, for an athlete running underneath the block, is the fatigue this whole
 * configuration exists to protect. 15 is also exactly what every week carried before this change, so
 * the anchor is unchanged and only the lighter weeks come down.
 *
 * ⚠️ SETS OF 5, NOT A REP TOTAL. A jump is a quality primer — the set structure is the prescription
 * (Wendler pairs them with full recovery), unlike an assistance slot where the total is the unit.
 */
/** ⛔ ONE SPELLING. The 3-day merge identifies the primer row by name to keep it in front. */
export const JUMP_NAME = 'Box Jump';

export function jumpsFor(phase: AssistancePhase): StrengthExercise {
  const sets = phase === 'anchor' ? 3 : 2;
  return { name: JUMP_NAME, sets, reps: 5, weight: 'Bodyweight' };
}

/**
 * The three assistance rows, from the athlete's own picks (`src/lib/assistance-menu.ts`).
 *
 * ⛔ **NO PRESCRIBED LOAD, AND NO SET COUNT.** Only the four main lifts are dictated by percentages
 * of the training max. Assistance is auto-regulated by design: tie a dumbbell row to a percentage
 * and you force progression on a secondary movement, the athlete arrives at their next main lift
 * already fatigued, and the fatigue budget their endurance training needs is gone.
 *
 * So a row states a MOVEMENT and a REP TOTAL. `sets: 1` is not "one set of 25" — it is the absence
 * of a set prescription; the athlete splits the 25 however that day suits, and `ASSISTANCE_GUIDANCE`
 * says so in the session description. `load_prescribed: false` stops materialize deriving a weight,
 * which it would otherwise happily do for the loaded options (dips, dumbbell bench, dumbbell row).
 *
 * These three slots are also the Adjust-tab holes — a glute focus loads single-leg/core, a pull-up
 * focus loads pull. An add-on REPLACES the pick in a slot; it never adds a fourth.
 */
/**
 * ⛔ THE ASSISTANCE **SUGGESTION** — D-406. Read the load rule at the top of `assistance-menu.ts`
 * before touching this; this function is the one narrow exception to it and it is narrow on purpose.
 *
 * **What did NOT change:** the plan still prescribes no assistance load. `weight` stays `'By feel'`,
 * `load_prescribed` stays `false`, and every surface that renders the prescription keeps rendering
 * "by feel". *"The absence is the design"* is still true of the PRESCRIPTION.
 *
 * **What this adds** is a starting point for the athlete's entry box, so a beginner facing
 * `Dumbbell Row — 50 total, by feel` is not asked to invent a number from nothing on their first
 * session. It is greyed, overwritable, and never echoed back as what the plan asked for.
 *
 * ── HOW THE NUMBER IS DERIVED, AND WHY EVERY STEP IS SOURCED ─────────────────────────────────────
 *
 *   accessory e1RM  =  parent lift's max × `ratio`     (`exercise-config`, `primaryRef` + `ratio`)
 *   suggestion      =  weightForReps(accessory e1RM, 12, rir 2)   (Wendler's own formula, p.32)
 *
 * ⛔ **THERE IS NO INVENTED PERCENTAGE ANYWHERE IN THAT.** The obvious implementation — "take 65% of
 * the accessory's max" — is precisely the fabricated intensity `materialize-plan` strips on sight,
 * and it would be a number nobody could source. Instead the rep target and the reps-in-reserve are
 * the inputs, and the percentage FALLS OUT of Wendler's estimator: 12 reps with 2 left is ~68% of
 * max, because that is what his equation says, not because anyone chose 68.
 *
 * ⚠️ **12 REPS IS THE ONE JUDGEMENT CALL AND IT IS THE SLOT'S OWN NUMBER**, not a new one: a 50-rep
 * total broken into the sets a lifter actually runs is 3-5 sets of 10-15, and p.51's own prescription
 * for these slots is "5 sets of 10-20". 12 sits inside both. **RIR 2 is the guidance verbatim** —
 * *"a few reps left, never to failure"* — expressed as arithmetic instead of as a chosen percentage.
 *
 * ⛔ **RETURNS `{}` — NOT A ZERO, NOT A NULL — WHENEVER IT CANNOT ANSWER**, so the field is simply
 * absent on the row and every consumer sees "no suggestion" rather than "a suggestion of nothing".
 * Three cases, and all three are correct silences:
 *   · **bodyweight and bands** (chins, dips, push-ups, sit-ups, face pull) — Michael's rule, and the
 *     honest one: the athlete finds their own level, and a band that assists a chin builds strength
 *     faster than grinding ugly reps.
 *   · **no coefficient** — the movement has no `primaryRef`/`ratio` pair to derive from.
 *   · **no max on file** for the parent lift.
 */
function suggestedAssistanceWeight(
  name: string,
  oneRepMaxes?: Record<string, number> | null,
): { weight_suggested?: number } {
  if (!oneRepMaxes) return {};
  const cfg = getExerciseConfig(name);
  if (!cfg || !cfg.primaryRef || !(cfg.ratio > 0)) return {};
  // ⚠️ BODYWEIGHT AND BAND MOVEMENTS ARE EXCLUDED BY DISPLAY FORMAT, not by a name list. `Dips` has a
  // real bench ratio and would otherwise price — it is bodyweight work for the athlete this block is
  // written for, and the work order is explicit that chins and dips get no suggested number.
  if (cfg.displayFormat === 'bodyweight' || cfg.displayFormat === 'band' || cfg.displayFormat === 'dipsAdded') return {};
  if (/^(dip|dips)$/i.test(String(name).trim())) return {};

  // ⛔ TWO VOCABULARIES FOR THE SAME FOUR LIFTS, AND INDEXING ONE WITH THE OTHER SILENTLY RETURNS
  // NOTHING. `exercise-config` calls it `primaryRef: 'overhead'`; `OneRepMaxes` calls the same lift
  // `overheadPress`. A direct `oneRepMaxes[cfg.primaryRef]` therefore resolved `undefined` for every
  // overhead-referenced accessory — Dumbbell Shoulder Press got no suggestion, with no error and no
  // test failure, because "no suggestion" is a legitimate output. Found by printing the acceptance
  // block and reading a blank where a number belonged.
  // ⚠️ `hipThrust` HAS NO `OneRepMaxes` KEY AT ALL and maps to null on purpose — an accessory priced
  // off a hip thrust has no max on file to price against, so silence is the correct answer.
  const parentMax = Number(oneRepMaxes[ONE_RM_KEY_FOR_REF[cfg.primaryRef] as keyof typeof oneRepMaxes]);
  if (!Number.isFinite(parentMax) || parentMax <= 0) return {};

  const accessoryMax = parentMax * cfg.ratio;
  let w = weightForReps(accessoryMax, ASSISTANCE_SUGGESTION_REPS, ASSISTANCE_SUGGESTION_RIR);
  // perHand entries whose ratio describes the TOTAL must be halved before rounding, so the number
  // lands on a real dumbbell rather than on half of one. Mirrors `calculatePrescribedWeight`.
  if (cfg.displayFormat === 'perHand' && cfg.ratioIsTotal) w = w / 2;
  const rounded = Math.round(w / 5) * 5;
  return rounded >= 5 ? { weight_suggested: rounded } : {};
}

/**
 * `exercise-config`'s `primaryRef` → the `OneRepMaxes` key for the same lift. ⛔ THE ONE PLACE THE
 * TWO VOCABULARIES MEET. Do not "simplify" this away by indexing directly; see the note at the call
 * site. `hipThrust` → null because there is no max on file for it.
 */
const ONE_RM_KEY_FOR_REF: Record<string, keyof OneRepMaxes | null> = {
  bench: 'bench',
  squat: 'squat',
  deadlift: 'deadlift',
  overhead: 'overheadPress',
  hipThrust: null,
};

/** 50 total broken into the sets a lifter runs is 3-5 × 10-15; p.51 prescribes 5 × 10-20. */
/**
 * ⛔ WHAT A RECOVERY WEEK DOES TO THE ACCESSORIES (Michael, 2026-08-17).
 *
 * | week          | scale | why                                                              |
 * |---------------|-------|------------------------------------------------------------------|
 * | cycle (1-3…)  | 1     | the band decides; nothing here touches it                        |
 * | 7th-week (4,8)| 0.5   | the main lift's volume drops and the accessories drop with it    |
 * | TM test (12)  | 0     | warm up, hit the TM, walk out — no fatigue is built on a test day |
 *
 * ⚠️ **THE 0.5 CONTRADICTS FOREVER p.23 AND MICHAEL RULED ANYWAY — HIS CALL, RECORDED SO IT IS NOT
 * "FIXED" BACK.** p.23 prescribes 25-50 reps per assistance slot on the 7th week, and the decision
 * of 2026-08-15 (§1a/§1c) deliberately kept them for exactly that reason — its own words: cutting
 * them "removed the one week where the athlete has the freshness to do them well." Halving the
 * busiest band's 25 lands at 13, BELOW the book's stated floor for that week. The reasoning given
 * for overriding it is systemic-fatigue clearance for a hybrid athlete, which is a load Wendler's
 * 7th week was not written against. ⛔ Do not restore p.23's number without asking him.
 *
 * ⚠️ THE ZERO IS NOT IN THAT CONFLICT. p.22/p.23 describe the 7th week; the TM-test week is a
 * different animal and the book does not prescribe accessories into a max attempt.
 */
export const RECOVERY_ASSISTANCE_SCALE = { cycle: 1, deload: 0.5, tm_test: 0 } as const;

/**
 * ⛔ WHICH DAY CARRIES TWO MAIN LIFTS — DERIVED, NEVER NAMED. In the three-day layout that is the
 * Deadlift + Press day, but writing `'deadlift'` here would rot the moment the pairing changes
 * again (it was Bench + Press until 2026-08-15). Read off `MAIN_LIFTS`, so it cannot disagree.
 */
function mergedLiftDays(): Set<string> {
  const byDay = new Map<string, number>();
  for (const l of MAIN_LIFTS) {
    const d = liftDayForMainLift(l.name);
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return new Set([...byDay.entries()].filter(([, n]) => n > 1).map(([d]) => d));
}

const ASSISTANCE_SUGGESTION_REPS = 12;
/** `ASSISTANCE_GUIDANCE` verbatim: "a few reps left, never to failure." */
const ASSISTANCE_SUGGESTION_RIR = 2;

function assistanceRows(
  /** Raw, straight off the goal. Migrated here — see `normalizeAssistancePrefs`. */
  picks: unknown,
  /**
   * ⛔ THE BLOCK WEEK, 1-BASED — AND IT SITS SECOND SO IT CAN BE REQUIRED (§1h, 2026-08-17). The grip
   * rotates ACROSS weeks now, so "which grip is this session" can no longer be answered from the day
   * alone. Every parameter after this one is optional, and an optional `week` defaulting to 1 would
   * rebuild week 1's grips for the entire block — the static-map bug wearing different clothes. So
   * it is required, and the type checker is what enforces that a new caller supplies it.
   */
  week: number,
  // ⛔ THE VOLUME IS DERIVED PER SLOT AND PER CYCLE (2026-07-28). The floor is Wendler's own lowest
  // number and what is derived is the POSITION within the 50-75 band. Only a TESTED capacity moves a
  // slot up; posture alone never does, because posture is evidence of intent rather than of capacity.
  // Anchor cycles hold the floor: the main lifts are at 95% with a rep-out, and that is the week
  // accessory volume must not compete with.
  // ⛔ KEPT THROUGH D-407 DELIBERATELY. The mock showed a flat 50 per slot. The capacity scaling is
  // sourced and already shipped, and the per-day picker does not re-ask "how many reps in a slot" —
  // so flattening it would have been a silent behaviour loss dressed as fidelity to a mock.
  scale?: AssistanceScaleInputs,
  /**
   * ⛔ THE DAY'S MAIN LIFT SELECTS WHICH OF THE ATHLETE'S THREE DAYS THIS IS — it no longer decides
   * what goes in the slots (D-407). Absent, or a lift this map does not recognise, → the balanced
   * default week, which is a complete block rather than a degraded one (§0h).
   */
  mainLiftName?: string | null,
  /**
   * ⛔ THE ATHLETE'S MAIN-LIFT MAXES, AND THEY BUY A SUGGESTION — NEVER A PRESCRIPTION. Added
   * 2026-08-09 (D-406). Absent → no suggestion is emitted at all, which is the pre-D-406 shape
   * exactly, so any caller that does not have maxes degrades to unchanged rather than to a guess.
   */
  oneRepMaxes?: Record<string, number> | null,
  /** The athlete's declared kit — threaded to `resolveDayAssistance`'s build-time gate. */
  athleteEquipment?: string[] | null,
  /**
   * ⛔ WHAT THE WEEK DOES TO EVERY TOTAL IN HERE — see {@link RECOVERY_ASSISTANCE_SCALE}. 1 on a
   * cycle week, 0.5 on a 7th-week, 0 on the TM test. Absent → 1, so any caller that has not been
   * taught about recovery weeks builds exactly what it built before.
   */
  volumeScale: number = 1,
): { rows: StrengthExercise[]; note: string | null } {
  // ⛔ ZERO MEANS NO ROWS, NOT ROWS OF ZERO. A "0 total" line on a test-week card is the plan asking
  // for a movement and then asking for none of it.
  if (volumeScale <= 0) return { rows: [], note: null };
  const prefs: AssistanceWeekPrefs = normalizeAssistancePrefs(picks);
  // ⛔ THE FALLBACK IS A REAL DAY. It was `?? 'press'`, which slice 5 deleted (2026-08-17) — an
  // unrecognised main lift would have handed `resolveDayAssistance` a key that is no longer a
  // `LiftDay`. §0h says unknown degrades to a COMPLETE block, so it degrades to the first day's,
  // read off the list rather than named, so it cannot rot the next time the order changes.
  const day = liftDayForMainLift(mainLiftName) ?? LIFT_DAYS[0];

  // ⛔ THE PULL-UP PROGRESSION, WHEN THE ATHLETE OPTED IN. It pins the pull category to a chin/pull-up
  // on every lifting day, at Wendler's own weekly dose, with the grip rotating day to day (Forever
  // p.26). ⚠️ `pullupMaxReps` is the SCALER, not a target — see `weeklyVolumeFor` for why a 2-rep
  // athlete is not handed 100 chins a week.
  // ⛔ NO DIVISOR ARGUMENT ANY MORE (§1h). This passed a literal `4` while the block builds THREE
  // days, so a 100-rep weekly prescription reached the athlete as 75 and nothing said so. The
  // library owns the split now and hits the weekly anchor exactly: 33 · 33 · 34.
  const dose = prefs.performance_focus === 'pullups'
    ? weeklyVolumeFor(scale?.pullupMaxReps)
    : null;
  /**
   * ⛔ THE DAY'S POSITION IN THE WEEK — one index, now serving TWO different questions, and they are
   * kept apart on purpose (§1h). It feeds the grip rotation (with the week) and, separately, the
   * weighted-day check below. They used to be the same lookup into `LIFT_DAY_ORDER_FOR_GRIP`, which
   * is why the work order says the weighted day must NOT be swept into the grip change.
   */
  const dayPosition = Math.max(0, LIFT_DAYS.indexOf(day));
  const grip = gripForSession(week, dayPosition, CHIN_SESSIONS_PER_WEEK);
  const pullup = dose
    // ⚠️ THIS DAY'S SHARE, not the week's and not an average — `perDay` is the exact split and the
    // last day carries the remainder.
    // ⛔ AND THE PROGRAMME HALVES ON A RECOVERY WEEK LIKE EVERYTHING ELSE. 100 chins a week is the
    // thing a deload most needs to clear; leaving the one opt-in programme at full volume would make
    // the athlete who opted in the only one who never gets a light week.
    ? {
      movement: movementForGrip(grip),
      totalReps: Math.max(
        volumeScale >= 1 ? 1 : 5,
        Math.round(((dose.perDay[dayPosition] ?? dose.perDay[0]) * volumeScale)),
      ),
    }
    : null;
  // ⚠️ ONE SLOT BUDGET FOR THE DAY. `assistanceTotalReps` is per-slot and the pull slot is the only
  // one with a tested capacity, so it is asked per category and each row carries its own total.
  /**
   * ⛔ THE MERGED DAY OVERRIDES THE BAND AND TAKES THE FLOOR (wired 2026-08-17).
   * `ASSISTANCE_MERGED_DAY_REPS` was declared with the note "not wired until the three-card picker
   * lands". The picker landed and nothing ever read the constant, so the block's most neurologically
   * taxing session — two main lifts on one day — was taking the same accessory volume as the bench
   * day, and a light-endurance week could hand it 40-50. It cannot outrank the floor.
   */
  const bandTotal = assistanceTotalReps('push', scale).totalReps;
  const dayTotal = mergedLiftDays().has(day) ? Math.min(bandTotal, ASSISTANCE_MERGED_DAY_REPS) : bandTotal;
  /** ⚠️ Round to fives so a halved total still reads like a lifter's number; floor at 5, never 0. */
  const scaled = (n: number): number =>
    volumeScale >= 1 ? n : Math.max(5, Math.round((n * volumeScale) / 5) * 5);

  const rows = resolveDayAssistance(prefs, day, scaled(dayTotal), pullup, athleteEquipment)
    .map((a) => {
      // ⛔ THE PROGRESSION'S DOSE WINS OVER THE SLOT SCALER ON THE PULL ROW. Both answer "how many
      // reps", and running them both would double-count: `assistanceTotalReps` sizes a maintenance
      // slot off tested capacity, `weeklyVolumeFor` sizes a PROGRAMME off the same capacity. When the
      // athlete opted into the programme, the programme's number is the prescription.
      const totalReps = a.isAbsAddOn
        ? a.totalReps
        : (a.category === 'pull'
            // ⚠️ THE PULL SLOT ASKS THE BAND SEPARATELY (it has its own tested capacity), so it has
            // to take the merged-day cap and the recovery scale separately too — it is the one row
            // that does not inherit them from `dayTotal` above. It did not, and a 7th week printed a
            // full-volume pull slot beside three halved ones.
            ? (pullup
                ? pullup.totalReps
                : scaled(mergedLiftDays().has(day)
                    ? Math.min(assistanceTotalReps('pull', scale).totalReps, ASSISTANCE_MERGED_DAY_REPS)
                    : assistanceTotalReps('pull', scale).totalReps))
            : a.totalReps);
      return {
        name: a.name,
        // ⛔ `sets: 1` RENDERED AS "1×25" AND THAT IS A LIE ABOUT THE PRESCRIPTION.
        //
        // The number is a TOTAL, to be broken up however the athlete likes that day — 5×5, 2×12,
        // whatever. `ASSISTANCE_GUIDANCE` says exactly that and rides in the session description, but
        // the row shouted "1×25" over the top of it. Michael, reading his own plan: *"25 chin ups?
        // lol i can do 5."* He can do five. The prescription never asked for twenty-five in a row.
        //
        // `sets: undefined` so no consumer can render a set count that was never prescribed, and the
        // rep field carries the unit in words.
        sets: undefined,
        reps: `${totalReps} total`,
        // ⛔ STILL 'By feel', AND `load_prescribed` IS STILL false. Both are load-bearing and neither
        // D-406 nor D-407 touched either. `weight` is what every surface RENDERS as the prescription,
        // and the prescription has not changed: the plan still declines to name a load.
        // `load_prescribed: false` is separately the one answer to "is this row assistance?"
        // (`src/lib/assistance-slot.ts`, D-370) — flipping it would make the server matcher, the
        // logger, the compare table and the performance summary stop recognising the row, and work
        // the athlete did would read as a skip.
        weight: 'By feel',
        load_prescribed: false,
        // ⚠️ A SEPARATE FIELD FOR A SEPARATE CLAIM. `weight_suggested` is not a quieter `weight` — it
        // is a STARTING POINT for the logger's entry box, greyed and overwritable, and no surface may
        // render it as what the plan asked for. Omitted entirely for bodyweight movements and
        // wherever the maxes cannot answer, because an absent suggestion is honest and a fabricated
        // one is not.
        ...suggestedAssistanceWeight(a.name, oneRepMaxes),
      };
    });
  // ⛔ `note` IS ALWAYS NULL NOW, AND THE FIELD IS KEPT ON PURPOSE. It carried the substitution
  // sentence — *"You picked Push Up — squat days finish on the trunk…"* — which existed because the
  // engine overrode the athlete's pick. Under D-407 nothing is overridden, so there is nothing to
  // explain. The shape stays so the one call site is untouched; delete both together or neither.
  // ⛔ `note` WAS ALWAYS NULL AFTER D-423 AND NOW HAS ONE JOB: naming the progression when it is on.
  // It is not a substitution apology — nothing was overridden against the athlete's wishes; they
  // opted in, and the line states the dose, the grip and the standard they are climbing toward.
  // ⚠️ THE STANDARD IS STATED AS A SESSION MEASURE, never as "progress toward 50". 50 reps in 10
  // minutes and a max-clean-rep figure are different measurements and the copy must not merge them.
  const note = dose
    ? `${pullupDoseNote(dose, scale?.pullupMaxReps ?? null)} ${GRIP_LABEL[grip]} this day. ` +
      `Wendler's standard is ${SESSION_STANDARD_REPS} reps inside ${SESSION_STANDARD_MINUTES} minutes.` +
      (dose.assistedOnRamp
        ? ' Band-assisted reps are logged separately, so they never count as clean ones.'
        : '') +
      // ⛔ THE ARMS FOCUS IS SUBSUMED, NOT DROPPED — and the line exists because the athlete would
      // otherwise read a silent contradiction. They asked for Arms; the app books no curls.
      //
      // ⚠️ AND IT IS TRUE ONLY OF THE BICEPS HALF. Verified against the resolver rather than assumed:
      // with the progression off, an Arms focus books `Dumbbell Curl` on the bench and deadlift days;
      // with it on, both become chins, while the triceps half (Dips, Close-Grip Bench, Triceps
      // Extension) is untouched on all four. The sentence says exactly that and no more.
      //
      // ⛔ IT IS A NOTE, NOT A MOVEMENT CHANGE. Nothing is added or removed by this branch. Booking
      // curls ON TOP of the chin volume is what the note explains away: a chin is elbow flexion under
      // load, the dose is stated in the same sentence, and stacking isolation on top of it would add
      // fatigue against a by-feel, deliberately low-volume design (D-406).
      // ⚠️ THE DOSE IS NOT RESTATED HERE. `pullupDoseNote` already opened the paragraph with the
      // weekly number two sentences earlier, and saying "100 chins a week" twice in one description
      // reads as two different facts.
      (prefs.focus.includes('arms')
        ? ' Arms focus: the chins are the biceps volume, so no curls are booked on top — ' +
          'the triceps work is unchanged.'
        : '') +
      // ⛔ BY NAME, NOT POSITION (2026-08-17, Michael) — the positional constant silently moved the
      // weighted work onto the deadlift+press day when slice 5 shortened the day list. See
      // `WEIGHTED_DAY` in pullup-progression.ts.
      (day === WEIGHTED_DAY && !dose.assistedOnRamp
        ? ` Add weight for sets of ${WEIGHTED_DAY_REPS} on this day — by feel, as always.`
        : '')
    : null;
  return { rows, note };
}


/**
 * The block, as leader and anchor cycles with each cycle's week 4 as its own deload phase.
 *
 * **The phase NAMES are load-bearing.** `_shared/plan-phase.ts` resolves a week's phase from this
 * array, and `_shared/strength-profiles.ts` maps that name to an effort target. Both were taught
 * `leader` and `anchor` alongside this change — an unrecognised name resolves to a silent default,
 * which is the shape of Q-192.
 */
/**
 * ⛔ THE PHASE NAMES, AND `TM Test` IS NEW (2026-08-15, §1c). Both `_shared/plan-phase.ts` and
 * `_shared/strength-profiles.ts` were taught it in the same change — an unrecognised name resolves
 * to a silent default, which is the shape of Q-192, and `strength-phase-vocabulary.test.ts` fails
 * if any name this function emits stops resolving.
 */
export const PHASE_NAME: Record<BlockWeek['kind'], string> & Record<CycleKind, string> = {
  cycle: 'Leader',        // overridden per cycle kind; present so the record is total
  leader: 'Leader',
  anchor: 'Anchor',
  tm_test: 'TM Test',
  deload_single: 'Deload',
};

/** The phase-structure tag a session carries: `phase:leader`, `phase:tm_test`, … */
export function phaseTagFor(phaseName: string): string {
  return `phase:${phaseName.toLowerCase().replace(/\s+/g, '_')}`;
}

export function buildBlockPhases(weeks: number, shape?: BlockShapeInputs): { phases: ArcPhase[]; recovery_weeks: number[] } {
  const phases: ArcPhase[] = [];
  const recovery_weeks: number[] = [];
  // ⛔ WALKS THE WEEK MAP, not the cycle list. The deloads are no longer derivable as "the last week
  // of each cycle" — they are their own weeks between cycles, and there are TM-test weeks too.
  for (const w of buildWeekMap(weeks)) {
    const name = w.kind === 'cycle' ? PHASE_NAME[w.cycleKind!] : PHASE_NAME[w.kind];
    const last = phases[phases.length - 1];
    // Consecutive weeks of the same cycle collapse into one phase entry; a standalone week is always
    // its own entry even when it repeats the previous name.
    if (last && last.name === name && w.kind === 'cycle' && last.end_week === w.week - 1 && w.weekInCycle !== 1) {
      last.end_week = w.week;
      last.weeks_in_phase = last.end_week - last.start_week + 1;
      continue;
    }
    phases.push({ name, start_week: w.week, end_week: w.week, weeks_in_phase: 1 });
    // ⛔ ONLY THE 7TH-WEEK DELOADS ARE `recovery_weeks`, NOT THE TEST WEEKS. Both are light, and they
    // are light for different reasons: a deload UNLOADS, a test week arrives rested in order to
    // measure. `normalizePhaseKey('TM Test')` resolves to `taper` for exactly that distinction, and
    // filing it as recovery here as well would give the same week two contradictory postures.
    if (w.kind === 'deload_single') recovery_weeks.push(w.week);
  }
  return { phases, recovery_weeks };
}

/**
 * ⛔ MOVED TO THE LOADING MODULE (2026-08-15, §1c) — re-exported here so the one call site and the
 * tests are unchanged. The length arithmetic belongs beside the layout that produces it: valid
 * lengths are no longer "multiples of four" but whatever `blockLayoutFor` can fill exactly, and a
 * second copy of that rule here would drift the first time the layout changes.
 */
export { blockWeeks };

/** A bodyweight/band lift never carries a load or a percentage (D-322). Asserted in the tests:
 *  every assistance row this file authors must answer true here. */
export function isBodyweightName(name: string): boolean {
  const cfg = getExerciseConfig(name);
  return cfg?.displayFormat === 'bodyweight' || cfg?.displayFormat === 'band';
}

/** How one set reads in the session description: "160×5", "160×5+" on an all-out set. */
function setLabel(s: PlannedSet): string {
  return `${s.weight}×${s.reps}${s.amrap ? '+' : ''}`;
}

function exerciseLabel(e: StrengthExercise): string {
  // ⛔ THE SUPPLEMENTAL READS AS ONE BLOCK, NOT AS FIVE IDENTICAL SETS. Its `set_plan` is five rows at
  // one weight, and printing them individually would give "120×5, 120×5, 120×5, 120×5, 120×5" —
  // five facts where the prescription is one. It is named so the athlete knows what it is.
  if (e.supplemental) return `First Set Last — ${e.sets}×${e.reps} @ ${e.weight}`;
  // The summary line names the WORK, not the ramp. Warm-ups live in the set list for the logger;
  // printing them here would read "40×5, 50×5, 60×3, 55×5, …" and bury the prescription.
  const shown = e.set_plan?.filter((s) => !s.warmup);
  if (shown?.length) return `${e.name} ${shown.map(setLabel).join(', ')}`;
  // An assistance row is a rep TOTAL, not a set prescription — "1×25" would read as one set of 25,
  // which is the opposite of the instruction. Say the total and let the athlete split it.
  if (e.load_prescribed === false) return `${e.name} ${e.reps} reps`;
  return `${e.name} ${e.sets}×${e.reps}`;
}

/**
 * The main lift for one day, one week: three sets, three weights, from the loading module.
 *
 * `weight`/`reps` carry the TOP set (the one the block is measured on); `set_plan` carries all
 * three so the logger can open each set on its own number.
 */
function mainLiftRow(
  lift: typeof MAIN_LIFTS[number],
  workingNumber: number,
  oneRM: number,
  sets: WendlerSet[],
  /**
   * A standalone week (TM test / 7th-week deload) — its work sets take the warm-up's bar floor.
   * See the comment on `weight`. ⚠️ Was `isDeload`; renamed 2026-08-15 because the rule now covers
   * both standalone shapes and neither of them is "week 4 of a cycle" any more.
   */
  floorWorkSets = false,
  /** The lightest bar this athlete can assume — 45, or 35 on a commercial gym (2026-08-13). */
  barFloorLb: number = BAR_LB,
): StrengthExercise {
  const set_plan: PlannedSet[] = sets.map((s) => {
    const raw = weightForSet(workingNumber, s.pct);
    // ⛔ A WARM-UP FLOORS AT THE EMPTY BAR. 40/50/60% of a light working number resolves below 45 lb
    // (e.g. a 80 lb press → 32/40/48), which is un-loadable — the athlete presses the bar. Work sets
    // are not floored: a work set below the bar means the training max itself is near-empty-bar, which
    // the athlete would see and correct, not something to silently mask.
    //
    // ⛔ EXCEPT ON A STANDALONE WEEK (2026-08-13, Michael's week-4 OHP on device: 30×5, 40×5 with
    // plate chips on a 45 lb bar). The no-floor reasoning above assumes work sets sit at 65%+ of the
    // working number; a standalone week opens lower with no warm-up ramp in front, so a light
    // working number authors sets no barbell can weigh. Those weeks are recovery volume — the sets
    // ARE the ramp (`warmupSetsForWeek` is not called for them, for exactly that reason) — so they
    // take the same floor the ramp would have: the athlete presses the bar.
    const weight = (s.warmup || floorWorkSets) ? Math.max(barFloorLb, raw) : raw;
    return {
      weight,
      reps: s.reps,
      ...(s.amrap ? { amrap: true } : null),
      ...(s.warmup ? { warmup: true } : null),
    };
  });
  // ⛔ THE TOP SET IS THE LAST WORK SET, NOT THE LAST ROW. Warm-ups are prepended, so reading the
  // literal last element still works today — but the block is measured on the work set, so name it
  // that way and it cannot drift if the ordering ever changes.
  const workSets = set_plan.filter((s) => !s.warmup);
  const top = workSets[workSets.length - 1];
  return {
    name: lift.name,
    // The count the athlete reads as "the work" — warm-ups are a ramp in front, not part of the 3×.
    sets: workSets.length,
    reps: top.amrap ? `${top.reps}+` : top.reps,
    weight: top.weight,
    // The percentage OF THE REAL MAX — not of the working number. This is what the effort chart
    // reads, and the whole point of the 85% working number is that the true percentage stays
    // buffered: a 95%-of-working top set is ~80% of the athlete's actual max.
    percent_1rm: oneRM > 0 ? Math.round((top.weight / oneRM) * 1000) / 1000 : undefined,
    set_plan,
  };
}

// ── THE SUPPLEMENTAL: FIRST SET LAST (§1e) ───────────────────────────────────

/**
 * ⛔ FSL — **the same lift, 5×5 at that week's FIRST-set percentage**, straight after the main work.
 * Leader weeks only.
 *
 * ⛔⛔ **WHAT IS HIS AND WHAT IS OURS, AND THE WORK ORDER'S CITATION FOR THIS WAS PARTLY WRONG.**
 * Checked against `docs/REFERENCE-531-forever-pp16-45.md`, which is the page-pinned reading:
 *
 *   · **HIS:** a leader template *"increase[s] in barbell volume, usually via supplemental"* (p.18).
 *     First Set Last is one of his four named supplemental schemes (p.15). A supplemental may use the
 *     main lift itself; an alternate lift needs its own tested TM (p.15). And **not every 5/3/1
 *     program has a supplemental at all** (p.17) — it is a template choice.
 *   · **HIS, AND THE REASON THE OBVIOUS ALTERNATIVE IS ABSENT:** Boring But Big is *"not a good
 *     option for athletes"* (p.45). It must not be added (work order §2).
 *   · **OURS (T3): the PICK.** The work order cited p.40 for FSL-as-leader-supplemental, and p.40 is
 *     **Beginner Prep School** — a specific novice template the reference doc explicitly marks
 *     "do not cite as general rules". So *that a leader carries a supplemental* is his; *that it is
 *     FSL 5×5 on this block* is our choice, and the reason is below.
 *
 * ⛔ WHY FSL IS THE ONE THIS BLOCK CAN CARRY: it uses the lift's own training max and nothing else.
 * No new maxes, no new equipment, no second movement to pick — the bar is already loaded to
 * 65/70/75% by the week's opening set, and the supplemental repeats it. Every other scheme in his
 * list needs either a number the intake has never asked for or a bar we cannot assume.
 *
 * ⛔ `load_prescribed` IS TRUE, unlike every assistance row. This IS prescribed barbell work off the
 * training max — the same class as the main lift — and marking it `false` would make the server
 * matcher, the logger and the compare table read it as an accessory (`src/lib/assistance-slot.ts`,
 * D-370) and the athlete's logged sets would come back as an unplanned extra.
 *
 * ⚠️ NEVER ON AN ANCHOR OR A STANDALONE WEEK. An anchor's top set is already a rep-out at 95%, and a
 * standalone week is the block's recovery. Adding 25 more reps to either is the accidental hybrid
 * this protocol's whole leader/anchor split exists to avoid.
 *
 * ⚠️ SESSION LENGTH: a leader lower day gains roughly ten to twelve minutes and ~25 reps at 65-75%.
 * The plan description says so once, flatly. The Robineau 6h gap and the scheduling law are
 * unchanged and already cover it — no placement rule moves for this.
 *
 * ⚠️ NOT BUILT, AND HIS: a lift running on a LOWER training max uses **Second Set Last** instead of
 * First Set Last, same 5×5 (p.40, [BPS]). The engine runs one TM percentage for every lift, so the
 * distinction has nothing to key on yet. Noted rather than assumed away.
 *
 * ⚠️ AND THE VOLUME DIAL, IF IT IS EVER TOO MUCH: p.44's stall menu goes the other way (7-10×5 FSL);
 * cutting to 3×5 would be ours. Not in V1, and it would be an athlete-facing dial rather than an
 * engine decision.
 */
const FSL_SETS = 5;
const FSL_REPS = 5;

function fslRow(
  lift: typeof MAIN_LIFTS[number],
  workingNumber: number,
  oneRM: number,
  /** The week's work sets — the FIRST of them is the percentage FSL repeats. */
  workSets: WendlerSet[],
  barFloorLb: number,
): StrengthExercise | null {
  const first = workSets.find((s) => !s.warmup);
  if (!first) return null;
  // ⚠️ THE BAR FLOOR APPLIES. 65% of a light working number can sit under the empty bar, and five
  // sets of an un-loadable weight is the same defect the warm-up floor exists for.
  const weight = Math.max(barFloorLb, weightForSet(workingNumber, first.pct));
  return {
    name: lift.name,
    sets: FSL_SETS,
    reps: FSL_REPS,
    weight,
    percent_1rm: oneRM > 0 ? Math.round((weight / oneRM) * 1000) / 1000 : undefined,
    // ⛔ TAGGED SO THE LOGGER GROUPS IT UNDER THE MAIN LIFT rather than as a second exercise with the
    // same name. `supplemental` is the flag; the name is deliberately identical, because it IS the
    // same movement and a renamed row would break every name-matched read in the app.
    //
    // ⚠️ AND THE MATCHER IS SAFE WITH TWO ROWS OF ONE NAME — `matchStrengthExercises` consumes an
    // executed row once, so two planned "Bench Press" rows take the two logged ones in order rather
    // than both claiming the first (traced, `_shared/strength/match-exercises.ts` `consumed`).
    supplemental: true,
    // ⚠️ `notes` IS THE DISPLAY DIFFERENCE, not the identity. The logger renders it under the name,
    // so the athlete sees two "Bench Press" blocks with the second marked — while every name-matched
    // read (the matcher, the compare table, Garmin's step builder) still sees the one canonical name.
    notes: 'First Set Last',
    set_plan: Array.from({ length: FSL_SETS }, () => ({ weight, reps: FSL_REPS })),
  };
}

/**
 * ⛔ THE LINE WHERE THE ENGINE STOPS DOING THE MATH. Michael, 2026-07-29: *"i think anone that runs
 * more than 25 miles a week can self regulate."*
 *
 * ⚠️ A PRODUCT DECISION WITH NO PAPER UNDER IT, and it must keep saying so. There is no literature on
 * the volume at which a runner can distribute their own week — nobody has studied it. What IS sourced
 * is everything either side of the choice: the maintenance dose (two-thirds of usual, Hickson), and
 * the long-run ceiling this mode exists to stop breaking (25–30% of weekly mileage, Daniels).
 *
 * ⛔ NOT A CAP. Above this line the athlete's typed mileage is honoured in full — the engine changes
 * how it SHAPES the week, never how much of it there is. A ceiling was built once (D-222) and retired
 * 2026-07-01; see the standing warning at the top of `maintenance-volume-band.ts`.
 */
const SELF_REGULATED_MILES = 25;

/**
 * ⛔ EVERY CLAUSE TRACES, AND THE FIRST DRAFT DID NOT.
 *
 * Michael proposed: *"you can hold your run for 15 weeks at 63% of volume."* The 63% is arithmetic off
 * a 40-mile example (25 of 40), not a finding — Hickson's duration arms were 40 min → 26 and → 13,
 * which is two-thirds and one-third. Printing 63% as his would be a number with no paper under it.
 *
 * Two further corrections folded in:
 * - He cut per-session DURATION in one experiment and FREQUENCY in another. "Volume" merges them, so
 *   the note names the two manipulations rather than one word covering both.
 * - What held was VO2max, not the run wholesale. The one-third arm lost ~10% of long-duration
 *   endurance (Hickson 1982, duration arm) — volume defends durability, and less of it costs some.
 *
 * ⚠️ "top-end aerobic fitness", not VO2max — COPY-VOICE rule 9. And the years are printed because a
 * bare "Hickson" in this repo is ambiguous: 1980 is the INTERFERENCE paper the engine cites, 1981/82/85
 * is the maintenance trilogy this note rests on.
 */
const SELF_REGULATED_NOTE =
  'The miles are yours to place — the days are set, the distances are not. '
  + 'Cutting how far or how often holds top-end aerobic fitness: 15 weeks in the trials, at two-thirds '
  + 'and at one-third of the original (Hickson 1981, 1982, 1985). Cutting how hard is what loses it. '
  + 'Volume is what defends durability over long efforts, so less of it costs some of that.';

// Spread the weekly maintenance miles across N runs as a LONG-RUN share + easy fill — NOT total÷N
// (the two-equal-runs bug). Descending: index 0 is the long run. Weights graduate (flatter as N grows:
// 3d ≈ 9/6/5, 4d ≈ 6/5/5/4), then rounded so the parts sum back to the total.
// ⚠️ Used BELOW `SELF_REGULATED_MILES` only — above it the share is even and the athlete distributes.
function distributeRunMiles(total: number, n: number): number[] {
  if (n <= 1) return [Math.max(1, Math.round(total))];
  const WEIGHTS: Record<number, number[]> = {
    2: [1.4, 1.0],
    3: [1.5, 1.0, 0.85],
    4: [1.2, 1.0, 1.0, 0.85],
  };
  const w = WEIGHTS[n] ?? Array.from({ length: n }, (_, i) => (i === 0 ? 1.4 : 1)); // fallback: long + even fill
  const sum = w.reduce((a, b) => a + b, 0);
  const miles = w.map((x) => Math.max(1, Math.round((total * x) / sum)));
  const drift = Math.round(total) - miles.reduce((a, b) => a + b, 0); // absorb rounding on the long run
  miles[0] = Math.max(1, miles[0] + drift);
  return miles;
}

// Q-126 (Gap A): a duration-native intensity token for a maintenance run, so its
// workload_planned reflects the easy/long prescription (0.65 via the Gap-B matcher)
// instead of the 0.75 per-type default. Vocabulary matches the race path + the
// materialize-plan token-parser at the substring level (`run_easy` / `easypace`).
function runIntensityToken(kind: 'easy' | 'long', durationMin: number): string {
  return kind === 'long'
    ? `longrun_${durationMin}min_easypace`
    : `run_easy_${durationMin}min`;
}

/**
 * ⛔ THE DELOAD WEEK EASES THE ENDURANCE TOO — D-407, and until now it did not, which made the
 * deload a strength deload wearing a whole week's name.
 *
 * On weeks 4/8/12 the bar drops to 40/50/60% and the session shortens to 35 minutes — and the
 * athlete's Thursday hill repeats ran at FULL intensity anyway, alongside full easy volume. A week
 * that removes the barbell stimulus and keeps the hard running is not a deload; it is a different
 * week with the same name.
 *
 * ⚠️ **INTENSITY IS CUT FIRST, VOLUME SECOND, AND THE ORDER IS THE WHOLE RULE.** Interference and
 * fatigue scale with endurance INTENSITY far more than with duration, and hard running costs the
 * legs more than anything else on the calendar [Wilson 2012, J Strength Cond Res]. So the hard
 * session is downgraded before a single easy minute is touched.
 *
 * ⚠️ **AND THE EASY WORK IS TRIMMED, NOT DELETED.** Two-thirds, and light spinning and jogging stay
 * on the calendar: Hickson's maintenance trilogy is that cutting INTENSITY is what preserves the
 * aerobic base while frequency holds — a week off entirely is a detraining week, not a recovery one.
 * Same reasoning as `maintenanceDoseFor` on the builder's volume card, which also lands on ~2/3.
 */
const DELOAD_EASY_VOLUME_FACTOR = 2 / 3;

/** Deload trim for one easy session's minutes. ⚠️ Floors at 15 so a short day does not vanish. */
function deloadEasyMinutes(mins: number | undefined, isDeload: boolean): number | undefined {
  if (!isDeload || mins == null || !Number.isFinite(mins)) return mins;
  return Math.max(15, Math.round(mins * DELOAD_EASY_VOLUME_FACTOR));
}

function enduranceSession(
  sport: 'run' | 'bike',
  day: string,
  overrideMins?: number,
  extraNote?: string,
  kind: 'easy' | 'long' = 'easy',
  /**
   * ⛔ THE TRIM LIVES HERE, NOT AT THE CALL SITES, AND THAT IS A CORRECTION (D-407). Trimming
   * `overrideMins` before the call looked equivalent and is not: an override is OPTIONAL, and every
   * caller that omits it falls through to the default below — where a call-site trim cannot reach.
   * Caught by printing a deload week and seeing four untouched 35-minute runs.
   * ⚠️ So the trim must sit AFTER the `??`, on the resolved number, which is the only place that
   * sees every path.
   */
  isDeload = false,
): PlanSession {
  const mins = deloadEasyMinutes(overrideMins ?? (sport === 'bike' ? 45 : 35), isDeload)!;
  // ⛔ NAME AND TAGS DERIVE FROM `kind`, THE SAME SOURCE AS THE TOKEN. Fixed 2026-07-27.
  //
  // They used to be hardcoded — `'Easy Run'` and `['easy', …]` — while `runIntensityToken(kind)`
  // was derived. So ONE SESSION OBJECT DISAGREED WITH ITSELF: the token said
  // `longrun_108min_easypace`, the name said "Easy Run", the tags said `easy`. Anything reading
  // tags saw three easy runs and no long run in the block.
  //
  // ⚠️ FIXING THE LABEL ALONE WOULD HAVE LEFT THE TAGS LYING, and the next session kind added here
  // would have arrived with the same defect. This is §0c one layer down: identity taken from a
  // default instead of from the thing itself. One source, three renderings.
  const isLong = kind === 'long';
  const label = sport === 'bike'
    ? (isLong ? 'Long Ride' : 'Easy Ride')
    : (isLong ? 'Long Run' : 'Easy Run');
  const base: PlanSession = {
    day,
    type: sport === 'bike' ? 'ride' : 'run',
    name: label,
    // ⛔ CONVERSATIONAL IS THE CEILING, ON EVERY ENDURANCE SESSION IN THE BLOCK. Not a suggestion:
    // Hickson is that cutting INTENSITY is what loses the aerobic base, so the volume is what gives
    // here and the effort is what holds. It is also the guardrail that makes the honoured-not-capped
    // mileage safe — a high-volume EASY week is not the interference case, a high-volume hard one is.
    // ⛔ "EASY BY CHOICE", NOT "HELD UNDERNEATH". The old wording — *"held underneath the lifting,
    // not trained"* — described the athlete's running as something being suppressed, which is the
    // wrong read of who picked this block. Nobody demoted the running: an all-around athlete chose
    // to point a stretch at strength, and the endurance ticks over because that is what they
    // decided. Same prescription, same physiology, and the reason is now the athlete's rather than
    // the plan's. ⚠️ THE SECOND CLAUSE IS THE FACT AND STAYS — easy volume is what holds the base
    // (Hickson: intensity is what loses it), so the sentence still says why easy is not a throwaway.
    // ⛔ THE JOIN OWNS THE SPACE, NOT THE CALLERS (2026-08-10). This was a bare `${extraNote ?? ''}`,
    // and the convention was that every note string arrived carrying its own leading space. Two of
    // the three callers remembered; the DELOAD note did not, and weeks 4, 8 and 12 shipped
    // *"…holds the aerobic base.Deload week — the hard session comes off."* A convention that has to
    // be remembered at every call site is a convention that gets broken at one of them, so the join
    // normalises instead: exactly one space, whatever the caller passed.
    description: `~${mins} min easy, all conversational — you could hold a sentence throughout. Easy by choice this block — strength takes the hard work, and easy volume is what holds the aerobic base.${extraNote ? ` ${extraNote.trimStart()}` : ''}`,
    duration: mins,
    // `easy` still rides along on the long session: it IS run at easy effort (the description says
    // conversational throughout). The `long` tag says WHICH session it is; `easy` says how hard.
    tags: isLong
      ? [sport === 'bike' ? 'long_ride' : 'long_run', 'long', 'easy', 'maintenance', 'aerobic']
      : ['easy', 'maintenance', 'aerobic'],
  };
  // Q-126: RUN-only token injection. Bike/ride is fenced to its own pass (Gap A-bike).
  if (sport === 'run') return { ...base, steps_preset: [runIntensityToken(kind, mins)] };
  return base;
}

/**
 * ⛔ THE DEFAULT HARD AEROBIC SESSION — 3-min hill repeats, for the runner with a 3-min climb.
 * One of four run terrains `hardRunSession` dispatches (hill / short hill / treadmill / flat, [D-391]);
 * this is the preselected default. Bike-owners get `bikeQualitySession` instead.
 *
 * Spec: `docs/DOCTRINE-aerobic-maintenance-run-only.md` §2, §3, §5. Until this existed the hard day
 * was PINNED AND EMPTY: the athlete named a day, `place-week` correctly kept the bar off it, and
 * nothing was ever authored to fill it. The composer had never emitted a quality token of any kind.
 *
 * ⛔ WHY UPHILL AND NOT FLAT (§2, and it is measured, not reasoned):
 *  • At MATCHED metabolic cost, loading rate and peak vertical GRF both fall as incline rises
 *    across 0 → 4 → 8% (iso-efficiency protocol, 11 collegiate distance runners). Same engine work,
 *    less tissue load — which is the whole argument on a block where mechanical budget binds.
 *  • The impact transient is what does the damage and uphill removes it; ACTIVE force is unchanged
 *    (Gottschall & Kram 2005). You keep the effort and lose the collision.
 *  • Knee extensor torque is PRESERVED after maximal uphill running and reduced after downhill —
 *    the closest direct evidence that a hard uphill session does not tax what the squat needs.
 *  ⚠️ 4-8% is the TESTED range, not convention. Do not widen it casually.
 *
 * ⛔ LONG REPS, AND THIS REVERSED ON 2026-07-26 (§3, corrected). The first build here was
 * 10 × 40s on the premise that short bouts accumulate time near VO2max more efficiently. They do
 * not — that is contradicted at META-ANALYSIS level: long work intervals (>=2 min) elicit
 * significantly greater time at VO2max than short (<=30s) OR MODERATE (>30s to <2min) intervals,
 * and 40 seconds sits in the moderate band.
 *
 * Head to head at IDENTICAL working time (4 x 3min vs 24 x 30s, 12 min each): 328s vs 201s above
 * 90% VO2max. The short session produced MORE time above 90% HRmax (820s vs 545s) and felt exactly
 * as hard (no RPE difference) — it is the more convincing session and the weaker one.
 *
 * ⛔ THE MECHANICAL ARGUMENT DID NOT DISAPPEAR, IT MOVED TO THE GRADIENT. Short reps were chosen to
 * limit mechanical volume; the HILL is what buys that, measured (§2). Once interval length is not
 * paying for mechanical cost, it should be chosen for stimulus — and long wins.
 *
 * ⛔ NEVER DOWNHILL, NEVER LONG FLAT INTERVALS AT VO2 INTENSITY (§2.1). Downhill is the laboratory
 * MODEL for inducing muscle damage; long flat intervals are the most expensive way to buy the
 * stimulus. Both are directly antagonistic to the block's purpose.
 *
 * ⚠️ Strides (§6) are a SEPARATE quality and do not substitute for this — they defend flat-ground
 * turnover, ten seconds at a time. Hills for the engine, strides for the legs.
 */
/**
 * ⛔ THE BIKE'S HARD SESSION — and per the doctrine this is the one the athlete SHOULD be doing.
 *
 * `DOCTRINE-aerobic-maintenance.md` §6: one hard aerobic session, and **if they have a bike it is
 * the bike**. Hard riding costs the legs less than hard running does — that is a TISSUE claim
 * (concentric-dominant, no impact transient, no eccentric loading), not the contested
 * adaptation-interference one, and it is what makes this the cheaper way to hold the engine.
 *
 * ⛔ 4 × 4 min IS HELGERUD'S PROTOCOL — 90-95% HRmax, 3 min active recovery, ~7% VO2max in 8 weeks
 * across 40 trained men, superior to continuous work and to threshold. The most replicated interval
 * prescription in endurance science, and the reason the run's hill session was rebuilt to 4 × 3 min
 * to match its shape: a run-only athlete should not get a third of the dose.
 *
 * ⚠️ CADENCE IS A CUE, NOT A NUMBER (§5.2, revised). "Spin it, don't grind it." There is no source
 * for a 90 rpm threshold, most riders cannot measure cadence without a sensor, and a number they
 * cannot follow teaches them to ignore the rest of the session. But the intent is load-bearing:
 * low-cadence grinding at high power is quad-dominant torque work, which is the most plausible
 * mechanism behind Sabag 2018's finding that cycling HIIT attenuates lower-body strength. So the
 * cue is the mitigation, and it belongs in the copy where every athlete can act on it.
 */
/** ⛔ ONE OWNER FOR THE HARD RIDE'S LENGTH. The ride budget subtracts this before splitting the easy
 *  hours, so a literal 45 in two places would drift and the week would silently overshoot the ask —
 *  which is exactly the defect that subtraction was added to fix. Mirrors `HILL_SESSION_MIN`. */
const BIKE_QUALITY_MIN = 45;

/**
 * ⛔ THE WAVE — THE HARD DAY MOVES WITH THE BARBELL, WEEK BY WEEK (§7, 2026-08-17).
 *
 * Until this, `hardRunSession(day, lowerDays, terrain)` and `bikeQualitySession(day)` took NO WEEK
 * ARGUMENT: the same session was authored in week 1 and week 11. Twelve identical sessions is a
 * maintenance dose repeated, which is what the screen's own copy admitted — *"holds top-end aerobic
 * fitness. It does not build it."* The lifting has waved since it shipped; the endurance did not.
 *
 * ⛔ INTENSITY AND DENSITY ARE THE ONLY LEVERS, because weekly endurance VOLUME is locked by the
 * athlete's typed miles/hours. Growing total working time is not available and would not be wanted:
 * these sessions land on the same day as heavy squats under §6, and the 12–18 min VO2 / 30–40 min
 * threshold ceilings are exactly what keeps that day survivable. **A progression that grows working
 * time past those defeats the stacking law**, so every step below holds working time and moves
 * something else.
 *
 * ⛔ ONE LEVER PER WAVE, NOT BOTH (Michael's spec). The run's VO2 moves PACE — its recovery is the
 * descent, which is a distance and not a duration (see `descentIsJogged`), so density is not
 * available to it. The ride's VO2 moves DENSITY — 4 min recovery down to 3, which is Helgerud's own
 * figure, so the progression ends AT the protocol rather than past it.
 *
 * ⚠️ `cycleKind` IS THE SECOND AXIS, and it mirrors the bar: leaders establish and advance, the
 * ANCHOR is shortest and fastest — the same shape as the anchor's 95% single.
 */
/**
 * Where a week sits in the block: which week of its cycle, which KIND of cycle, and WHICH cycle.
 *
 * ⛔ `cycleIndex` WAS MISSING AND THE DOCTRINE NEEDED IT. `cycleKind` cannot tell leader 1 from
 * leader 2 — both are `'leader'` — so wave 2's pace drop had nowhere to read from. 1-based.
 */
type HardWave = { weekInCycle: number; cycleKind: CycleKind; cycleIndex?: number };

/**
 * ⛔ 20 MINUTES IN ZONE, HELD, WITH THE CONTINUOUS EFFORT LENGTHENING (§7, Michael's spec).
 * 4 × 5 → 3 × 7 → 2 × 10 across the three weeks of a wave. Same time in zone, harder demand — the
 * athlete holds the pace for twice as long by week three without doing a minute more of it.
 *
 * ⚠️ THE TOTALS ARE 20 · 21 · 20 MIN and that is inside the 30–40 min ceiling with room to spare.
 * The ceiling is not a target: it is the point past which this session stops being compatible with a
 * heavy lower day beside it.
 */
const THRESHOLD_WAVE: ReadonlyArray<{ reps: number; minutes: number; restMin: number }> = [
  { reps: 4, minutes: 5, restMin: 1 },
  { reps: 3, minutes: 7, restMin: 2 },
  { reps: 2, minutes: 10, restMin: 3 },
];

/**
 * ⛔ THE ANCHOR: THE RUN YIELDS AND THE BARBELL WINS (doctrine §2 wave 3, built 2026-08-17).
 *
 * The anchor is where the bar expresses peak strength — 95% singles and an open last set taken
 * toward failure. **Two peak nervous-system efforts on one day is the collapse this whole
 * arrangement exists to prevent**, so the run drops to a maintenance flush that HOLDS the adaptation
 * the leader waves bought at a fraction of the time under tension.
 *
 * ⚠️ THE PACE GOES BACK TO WAVE 1 — no offset, deliberately. The doctrine is explicit: *"Do not run
 * faster. No 5K-pace work in this block."*
 * ⚠️ SO THE RUN'S PEAK AND THE BAR'S PEAK ARE OUT OF PHASE ON PURPOSE. The hardest running in the
 * block is week 7, not week 11. If a later change makes the anchor's run harder "for symmetry with
 * the bar", it is reintroducing the double-peak this table exists to remove.
 *
 * Working time 15 · 14 · 10 min against the leaders' 20 · 21 · 20 — the ~60% cut Michael asked for,
 * expressed as his own rep schemes rather than as a multiplier.
 */
const ANCHOR_THRESHOLD_WAVE: ReadonlyArray<{ reps: number; minutes: number; restMin: number }> = [
  { reps: 3, minutes: 5, restMin: 1 },
  { reps: 2, minutes: 7, restMin: 2 },
  { reps: 1, minutes: 10, restMin: 3 },
];

/**
 * ⛔ WAVE 2 IS THE SAME STRUCTURE RUN FASTER (doctrine §2 wave 2, built 2026-08-17).
 *
 * Wave 1's lever is the LENGTH of the continuous effort; wave 2's lever is PACE. Without this, wave
 * 2 is byte-identical to wave 1 and the block has no progression in it at all — it is the same three
 * sessions run twice. The doctrine's range is 5–10 s/mi; 8 is the middle of it, and the pick is ours.
 *
 * ⚠️ ZERO ON EVERY OTHER WAVE, INCLUDING THE ANCHOR. See `ANCHOR_THRESHOLD_WAVE`.
 */
const WAVE_2_PACE_DROP_SEC_PER_MI = 8;

function thresholdStep(wave: HardWave): { reps: number; minutes: number; restMin: number } {
  const table = wave.cycleKind === 'anchor' ? ANCHOR_THRESHOLD_WAVE : THRESHOLD_WAVE;
  const i = Math.min(Math.max(1, Math.round(wave.weekInCycle)), table.length) - 1;
  return table[i];
}

/** How much faster than threshold this week's session runs, in sec/mi. 0 on waves 1 and 3. */
function thresholdPaceDrop(wave: HardWave): number {
  return wave.cycleKind === 'leader' && wave.cycleIndex === 2 ? WAVE_2_PACE_DROP_SEC_PER_MI : 0;
}

/** Total working minutes of a threshold step — the number the 30–40 min ceiling is checked against. */
function thresholdWorkingMinutes(wave: HardWave): number {
  const st = thresholdStep(wave);
  return st.reps * st.minutes;
}

/**
 * ⛔ THE RUN'S THRESHOLD SESSION — THE SUSTAINED WORK THE BLOCK HAD NONE OF (§7).
 *
 * Both existing hard sessions are VO2 (4 × 3 hills, 4 × 4 ride). There was no comfortably-hard
 * sustained work anywhere in the block, which is the gap this fills — and it is the session a CLUB
 * day is mapped to, because a group run settles into exactly this rhythm.
 *
 * ⚠️ THE PACE IS NAMED, NOT INVENTED. The token prices off the athlete's threshold pace, which the
 * app derives as 5K pace + 20 s/mi when no measured threshold exists (`materialize-plan`'s own
 * rule) — and the copy says which of the two it used, because a pace target the athlete cannot
 * trace is the number-without-provenance this codebase keeps deleting.
 */
function thresholdRunSession(day: string, wave: HardWave, basis: 'measured' | 'derived'): PlanSession {
  const st = thresholdStep(wave);
  const anchor = wave.cycleKind === 'anchor';
  const drop = thresholdPaceDrop(wave);
  return {
    day,
    type: 'run',
    name: 'Threshold Run',
    description:
      `${st.reps} × ${st.minutes} min at threshold, ${st.restMin} min easy between. `
      + 'Comfortably hard — you could say a sentence, not hold a conversation. '
      + (anchor
        // ⛔ THE ANCHOR'S COPY SAID THE OPPOSITE OF WHAT THE ANCHOR IS FOR. It read "hold the top of
        // the range — this is the fastest this session gets in the block", which is the double-peak
        // the doctrine was rewritten to remove.
        ? 'Anchor week: the running yields so the barbell can peak. Same pace as the first block, '
          + 'less of it — this holds what you built rather than adding to it. '
        : drop > 0
          ? `Same shape as the first block, run about ${drop} s/mi faster. The length held; now the pace moves. `
          : 'The reps get longer across the block, not more numerous — the same time in zone, held for longer each time. ')
      + (basis === 'measured'
        ? 'The pace comes from your measured threshold.'
        : 'The pace is derived from your 5K — threshold sits about 20 s/mi slower.'),
    duration: st.reps * st.minutes + (st.reps - 1) * st.restMin + WARMUP_COOLDOWN_MIN,
    // ⚠️ `_f{sec}` IS THE FASTER-THAN-THRESHOLD SUFFIX, and it is OPTIONAL — the token without it is
    // the pre-2026-08-17 form exactly, so every already-materialized plan is unaffected.
    steps_preset: [
      `run_thr_${st.reps}x${st.minutes}min_r${st.restMin * 60}s${drop > 0 ? `_f${drop}` : ''}`,
    ],
    tags: ['quality', 'run', 'aerobic', 'threshold'],
  };
}

/**
 * ⛔ THE RIDE'S THRESHOLD SESSION — the same wave, one discipline over. Prices at 95–105% FTP
 * through the `bike_thr_*` token family, which the expander already understands; nothing new was
 * invented for the bike.
 */
function thresholdRideSession(day: string, wave: HardWave): PlanSession {
  const st = thresholdStep(wave);
  const anchor = wave.cycleKind === 'anchor';
  return {
    day,
    type: 'ride',
    name: 'Threshold Ride',
    description:
      `${st.reps} × ${st.minutes} min at threshold, ${st.restMin} min easy between. `
      + 'Comfortably hard — you could say a sentence, not hold a conversation. '
      + (anchor
        ? 'Anchor week: hold the top of the range. This is the hardest this session gets in the block. '
        : 'The efforts get longer across the block, not more numerous — the same time in zone, held for longer each time. ')
      + 'Spin it, do not grind it: the same cue as the interval day, and for the same reason.',
    duration: st.reps * st.minutes + (st.reps - 1) * st.restMin + WARMUP_COOLDOWN_MIN,
    steps_preset: [`bike_thr_${st.reps}x${st.minutes}min_R${st.restMin}min`],
    tags: ['quality', 'bike', 'aerobic', 'threshold'],
  };
}

/** Warm-up plus cool-down, the same allowance the VO2 sessions carry in their stated duration. */
const WARMUP_COOLDOWN_MIN = 20;

/**
 * ⛔ ONE OWNER FOR THE THRESHOLD RUN'S LENGTH — the run mileage budget subtracts it before
 * distributing easy volume, exactly as it does for the hill session (`hardRunSessionMinutes`).
 *
 * ⚠️ IT IS THE WAVE'S LONGEST WEEK (45 min: 3 × 7 + 2 × 2 rest + 20 warm-up/cool-down), not a mean.
 * The budget is computed once for the block while the session's length moves 43 · 45 · 43 across a
 * wave, so one number has to stand for three. Taking the LONGEST over-subtracts by two minutes on
 * two weeks in three; taking the shortest would hand those minutes back as easy miles every week,
 * which is the +3.5 mi defect this file has already fixed twice. Over-subtracting is the safe
 * direction and it is small.
 */
const THRESHOLD_RUN_MIN = Math.max(
  ...THRESHOLD_WAVE.map((st) => st.reps * st.minutes + (st.reps - 1) * st.restMin + WARMUP_COOLDOWN_MIN),
);

/** The minutes a hard run costs the week's mileage budget, by the role it was assigned (§7). */
function hardRunMinutesForRole(role: HardRole, terrain?: HardRunTerrain): number {
  return role === 'threshold' ? THRESHOLD_RUN_MIN : hardRunSessionMinutes(terrain);
}

/**
 * ⛔ THE RIDE'S VO2 DAY, AND IT NOW MOVES ACROSS THE WAVE (§7, 2026-08-17).
 *
 * Reps and working time are STATIC — 4 × 4 min, 16 min, Helgerud's protocol verbatim and inside the
 * 12–18 min ceiling. The lever is DENSITY: the recovery comes down 4 → 3 min across the wave, so the
 * same work is done with less rest and the session gets harder without getting longer.
 *
 * ⚠️ IT ENDS AT HELGERUD'S OWN NUMBER, NOT PAST IT. His protocol is 3 min active recovery; this
 * OPENS at 4 and arrives there, so the progression finishes at the evidence rather than overshooting
 * it. ⛔ Do not extend the wave by cutting recovery further — below 3 min this stops being the
 * protocol the 7% VO2max figure came from.
 *
 * ⚠️ ONE LEVER. The pace/wattage cue is unchanged across the wave on purpose (§7: "one lever per
 * wave, not both"); the anchor's copy asks for the top of the range, which is a CUE and not a second
 * prescribed step.
 */
function bikeQualitySession(day: string, wave: HardWave = { weekInCycle: 1, cycleKind: 'leader' }): PlanSession {
  // 4 min in week one of a wave, 3 from week two — and 3 is where it stays.
  const restMin = Math.max(1, Math.round(wave.weekInCycle)) <= 1 ? 4 : 3;
  const anchor = wave.cycleKind === 'anchor';
  return {
    day,
    type: 'ride',
    name: 'Bike Intervals',
    description:
      `4 × 4 min hard, ${restMin} min easy between. Hard means hard — you should not be able to hold a `
      + 'sentence. Spin it, do not grind it: a fast, easy spin keeps this in your lungs instead of '
      + 'your legs, which is what leaves the lifting intact.'
      + (restMin === 3
        ? ' The recovery is shorter than week one — same work, less rest.'
        : '')
      + (anchor ? ' Anchor week: hold the top of the range.' : ''),
    duration: BIKE_QUALITY_MIN,
    steps_preset: [`bike_vo2_4x4min_R${restMin}min`],
    tags: ['quality', 'bike', 'aerobic'],
  };
}

/**
 * ⛔ WHICH SESSION EACH HARD DAY IS (§7, 2026-08-17). One place, because the rule has three parts
 * and every one of them is a decision somebody could quietly re-derive differently.
 *
 *  1. **Never two VO2 days.** Two hard days is one of each — the second VO2 session buys little that
 *     the first does not, and it spends mechanical budget the lifting needs.
 *  2. **A club day is ALWAYS the threshold slot** (Michael, 2026-08-17). A group ride or run club
 *     settles into a sustained, fast rhythm at or around threshold; true VO2 work — precise
 *     intervals, strict rest — is near-impossible in a pack. ⚠️ REASONED FROM GROUP DYNAMICS AND
 *     VIADA'S SEPARATION OF THE TWO SYSTEMS: coaching-model evidence, not a trial. Labelled as such
 *     here so it is not later cited as measured.
 *  3. **One hard day → VO2**, because VO2 is the quality that decays fastest and the one ordinary
 *     easy volume cannot hold, while threshold is better preserved by general aerobic work.
 *     ⚠️ ALSO REASONED FROM STANDARD PRACTICE rather than from a page in either book — §7 flags it
 *     and it is flagged again here.
 *
 * ⛔ AND A CLUB DAY IS NEVER GIVEN CONTENT. It occupies the threshold SLOT — which is what stops the
 * app prescribing a VO2 session beside it — but the app writes no session for it (§1i). So one club
 * day and nothing else means the block carries NO prescribed intervals, and the copy has to say so
 * rather than letting the athlete discover an empty quality slot.
 */
type HardRole = 'vo2' | 'threshold' | 'club';

function assignHardRoles(
  // ⚠️ THE DAY IS NOT READ — the role depends on discipline and order only, which is why the roles
  // can be settled before the solver has placed anything (slice 8). Typed nullable to say so.
  days: ReadonlyArray<{ day: DayName | null; discipline: 'run' | 'bike'; ownership: 'prescribed' | 'club' }>,
): HardRole[] {
  /**
   * ⛔⛔ THRESHOLD IS THE DEFAULT AND VO2 IS THE UNLOCK (Michael, 2026-08-17). THIS INVERTS THE RULE
   * THAT STOOD HERE, AND THE OLD ONE WAS AN ORDERING ACCIDENT WEARING A POLICY.
   *
   * It read: *first prescribed day takes VO2, any second takes threshold* — **discipline-blind**. So
   * an athlete with ONE hard run always got Hill Repeats and the threshold run was unreachable, and
   * an athlete who listed a run before a bike handed the threshold slot to the BIKE and got hills
   * for their run. Reordering the same two hard days changed what both sessions were. The 12-week
   * threshold doctrine Michael wrote describes *"the prescribed sustained run inside a Strong Focus
   * block"* — singular, THE run — and it was firing almost nowhere.
   *
   * ⛔ THE BIOLOGY, AND IT IS WHY THIS IS A HIERARCHY AND NOT A PREFERENCE. VO2 work is a CNS
   * stressor competing with the squat and the deadlift for the same neurological recovery. Threshold
   * work sits below that line: it buys aerobic capacity and clears fatigue without spending what the
   * bar needs. **In a block where heavy barbells are the point, one hard session a week has to be
   * the threshold one.** VO2 is what an athlete unlocks by asking for a SECOND hard day in that
   * discipline — i.e. by demonstrating the capacity to carry it.
   *
   * ⛔⛔ ONE BUDGET FOR THE WHOLE WEEK, NOT ONE PER DISCIPLINE — CORRECTED 2026-08-17, SAME DAY,
   * AND THE VERSION IN BETWEEN ERASED THE ATHLETE'S SPEED WORK.
   *
   * The first version of this inversion made the rule PER DISCIPLINE: a first hard run took
   * threshold, a first hard ride took threshold. Symmetrical, and wrong — an athlete asking for one
   * hard run AND one hard ride (the standard mid-volume hybrid week) got **two sustained threshold
   * sessions and no top-end work anywhere in the block.** Two sub-lactate sessions in two disciplines
   * is biologically redundant: they buy the same adaptation twice and leave the aerobic ceiling
   * untouched. Michael, 2026-08-17: *"a hybrid athlete needs top-end speed."*
   *
   * ⛔ SO THE SPLIT IS ACROSS THE WEEK: exactly one sustained lactate session and, if the athlete
   * asked for a second hard day, exactly one top-end session. The PRIMARY discipline — the one
   * listed first — takes threshold; the secondary takes VO2. It reads as position-based and it is
   * really stimulus-based: the week gets one of each, in that order.
   */
  const roles: HardRole[] = days.map((h) => (h.ownership === 'club' ? 'club' : 'threshold'));
  // ⚠️ A CLUB DAY ALREADY *IS* THE SUSTAINED SESSION — a group run or ride settles into exactly that
  // rhythm — so it consumes the threshold slot and the app's own days go VO2.
  let thresholdTaken = roles.includes('club');
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === 'club') continue;
    if (!thresholdTaken) { roles[i] = 'threshold'; thresholdTaken = true; continue; }
    roles[i] = 'vo2';
  }
  return roles;
}

/**
 * ⛔ THE DESCENT IS DECIDED BY THE WEEK, NOT BY THE SESSION.
 *
 * Uphill is concentrically biased and that is the entire reason this protocol chose hills — it buys
 * a hard aerobic session that does not tax the legs the lifting needs. **The way back down undoes
 * that.** Downhill running is the established laboratory model for inducing exercise-induced muscle
 * damage, so a jogged descent is where the eccentric cost of this session actually lives, and it is
 * the part that arrives the next morning.
 *
 * So it is prescribed off placement:
 *   • a heavy lower day within the ECCENTRIC clearance of the hill day → **WALK.** Keep the session
 *     concentric, which is the only reason hills were chosen over flat intervals.
 *   • the hill day clear of heavy lower work by that much → **JOG.** Nothing to protect, and the
 *     descent is free aerobic time.
 *
 * ⛔ IT ASKS THE 48h CELL, NOT THE 24h ONE, AND THAT IS THE WHOLE RULE. A walked hill session is
 * quality running and takes `quality_run`'s 24h. **Jogging the descent converts it into an eccentric
 * session**, so the clearance that governs it is the one the law gives eccentric work — the long
 * run's 48h. Asking the 24h cell was the first version of this function and it returned JOG for every
 * week, including a Tuesday-squat/Wednesday-hills week sitting at exactly the floor with no buffer,
 * which is the peak of the damage curve. The session does not get to pick the cheaper clearance for
 * a load it is choosing to add.
 *
 * ⚠️ NOT KEYED ON HOW MUCH THE ATHLETE LIFTS. A light squat day and a heavy one both occupy the
 * window; the rule is about proximity, not about anyone's numbers. Both clearances are read from
 * `requiredAdjacencyHours`, so if the law moves this moves with it.
 *
 * ⛔ AT FOUR LIFTS THE ANSWER IS ALWAYS WALK, AND THAT IS AN INVARIANT — NOT A COINCIDENCE.
 * Verified by exhaustive enumeration 2026-07-27: every long-day arrangement × every legal hill day,
 * ten of ten, returns false. Two heavy days must sit ≥48h apart, which leaves exactly one day in the
 * week that clears BOTH by 48h, and the long-day anchors always occupy it. **So do not read a live
 * evaluation into this for a Get Stronger block, and do not "fix" this function when you notice it
 * never returns true there.**
 *
 * The branch is real and it is not dead: at a maintenance dose — one heavy day instead of two, which
 * is how race plans reach this protocol — it jogs on five of the same ten weeks. Pinned by
 * `strength-primary-plan.test.ts` so the invariant cannot drift silently in either direction.
 */
export function descentIsJogged(hillDay: string, lowerDays: string[]): boolean {
  const required = requiredAdjacencyHours('long_run', 'lower_body_strength');
  const idx = (d: string) => PLACEMENT_DAYS.indexOf(d as DayName);
  return lowerDays.every((d) => {
    const raw = Math.abs(idx(hillDay) - idx(d));
    return Math.min(raw, 7 - raw) * 24 >= required;
  });
}

/**
 * ⛔ THE HILL SESSION'S DURATION IS FIXED AND THE BUDGET MUST SUBTRACT IT (2026-07-28).
 *
 * 4 × 3 min work + 4 × 3 min recovery + warm-up and cool-down. It does NOT scale with the athlete's
 * weekly mileage, because it is the protected INTENSITY — Hickson's finding is that intensity is
 * what holds VO2max while frequency and duration are the expendable variables. Shrinking it to fit
 * a small mileage budget would cut the one thing the block exists to preserve.
 *
 * ⚠️ Which is exactly why the budget has to account for it. It used to be added AFTER the miles were
 * distributed, so every plan ran the athlete's typed mileage PLUS 3.5 miles — measured at +3.5 on a
 * 13-mile ask, a 20-mile ask and a 30-mile ask alike.
 */
export const HILL_SESSION_MIN = 35;

function hillSession(day: string, lowerDays: string[] = []): PlanSession {
  // §5, run-only VO2 defence: 4 x 3min hard / 3min easy at 5-8%. Working time 12 min; ~35-40 min
  // with warm-up and cool-down. The token carries the grade because the cost row is not "run VO2" —
  // it is "run VO2 AT grade" (D-325 §1), and a token that cannot carry the constraint cannot be priced.
  //
  // ⚠️ 12 min, not the >=15 min "high volume" threshold (which would be 5 x 3). Deliberate: this is a
  // MAINTENANCE dose, not a gains dose — one hard session a week HOLDS the engine and does not build
  // it (parent doctrine §5.0). Structure from the evidence, volume from the maintenance context.
  //
  // ⛔ THE THRESHOLD IS WEN ET AL. 2019 AND IT WAS UNNAMED HERE AND IN THE DOCTRINE UNTIL 2026-08-06.
  // Wen D, Utesch T, Wu J, Robertson S, Liu J, Hu G, Chen H, "Effects of different protocols of high
  // intensity interval training for VO2max improvements in adults: A meta-analysis of randomised
  // controlled trials", J Sci Med Sport 2019;22(8):941-947, doi:10.1016/j.jsams.2019.01.013,
  // PMID 30733142. Fifty-three studies.
  //
  // ⚠️ IT IS THREE CONDITIONS AND WE MEET TWO. Wen recommends long-interval (>=2 min) AND high-volume
  // (>=15 min) AND 4-12 weeks. The 3-minute rep clears the interval criterion and the block clears
  // the duration one; the 12 minutes of work sits under the volume one. So this is a shortfall on a
  // single named criterion, not a session built against the evidence.
  const jogged = descentIsJogged(day, lowerDays);
  // ⛔ THE DESCENT ENDS ON THE LAP BUTTON, NOT ON A CLOCK (Michael, 2026-08-06).
  //
  // It was `_r180s_` — a 3:00 countdown. **The descent is not a duration, it is a distance**: it is
  // however long it takes to get back to the bottom of the hill you actually have. A timer answers a
  // question it cannot know, and it is wrong in one direction every rep — at 3:00 the watch buzzes
  // and starts rep 2 whether you are at the bottom or still walking down.
  //
  // ⚠️ THE CLIMB STAYS TIMED, AND THE TWO ARE DOING OPPOSITE JOBS ON PURPOSE. 3 minutes is the DOSE
  // (D-389), so the work rep is a fixed countdown wherever it leaves you on the hill. Only the
  // recovery is open. ⛔ Do not "make them consistent" by opening both.
  //
  // ⚠️ Garmin ships this as a first-class option — "Open Repeats" beside "Structured Repeats" — and
  // the documented friction with canned hill workouts is exactly this: preset distances and times
  // that do not match the athlete's hill.
  // ⚠️ THE SHORT-HILL FALLBACK IS NOT HERE, DELIBERATELY. `4 × 3 min` needs a climb you can run
  // for three minutes and this session assumes one. The doctrine names `10-12 × 40 s` for athletes
  // without one — ⛔ DO NOT WIRE THAT AND CALL IT DONE. It was built on 2026-08-06 and reverted the
  // same day: at EQUAL work time the long form gives 327.9 s above 90% VO2max against the short
  // form's 201.3 s, 40 s sits in the "moderate" band the meta puts on the inferior side, and the
  // "short float keeps VO2 elevated" rationale is struck through as retired in the doctrine itself.
  // **The second option is an unsolved protocol question, not a missing branch.** See the handoff
  // banner at the top of `docs/ENGINE-STATE.md`.
  const token = `run_hills_4x180s_rlap_g5_8_d${jogged ? 'jog' : 'walk'}`;
  return {
    day,
    type: 'run',
    name: 'Hill Repeats',
    // ⛔ NO PACE, ANYWHERE IN THIS COPY. The pace-effort relationship changes with gradient, so a
    // pace target here is false precision (§2.2). Effort and grade only.
    description:
      `4 × 3 min hard uphill on a 5-8% grade, ${jogged ? 'easy jog' : 'walk'} back down. `
      + 'The descent has no timer — press the lap button at the bottom and the next rep starts. '
      + 'Hard means hard — you should not be able to hold a sentence. No pace target: on a hill the '
      + 'number would be wrong. The climb is what keeps this cheap on your legs, so the lifting '
      + 'still gets what it needs.'
      + (jogged
        ? ''
        : ' Walk the descents — running down is the part that would reach your next heavy day.'),
    duration: HILL_SESSION_MIN,
    steps_preset: [token],
    tags: ['quality', 'hills', 'aerobic'],
  };
}

/**
 * ⛔ THE SHORT-HILL SESSION — for a climb you cannot run for three minutes.
 *
 * `10 × 1 min hard uphill @ 4-6%, 1 min back down.` 10 min of work.
 *
 * ⛔ SIXTY SECONDS, AND NOT FORTY. The doctrine names `10-12 × 40 s` for the athlete without a long
 * climb; that was built on 2026-08-06 and reverted the same day, and it must not come back. At EQUAL
 * work time, work-matched, 1:1 recovery, 12 highly trained runners: `4 × 3 min` gave **327.9 s**
 * above 90% VO2max against `24 × 30 s` at **201.3 s**, with no difference in how hard either felt
 * (Fleckenstein, Braunstein & Walter 2025, Front Sports Act Living 6:1507957, PMID 39835194). The
 * short session reads harder on heart rate and delivers less of the stimulus.
 *
 * ⚠️ AND SIXTY IS STILL NOT THE GOOD ONE — BE HONEST ABOUT WHICH TIER THIS IS. The time-at-VO2max
 * meta (BMC Sports Sci Med Rehabil 2026, doi:10.1186/s13102-026-01766-x) ranks long (≥2 min) above
 * MODERATE (>30 s to <2 min) above short (≤30 s), and 60 s sits in that middle band — the same band
 * as the 40 s form, just at the top of it rather than the bottom. So this is not a peer of the
 * 3-minute session: it is what the athlete with a 60-second hill can actually run, and the copy says
 * so rather than selling it as equivalent.
 *
 * ⛔ THE DESCENT RULE IS THE SAME ONE, FOR THE SAME REASON. Downhill running is where the eccentric
 * cost lives and it is the part that arrives the next morning, so it is prescribed off placement by
 * `descentIsJogged` — not off the length of the rep. A 1-minute descent jogged next to a heavy squat
 * day is the same damage as a 3-minute one.
 *
 * ⚠️ Duration is fixed and the budget subtracts it, exactly as `HILL_SESSION_MIN` does. 10 min warm-up
 * + 10 × 60 s + 9 × 60 s + 8 min cool-down = 37 min.
 */
export const SHORT_HILL_SESSION_MIN = 37;

function shortHillSession(day: string, lowerDays: string[] = []): PlanSession {
  const jogged = descentIsJogged(day, lowerDays);
  const token = `run_hills_10x60s_r60s_g4_6_d${jogged ? 'jog' : 'walk'}`;
  return {
    day,
    type: 'run',
    name: 'Short Hill Repeats',
    // ⛔ NO PACE, ANYWHERE IN THIS COPY — same reason as the 3-minute session (§2.2).
    description:
      `10 × 1 min hard uphill on a 4-6% grade, 1 min ${jogged ? 'easy jog' : 'walk'} back down. `
      + 'Hard means hard — you should not be able to hold a sentence. No pace target: on a hill the '
      + 'number would be wrong. Shorter reps buy less time at the top end than the 3-minute version, '
      + 'so this is the session for the hill you have rather than the better one. The climb is still '
      + 'what keeps it cheap on your legs.'
      + (jogged
        ? ''
        : ' Walk the descents — running down is the part that would reach your next heavy day.'),
    duration: SHORT_HILL_SESSION_MIN,
    steps_preset: [token],
    tags: ['quality', 'hills', 'aerobic'],
  };
}

/**
 * ⛔ THE TREADMILL SESSION — a PEER of the outdoor hill, not a lesser option.
 *
 * `4 × 3 min hard @ 5-8% incline, 3 min easy between.` 12 min of work — the same dose, the same
 * structure, the same grade band as `hillSession`.
 *
 * ⛔ WHY THIS RANKS WITH THE HILL AND NOT WITH FLAT: the belt IS the grade. The entire reason this
 * protocol chose hills is that uphill running is concentrically biased and loses the impact
 * transient (Gottschall & Kram), which is what buys a hard aerobic session the legs can still lift
 * on. A treadmill at 6% delivers that literally rather than approximately, and it delivers the
 * 3-minute rep the evidence actually supports. An athlete with a treadmill has no reason to take
 * the short-hill or flat option.
 *
 * ⚠️ NO DESCENT, SO NO `descentIsJogged` CALL — AND THAT IS THE POINT, NOT AN OMISSION. There is
 * nothing to run down: the recovery is the belt dropped to easy. So the eccentric load this session
 * would otherwise owe its next heavy day is simply absent, and the walk/jog rule has nothing to
 * decide. The token still carries `_djog` because the recovery IS an easy jog and should be paced
 * like one.
 *
 * ⚠️ 10 min warm-up + 4 × 180 s + 3 × 180 s + 8 min cool-down = 39 min. Fixed; the budget subtracts it.
 */
export const TREADMILL_SESSION_MIN = 39;

function treadmillSession(day: string): PlanSession {
  // ⚠️ `_tm` IS A LABEL SWITCH ONLY — the structure is identical to the outdoor fixed-recovery hill.
  // Without it the watch reads "Hill · 5-8% grade" and "Jog down" on a machine with no hill and no
  // down, which is the same species of wrong as a pace target on a gradient: a step label that
  // describes a session the athlete is not doing.
  const token = 'run_hills_4x180s_r180s_g5_8_djog_tm';
  return {
    day,
    type: 'run',
    name: 'Treadmill Intervals',
    // ⛔ NO PACE. The belt speed that means "hard" at 6% is not the one that means hard on the flat,
    // so a number here is the same false precision the outdoor session refuses (§2.2). Effort and
    // incline only — the athlete sets the belt to what "hard" actually is for them today.
    description:
      '4 × 3 min hard at 5-8% incline, 3 min easy between with the incline down. '
      + 'Hard means hard — you should not be able to hold a sentence. No belt speed given: at 6% the '
      + 'number that means hard is not the one it would be on the flat. '
      + 'The incline is what keeps this cheap on your legs, so the lifting still gets what it needs — '
      + 'and it is the same session as the outdoor hill, not a substitute for it.',
    duration: TREADMILL_SESSION_MIN,
    steps_preset: [token],
    tags: ['quality', 'hills', 'aerobic'],
  };
}

/**
 * ⛔ THE FLAT SESSION — THE LAST RESORT, AND THE ONLY ONE THAT SENDS A BILL TO THE BAR.
 *
 * `4 × 3 min hard / 3 min easy on flat ground.` 12 min of work — the same dose and the same
 * structure as the hill, on the one surface that does not discount it.
 *
 * ⛔ THIS IS THE SESSION §2.1 PROHIBITS, AND IT IS HERE ON PURPOSE. §2.1 bans "long flat intervals
 * at VO2 intensity" during a strength block — the most expensive way to buy the stimulus, highest
 * total ground contacts at highest force. §2.0 offers flat as a legitimate choice with a stated
 * cost. **§2.0 governs** (Michael, 2026-08-06): §2.1's ban assumed a hill was available, and for an
 * athlete with no climb, no treadmill and no bike the alternative to this session is **no hard
 * aerobic session at all**. A blanket ban that leaves an athlete with nothing is not the safer
 * reading. ⚠️ §2.1 carries a back-annotation pointing here; do not "fix" this against it.
 *
 * ⛔ AND THE COST IS PAID SOMEWHERE, SO THE COPY NAMES IT. Uphill removes the impact transient
 * (Gottschall & Kram) and that is the entire reason this protocol chose hills; flat gives it back.
 * §4's yield order is what absorbs it — accessory volume first, then easy run volume, then the
 * training max holds rather than climbs. **The athlete on this option reaches item 3 soonest**, and
 * the intake card tells them so before they pick it.
 *
 * ⚠️ PACE IS ALLOWED HERE AND ONLY HERE. §2.2 forbids a pace target on GRADED work because the
 * pace-effort relationship changes with gradient and the app's velocity anchor goes invalid. Flat is
 * not graded, so the anchor holds and the token's existing 5K − 12 s/mi is a real number rather than
 * a measured-looking one. ⛔ Do not "make it consistent" with the hill sessions by stripping it.
 *
 * ⚠️ BRACKETED BY SEPARATE PRESETS, NOT BY THE EXPANDER. `run_vo2_*` builds no warm-up or cool-down
 * of its own — its callers pass them alongside, and have since `session-factory.ts:443`. So this
 * session names all three. 10 + 4 × 3 + 3 × 3 + 10 = 41 min.
 *
 * ⛔ THE COPY SAYS "WHERE THE WEEK ALLOWS", AND THAT HEDGE IS THE HONEST HALF OF A PREFERENCE.
 *
 * This session PREFERS 48h from heavy legs rather than `quality_run`'s 24h (Michael, 2026-08-06 —
 * see the `preferredClearance` stamp at the solver call). Preferred, never required: measured across
 * all 24 legal week shapes, it is **taken in 8 and quietly declined in 16, and makes none worse.**
 *
 * ⚠️ SO THE LINE PROMISES ONLY WHAT IT DELIVERS. It does not say the heavy days ARE two clear days
 * away — a third of weeks can give that and the rest cannot — and it no longer says "the plan says
 * so when it cannot", because a declined preference breaks nothing and reports nothing. Promising
 * the clearance outright would be the defect `NonRaceBuilder.tsx:304` names on this very screen.
 *
 * ⛔ THE HARD VERSION WAS BUILT FIRST AND IT WAS WORSE — DO NOT GO BACK TO IT. Forcing 48h put a
 * reported breach in 8 of 12 week shapes, and **11 of the 16 breaches were against the LONG RUN**:
 * the solver bought this session its two days by moving a squat next to the long run, which is the
 * same eccentric leg damage one session over, and then announced a compromise it had itself created.
 */
export const FLAT_SESSION_MIN = 41;

function flatSession(day: string): PlanSession {
  return {
    day,
    type: 'run',
    name: 'Flat Intervals',
    // ⛔ FACT, THEN THE CONSEQUENCE, NO IMPERATIVE — and the consequence here is the honest one:
    // this session is paid for out of the lifting. The nudge is a statement of what would serve
    // them better, not an instruction to go buy something.
    description:
      '4 × 3 min hard, 3 min easy between, on flat ground. '
      + 'Hard means hard — you should not be able to hold a sentence. '
      + 'This is the one version of this session that costs your legs full price: running flat keeps '
      + 'the impact a climb takes away, and the lifting is what pays for it. Your heavy leg days are '
      + 'held two days clear of it where the week allows. '
      + 'A treadmill or a cheap indoor trainer would buy you the same session for less.',
    duration: FLAT_SESSION_MIN,
    // ⚠️ THREE PRESETS, NOT ONE — `run_vo2_*` brackets nothing itself. `_r180s_` is the explicit
    // float: the token defaults to 90 s, which would make this a materially harder session than the
    // one costed above.
    steps_preset: ['warmup_run_10min_easy', 'run_vo2_4x3min_r180s_z5', 'cooldown_run_10min_easy'],
    tags: ['quality', 'aerobic'],
  };
}

/**
 * ⛔ ONE OWNER FOR "WHICH HARD RUN". Every caller asks here, never for a session by name.
 *
 * The terrain is the athlete's pick and it arrives on `hardDay`. Absent → `hill_3min`, which is what
 * every block built before 2026-08-06 built — so an old goal with no terrain stamped on it produces
 * exactly the week it produced yesterday.
 *
 * ⚠️ THE DURATION MUST TRACK THE SESSION, AND THAT IS WHY `hardRunSessionMinutes` SITS NEXT TO THIS.
 * The mileage budget subtracts the hard session BEFORE distributing easy volume (2026-07-28 — the
 * +3.5 mi bug). Two owners for one fact is how that bug returns: a 39-minute treadmill session
 * subtracted as 35 hands the athlete the difference back as easy miles, silently, every week.
 */
export function hardRunSessionMinutes(terrain?: HardRunTerrain): number {
  switch (terrain) {
    case 'hill_short': return SHORT_HILL_SESSION_MIN;
    case 'treadmill': return TREADMILL_SESSION_MIN;
    case 'flat': return FLAT_SESSION_MIN;
    case 'hill_3min':
    default: return HILL_SESSION_MIN;
  }
}

/**
 * ⛔ THE RUN'S VO2 DAY, AND IT MOVES ACROSS THE WAVE TOO (§7, 2026-08-17).
 *
 * ⚠️ THE LEVER IS PACE, NOT DENSITY, AND THAT IS FORCED RATHER THAN CHOSEN. The recovery on a hill
 * session is the DESCENT — a distance, not a duration, ending on the lap button (see
 * `descentIsJogged` and the `_rlap_` token). There is no recovery clock to shorten, so density is
 * unavailable to this session and pace is the only lever left. §7's "one lever per wave" is
 * satisfied by construction here rather than by a decision.
 *
 * ⛔ SO THE PROGRESSION LIVES IN THE PRESCRIPTION, NOT IN THE TOKEN. The reps, the grade and the
 * descent are identical every week — the token is unchanged and the expander needs nothing new —
 * and what escalates is the effort the athlete is asked for. ⚠️ THIS IS THE HONEST LIMIT OF IT: a
 * hill session cannot state a pace target, because the pace on a 6% grade is not the pace on a 4%
 * one. The cue is comparative ("faster than the last one") rather than absolute, which is what this
 * session can actually support. The FLAT and TREADMILL variants could carry a number; they do not
 * yet, and that is named rather than hidden.
 */
function hardRunSession(
  day: string,
  lowerDays: string[],
  terrain?: HardRunTerrain,
  wave: HardWave = { weekInCycle: 1, cycleKind: 'leader' },
): PlanSession {
  const base = (() => {
    switch (terrain) {
      case 'hill_short': return shortHillSession(day, lowerDays);
      case 'treadmill': return treadmillSession(day);
      case 'flat': return flatSession(day);
      case 'hill_3min':
      default: return hillSession(day, lowerDays);
    }
  })();
  const step = Math.min(Math.max(1, Math.round(wave.weekInCycle)), 3);
  const cue = wave.cycleKind === 'anchor'
    ? ' Anchor week: this is the fastest this session gets in the block — hold the top of what you '
      + 'can repeat for every rep.'
    : step === 1
      ? ' First week of the wave: settle on an effort you can hold for all four reps, and remember it.'
      : ' Same reps, same hill: go a little faster than last week, and hold it for every rep.';
  return { ...base, description: `${base.description}${cue}` };
}

/**
 * ⛔ A CLUB SESSION IS BOOKED, NOT COACHED (§1i, 2026-08-17) — the same rule as swim, one discipline
 * over, and for the same reason.
 *
 * The athlete already attends this one: a Tuesday club run, a Saturday group ride. They turn up and
 * do whatever the group does. The app cannot prescribe `4 × 3 min uphill, walk down` into it, cannot
 * hold anyone to the rest intervals, and cannot progress it week to week — so writing the template
 * anyway would be a prescription for work nobody is going to do. That is the "score that lies" in
 * prescription form, and D-423's rule ("the athlete's pick is what appears") points the same way.
 *
 * ⚠️ IT IS STILL A HARD DAY EVERYWHERE ELSE. It takes a pin, the solver keeps heavy legs clear of
 * it, it comes out of its discipline's volume, and it counts toward the competing-stress band that
 * sizes the assistance. The ONLY thing it does not get is invented content.
 *
 * ⚠️ AND IT CARRIES NO `steps_preset`, DELIBERATELY. A token is a prescription the analysis path
 * grades against; handing one to a session the app did not design would produce an adherence verdict
 * on a workout nobody prescribed.
 */
function clubEnduranceSession(sport: 'run' | 'bike', day: string, mins: number): PlanSession {
  const word = sport === 'bike' ? 'ride' : 'run';
  return {
    day,
    type: sport === 'bike' ? 'ride' : 'run',
    name: sport === 'bike' ? 'Club Ride' : 'Club Run',
    description:
      `Your own ${word} — whatever the group does. The week is built around it: it is held as a hard `
      + `day, so the lifting keeps its distance from it and the easy ${word}s work around it. `
      + `We book the time and do not prescribe the session.`,
    duration: mins,
    // ⚠️ TAGGED `quality` BECAUSE THAT IS WHAT IT COSTS. Everything downstream that reasons about
    // recovery reads the tag, not the name, and a club run that reads as easy would let a heavy day
    // land beside it.
    tags: ['quality', sport === 'bike' ? 'bike' : 'run', 'aerobic', 'club'],
  };
}

/**
 * ⛔ SWIM IS BOOKED, NOT COACHED — and the distinction is the whole feature.
 *
 * Michael, 2026-07-25: *"we keep swim, let the user add — we give a courtesy two hour-long swims we
 * slot in. They are a courtesy. Keep it light."* D-323 item 5 settles the same thing: days and a
 * rough length in, slots booked, **no yardage, no sets, no drills, no week-to-week adjustment.**
 *
 * The app does not learn a swim pace, does not grade a swim, and does not adjust one. So it holds
 * the time in the athlete's week and says so plainly. Anything more would be the app claiming to
 * train something it cannot see.
 *
 * They land on FREE days only — never on a lifting day and never on a day already carrying an
 * endurance session. A courtesy that displaces real work is not a courtesy.
 *
 * ⚠️ Do NOT add a `steps_preset` here. A token would route this through the workload matcher and the
 * session would start being graded against a prescription that was never made.
 */
const SWIM_COURTESY_MIN = 60;

function swimSessions(days: string[], count: number): PlanSession[] {
  return days.slice(0, Math.max(0, count)).map((day) => ({
    day,
    type: 'swim',
    name: 'Easy Swim',
    description:
      `~${SWIM_COURTESY_MIN} min easy. Booked, not coached — no set, no target. ` +
      `This is upkeep alongside the lifting; the plan holds the time and leaves the swim to you.`,
    duration: SWIM_COURTESY_MIN,
    tags: ['easy', 'maintenance', 'aerobic', 'swim', 'courtesy'],
  }));
}

/**
 * Compose the Strength Focus block: 5/3/1 as the spine + maintenance endurance underneath.
 * Returns the standard plan structure — the caller persists it and runs activate-plan.
 */
export function composeStrengthPrimaryPlan(args: StrengthPrimaryArgs): {
  name: string;
  description: string;
  duration_weeks: number;
  sessions_by_week: Record<string, PlanSession[]>;
  phaseStructure: { phases: ArcPhase[]; recovery_weeks: number[] };
  /** ⛔ STORED, never re-derived. The working number ratchets on its own +5/+10 schedule; if it were
   *  recomputed from `performance_numbers`, the AMRAP write-back would drag it and the controlled
   *  progression would be gone. The caller writes this to `plans.config.training_max`. */
  training_max: OneRepMaxes;
  volume_notes: string | null;
  volume_state: 'above' | 'below' | 'in_band' | null;
  /** Every clearance the week could not honour, in `place-week`'s own words. Absent = nothing broke.
   *  ⛔ Surfacing only — the week is still built (D-325 §7: state the cost, never refuse). */
  /**
   * ⛔ TAGGED BY KIND. `breach` = a rule was broken and the week is compromised. `cost` = no rule
   * was broken; the shape the athlete chose cost something and they should be told. One channel,
   * two meanings, and the reader must not have to guess which — see `SolverNote`.
   */
  /** ⚠️ `ceiling` is a THIRD kind, not a flavour of `cost` — `strengthFocusDescription` drops it
   *  because the plan's own ceiling paragraph already carries that fact. It used to identify the
   *  entry by regex on the prose, which broke the moment the prose was tightened. */
  placement_compromises?: Array<{ kind: 'breach' | 'cost' | 'ceiling'; text: string }>;
  /**
   * ⛔ THE DAYS THE SOLVER ACTUALLY USED, lowercase, so the goal row can record what happened
   * instead of what someone guessed. `non-race-goal-seeds.ts:113` seeds
   * `preferred_days.strength = ['monday','tuesday','thursday','friday']` with the comment "match the
   * engine grid so the intake header doesn't contradict the plan" — and that WAS the engine grid,
   * back when `MAIN_LIFTS` was hardcoded to Mon/Tue/Thu/Fri. The solver places dynamically now, so
   * the seed's stated purpose is exactly what it fails at: it contradicts the plan it describes.
   */
  strength_days?: string[];
  /**
   * ⛔⛔ RE-SCOPED 2026-08-12 (slice a) — THE FIELD LIVES, ITS ONE PRODUCER DIED. D-421 built this to
   * carry a CEILING pin; the ceiling has been removed (see the superseded block at the top of
   * `loading/wendler-531.ts`), so `reason: 'ceiling'` is now unreachable and nothing writes this.
   *
   * ⚠️ IT IS DELIBERATELY NOT DELETED. The `plans.config` plumbing (`generate-strength-plan`) is the
   * wire slice b reads; slice b repopulates the field from the RESET/BUMP events instead, widening
   * `reason` at that point. Everything below is the original rationale and still describes WHY a
   * calibration signal exists — only its trigger changed.
   *
   * ⛔ THE CEILING, AS A SIGNAL RATHER THAN A SHRUG (slice 4a, 2026-08-12).
   *
   * When a lift's training max reaches 90% of the max ON FILE, the block stops advancing it — and
   * with a 5 lb plate grid a light lift can pin in cycle 2 and print byte-identical weeks for the
   * rest of the block. That fact was computed here, spoken once in prose inside `description`, and
   * then **thrown away**: nothing structured left this function, and `plans.config` never stored it.
   * So the one surface that could act on it — a retest/raise offer — had nothing to read.
   *
   * ⚠️ THIS IS NOT A WARNING, IT IS AN INPUT. A pinned lift means the number the block is measuring
   * against has stopped being true, which is a CALIBRATION question ("is 100 lb still your press
   * max?"), not a training one. The prose note stays for today's renderer; this is the machine-
   * readable half that the calibration offer consumes.
   *
   * Absent = no lift pinned. Never empty-by-silence: an absent array means nothing pinned, not that
   * nobody looked.
   */
  strength_calibration?: Array<{
    lift: string;
    reason: 'ceiling';
    /** The cycle the lift pins in — from here to the end of the block its weights do not move. */
    at_cycle: number;
    total_cycles: number;
    /** The max on file the ceiling was computed against — the number a retest would replace. */
    one_rm: number;
  }>;
} {
  const { enduranceSport, oneRepMaxes } = args;
  const weeks = blockWeeks(args.durationWeeks);
  const phaseStructure = buildBlockPhases(weeks, args.blockShape);

  // The working number, per lift, set once here (SPEC §1).
  //
  // ⛔ A SECOND BLOCK STARTS WHERE THE FIRST ONE ENDED. Before this, every block recomputed 85% of
  // `performance_numbers` — a number typed at signup that nothing ever updates — so an athlete who
  // finished twelve weeks and built a new block began again at exactly the weights of week one.
  // Twelve weeks of progression discarded at the boundary, silently.
  //
  // ⚠️ THE VALUE WAS ALREADY BEING SAVED. `generate-strength-plan` writes `plan.training_max` to
  // `plans.config.training_max` with a comment explaining why it is stored rather than re-derived —
  // and nothing on the other end read it. A wire written at one end and never connected.
  //
  // Both Wendler and the wider practice carry the number: cycles are continuous and you keep adding
  // until you can no longer hit the prescribed reps (5/3/1 2nd ed. p30). The boundary is a place to
  // CHECK progress, not to throw it away.
  //
  // ⛔ ABSENT MEANS FIRST BLOCK, and it must keep deriving from the 1RM (§0h). A missing prior is not
  // evidence of anything — it is a new athlete.
  const training_max: OneRepMaxes = {
    bench: args.priorTrainingMax?.bench || workingNumberFrom1RM(oneRepMaxes.bench),
    squat: args.priorTrainingMax?.squat || workingNumberFrom1RM(oneRepMaxes.squat),
    deadlift: args.priorTrainingMax?.deadlift || workingNumberFrom1RM(oneRepMaxes.deadlift),
    overheadPress: args.priorTrainingMax?.overheadPress || workingNumberFrom1RM(oneRepMaxes.overheadPress),
  };

  // ── PLACEMENT: the athlete's days are fixed, the bar moves around them ───────────────────────
  //
  // ⛔ THIS REPLACES THE HARDCODED Mon/Tue/Thu/Fri GRID. The grid was the last placement authority
  // that read none of the law, and it is why `longRunDay` was CONSTRAINED to Sat/Sun — the day was
  // constrained because the LIFTING was fixed, which is the wrong way round. An athlete who picked
  // Wednesday silently got Saturday, with no compromise line and no explanation.
  //
  // The contract (Michael, 2026-07-26): *"he gets what he ordered as long as what he orders fits
  // into our lift rules."* So: the pins stand, the bar fills the gaps, and every clearance that
  // could not be honoured is NAMED. Never a silent move, never a refusal.
  //
  // ⚠️ WHY THESE PINS AND NOT MORE. A club night is not the athlete's day — other people own it —
  // and the intake's hard-day copy says exactly that ("a club night, track repeats, a hard tempo —
  // yours or someone else's"). So the hard day IS the club day; there is no separate input to
  // collect. Long run and long ride are the other immovables.
  //
  // ⚠️ `canSplitDay` is deliberately NOT set. Undefined is not "yes" (see MIN_STACK_GAP_H): a pin
  // may only carry a lift when the athlete has SAID they can split that day, and the intake does
  // not ask yet. Until it does, no day is treated as splittable — the conservative direction, and
  // the one Robineau's 0h arm makes expensive to get wrong.
  const pins: EndurancePin[] = [];
  const asDay = (v: unknown): DayName | null => {
    const s = String(v ?? '').trim().toLowerCase();
    return (PLACEMENT_DAYS as readonly string[]).find((d) => d.toLowerCase() === s) as DayName ?? null;
  };
  // ⛔ HOURS FROM EITHER SOURCE COUNT AS "HAS A BIKE" (2026-07-29). A bike-primary athlete whose
  // hours arrived as `targetWeeklyRideHours` with no `bike{}` object failed this test, so the pass
  // that turns hours into rides never ran and the fallback emitter handed them 2×45min — 1.5h
  // against a 6h ask. The gate asked whether an OBJECT was present; the question is whether the
  // athlete gave us hours.
  const hasBike = !!args.bike || Number(args.targetWeeklyRideHours) > 0;
  /**
   * ═══ THE FLOW SETS THE WEEK. THIS FILE DOES NOT SECOND-GUESS IT (2026-08-08) ═══
   *
   * ⛔ THE INFERENCE MODEL THAT STOOD HERE IS GONE, AND IT WAS MINE. It converted each sport's volume
   * to minutes, named the larger one the leader, and capped the other at ~2 sessions. It fixed the
   * real bug — a bike-led block authoring zero runs — and then kept going: it started DECIDING, on
   * an athlete who had already answered every one of those questions on screen.
   *
   * Michael, 2026-08-08: *"the flow sets everything, not inference."* The wizard asks for the run
   * count, the ride count, the volumes, the long days and the one hard day. Every one of those is an
   * explicit pick, and a builder that re-derives a pick it was handed is a second answer to a settled
   * question — the divergence this codebase keeps paying for.
   *
   * ⛔ SO: NO PRIORITY, NO CAP, NO GATE.
   *   • run count (2/3/4) and ride count (1/2/3) are built EXACTLY as picked;
   *   • typed miles and hours are built EXACTLY as typed;
   *   • a selected sport ALWAYS reaches sessions;
   *   • exactly ONE hard endurance session — the day and discipline they chose — and every other
   *     run and ride is easy.
   *
   * ⚠️ TOO MUCH VOLUME IS A UI WARNING, NEVER A BUILDER LIMIT. The intake already reasons out loud
   * about the maintenance band (`maintenance-volume-band.ts`: *"a REFERENCE the app reasons out loud
   * about, not a fence"*). If an athlete asks for more than the block can comfortably hold, the
   * screen says so and the number still stands. ⛔ Do not reintroduce a cap here; that is D-222's
   * ceiling wearing a different name, and it has now been built and retired twice.
   *
   * ⚠️ WHAT SURVIVED FROM THE INFERENCE PASS is the part that was never about priority: `runSelected`
   * / `bikeSelected`. A sport the athlete chose must never silently vanish, and knowing which sports
   * were chosen is what makes that checkable. Selection needs a POSITIVE signal — `enduranceFrequency`
   * arrives from `create-goal` with a default of 2 even for a bike-only athlete, so reading it as
   * selection invents a sport nobody asked for.
   */
  const askedRunMiles = Number(args.targetWeeklyMiles) > 0 ? Number(args.targetWeeklyMiles) : 0;
  /**
   * ⛔ THE WEEK'S HARD DAYS, RESOLVED ONCE (§1i, 2026-08-17). Every site below reads THIS, not
   * `args.hardDays` — the raw input is athlete-supplied and the guarantees the rest of the file
   * leans on (a real day, a known discipline, at most two, one per calendar day) are established
   * here and nowhere else. Before §1i there was one optional object and each site re-derived from
   * it; that is exactly how `hardDayIsRun` and `hardDayIsRide` came to be mutually exclusive.
   *
   * ⚠️ ORDER IS THE ATHLETE'S. The first slot they filled is the first here, and `dedupe by day`
   * keeps the earlier one — a later entry on the same calendar day is a mistake, not a promotion.
   */
  type HardDayReq = {
    day: DayName | null;
    discipline: 'run' | 'bike';
    terrain?: HardRunTerrain;
    ownership: 'prescribed' | 'club';
  };
  /**
   * ⛔ THE DAY IS OPTIONAL NOW, AND THAT IS THE WHOLE OF SLICE 8 (§1i placement model, 2026-08-17).
   *
   * **Ours to write → ours to place.** A prescribed hard day with NO day is not a half-finished
   * answer, it is the normal case: the engine proposes where it goes and the athlete moves it after.
   * A day was previously REQUIRED here (`if (!day) continue`), so an unplaced hard session was
   * silently dropped — which is what forced the screen to assemble one from parts and produce the
   * "has a discipline but no day" error state this slice deletes.
   *
   * ⚠️ A CLUB DAY STILL NEEDS ITS DAY, and that is not an inconsistency — only the athlete knows
   * when the club meets. It is dropped without one, because a club session the app placed would be
   * the app inventing an appointment.
   */
  const requestedHardDays: HardDayReq[] = [];
  for (const raw of Array.isArray(args.hardDays) ? args.hardDays : []) {
    if (requestedHardDays.length >= MAX_HARD_DAYS) break;
    if (raw?.discipline !== 'run' && raw?.discipline !== 'bike') continue;
    /**
     * ⛔ ABSENT IS NOT THE SAME AS UNPARSEABLE, AND CONFLATING THEM WOULD BE A SILENT MOVE.
     *
     * `day` absent (null / undefined / '') is the §1i placement model asking the engine to propose
     * one — the normal case. `day` PRESENT but not a weekday is a malformed entry: a client bug or a
     * hostile caller. Treating that as "you choose" would turn an athlete's mistyped Tuesday into a
     * Thursday session with nothing said, which is the absorption failure this file has fixed twice.
     * So a bad day DROPS the entry, exactly as it did before this slice.
     */
    const dayGiven = raw?.day != null && String(raw.day).trim() !== '';
    const day = asDay(raw?.day);
    if (dayGiven && !day) continue;
    // ⚠️ ABSENT → PRESCRIBED, which is what every block before §1i was. An unrecognised value is
    // treated as absent for the same reason the terrain allowlist is: a value the engine cannot
    // act on must degrade to the shipped behaviour, not to no session at all.
    const ownership: 'prescribed' | 'club' = raw.ownership === 'club' ? 'club' : 'prescribed';
    if (!day && ownership === 'club') continue;
    if (day && requestedHardDays.some((h) => h.day === day)) continue;
    requestedHardDays.push({
      day,
      discipline: raw.discipline,
      ...(raw.terrain ? { terrain: raw.terrain } : {}),
      ownership,
    });
  }
  /**
   * ⛔ NO NUMBER, NO HARD DAY (§7, Michael 2026-08-16) — AND THE REASON IS NOT BUREAUCRACY.
   * A session that cannot state a pace or a wattage cannot get faster on purpose, so there is no
   * progression to prescribe: the athlete would get the same unpriced session twelve times, which is
   * the maintenance-dose-repeated defect §7 exists to end.
   *
   * ⛔ IT GATES THE HARD DAY, NOT THE PLAN. The hard day is OPTIONAL and the block is complete
   * without it, so a missing FTP must not refuse a plan the athlete can legitimately run. A gated
   * day is DROPPED and the week is built exactly as it is for someone who declined one — plus a
   * compromise line, because a day the athlete pinned vanishing in silence is the absorption bug
   * this file has fixed twice.
   *
   * ⚠️ THE RUN TESTS THE 5K, NOT A THRESHOLD PACE. There is no independent threshold pace on the
   * athlete; the app derives it as 5K + 20 s/mi. A gate on a derived number would refuse athletes
   * who have everything the session actually needs.
   * ⚠️ A CLUB DAY IS NOT GATED. The app prescribes nothing for it, so there is no number to state —
   * gating it would refuse to hold a day the athlete is going to train on regardless.
   */
  const runPaceForHard = asPositiveNumber(args.fiveKPaceSecPerMi) ?? asPositiveNumber(args.thresholdPaceSecPerMi);
  const ftpForHard = asPositiveNumber(args.ftpWatts);
  const hardDayGate = (h: { discipline: 'run' | 'bike'; ownership: 'prescribed' | 'club' }): boolean =>
    h.ownership === 'club'
      || (h.discipline === 'bike' ? ftpForHard != null : runPaceForHard != null);
  // ⚠️ COLLECTED HERE, SURFACED WHERE `placementCompromises` LIVES (below) — the gate has to run
  // before the pins are built and that array is declared after them.
  const hardGateNotes: string[] = requestedHardDays.filter((h) => !hardDayGate(h)).map((h) => (
    h.discipline === 'bike'
      ? 'The hard ride was left out: without an FTP there is no wattage to prescribe, and no way for '
        + 'the session to get harder on purpose. Add it in Training Baselines and rebuild.'
      : 'The hard run was left out: without a 5K time there is no pace to prescribe, and no way for '
        + 'the session to get faster on purpose. Add it in Training Baselines and rebuild.'
  ));
  const gatedHardDays = requestedHardDays.filter(hardDayGate);
  /**
   * ⛔ THE ROLES ARE FIXED BEFORE THE DAYS ARE (§7 + slice 8). Which session each hard day IS depends
   * on ownership and order — never on which weekday it lands on — so the assignment is settled here
   * and the placement fills in underneath it. Deciding the role from the placed day would make the
   * session type depend on the solver's answer, which is the tail wagging the dog.
   */
  const hardRoles = assignHardRoles(gatedHardDays);
  /**
   * ⛔ THE ENGINE PROPOSES THE DAYS IT WAS NOT GIVEN — BY ASKING THE SOLVER, NOT BY SCORING AGAIN.
   *
   * A prescribed hard day with no day becomes a FLEXIBLE session in the SAME solve that places the
   * bar (`week-solver`'s `flexible` input, the mechanism the easy runs and rides already use). So
   * the proposal is the placement: same clearances, same matrix, same law, and there is no second
   * scorer to disagree with the first one. ⛔ Do not add one — the handoff says so and the reason is
   * that two placement authorities is exactly the doubled disease this codebase keeps deleting.
   *
   * ⚠️ AND IT PRE-WIRES §6 AT NO COST. When the stacking law ships, "where the solver prefers" moves
   * to the heavy leg days on its own, and an athlete who never touches the defaults gets the better
   * arrangement with NO screen change. That is the point of the model.
   */
  const proposedHardDays = gatedHardDays.filter((h) => h.day == null);
  const pinnedHardDays = gatedHardDays.filter((h) => h.day != null);
  /**
   * The placed answer, filled in after the solve. Until then every consumer that needs a DAY must
   * wait; the ones that need only a COUNT (the frequency budgets) read the gated list directly.
   */
  /**
   * ⛔ THE ROLE TRAVELS WITH THE ENTRY, NOT WITH THE DAY (slice 8). `roleOf` matched on the calendar
   * day, which worked only while every hard day HAD one — a proposed day has none at the point the
   * roles are assigned, so both entries fell through to the `vo2` default and a two-day athlete got
   * TWO VO2 sessions. That is precisely the arrangement §7 forbids, arriving silently.
   */
  const hardDays: Array<{
    day: DayName; discipline: 'run' | 'bike'; terrain?: HardRunTerrain;
    ownership: 'prescribed' | 'club'; role: HardRole;
  }> = [];
  const roleOf = (day: DayName): HardRole => hardDays.find((h) => h.day === day)?.role ?? 'vo2';
  /**
   * ⛔ LAZY, AND THAT IS NOT A STYLE CHOICE. `hardDays` is filled AFTER the solve (the proposal is
   * read out of it), so a `const x = hardDays.filter(...)` here would capture the EMPTY array and
   * every consumer would silently see no hard days at all — which is exactly what it did on the
   * first pass of this slice. Functions, so they are evaluated where they are used.
   */
  const hardRunDays = () => hardDays.filter((h) => h.discipline === 'run');
  const hardRideDays = () => hardDays.filter((h) => h.discipline === 'bike');
  /** Counts are known before placement — a hard day costs its discipline a slot wherever it lands. */
  const hardRunCount = gatedHardDays.filter((h) => h.discipline === 'run').length;
  const hardRideCount = gatedHardDays.filter((h) => h.discipline === 'bike').length;
  const runSelected = enduranceSport === 'run' || askedRunMiles > 0 || !!asDay(args.longRunDay)
    || hardRunCount > 0;
  const bikeSelected = hasBike || enduranceSport === 'bike';

  const longRunPin = runSelected ? asDay(args.longRunDay) : null;
  if (longRunPin) pins.push({ day: longRunPin, kind: 'long_run', label: 'your long run' });
  // ⛔ THE LONG RIDE PINS TOO. It is a leg-dominant LONG session, so the law gives it the same 48h
  // clearance from heavy lower-body work as the long run (`schedule-session-constraints.ts`). Until
  // now it was collected at intake, written to the goal, and never forwarded — so the bar was placed
  // as though the athlete's biggest ride of the week did not exist.
  const longRidePin = hasBike ? asDay(args.bike?.longRideDay) : null;
  // ⛔ NO `!pins.some(day === …)` GUARD ANY MORE — REMOVED 2026-08-09. It read as harmless dedupe and
  // was silent pin ABSORPTION: two anchors on one day meant the SECOND ONE VANISHED, before the
  // solver ever saw it. `week-solver` has a typed refusal for exactly this
  // (`SOLVER_GRIDLOCK_ANCHOR_COLLISION`) whose copy says *"Both are fixed, so this is yours to
  // resolve — the engine will not pick one"* — and it could never fire from this path.
  // ⚠️ IT ALSO DISCARDED LEGAL PAIRS. `SAME_DAY_COMPATIBLE` permits some anchors to share a day; the
  // blanket guard dropped those too, so the athlete lost a session the law would have allowed.
  // ⛔ THE REAL FIX IS AT INPUT — the day picker greys out and locks a day another anchor already
  // holds, so the collision is never entered. This is the BACKSTOP: anything that still arrives
  // collided now reaches the solver, which answers properly instead of the composer hiding it.
  if (longRidePin) {
    pins.push({ day: longRidePin, kind: 'long_ride', label: 'your long ride' });
  }
  /**
   * ⛔ THE LONG RUN IS AN ANCHOR EVEN WHEN THE ATHLETE DID NOT NAME ONE (2026-08-08).
   *
   * Until now an unpinned long run was not in `pins` at all: the lifts were solved WITHOUT it, and
   * the composer picked its day afterwards out of whatever the solver had left. So the bar was
   * placed by an engine that did not know where the week's biggest session was going to be, and the
   * 48h heavy-leg clearance off the long run was satisfied by luck rather than by the law. The file
   * has a scar from exactly this — *"the long run took Saturday as its own day, Sunday was occupied,
   * and the week came out with seven active days and no rest at all."*
   *
   * ⚠️ THE DAY IS UNCHANGED — `DEFAULT_LONG_DAY` is the Saturday the old `ENDURANCE_DAYS` pair ended
   * on, and `pickedLong` below still resolves to the same value. What changes is that the solver is
   * now TOLD, before it places anything, instead of being handed the consequence afterwards.
   */
  // ⚠️ ONLY A LEADING SPORT GETS A DEFAULT LONG DAY. A sport held at maintenance is easy volume by
  // definition — inventing a long run for it would be the engine adding a session nobody asked for.
  // A long day the athlete PINNED is still honoured either way (`longRunPin`, above).
  // ⚠️ THIS GUARD STAYS, AND IT IS NOT THE ABSORPTION BUG. The others dropped a day the ATHLETE
  // CHOSE; this one declines to invent a DEFAULT on a day already spoken for. Never adding an
  // unrequested session is the opposite failure from silently removing a requested one.
  if (!longRunPin && runSelected && !pins.some((p) => p.day === DEFAULT_LONG_DAY)) {
    pins.push({ day: DEFAULT_LONG_DAY as DayName, kind: 'long_run', label: 'your long run' });
  }
  // ⛔ GUARD REMOVED (2026-08-09) — same absorption. The hard day was LAST in this order, so it lost
  // every collision: an athlete who put their club night on their long-run day simply had no hard
  // session in the block, with nothing said anywhere.
  //
  // ⛔ AND THERE MAY BE TWO OF THEM NOW (§1i). Each takes its own pin, kind and label, so the solver
  // sees both as anchors and refuses a collision properly rather than the composer hiding one.
  // ⚠️ A CLUB DAY PINS EXACTLY LIKE A PRESCRIBED ONE. It costs the same recovery; the difference is
  // whether the app writes the session, not whether the day is spoken for.
  // ⚠️ THE LABEL NUMBERS THEM WHEN THERE ARE TWO, because "your hard run" twice in a compromise line
  // names neither. With one, the wording is unchanged from before §1i.
  // ⚠️ ONLY A PINNED HARD DAY IS AN ANCHOR. A proposed one is FLEXIBLE — the solver is being asked
  // where it goes, so making it an anchor would be pinning the answer before the question.
  for (const h of pinnedHardDays) {
    const sameDiscipline = pinnedHardDays.filter((x) => x.discipline === h.discipline);
    const nth = (h.discipline === 'run' ? hardRunCount : hardRideCount) > 1
      ? ` ${sameDiscipline.indexOf(h) + 1}` : '';
    pins.push({
      day: h.day as DayName,
      kind: h.discipline === 'bike' ? 'quality_bike' : 'quality_run',
      label: h.discipline === 'bike' ? `your hard ride${nth}` : `your hard run${nth}`,
    });
  }

  // ── THE SOLVER TAKES OVER (step 1) ──────────────────────────────────────────────────────────
  //
  // ⛔ WEEKS WILL CHANGE, AND THAT IS THE POINT. `place-week` filtered and took the first legal
  // answer; the solver enumerates and scores. Known differences, all deliberate:
  //   • The stack lands on the SMALLEST day rather than the earliest legal one, so a bench press
  //     goes onto the hard-run day rather than the long-ride day when both are free (§6b-3 find 2).
  //   • Upper days are now spread rather than left to a tie-break, and upper↔lower has a 3-day
  //     preferred floor (§6b-5 find 1).
  //   • Heavy-day spread is the tightest pair rather than the sum, which only differs at 3+ lowers.
  //   • Breaches are ranked by SIZE, so a forced week takes the smaller violation.
  //
  // ⚠️ `canSplitDay` is not passed and does not need to be: the solver asks the matrix which pairs
  // may share a day and `stackNeedsRecoveryGap` which of those actually compete. A bench beside a
  // ride needs no permission because it needs no gap.
  /**
   * ⛔ THE FLAT HARD RUN PREFERS 48h FROM HEAVY LEGS, NOT `quality_run`'s 24h. Michael, 2026-08-06.
   *
   * **His reasoning:** flat running is eccentric leg-pounding of the same species as a jogged hill
   * descent, and the block already treats that as long-separation work — so flat should match.
   *
   * ⛔ PREFERRED, NOT REQUIRED, AND THE DIFFERENCE WAS MEASURED. Built as a hard constraint first: it
   * put a reported breach in 8 of 12 week shapes and **11 of the 16 breaches landed on the LONG
   * RUN** — a squat shoved next to the athlete's longest run to buy this session its space, which is
   * the same eccentric damage one day over. Michael: *"prefer, don't force."* It is now a score term
   * sitting below `breachPenalty`, so it can only choose among weeks that are already legal.
   * **Taken in 8 of 24 legal shapes, silently declined in 16, none made worse.**
   *
   * ⚠️ ONE CORRECTION TO THE REASONING, RECORDED BECAUSE IT CHANGES WHAT "MATCH IT" MEANS AND NOT
   * WHETHER TO. The block does not PLACE anything at 48h for a jogged descent. `descentIsJogged`
   * asks the 48h cell and then **adapts the session to the placement** — it walks the descent when
   * the clearance is not there. It is the session that yields, not the week. Flat has no walk/jog
   * knob, so the only equivalent is to move the lifting. **The conclusion holds; the mechanism runs
   * the other way and a future session should know it.**
   *
   * ⛔ WHY 48 AND NOT SOME NEW NUMBER: it is the cell the law already uses for eccentric leg work
   * (`long_run × lower_body_strength`), and inventing a third figure would be exactly the
   * hand-picked coefficient this repo keeps deleting.
   *
   * ⚠️ THE OTHER THREE TERRAINS ARE UNTOUCHED and keep 24h. Uphill removes the impact transient —
   * that is the entire argument of doctrine §2 — so the hill and treadmill options are not paying
   * this cost and must not be made to.
   */
  // ⛔ PER DAY, NOT PER BLOCK (§1i). This was one boolean off the single hard day; with two, one may
  // be a flat run and the other a hill, and charging the flat clearance to both would move a lift
  // for a session that is not paying for it. Keyed on the DAY so each anchor answers for itself.
  // ⚠️ PINNED RUNS ONLY — this is an ANCHOR override and a proposed hard run is not an anchor. Its
  // flat clearance still comes from the real table via `adjacencyBreach` on the flexible path; what
  // it does not get is the anchor-specific 48h PREFERENCE. Named rather than left to be discovered.
  const flatHardRunDays = new Set(
    pinnedHardDays.filter((h) => h.discipline === 'run' && h.terrain === 'flat').map((h) => String(h.day)),
  );
  const solverAnchors: SolverAnchor[] = pins.map((p) => ({
    day: p.day.toLowerCase() as SolverDay,
    kind: p.kind,
    label: p.label,
    ...(flatHardRunDays.has(p.day) && p.kind === 'quality_run'
      ? {
          preferredClearance: {
            against: 'lower_body_strength' as const,
            hours: 48,
            reason: 'flat intervals pound the legs the way a jogged descent does, so heavy leg days '
              + 'are preferred two days clear of them rather than one — wanted, never forced',
          },
        }
      : {}),
  }));
  // ⛔⛔ THE FOUR-DAY WEEK IS DELETED (2026-08-16, Michael). **Every Strong Focus block is three
  // days: Squat · Bench · Deadlift + Press.** The `liftingDays` arg, its `3 | 4` type, the wizard
  // step that set it and the `lifting_days` plumbing are all gone with it.
  //
  // What stood here: a default of 4 with 3 as an opt-in, and a `SPEC-week-solver.md` §0a note that
  // lift frequency was "not negotiable". There is nothing left to negotiate — the branch below is
  // unconditional now, and an unreachable four-day path is not "kept for later", it is a second
  // shape nobody maintains.
  // ⛔ WHICH TWO LIFTS SHARE THE 3-DAY WEEK'S ONE DOUBLE SESSION — **DEADLIFT + PRESS AS OF
  // 2026-08-15 (§1f), and it used to be BENCH + PRESS.**
  //
  // Wendler's own 3-day table (Forever p.22) pairs the deadlift with the press and gives squat and
  // bench their own days. The bench+press pairing was ours: it fell out of "the two upper lifts are
  // the ones that can share", which is a reasonable rule and is not his.
  //
  // ⛔ THE PAIRED DAY IS NOW A HEAVY LOWER DAY, and that is a LOAD CLAIM five things read — the
  // solver's 48h heavy↔heavy clock, the hill session's descent rule, easy-run stacking, the
  // stack-note copy and the session tag. `pairedIsLower` is derived from the lifts in the pair
  // rather than asserted, so the claim cannot go stale if the pair ever changes again.
  // ⚠️ THE LOWER-DAY COUNT IS UNCHANGED: it was squat + deadlift, it is now squat + (deadlift+press).
  // Two heavy lower days either way, so no clearance in the scheduling law moves for this.
  //
  // ⛔ HEAVIEST FIRST WITHIN THE SHARED DAY, AND THIS IS NO LONGER `MAIN_LIFTS`' ORDER (2026-08-05).
  // That array runs Wendler's p.11 sequence — Press · Deadlift · Bench · Squat — which is the order
  // of the WEEK. The shared day's internal order is a different question with a different answer:
  // the second lift of a session is trained fatigued, so the heavier one goes first. Deadlift, here.
  //
  // ⚠️ TAKING BOTH FROM ONE ARRAY MADE THEM THE SAME DECISION, AND REORDERING TO THE BOOK SILENTLY
  // PUT THE HEAVIER LIFT SECOND once. Caught by `lifting-days.test.ts`. Two orderings, two sources.
  const PAIRED_LIFTS = ['Deadlift', 'Overhead Press']
    .filter((n) => MAIN_LIFTS.some((l) => l.name === n));
  const pairedSlotName = PAIRED_LIFTS.join(' + ');
  const pairedIsLower = MAIN_LIFTS.some((l) => PAIRED_LIFTS.includes(l.name) && l.isLower);
  const solverLifts = [
        ...MAIN_LIFTS.filter((l) => !PAIRED_LIFTS.includes(l.name)).map((l) => ({ name: l.name, isLower: l.isLower })),
        { name: pairedSlotName, isLower: pairedIsLower },
      ];
  // ⛔ THE HARD DAY IS ONE OF THE RUN DAYS, NOT AN EXTRA ONE.
  //
  // `runFreq` counted only the EASY runs and the hill session was pushed on top, so an athlete who
  // asked for three run days got four: three easy runs plus hills. It also over-spent the mileage —
  // the typed weekly miles were distributed across all three easy runs and then a fourth running
  // session was added outside the budget entirely.
  //
  // Michael, counting his own week: *"one of the runs is the hill session."* It is. A hard run is a
  // run. The block carries ONE hard aerobic session (D-327), so when it is a run it consumes one of
  // the days the athlete asked for rather than arriving beside them.
  //
  // ⚠️ Floor of 1 easy run: even at runFreq 2 with a hard day, the long run survives. The doctrine's
  // precondition is easy volume (parent §4) — a week of nothing but the hard session is the one
  // shape it explicitly rules out.
  /**
   * ⛔ FREQUENCY IS WHERE MAINTENANCE BITES — not volume (2026-08-08). See the priority model above:
   * the leading sport keeps the day count the athlete asked for; a sport held at maintenance is
   * capped at ~2 easy sessions, which is the dose the aerobic base holds on. Their typed VOLUME is
   * ⛔ THE PICKED COUNT IS BUILT, FULL STOP (2026-08-08). No priority cap, no maintenance cap —
   * 2/3/4 runs and 1/2/3 rides are wizard answers and this file's job is to seat them.
   */
  const askedRunDays = runSelected
    ? Math.max(DEFAULT_ENDURANCE_SESSIONS, Math.min(4, Math.round(Number(args.enduranceFrequency) || DEFAULT_ENDURANCE_SESSIONS)))
    : 0;
  /**
   * ⛔ THE HARD SESSIONS ARE DAYS THEY PICKED, NOT EXTRA ONES. Three run days with one hard run
   * means one hard and two easy — never three easy plus a hill session on top, which is the +27%
   * overage this file already fixed once for the miles.
   *
   * ⛔ AND IT SUBTRACTS THE COUNT NOW, NOT A BOOLEAN (§1i). `hardDayIsRun` was `true`/`false` and
   * this subtracted exactly 1; two hard runs would have booked one of them on top of the athlete's
   * asked-for count — the same overage, arriving through the door that was just widened.
   * ⚠️ FLOORED AT 1 so a 2-run week with two hard runs still leaves a run to be long.
   */
  const runFreq = runSelected
    ? Math.max(1, askedRunDays - hardRunCount)
    : askedRunDays;
  /** A selected run block has a long day: the one they pinned, or the engine's default when absent. */
  const runHasLongDay = runSelected;
  const easyRunsWanted = runSelected ? Math.max(0, runFreq - (runHasLongDay ? 1 : 0)) : 0;
  /** Ride count, exactly as picked. */
  const askedRideDays = bikeSelected ? Math.max(1, Math.min(3, Math.round(Number(args.bike?.days) || 2))) : 0;
  const rideHasLongDay = bikeSelected && !!longRidePin;
  /**
   * The long ride is a pin/anchor, so only the EASY rides are flexible — and when the hard day is a
   * RIDE it is one of the picked ride days too, exactly as the hard run is one of the run days.
   */
  // ⛔ THE COUNT, NOT A BOOLEAN (§1i) — same fix as the runs above, one discipline over.
  const ridesWanted = bikeSelected
    ? Math.max(0, askedRideDays - (longRidePin ? 1 : 0) - hardRideCount)
    : 0;

  /**
   * ⛔ THE EASY SESSIONS GO INTO THE SAME SOLVE AS THE BAR (2026-08-08). Michael: *"Strong Focus
   * clusters its easy runs/rides."* It did, and the cause was three passes that could not see each
   * other: the lifts were solved first, then a run pass took whatever days were left in CALENDAR
   * ORDER, then — a thousand lines later, inside the week loop — a ride pass took what the run pass
   * had not. Nothing ever compared a run day to a ride day, so the week came out in blocks.
   *
   * ⚠️ THE FILE ALREADY KNEW. Its own comment on the interleave hack: *"THE CAUSE WAS PASS ORDER,
   * NOT A DECISION. The run pass runs first and took EVERY free day … Nothing ever compared the
   * two."* The alternator bolted on top was a workaround for the pass order rather than a fix, and
   * it only ever ran when the athlete kept BOTH disciplines.
   *
   * ⛔ ONE PASS, ONE SCORER. `week-solver`'s flexible placement scores the WHOLE SUBSET — fewest
   * back-to-back days, then the most even gaps — against everything already placed, which by this
   * point is every anchor AND every lift. It is the same spreader the marathon plan now uses.
   *
   * ⚠️ RUNS ARE LISTED FIRST AND THAT IS LOAD-BEARING. The solver places one kind group at a time in
   * insertion order, and when the week cannot seat everything the shortfall is taken off the END
   * (see `solveWithFlexible`). Runs before rides preserves today's precedence exactly: the ride pass
   * has always been the one that reports a shortfall.
   */
  // ⛔ THE PROPOSED HARD DAYS GO FIRST, AND THAT IS DELIBERATE (slice 8). The shortfall reduction
  // below takes sessions off the END of this list, so the head is the priority position. A hard day
  // is the athlete's requested QUALITY work; an easy run yielding before it is the right order, and
  // the reverse would drop the one session they asked for by name.
  // ⚠️ RUNS BEFORE RIDES IS PRESERVED among the easy sessions — the precedence the comment above
  // documents is about those two, and adding a higher-priority head does not disturb it.
  const flexibleWanted: SolverFlexible[] = [
    ...proposedHardDays.map((h, i) => ({
      name: `hard:${i}`,
      kind: h.discipline === 'bike' ? ('quality_bike' as const) : ('quality_run' as const),
    })),
    ...Array.from({ length: easyRunsWanted }, (_, i) => ({ name: `easy_run:${i}`, kind: 'easy_run' as const })),
    ...Array.from({ length: ridesWanted }, (_, i) => ({ name: `easy_bike:${i}`, kind: 'easy_bike' as const })),
  ];

  /**
   * ⛔ A REFUSAL IS NOT AN ANSWER TO A WEEK THAT MUST BE BUILT, AND IT IS NOT A LICENCE TO DROP
   * SESSIONS QUIETLY EITHER. `week-solver` refuses outright when the flexible sessions cannot all be
   * seated (§5.2b — it never subtracts), which is right for an intake and wrong here: this composer
   * has to return twelve weeks. So the ASK is reduced one session at a time and the shortfall is
   * REPORTED, which is exactly what the pass this replaces already did (`rideShortfallNote`).
   *
   * ⚠️ Reduction comes off the tail, so rides yield before runs — today's precedence, preserved.
   */
  /**
   * ⛔ TWO PHASES, AND THE SECOND ONE IS WHAT CARRIES Q-215 ACROSS.
   *
   * The preference that survived the old ranking is real and owned: *all else equal an easy run on a
   * press day competes with nothing, and on a squat day it shares the legs* — the law's own
   * `stackNeedsRecoveryGap` asks for 6h on the second pair and nothing on the first. It is a
   * TIE-BREAK, never a ban (`easy_run × lower_body_strength` is ✓ in the matrix and
   * STRENGTH-PROTOCOL §6.2 recommends it as a recovery flush).
   *
   * ⚠️ IT NEEDS THE LIFT DAYS, AND THE LIFT DAYS COME OUT OF THE SOLVE — so the solve runs once to
   * learn them, then again with the heavy-leg days handed back as `flexibleAvoid`. That field is the
   * mechanism built for exactly this (§4.1a: a caller preference, ranked below spread and below the
   * law, and REQUIRED to name its owner and reason).
   *
   * ⛔ PHASE 1 AND PHASE 2 PLACE THE BAR IDENTICALLY, and that is asserted rather than assumed
   * (`solver-flexible-parity` in the composer tests). `week-solver`'s own contract says the flexible
   * path "hangs off one `if` and touches no lift score"; if that ever stops being true, the lifts
   * would move when an athlete adds an easy run, and the test is what would catch it.
   */
  /**
   * ⛔ WHEN THE WEEK CANNOT HOLD EVERYTHING, A HARD DAY YIELDS — THE BAR DOES NOT (audit 2026-08-17,
   * defect #0). `week-solver` now REFUSES to breach the 48h between heavy legs and the long run
   * (`isUnbreachable`), so an over-subscribed week comes back unsolvable instead of arriving with a
   * squat the morning after the long run and a note apologising for it.
   *
   * ⛔ THIS LAYER IS THE ONLY ONE THAT KNOWS WHICH SESSION IS LESSER. The solver sees anchors and
   * lifts; it cannot know that a hard day is OPTIONAL (§1i — the block is complete without one)
   * while the lifting is the block's entire spine. So the yield is decided here: drop hard days from
   * the end, one at a time, until the week is legal — and say which one went and why.
   *
   * ⚠️ THE LONG RUN AND LONG RIDE NEVER YIELD. They are the doctrine's two pins and the reason the
   * athlete picked those days; dropping one to make room for a lift would be the engine rearranging
   * the athlete's life around its own convenience.
   * ⚠️ MEASURED, NOT SUPPOSED: Michael's own week (hard ride Tue, hard run Fri, long ride Sat, long
   * run Sun) is exactly this case. A heavy lower lift may not share a day with `quality_bike`,
   * `quality_run` or `long_run`, and must clear the long run by 48h — which leaves Wednesday and
   * Thursday for TWO lower lifts that need 48h from each other. Impossible. Dropping the second hard
   * day frees Tuesday and the week solves strictly.
   */
  const hardAnchorLabels = new Set(
    pinnedHardDays.map((h) => (h.discipline === 'bike' ? 'your hard ride' : 'your hard run')),
  );
  const yieldedHardDays: string[] = [];
  let solverAnchorsUsed: SolverAnchor[] = solverAnchors;
  let liftOnlySolve = solveWeek({ anchors: solverAnchorsUsed, lifts: solverLifts });
  while (liftOnlySolve.status === 'unsolvable') {
    // ⚠️ FROM THE END. The first hard day is the VO2 session §7 calls the quality easy volume cannot
    // hold; the second is the addition. Yielding the addition first is the smaller loss.
    const lastHard = [...solverAnchorsUsed].reverse()
      .find((a) => a.kind === 'quality_run' || a.kind === 'quality_bike');
    if (!lastHard) break;   // nothing left to yield — the refusal stands and is surfaced as-is
    solverAnchorsUsed = solverAnchorsUsed.filter((a) => a !== lastHard);
    yieldedHardDays.push(lastHard.label);
    liftOnlySolve = solveWeek({ anchors: solverAnchorsUsed, lifts: solverLifts });
  }
  const heavyLegDaysForAvoid: SolverDay[] = liftOnlySolve.status === 'unsolvable'
    ? []
    : liftOnlySolve.week.lifts.filter((l) => l.isLower).map((l) => l.day);

  /**
   * ⛔ Q-215 IS A TIE-BREAK, AND PASSING IT AS `flexibleAvoid` MADE IT AN OVERRIDE (fixed 2026-08-08).
   *
   * `week-solver`'s score ranks `avoided` ABOVE `selfAdjacent`, deliberately — that ordering carries
   * the run generator's day-before-long-run rest rule, and a test caught the opposite ordering
   * spending both recovery days at once. Correct there, wrong for this preference: Q-215's own words
   * are *"a leg day that genuinely scores better still wins"*, and routing it through `avoided`
   * meant it beat spreading instead of breaking ties within it.
   *
   * ⚠️ MEASURED, NOT THEORISED. Eyeball case 3 (4 runs, long run Wednesday): Friday carries the squat,
   * so the avoid pushed the third easy run to Sunday and produced a **Saturday+Sunday** cluster.
   * Tue/Fri/Sun was available and clusters nothing.
   *
   * ⛔ SO IT IS SOLVED BOTH WAYS AND THE SPREAD DECIDES. The avoided answer is taken only when it
   * costs no extra adjacency — which is precisely "when they otherwise tie". ⚠️ Not done by
   * reordering the solver's score: that vector is shared with the marathon path and `avoided` is
   * load-bearing there for a different rule.
   */
  const selfAdjacentCount = (r: ReturnType<typeof solveWeek>): number => {
    if (r.status === 'unsolvable') return Number.MAX_SAFE_INTEGER;
    const byKind = new Map<string, number[]>();
    for (const f of r.week.flexible) {
      const arr = byKind.get(f.kind) ?? [];
      arr.push(SOLVER_DAY_ORDER.indexOf(f.day));
      byKind.set(f.kind, arr);
    }
    let n = 0;
    for (const days of byKind.values()) {
      for (let i = 0; i < days.length; i++) {
        for (let j = i + 1; j < days.length; j++) {
          const raw = Math.abs(days[i] - days[j]);
          if (Math.min(raw, 7 - raw) <= 1) n++;
        }
      }
    }
    return n;
  };

  /**
   * How many impact sessions land the morning after a long run. The engine's modality-aware recovery
   * preference lives in `week-solver`; this is the composer reading the same property back so its own
   * tie-breaks cannot quietly undo it.
   */
  const impactAfterLongRun = (r: ReturnType<typeof solveWeek>): number => {
    if (r.status === 'unsolvable') return Number.MAX_SAFE_INTEGER;
    const dayAfter = new Set(
      solverAnchors.filter((a) => a.kind === 'long_run')
        .map((a) => (SOLVER_DAY_ORDER.indexOf(a.day) + 1) % 7),
    );
    return r.week.flexible.filter(
      (f) => f.kind === 'easy_run' && dayAfter.has(SOLVER_DAY_ORDER.indexOf(f.day)),
    ).length;
  };

  const solveWithFlexible = () => {
    for (let n = flexibleWanted.length; n >= 0; n--) {
      const flexible = flexibleWanted.slice(0, n);
      if (flexible.length === 0) return liftOnlySolve;
      /**
       * ⛔ `separation-first` — THIS BLOCK PLACES EASY ENDURANCE AMONG LIFTS, NOT AMONG RUNS
       * (2026-08-16). The solver's default ranking reads `streak`/`gaps` and the two recovery rules
       * before it asks whether two easy sessions are touching, which is right for
       * `assign-days-solver` (runs among runs, where those recovery days are the whole point) and
       * wrong here: at three lifting days the week has a spare day, and the default order spent it
       * on elbow room rather than on spread — Sat+Sun easy runs with Thursday empty, Wed+Thu easy
       * rides with Sunday empty. Both rebuilt identically on the pre-§1f-0 engine with
       * `liftingDays: 3`, so this is not a four-day artefact; four days simply crowded the week
       * enough that the question never arose.
       *
       * ⚠️ THE TWO ORDERS ARE CONTRADICTORY, NOT UNTUNED — see `SolverInput.flexibleRanking`. Every
       * candidate single ordering was measured and none satisfies both suites.
       */
      const base = {
        anchors: solverAnchorsUsed, lifts: solverLifts, flexible,
        flexibleRanking: 'separation-first' as const,
      };
      const plain = solveWeek(base);
      if (heavyLegDaysForAvoid.length === 0) {
        if (plain.status !== 'unsolvable') return plain;
        continue;
      }
      const avoided = solveWeek({
        ...base,
        flexibleAvoid: {
          days: heavyLegDaysForAvoid,
          owner: 'strength-primary-plan (Q-215)',
          reason: 'an easy session on a press day competes with nothing; on a squat or '
            + 'deadlift day it is the same legs twice, so a clean upper day is preferred when '
            + 'they otherwise tie — allowed, never banned',
        },
      });
      /**
       * ⛔ AND IT MUST NOT BUY ITSELF A WORSE RECOVERY DAY EITHER (2026-08-08).
       *
       * Q-215 is "prefer a clean upper day over a heavy-leg day"; the day-after-the-long-run rule is
       * about impact through damaged tissue. When they pull apart, the tissue rule wins — it is the
       * one the clearance table gives heavy legs 48h for, and Q-215's own words are that it yields
       * to anything that genuinely scores better.
       *
       * ⚠️ MEASURED. On long-ride Sat / long-run Sun / 4 runs + 2 rides the solver correctly put the
       * easy runs on Tue/Thu/Fri and the easy RIDE on Monday — and this comparison then threw that
       * away, because the avoided variant tied on adjacency and won the tie. Monday came back with a
       * run on it, the morning after the long run, with a free ride sitting elsewhere in the week.
       */
      const takeAvoided = avoided.status !== 'unsolvable'
        && selfAdjacentCount(avoided) <= selfAdjacentCount(plain)
        && impactAfterLongRun(avoided) <= impactAfterLongRun(plain);
      // The preference is taken only when it buys nothing worse. Ties go to the preference.
      if (takeAvoided) return avoided;
      if (plain.status !== 'unsolvable') return plain;
    }
    return liftOnlySolve;
  };

  const solved = solveWithFlexible();
  // ⛔ THE TEST WEEK IS SOLVED SEPARATELY, because it is a different week: four lift days, nothing
  // shared. Only computed in 3-day mode — at four days every week already is the test layout.
  // ⚠️ THE SEPARATE TEST-WEEK SOLVE IS GONE with the week-3 split (see `isTestWeek`). Every week of
  // the block now uses one layout, which is what "three lifting days" was always supposed to mean.
  const solvedTest = solved;

  /**
   * ⛔ THE PROPOSAL, READ BACK OUT OF THE SOLVE (slice 8). Every hard day now has a day: the ones the
   * athlete pinned, plus the ones the solver just placed. From here down NOTHING knows the
   * difference — the budgets, the roles and the emitters all read one list, exactly as before §1i's
   * placement model.
   *
   * ⚠️ A PROPOSED DAY THE SOLVER COULD NOT SEAT IS DROPPED, NOT INVENTED. `solveWithFlexible` reduces
   * the ask from the tail when the week cannot hold everything, and a hard day sits at the head — so
   * if it is missing here the week genuinely had no legal day for it. Guessing one would put a hard
   * session on a day the law refused, which is the one thing the solver exists to prevent.
   */
  // ⚠️ THE ROLE IS TAKEN BY POSITION IN `gatedHardDays`, which is the list `assignHardRoles` scored —
  // so it is carried across here rather than re-derived from the placed day.
  // ⚠️ A YIELDED HARD DAY IS NOT BUILT. Its anchor is gone from the solve, so emitting the session
  // would put it on a day the placer never reserved — the pin-and-empty-day failure inverted.
  const yieldedLabels = new Set(yieldedHardDays);
  const wasYielded = (h: { discipline: 'run' | 'bike' }) =>
    yieldedLabels.has(h.discipline === 'bike' ? 'your hard ride' : 'your hard run');
  gatedHardDays.forEach((h, i) => {
    if (h.day != null && wasYielded(h) && yieldedLabels.size > 0) {
      // Only the LAST of a discipline yields; an earlier one of the same discipline stays.
      const sameKind = gatedHardDays.filter((x) => x.discipline === h.discipline && x.day != null);
      if (sameKind.indexOf(h) >= sameKind.length - yieldedHardDays.filter((l) =>
        l === (h.discipline === 'bike' ? 'your hard ride' : 'your hard run')).length) return;
    }
    const role = hardRoles[i];
    if (h.day != null) { hardDays.push({ ...h, day: h.day, role }); return; }
    if (solved.status === 'unsolvable') return;
    const placed = solved.week.flexible.find((f) => f.name === `hard:${proposedHardDays.indexOf(h)}`);
    const day = placed ? asDay(placed.day) : null;
    if (!day || hardDays.some((x) => x.day === day)) return;
    hardDays.push({ ...h, day, role });
  });

  // ⛔ A REFUSAL IS NOT A CRASH AND IT IS NOT A SILENT FALLBACK (§5.2). The solver names the anchors
  // that bound it and what would free them; those words go to the athlete. The block is still built
  // — on `place-week`'s answer — so the athlete is never left with nothing while being told why.
  const cap = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
  const placedWeek = solved.status === 'unsolvable'
    ? placeLiftingWeek(MAIN_LIFTS.map((l) => ({ lift: l.name, isLower: l.isLower })), pins)
    : {
        slots: solved.week.lifts.map((l) => ({
          lift: l.lift,
          isLower: l.isLower,
          day: cap(l.day) as DayName,
          ...(l.stackedWith ? { stackedWith: l.stackedWith } : {}),
        })),
        freeDays: solved.week.restDays.map((d) => cap(d) as DayName),
        restDays: solved.week.restDays.map((d) => cap(d) as DayName),
        compromises: solved.status === 'compromised' ? solved.compromises : [],
      };
  const solverRefusal: Array<{ kind: 'breach' | 'cost'; text: string }> = solved.status === 'unsolvable'
    ? [{ kind: 'breach', text: `${solved.message} ${solved.options.join(' ')}` }]
    // ⛔ NOTES MUST REACH THE ATHLETE OR THEY ARE THE §0f LOSS AGAIN — a cost computed and never
    // said. They are not rule breaches, so they do not make the week "compromised"; they ride the
    // same channel because that channel is the one the plan already surfaces.
    : solved.notes;   // already tagged by the solver
  // Lift name → the day the solver gave it. Falls back to the lift's legacy grid day only if the
  // solver somehow omitted it, so a placement bug degrades to the old behaviour rather than to no day.
  // ⛔ THE PAIRED SLOT EXPANDS BACK INTO ITS TWO LIFTS. The solver placed one upper day; both upper
  // lifts read that day off it. Without this every consumer downstream — `liftDay`, `upperLiftDays`,
  // the run and ride placers — would look up "Bench Press" and find nothing, and the fallback would
  // silently hand them the legacy Mon/Tue/Thu/Fri grid day. A miss here is not a crash, it is a
  // wrong week that looks right, which is the failure mode this file keeps having.
  const expandSlots = (slots: Array<{ lift: string; isLower: boolean; day: DayName }>) => {
    const out = new Map<string, string>();
    for (const s of slots) {
      if (s.lift === pairedSlotName) {
        for (const n of PAIRED_LIFTS) out.set(n, s.day as string);
      } else {
        out.set(s.lift, s.day as string);
      }
    }
    return out;
  };
  const dayForLift = expandSlots(placedWeek.slots as never);
  // ⛔ THE TEST WEEK HAS ITS OWN MAP. Week 3 puts every lift on its own day, so the days MOVE between
  // a normal week and the test week — that is the whole point of the mode, not a bug to reconcile.
  const dayForLiftTest = solvedTest.status !== 'unsolvable'
    ? expandSlots(solvedTest.week.lifts.map((l) => ({
        lift: l.lift, isLower: l.isLower, day: cap(l.day) as DayName,
      })))
    : dayForLift;
  // Where the heavy legs actually landed — the hill session's descent is prescribed off this.
  // ⚠️ Taken from the NORMAL week: the endurance sessions are authored once for the block, and the
  // lower days do not move between layouts anyway (only the upper pair splits).
  const heavyLowerDays: string[] = placedWeek.slots.filter((s) => s.isLower).map((s) => s.day as string);
  const liftDay = (l: typeof MAIN_LIFTS[number]): string => dayForLift.get(l.name) ?? l.day;
  const liftDayIn = (l: typeof MAIN_LIFTS[number], isTestWeek: boolean): string =>
    (isTestWeek ? dayForLiftTest : dayForLift).get(l.name) ?? liftDay(l);

  /**
   * ⛔ THE ORDER ON A SHARED DAY IS THE WHOLE COST, SO IT HAS TO BE SAID (§0f).
   *
   * The second lift in a session is trained fatigued — the exercise done first is the one that adapts
   * most, and the later one gives up load and reps. Heaviest first is therefore not a preference, it
   * is what decides which lift pays. Emitting two sessions on one day and saying nothing would leave
   * the athlete to guess, and half of them would guess wrong.
   *
   * ⚠️ MAIN_LIFTS ORDER IS THE ORDER: bench precedes overhead press in the array, and bench is the
   * heavier of the two for essentially every athlete. If a future edit reorders that array this note
   * follows it, which is correct — it names position, not a hardcoded lift.
   *
   * ⚠️ SILENT ON THE TEST WEEK because nothing is shared there. Stated as a fact and a consequence,
   * never as an instruction (COPY-VOICE rule 7).
   */
  const pairNoteFor = (l: typeof MAIN_LIFTS[number], _isTestWeek: boolean): string => {
    // ⚠️ THE `l.isLower` GUARD IS GONE (§1f). The pair contains the DEADLIFT now, so testing for an
    // upper lift would have silently suppressed the note on the very lift that leads the day.
    // Membership in the pair is the question, and it is asked directly.
    if (!PAIRED_LIFTS.includes(l.name)) return '';
    const [first, second] = PAIRED_LIFTS;
    if (l.name === first) {
      return ` Shares the day with ${second}, and goes first — the second lift of a session is done`
        + ` fatigued, so it gives up load and reps.`;
    }
    // ⚠️ NO LONGER PROMISES A WEEK-3 SPLIT. That split was deleted 2026-08-05 (D-387) and this
    // sentence outlived it, telling every 3-day athlete about a week the engine stopped building.
    return ` Follows ${first} on the same day.`;
  };

  /**
   * ⛔ THE STACK HAS TO REACH THE ATHLETE, NOT JUST THE DATA STRUCTURE (§0f).
   *
   * `stackedWith` — label, gap hours, and order — had **zero consumers**. The composer read `slots`
   * for days and dropped the rest, so an athlete stacking a bench press onto their long-ride day was
   * told nothing at all. **Eddens is the entire reason that stack is safe** (+6.91% lower-body
   * dynamic strength, resistance FIRST, in exactly the minimal-relief case this is) — so an athlete
   * who rides first has an unsafe day that renders as a legal one.
   *
   * ⚠️ STATED AS A REASON, NOT AN INSTRUCTION. The house voice is a quant who trains, not a coach
   * who encourages: say what the order buys and let the athlete act on it.
   */
  const stackNoteFor = (l: typeof MAIN_LIFTS[number]): string => {
    const st = placedWeek.slots.find((sl) => sl.lift === l.name)?.stackedWith;
    if (!st) return '';
    const gap = st.gapHours > 0
      ? ` Leave ${st.gapHours}h between them — they compete for the same legs.`
      : ` They share no prime movers, so back to back is fine.`;
    return ` Shares the day with ${st.label}: the lift goes first.${gap}`;
  };
  const strengthDays = MAIN_LIFTS.map(liftDay);
  // ⛔ Surfaced, never swallowed. `place-week` states which clearance it had to break; the plan
  // carries those words to the athlete verbatim.
  /**
   * ⛔ THE CEILING ACCUMULATORS ARE GONE — 2026-08-12, slice a. There is no 90%-of-1RM ceiling any
   * more, so no lift can pin against one and there is nothing to name in the block header. What
   * stood here: a `ceilingLifts` set feeding `strengthFocusDescription`, and a `ceilingHits` array
   * feeding both the `kind: 'ceiling'` compromise note and the `strength_calibration` signal.
   *
   * ⚠️ The `'ceiling'` KIND SURVIVES IN THE UNION BELOW AND NOTHING EMITS IT. Left deliberately:
   * `src/lib/strength-focus-copy.ts` still filters on it, and removing the member is a client change
   * this engine-only slice does not make. Slice b retires the pair together.
   */
  // §7's gate, surfaced: a day the athlete pinned that could not be priced says so rather than
  // vanishing. Deduped — two gated days of the same discipline is one sentence, not two.
  const hardGateCompromises = [...new Set(hardGateNotes)]
    .map((text) => ({ kind: 'cost' as const, text }));
  /**
   * ⛔ THE YIELD IS DISCLOSED, ALWAYS. A session the athlete asked for that the week could not hold
   * must say so — a silent drop is the absorption failure this file has fixed three times, and it
   * is worse here because the athlete would simply not find the session they chose.
   */
  const hardYieldCompromises = [...new Set(yieldedHardDays)].map((label) => ({
    kind: 'cost' as const,
    text: `${label.replace(/^your /, 'Your ')} was left out this block: with your long run, long ride `
      + 'and the other hard day fixed, there was no day left that kept heavy legs 48h clear of the '
      + 'long run. The lifting keeps its spacing; the hard session is the one that gives way.',
  }));
  const placementCompromises: Array<{ kind: 'breach' | 'cost' | 'ceiling'; text: string }> = [
    ...solverRefusal,
    ...placedWeek.compromises.map((text) => ({ kind: 'breach' as const, text })),
    ...hardGateCompromises,
    ...hardYieldCompromises,
  ];
  // ⛔ A BLOCK-LEVEL `assistanceRows(args.assistancePicks)` STOOD HERE AND NOTHING READ IT.
  // Deleted 2026-07-28. Zero consumers, confirmed by identifier scan — the live assistance is
  // rebuilt PER CYCLE at the session loop below (`cycleAssistance`), because the anchor holds the
  // volume floor while the leaders may scale, and a block-level value cannot express that.
  //
  // ⚠️ IT SURVIVED BECAUSE `noUnusedLocals` IS OFF (`CLAUDE.md` conventions), so nothing warned.
  // Left in place, the next change to assistance placement would have landed here — the path
  // nobody reads — and passed its own tests while the athlete's plan was unchanged.
  //
  // ⚠️ Q-211's SIXTH INSTANCE, and it was found while scoping something else: computed correctly,
  // then discarded. Michael: *"Not a new bug class — a detection problem."*

  // ── Endurance underneath (unchanged from the previous composer) ────────────
  // ⛔ The band lives in `src/lib/maintenance-volume-band.ts` — the INTAKE reads the same numbers, so
  // what the athlete is told while typing and what the plan records cannot disagree. It is a
  // REFERENCE, not a cap: the D-222 ceiling was retired on purpose and must not return.
  const FALLBACK_EASY_MIN_PER_MILE = FALLBACK_EASY_MIN_PER_MILE_SHARED;

  // ⚠️ THE RUN/RIDE COUNTS ARE DERIVED ABOVE, BEFORE THE SOLVE (2026-08-08) — they are an input to
  // it now, not a consequence of it. See `askedRunDays` / `runFreq` / `easyRunsWanted` /
  // `ridesWanted` beside the anchors.
  const upperLiftDays = MAIN_LIFTS.filter((l) => !l.isLower).map(liftDay);
  // ⛔ THE Sat/Sun COERCION IS GONE (2026-07-26). It read:
  //     pickedLong = longRunDay === 'sunday' ? 'Sunday' : 'Saturday'
  // — so every day except Sunday silently became Saturday. The athlete picked from seven and got
  // one of two. That existed only because the lifting grid was fixed; with the solver placing the
  // bar around the pins, ANY day is answerable and the long run day is whatever they said.
  //
  // ⛔ AND THE DEFAULT LONG-RUN DAY MUST NOT EAT THE REST DAY (2026-08-05, found by Q-214).
  //
  // With no pin this was a hardcoded `Saturday`, chosen with no reference to where the lifts landed.
  // That worked only by luck: the solver happened to put an upper lift on Saturday, so the long run
  // STACKED onto it and Sunday stayed free for rest. The moment Q-214's press-spacing term moved that
  // upper lift off Saturday, the long run took Saturday as its own day, Sunday was occupied, and the
  // week came out with **seven active days and no rest at all**.
  //
  // ⚠️ THE STACK WAS LOAD-BEARING AND NOTHING SAID SO. This block runs four lifts plus up to four
  // runs across seven days; at three runs it is 7 sessions in 6 days, so exactly one stack is
  // REQUIRED, and the long run onto an upper lift is the cheap one (`long_run × upper_body_strength`
  // needs no recovery gap — pressing shares no prime movers with running). Treating Saturday as a
  // free-standing long-run day is what removes it.
  //
  // So: take the default day only when doing so still leaves room for the easy runs AND one rest
  // day. Otherwise put the long run on an upper-lift day and let it stack, which is what the working
  // weeks were silently doing all along.
  const defaultLong = DEFAULT_LONG_DAY;
  const easyRunsNeeded = Math.max(0, runFreq - 1); // the long run is one of `runFreq`
  // ⛔ THE LONG RUN KEEPS ITS DAY; THE EASY RUNS ARE WHAT STACK. Corrected 2026-08-05.
  //
  // A first version of this reversed the priority: when free days were tight it moved the LONG run
  // onto a lift day to leave the free days for easy runs. On the book's Mon/Tue/Thu/Fri layout that
  // put a long run on Thursday beside the bench press while Saturday and Sunday sat free — the most
  // expensive session in the week stacked to protect the cheapest two.
  //
  // ⚠️ STACKING IS NOT THE PROBLEM, WHICH SESSION STACKS IS. `long_run × upper_body_strength` is ✓
  // in the law and costs nothing mechanically. What it costs is the athlete's WEEKEND: an unpinned
  // athlete gets their longest session mid-week. The easy run carries no such expectation, and the
  // stacking fallback below already exists for it.
  //
  // ⚠️ AND IT ONLY EVER APPLIED TO THE UNPINNED CASE — `longRunPin` has always won outright.
  const pickedLong = longRunPin ?? defaultLong;
  // ⛔ ONE FULL REST DAY IS RESERVED BEFORE ANY EASY RUN IS PLACED, and this is not a detail.
  //
  // `placedWeek.freeDays` means "carries neither a lift nor a pin" — it is NOT "spare". An earlier
  // version of this line filled every free day with an easy run, which the composer's own tests
  // caught immediately: with a long-run pin the week came out as 4 lifts + the pin + easy runs on
  // both remaining days = SEVEN active days and no rest at all. The old fixed grid never had this
  // bug because it hardcoded two endurance days and stacked any extras onto upper-lift days.
  //
  // `place-week` asserts the same rule itself (MAX_ACTIVE_DAYS = 6, "six days of work, one full
  // rest day") — it simply cannot enforce it here, because it has no idea how many easy runs this
  // composer is about to add. Reserving the day is THIS file's job.
  //
  // Sunday is preferred as the rest day when it is free — convention, and it matches what the grid
  // used to guarantee. Otherwise the last free day is held back.
  //
  // ⛔ AND IT CANNOT BE THE LONG-RUN DAY (2026-08-05). This read straight off `freeDays`, so when the
  // long run took a free day and that day was also the last one, `restReserved` and `pickedLong`
  // resolved to the SAME day — the rest day was "reserved" and then had the long run authored onto
  // it, and the week came out with seven active days. It only stayed hidden because the long run
  // used to land on a day that already had a lift, which took it out of `freeDays` entirely.
  //
  // ⚠️ THE TWO ARE A PAIR AND HAVE TO BE PICKED AS ONE. `pickedLong` above already asks whether
  // taking a free day leaves room for the easy runs AND a rest day; this is the other half of that
  // question, and leaving either half out puts the week back to no rest.
  const restCandidates = placedWeek.freeDays.filter((d) => d !== pickedLong);
  const restReserved = restCandidates.includes('Sunday' as DayName)
    ? ('Sunday' as DayName)
    : (restCandidates[restCandidates.length - 1]
      // Nothing free but the long-run day — the week is genuinely full, and that is REPORTED by the
      // compromise below rather than papered over by standing the long run down.
      ?? placedWeek.freeDays[placedWeek.freeDays.length - 1]);
  // ⛔ THE REST DAY IS NO LONGER WITHHELD FROM PLACEMENT. Michael, 2026-08-05: *"if somone wants an
  // easy ride on a rest day thats fine, no apps gate — we just arent stupid."*
  //
  // ⚠️ **`restReserved` SURVIVES AS A PREFERENCE AND STOPS BEING A GATE, and the distinction is the
  // whole change.** It used to be subtracted from the pool before anything was placed, so an EMPTY
  // day sat protected while the sessions the athlete asked for were stacked onto lift days — the
  // week doubled up three days to keep one clear. Nobody asked for that trade and no commercial app
  // makes it. Empty days are now filled before any day is doubled, and the rest day is simply
  // whatever is left when the athlete's own asks are done.
  //
  // ⛔ SO REST IS AN OUTPUT, NOT A RESERVATION. An athlete who asks for little still gets days off —
  // more of them than before, because nothing is stacked to protect one. An athlete who asks for a
  // seven-day week gets one, and is told so (`restNote`). Neither is the engine's decision.
  //
  // ⚠️ `restReserved` IS STILL COMPUTED and still used for the ordering preference below — it is the
  // day the week would rather leave clear, all else equal. It just cannot veto a session any more.
  // ⛔ THE REST DAY IS A PREFERENCE THAT YIELDS — NOT A GATE, AND NOT A FREE-FOR-ALL EITHER.
  // Michael, 2026-08-05: *"if somone wants an easy ride on a rest day thats fine, no apps gate — we
  // just arent stupid."* Both halves of that sentence are rules, and they pull opposite ways:
  //
  //   "no apps gate"        -> a session the athlete asked for is NEVER dropped to protect a day off.
  //   "we just arent stupid" -> and a day off is not spent when a stacked day would have saved it.
  //
  // So the day is held back HERE, at first pass, and released at the end of each pass only if the
  // week genuinely could not hold the ask any other way (`easyRunDays` / `rideDays` last resorts).
  // Stacking onto a lift day is tried FIRST, because it is legal, cheap, and costs nothing the
  // athlete asked for.
  //
  // ⚠️ I BUILT THIS THE OTHER WAY FIRST — pool including the rest day, empty days filled before
  // anything doubles up — and it was wrong twice over: a run-only athlete who asked for 3 runs got
  // 4 (this exclusion had been silently acting as the count cap), and an athlete asking 2 runs + 2
  // rides lost their rest day to avoid a single stacked day they would happily have taken.
  /**
   * ⛔ THE EASY DAYS COME OUT OF THE SOLVE. Everything that used to stand here — the `easyDayPool`,
   * the run/ride alternator, the stack-onto-a-lift-day fallbacks, the rest-day-yields-last-resort
   * ladder — was ONE PASS'S ANSWER to a question the solver now answers for the whole week at once.
   *
   * ⛔ WHAT WAS DELETED AND WHY IT IS NOT A LOSS, item by item:
   *   • **the alternator** (run · ride · run · ride across free days in calendar order) existed
   *     because *"the run pass runs first and took EVERY free day"*. There is no pass order any
   *     more; both kinds are placed against the same settled week and the same spread score.
   *   • **the stack-onto-a-lift-day fallbacks** are the solver's own behaviour — `sameDayLegal`
   *     admits `easy_run × upper_body_strength` and `easy_run × lower_body_strength`, and its
   *     scoring stacks only when the week cannot hold the sessions otherwise.
   *   • **`HEAVY_LEG_STACK_PENALTY` and the `easyRunAnchorAdjacencyPenalty` ranking** were this
   *     file's private re-statement of "prefer a clean day, and prefer distance from the anchors".
   *     `chooseSpreadDays` outranks both: it scores the WHOLE SUBSET rather than one day at a time,
   *     which is the case the old ranking provably could not see (`assign-days.ts` wrote it down —
   *     *"Monday/Wednesday/Friday was available the whole time and unreachable one step at a time"*).
   *   • **the rest day** is `MAX_ACTIVE_DAYS_DEFAULT` inside the solver, with `no_rest_day` as an
   *     explicit relaxation rung — the same "held back, yielded only if the week genuinely cannot
   *     hold the ask" semantics, enforced in one place instead of four.
   *
   * ⚠️ WHAT DID NOT MOVE: the COUNTS. `easyRunsWanted` / `ridesWanted` are still this composer's,
   * still derived from the athlete's answers, and still reported when the week cannot seat them.
   * The solver was given a placement job, not a dosing one.
   */
  const solvedFlexible = solved.status === 'unsolvable' ? [] : solved.week.flexible;
  const capDay = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
  const easyRunDays: string[] = solvedFlexible
    .filter((f) => f.kind === 'easy_run')
    .map((f) => capDay(f.day));
  const solvedRideDays: string[] = solvedFlexible
    .filter((f) => f.kind === 'easy_bike')
    .map((f) => capDay(f.day));

  // Long-run day first (it is a pin, so it is not in `freeDays`), then whatever room is left.
  /**
   * ⛔ A MAINTENANCE SPORT HAS NO LONG DAY, SO IT DOES NOT GET ONE HERE EITHER (2026-08-08).
   *
   * This read `[pickedLong, ...easyRunDays]` unconditionally, and `pickedLong` falls back to
   * `DEFAULT_LONG_DAY` whether or not the athlete pinned anything — so a run held at maintenance came
   * out with THREE days (two easy plus a default long) against a cap of two. The count the priority
   * model computed and the count the week authored disagreed, silently, in the athlete's favour by
   * one session.
   *
   * ⚠️ A PINNED long day still counts: `runHasLongDay` is true whenever the athlete named one, so
   * their choice is honoured at maintenance too — it is only the ENGINE'S default that is withheld.
   */
  const enduranceDays: string[] = runHasLongDay ? [pickedLong, ...easyRunDays] : [...easyRunDays];
  const runDayList: string[] = [...enduranceDays];
  // ⛔ THE HARD DAY IS ALREADY A RUN. Fixed 2026-07-27, surfaced the moment the solver started
  // stacking onto the hard-run day: an upper lift landed on Tuesday, Tuesday was therefore an
  // "upper lift day", and an easy run was added to it — on top of the hill session already there.
  // Two running sessions on one day, one of them the week's only hard one.
  //
  // ⚠️ The bug was always here; it needed a week where an upper lift and the hard pin shared a day
  // to become reachable, and `place-week` never produced one because it stacked onto the earliest
  // legal day instead of the smallest.
  // ⛔ EVERY HARD DAY, NOT THE HARD DAY (§1i). Was a single `hardPinDay` string.
  const hardPinDays = new Set<string>(hardDays.map((h) => String(h.day)));

  // ⛔ EVERY LIFT DAY IS A CANDIDATE, NOT ONLY THE UPPER ONES. Changed 2026-07-28, Michael's call.
  //
  // Easy work was restricted to upper lift days with NO stated reason, and that one rule closed
  // Wednesday and Friday from both ends: an athlete asking for two rides got one, and the easy run
  // was forced onto Monday — the day after the long run AND the day before the hard run.
  //
  // The law permits it: `easy_run × lower_body_strength` is ✓, and `STRENGTH-PROTOCOL §6.2` RECOMMENDS
  // it — lower first, 6h gap, the easy run as a recovery flush. The cell was deliberately flipped to
  // ✓ in May 2026 for exactly that use, and this exclusion had been silently overriding it since.
  //
  // ⚠️ RANKED, NOT FIRST-AVAILABLE. Opening the days is only half of it: the composer had no spacing
  // term, so it would simply take the earliest newly-legal day. `easyRunAnchorAdjacencyPenalty` is
  // the optimizer's own measure — +4 beside the quality run, +4 beside the long run — and it is used
  // rather than reinvented, because a second ranking beside the law is the thing this whole arc has
  // been removing.
  // ⛔ A HEAVY-LEG DAY IS THE LAST RESORT, NOT A COIN FLIP WITH AN UPPER DAY (2026-07-28).
  //
  // `easyRunAnchorAdjacencyPenalty` takes three arguments and ALL THREE ARE RUNS — the day, the
  // quality run, the long run. It prices run-to-run spacing and knows nothing about lifts. So the
  // overflow run was landing on whichever lift day sat furthest from the two run pins, which in a
  // Sun-long / Thu-hard week is the SQUAT day: Tuesday scores 0, Monday scores 4 for sitting beside
  // the long run. The engine put an easy run on the developing lift to buy a day of run spacing.
  //
  // ⛔ THE LAW ALREADY DRAWS THIS LINE. `stackNeedsRecoveryGap` is true only when both sessions have
  // `leg` prime movers — an easy run beside a BENCH shares nothing and the matrix asks for no gap at
  // all, while an easy run beside a SQUAT is the same legs twice and the law asks for six hours.
  // The session copy has said so for weeks ("they share no prime movers" vs "leave 6h"); only the
  // CHOICE of day was blind to it.
  //
  // ⚠️ CORRECTED 2026-07-29 — THE MAGNITUDE WAS JUSTIFIED BY A NUMBER THAT DOES NOT APPLY HERE.
  //
  // It was set ABOVE the anchor term's ceiling, making the ordering categorical, and the reason
  // given was Robineau 2016 (+16.8% at 0h vs +31.2% at 6h). ⛔ But Robineau's 0h arm stacked lifting
  // with HARD endurance. This is an EASY run. The comment at the stack note in this same file says
  // so in terms and says not to attach that citation without a trial that tested lifting + easy
  // work on one day — and there isn't one.
  //
  // ⛔ AND STACKING IS NORMAL, NOT A COMPROMISE. Wendler's concurrent template is main lift ->
  // assistance -> conditioning IN THE SAME SESSION, zero gap (p87), and p75 says he does not care
  // whether conditioning lands on a lifting day. A categorical penalty was the engine avoiding
  // something the protocol prescribes.
  //
  // ✅ WHAT SURVIVES IS THE DIRECTION, NOT THE SIZE. All else equal an easy run on a press day
  // competes with nothing, and on a squat day it shares the legs — `stackNeedsRecoveryGap` is the
  // law's own answer to which pairs compete. So it stays a PREFERENCE, weighted the same as one
  // anchor adjacency rather than above every one of them: it breaks a tie, it does not override.
  //
  // ⚠️ Modality does not rescue it either way. Wilson 2012 says cycling is free, Schumann 2022
  // (larger, better controlled) finds no modality moderation at all, and Sabag 2018 points the other
  // way for lower-body strength specifically. The register's standing instruction is not to build a
  // new claim on that split.
  /**
   * ⛔ THE TOP-UP RANKING IS GONE — the solve already seated every easy run it could (2026-08-08).
   *
   * What stood here was a second scorer: `easyRunAnchorAdjacencyPenalty` + a `HEAVY_LEG_STACK_PENALTY`
   * tie-break, used to pick extra lift days to stack runs onto once the free days ran out. Both
   * inputs are now inside the one solve — the law decides which days are legal (an easy run beside a
   * bench shares no prime movers; beside a squat it is the same legs twice) and `chooseSpreadDays`
   * ranks what is left by the shape of the whole week.
   *
   * ⚠️ A SHORTFALL IS STILL POSSIBLE AND IS STILL REPORTED. `solveWithFlexible` reduces the ask one
   * session at a time when the week genuinely cannot hold it; the note below is what says so.
   */
  const runShortfall = Math.max(0, easyRunsWanted - easyRunDays.length);

  const longRunDay = pickedLong;

  const runMinutesByDay: Record<string, number> = {};
  let volume_notes: string | null = null;
  let volume_state: 'above' | 'below' | 'in_band' | null = null;
  // ⛔ SELECTION, NOT PRIMACY (2026-08-08). This read `enduranceSport === 'run'`, so a bike-primary
  // athlete's typed miles were never turned into minutes and every run they asked for came out
  // unsized — which is why the run pass below could drop them without anything noticing.
  if (runSelected && (args.targetWeeklyMiles ?? 0) > 0 && runDayList.length > 0) {
    const paceKnown = (args.easyPaceMinPerMile ?? 0) > 0;
    const pace = paceKnown ? args.easyPaceMinPerMile! : FALLBACK_EASY_MIN_PER_MILE;
    // Soft reference band — NOT a clamp. HONOR the athlete's typed miles; surface the tradeoff
    // client-side (volume_state), never cap or bump. Easy-intensity guardrail stays.
    const asked = Math.round(args.targetWeeklyMiles!);
    const held = Math.max(1, asked);
    volume_state = volumeStateForMiles(asked, pace);
    if (!paceKnown) {
      volume_notes = `Run durations estimated at ${FALLBACK_EASY_MIN_PER_MILE}:00/mi until we learn your easy pace — they re-map once you log a few easy runs.`;
    }
    // ⛔ THE HARD SESSION IS PART OF THE WEEK'S MILEAGE, NOT AN EXTRA ON TOP (2026-07-28).
    //
    // The hill session is a RUN. It counted toward the athlete's run-day COUNT and not toward their
    // MILES, so every plan built their typed number and then added the hills after — measured at
    // exactly +3.5 miles on a 13-mile ask, a 20-mile ask and a 30-mile ask alike. An athlete asking
    // to hold 13 miles was handed 16.5, which is a 27% overage on the discipline this block is
    // supposed to be holding STEADY while strength leads.
    //
    // ⚠️ AND IT COMPOUNDED. The remaining miles were then split across `runDayList`, which excludes
    // the hard day — so the same 13 miles landed on fewer runs. At 2 run days that produced a single
    // 130-minute, 13-mile long run: the entire week in one session, in a maintenance block.
    //
    // ⛔ THE HILLS DO NOT SHRINK TO FIT. Its duration is fixed because it is the protected intensity
    // (Hickson: intensity holds VO2max, frequency and duration are the expendable variables). So the
    // budget subtracts it and distributes what remains — the hard session is paid first, and the
    // easy volume flexes around it, which is the yield order the doctrine already states.
    // ⚠️ THE MINUTES COME FROM THE TERRAIN, NOT FROM `HILL_SESSION_MIN` (2026-08-06). The four run
    // options are 35, 37 and 39 minutes; subtracting a flat 35 for all of them hands the difference
    // back as easy miles every week, which is the +3.5 mi bug above in miniature. One owner:
    // `hardRunSessionMinutes`.
    // ⛔ SUMMED ACROSS EVERY HARD RUN (§1i). This read one terrain off one hard day; with two hard
    // runs it would have subtracted one session's minutes and handed the other's back as easy miles
    // — the same +3.5 mi defect the terrain fix above closed, reopened by the second slot.
    // ⚠️ EACH ONE PAYS ITS OWN TERRAIN. A hill session and a flat session are different lengths.
    // ⛔ EACH HARD RUN COSTS WHAT ITS OWN SESSION COSTS (§7). This summed `hardRunSessionMinutes`
    // for every hard run — right while they were all hill sessions, and wrong the moment the second
    // one became a THRESHOLD run, which is a different length. Under-subtracting hands the
    // difference back as easy miles every week, silently.
    const hardRunMiles = hardRunDays().reduce(
      (mi, h) => mi + hardRunMinutesForRole(roleOf(h.day), h.terrain) / pace, 0);
    const easyBudget = Math.max(1, held - hardRunMiles);
    // ⛔ ABOVE THE SELF-REGULATION LINE THE ENGINE STOPS SHAPING THE WEEK (2026-07-29).
    //
    // Michael: *"we dont do the math — you pick your long day, your hard day if you want it, and we
    // put strength in the right places."*
    //
    // ⛔ WHY, AND IT IS A MEASURED DEFECT NOT A PREFERENCE. `distributeRunMiles` weights the EASY
    // budget, and `runDayList` excludes the hard day — so a "4 run day" week is really a 3-way split
    // at 1.5/1.0/0.85 and the long run takes 45% of the budget. Measured at 40 miles: a 16-mile long
    // run, 40% of the week. At 3 run days it is a 2-way split and the long run takes 58% — 21 miles,
    // 3h09, past both ceilings the field uses. Daniels caps the long run at 25–30% of weekly mileage
    // with a 2:30–3:00 time limit; strength-led hybrid programmes run the long session 60–90 min.
    // The weights are roughly double any published guidance, and the denominator is wrong on top.
    //
    // ✅ SO ABOVE THE LINE THE SHARE IS EVEN. The engine still names WHICH day is long — that is the
    // athlete's pick and the solver needs the kind to place the lifting around it — it just stops
    // deciding how much bigger it is. Below the line the weighting stands: a 12-mile-a-week runner
    // asking for a long run and getting four equal jogs is a worse answer, and 45% of a small budget
    // is not the same defect.
    //
    // ⚠️ 25 IS A PRODUCT DECISION AND HAS NO PAPER UNDER IT. Nothing in the literature says at what
    // volume a runner can self-regulate; it is a judgement that somebody holding 25+ miles has a
    // routine. It is NOT a cap — the athlete's typed miles are still honoured in full, which is D-222's
    // retirement (`maintenance-volume-band.ts`: a ceiling was built once and must never come back).
    const selfRegulated = asked >= SELF_REGULATED_MILES;
    const perMile = selfRegulated
      ? Array.from({ length: runDayList.length }, () => easyBudget / runDayList.length)
      : distributeRunMiles(easyBudget, runDayList.length);
    // ⛔ THE SPLIT MUST NOT NAME A DAY THE WEEK DOES NOT RUN ON (2026-08-08). This prepended
    // `longRunDay` unconditionally; once a maintenance run stopped getting a default long day, that
    // day was no longer in `runDayList` and a full share of the athlete's miles was written to a
    // weekday carrying no run. Measured: 12 mi asked came out as 10.1 mi built — the missing 1.9
    // assigned to a Saturday that had a long ride on it and no run at all.
    const daysLongFirst = runDayList.includes(longRunDay)
      ? [longRunDay, ...runDayList.filter((d) => d !== longRunDay)]
      : [...runDayList];
    daysLongFirst.forEach((day, i) => {
      const mi = perMile[i] ?? perMile[perMile.length - 1];
      runMinutesByDay[day] = Math.max(15, Math.round(mi * pace));
    });
    // ⛔ THE NOTE IS THE WHOLE POINT OF THE MODE, so it cannot be silently dropped when the pace note
    // already claimed the channel. Both facts travel.
    if (selfRegulated) {
      volume_notes = [volume_notes, SELF_REGULATED_NOTE].filter(Boolean).join(' ');
    }
  }

  /**
   * ⛔ THE ENDURANCE TIER, RESOLVED ONCE, HERE, BEFORE A SINGLE ACCESSORY REP IS AUTHORED
   * (Michael, 2026-08-17). Spec: `docs/SPEC-viada-ingestion-order.md`.
   *
   * ⛔ THE ORDER IS THE POINT, NOT THE LOOKUP. Endurance volume is the physiological BANDWIDTH and
   * strength adaptation is what fits inside it, so the tier is settled before the materializer runs
   * rather than consulted while it runs. It was asked PER SLOT — `assistanceTotalReps` re-derived
   * the band from a hard-day count on every call — which let three call sites hold three opinions of
   * which tier the athlete is in.
   *
   * ⚠️ HOURS ARE RUN + RIDE. Swim is DELIBERATELY not summed in: only `swimDays` exists, the
   * courtesy session is a booked hour the app does not coach, and inventing a duration to make the
   * arithmetic look complete is the kind of number this codebase deletes. It enters as the swim
   * GATE below instead, which is the axis it actually has.
   *
   * ⚠️ AND UNDEFINED IS NOT ZERO. An athlete with no volume figure lands in `survival`, not
   * `strength` — §0h: unknown is "we have not asked", never "they do nothing".
   */
  const weeklyRunHours = Number(args.targetWeeklyMiles) > 0 && Number(args.easyPaceMinPerMile) > 0
    ? (Number(args.targetWeeklyMiles) * Number(args.easyPaceMinPerMile)) / 60
    : null;
  const weeklyRideHours = Number(args.bike?.hours) > 0
    ? Number(args.bike!.hours)
    : (Number(args.targetWeeklyRideHours) > 0 ? Number(args.targetWeeklyRideHours) : null);
  /**
   * ⛔ ZERO IS KNOWABLE AND `null` IS NOT THE SAME ANSWER. An athlete with `enduranceSport: null`
   * and no bike is a STRENGTH-ONLY block — that is a measured zero, and reading it as "we have not
   * asked" drops them into `survival` and strips the accessory ceiling from precisely the athlete
   * Tier 3 exists for. `null` is reserved for the genuinely unknown: a declared runner whose weekly
   * miles never arrived.
   */
  const enduranceDeclared = args.enduranceSport != null || !!args.bike
    || Number(args.targetWeeklyRideHours) > 0;
  const totalEnduranceHours = !enduranceDeclared
    ? 0
    : (weeklyRunHours == null && weeklyRideHours == null
        ? null
        : (weeklyRunHours ?? 0) + (weeklyRideHours ?? 0));

  const enduranceTier = resolveEnduranceTier({
    // ⚠️ EVERY hard day, club included — a club ride costs the same recovery as one the app wrote.
    hardDays: hardDays.length,
    totalHours: totalEnduranceHours,
  });
  /** ⛔ ANY swimming at all, never a yardage — see `AssistanceScaleInputs.swimming`. */
  const isSwimming = (args.swimDays ?? 0) > 0;

  // ── The weeks ─────────────────────────────────────────────────────────────
  const sessions_by_week: Record<string, PlanSession[]> = {};

  // ⛔ ONE MAP FOR THE WHOLE BLOCK (2026-08-15, §1c). The loop used to ask `cycleForWeek(week)` and
  // derive everything from `weekInCycle === 4`; the block now contains weeks that belong to no cycle
  // at all, so the shape is read off the map rather than computed from a week number.
  const weekMap = buildWeekMap(weeks);

  for (const bw of weekMap) {
    const week = bw.week;
    const isTmTest = bw.kind === 'tm_test';
    const isDeload = bw.kind === 'deload_single';
    /** ⚠️ A STANDALONE WEEK — either shape. Light band, light jumps, no supplemental, no ramp. */
    const isStandalone = bw.kind !== 'cycle';
    const cycleKind: CycleKind = bw.cycleKind ?? 'leader';
    const weekInCycle = bw.weekInCycle ?? 1;
    // ⛔ THE WEEK-3 TEST SPLIT IS GONE — REMOVED 2026-08-05, MICHAEL'S CALL. DO NOT REBUILD IT.
    //
    // Week 3 of every cycle used to break the 3-day shape onto FOUR days so each 95% set was read
    // on a fresh lift. It existed for one reason: a fear that a fatigued AMRAP would mis-set the
    // next cycle's weights.
    //
    // ⛔ THAT FEAR DOES NOT SURVIVE THE TRACE. `applyVerdict` steps the working number by a FIXED
    // increment — `cappedCycleIncrementLb`, Wendler's +5 upper / +10 lower — and the AMRAP produces
    // only a VERDICT from the reps hit against the prescription (`verdictFrom95Set`: the single at
    // 95% completed or not). **The next weight is never computed from an estimated max off that
    // set.** The e1RM is used for the ceiling and for a trust label, nowhere else. So a fatigued
    // second lift cannot bias the weight; it can only miss the rep target, which is the book's own
    // reset trigger and is true on any day.
    //
    // ⚠️ AND IT COST SOMETHING REAL: a "3-day" plan that silently ran four days every third week.
    const isTestWeek = false;
    // Week 3 of every cycle is the 95% set — Wendler's own validity check (SPEC §1). Nothing here
    // marks it: the sets themselves carry it (95% of the working number, and in the anchor the top
    // set is open). The reading of that set is the transition gate's job, not the composer's.
    const phaseName = bw.kind === 'cycle' ? PHASE_NAME[cycleKind] : PHASE_NAME[bw.kind];
    // ⛔ WHAT THE ASSISTANCE AND THE JUMPS SCALE OFF — Forever p.18, and it is NOT the same axis as
    // the cycle kind. A light standalone week is neither a leader nor an anchor: it takes the
    // lightest band and the lightest jump dose. `cycleKind` still owns the MAIN LIFT's scheme.
    const assistancePhase: AssistancePhase = isStandalone ? 'seventh' : cycleKind;
    const weekSessions: PlanSession[] = [];

    for (const lift of MAIN_LIFTS) {
      // ⛔ THE ADVANCE IS NOW EARNABLE. `workingNumberForCycle` steps +5 upper / +10 lower by CYCLE
      // INDEX and reads nothing else — miss every rep in cycle one and the bar still climbs in cycle
      // two, and again in the next block. That is what makes the strength gauge circular: the plan
      // raises the bar by calendar, the AMRAP measures the bar it just raised, and that number is
      // written back as the athlete's 1RM (D-326 layer 2).
      //
      // Wendler's own rule is `verdictFrom95Set` — five reps at 95% or the number comes down 10% —
      // written, correct, and called by NOTHING until now.
      //
      // ⚠️ BEHAVIOUR IS UNCHANGED WITHOUT VERDICTS. With none supplied every cycle resolves to
      // `advance`, which is exactly `workingNumberForCycle`. This is the seam (Constitution Law 6:
      // a load-bearing change ships behind a behaviour-unchanged proof), not the reader — the reader
      // needs LOGGED reps, so it cannot live in a composer that authors all twelve weeks up front.
      // ⚠️ `bw.workingNumberCycle`, NOT A CYCLE INDEX DERIVED FROM THE WEEK. A standalone week sits
      // between cycles and has no index of its own; the map answers which cycle's number it runs on
      // (the one before it — a 7th week unloads the number just used, the closing test tests the
      // number the block arrived at, the opening test tests the one cycle 1 is about to use).
      const wnResult = workingNumberForCycles(
        training_max[lift.ref], bw.workingNumberCycle, lift.isLower, args.cycleVerdicts?.[lift.ref],
        {
          // ⛔ NO `oneRM` ANY MORE (2026-08-12, slice a). The 90%-of-1RM ceiling it fed is deleted:
          // Wendler's brake is a missed prescription, not a number on file (p30), and that ceiling
          // was what froze a light lift into byte-identical cycles. The brake is now
          // `STALL_CONFIRM_SESSIONS` — hold on the first miss, drop 10% on the confirmed second.
          // ⛔ FORECAST, AND THIS IS THE ONLY PLACE ALLOWED TO SAY SO. Building a block projects
          // three cycles into weeks that have not happened, so no verdict CAN exist for them and
          // `hold` would show identical weights in cycles 1, 2 and 3. Regeneration and adaptation
          // must not pass this — there, an absent verdict means nothing was logged.
          unknownMeans: 'advance' as const,
        },
      );
      const wn = wnResult.workingNumber;
      // ⚠️ `wnResult.resetAtCycle` IS NOT READ HERE, AND THAT IS CORRECT FOR A FRESH BLOCK: every
      // verdict in a forecast is `advance`, so no confirmed stall can exist at build time. It is
      // slice b's input, off the REBUILD path where real verdicts arrive.
      // ⛔ THE WEEK'S SETS COME FROM ITS SHAPE. A cycle week is the warm-up ramp (Wendler p.31)
      // prepended to `setsForWeek`; a standalone week is its own four-set list opening at 70%, which
      // IS its ramp — so `warmupSetsForWeek` is not called for it (see the note on that function).
      const weekSets: WendlerSet[] = isTmTest
        ? tmTestSets()
        : isDeload
          ? deloadSingleSets()
          : [...warmupSetsForWeek(weekInCycle), ...setsForWeek(cycleKind, weekInCycle)];
      const main = mainLiftRow(
        lift,
        wn,
        oneRepMaxes[lift.ref],
        weekSets,
        // ⚠️ THE BAR FLOOR APPLIES TO BOTH STANDALONE SHAPES, not just the old deload. The reason is
        // the same one 2026-08-13 gave for the deload: these weeks have no warm-up ramp in front, so
        // a light working number authors an opening set no barbell can weigh (70% of an 80 lb press
        // is 56 — fine; 70% of a 60 lb press is 42, which is under the bar). Recovery volume takes
        // the floor the ramp would have taken.
        isStandalone,
        // Per lift: 45 when the lift's normal weeks clear the bar naturally, 35 for a lighter lift
        // — whose sub-45 sets the plan description flags as women's-bar work (2026-08-13).
        barFloorForWorkingNumber(wn),
      );
      // ⛔ THE LINE THAT STOOD HERE — "jumps and assistance are dropped on the deload" — WAS A GHOST.
      // It described a code path that went away when cycles stopped containing deload weeks, it was
      // contradicted twenty lines further down by the 2026-08-15 block that kept them, and the built
      // plan carried full assistance and full jumps through weeks 4, 8 and 12. Deleted 2026-08-17
      // with the real scaling — see `RECOVERY_ASSISTANCE_SCALE`.
      // ⛔ JUMPS ARE LOWER-BODY WORK AND ONLY GO ON LOWER DAYS. Fixed 2026-07-27.
      //
      // `Box Jump 3×5` was added to EVERY lifting session, bench and overhead press included — a
      // lower-body plyometric, the highest loading-rate item in the block, on days the engine
      // classifies as `upper`. And `upper` is not a label here, it is a LOAD CLAIM that five
      // separate things read:
      //   1. the solver's 48h heavy↔heavy clock and its 48h/24h clocks against the long run and
      //      hard day — all computed as if these days carry no leg load
      //   2. `heavyLowerDays`, which decides whether the hill session's descents are walked
      //   3. `upperLiftDays`, which decides where easy runs may stack
      //   4. `stackNeedsRecoveryGap`, which produced the line "they share no prime movers, so back
      //      to back is fine" — printed on a day carrying fifteen jump landings before hill repeats.
      //      **False as printed.**
      //   5. the session's own `upper`/`lower` tag
      //
      // Same shape as the long-run label: identity read off a NAME (the main lift) instead of
      // derived from what the session actually contains. The fix makes the claim true rather than
      // re-classifying the day — legs are free on upper days because nothing leg-loaded is there.
      //
      // ⚠️ HIP THRUSTS STAY. Concentric-dominant, no landing, no eccentric transient — they do not
      // reach the next day and they are not the same question.
      //
      // ⚠️ WENDLER PRESCRIBES A PRIMER BEFORE EVERY SESSION — jumps on lower days, medicine-ball
      // THROWS on upper days. Dropping jumps from upper days without substituting throws leaves the
      // upper sessions without their primer. That is a deliberate omission, not an oversight: a
      // throw needs a medicine ball and a wall, and the intake has never asked for either. Flagged
      // rather than assumed.
      // ⚠️ REBUILT PER WEEK, not once per block — the phase decides the band (Forever p.18: leaders
      // carry LESS assistance than anchors, which is the reverse of what this used to do).
      const cycleAssistance = assistanceRows(args.assistancePicks, week, {
        pullupMaxReps: args.pullupMaxReps,
        strengthPosture: args.blockShape?.strengthPosture,
        // ⛔ COMPETING STRESS, NOT THE CYCLE PHASE (2026-08-16, §1g). The band is set by how much
        // hard endurance the week carries; the phase no longer touches the assistance total.
        // ⛔ AND IT IS THE HOISTED TIER NOW, NOT A COUNT RE-DERIVED HERE (2026-08-17). The tier is
        // the only one of the two that has seen the total HOURS — a 10-hour Zone 2 week with zero
        // hard days is a survival week and a hard-day count alone reads it as a strength block.
        tier: enduranceTier,
        swimming: isSwimming,
        // ⚠️ CARRIED AS THE FALLBACK ONLY. `bandFor` prefers the tier whenever one is present; this
        // keeps a caller that has not been hoisted behaving exactly as it did.
        hardEnduranceDays: hardDays.length,
      }, lift.name, args.oneRepMaxes, args.athleteEquipment,
        isTmTest
          ? RECOVERY_ASSISTANCE_SCALE.tm_test
          : isDeload
            ? RECOVERY_ASSISTANCE_SCALE.deload
            : RECOVERY_ASSISTANCE_SCALE.cycle);
      /**
       * ⛔ NO JUMPS ON THE TM TEST WEEK (Michael, 2026-08-17). A box jump is the highest loading-rate
       * item in the block and the week's whole job is to measure a max, not to build fatigue in
       * front of one. The 7th weeks KEEP theirs — p.22's tables print 10, and halving a set count is
       * not the same question as halving a rep total.
       */
      const jumps = isTmTest ? null : jumpsFor(assistancePhase);
      // ⛔ A STANDALONE WEEK KEEPS ITS JUMPS AND ITS ASSISTANCE — CHANGED 2026-08-15 (§1a/§1c).
      //
      // The old week-4 deload was the main lift ALONE, on the reasoning that a deload is a volume cut
      // rather than a lighter version of the same session [Bosquet 2007, Wang 2023]. **Forever's
      // standalone weeks are not that.** p.22's tables carry 10 jumps and p.23 carries 25-50 reps per
      // assistance slot on the 7th week — the cut is in the MAIN LIFT's volume and in the band, not
      // in the session's structure. Cutting the accessories entirely also removed the one week where
      // the athlete has the freshness to do them well.
      //
      // ⚠️ p.23 ALSO ASKS FOR LESS INTENSIVE MOVEMENTS on these weeks (his example: dips → pushdowns),
      // AND THE ENGINE DOES NOT SWAP THEM. Overriding the athlete's own pick is the re-roling model
      // D-407/D-423 retired, and re-introducing it for one week in six would bring back the sentence
      // explaining why they are not getting what they chose. The guidance travels as COPY instead —
      // see `standaloneNote`. Flagged as a deliberate deviation, not an omission.
      // ⛔ THE SUPPLEMENTAL — FSL 5×5, LEADER WEEKS ONLY (§1e, Forever p.40/p.45). Between the main
      // lift and the assistance, which is where Wendler puts it and where the fatigue belongs: the
      // heavy work is already done, and the accessories come after.
      const fsl = (!isStandalone && cycleKind === 'leader')
        ? fslRow(lift, wn, oneRepMaxes[lift.ref], weekSets, barFloorForWorkingNumber(wn))
        : null;
      const ex: StrengthExercise[] = [
        ...(lift.isLower && jumps ? [jumps] : []),
        main,
        ...(fsl ? [fsl] : []),
        ...cycleAssistance.rows,
      ];
      // What the PROSE may name: the work this stage prescribes and no later stage rewrites.
      const prescribedLabels = [...(lift.isLower && jumps ? [jumps] : []), main, ...(fsl ? [fsl] : [])];
        // ⛔ THE ANCHOR TOP SET IS A REP-OUT, AND THE PRESCRIPTION READS LIKE A TARGET.
      //
      // Week 11 prescribes `125×1+`. The number after the plus is the entire point — but "1+"
      // invites stopping at two, and the validity gate reads the reps at 95% to decide the next
      // cycle: five or more advances, fewer RESETS the training max by 10%. An athlete who
      // benched 120×5 three weeks earlier has a 4-6 rep set in front of them, follows the card as
      // written, stops at 2, and the engine cuts their bar for it.
      //
      // ⚠️ THE COPY IS THE BUG, NOT THE LOAD. The percentages are exactly Wendler's and the ramp
      // is correct. What was missing is that the "+" is a floor, not a ceiling, and that the reps
      // are the measurement the cycle exists for. Same for week 10's `3+`, which only reads as
      // less than week 7's five because the plus renders as a target.
      const amrapNote = (!isStandalone && cycleKind === 'anchor')
        ? ` The last set is an all-out set: the number before the plus is the MINIMUM, not the target. ` +
          `Take it to a hard stop with a rep left, and log every rep — what you get here is what sets the next cycle's weights.`
        : '';
      // ⛔ THE SUPPLEMENTAL SAYS WHAT IT IS AND WHERE THE WEIGHT CAME FROM (§1e). Five sets of five
      // at a weight the athlete already lifted once this session reads as a mistake unless the
      // sentence says otherwise — it is the same bar, put back on, which is the point of it.
      // ⚠️ COPY-VOICE: states the fact and the conditional consequence, no imperative.
      const fslNote = fsl
        ? ` The five sets after the main work are the same lift at its opening weight — ` +
          `building volume without adding load. Stopping short of the last set costs the volume, not the session.`
        : '';
      // ⛔ THE TWO STANDALONE WEEKS SAY WHAT THEY ARE, IN THE PLAN'S OWN VOICE.
      //
      // ⚠️ COPY-VOICE: no imperatives, conditional consequences, no jargon. "Training max" is the one
      // term kept — it is the number the athlete sees on every card in the block, and a euphemism for
      // it here would be a second vocabulary for the same fact.
      //
      // ⛔ THE TEST WEEK'S LINE CARRIES THE STOP RULE AND THE PASS BAR TOGETHER, because the athlete
      // reads them in the same breath and a "+" with no ceiling on a set at the training max is the
      // one place in this block where chasing reps has a real cost.
      const standaloneNote = isTmTest
        ? ` This week measures rather than builds. The last set is at your training max: ` +
          `${TM_TEST_PASS_REPS} strong reps and it goes back on the rack — there is nothing to gain past ` +
          `that, and the count is what decides the next block's number. Fewer than three and the number ` +
          `comes down to match what the set showed.`
        : isDeload
          ? ` A light week between blocks. The sets come off the same training max and stop where they ` +
            `stop — the single at the top is one rep, not an open set. Assistance movements that go ` +
            `easier on the joints suit this week; the plan does not swap your picks for you.`
          : '';
      weekSessions.push({
        // ⛔ The SOLVER's day, not the grid's. `liftDay()` falls back to `lift.day` only if
        // place-week omitted this lift, so a placement failure degrades to the old fixed week
        // rather than to a session with no day.
        // ⚠️ AND THE TEST WEEK USES ITS OWN LAYOUT (3-day mode): week 3 of every cycle splits the
        // paired upper day so every AMRAP is read fresh. Identical to `liftDay` at four days.
        day: liftDayIn(lift, isTestWeek),
        type: 'strength',
        name: `Strength — ${lift.name}`,
        // The assistance guidance rides with the session, once, on the weeks that carry assistance.
        // Without it "25 reps" reads as a target to chase, and chasing it costs the next main lift.
        // ⛔ THE SUBSTITUTION IS NAMED, NEVER SILENT (§5.2b). Absent on days nothing was replaced —
        // omitted entirely rather than printed as a no-op, the same rule the ceiling paragraph
        // follows. And it NAMES the pick, because "something else is here" reads as the app
        // ignoring the athlete's choice rather than reading it.
        //
        // ⛔ THE PROSE NAMES THE PRESCRIBED WORK ONLY — jumps and the main lift. It does NOT name the
        // assistance movements, and that is the fix for a real defect rather than a style choice.
        //
        // `materialize-plan:1109` substitutes assistance by EQUIPMENT — a face pull becomes
        // `Band Face Pulls` for an athlete with bands and no cable — and it rewrites the exercise
        // ROWS while this description, authored a stage earlier, keeps the pre-substitution name.
        // The athlete then reads `Face Pull` in the sentence and `Band Face Pulls` in the list of
        // the same session. One movement, two names, one card.
        //
        // ⚠️ THE DEFECT IS OLDER THAN THE COLLISION RULE BUT THE COLLISION RULE IS WHY IT BITES.
        // The substitution triggers on `face pull` / `dumbbell` / `db ` / `cable` / `leg curl`;
        // before Q-212 you had to pick a dumbbell option while owning no dumbbells to reach it.
        // Routing the push slot to a face pull put it on EVERY press day.
        //
        // ✅ ONE SOURCE PER CLAIM: `strength_exercises` is the owner of what the movements are, and
        // it is already what Garmin builds its steps from (`send-workout-to-garmin:770`) and what
        // the exercise list renders. The prose was a second copy that a later stage could not reach.
        // ⚠️ The collision note is UNAFFECTED and stays — it names the athlete's PICK, not the
        // replacement, so no later stage rewrites it.
        //
        // ⛔ THE CLASS IS NOT FIXED, ONLY THIS INSTANCE. The invariant is *no stage rewrites a name
        // another stage has already rendered*. Today the main lifts are safe only because none of
        // them matches that trigger list — by coincidence of the list, not by design. See Q-216.
        description: `${prescribedLabels.map(exerciseLabel).join(' · ')}. ${ASSISTANCE_GUIDANCE}${
          cycleAssistance.note ? ` ${cycleAssistance.note}` : ''}${amrapNote}${fslNote}${standaloneNote}${stackNoteFor(lift)}${pairNoteFor(lift, isTestWeek)}`,
        // ⚠️ 45, NOT 35, ON A STANDALONE WEEK. The old deload was the main lift alone; these carry
        // jumps and three assistance slots at the light band, so 35 would under-book the calendar by
        // ten minutes on every lifting day of those weeks.
        // ⚠️ A LEADER WEEK IS LONGER NOW (§1e). Five sets of five on the main lift after the main
        // work is roughly ten to twelve minutes; booking 60 for it would under-book every leader day
        // in the block, which is the calendar telling the athlete a lie about their evening.
        duration: isStandalone ? 45 : (fsl ? 72 : 60),
        strength_exercises: ex,
        // ⛔ NO `1rm_test` TAG, and that is deliberate. The tag makes the logger DISCARD the planned
        // rows and rebuild the session as a warm-up ramp plus one all-out set (`StrengthLogger.tsx`
        // ~2337-2367) — the old separate-retest-week shape. Under 5/3/1 the measurement is just the
        // third set of an ordinary session, so a rebuild would delete the very prescription this
        // block is built on. The e1RM still lands: `set_plan[].amrap` flags the open set, and the
        // logger's write-back fires off that flag alone (`isAmrapBaseline`, ~3301).
        // ⚠️ `phaseTagFor` rather than a bare `toLowerCase()`: 'TM Test' contains a space, and a tag
        // reading `phase:tm test` would break every `startsWith('phase:')` split on whitespace.
        tags: ['strength', lift.focus, phaseTagFor(phaseName), 'protocol:strength_primary'],
      });
    }

    // ── 3-DAY: THE TWO PRESSES ARE ONE SESSION, NOT TWO ─────────────────────────────────────────
    //
    // ⛔ THIS IS WENDLER'S OWN STACKING, NOT A COMPROMISE. He stacks main lifts freely: the two-day
    // template (p.77) runs Squat 5/3/1 AND Bench 5/3/1 in one session, and the full-body template
    // stacks three. Two presses on one day is the same move at three days a week.
    //
    // ⛔ WHAT WAS WRONG WAS THE DOSE, NOT THE PAIRING. The per-lift loop above authors a COMPLETE
    // session per lift — main lift plus all three assistance slots — so the shared day emitted two
    // sessions and **eight exercises**: two presses, two pushes, two pulls, two core. Nothing asked
    // for that; it fell out of the loop's shape. Wendler's stacked day is the two main lifts and
    // ONE round of assistance (p.77: "pick one or two exercises per lift" for the whole day).
    //
    // ⚠️ HEAVIEST FIRST, and it is `PAIRED_LIFTS` that says which — deadlift before overhead press. The
    // second lift of a session is trained fatigued, so the order decides which lift pays. Merged in
    // that order rather than in whatever order the solver's day map produced.
    //
    // ⚠️ ASSISTANCE COMES FROM THE FIRST LIFT'S RESOLUTION, AND IT IS STILL LOAD-BEARING (checked
    // 2026-08-17 under slice 5). Both lifts on this day now resolve the SAME day key — the overhead
    // press maps to `'deadlift'`, because that is the day it is trained on — so the two per-lift
    // blocks are byte-identical rather than merely equivalent. Taking one is what keeps the stacked
    // day at ONE round of assistance (§1e, p.77); deleting this step would emit both and put six
    // assistance rows on the day, which is the dose error the eight-exercise bug above already was.
    // ⛔ So: not redundant, and not to be "simplified" now that the keys agree — the agreement is
    // exactly why one of them has to be dropped.
    {
      const byDay = new Map<string, PlanSession[]>();
      for (const ws of weekSessions) {
        if (ws.type !== 'strength') continue;
        byDay.set(String(ws.day), [...(byDay.get(String(ws.day)) ?? []), ws]);
      }
      for (const [, group] of byDay) {
        if (group.length < 2) continue;
        const ordered = [...group].sort((a, b) =>
          PAIRED_LIFTS.findIndex((n) => a.name.endsWith(n)) - PAIRED_LIFTS.findIndex((n) => b.name.endsWith(n)));
        const [first, ...rest] = ordered;
        // Main lifts in order, then ONE assistance block — the first lift's; both resolve the same day.
        const mainOf = (ws: PlanSession) => (ws.strength_exercises ?? []).filter((e: StrengthExercise) =>
          MAIN_LIFTS.some((l) => l.name === e.name));
        const assistanceOf = (ws: PlanSession) => (ws.strength_exercises ?? []).filter((e: StrengthExercise) =>
          !MAIN_LIFTS.some((l) => l.name === e.name));
        // ⛔ ONE SUPPLEMENTAL ON A SHARED DAY, NOT TWO (§1e). The per-lift loop authors an FSL block
        // for each lift, so a stacked day would emit TEN sets of five on top of two main lifts —
        // the same shape of dose error the eight-exercise bug above was. Wendler's stacked day is
        // the main lifts plus ONE round of everything else (p.77), and that governs the supplemental
        // exactly as it governs the assistance. The FIRST lift's block survives, because it is the
        // heavier lift and the one the day is ordered around.
        // ⚠️ AND IT GOES AFTER BOTH MAIN LIFTS, not between them. Five sets of five in front of a
        // second heavy main lift would hand the fatigue to the lift that is already paying for
        // going second — which is the cost the stacked-day copy discloses, and doubling it silently
        // would make that sentence false.
        const mains = ordered.flatMap(mainOf);
        const supplementals = mains.filter((e: StrengthExercise) => e.supplemental);
        // ⛔ THE JUMPS STAY IN FRONT (§1f). They are a PRIMER — Wendler opens every session with them
        // — and the merge used to sweep them into the "assistance" bucket, which put them after the
        // main lifts. That never showed before because the paired day was two presses and carried no
        // jumps at all; pairing the DEADLIFT with the press made the shared day a lower day.
        const nonMain = assistanceOf(first);
        const primer = nonMain.filter((e: StrengthExercise) => e.name === JUMP_NAME);
        first.strength_exercises = [
          ...primer,
          ...mains.filter((e: StrengthExercise) => !e.supplemental),
          ...supplementals.slice(0, 1),
          ...nonMain.filter((e: StrengthExercise) => e.name !== JUMP_NAME),
        ];
        first.name = `Strength — ${ordered.map((w) => w.name.replace('Strength — ', '')).join(' + ')}`;
        // ⛔ THE ORDER IS THE COST, SO IT IS STATED (§0f) — same rule as every other stacked day.
        const secondName = ordered[1].name.replace('Strength — ', '');
        const firstName = ordered[0].name.replace('Strength — ', '');
        first.description = `${String(first.description ?? '')} ${firstName} goes first and ${secondName} `
          + `follows on the same day. The second lift of a session is trained fatigued, so it gives up `
          + `load and reps. 5/3/1 adds weight for hitting the rep target rather than off a fresh max, `
          + `so the fatigued lift still progresses.`.trim();
        for (const dead of rest) weekSessions.splice(weekSessions.indexOf(dead), 1);
      }
    }

    // Endurance = maintenance, underneath.
    // ⛔ EVERY SELECTED SPORT IS AUTHORED. This was `enduranceSport === 'run'` — the single-sport
    // assumption at its last and most damaging point: whatever the priority model decided, a
    // non-run-primary block emitted no runs at all. A sport the athlete selected always reaches a
    // session; if it genuinely cannot fit, that is the refusal below, not a silent omission.
    if (runSelected) {
      runDayList.forEach((day) => {
        // ⛔ CITATION REMOVED 2026-07-26. This read "...back-to-back is fine [Petré 2021]." Petré 2021
        // is a strength-development meta-analysis BY TRAINING STATUS — it says nothing about session
        // spacing, so it never supported this line. The line is now stated as the reasoning it always
        // was, with no source attached.
        // ⚠️ The CLAIM is also narrower than it looked. Robineau 2016's 0h arm was the WORST of three
        // (half-squat 1RM +16.8% at 0h vs +31.2% at 6h) — but that arm stacked lifting with HARD
        // endurance. This is a lift plus an EASY run, which is not the tested condition, and
        // resistance-first is the correct order when sessions cannot be separated (Eddens 2018:
        // +6.91% lower-body strength for RT-first). So the guidance is sound and UNSOURCED.
        // ⛔ Do not attach a citation here without one that tested lifting + easy running same-day.
        // ⛔ THE NOTE HAS TO KNOW WHICH LIFT IT IS SHARING WITH. Corrected 2026-07-28, within the
        // hour of opening heavy-leg days to easy runs — and it is the box-jump failure exactly:
        // copy that was TRUE when runs could only land on bench and press days, printed unchanged
        // on a day where it is now FALSE.
        //
        // "back-to-back is fine" holds for an upper lift — pressing shares no prime movers with
        // running. On a squat or deadlift day it does not: both load the legs,
        // `stackNeedsRecoveryGap` is true, and the law asks for six hours. Telling an athlete that
        // back-to-back is fine on their deadlift day is the kind of confident-and-wrong sentence
        // this whole day has been about.
        // ⛔ SAME RULE AS THE RIDE, AND THE WEEK-1 GATE IS GONE. The order line used to appear on the
        // first stacked run day of WEEK ONE only, so weeks 2-12 carried the same stack with nothing
        // said. A rule that matters in week 1 matters in week 6; showing it once is a tutorial, and
        // this is a prescription.
        const runOnHeavyLegDay = heavyLowerDays.includes(day);
        const runStackedWithLift = strengthDays.includes(day);
        const note = runOnHeavyLegDay
          ? ` Shares the day with heavy legs: the lift goes first, and leave ${MIN_STACK_GAP_H}h before the run — they load the same legs.`
          : (runStackedWithLift
            ? ` Shares the day with the lift: the lift goes first. The run is easy, so back to back is fine.`
            : undefined);
        // ⚠️ A MAINTENANCE RUN HAS NO LONG SESSION — `runHasLongDay` is false unless the run leads
        // or the athlete pinned a long day, and then every day of it is easy by definition.
        weekSessions.push(enduranceSession(
          'run', day, runMinutesByDay[day], note,
          runHasLongDay && day === longRunDay ? 'long' : 'easy', isStandalone,
        ));
      });
      // ⛔ THE HARD DAY GETS FILLED. Until now the pin reserved a day and nothing was authored for
      // it — `place-week` kept the bar clear of the athlete's chosen day and left it BLANK, which is
      // worse than dropping the pin, because the week visibly loses a day.
      //
      // ⚠️ RUN-ONLY ONLY. If the athlete has a bike, the doctrine puts the hard session THERE
      // (`DOCTRINE-aerobic-maintenance.md` §6: "both means a choice, and the bike wins") — hard
      // riding costs the legs less than hard running does. The bike pass is still fenced (Q-126),
      // so a bike-equipped athlete currently gets no hard session at all rather than the wrong one.
      // ⛔ Do NOT emit hills as a substitute for the ride: that spends mechanical budget the
      // doctrine spent the whole day protecting.
      // ⛔ EVERY HARD RUN GETS FILLED, NOT "THE" HARD RUN (§1i). One loop, so two hard runs each get
      // their own session rather than the first winning and the second leaving a blank pinned day.
      for (const h of hardRunDays()) {
        // ⛔ ON A DELOAD WEEK THE HARD SESSION IS DOWNGRADED, NOT DELETED (D-407). Dropping it would
        // hand back a blank day, which `place-week` already learned is worse than dropping the pin —
        // the week visibly loses a day and the athlete reads it as a bug. The day keeps an easy run
        // at the trimmed volume, so frequency holds (Hickson) while the intensity that drives the
        // interference goes away (Wilson 2012).
        // ⚠️ BOTH STANDALONE SHAPES TRIM IT, not just the deload (2026-08-15). A TM-test week is a
        // RESTED week by design — its whole job is to arrive at the measured set fresh — so leaving
        // hill repeats on it would spend exactly the freshness the test needs.
        if (isStandalone) {
          weekSessions.push(enduranceSession('run', h.day, hardRunSessionMinutes(h.terrain),
            (isTmTest
              ? 'Test week — the hard session comes off so the lifting is measured rested. '
              : 'Light week — the hard session comes off. ')
            + 'Easy running only, and the same rule as every other easy day: conversational throughout.',
            'easy', true));
          continue;
        }
        // ⛔ WHICH SESSION THIS DAY IS (§7). A club run is booked, not coached (§1i) — the app cannot
        // prescribe 4 × 3 min uphill into a session the athlete turns up to and runs with a group,
        // and writing the template anyway would be a prescription for work nobody is going to do. It
        // keeps its pin, its recovery cost and its share of the week's miles.
        // ⚠️ THE THRESHOLD RUN IS THE FIRST PRESCRIBED RUN (2026-08-17, inverted) — `assignHardRoles`
        // owns that and it is asked here rather than re-derived. VO2 is the unlock, not the default.
        const role = roleOf(h.day);
        weekSessions.push(
          role === 'club'
            ? clubEnduranceSession('run', h.day, hardRunSessionMinutes(h.terrain))
            : role === 'threshold'
              ? thresholdRunSession(h.day, { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex },
                asPositiveNumber(args.thresholdPaceSecPerMi) != null ? 'measured' : 'derived')
              : hardRunSession(h.day, heavyLowerDays, h.terrain, { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex }),
        );
      }
    } else if (enduranceSport === 'bike' && !hasBike) {
      // ⛔ TWO EMITTERS WERE AUTHORING RIDES AND NOTHING SUBTRACTED (found 2026-07-29 by the combo
      // sweep). For a bike-primary athlete this fallback fired AND the `hasBike` pass below fired.
      // The pass built the hours correctly — 6h asked came out as 103 + 154 + 103 minutes, exactly
      // 360 — and then this line added its own two fixed 45-minute rides on top. Measured: 6h asked
      // → 7.5h built, 8h → 9.5h. Twenty-five percent over, on the discipline a maintenance block
      // exists to hold STEADY.
      //
      // ⚠️ AND IT SCALED WITH FREE DAYS, not with the ask. `enduranceDays` fills whatever the week
      // has spare, so dropping to three lifting days freed a day and the same 6h ask became 8.3h
      // across six rides. A volume that moves when the LIFTING changes is not a volume.
      //
      // ⛔ THIS IS THE SAME DEFECT THE RUN SIDE FIXED ON 2026-07-28 — the hill session counted toward
      // the run-day COUNT and not the MILES, so every plan built the typed number and added the hard
      // session after. Michael rejected that at 27%. Same class, same answer: one owner per volume.
      // When the athlete gave bike hours, the `hasBike` pass owns every ride and this fallback is
      // silent. It still fires for a bike athlete who gave no hours, where it is the only emitter.
      // ⛔ THE SOLVER'S DAYS, NOT THE RUN PIPELINE'S (2026-08-08). This walked `enduranceDays`,
      // which is the RUN day list — fine while every block had a run in it, empty the moment a
      // bike-only athlete stopped being handed a phantom one, and the rides silently vanished.
      // These rides are requested from the solve like every other flexible session.
      solvedRideDays.forEach((day) => weekSessions.push(
        enduranceSession('bike', day, undefined, undefined, 'easy', isStandalone)));
    }

    // ── The bike, when the athlete keeps one ────────────────────────────────────────────────────
    //
    // ⛔ THIS RUNS ALONGSIDE THE RUN, NOT INSTEAD OF IT. `enduranceSport` is singular and used to be
    // the whole story: an athlete with run AND bike on `maintain` got run and silently lost the
    // bike — posture, long-ride day and weekly hours all collected and discarded, twelve weeks with
    // an empty Saturday. Everything the intake asks for now reaches a session or is not asked.
    if (hasBike) {
      // ⛔ Days that already carry ENDURANCE, not days that carry anything. `weekSessions` holds the
      // four lifts by this point, so testing "has a session" marked every upper day taken and killed
      // all stacking. An upper lift + an easy ride is the stacked day we WANT; an upper lift + a run
      // + a ride is the 196-minute Thursday we do not.
      const taken = new Set(
        weekSessions.filter((s) => s.type === 'run' || s.type === 'ride').map((s) => s.day),
      );
      // Hours → sessions. ⛔ HOURS, never miles (D-323 §6): the engine has never learned a ride
      // speed, so miles is a number it cannot turn into time. Two rides is the nominal shape; the
      // long ride takes the larger share because that is what a long ride is.
      // ⛔ `targetWeeklyRideHours` HAD ZERO READERS (found 2026-07-29). Its own doc comment said it
      // was "carried now so the bike pass has it to consume" — and the pass never consumed it, so a
      // bike athlete who gave hours on the primary path got the fixed 2×45min default instead.
      // Measured: 6h asked, 1.5h built. Collected and dropped, the same shape as `hardDay` and
      // `quality_run` before it. `bike.hours` still wins; this is the fallback, not a second owner.
      const rideHours = Number(args.bike?.hours) > 0
        ? Number(args.bike!.hours)
        : (Number(args.targetWeeklyRideHours) > 0 ? Number(args.targetWeeklyRideHours) : 2);
      // ⛔ THE ATHLETE'S ANSWER, not a guess. Asking "how many days to ride" is what the run step has
      // always done and the bike never did — without it this code held a weekly total and split it
      // by an invented ratio, so 20 hours produced ONE 1,200-minute ride.
      const wantDays = Math.max(1, Math.min(3, Math.round(Number(args.bike?.days) || 2)));
      /**
       * ⛔ THE RIDE DAYS COME OUT OF THE SAME SOLVE AS THE RUNS AND THE BAR (2026-08-08).
       *
       * This pass used to run HERE, inside the week loop, a thousand lines after the run pass — it
       * read `weekSessions` to find which days the runs had already taken and filled around them.
       * That ordering is the whole cluster bug: runs got the open days in calendar order, rides got
       * the leftovers, and no scorer ever compared a run day with a ride day. The alternator added
       * upstream was a patch on the symptom.
       *
       * ⚠️ THE LONG RIDE IS STILL A PIN AND STILL LEADS. It is an anchor in the solve (see `pins`),
       * so it is not in the flexible list and cannot be spread — the athlete named that day.
       */
      const rideDays: string[] = [];
      if (longRidePin) rideDays.push(longRidePin);
      for (const d of solvedRideDays) {
        if (rideDays.length >= wantDays) break;
        if (rideDays.includes(d)) continue;
        rideDays.push(d);
      }
      // ⚠️ If nothing is free the long ride still lands — an athlete who named a day gets that day.
      if (rideDays.length === 0 && longRidePin) rideDays.push(longRidePin);
      // ⛔ AND IF THE WEEK STILL CANNOT HOLD WHAT THEY ASKED FOR, SAY SO. Never silently fewer.
      // ⚠️ ONCE, not twelve times. This block runs inside the week loop, so an unguarded push
      // repeated the same sentence for every week in the block — the shape is identical every week,
      // so the compromise is a property of the WEEK, not of week 7.
      const rideShortfallNote = rideDays.length < wantDays
        ? `You asked for ${wantDays} ride days; the week had room for ${rideDays.length} once the lifting and your fixed days were placed.`
        : null;
      // A ride day the week had no room for is a COST, not a broken rule — nothing in the law was
      // violated, the athlete simply asked for more days than the week held once the pins landed.
      if (rideShortfallNote && !placementCompromises.some((c) => c.text === rideShortfallNote)) {
        placementCompromises.push({ kind: 'cost', text: rideShortfallNote });
      }
      // ⛔ AND IF THE REST DAY WAS THE THING THAT PAID FOR IT, THAT IS THE BIGGER SENTENCE.
      //
      // The rest day now yields to a session the athlete asked for (Michael, 2026-08-05). A week with
      // no full rest day is a real recovery cost on a block whose whole premise is manageable
      // fatigue, so it is named — the athlete traded it, and they should know they did. ⚠️ This is
      // the one compromise in this file where silence would be worst: everything else costs a day's
      // arrangement, this costs the recovery the block is built around.
      // ⚠️ ASKED OF THE WEEK, NOT OF ONE VARIABLE. An earlier version tested whether the rides had
      // taken `restReserved`, which stopped meaning anything once the rest day became a leftover
      // rather than a slot — the runs could just as easily have taken it. Count the days that carry
      // something and let the answer come from the week itself.
      const occupied = new Set<string>([
        ...strengthDays, pickedLong, ...easyRunDays, ...rideDays,
      ].filter(Boolean) as string[]);
      const restSpent = DAYS.every((d) => occupied.has(d));
      const restNote = `Your ${wantDays} ride days and ${runFreq} run days fill all seven — this week has no full rest day.`;
      if (restSpent && !placementCompromises.some((c) => c.text === restNote)) {
        placementCompromises.push({ kind: 'cost', text: restNote });
      }
      // ⛔ THE HARD RIDE IS INSIDE THE WEEK'S HOURS, NOT AN EXTRA ON TOP (2026-07-29).
      //
      // This is the run side's 2026-07-28 defect, one discipline over, and it was still here: the
      // interval session is a RIDE, it counted toward nothing, and the easy hours were built to the
      // full ask beside it. Measured 6h asked → 6.8h built, on every bike athlete who picked the
      // bike for their hard day. Michael rejected the run version of this at 27%.
      //
      // ⛔ AND THE INTERVALS DO NOT SHRINK TO FIT — same yield order the run uses. Hickson: intensity
      // holds top-end fitness and duration is the expendable variable, so the hard session is paid
      // first at its full 45 minutes and the easy hours flex around it.
      // ⛔ SUMMED ACROSS EVERY HARD RIDE (§1i) — was one session's worth off a single hard day, so a
      // second hard ride would have been built on top of the athlete's asked-for hours.
      // ⛔ AND EACH HARD RIDE COSTS ITS OWN SESSION'S MINUTES (§7) — a threshold ride is longer than
      // the 45-minute interval session, so a flat multiple would under-subtract it.
      const hardRideMins = hardRideDays().reduce(
        (mins, h) => mins + (roleOf(h.day) === 'threshold' ? THRESHOLD_RUN_MIN : BIKE_QUALITY_MIN), 0);
      const totalMins = Math.max(30, Math.round(rideHours * 60) - hardRideMins);
      // ⛔ EVEN SPLIT, then the long day takes what the others give up. `LONG_RIDE_SHARE` is the one
      // authored number left in this block and it is marked as such: a long ride that is the same
      // length as the others is not a long ride, and 1.5× is the smallest multiplier that reads as
      // one. It is a product decision, not a finding — do not dress it up as physiology.
      const LONG_RIDE_SHARE = 1.5;
      const others = Math.max(0, rideDays.length - 1);
      const unitMins = totalMins / (others + (longRidePin && rideDays.includes(longRidePin) ? LONG_RIDE_SHARE : 1));
      rideDays.forEach((day) => {
        const isLong = day === longRidePin;
        const mins = Math.max(20, Math.round(unitMins * (isLong ? LONG_RIDE_SHARE : 1)));
        // ⛔ IF THE RIDE LANDED ON A HEAVY-LEG DAY, THE 6h GAP HAS TO BE SAID. Opening those days
        // (2026-07-28) was correct — the law permits the pair — but what the law actually asks for is
        // the GAP, and a permission delivered without its condition is the §0f loss: the engine
        // honours the rule and the athlete never hears it. `easy_bike × lower_body_strength` is the
        // one ride pairing where `stackNeedsRecoveryGap` is true.
        // ⛔ EVERY STACKED DAY STATES THE ORDER. The gap is conditional; the ORDER is not.
        //
        // Until now the ride only spoke on a heavy-leg day, so Monday's ride beside a bench press
        // said nothing at all — while Tuesday's lift and Friday's run both stated theirs. One of
        // three stacks silent, and `lift_first` sitting in the data the whole time (§0f).
        //
        // ⚠️ Eddens is why the order matters and it does NOT depend on the pairing: resistance
        // before endurance, +6.91% lower-body dynamic strength, in exactly the minimal-relief case
        // this is. The 6h GAP is the part that depends on the pairing — only when both load the legs.
        const onHeavyLegDay = heavyLowerDays.includes(day);
        const stackedWithLift = strengthDays.includes(day);
        const rideNote = onHeavyLegDay
          ? ` Shares the day with heavy legs: the lift goes first, and leave ${MIN_STACK_GAP_H}h before the ride — they load the same legs.`
          : (stackedWithLift
            ? ` Shares the day with the lift: the lift goes first. They share no prime movers, so back to back is fine.`
            : undefined);
        weekSessions.push(enduranceSession(
          'bike', day, mins, rideNote, isLong ? 'long' : 'easy', isStandalone));
      });
      // ⛔ AND THE HARD DAY, IF THEY CHOSE THE BIKE FOR IT. Same fix as the run's: the pin already
      // reserved this day, so without this the week visibly loses one. D-327 makes run and bike
      // mutually exclusive at intake, so at most one of these two branches ever fires.
      //
      // ⛔ AND IT DELOADS, LIKE THE RUN'S DOES (2026-08-16). This line pushed `bikeQualitySession`
      // unconditionally while the easy rides two blocks up were already taking `isStandalone`, so a
      // bike-primary athlete rode 4 × 4 VO2 intervals through every light week in the block —
      // including the TM-test week, whose entire job is arriving rested at the measured set. The run
      // branch (:2931-2946) has handled both standalone shapes since 2026-08-15; the bike never got
      // the same change. Downgraded, not deleted: dropping it hands back a blank day, which
      // `place-week` already learned is worse than dropping the pin. Frequency holds (Hickson) and
      // the intensity that drives the interference comes off (Wilson 2012).
      // ⛔ EVERY HARD RIDE, NOT "THE" HARD RIDE (§1i) — same loop as the runs, one discipline over.
      for (const h of hardRideDays()) {
        if (isStandalone) {
          weekSessions.push(enduranceSession('bike', h.day, BIKE_QUALITY_MIN,
            (isTmTest
              ? 'Test week — the intervals come off so the lifting is measured rested. '
              : 'Light week — the intervals come off. ')
            + 'Easy spinning only, and the same rule as every other easy day: conversational throughout.',
            'easy', true));
          continue;
        }
        // ⛔ WHICH SESSION THIS DAY IS (§7) — same three-way as the run. A club ride is booked, not
        // coached (§1i): the app does not write 4 × 4 into a group ride it does not control.
        const role = roleOf(h.day);
        weekSessions.push(
          role === 'club'
            ? clubEnduranceSession('bike', h.day, BIKE_QUALITY_MIN)
            : role === 'threshold'
              ? thresholdRideSession(h.day, { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex })
              : bikeQualitySession(h.day, { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex }),
        );
      }
    }

    // Swim last, so it only takes days nothing else wanted.
    if ((args.swimDays ?? 0) > 0) {
      const taken = new Set(weekSessions.map((x) => x.day));
      const free = DAYS.filter((d) => !taken.has(d));
      swimSessions(free, args.swimDays!).forEach((x) => weekSessions.push(x));
    }

    weekSessions.sort((a, b) => {
      const d = DAYS.indexOf(a.day as typeof DAYS[number]) - DAYS.indexOf(b.day as typeof DAYS[number]);
      if (d !== 0) return d;
      // Same day: LIFT FIRST — strength is the goal, so it gets the fresh signal; the easy
      // maintenance run follows [Eddens 2018, Zhang 2026, Tundidor-Duque 2026].
      return (a.type === 'strength' ? 0 : 1) - (b.type === 'strength' ? 0 : 1);
    });
    sessions_by_week[String(week)] = weekSessions;
  }

  const cycles = cyclesForBlock(weeks);
  const leaders = cycles.filter((c) => c.kind === 'leader').length;
  const anchorStart = cycles[cycles.length - 1].startWeek;
  // ⛔ SAME REFRAME AS THE PER-SESSION LINE (~L592), and it matters more here because this one is
  // the block's opening paragraph — the first sentence the athlete reads about their own running.
  // "Held underneath at maintenance" positions the plan as the actor and the athlete as the object.
  // The athlete chose a strength block; the endurance ticking over is the consequence of their
  // decision, not something done to them.
  const enduranceNote = enduranceSport
    ? ` ${enduranceSport === 'bike' ? 'Riding' : 'Running'} keeps ticking over, all easy — strength is what this stretch develops.`
    : '';

  // ⛔ THE CEILING PARAGRAPH IS GONE — 2026-08-12, slice a. It said "<lift> (N lb) reaches 90% of the
  // max on file at cycle N and stops climbing. That usually means the record is out of date." There
  // is no ceiling to reach now, so the sentence would be false in every block.
  //
  // ⚠️ AND THE THING IT WAS TELLING THE ATHLETE IS NO LONGER TRUE EITHER: the lift does not stop
  // climbing. It climbs by Wendler's fixed step until a confirmed stall brings it down 10%. Q-217
  // (the note's "usually out of date" claim was untrue for a never-tested lift) dies with it.

  return {
    name: args.goalName?.trim() || `Strength Focus — ${weeks} Weeks`,
    description:
      // ⛔ ONE SOURCE for this copy — `src/lib/strength-focus-copy.ts`, which the BUILD FLOW also
      // reads so the athlete is shown the same words before committing that the plan carries after.
      // Provenance for every line (what is biology, what is product voice, what is a debt) lives in
      // that file's header. Do not re-word it here; there would then be two.
      strengthFocusDescription({
        weeks,
        leaderCycles: leaders,
        anchorStartWeek: anchorStart,
        anchorCycles: cycles.length - leaders,
        // ⛔ THE TEST WEEKS COME FROM THE MAP, NOT FROM AN ASSUMPTION (2026-08-15, §1c). An 8-week
        // block has one and a 12-week block has two, and the copy must not promise the opening one
        // to an athlete whose block does not fit it.
        testWeeks: weekMap.filter((w) => w.kind === 'tm_test').map((w) => w.week),
        // ⛔ THE SESSION-LENGTH DISCLOSURE (§1e). Derived from the block, not assumed: a block with
        // no leader cycles carries no supplemental and must not claim one.
        supplemental: leaders > 0,
        enduranceNote,
        // ⛔ ALWAYS EMPTY AS OF 2026-08-12 (slice a) — no lift can pin, because there is no ceiling.
        // The argument is left in place rather than removed from the copy helper's signature: that
        // helper is a client file and this slice is engine-only. Slice b retires the pair.
        ceilingLifts: [],
        // The lifts light enough to floor at the 35 lb bar — the flag that replaced the hard 85
        // gate (2026-08-13): the plan says which sets assume a women's bar instead of refusing.
        lightBarLifts: MAIN_LIFTS
          .filter((l) => barFloorForWorkingNumber(training_max[l.ref]) === BAR_LB_LIGHT)
          .map((l) => l.name),
        compromises: placementCompromises,
      }),
    duration_weeks: weeks,
    sessions_by_week,
    phaseStructure,
    training_max,
    volume_notes,
    volume_state,
    /**
     * ⛔ WHAT THE WEEK COULD NOT HONOUR, IN THE SOLVER'S OWN WORDS. Never empty-by-silence: an
     * absent array means nothing was broken, not that nobody looked.
     *
     * `place-week.ts` has always produced these and, until now, nothing carried them out of the
     * composer — the contract in that file says a clearance it cannot honour must be named in plain
     * words and ⛔ NEVER SILENTLY SWALLOWED, and we were swallowing them.
     *
     * They are not edge cases. An athlete who keeps run AND bike and takes a hard day has SEVEN
     * commitments in seven days — four lifts, a long run, a long ride, a quality session — and the
     * solver says so exactly: *"Either one lifting day comes out, or the week runs with no full rest
     * day."* That is a real trade the athlete owns, and handing them the week without the sentence
     * is the app making the choice for them and pretending it didn't.
     *
     * ⚠️ Surfacing only. D-325 §7: state the cost, never refuse — the week is still built.
     */
    placement_compromises: placementCompromises.length ? placementCompromises : undefined,
    // ⚠️ SORTED BY DAY, not by lift. `strengthDays` is built in MAIN_LIFTS order (bench, squat, OHP,
    // deadlift), so it printed "monday, wednesday, tuesday, friday" — correct data in an order that
    // reads like a mistake.
    // ⛔ NOT EMITTED HERE ANY MORE — 2026-08-12, slice a. The only producer was the ceiling, and the
    // ceiling is deleted, so a fresh block has nothing to say: a forecast's verdicts are all
    // `advance`, and a confirmed stall needs LOGGED cycles this composer cannot have.
    //
    // ⚠️ THE FIELD, ITS TYPE AND ITS `plans.config` PLUMBING ALL STAY (`generate-strength-plan`
    // writes it). Slice b repopulates it from the reset/bump events off the rebuild path, where
    // `workingNumberForCycles(...).resetAtCycle` is the input. Deleting the wire and re-laying it
    // in two days is the churn this note exists to prevent.
    strength_days: [...strengthDays]
      .sort((a, b) => PLACEMENT_DAYS.indexOf(a as DayName) - PLACEMENT_DAYS.indexOf(b as DayName))
      .map((d) => String(d).toLowerCase()),
  };
}
