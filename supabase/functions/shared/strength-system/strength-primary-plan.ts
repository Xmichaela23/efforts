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
// itself with the retest week: under 5/3/1 the last set of every third week IS the test.
// ============================================================================

import { getExerciseConfig } from '../../../../src/lib/exercise-config.ts';
import { strengthFocusDescription } from '../../../../src/lib/strength-focus-copy.ts';
import {
  FALLBACK_EASY_MIN_PER_MILE as FALLBACK_EASY_MIN_PER_MILE_SHARED,
  volumeStateForMiles,
} from '../../../../src/lib/maintenance-volume-band.ts';
import {
  type AssistancePicks,
  ASSISTANCE_GUIDANCE,
  resolveAssistance,
} from '../../../../src/lib/assistance-menu.ts';
import {
  cycleForWeek,
  cyclesForBlock,
  setsForWeek,
  weightForSet,
  WEEKS_PER_CYCLE,
  type WendlerSet,
  workingNumberForCycle,
  workingNumberFrom1RM,
} from './loading/wendler-531.ts';
// ⛔ Placement is NOT this file's job any more. `place-week.ts` owns "what day does the bar go on",
// reading its clearances from `_shared/schedule-session-constraints.ts` — the same law the race-side
// optimizer reads. This file states the lifts and the endurance underneath; the solver states the days.
import {
  type DayName,
  DAYS as PLACEMENT_DAYS,
  type EndurancePin,
  placeLiftingWeek,
} from './place-week.ts';

/** The four lifts, in lb. **All four are required** — the entry gate gets this far only
 *  when every one is on file (SPEC §0). Missing one leaves a lifting day with no weight. */
export type OneRepMaxes = {
  bench: number;
  squat: number;
  deadlift: number;
  overheadPress: number;
};

export type StrengthPrimaryArgs = {
  durationWeeks: number;
  /** The athlete's four barbell maxes. Required — there is no path in without them. */
  oneRepMaxes: OneRepMaxes;
  /** The athlete's maintained endurance discipline (sport-agnostic). null = strength-only. */
  enduranceSport: 'run' | 'bike' | null;
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
  hardDay?: { day: string; discipline: 'run' | 'bike' };
  /**
   * Weekly bike hours from intake (D-323 §6 — hours, never miles: the engine turns hours into
   * sessions and has never learned a ride speed).
   * ⛔ Same drop as `hardDay`: written at NonRaceBuilder.tsx:319, stored on the goal, ZERO readers
   * under supabase/functions until this wire. Carried now so the bike pass has it to consume.
   */
  targetWeeklyRideHours?: number;
  /** The athlete's three assistance picks. Absent → the menu's bodyweight defaults, so skipping the
   *  card still produces a complete block. See `src/lib/assistance-menu.ts`. */
  assistancePicks?: AssistancePicks | null;
  /** ⛔ SWIM IS A COURTESY, NOT A PRESCRIPTION (D-323 item 5). Number of swims to BOOK per week;
   *  0 or absent → none. See `swimSessions` for what the app is and is not claiming here. */
  swimDays?: number;
};

/** ONE prescribed set. `weight` is absolute lb — resolved at authoring off the stored working
 *  number, never a percentage the athlete's moving 1RM could re-resolve later. */
type PlannedSet = { weight: number; reps: number; amrap?: boolean };

type StrengthExercise = {
  name: string;
  sets: number;
  reps: number | string;
  weight: string | number;
  /** True fraction of the athlete's 1RM (0–1) for the top set. Feeds the RIR chart (D-322).
   *  Absent on bodyweight rows — a lift with no bar has no percentage. */
  percent_1rm?: number;
  /** ⛔ false = the engine states the movement and the reps and NOTHING about the weight. Assistance
   *  work is auto-regulated by design (see `assistanceRows`); materialize must not derive a load for
   *  it, and the logger must not show one. Absent/true → every other row behaves as before. */
  load_prescribed?: boolean;
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
  { day: 'Monday',   name: 'Bench Press',    ref: 'bench',          isLower: false, focus: 'upper' },
  { day: 'Tuesday',  name: 'Back Squat',     ref: 'squat',          isLower: true,  focus: 'lower' },
  { day: 'Thursday', name: 'Overhead Press', ref: 'overheadPress',  isLower: false, focus: 'upper' },
  { day: 'Friday',   name: 'Deadlift',       ref: 'deadlift',       isLower: true,  focus: 'lower' },
];

