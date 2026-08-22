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
// ⛔ `placeLiftingWeek` IS NO LONGER IMPORTED (stage 5, 2026-08-21). It was the fallback for a
// solver status that cannot occur, so the whole second placer came into this bundle for a branch
// that never ran. What is still imported from that file is types and two constants.
import {
  type DayName,
  DAYS as PLACEMENT_DAYS,
  type EndurancePin,
  MIN_STACK_GAP_H,
} from './place-week.ts';
import { requiredAdjacencyHours } from '../../_shared/schedule-session-constraints.ts';
/**
 * ⛔ ONE SHAPE FOR WHAT THE ATHLETE ASKED FOR (stage 4, 2026-08-21). The ride ask used to be eight
 * separate `const`s derived across 1,900 lines of this file — `hasBike`, `bikeSelected`,
 * `longRidePin`, `askedRideDays`, `rideHasLongDay`, `ridesWanted`, `wantDays`, `rideHours` — plus a
 * ninth (`weeklyRideHours`) that resolved the same hours a second way. It is one object now. The
 * file that owns it carries the full account of what that cost.
 */
import {
  buildRideIntent,
  buildRunIntent,
  resolveSwimAsk,
} from '../../_shared/athlete-weekly-intent.ts';
// ⛔ `easyRunAnchorAdjacencyPenalty` IS NO LONGER IMPORTED (stage 5, 2026-08-21). It was imported
// here and NEVER CALLED — the four other mentions in this file are comments recording that the
// second scorer it belonged to was deleted. The import alone pulled all 2,434 lines of
// `_shared/week-optimizer.ts` into the strength bundle, for nothing.
// ⚠️ THE FUNCTION IS NOT DELETED. `week-optimizer` is live on the race/triathlon/combined path and
// the export has readers there; only this file's dead reference goes.
// ⛔ STEP 1 OF THE COLLAPSE (SPEC-week-solver §7). Placement now comes from the ONE solver rather
// than from `place-week`'s filter-and-take-first-legal-answer. `place-week` still owns the
// arithmetic screens the intake shows; only the PLACEMENT half moved.
const SOLVER_DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;

import {
  type Anchor as SolverAnchor,
  type FlexibleSession as SolverFlexible,
  type SolverDay,
} from '../../_shared/week-solver.ts';
// ⛔⛔ THE PLACEMENT ENGINE IS THE WEEK-MODEL NOW (2026-08-17). ONE IMPORT LINE, AND REVERTING IS
// ONE IMPORT LINE — `solve` from `week-solver.ts` is the previous behaviour, byte for byte.
//
// The slot solver asked "which weekday is legal and free" and filled slots. It could not say these
// two sessions are ONE thing, and it could not say this session left something outstanding until
// Tuesday. So a squat could never FOLLOW a hard run onto a day: nothing in the model said they
// belonged together, only that they were permitted to touch. That is why the hard ride was being
// dropped out of this athlete's week entirely.
//
// ⚠️ THE SLOT SOLVER IS NOT DELETED YET AND THAT IS DELIBERATE. `week-optimizer` still serves the
// triathlon side, `place-week` still owns the arithmetic screens the intake shows, and a week that
// has not been read on a device is not a week that has been verified. Delete after Michael has seen
// a built block, not before.
import { solveWithWeekModel as solveWeek } from '../../_shared/week-model/solver-adapter.ts';
/**
 * ⛔ ONE OWNER FOR A QUALITY SESSION'S LENGTH AND ITS WARM-UP (2026-08-20, stage 1).
 *
 * Every builder below used to state its length THREE times — the constant the volume budget
 * subtracts, the `duration` field, and the token — and `materialize-plan` overwrote the first two
 * from the third. Four sessions leaked between 13 and 22 minutes each, and Flat Sprints reached the
 * watch with an EMPTY warm-up array. Builders no longer state a duration at all: they declare a
 * CORE and receive `{ duration, steps_preset }` as one object.
 */
import {
  type QualityCore,
  qualityBudgetMinutes,
  wrapperNote,
  wrapQualitySession,
} from './quality-session.ts';


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
  | 'flat'
  /**
   * ⛔ THE SPEED TRACK'S THREE GROUNDS (2026-08-18). They belong to `hardRunGoal: 'speed'` and are
   * meaningless on the VO2 track — a sprint needs flat, predictable footing and a safe run-out, not
   * a gradient. ⚠️ `flat_road` is NOT the same answer as `flat`: `flat` is §2.0's last-resort
   * 4 × 3 min VO2 session on level ground, this is a sprint surface. Two different sessions.
   */
  | 'track'
  | 'flat_road'
  | 'turf'
  /**
   * ⛔ THE THRESHOLD RUN'S OWN GROUND (§4 of `DOCTRINE-threshold-run.md`, built 2026-08-18). It
   * shares `track` and `flat_road` with the speed track and adds the treadmill at ONE PERCENT — the
   * doctrine's number, and not the 5-8% the VO2 treadmill option asks for. Different session,
   * different incline, and the two must never be folded together.
   */
  | 'treadmill_1pct';

/**
 * ⛔ WHAT THE ATHLETE WANTS FROM THE INTENSITY DAY (Michael, 2026-08-18). The first hard day is the
 * high-intensity one; this is the athlete saying WHICH kind of intensity, and the two are genuinely
 * different trades rather than two names for one session:
 *
 *   `speed` — short explosive flat sprints. High neurological drive, and the hard footfall creates
 *             mechanical damage that wants 48h of leg clearance before heavy squats.
 *   `vo2`   — hard 3-minute climbs. Spikes heart rate to the limit, and running uphill removes the
 *             eccentric impact, saving the knees and quads for the barbell.
 *
 * ⚠️ ABSENT → `vo2`, which is what every block built before this asked for. A pure addition.
 */
export type HardRunGoal = 'speed' | 'vo2';

/**
 * ⛔ WHERE THE HARD RIDE HAPPENS (Michael, 2026-08-18) — THE BIKE HAD NO TERRAIN QUESTION AT ALL,
 * and its own comment said so: *"the ride has one shape and no terrain question."* That was true
 * while the ride was only ever Helgerud 4 × 4; it stopped being true the moment the bike carried
 * both an intensity day and a threshold day.
 *
 * ⚠️ IT IS AN ENVIRONMENT, NOT A GRADIENT, AND THAT IS THE DIFFERENCE FROM THE RUN. Cycling has no
 * footfall, so there is no eccentric impact to trade away — the question is not what the ground does
 * to the legs, it is whether the athlete can hold an exact power target without stopping. Michael:
 * intervals need *"an environment where the athlete can safely redline and hit exact power targets
 * without worrying about traffic or stoplights"*; threshold needs *"completely uninterrupted
 * pedalling — urban routes with intersections break the physiological adaptation."*
 *
 * ⚠️ SO THE TWO MENUS OVERLAP AND ARE NOT THE SAME. `stationary` is on the intervals menu (a dumb
 * bike can hold a hard effort) and NOT on the threshold one (it cannot hold a precise sustained
 * wattage); `long_climb` is on the threshold menu and not on intervals.
 *
 * ⚠️ ABSENT → `smart_trainer` ON NEITHER MENU. Absent means "we have not asked", and the ride is
 * built exactly as it was before this type existed — the session does not change, only what the card
 * says about where to do it. ⛔ Do not make one of these a default that alters the prescription.
 */
