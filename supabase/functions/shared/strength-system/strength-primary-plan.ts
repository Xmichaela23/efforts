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
    description: `~${mins} min easy, conversational — held underneath the lifting, not trained.${extraNote ?? ''}`,
    duration: mins,
    tags: ['easy', 'maintenance', 'aerobic'],
  };
  // Q-126: RUN-only token injection. Bike/ride is fenced to its own pass (Gap A-bike).
  if (sport === 'run') return { ...base, steps_preset: [runIntensityToken(kind, mins)] };
  return base;
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

  const strengthDays = MAIN_LIFTS.map((l) => l.day);
  const assistance = assistanceRows(args.assistancePicks);

  // ── Endurance underneath (unchanged from the previous composer) ────────────
  // ⛔ The band lives in `src/lib/maintenance-volume-band.ts` — the INTAKE reads the same numbers, so
  // what the athlete is told while typing and what the plan records cannot disagree. It is a
  // REFERENCE, not a cap: the D-222 ceiling was retired on purpose and must not return.
  const FALLBACK_EASY_MIN_PER_MILE = FALLBACK_EASY_MIN_PER_MILE_SHARED;

  const runFreq = enduranceSport === 'run'
    ? Math.max(ENDURANCE_DAYS.length, Math.min(4, Math.round(Number(args.enduranceFrequency) || ENDURANCE_DAYS.length)))
    : ENDURANCE_DAYS.length;
  const upperLiftDays = MAIN_LIFTS.filter((l) => !l.isLower).map((l) => l.day); // Mon, Thu
  // Long-run day = user pick CONSTRAINED to Sat/Sun. Heavy lower is Tue (squat) + Fri (deadlift);
  // only the weekend clears the 24h-pre / 48h-post windows.
  const gridLongDefault = ENDURANCE_DAYS[ENDURANCE_DAYS.length - 1]; // 'Saturday'
  const pickedLong = String(args.longRunDay ?? '').trim().toLowerCase() === 'sunday' ? 'Sunday' : gridLongDefault;
  const enduranceDays = pickedLong === gridLongDefault
    ? ENDURANCE_DAYS
    : ENDURANCE_DAYS.map((d) => (d === gridLongDefault ? pickedLong : d));
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
        day: lift.day,
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
        const note = (week === 1 && day === firstStackedRunDay)
          ? ` On a lift + run day the lift comes first — the run is easy, so back-to-back is fine [Petré 2021].`
          : undefined;
        weekSessions.push(enduranceSession('run', day, runMinutesByDay[day], note, day === longRunDay ? 'long' : 'easy'));
      });
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