const ENDURANCE_DAYS = ['Wednesday', 'Saturday'];

// ── The session (SPEC §1) ────────────────────────────────────────────────────
// 1. 10–15 jumps or throws  2. the main lift  3. 25 reps each of push / pull / single-leg-core.
//
// Wendler's assistance range is 25–50 per category; the bottom of it is OURS, read off Van Hooren
// (keep volume low or an endurance athlete builds size they don't want). SPEC §3 marks it T3.
export const JUMPS: StrengthExercise = { name: 'Box Jump', sets: 3, reps: 5, weight: 'Bodyweight' };

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
function assistanceRows(picks: AssistancePicks | null | undefined): StrengthExercise[] {
  return resolveAssistance(picks).map((a) => ({
    name: a.name,
    sets: 1,
    reps: a.totalReps,
    weight: 'By feel',
    load_prescribed: false,
  }));
}

/**
 * The block, as leader and anchor cycles with each cycle's week 4 as its own deload phase.
 *
 * **The phase NAMES are load-bearing.** `_shared/plan-phase.ts` resolves a week's phase from this
 * array, and `_shared/strength-profiles.ts` maps that name to an effort target. Both were taught
 * `leader` and `anchor` alongside this change — an unrecognised name resolves to a silent default,
 * which is the shape of Q-192.
 */
export function buildBlockPhases(weeks: number): { phases: ArcPhase[]; recovery_weeks: number[] } {
  const phases: ArcPhase[] = [];
  const recovery_weeks: number[] = [];
  for (const c of cyclesForBlock(weeks)) {
    const workEnd = c.endWeek - 1; // week 4 of every cycle is the deload
    phases.push({
      name: c.kind === 'anchor' ? 'Anchor' : 'Leader',
      start_week: c.startWeek,
      end_week: workEnd,
      weeks_in_phase: workEnd - c.startWeek + 1,
    });
    phases.push({ name: 'Deload', start_week: c.endWeek, end_week: c.endWeek, weeks_in_phase: 1 });
    recovery_weeks.push(c.endWeek);
  }
  return { phases, recovery_weeks };
}

/** A block is a WHOLE number of four-week cycles — 12 → 12, 10 → 8, 3 → 4. A partial cycle would
 *  leave a leader with no deload or an anchor with no measured week. */
export function blockWeeks(requested: number): number {
  const w = Number(requested);
  if (!Number.isFinite(w) || w < WEEKS_PER_CYCLE) return WEEKS_PER_CYCLE;
  return Math.floor(w / WEEKS_PER_CYCLE) * WEEKS_PER_CYCLE;
}

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
  if (e.set_plan?.length) return `${e.name} ${e.set_plan.map(setLabel).join(', ')}`;
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
): StrengthExercise {
  const set_plan: PlannedSet[] = sets.map((s) => ({
    weight: weightForSet(workingNumber, s.pct),
    reps: s.reps,
    ...(s.amrap ? { amrap: true } : null),
  }));
  const top = set_plan[set_plan.length - 1];
  return {
    name: lift.name,
    sets: set_plan.length,
    reps: top.amrap ? `${top.reps}+` : top.reps,
    weight: top.weight,
    // The percentage OF THE REAL MAX — not of the working number. This is what the effort chart
    // reads, and the whole point of the 85% working number is that the true percentage stays
    // buffered: a 95%-of-working top set is ~80% of the athlete's actual max.
    percent_1rm: oneRM > 0 ? Math.round((top.weight / oneRM) * 1000) / 1000 : undefined,
    set_plan,
  };
}

// Spread the weekly maintenance miles across N runs as a LONG-RUN share + easy fill — NOT total÷N
// (the two-equal-runs bug). Descending: index 0 is the long run. Weights graduate (flatter as N grows:
// 3d ≈ 9/6/5, 4d ≈ 6/5/5/4), then rounded so the parts sum back to the total.
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