export type HardRideEnvironment =
  /** Erg mode: the trainer holds the number, so the athlete only has to pedal. */
  | 'smart_trainer'
  /** A gym or dumb bike — no power target, effort by feel. Intervals only. */
  | 'stationary'
  /** Open flat or rolling road. ⚠️ The one that carries the interruption risk. */
  | 'flat_road'
  /** A climb short enough to repeat — the intervals answer for a rider who has hills. */
  | 'hill_climb'
  /** A long steady climb — uninterrupted by construction, which is why it suits threshold. */
  | 'long_climb';

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
     * ⛔ WHICH KIND OF INTENSITY (2026-08-18). Only meaningful on the INTENSITY slot — a threshold
     * day has no goal question, its session is settled. Absent → `vo2`, which is what every block
     * built before this asked for.
     */
    goal?: HardRunGoal;
    /** ⛔ WHERE THE HARD RIDE HAPPENS. Ignored when `discipline` is `run`. Absent → nothing said. */
    environment?: HardRideEnvironment;
    /**
     * ⛔ THE ATHLETE'S OWN ALLOCATION (Michael, 2026-08-18) — WHICH SESSION THIS DAY IS.
     *
     * A block carries exactly one top-end intensity session and one sustained threshold session, and
     * until now WHICH discipline held which was decided by list ORDER. That was invisible: an
     * athlete picked a hard run and a hard ride and could not see, anywhere, that the run had taken
     * the intensity slot because it happened to be listed first.
     *
     * ⚠️ ABSENT FALLS BACK TO THE POSITIONAL RULE, byte-identical to before — every goal written
     * before this field keeps the block it built. ⛔ A CLUB DAY STILL OVERRIDES IT: a group session
     * is the sustained one whatever the athlete allocated, because the app is not writing it.
     */
    role?: 'intensity' | 'threshold';
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
   * ⛔ WHERE THAT NUMBER CAME FROM, AND THE SESSION COPY MUST SAY IT (2026-08-19). From
   * `describeThresholdBasis` — `'measured'` | `'derived-from-easy'` | `'stated'` | `'derived-from-5k'`
   * | `'unknown'`.
   *
   * ⛔ THE COPY USED TO INFER IT FROM NULLNESS: `thresholdPaceSecPerMi != null ? 'measured' :
   * 'derived'`. That was wrong for three of the five states — a pace the athlete TYPED, a pace the
   * VDOT table produced from their 5K, and a pace worked out from their easy runs were all announced
   * to them as *"the pace comes from your measured threshold."* A number presented as measured when
   * it was inferred is the score that lies, and the athlete has no way to know.
   *
   * Absent → the copy falls back to naming the 5K, which is what it did before this field existed,
   * so an old caller says nothing new rather than something false.
   */
  thresholdPaceBasis?: 'measured' | 'derived-from-easy' | 'stated' | 'derived-from-5k' | 'unknown' | null;
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
      // ⚠️ THE `isAbsAddOn` BRANCH IS GONE WITH THE ADD-ABS ROW (2026-08-18). It existed to let a
      // row that SHARED another slot's budget keep the number `resolveDayAssistance` had already
      // split for it, rather than being re-sized here. No row shares a budget any more.
      const totalReps = (a.category === 'pull'
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
const BIKE_QUALITY_ALLOWANCE_MIN = 45;

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
 * ⛔ EVERY WEEK-SHAPE A HARD SESSION TAKES ACROSS THE BLOCK — the set the volume budget has to be
 * right for (2026-08-20, stage 1).
 *
 * The budget is settled ONCE for the block; the session's core moves week to week. So "what does
 * this session cost" is a question about the whole wave, not about week 1, and `qualityBudgetMinutes`
 * takes the largest answer over this list. ⚠️ SIX ENTRIES, NOT THREE: the anchor cycle runs its own
 * rep tables (`ANCHOR_THRESHOLD_WAVE`, `vo2RepsFor`, `sprintRepsFor`) and quoting only the leader
 * weeks is how a budget ends up right for nine weeks of twelve.
 *
 * ⚠️ `cycleIndex` IS ABSENT DELIBERATELY. It selects wave 2's pace drop, which changes the token
 * suffix and not one second of the session's length.
 */
const ALL_HARD_WAVES: ReadonlyArray<HardWave> = ([1, 2, 3] as const).flatMap((weekInCycle) => ([
  { weekInCycle, cycleKind: 'leader' as CycleKind },
  { weekInCycle, cycleKind: 'anchor' as CycleKind },
]));

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
/**
 * ⛔ THE GROUND THE THRESHOLD RUN IS RUN ON (§1b / §4). Flat or rolling, uninterrupted — because
 * power output has to stay static to train clearance, and a climb run at flat-ground pace spikes the
 * heart rate into the VO2 band and destroys the adaptation.
 * ⚠️ EVERY OPTION CARRIES THE EFFORT-OUTRANKS-PACE PERMISSION except the treadmill, which is the one
 * surface where the grade cannot surprise the athlete.
 */
function thresholdGroundNote(terrain?: HardRunTerrain): string {
  switch (terrain) {
    case 'track':
      return ' On a track the pace is the pace — nothing tilts, so hold the number.';
    case 'treadmill_1pct':
      return ' On the treadmill at 1%, which is the flat this session wants.';
    case 'flat_road':
      return ' On flat or rolling ground. If you hit mild inclines or rolling grades, yield the pace '
        + 'to hold the effort — do not spike your heart rate on the uphills.';
    default:
      // ⛔ THE UNANSWERED CASE IS NOW THE COMMON ONE (2026-08-18) — the wizard asks for no ground on a
      // threshold run at all, so this branch is what nearly every athlete reads. Returning '' left
      // the session with no guidance on the one variable that decides whether the pace is honest.
      // ⚠️ "wherever the pace can STAY level" WAS THE FIRST DRAFT AND THE VOICE LINT CAUGHT IT —
      // `stay` is a banned word. The sentence says the same thing without it.
      return ' Run it on ground that holds a level pace — a track, a flat or rolling road, or a '
        + 'treadmill at 1%. On rolling ground, yield the pace to hold the effort rather than '
        + 'spiking your heart rate on the uphills.';
  }
}

/**
 * ⛔ ONE SENTENCE PER PROVENANCE, AND NONE OF THEM OVERSTATES. `describeThresholdBasis`
 * (`src/lib/resolve-current-run-pace.ts`) owns the states; this owns how the SESSION says them,
 * because a session description is written in the second person and a baselines card is not.
 *
 * ⚠️ `unknown` still produces a session — the hard-day gate tests the 5K, not this — but it says
 * the pace is not on file rather than naming a source that does not exist. Voice: fact first, no
 * imperative, the consequence stated conditionally.
 */
const THRESHOLD_BASIS_LINE: Record<'measured' | 'derived-from-easy' | 'stated' | 'derived-from-5k' | 'unknown', string> = {
  measured: 'The pace comes from your measured threshold.',
  'derived-from-easy':
    'The pace is worked out from your easy runs, not from a test — threshold sits about 19% faster '
    + 'than easy. If your easy runs are deliberately slower than easy, this comes out slow with them.',
  stated: 'The pace is the threshold you entered.',
  'derived-from-5k': 'The pace is derived from your 5K — threshold sits about 20 s/mi slower.',
  /**
   * ⚠️ UNREACHABLE FROM `thresholdRunSession` AND KEPT ANYWAY — the one case in this file where that
   * is the right call. §7's `hardDayGate` drops a prescribed hard RUN unless a 5K or a threshold pace
   * exists, and `materialize-plan` prices the token off 5K + 20 s/mi when the threshold resolver
   * abstains — so a surviving threshold session always has a number, and `generate-strength-plan`
   * translates `unknown` to `derived-from-5k` before it ever arrives here.
   *
   * It stays because this is a LOOKUP TABLE over a shared union, not a branch: the union comes from
   * `describeThresholdBasis`, where `unknown` IS reachable (the baselines card renders it), and a
   * table with a hole would fail at the type level the day a second caller appears. The cost is one
   * string; the alternative is a narrower duplicate union.
   */
  unknown:
    'No threshold pace is on file, so this one has no number yet. Effort is the target: comfortably '
    + 'hard, a sentence and not a conversation.',
};

/**
 * ⛔ THE WORK, EXACTLY AS `run_thr_*` EXPANDS IT (`materialize-plan:1600`): the efforts, and the
 * recoveries BETWEEN them — the loop is `if (i < reps - 1)`, so there is no trailing rest. Getting
 * that off by one rest interval is a minute of drift, which is the whole class of defect this
 * stage closes.
 */
function thresholdRunCore(wave: HardWave): QualityCore {
  const st = thresholdStep(wave);
  const drop = thresholdPaceDrop(wave);
  return {
    tokens: [`run_thr_${st.reps}x${st.minutes}min_r${st.restMin * 60}s${drop > 0 ? `_f${drop}` : ''}`],
    workSeconds: st.reps * st.minutes * 60 + (st.reps - 1) * st.restMin * 60,
    selfWrapped: false,
  };
}

function thresholdRunSession(
  day: string,
  wave: HardWave,
  basis: 'measured' | 'derived-from-easy' | 'stated' | 'derived-from-5k' | 'unknown',
  terrain?: HardRunTerrain,
): PlanSession {
  const st = thresholdStep(wave);
  const anchor = wave.cycleKind === 'anchor';
  const drop = thresholdPaceDrop(wave);
  const wrapped = wrapQualitySession(thresholdRunCore(wave), THRESHOLD_RUN_ALLOWANCE_MIN, 'run');
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
      // ⛔ THE THREE STATES, SAID PLAINLY RATHER THAN PICKED SILENTLY. The athlete reads this line
      // and it is the only place the session tells them where its number came from.
      + THRESHOLD_BASIS_LINE[basis]
      + thresholdGroundNote(terrain)
      // ⛔ THE WARM-UP IS NOW PART OF THE SESSION, SO THE CARD SAYS SO. A prescription the athlete
      // reads as "4 × 5 min at threshold" beside a duration of 45 minutes is a gap they have to
      // guess at; naming the bracket closes it. ⚠️ `_f{sec}` IS THE FASTER-THAN-THRESHOLD SUFFIX on
      // the token and it is OPTIONAL — the token without it is the pre-2026-08-17 form exactly, so
      // every already-materialized plan is unaffected.
      + wrapperNote(wrapped),
    ...wrapped.fields,
    tags: ['quality', 'run', 'aerobic', 'threshold'],
  };
}

/**
 * ⛔ THE RIDE'S THRESHOLD SESSION — the same wave, one discipline over. Prices at 95–105% FTP
 * through the `bike_thr_*` token family, which the expander already understands; nothing new was
 * invented for the bike.
 */
/**
 * ⛔ THE WORK, EXACTLY AS `bike_thr_*` EXPANDS IT (`materialize-plan:1976`) — and it differs from the
 * RUN's token in the one way that matters here: the bike loop is `if (rest) out.push(recovery)`
 * with NO `i < reps - 1` guard, so it emits a recovery after EVERY rep including the last. Four ×
 * 5 min with 1 min rest is 24 minutes on the bike and 23 on foot. Reading the run's arithmetic onto
 * the ride is a minute of drift, which is exactly the class of defect this stage closes.
 */
function thresholdRideCore(wave: HardWave): QualityCore {
  const st = thresholdStep(wave);
  return {
    tokens: [`bike_thr_${st.reps}x${st.minutes}min_R${st.restMin}min`],
    workSeconds: st.reps * (st.minutes + st.restMin) * 60,
    selfWrapped: false,
  };
}

function thresholdRideSession(day: string, wave: HardWave, env?: HardRideEnvironment): PlanSession {
  const st = thresholdStep(wave);
  const anchor = wave.cycleKind === 'anchor';
  const wrapped = wrapQualitySession(thresholdRideCore(wave), THRESHOLD_RIDE_ALLOWANCE_MIN, 'bike');
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
      + 'Spin it, do not grind it: the same cue as the interval day, and for the same reason.'
      + rideEnvironmentNote(env, 'threshold')
      + wrapperNote(wrapped),
    ...wrapped.fields,
    tags: ['quality', 'bike', 'aerobic', 'threshold'],
  };
}

/**
 * ⛔ THE THRESHOLD RUN'S ALLOWANCE — AND "ALLOWANCE" IS THE WORD THAT CHANGED (2026-08-20, stage 1).
 *
 * This was `THRESHOLD_RUN_MIN`, computed as the wave's LONGEST week (`3 × 7 + 2 × 2 + 20`), because
 * the budget is settled once for the block while the session's length moved 43 · 45 · 43 across the
 * wave and one number had to stand for three. Its own comment conceded it over-subtracted by two
 * minutes on two weeks in three.
 *
 * ⛔ THERE IS NOTHING LEFT TO STAND IN FOR. `quality-session.ts` spends whatever the core does not
 * use on the warm-up and cool-down, so **every week of the wave now costs exactly this number** —
 * the core moves and the wrapper absorbs it. The value is unchanged at 45; what it means is no
 * longer "roughly how long this session is" but "how much of the week this session may have".
 *
 * ⚠️ AND THE THRESHOLD RIDE HAS ITS OWN NOW. The ride budget read `THRESHOLD_RUN_MIN` — the RUN's
 * constant, on a ride — which was harmless only because the two numbers happened to be equal. Two
 * concepts sharing one name is how a rename becomes a bug six weeks later.
 */
const THRESHOLD_RUN_ALLOWANCE_MIN = 45;
const THRESHOLD_RIDE_ALLOWANCE_MIN = 45;