function enduranceSession(
  sport: 'run' | 'bike',
  day: string,
  overrideMins?: number,
  extraNote?: string,
  kind: 'easy' | 'long' = 'easy',
): PlanSession {
  const mins = overrideMins ?? (sport === 'bike' ? 45 : 35);
  const label = sport === 'bike' ? 'Easy Ride' : 'Easy Run';
  const base: PlanSession = {
    day,
    type: sport === 'bike' ? 'ride' : 'run',
    name: label,
    // ⛔ CONVERSATIONAL IS THE CEILING, ON EVERY ENDURANCE SESSION IN THE BLOCK. Not a suggestion:
    // Hickson is that cutting INTENSITY is what loses the aerobic base, so the volume is what gives
    // here and the effort is what holds. It is also the guardrail that makes the honoured-not-capped
    // mileage safe — a high-volume EASY week is not the interference case, a high-volume hard one is.
    description: `~${mins} min easy, all conversational — you could hold a sentence throughout. Held underneath the lifting, not trained.${extraNote ?? ''}`,
    duration: mins,
    tags: ['easy', 'maintenance', 'aerobic'],
  };
  // Q-126: RUN-only token injection. Bike/ride is fenced to its own pass (Gap A-bike).
  if (sport === 'run') return { ...base, steps_preset: [runIntensityToken(kind, mins)] };
  return base;
}

/**
 * ⛔ THE ONE HARD AEROBIC SESSION — hill repeats, for the athlete with no bike.
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
function hillSession(day: string): PlanSession {
  // §5, run-only VO2 defence: 4 x 3min hard / 3min easy at 5-8%. Working time 12 min; ~35-40 min
  // with warm-up and cool-down. The token carries the grade because the cost row is not "run VO2" —
  // it is "run VO2 AT grade" (D-325 §1), and a token that cannot carry the constraint cannot be priced.
  //
  // ⚠️ 12 min, not the meta's "high volume" >=15 min (which would be 5 x 3). Deliberate: this is a
  // MAINTENANCE dose, not a gains dose — one hard session a week HOLDS the engine and does not build
  // it (parent doctrine §5.0). Structure from the evidence, volume from the maintenance context.
  const token = 'run_hills_4x180s_r180s_g5_8';
  return {
    day,
    type: 'run',
    name: 'Hill Repeats',
    // ⛔ NO PACE, ANYWHERE IN THIS COPY. The pace-effort relationship changes with gradient, so a
    // pace target here is false precision (§2.2). Effort and grade only.
    description:
      '4 × 3 min hard uphill, 3 min easy back down, on a 5-8% grade. Hard means hard — you should '
      + 'not be able to hold a sentence. No pace target: on a hill the number would be wrong. '
      + 'The climb is what keeps this cheap on your legs, so the lifting still gets what it needs.',
    duration: 35,
    steps_preset: [token],
    tags: ['quality', 'hills', 'aerobic'],
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
} {
  const { enduranceSport, oneRepMaxes } = args;
  const weeks = blockWeeks(args.durationWeeks);
  const phaseStructure = buildBlockPhases(weeks);

  // The working number, per lift, set once here (SPEC §1).
  const training_max: OneRepMaxes = {
    bench: workingNumberFrom1RM(oneRepMaxes.bench),
    squat: workingNumberFrom1RM(oneRepMaxes.squat),
    deadlift: workingNumberFrom1RM(oneRepMaxes.deadlift),
    overheadPress: workingNumberFrom1RM(oneRepMaxes.overheadPress),
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
  const longRunPin = enduranceSport === 'run' ? asDay(args.longRunDay) : null;
  if (longRunPin) pins.push({ day: longRunPin, kind: 'long_run', label: 'your long run' });
  const hardPin = asDay(args.hardDay?.day);
  if (hardPin && !pins.some((p) => p.day === hardPin)) {
    pins.push({
      day: hardPin,
      kind: args.hardDay!.discipline === 'bike' ? 'quality_bike' : 'quality_run',
      label: args.hardDay!.discipline === 'bike' ? 'your hard ride' : 'your hard run',
    });
  }

  const placedWeek = placeLiftingWeek(
    MAIN_LIFTS.map((l) => ({ lift: l.name, isLower: l.isLower })),
    pins,
  );
  // Lift name → the day the solver gave it. Falls back to the lift's legacy grid day only if the
  // solver somehow omitted it, so a placement bug degrades to the old behaviour rather than to no day.
  const dayForLift = new Map(placedWeek.slots.map((s) => [s.lift, s.day as string]));
  const liftDay = (l: typeof MAIN_LIFTS[number]): string => dayForLift.get(l.name) ?? l.day;
  const strengthDays = MAIN_LIFTS.map(liftDay);
  // ⛔ Surfaced, never swallowed. `place-week` states which clearance it had to break; the plan
  // carries those words to the athlete verbatim.
  const placementCompromises: string[] = placedWeek.compromises;
  const assistance = assistanceRows(args.assistancePicks);

  // ── Endurance underneath (unchanged from the previous composer) ────────────
  // ⛔ The band lives in `src/lib/maintenance-volume-band.ts` — the INTAKE reads the same numbers, so
  // what the athlete is told while typing and what the plan records cannot disagree. It is a
  // REFERENCE, not a cap: the D-222 ceiling was retired on purpose and must not return.
  const FALLBACK_EASY_MIN_PER_MILE = FALLBACK_EASY_MIN_PER_MILE_SHARED;

  const runFreq = enduranceSport === 'run'
    ? Math.max(ENDURANCE_DAYS.length, Math.min(4, Math.round(Number(args.enduranceFrequency) || ENDURANCE_DAYS.length)))
    : ENDURANCE_DAYS.length;
  const upperLiftDays = MAIN_LIFTS.filter((l) => !l.isLower).map(liftDay);
  // ⛔ THE Sat/Sun COERCION IS GONE (2026-07-26). It read:
  //     pickedLong = longRunDay === 'sunday' ? 'Sunday' : 'Saturday'
  // — so every day except Sunday silently became Saturday. The athlete picked from seven and got
  // one of two. That existed only because the lifting grid was fixed; with the solver placing the
  // bar around the pins, ANY day is answerable and the long run day is whatever they said.
  const pickedLong = longRunPin ?? ENDURANCE_DAYS[ENDURANCE_DAYS.length - 1];
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
  const restReserved = placedWeek.freeDays.includes('Sunday' as DayName)
    ? ('Sunday' as DayName)
    : placedWeek.freeDays[placedWeek.freeDays.length - 1];
  const easyDayPool = placedWeek.freeDays.filter((d) => d !== restReserved && d !== pickedLong);
  // Long-run day first (it is a pin, so it is not in `freeDays`), then whatever room is left.
  const enduranceDays: string[] = [pickedLong, ...easyDayPool];
  const runDayList: string[] = [...enduranceDays];
  for (const d of upperLiftDays) {
    if (runDayList.length >= runFreq) break;
    if (!runDayList.includes(d)) runDayList.push(d);
  }
  const longRunDay = pickedLong;
  const firstStackedRunDay = runDayList
    .filter((d) => strengthDays.includes(d))
    .sort((a, b) => DAYS.indexOf(a as typeof DAYS[number]) - DAYS.indexOf(b as typeof DAYS[number]))[0];

  const runMinutesByDay: Record<string, number> = {};
  let volume_notes: string | null = null;
  let volume_state: 'above' | 'below' | 'in_band' | null = null;
  if (enduranceSport === 'run' && (args.targetWeeklyMiles ?? 0) > 0 && runDayList.length > 0) {
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
    const perMile = distributeRunMiles(held, runDayList.length);
    const daysLongFirst = [longRunDay, ...runDayList.filter((d) => d !== longRunDay)];
    daysLongFirst.forEach((day, i) => {
      const mi = perMile[i] ?? perMile[perMile.length - 1];
      runMinutesByDay[day] = Math.max(15, Math.round(mi * pace));
    });
  }

  // ── The weeks ─────────────────────────────────────────────────────────────
  const sessions_by_week: Record<string, PlanSession[]> = {};

  for (let week = 1; week <= weeks; week++) {
    const placed = cycleForWeek(weeks, week);
    if (!placed) continue;
    const { slot, weekInCycle } = placed;
    const isDeload = weekInCycle === WEEKS_PER_CYCLE;
    // Week 3 of every cycle is the 95% set — Wendler's own validity check (SPEC §1). Nothing here
    // marks it: the sets themselves carry it (95% of the working number, and in the anchor the top
    // set is open). The reading of that set is the transition gate's job, not the composer's.
    const phaseName = isDeload ? 'Deload' : (slot.kind === 'anchor' ? 'Anchor' : 'Leader');
    const weekSessions: PlanSession[] = [];

    for (const lift of MAIN_LIFTS) {
      const wn = workingNumberForCycle(training_max[lift.ref], slot.index, lift.isLower);
      const main = mainLiftRow(lift, wn, oneRepMaxes[lift.ref], setsForWeek(slot.kind, weekInCycle));
      // Jumps and assistance are dropped on the deload — the deload is a volume cut, not a lighter
      // version of the same session [Bosquet 2007, Wang 2023: cut volume, hold intensity].
      const ex: StrengthExercise[] = isDeload ? [main] : [JUMPS, main, ...assistance];
      weekSessions.push({
        // ⛔ The SOLVER's day, not the grid's. `liftDay()` falls back to `lift.day` only if
        // place-week omitted this lift, so a placement failure degrades to the old fixed week
        // rather than to a session with no day.
        day: liftDay(lift),
        type: 'strength',
        name: `Strength — ${lift.name}`,
        // The assistance guidance rides with the session, once, on the weeks that carry assistance.
        // Without it "25 reps" reads as a target to chase, and chasing it costs the next main lift.
        description: `${ex.map(exerciseLabel).join(' · ')}.${isDeload ? '' : ` ${ASSISTANCE_GUIDANCE}`}`,
        duration: isDeload ? 35 : 60,
        strength_exercises: ex,
        // ⛔ NO `1rm_test` TAG, and that is deliberate. The tag makes the logger DISCARD the planned
        // rows and rebuild the session as a warm-up ramp plus one all-out set (`StrengthLogger.tsx`
        // ~2337-2367) — the old separate-retest-week shape. Under 5/3/1 the measurement is just the
        // third set of an ordinary session, so a rebuild would delete the very prescription this
        // block is built on. The e1RM still lands: `set_plan[].amrap` flags the open set, and the
        // logger's write-back fires off that flag alone (`isAmrapBaseline`, ~3301).
        tags: ['strength', lift.focus, `phase:${phaseName.toLowerCase()}`, 'protocol:strength_primary'],
      });
    }

    // Endurance = maintenance, underneath.
    if (enduranceSport === 'run') {
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
        const note = (week === 1 && day === firstStackedRunDay)
          ? ` On a lift + run day the lift comes first — the run is easy, so back-to-back is fine.`
          : undefined;
        weekSessions.push(enduranceSession('run', day, runMinutesByDay[day], note, day === longRunDay ? 'long' : 'easy'));
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
      if (hardPin && args.hardDay?.discipline === 'run') {
        weekSessions.push(hillSession(hardPin));
      }
    } else if (enduranceSport) {
      enduranceDays.forEach((day) => weekSessions.push(enduranceSession(enduranceSport, day)));
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
  const enduranceNote = enduranceSport
    ? ` ${enduranceSport === 'bike' ? 'Riding' : 'Running'} is held underneath at maintenance, all easy.`
    : '';

  return {
    name: args.goalName?.trim() || `Strength Focus — ${weeks} Weeks`,
    description:
      // ⛔ ONE SOURCE for this copy — `src/lib/strength-focus-copy.ts`, which the BUILD FLOW also
      // reads so the athlete is shown the same words before committing that the plan carries after.
      // Provenance for every line (what is biology, what is product voice, what is a debt) lives in
      // that file's header. Do not re-word it here; there would then be two.
      strengthFocusDescription({ weeks, leaderCycles: leaders, anchorStartWeek: anchorStart, enduranceNote }),
    duration_weeks: weeks,
    sessions_by_week,
    phaseStructure,
    training_max,
    volume_notes,
    volume_state,
  };
}