/** The minutes a hard run costs the week's mileage budget, by the role it was assigned (§7). */
function hardRunMinutesForRole(
  role: HardRole,
  terrain?: HardRunTerrain,
  goal: HardRunGoal = 'vo2',
): number {
  // ⚠️ THREE SESSION LENGTHS NOW, NOT TWO. A sprint session is not a hill session and not a
  // threshold session; a budget that quoted the wrong one would hand the difference back as easy
  // miles, which is the defect this function was written to fix in the first place.
  //
  // ⛔ AND EACH ONE IS NOW ASKED OF THE SESSION ITSELF (2026-08-20). Every branch below runs the
  // SAME constructor the week loop runs, over every week of the wave, and takes the largest — so
  // the number subtracted here and the number built there cannot drift apart. That drift was the
  // whole defect: this function returned 35 for Flat Sprints while the plan built 14.
  if (role === 'threshold') {
    return qualityBudgetMinutes(
      ALL_HARD_WAVES.map(thresholdRunCore),
      THRESHOLD_RUN_ALLOWANCE_MIN,
      'run',
    );
  }
  return hardRunSessionMinutes(terrain, goal);
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
/**
 * ⛔ THE RIDE YIELDS IN THE ANCHOR TOO (Michael, 2026-08-18) — THE LAST SESSION IN THE BLOCK THAT
 * DID NOT, AND IT WAS FLAGGED RATHER THAN ASSUMED BEFORE HE RULED.
 *
 * It is Helgerud's published 4 × 4, which is why it was left alone when the run's VO2 session was
 * cut: extending someone else's protocol on our own reasoning is what this file keeps deleting. His
 * ruling, and the receipt is the part to keep:
 *
 * ⛔ *"Helgerud's 4 × 4 is the gold standard for building VO2 max in pure endurance athletes. But we
 * are shifting into a RETAINING load to protect a strength peak. Cycling has zero eccentric tissue
 * damage — no impact — but sixteen minutes of max-HR pedalling obliterates local muscle glycogen in
 * the vastus lateralis. You cannot squat a 1RM on empty quads. Halving the intervals maintains the
 * central cardiovascular adaptation while cutting the local glycogen depletion in half."*
 *
 * ⚠️ SO THE COST BEING CUT IS PERIPHERAL, NOT CENTRAL, and the copy says exactly that — the engine is
 * maintained, the glycogen bill is halved. A rider told only "fewer intervals" would read it as the
 * plan losing interest and add them back.
 *
 * ⚠️ THE DURATION IS UNCHANGED AT 45 MIN AND THAT IS DELIBERATE. `BIKE_QUALITY_ALLOWANCE_MIN` is what the
 * week's RIDE-HOURS budget subtracts, and it is computed once for the block; shrinking it in the
 * anchor would hand the difference back as easy riding on exactly the weeks the taper exists to
 * protect. Over-subtracting is the safe direction — the same call `THRESHOLD_RUN_MIN` makes.
 */
/**
 * ⛔ THE WORK, EXACTLY AS `bike_vo2_*` EXPANDS IT (`materialize-plan:1979`) — same shape as
 * `bike_thr_*` above, recovery after every rep including the last.
 */
function bikeQualityCore(wave: HardWave): QualityCore {
  const reps = vo2RepsFor(4, wave);
  const restMin = Math.max(1, Math.round(wave.weekInCycle)) <= 1 ? 4 : 3;
  return {
    tokens: [`bike_vo2_${reps}x4min_R${restMin}min`],
    workSeconds: reps * (4 + restMin) * 60,
    selfWrapped: false,
  };
}

function bikeQualitySession(
  day: string,
  wave: HardWave = { weekInCycle: 1, cycleKind: 'leader' },
  env?: HardRideEnvironment,
): PlanSession {
  const reps = vo2RepsFor(4, wave);
  // 4 min in week one of a wave, 3 from week two — and 3 is where it stays.
  const restMin = Math.max(1, Math.round(wave.weekInCycle)) <= 1 ? 4 : 3;
  const anchor = wave.cycleKind === 'anchor';
  const wrapped = wrapQualitySession(bikeQualityCore(wave), BIKE_QUALITY_ALLOWANCE_MIN, 'bike');
  return {
    day,
    type: 'ride',
    name: 'Bike Intervals',
    description:
      `${reps} × 4 min hard, ${restMin} min easy between. Hard means hard — you should not be able to hold a `
      + 'sentence. Spin it, do not grind it: a fast, easy spin keeps this in your lungs instead of '
      + 'your legs, which is what leaves the lifting intact.'
      + (restMin === 3
        ? ' The recovery is shorter than week one — same work, less rest.'
        : '')
      // ⛔ THIS SAID "Anchor week: hold the top of the range" — a push-harder cue in the week the
      // intervals are halved, which is how a rider adds back exactly what the cut removed. Same
      // defect the run's VO2 session carried, one discipline over.
      + (anchor
        ? ' Anchor week: fewer intervals from here to the end of the block. We are maintaining your '
          + 'engine while cutting the glycogen cost in half so your quads are fully loaded for the barbell.'
        : '')
      + rideEnvironmentNote(env, 'vo2')
      + wrapperNote(wrapped),
    ...wrapped.fields,
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
  days: ReadonlyArray<{
    day: DayName | null;
    discipline: 'run' | 'bike';
    ownership: 'prescribed' | 'club';
    role?: 'intensity' | 'threshold';
  }>,
): HardRole[] {
  /**
   * ⛔⛔ INTENSITY IS THE FIRST SLOT, THRESHOLD IS THE SECOND (Michael, 2026-08-18). THIS REVERSES
   * THE 2026-08-17 RULING, WHICH REVERSED THE ONE BEFORE IT — SO READ ALL THREE BEFORE TOUCHING IT.
   *
   * 1. **Originally:** first prescribed = VO2, second = threshold — and it was DISCIPLINE-BLIND, so
   *    listing a run before a bike handed the threshold slot to the bike and an athlete with one
   *    hard run always got hills. That defect is real and is NOT what changed back.
   * 2. **2026-08-17:** inverted to threshold-first, on the reasoning that VO2 is a CNS stressor
   *    competing with the squat and the deadlift, so the one hard session a week should be the
   *    cheap one.
   * 3. **2026-08-18, Michael, after the reversal was flagged to him explicitly:** *"intensity is
   *    the first slot, threshold is second."* The high-intensity day protects the metabolic strength
   *    pathways and is the one an athlete carrying a barbell block most wants; threshold is the
   *    sustained engine-builder, and prolonged endurance work is what genuinely competes with
   *    strength adaptation.
   *
   * ⛔ WHAT SURVIVES FROM (2) AND MUST NOT BE UNDONE: the budget is the WEEK, not the discipline.
   * A first pass on 2026-08-17 made it per-discipline and the standard hybrid week — one hard run,
   * one hard ride — came out as two sustained sessions with no top-end work anywhere in the block.
   * Exactly one intensity session and, if a second hard day is asked for, exactly one threshold.
   * The order of the list picks which discipline carries which; nothing else does.
   */
  /**
   * ⛔⛔ THE ATHLETE'S OWN ALLOCATION WINS, AND IT IS THE ONLY THING ON THIS SCREEN THAT DOES
   * (Michael, 2026-08-18). Everything below this block is the FALLBACK for a goal that carried no
   * allocation — every plan built before the wizard started asking.
   *
   * ⛔ WHY IT HAD TO STOP BEING ORDER. The rule below is correct and it is INVISIBLE: an athlete
   * who picked a hard run and a hard ride got top-end work on whichever one the wizard happened to
   * list first, and no surface anywhere said so. Two athletes making the identical two picks got
   * different blocks off list order alone. The allocation is a real training decision — which sport
   * holds your speed for twelve weeks — and it now belongs to the athlete, stated on the card.
   *
   * ⚠️ THE WEEK'S BUDGET IS STILL THE WEEK'S BUDGET. This does not let an athlete buy two intensity
   * sessions; the wizard offers one allocation toggle, so picking intensity for one sport IS picking
   * threshold for the other. The engine trusts what it is handed — it is not a second gate — but
   * nothing in the UI can hand it two: the allocation is a single two-way toggle, so picking
   * intensity for one sport IS picking threshold for the other.
   */
  const allocated = days.some((h) => h.ownership !== 'club' && h.role);
  if (allocated) {
    /**
     * ⛔⛔ A HALF-ALLOCATED PAYLOAD USED TO PRODUCE TWO INTENSITY SESSIONS (found on device,
     * 2026-08-18). The first version answered per entry — `role === 'threshold' ? 'threshold' :
     * 'vo2'` — so an entry with NO role fell to `vo2`, and the wizard can legitimately send one:
     * the athlete answers the one-slot list, then adds a second hard day.
     *
     * That is the exact arrangement §7 forbids, arriving silently: two top-end sessions and no
     * sustained work anywhere in the block. ⛔ THE WEEK'S BUDGET IS ONE OF EACH AND THIS FUNCTION IS
     * WHERE IT IS ENFORCED — do not trust the caller to have written both fields. It derives the
     * single intensity INDEX: an explicit `intensity` mark wins, otherwise the first entry not
     * marked `threshold` takes it, and everything else prescribed is sustained by subtraction.
     *
     * ⚠️ MIRRORED IN `hardRoleOf` in `NonRaceBuilder.tsx`, which had the same hole and lit both
     * allocation buttons. Change both together.
     */
    /**
 * ⛔⛔ A LONE-SLOT ANSWER IS NOT AN ALLOCATION (found on device 2026-08-18). READ BEFORE SIMPLIFYING.
 *
 * **The bug, exactly:** add a hard RIDE first, answer its one-slot list — whose options are "Top-end
 * intensity" and "Sustained threshold", and whose recommended default is the former — then add a
 * hard run. The ride now carries `role: 'intensity'` and the run carries nothing, so the ride kept
 * the top-end session and the run was handed the SUSTAINED one. That is the exact inversion the
 * principled default exists to prevent: twenty-plus minutes of level footfall on the legs the
 * barbell needs, and the short concentric session on the machine that costs them nothing.
 *
 * The athlete never allocated anything. They answered "what is this session" about a session that
 * was, at that moment, the only one they had.
 *
 * **The rule that fixes it, and it is one rule for all cases:**
 *   · EVERY prescribed slot marked → the athlete used the allocation control, which writes both.
 *     Honour it exactly. This is the manual override and it must never be second-guessed.
 *   · SOME marked → the marks are inherited from a one-slot answer. A `threshold` mark is still
 *     authoritative, because it unambiguously DECLINES the top end for that session; a bare
 *     `intensity` mark is not, because it was the answer to a different question. So threshold marks
 *     remove candidates, and the intensity holder is chosen from what is left by the discipline rule.
 *   · NONE marked → the discipline rule alone.
 *
 * ⚠️ SO AN EXPLICIT "SUSTAINED THRESHOLD" ON A LONE RUN SURVIVES ADDING A RIDE — the ride takes the
 * top end, which is what the athlete asked for. Only the bare intensity mark yields.
 */
    const pres = days.map((h, i) => ({ h, i })).filter(({ h }) => h.ownership !== 'club');
    const fullyAllocated = pres.length > 0 && pres.every(({ h }) => !!h.role);
    // A threshold mark declines the top end; everything else is a candidate for it.
    const candidates = pres.filter(({ h }) => h.role !== 'threshold');
    const pick = fullyAllocated
      ? candidates.find(({ h }) => h.role === 'intensity') ?? candidates[0]
      // ⛔ THE DISCIPLINE RULE — the run holds the top end when both sports are candidates. Full
      // reasoning on this function's own header; the short version is that the SUSTAINED session is
      // the long one and belongs on the machine with no footfall.
      : (candidates.find(({ h }) => h.discipline === 'run') ?? candidates[0]);
    const intensityIdx = pick?.i ?? -1;
    const chosen: HardRole[] = days.map((h, i) =>
      h.ownership === 'club' ? 'club' : i === intensityIdx ? 'vo2' : 'threshold'
    );
    /**
     * ⛔ THE CLUB RULE SURVIVES THE ALLOCATION, AND IT IS NOT AN OVERRIDE OF THE ATHLETE — IT IS THE
     * SAME BUDGET. A group run or ride already IS the sustained session (a pack settles into exactly
     * that rhythm and precise intervals with strict rest are near-impossible in one), so it consumes
     * the threshold slot whatever anyone allocated. Letting a second threshold through would give
     * the block TWO sustained sessions and no top-end work anywhere — the exact arrangement the
     * per-discipline budget bug produced on 2026-08-17.
     *
     * ⚠️ THE WIZARD HIDES THE TOGGLE WHEN A CLUB SLOT IS PRESENT, so in practice this fires only for
     * a draft saved before that gate and then edited. It is the safety net, not the path.
     */
    if (chosen.includes('club')) {
      for (let i = 0; i < chosen.length; i++) if (chosen[i] === 'threshold') chosen[i] = 'vo2';
    }
    return chosen;
  }

  /**
   * ⛔⛔ THE DEFAULT IS THE RUN, AND IT IS A TRAINING RULE — NOT LIST ORDER (Michael, 2026-08-18:
   * *"principled; never rely on list order. An array sort change in the future shouldn't
   * biologically alter an athlete's week."*).
   *
   * **What it replaced:** the first prescribed slot took the intensity session. That is the wizard's
   * tap order reaching into the physiology — two athletes making identical picks got different
   * twelve-week blocks depending on which chip they touched first, and a future `.sort()` anywhere
   * upstream would have silently rewritten someone's training.
   *
   * **The rule: when one discipline is a run and the other a ride, the RUN holds the top-end
   * session and the RIDE holds the sustained one.** The mechanism is the sustained session, not the
   * intensity one:
   *
   *   · The threshold session is the LONG one — 4 x 5 min building to 2 x 10 min of work. On a run
   *     that is twenty-plus minutes of level footfall at a submaximal effort; on a bike it is zero
   *     footfall. Putting it on the bike removes the block's largest single block of repetitive
   *     impact from the legs the barbell needs.
   *   · The run's intensity session then defaults to hills (`goal: 'vo2'`), which is the cheapest
   *     option on the legs by this file's own ranking — uphill removes the impact transient
   *     entirely. So the run keeps the short concentric session and sheds the long eccentric one.
   *
   * ⚠️ ONE CORRECTION TO THE REASONING AS GIVEN, RECORDED BECAUSE IT WOULD MISLEAD THE NEXT READER.
   * The brief said the default lets the engine *"apply the survival tier cuts"*. It does not — no
   * such mechanism exists. `resolveEnduranceTier` reads the hard-day COUNT and total HOURS and is
   * completely blind to which sport holds which role. The conclusion stands on the paragraph above
   * it; the tier is not part of it.
   *
   * ⛔ WHAT THIS COSTS, AND IT IS A REAL COST: a goal written before the allocation toggle existed
   * carries no role, so it takes this fallback — and a run+ride goal whose RIDE was listed first
   * now rebuilds with the roles swapped. That is the byte-identical guarantee being deliberately
   * traded away, which is exactly what "never rely on list order" asks for.
   *
   * ⚠️ ORDER STILL DECIDES WHEN THE RULE CANNOT SPEAK — two runs, or two rides. There is no
   * discipline asymmetry to read there, so the first slot takes it and the labels say "Primary".
   */
  const prescribed = days.map((h, i) => ({ h, i })).filter(({ h }) => h.ownership !== 'club');
  const runIdx = prescribed.find(({ h }) => h.discipline === 'run')?.i ?? -1;
  const rideIdx = prescribed.find(({ h }) => h.discipline === 'bike')?.i ?? -1;
  const defaultIntensityIdx = runIdx >= 0 && rideIdx >= 0
    ? runIdx
    : (prescribed[0]?.i ?? -1);

  const roles: HardRole[] = days.map((h) => (h.ownership === 'club' ? 'club' : 'vo2'));
  // ⚠️ A CLUB DAY IS THE SUSTAINED SESSION — a group run or ride settles into exactly that rhythm and
  // precise intervals with strict rest are near-impossible in a pack — so it consumes the THRESHOLD
  // slot and the app's own days stay on intensity.
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === 'club') continue;
    roles[i] = i === defaultIntensityIdx ? 'vo2' : 'threshold';
  }
  if (roles.includes('club')) {
    // The club already holds the sustained slot; nothing prescribed may take it as well.
    for (let i = 0; i < roles.length; i++) if (roles[i] === 'threshold') roles[i] = 'vo2';
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

/**
 * ⛔ THE FOUR TERRAIN CORES — AND THREE OF THEM ARE `selfWrapped`, WHICH IS THE ONE FLAG THAT STOPS
 * THIS STAGE DOUBLING THEIR WARM-UP (2026-08-20, stage 1).
 *
 * The `run_hills_*` expander builds its own bracket — 600 s before, 480 or 600 s after
 * (`materialize-plan:1779`, `:1831`) — so `workSeconds` here counts the WHOLE token including that
 * bracket, and `quality-session.ts` adds nothing. `run_vo2_*` brackets nothing, so `flatCore` is
 * the one that takes an external wrapper, exactly as `flatSession` has passed two separate presets
 * since it shipped.
 *
 * ⚠️ THEY COME THROUGH THE CONSTRUCTOR ANYWAY, AND THAT IS THE POINT OF THE STAGE. Three of the
 * four were already correct — on LEADER weeks. Nobody had computed the anchor weeks, where the rep
 * count halves and the stated duration did not move: `HILL_SESSION_MIN` said 35 on every week of
 * twelve while the anchor's token comes to 27. Routing them here recomputes the duration per week
 * and puts them under the same sweep assertion as everything else.
 */
function hillCore(wave: HardWave, jogged: boolean): QualityCore {
  const reps = vo2RepsFor(4, wave);
  return {
    tokens: [`run_hills_${reps}x180s_rlap_g5_8_d${jogged ? 'jog' : 'walk'}`],
    // 10 min warm-up + reps × 3 min + 10 min cool-down. The descents carry no clock at all.
    workSeconds: 600 + reps * 180 + 600,
    // ⛔ THE ONE SESSION WHOSE STEPS CANNOT ADD UP, AND `workSeconds` DOES NOT PRETEND OTHERWISE.
    // Each descent ends on the lap button, so it reaches the watch with no duration and contributes
    // ZERO to `total_duration_seconds` — the absence IS the instruction (`hills-lap-button.test.ts`).
    // So the stated duration is the CLOCKED time, exactly what the athlete's card will read, and the
    // minutes the descents really take live in the allowance instead. `HILL_SESSION_MIN` is 35
    // against 32 clocked, and that three-minute headroom is what it has always been for.
    selfWrapped: true,
  };
}

function shortHillCore(wave: HardWave, jogged: boolean): QualityCore {
  const reps = vo2RepsFor(10, wave);
  return {
    tokens: [`run_hills_${reps}x60s_r60s_g4_6_d${jogged ? 'jog' : 'walk'}`],
    // ⚠️ THE FIXED-RECOVERY BRANCH COOLS DOWN IN 8, NOT 10 (`materialize-plan:1861`). Reading the
    // lap-button branch's 10 onto this one is two minutes of drift on three sessions.
    workSeconds: 600 + reps * 60 + Math.max(0, reps - 1) * 60 + 480,
    selfWrapped: true,
  };
}

function treadmillCore(wave: HardWave): QualityCore {
  const reps = vo2RepsFor(4, wave);
  return {
    // ⚠️ `_tm` IS A LABEL SWITCH AND CHANGES NO DURATION — it shares the fixed-recovery branch.
    tokens: [`run_hills_${reps}x180s_r180s_g5_8_djog_tm`],
    workSeconds: 600 + reps * 180 + Math.max(0, reps - 1) * 180 + 480,
    selfWrapped: true,
  };
}

function flatCore(wave: HardWave): QualityCore {
  const reps = vo2RepsFor(4, wave);
  return {
    // ⚠️ `_r180s_` IS THE EXPLICIT FLOAT. The token defaults to 90 s, which would be a materially
    // harder session than the one this is costed as.
    tokens: [`run_vo2_${reps}x3min_r180s_z5`],
    workSeconds: reps * 180 + Math.max(0, reps - 1) * 180,
    selfWrapped: false,
  };
}

/**
 * ⛔ THE VO2 SESSION YIELDS IN THE ANCHOR TOO (Michael, 2026-08-18) — AND IT WAS THE LAST HARD
 * SESSION IN THE BLOCK THAT DID NOT.
 *
 * The recipe suite caught it on its first run: sprints cut 6 → 4 and threshold cuts 20 → 10 min in
 * the anchor, and this session's token was byte-identical every week — its copy even said *"this is
 * the fastest this session gets in the block"*, which is the opposite of a taper. Defensible while
 * hills were what a SECOND hard day unlocked; not defensible from 2026-08-18, when they became the
 * DEFAULT and the common athlete started running the block's only untapered quality session into
 * the weeks the barbell peaks in.
 *
 * ⛔ THE ARGUMENT IS CONCENTRIC, NOT ECCENTRIC, and that is why "hills spare the legs" did not save
 * it. Uphill running removes the braking impact — the knees and quads keep that discount — but four
 * three-minute efforts at maximum heart rate still cost concentric fatigue, local glycogen and CNS
 * stress. Michael: *"you cannot express a 1RM on the squat rack if you spent 12 minutes at maximum
 * heart rate two days prior."*
 *
 * | weeks | reps | |
 * |---|---|---|
 * | 1-3, 5-7 | full | the baseline engine builder |
 * | 9-11 | **halved** | the cardiovascular volume slashed so the legs arrive fresh for the heaviest lifts |
 *
 * ⚠️ WEEKS 4, 8 AND 12 ARE NOT IN THE TABLE. His map says two reps there; the light-week rule
 * DELETES every hard session on those weeks, which was ruled on 2026-08-18 for the sprint map and
 * holds here for the same reason — a halved maximal session leaves the nervous system simmering.
 *
 * ⚠️ AND IT APPLIES TO ALL FOUR GROUNDS, NOT ONLY THE HILL. Michael named the hill session; the
 * argument is about VO2 VOLUME and not about the surface, so a treadmill athlete left untapered
 * would be the same gap wearing a different terrain. The short-hill session halves its ten reps to
 * five on the same rule.
 * ⛔ THE BIKE'S 4 × 4 IS STILL UNTAPERED and is flagged rather than changed: it is Helgerud's
 * published protocol, he named a RUN table, and extending someone else's protocol on my own
 * reasoning is the thing this file keeps deleting.
 */
function vo2RepsFor(full: number, wave: HardWave): number {
  return wave.cycleKind === 'anchor' ? Math.max(1, Math.round(full / 2)) : full;
}

function hillSession(day: string, lowerDays: string[] = [], wave?: HardWave): PlanSession {
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
  const wrapped = wrapQualitySession(
    hillCore(wave ?? { weekInCycle: 1, cycleKind: 'leader' }, jogged),
    HILL_SESSION_MIN,
    'run',
  );
  const reps = vo2RepsFor(4, wave ?? { weekInCycle: 1, cycleKind: 'leader' });
  return {
    day,
    type: 'run',
    name: 'Hill Repeats',
    // ⛔ NO PACE, ANYWHERE IN THIS COPY. The pace-effort relationship changes with gradient, so a
    // pace target here is false precision (§2.2). Effort and grade only.
    description:
      `${reps} × 3 min hard uphill on a 5-8% grade, ${jogged ? 'easy jog' : 'walk'} back down. `
      + 'The descent has no timer — press the lap button at the bottom and the next rep starts. '
      + 'Hard means hard — you should not be able to hold a sentence. No pace target: on a hill the '
      + 'number would be wrong. The climb is what keeps this cheap on your legs, so the lifting '
      + 'still gets what it needs.'
      + (jogged
        ? ''
        : ' Walk the descents — running down is the part that would reach your next heavy day.'),
    ...wrapped.fields,
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

function shortHillSession(day: string, lowerDays: string[] = [], wave?: HardWave): PlanSession {
  const jogged = descentIsJogged(day, lowerDays);
  const wrapped = wrapQualitySession(
    shortHillCore(wave ?? { weekInCycle: 1, cycleKind: 'leader' }, jogged),
    SHORT_HILL_SESSION_MIN,
    'run',
  );
  const reps = vo2RepsFor(10, wave ?? { weekInCycle: 1, cycleKind: 'leader' });
  return {
    day,
    type: 'run',
    name: 'Short Hill Repeats',
    // ⛔ NO PACE, ANYWHERE IN THIS COPY — same reason as the 3-minute session (§2.2).
    description:
      `${reps} × 1 min hard uphill on a 4-6% grade, 1 min ${jogged ? 'easy jog' : 'walk'} back down. `
      + 'Hard means hard — you should not be able to hold a sentence. No pace target: on a hill the '
      + 'number would be wrong. Shorter reps buy less time at the top end than the 3-minute version, '
      + 'so this is the session for the hill you have rather than the better one. The climb is still '
      + 'what keeps it cheap on your legs.'
      + (jogged
        ? ''
        : ' Walk the descents — running down is the part that would reach your next heavy day.'),
    ...wrapped.fields,
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

function treadmillSession(day: string, wave?: HardWave): PlanSession {
  const reps = vo2RepsFor(4, wave ?? { weekInCycle: 1, cycleKind: 'leader' });
  // ⚠️ `_tm` IS A LABEL SWITCH ONLY — the structure is identical to the outdoor fixed-recovery hill.
  // Without it the watch reads "Hill · 5-8% grade" and "Jog down" on a machine with no hill and no
  // down, which is the same species of wrong as a pace target on a gradient: a step label that
  // describes a session the athlete is not doing.
  const wrapped = wrapQualitySession(
    treadmillCore(wave ?? { weekInCycle: 1, cycleKind: 'leader' }),
    TREADMILL_SESSION_MIN,
    'run',
  );
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
    ...wrapped.fields,
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

function flatSession(day: string, wave?: HardWave): PlanSession {
  const reps = vo2RepsFor(4, wave ?? { weekInCycle: 1, cycleKind: 'leader' });
  const wrapped = wrapQualitySession(
    flatCore(wave ?? { weekInCycle: 1, cycleKind: 'leader' }),
    FLAT_SESSION_MIN,
    'run',
  );
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
    // ⚠️ THREE PRESETS, NOT ONE — `run_vo2_*` brackets nothing itself, and `_r180s_` is the explicit
    // float (the token defaults to 90 s, which would make this a materially harder session than the
    // one costed above). ⛔ THE TWO BRACKETING PRESETS NOW COME FROM THE CONSTRUCTOR RATHER THAN
    // FROM THIS LITERAL, AND ON A LEADER WEEK IT EMITS THE SAME TWO STRINGS BYTE FOR BYTE — 41 min
    // allowance, 21 min of work, 20 left over, split 10 and 10. That is the check on the whole
    // stage: the one session that was already correct is reproduced exactly by the thing replacing
    // the four that were not. ⚠️ On an ANCHOR week the rep count halves and the wrapper grows to
    // absorb it, which is the leak this session used to carry in silence with the rest of them.
    ...wrapped.fields,
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
export function hardRunSessionMinutes(terrain?: HardRunTerrain, goal: HardRunGoal = 'vo2'): number {
  // ⚠️ THE VOLUME BUDGETS SUBTRACT THIS, so a sprint session that reported a hill's length would be
  // paid for twice — the defect §7 already fixed once for the threshold session.
  // ⛔ ASKED OF THE SESSION, NOT OF A CONSTANT (2026-08-20). This returned 35 while the plan built
  // 14, and the 21-minute difference was handed back to the athlete as easy miles every week. The
  // constructor is now the only thing that answers "how long is this", here and in the week loop.
  if (goal === 'speed') {
    return qualityBudgetMinutes(
      ALL_HARD_WAVES.map(sprintCore),
      SPRINT_ALLOWANCE_MIN,
      'run',
    );
  }
  switch (terrain) {
    case 'hill_short': return SHORT_HILL_SESSION_MIN;
    case 'treadmill': return TREADMILL_SESSION_MIN;
    case 'flat': return FLAT_SESSION_MIN;
    case 'hill_3min':
    default: return HILL_SESSION_MIN;
  }
}

/**
 * ⛔ FLAT SPRINTS — THE SPEED TRACK'S SESSION (Michael, 2026-08-18). A retaining load that syncs
 * with the barbell, NOT a progressive track programme.
 *
 * *"Because this is a Strong Focus block, this is a retaining load that must sync with the barbell.
 * Do not add volume; just pay the biological rent to hold the speed adaptation."*
 *
 * | weeks | reps | why |
 * |---|---|---|
 * | 1-3, 5-7 (leaders) | **6** | the baseline. Flat across the wave — volume never climbs |
 * | 9-11 (anchor) + 12 | **4** | peripheral leg fatigue and eccentric damage stripped away so the legs are fresh to express maximum strength on the heavy tests |
 *
 * ⛔ COMPLETE WALKING RECOVERY, AND IT IS THE PRESCRIPTION RATHER THAN A DETAIL. 10-15 s at maximum
 * effort is a neural session; an incomplete recovery turns it into a lactate session, which is the
 * one thing it must not become in a block that already has a threshold day.
 *
 * ⚠️ THE CARD SAYS 48h AND THE SCHEDULER ENFORCES 36h — RULED 2026-08-18, AND THE GAP IS INTENDED.
 *
 * Hard footfall at maximum velocity is real mechanical damage, and the speed track's copy says so.
 * `week-model`'s `COST` gives an uncoupled hard day 36h and does not distinguish a sprint from a
 * hill. Michael, asked directly: **leave the scheduler alone.**
 *
 * ⛔ THE REASON IS THE PART TO KEEP, because 36 reads like a rounding error next to 48 and someone
 * will "correct" it: *"a 36-hour gap functionally forces TWO NIGHTS OF SLEEP between the sessions —
 * Monday 6pm sprint to Wednesday 6am heavy squat is 36 hours. Muscle glycogen replenishment and
 * acute eccentric inflammation reduction depend heavily on sleep cycles. As long as the scheduler
 * forces that two-sleep gap, the athlete clears the biological threshold."*
 *
 * ⚠️ SO THE UNIT THAT MATTERS IS SLEEPS, NOT HOURS, and 36 is what buys two of them at every hour of
 * the day. ⛔ Do not raise it to 48 to match the copy; that would cost a training day to make two
 * numbers look alike.
 */
/** The allowlist. ⚠️ An unrecognised environment degrades to "not asked", never to a default that
 *  would put words about a smart trainer on the card of someone who does not own one. */
const RIDE_ENVIRONMENTS: HardRideEnvironment[] =
  ['smart_trainer', 'stationary', 'flat_road', 'hill_climb', 'long_climb'];

/**
 * ⛔ THE ONE SENTENCE THE ENVIRONMENT BUYS — and it is COPY, not a change to the session. The
 * intervals and the threshold blocks are identical wattages wherever they are ridden; what differs
 * is whether the athlete can actually hold them, which is a fact about the road and not about the
 * prescription.
 */
function rideEnvironmentNote(env: HardRideEnvironment | undefined, role: 'vo2' | 'threshold'): string {
  /**
   * ⛔ THE WIZARD NO LONGER ASKS THIS AT ALL (Michael, 2026-08-18), SO THIS IS THE LIVE BRANCH.
   *
   * The environment menu changed no token, no duration and no rep count — it changed this sentence
   * and nothing else, which made it a question the builder had no business asking. It is gone, and
   * the requirement it existed to express is stated here instead: what the session needs from the
   * road, and which setups give it. The athlete decides on the day, when they know the weather.
   */
  if (!env) {
    return role === 'threshold'
      ? ' Ride it somewhere you will not have to stop — a trainer, or a road stretch with no '
        + 'junctions. The adaptation is in the unbroken minutes, and every stoplight restarts them.'
      : ' Ride it somewhere you can go to the limit safely — a trainer, a climb, or a clear road. '
        + 'Anywhere you have to watch for traffic, you will hold back without meaning to.';
  }
  const uninterrupted = role === 'threshold';
  switch (env) {
    case 'smart_trainer':
      return ' On the trainer in erg mode: it holds the number, so all you do is pedal.';
    case 'stationary':
      return ' On a gym bike there is no power to read, so ride it by effort — hard enough that a '
        + 'sentence is a struggle.';
    case 'flat_road':
      return uninterrupted
        ? ' On the road, pick a stretch you can ride unbroken — every stop restarts the effort, and '
          + 'the adaptation is in the uninterrupted minutes.'
        : ' On the road, use a stretch with no junctions: you cannot redline safely with a stoplight '
          + 'in front of you.';
    case 'hill_climb':
      return ' On the climb, the gradient holds the effort for you — ride it back down easy.';
    case 'long_climb':
      return ' A long steady climb is the easiest place to hold this: the gradient does the pacing '
        + 'and nothing interrupts it.';
  }
}

const SPRINT_REPS_LEADER = 6;
const SPRINT_REPS_ANCHOR = 4;
/** Seconds of maximum effort per rep — the middle of Michael's 10-15 s. */
const SPRINT_WORK_SEC = 12;
/** Complete walking recovery — the middle of his 2-3 min. */
const SPRINT_REST_SEC = 150;
const SPRINT_ALLOWANCE_MIN = 35;

function sprintRepsFor(wave: HardWave): number {
  return wave.cycleKind === 'anchor' ? SPRINT_REPS_ANCHOR : SPRINT_REPS_LEADER;
}

/**
 * ⛔ THE WORK, EXACTLY AS `run_sprint_*` EXPANDS IT (`materialize-plan:1619`): the efforts plus the
 * walk-backs BETWEEN them. Six × 12 s with 150 s walks is **822 seconds** — 13.7 minutes, not 14 —
 * and the fraction is why `workSeconds` is in seconds. Rounding here instead of at the end puts
 * this 18 seconds away from what the plan will say.
 */
function sprintCore(wave: HardWave): QualityCore {
  const reps = sprintRepsFor(wave);
  return {
    tokens: [`run_sprint_${reps}x${SPRINT_WORK_SEC}s_r${SPRINT_REST_SEC}s`],
    workSeconds: reps * SPRINT_WORK_SEC + (reps - 1) * SPRINT_REST_SEC,
    selfWrapped: false,
  };
}

function sprintSession(day: string, wave: HardWave, terrain?: HardRunTerrain): PlanSession {
  const reps = sprintRepsFor(wave);
  const wrapped = wrapQualitySession(sprintCore(wave), SPRINT_ALLOWANCE_MIN, 'run');
  /**
   * ⛔ ABSENT NO LONGER MEANS "ASSUME A TRACK" (Michael, 2026-08-18). The wizard stopped asking which
   * flat surface, because standing in a builder twelve weeks out is the wrong moment to answer it —
   * *"let the materializing explain what their options are."* So the session states the requirement
   * and lists what satisfies it, and the athlete answers on the morning they run it.
   *
   * ⚠️ AN EXPLICIT PICK IS STILL HONOURED. Old goals carry one and read exactly as they did.
   */
  const ground = terrain === 'turf'
    ? 'on grass or turf'
    : terrain === 'flat_road'
      ? 'on a flat road'
      : terrain === 'track'
        ? 'on a track'
        : 'on any flat, predictable surface with room to run out — a track, a quiet flat road, or '
          + 'grass if your legs want the softer landing';
  return {
    day,
    type: 'run',
    name: 'Flat Sprints',
    description:
      `${reps} × ${SPRINT_WORK_SEC} seconds at maximum effort ${ground}, walking back between each. `
      + 'Take the full two to three minutes — this is a speed session, and a short recovery turns it '
      + 'into a lactate session instead. '
      + (wave.cycleKind === 'anchor'
        // ⛔ THE ANCHOR CUT IS THE POINT OF THE WHOLE TABLE, so the card says why rather than just
        // printing a smaller number the athlete reads as the plan losing interest.
        ? 'Fewer reps from here to the end of the block: the legs are being cleared so they can '
          + 'express maximum strength on the heavy lifts.'
        : 'The number does not climb across the block. This holds the speed you have; the barbell '
          + 'is what is being built.')
      // ⛔ THIS SESSION IS THE REASON THE WHOLE STAGE EXISTS, SO ITS COPY CARRIES THE WHY. Six
      // maximal 12-second efforts is the one session in the block where an absent warm-up is an
      // injury and not a quality problem — maximal running velocity is where hamstring strains
      // happen — and until 2026-08-20 this reached the watch with an empty warm-up array.
      // ⚠️ VOICE: the fact, then the consequence, conditional, no imperative.
      + wrapperNote(wrapped)
      + ' A maximal effort from cold is where sprint injuries happen, so the easy running before it '
      + 'is part of the session rather than optional preparation for it.',
    ...wrapped.fields,
    tags: ['quality', 'run', 'speed', 'neuromuscular'],
  };
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
  goal: HardRunGoal = 'vo2',
): PlanSession {
  // ⛔ THE SPEED TRACK IS A DIFFERENT SESSION, NOT A TERRAIN OF THE VO2 ONE. It returns whole: no
  // wave cue is appended, because its progression is a volume CUT rather than an effort climb and
  // the "go a little faster than last week" line below would contradict the table it runs on.
  if (goal === 'speed') return sprintSession(day, wave, terrain);
  const base = (() => {
    switch (terrain) {
      case 'hill_short': return shortHillSession(day, lowerDays, wave);
      case 'treadmill': return treadmillSession(day, wave);
      case 'flat': return flatSession(day, wave);
      case 'hill_3min':
      default: return hillSession(day, lowerDays, wave);
    }
  })();
  /**
   * ⛔ THE SAME MOVE AS THE SPRINT AND THE RIDE (2026-08-18): the wizard asks for INCLINE, not for
   * WHICH incline. A hill and a treadmill are peers on this session's own ranking — the belt IS the
   * grade — so making the athlete choose between them in a builder bought nothing the day card
   * cannot say better. `hill_3min` is still what gets BUILT; this names the substitute.
   *
   * ⚠️ ONLY WHEN NOTHING WAS PICKED. An athlete who chose `treadmill` reads the treadmill session
   * and must not be told to find a hill.
   */
  const groundNote = terrain === undefined
    ? ' No hill outside? A treadmill at 5-8% is the same session — the belt is the gradient, and it '
      + 'takes the impact out the same way.'
    : '';
  const step = Math.min(Math.max(1, Math.round(wave.weekInCycle)), 3);
  // ⛔ THIS CUE SAID "THIS IS THE FASTEST THIS SESSION GETS IN THE BLOCK", WHICH IS THE OPPOSITE OF
  // WHAT THE ANCHOR NOW DOES. The reps are halved there; a line telling the athlete to push hardest
  // in the week the volume was cut would have them add back exactly what the cut removed.
  const cue = wave.cycleKind === 'anchor'
    // ⚠️ "run them well" WAS IN THIS LINE AND THE VOICE LINT CAUGHT IT — `well` is a banned word,
    // and the clause was doing nothing the two sentences before it do not already say.
    ? ' Anchor week: fewer reps from here to the end of the block. The barbell is peaking, and this '
      + 'is the cardiovascular volume getting out of its way.'
    : step === 1
      ? ' First week of the wave: settle on an effort you can hold for all four reps, and remember it.'
      : ' Same reps, same hill: go a little faster than last week, and hold it for every rep.';
  return { ...base, description: `${base.description}${groundNote}${cue}` };
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
  // ⛔ THE RIDE ASK IS NOT DERIVED ON THIS LINE ANY MORE (stage 4, 2026-08-21). `hasBike` stood
  // here and seven more ride variables grew out of it over the next 1,900 lines. They are one
  // object now — `rideIntent`, built once below, AFTER `hardRideCount`, because a hard ride is one
  // of the picked ride days and that subtraction happens exactly once.
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
   * ⚠️ WHAT SURVIVED FROM THE INFERENCE PASS is the part that was never about priority:
   * `runIntent.selected` / `rideIntent.selected`. A sport the athlete chose must never silently vanish, and knowing which
   * were chosen is what makes that checkable. Selection needs a POSITIVE signal — `enduranceFrequency`
   * arrives from `create-goal` with a default of 2 even for a bike-only athlete, so reading it as
   * selection invents a sport nobody asked for.
   */
  // ⛔ `askedRunMiles` STOOD HERE (stage 4 run half, 2026-08-22). The typed miles, the easy pace,
  // the run count and the long-run day were four loose reads of `args` scattered across 1,200 lines;
  // they are one object now — `runIntent`, built below beside the ride's, for the same reason and
  // with the same contract. See `_shared/athlete-weekly-intent.ts`.
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
    /** ⚠️ These three were being PUSHED onto this shape without being declared on it, which the
     *  loose client `strict: false` and Deno's `--no-check` between them let through. Named now, so
     *  the next reader can see what a request actually carries. */
    goal?: HardRunGoal;
    environment?: HardRideEnvironment;
    /** The athlete's own allocation — see `assignHardRoles`. */
    role?: 'intensity' | 'threshold';
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
  /** Days the athlete put TWO hard sessions on. Surfaced below rather than dropped in silence. */
  const doubledHardDays: string[] = [];
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
    /**
     * ⛔ TWO HARD SESSIONS ON ONE DAY IS A DOUBLE, NOT TWO HARD DAYS — and it is now SAID rather
     * than silently dropped (Michael, 2026-08-18).
     *
     * The entry still does not build: a double is a different stimulus with a different recovery
     * cost, and nothing in this block has been reasoned about for one. What changed is that the
     * athlete used to tap a day, watch the app accept it, and receive a plan with one session in it
     * and no explanation. His words: *"a silent drop doesn't feel like a rule; it just looks like a
     * broken button."*
     *
     * ⚠️ SO THE UI NO LONGER BLOCKS THE TAP EITHER. The pin lands, the chip shows, and this line is
     * what tells them what the plan did with it. ⛔ Do not restore the lock in the wizard and do not
     * make this silent again — one of the two has to speak, and the plan is the one that knows.
     */
    if (day && requestedHardDays.some((h) => h.day === day)) {
      doubledHardDays.push(day);
      continue;
    }
    requestedHardDays.push({
      day,
      discipline: raw.discipline,
      ...(raw.terrain ? { terrain: raw.terrain } : {}),
      // ⚠️ SAME ALLOWLIST DISCIPLINE AS TERRAIN — an unrecognised goal degrades to the shipped
      // behaviour (`vo2`), never to no session.
      ...(raw.goal === 'speed' ? { goal: 'speed' as const } : {}),
      ...(RIDE_ENVIRONMENTS.includes(raw.environment as HardRideEnvironment)
        ? { environment: raw.environment as HardRideEnvironment } : {}),
      ...(raw.role === 'intensity' || raw.role === 'threshold' ? { role: raw.role } : {}),
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
    goal?: HardRunGoal;
    environment?: HardRideEnvironment;
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
  /**
   * ⛔ THE RUN ASK, RESOLVED ONCE (stage 4 run half, 2026-08-22). Every run site below reads THIS.
   *
   * Built HERE and not earlier for the same reason the ride's is: `seatRunIntent` needs
   * `hardRunCount`, and the object's contract is that the subtraction is already done by the time
   * anyone reads it. ⚠️ The run needs the hard count for SELECTION too, not only for seating — a
   * hard run means the athlete runs, whatever else they did or did not type — which is why the ask
   * takes `hasHardRun` rather than deriving it.
   */
  const runIntent = buildRunIntent<DayName>({
    targetWeeklyMiles: args.targetWeeklyMiles,
    easyPaceMinPerMile: args.easyPaceMinPerMile,
    enduranceFrequency: args.enduranceFrequency,
    longRunDay: args.longRunDay,
    primaryIsRun: enduranceSport === 'run',
    hasHardRun: hardRunCount > 0,
    resolveDay: asDay,
  }, hardRunCount);
  /**
   * ⛔ THE SWIM IS A COUNT AND STAYS ONE (D-323 §5 — booked, not coached). This object consolidates
   * where that count is stored and adds nothing: no long day, no volume, no session template.
   */
  const swimIntent = resolveSwimAsk({ swimDays: args.swimDays });
  /**
   * ⛔ THE RIDE ASK, RESOLVED ONCE (stage 4, 2026-08-21). Every ride site below reads THIS.
   *
   * Built HERE and not earlier because `seatRideIntent` needs `hardRideCount`: a hard ride is one of
   * the picked ride days, and the object's contract is that the subtraction is already done by the
   * time anyone reads it. ⚠️ Nothing above this line needs a ride fact — checked, not assumed.
   */
  const rideIntent = buildRideIntent<DayName>({
    bike: args.bike,
    targetWeeklyRideHours: args.targetWeeklyRideHours,
    primaryIsBike: enduranceSport === 'bike',
    resolveDay: asDay,
  }, hardRideCount);

  if (runIntent.longDay) {
    pins.push({ day: runIntent.longDay, kind: 'long_run', label: 'your long run' });
  }
  // ⛔ THE LONG RIDE PINS TOO. It is a leg-dominant LONG session, so the law gives it the same 48h
  // clearance from heavy lower-body work as the long run (`schedule-session-constraints.ts`). Until
  // now it was collected at intake, written to the goal, and never forwarded — so the bar was placed
  // as though the athlete's biggest ride of the week did not exist.
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
  if (rideIntent.longDay) {
    pins.push({ day: rideIntent.longDay, kind: 'long_ride', label: 'your long ride' });
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
  // A long day the athlete PINNED is still honoured either way (`runIntent.longDay`, above).
  // ⚠️ THIS GUARD STAYS, AND IT IS NOT THE ABSORPTION BUG. The others dropped a day the ATHLETE
  // CHOSE; this one declines to invent a DEFAULT on a day already spoken for. Never adding an
  // unrequested session is the opposite failure from silently removing a requested one.
  if (!runIntent.longDay && runIntent.selected && !pins.some((p) => p.day === DEFAULT_LONG_DAY)) {
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
  /**
   * ⛔ IT MISSED THE SPRINT SESSION — THE ONE SESSION IT WAS MOST FOR (found 2026-08-18).
   *
   * The test was `terrain === 'flat'`, which is §2.0's last-resort **VO2 intervals on level ground**.
   * The **Flat Sprints** session — maximum-effort efforts on a track, a flat road or turf — carries
   * `goal: 'speed'` and one of `track` / `flat_road` / `turf`, so it matched NOTHING here and got the
   * ordinary 24h. That is backwards: repeated maximal flat footfall is a harder eccentric hit than
   * sustained flat intervals, and it is the session whose own card tells the athlete it *"requires
   * strict clearance before the barbell."* The screen was promising a clearance the solver was not
   * asking for.
   *
   * ⛔ THE AXIS IS FLAT FOOTFALL, NOT A TERRAIN NAME. Both flat tracks qualify; every incline is
   * exempt, because removing the impact transient is the entire argument for choosing a hill.
   */
  const isFlatFootfall = (h: { discipline: string; terrain?: HardRunTerrain; goal?: HardRunGoal }) =>
    h.discipline === 'run' && (h.goal === 'speed' || h.terrain === 'flat');
  const flatHardRunDays = new Set(
    pinnedHardDays.filter(isFlatFootfall).map((h) => String(h.day)),
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
  // The run count once counted only the EASY runs and the hill session was pushed on top, so an athlete who
  // asked for three run days got four: three easy runs plus hills. It also over-spent the mileage —
  // the typed weekly miles were distributed across all three easy runs and then a fourth running
  // session was added outside the budget entirely.
  //
  // Michael, counting his own week: *"one of the runs is the hill session."* It is. A hard run is a
  // run. The block carries ONE hard aerobic session (D-327), so when it is a run it consumes one of
  // the days the athlete asked for rather than arriving beside them.
  //
  // ⚠️ Floor of 1 easy run: even at 2 run days with a hard day, the long run survives. The doctrine's
  // precondition is easy volume (parent §4) — a week of nothing but the hard session is the one
  // shape it explicitly rules out.
  /**
   * ⛔ FREQUENCY IS WHERE MAINTENANCE BITES — not volume (2026-08-08). See the priority model above:
   * the leading sport keeps the day count the athlete asked for; a sport held at maintenance is
   * capped at ~2 easy sessions, which is the dose the aerobic base holds on. Their typed VOLUME is
   * ⛔ THE PICKED COUNT IS BUILT, FULL STOP (2026-08-08). No priority cap, no maintenance cap —
   * 2/3/4 runs and 1/2/3 rides are wizard answers and this file's job is to seat them.
   */
  /**
   * ⛔ THE RUN COUNTS ARE NOT DERIVED HERE ANY MORE (stage 4 run half, 2026-08-22). `askedRunDays`,
   * `runFreq`, `runHasLongDay` and `easyRunsWanted` stood on these lines; they are
   * `runIntent.askedDays`, `.daysAfterHard`, `.hasLongDay` and `.easyWanted`, resolved once beside
   * the hard-day counts above. Their reasoning moved WITH them into
   * `_shared/athlete-weekly-intent.ts`, unchanged — the 1-4 range and why 1 is a real answer, the
   * hard run being one of the picked days, and the long run being a session rather than an extra.
   */
  /**
   * ⛔ THE RIDE COUNTS ARE NOT DERIVED HERE ANY MORE (stage 4, 2026-08-21). `askedRideDays`,
   * `rideHasLongDay` and `ridesWanted` stood on these lines; they are `rideIntent.askedDays`,
   * `.hasLongDay` and `.easyWanted`, resolved once beside the hard-day counts above. Their reasoning — the
   * 1-4 ceiling, the long ride needing a session left over, the hard ride counting as one of the
   * picked days — moved WITH them into `_shared/athlete-weekly-intent.ts`, unchanged.
   */

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
    ...Array.from({ length: runIntent.easyWanted }, (_, i) => ({ name: `easy_run:${i}`, kind: 'easy_run' as const })),
    ...Array.from({ length: rideIntent.easyWanted }, (_, i) => ({ name: `easy_bike:${i}`, kind: 'easy_bike' as const })),
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
   * ⛔⛔ NOTHING YIELDS. THE WEEK THE ATHLETE ASKED FOR IS ALWAYS BUILT, AND THE COST IS STATED
   * (Michael, 2026-08-21 — the stage 5 ruling, and it settles the question §2.2 of the trace report
   * raised).
   *
   * **What stood here.** A loop that dropped hard days from the end, one at a time, until the week
   * came back legal — *"when the week cannot hold everything, a hard day yields, the bar does not"*
   * (audit 2026-08-17). It was written against the SLOT solver, which returned `unsolvable` for a
   * week it could not place strictly, and `unsolvable` meant **no legal week exists**.
   *
   * ⛔ THE SIGNAL IT WAITED ON CANNOT ARRIVE. `solveWithWeekModel` has exactly two `return`
   * statements — `solved` and `compromised` — and no `throw` anywhere in `week-model/`. So the loop
   * has not run once since the engine swap, `yieldedHardDays` was always `[]`, and no athlete has
   * ever been told a hard day went missing, because none ever did.
   *
   * ⛔ AND IT IS NOT REVIVED, WHICH WAS A DECISION AND NOT AN OVERSIGHT. Re-pointing it at the live
   * `compromised` status looks like a one-word fix and is a different product: under the debt model
   * a breach is the NORMAL outcome of a crowded week, not an impossibility. Measured over every
   * distinct-day anchor shape on the three-day lift week — 840 with two hard days, 210 with one —
   * a revived loop would delete a hard session the athlete chose in **57%** of two-hard-day weeks,
   * and in **280 of 840** it would drop BOTH of them. Every breach in that space is an 18h or 24h
   * residual; not one is the 48h impossibility the old copy described.
   *
   * ⚠️ AND IT DROPPED FROM THE END, NOT FROM THE CAUSE. Long run Mon, long ride Tue, hard run Wed,
   * hard ride Sat: the breach is the squat against the long RIDE, and the loop would take the
   * Saturday ride and then the Wednesday run — neither of them implicated.
   *
   * **The rule now, both ways.** Michael's 2026-08-17 ruling — *"the engine's job is to warn them of
   * the biological cost, not physically block them"* — was made about days the ATHLETE pinned. It
   * now covers days the ENGINE chose too: *"always build the week the athlete asked for and tell
   * them what it costs."* The telling is `tightWeekCompromises` below plus the resolver's own
   * per-breach lines. ⛔ Do not reintroduce a drop here under any name.
   */
  /**
   * ⛔⛔ THE LIFT-ONLY PRE-SOLVE IS GONE TOO (Michael, 2026-08-21, with the Q-215 deletion below).
   *
   * It existed for ONE reason: Q-215 needed the heavy-leg days before it could ask for them to be
   * avoided, and the lift days only come out of a solve. So the composer solved the week WITHOUT the
   * easy sessions, read the lower days off the answer, and then solved twice more with them.
   *
   * **Three solves for every composed block. Two of them changed nothing** — the adapter ignores
   * `flexibleAvoid`, measured at 0 of 126 shapes. ⛔ AND THE WIZARD RUNS THIS SAME PLACER
   * SYNCHRONOUSLY ON THE RENDER PATH (stage 3), so the athlete paid for all three between a tap and
   * the paint.
   *
   * ⚠️ The no-flexible case still needs a lift-only solve and still gets one — inside
   * `solveWithFlexible`, where it is the answer rather than a lookup.
   */

  const solveWithFlexible = () => {
    {
      const flexible = flexibleWanted;
      // ⚠️ NO EASY SESSIONS TO PLACE — the lifts and anchors ARE the week. One solve either way.
      if (flexible.length === 0) return solveWeek({ anchors: solverAnchors, lifts: solverLifts });
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
        anchors: solverAnchors, lifts: solverLifts, flexible,
        flexibleRanking: 'separation-first' as const,
      };
      /**
       * ⛔⛔ THE Q-215 DOUBLE-SOLVE IS DELETED (Michael, 2026-08-21). ONE SOLVE, ONE ANSWER.
       *
       * **What stood here.** The week was solved twice: once plainly, once again with the heavy leg
       * days handed back as `flexibleAvoid` — *"an easy session on a press day competes with
       * nothing; on a squat or deadlift day it is the same legs twice"* — and a comparison
       * (`takeAvoided`) picked between the two on `selfAdjacentCount` and `impactAfterLongRun`.
       *
       * ⛔ IT HAD NO EFFECT AND HAS HAD NONE SINCE THE ENGINE SWAP. `week-model/solver-adapter.ts`
       * IGNORES `flexibleAvoid` — its own header says so outright (*"`flexibleRanking`,
       * `flexibleAvoid`, `preferredClearance` … have no equivalent here and are IGNORED, not
       * emulated"*). Measured 2026-08-21: **`flexibleAvoid` changed the answer in 0 of 126 shapes.**
       * So `avoided` was byte-identical to `plain`, `takeAvoided` was always true, and the composer
       * paid for a second full solve to return the week it already had.
       *
       * ⛔ AND IT IS NOT RE-EXPRESSED AS A RESOLVER TERM, WHICH WAS THE OFFER AND MICHAEL DECLINED
       * IT: *"What it was trying to do — keep heavy leg days apart — is already done live by
       * `bunching`. Rebuilding it means two owners for one fact, which is the disease this work
       * order exists to cure."* ⛔ Do not add a term for this.
       *
       * ⚠️ TWO TESTS ASSERT THE OLD PREFERENCE AND PASS BY COINCIDENCE — `run-placement.test.ts` and
       * `easy-session-spread.test.ts`. They are rewritten to state what the engine actually
       * guarantees rather than to keep the coincidence alive.
       *
       * ⚠️ AND THE DELETION IS HALF THE LATENCY FIX (stage 3). The wizard runs this same placer
       * synchronously on the render path; halving the solves halves what a tap costs.
       */
      return solveWeek(base);
    }
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
  // ⛔ EVERY GATED HARD DAY IS BUILT (stage 5, 2026-08-21). A filter stood here that skipped the
  // ones the yield loop had dropped; nothing is dropped any more, so a hard day the athlete asked
  // for and the §7 gate admitted always reaches a session.
  gatedHardDays.forEach((h, i) => {
    const role = hardRoles[i];
    if (h.day != null) { hardDays.push({ ...h, day: h.day, role }); return; }
    const placed = solved.week.flexible.find((f) => f.name === `hard:${proposedHardDays.indexOf(h)}`);
    const day = placed ? asDay(placed.day) : null;
    if (!day || hardDays.some((x) => x.day === day)) return;
    hardDays.push({ ...h, day, role });
  });

  /**
   * ⛔ THE `place-week` FALLBACK IS GONE (stage 5, 2026-08-21). This read
   * `solved.status === 'unsolvable' ? placeLiftingWeek(...) : {...}` — a whole second placement
   * engine standing by for a status the adapter cannot return. It has not run since the swap, and
   * keeping it meant every reader of this file had to hold two placement laws in their head to
   * know which one built the week in front of them.
   *
   * ⚠️ `solverRefusal` WENT WITH IT. Its breach arm was the same unreachable status; its else arm
   * was `solved.notes`, and the adapter returns `notes: []` on BOTH of its returns — so it was the
   * empty array either way, spread into `placementCompromises` and contributing nothing. That is
   * §0f in its purest form: a disclosure channel that is wired, spread, documented, and empty.
   */
  const cap = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
  const placedWeek = {
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
  const dayForLiftTest = expandSlots(solvedTest.week.lifts.map((l) => ({
    lift: l.lift, isLower: l.isLower, day: cap(l.day) as DayName,
  })));
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
  const doubledHardCompromises = [...new Set(doubledHardDays)].map((day) => ({
    kind: 'cost' as const,
    text: `You put two hard sessions on ${day}. The plan builds one — two on a single day is a `
      + `double, which is a different session with a different cost, not a second hard day.`,
  }));
  /**
   * ⛔ WHAT IS TIGHT, AND WHY — REPLACING THE LINE THAT SAID A SESSION WAS LEFT OUT (Michael,
   * 2026-08-21, with the stage 5 ruling).
   *
   * The copy that stood here opened *"Your hard run was left out this block"* and closed *"the hard
   * session is the one that gives way."* Both halves are now false by construction: nothing is
   * dropped, so nothing is left out and nothing gives way. ⚠️ It was also never printed — it was fed
   * by `yieldedHardDays`, which the dead yield loop never filled — so no athlete has read either
   * sentence. Rewriting it rather than deleting it is the point of the ruling: the week is built
   * whole and the cost is stated.
   *
   * ⛔ IT NAMES THE SITUATION, NOT THE NUMBERS, AND THAT IS DELIBERATE. The per-breach lines
   * immediately after it carry the unit, the outstanding hours and the day it clears — they come
   * from the resolver, which owns those facts. This line could only restate them by parsing its own
   * prose, and `strength-focus-copy.ts` carries the scar from exactly that: a dedup keyed on wording
   * broke silently the day the wording was tightened. ⛔ Do not regex the breach text to fill a slot
   * here; if this line ever needs a number, give the adapter a structured field.
   *
   * ⚠️ FIRST IN THE LIST, so the athlete reads the frame before the detail. The renderer joins these
   * in order under one "What this week costs" paragraph.
   */
  const tightWeekCompromises = solved.status === 'compromised' && placedWeek.compromises.length > 0
    ? [{
        kind: 'cost' as const,
        text: 'Everything you asked for is built this week, and it is tight. Your long days and hard '
          + 'days are where you put them, so the lifting sits closer to them than its clearances ask '
          + 'for — each shortfall is named with the hours outstanding and the day it clears. Nothing '
          + 'was dropped to make the week fit.',
      }]
    : [];
  const placementCompromises: Array<{ kind: 'breach' | 'cost' | 'ceiling'; text: string }> = [
    ...tightWeekCompromises,
    ...placedWeek.compromises.map((text) => ({ kind: 'breach' as const, text })),
    ...hardGateCompromises,
    ...doubledHardCompromises,
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
  // it now, not a consequence of it. See `runIntent.askedDays` / `.daysAfterHard` / `.easyWanted` /
  // `rideIntent.easyWanted` beside the anchors.
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
  const easyRunsNeeded = Math.max(0, runIntent.daysAfterHard - 1); // the long run is one of them
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
  // ⚠️ AND IT ONLY EVER APPLIED TO THE UNPINNED CASE — `runIntent.longDay` has always won outright.
  const pickedLong = runIntent.longDay ?? defaultLong;
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
   * ⚠️ WHAT DID NOT MOVE: the COUNTS. `runIntent.easyWanted` / `rideIntent.easyWanted` are still the ask,
   * still derived from the athlete's answers, and still reported when the week cannot seat them.
   * The solver was given a placement job, not a dosing one.
   */
  const solvedFlexible = solved.week.flexible;
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
   * ⚠️ A PINNED long day still counts: `runIntent.hasLongDay` is true whenever the athlete named one, so
   * their choice is honoured at maintenance too — it is only the ENGINE'S default that is withheld.
   */
  const enduranceDays: string[] = runIntent.hasLongDay ? [pickedLong, ...easyRunDays] : [...easyRunDays];
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
  const runShortfall = Math.max(0, runIntent.easyWanted - easyRunDays.length);

  const longRunDay = pickedLong;

  const runMinutesByDay: Record<string, number> = {};
  let volume_notes: string | null = null;
  let volume_state: 'above' | 'below' | 'in_band' | null = null;
  // ⛔ SELECTION, NOT PRIMACY (2026-08-08). This read `enduranceSport === 'run'`, so a bike-primary
  // athlete's typed miles were never turned into minutes and every run they asked for came out
  // unsized — which is why the run pass below could drop them without anything noticing.
  if (runIntent.selected && runIntent.miles != null && runDayList.length > 0) {
    // ⛔ ONE RESOLUTION, TWO NAMED READINGS (stage 4 run half, 2026-08-22). `paceKnown` was a fifth
    // read of `args.easyPaceMinPerMile` and the fallback was applied here; both live on the intent
    // now, so the number the copy admits to and the number the arithmetic uses cannot drift.
    const paceKnown = runIntent.paceSource === 'answered';
    const pace = runIntent.paceOrFallback;
    // Soft reference band — NOT a clamp. HONOR the athlete's typed miles; surface the tradeoff
    // client-side (volume_state), never cap or bump. Easy-intensity guardrail stays.
    const asked = Math.round(runIntent.miles);
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
      (mi, h) => mi + hardRunMinutesForRole(roleOf(h.day), h.terrain, h.goal) / pace, 0);
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
  // ⛔ THE STATED MILES AGAINST THE STATED PACE — never the fallback. `null` here means "we cannot
  // say", and §0h is explicit that unknown is *"we have not asked"* and never *"they do nothing"*:
  // an athlete with no figure lands in `survival`, not `strength`. Using `paceOrFallback` would turn
  // a missing pace into a confident number and move them a tier.
  const weeklyRunHours = runIntent.miles != null && runIntent.easyPaceMinPerMile != null
    ? (runIntent.miles * runIntent.easyPaceMinPerMile) / 60
    : null;
  // ⛔ THE HOURS, AS STATED — `null` means never stated, not zero. This resolved them a SECOND way
  // (the ride pass 500 lines down had its own copy with a default of 2 bolted on), so one athlete's
  // hours had two owners that agreed only by accident. `rideIntent.hours` is the stated number and
  // `rideIntent.hoursOrDefault` is the number with our default applied — one resolution, two named
  // readings, and the reader has to say which one it means.
  const weeklyRideHours = rideIntent.hours;
  /**
   * ⛔ ZERO IS KNOWABLE AND `null` IS NOT THE SAME ANSWER. An athlete with `enduranceSport: null`
   * and no bike is a STRENGTH-ONLY block — that is a measured zero, and reading it as "we have not
   * asked" drops them into `survival` and strips the accessory ceiling from precisely the athlete
   * Tier 3 exists for. `null` is reserved for the genuinely unknown: a declared runner whose weekly
   * miles never arrived.
   */
  const enduranceDeclared = args.enduranceSport != null || rideIntent.declared;
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
  const isSwimming = swimIntent.selected;

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
    if (runIntent.selected) {
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
        // ⚠️ A MAINTENANCE RUN HAS NO LONG SESSION — `runIntent.hasLongDay` is false unless the run leads
        // or the athlete pinned a long day, and then every day of it is easy by definition.
        weekSessions.push(enduranceSession(
          'run', day, runMinutesByDay[day], note,
          runIntent.hasLongDay && day === longRunDay ? 'long' : 'easy', isStandalone,
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
        // ⚠️ THE FIRST PRESCRIBED HARD DAY IS THE INTENSITY ONE (2026-08-18) — `assignHardRoles`
        // owns that and it is asked here rather than re-derived. Threshold is what a SECOND unlocks.
        const role = roleOf(h.day);
        weekSessions.push(
          role === 'club'
            ? clubEnduranceSession('run', h.day, hardRunSessionMinutes(h.terrain))
            : role === 'threshold'
              // ⛔ THE BASIS IS ASKED FOR, NOT INFERRED FROM NULLNESS. See `thresholdPaceBasis`.
              // ⚠️ THE FALLBACK IS `derived-from-5k`, NOT `unknown`. An older caller that passes no
              // basis still reaches this line only AFTER `hardDayGate` proved a 5K or a threshold
              // exists, and `materialize-plan` prices the token off 5K + 20 s/mi when the threshold
              // resolver abstains — so "no number yet" would be false on a card that shows a pace.
              ? thresholdRunSession(h.day, { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex },
                args.thresholdPaceBasis ?? 'derived-from-5k',
                h.terrain)
              // ⛔ THE GOAL ONLY REACHES THE INTENSITY SESSION. A threshold day has no goal question
              // — its session is settled — and `role` is what decides which branch is taken above.
              : hardRunSession(h.day, heavyLowerDays, h.terrain,
                { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex }, h.goal),
        );
      }
    } else if (enduranceSport === 'bike' && !rideIntent.declared) {
      // ⛔ TWO EMITTERS WERE AUTHORING RIDES AND NOTHING SUBTRACTED (found 2026-07-29 by the combo
      // sweep). For a bike-primary athlete this fallback fired AND the declared-bike pass below fired.
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
      // When the athlete gave bike hours, the declared-bike pass owns every ride and this fallback is
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
    if (rideIntent.declared) {
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
      // ⛔ AND IT IS THE SAME RESOLUTION THE HEADLINE HOURS USE (stage 4, 2026-08-21). This line
      // held the second copy — identical arithmetic with `2` on the end instead of `null` — so the
      // block's stated weekly hours and the hours it actually built from were two answers to one
      // question. `hoursOrDefault` is that `2`, named as ours.
      // ⛔ THE ATHLETE'S ANSWER, not a guess. Asking "how many days to ride" is what the run step has
      // always done and the bike never did — without it this code held a weekly total and split it
      // by an invented ratio, so 20 hours produced ONE 1,200-minute ride.
      /**
       * ⛔ THE HOISTED ANSWER, NOT A THIRD DERIVATION OF IT (2026-08-19). This re-derived the ride
       * count from `args.bike.days` with its own `Math.min(3, …)` cap — so raising the picker to 4
       * fixed the count in one place and left it silently clamped here, and an athlete asking for
       * four rides got three with a "the week had room for 3" note blaming the SOLVER for a cap
       * this line applied. Two owners of one rule, which is the doubled disease.
       */
      /**
       * ⛔⛔ THE HARD RIDE IS ONE OF THE PICKED RIDE DAYS, AND THIS LINE WAS THE ONE PLACE THAT
       * FORGOT (2026-08-19, found on Michael's export).
       *
       * `rideDays` below holds the LONG ride and the EASY rides. The hard ride is NOT in it — it is
       * placed separately as a hard-day anchor. `rideIntent.askedDays` DOES include it. So this compared a
       * list of 2 against an ask of 3 and reported a shortfall that did not exist: a real week with
       * `Wed Easy Ride · Fri Threshold Ride · Sat Long Ride` — three ride days, exactly the answer —
       * carried *"You asked for 3 ride days; the week had room for 2."* on the plan description.
       *
       * ⚠️ EVERY OTHER COUNT IN THIS FILE ALREADY SUBTRACTS. `runIntent.daysAfterHard` takes
       * `askedDays - hardCount` — Michael's rule, *"one of the runs is the hill session."*
       * `rideIntent.easyWanted` takes `askedDays - long - hardCount`, and the account above
       * it states this rule outright: *"when the hard day is a RIDE it is one of the picked ride
       * days too, exactly as the hard run is one of the run days."*
       *
       * ⛔ AND IT WAS NOT ONLY THE NOTE. `daysAfterHard` also caps the fill loop below, so an inflated
       * ask let it take an extra day from `solvedRideDays` — the long ride, an easy ride, ANOTHER
       * easy ride, plus the hard ride: four sessions against an answer of three. It did not fire on
       * this export only because the solver had one flexible ride day to give, not two.
       *
       * ⚠️ THE HARD-RUN CASE IS UNCHANGED AND ITS NOTE MUST STILL FIRE. `hardRideCount` is 0 there,
       * so a genuine ride shortfall still says so. Both are pinned in `ride-count-note.test.ts`.
       */
      // ⛔ AND THE SUBTRACTION IS THE OBJECT'S NOW (stage 4, 2026-08-21). `wantDays` was the third
      // site that took the hard rides out of the ask, and the first two disagreed with it for a
      // while — see `daysAfterHard` in `_shared/athlete-weekly-intent.ts`.
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
      // ⚠️ `hasLongDay`, NOT `longDay` — the pin says they WANT a long ride; it cannot say
      // there is room for one. With one ride and a hard ride, pushing it here built two sessions
      // against an answer of one.
      if (rideIntent.hasLongDay) rideDays.push(rideIntent.longDay!);
      for (const d of solvedRideDays) {
        if (rideDays.length >= rideIntent.daysAfterHard) break;
        if (rideDays.includes(d)) continue;
        rideDays.push(d);
      }
      // ⚠️ If nothing is free the long ride still lands — an athlete who named a day gets that day.
      // ⚠️ THE LAST-RESORT PIN STILL FIRES when nothing else was placeable AND no hard ride is
      // already carrying the discipline — otherwise it reintroduces the extra session above.
      if (rideDays.length === 0 && rideIntent.longDay && rideIntent.hardCount === 0) rideDays.push(rideIntent.longDay);
      // ⛔ AND IF THE WEEK STILL CANNOT HOLD WHAT THEY ASKED FOR, SAY SO. Never silently fewer.
      // ⚠️ ONCE, not twelve times. This block runs inside the week loop, so an unguarded push
      // repeated the same sentence for every week in the block — the shape is identical every week,
      // so the compromise is a property of the WEEK, not of week 7.
      const rideShortfallNote = rideDays.length < rideIntent.daysAfterHard
        ? `You asked for ${rideIntent.daysAfterHard} ride days; the week had room for ${rideDays.length} once the lifting and your fixed days were placed.`
        : null;
      // A ride day the week had no room for is a COST, not a broken rule — nothing in the law was
      // violated, the athlete simply asked for more days than the week held once the pins landed.
      if (rideShortfallNote && !placementCompromises.some((c) => c.text === rideShortfallNote)) {
        placementCompromises.push({ kind: 'cost', text: rideShortfallNote });
      }
      // ⛔ THE NO-REST-DAY CHECK MOVED OUT OF THIS BLOCK (stage 6, 2026-08-22). It stood here, inside
      // `if (rideIntent.declared)`, and asked a hand-listed subset of day sources. It is now asked of
      // the finished week, below the swim emitter — see the note there for what it was missing and
      // how many weeks it missed.
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
        (mins, h) => mins + (roleOf(h.day) === 'threshold'
          // ⛔ THE RIDE'S OWN ALLOWANCE, ASKED OF THE RIDE'S OWN SESSION (2026-08-20). This read
          // `THRESHOLD_RUN_MIN` — the RUN's constant — on a ride, which was harmless only because
          // the two happened to be equal. And it was a constant where it should have been the
          // session: budgeted 45, built 24, and the athlete's three hours came out at two thirty-nine.
          ? qualityBudgetMinutes(
            ALL_HARD_WAVES.map(thresholdRideCore),
            THRESHOLD_RIDE_ALLOWANCE_MIN,
            'bike',
          )
          : qualityBudgetMinutes(
            ALL_HARD_WAVES.map(bikeQualityCore),
            BIKE_QUALITY_ALLOWANCE_MIN,
            'bike',
          )), 0);
      const totalMins = Math.max(30, Math.round(rideIntent.hoursOrDefault * 60) - hardRideMins);
      // ⛔ EVEN SPLIT, then the long day takes what the others give up. `LONG_RIDE_SHARE` is the one
      // authored number left in this block and it is marked as such: a long ride that is the same
      // length as the others is not a long ride, and 1.5× is the smallest multiplier that reads as
      // one. It is a product decision, not a finding — do not dress it up as physiology.
      const LONG_RIDE_SHARE = 1.5;
      const others = Math.max(0, rideDays.length - 1);
      const unitMins = totalMins
        / (others + (rideIntent.longDay && rideDays.includes(rideIntent.longDay) ? LONG_RIDE_SHARE : 1));
      rideDays.forEach((day) => {
        const isLong = day === rideIntent.longDay;
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
          weekSessions.push(enduranceSession('bike', h.day, BIKE_QUALITY_ALLOWANCE_MIN,
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
            ? clubEnduranceSession('bike', h.day, BIKE_QUALITY_ALLOWANCE_MIN)
            : role === 'threshold'
              ? thresholdRideSession(h.day, { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex }, h.environment)
              : bikeQualitySession(h.day, { weekInCycle, cycleKind, cycleIndex: bw.cycleIndex }, h.environment),
        );
      }
    }

    // Swim last, so it only takes days nothing else wanted.
    if (swimIntent.selected) {
      const taken = new Set(weekSessions.map((x) => x.day));
      const free = DAYS.filter((d) => !taken.has(d));
      swimSessions(free, swimIntent.askedDays).forEach((x) => weekSessions.push(x));
    }

    /**
     * ⛔⛔ THE REST DAY, ASKED OF THE FINISHED WEEK — AND UNTIL TODAY IT WAS ASKED OF A LIST
     * (stage 6, 2026-08-22).
     *
     * **The defect, measured.** Across 37,632 shapes with 3-4 runs and 3-4 rides, **25,088 built a
     * week with no rest day at all — and this note stayed silent on every one of them.** Not once in
     * 25,088.
     *
     * ⛔ TWO CAUSES, AND BOTH ARE THE SAME MISTAKE. The check sat inside the ride pass and read
     * `new Set([...strengthDays, pickedLong, ...easyRunDays, ...rideDays])` — a hand-listed subset of
     * where sessions come from:
     *   1. **It could not see a HARD day or a SWIM day.** A week whose seventh square carries the
     *      hard run, or the swim, counted that square as empty. The measured misses are mostly a
     *      Sunday swim.
     *   2. **It only ran when the athlete kept a BIKE.** A runner with no bike could fill all seven
     *      days and never be told, because the whole block is gated on `rideIntent.declared`.
     *
     * ⚠️ AND THE OLD COMMENT ALREADY SAID THE RIGHT THING, which is why this is a fix and not a
     * redesign: *"ASKED OF THE WEEK, NOT OF ONE VARIABLE … Count the days that carry something and
     * let the answer come from the week itself."* It then counted four variables. A list of sources
     * is one variable wearing a wider coat — it can only ever be as complete as the last person to
     * remember to add to it, and swim and the hard days were added to the week after it was written.
     *
     * ⛔ SO IT READS `weekSessions`, HERE, AFTER EVERY EMITTER INCLUDING THE SWIM. There is nothing
     * left to forget: if a day carries anything at all it is not a rest day, whatever put it there.
     *
     * **Why it matters more than the other notes** — the composer's own words, and they are right:
     * *"this is the one compromise in this file where silence would be worst: everything else costs a
     * day's arrangement, this costs the recovery the block is built around."* D-325 §7 is *state the
     * cost, never refuse*; after stage 5 the engine never refuses, so the stating is the whole of it.
     */
    const restDayCount = DAYS.filter((d) => !weekSessions.some((x) => x.day === d)).length;
    if (restDayCount === 0) {
      const perType = (t: string) => new Set(
        weekSessions.filter((x) => x.type === t).map((x) => x.day),
      ).size;
      /**
       * ⚠️ THE COUNTS COME OFF THE WEEK TOO, not off the ask. The sentence this replaced read
       * *"Your N ride days and M run days fill all seven"* using the REQUESTED numbers — so on the
       * day it did fire it could have named a count the calendar did not show. And it named only two
       * disciplines, which is the same blindness one layer up.
       */
      const parts = [
        [perType('run'), 'running'], [perType('ride'), 'riding'],
        [perType('swim'), 'swimming'], [perType('strength'), 'lifting'],
      ].filter(([n]) => (n as number) > 0).map(([n, w]) => `${n} ${w}`);
      const restNote = `Every day this week carries a session — ${parts.join(', ')} — so there is no `
        + 'full rest day. That is the one cost here that is not about arrangement: the block is built '
        + 'around a day with nothing on it.';
      if (!placementCompromises.some((c) => c.text === restNote)) {
        placementCompromises.push({ kind: 'cost', text: restNote });
      }
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
