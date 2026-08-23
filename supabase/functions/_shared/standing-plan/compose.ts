// ============================================================================
// THE COMPOSER — a frame, an athlete, and the three libraries, into one week.
//
// ⛔ IT IS NOT A FIFTH `generate-*` SIBLING. It composes; it does not fetch, persist or route. The
// edge function hands it resolved inputs and takes back plan rows.
//
//   strength slots  → stage 2 `_shared/strength-grid`      (pattern × category × intent)
//   endurance slots → stage 1 `_shared/endurance-library`   (family × level × the athlete's anchors)
//   accessories     → stage 3 `_shared/accessory-dosing`    (per-muscle floor, per-session ceiling)
//   the shape       → `frames.ts`                           (p246, the law)
//   the load        → `working-number.ts` + `progression.ts` (p215, p247)
//   the words       → `session-vocabulary.ts`               (ONE edge, no new vocabulary)
//
// ⛔ THE PROGRAM OWNS EVERY COUNT. The athlete owns sport, level, equipment and which movement fills
// a slot. Convert, never add.
// ============================================================================

import {
  buildEnduranceSession,
  resolveEnduranceAnchors,
  type EnduranceBaselines,
  type Level,
} from '../endurance-library/index.ts';
import { prescribe, resolveSlot, type ViadaPattern } from '../strength-grid/index.ts';
import {
  fillMuscleFloor,
  ledgerFor,
  type DoseLedger,
  type PlannedSession as DosingSession,
} from '../accessory-dosing/index.ts';
import {
  advancedTierSessions,
  FRAMES,
  PLYO_DOSE,
  type ColumnKind,
  type FrameDay,
  type FrameId,
  type StrengthSlot,
} from './frames.ts';
import { weekdayForFrameDay, type Weekday } from './day-map.ts';
import { prescribedLoad } from './progression.ts';
import { translateEnduranceSession } from './session-vocabulary.ts';
import {
  isTestWeek,
  pretestSession,
  TEST_DAY_LIFTS,
  TESTED_LIFTS,
  testedLiftName,
  type TestedLift,
  type WorkingNumber,
} from './working-number.ts';

// ── the app's existing plan-row shape. Nothing new. ─────────────────────────────────────────────

export type PlannedSet = { weight: number; reps: number; amrap?: boolean; warmup?: boolean };

export type StrengthExercise = {
  name: string;
  sets?: number;
  reps: number | string;
  weight: string | number;
  percent_1rm?: number;
  load_prescribed?: boolean;
  notes?: string;
  /** ⛔ HIS reps-in-reserve for this slot's intent. Absent on ME — see `targetRirForIntent`. */
  target_rir?: number;
  set_plan?: PlannedSet[];
};

export type PlanSession = {
  day: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  strength_exercises?: StrengthExercise[];
  steps_preset?: string[];
  tags: string[];
};

/**
 * ⛔ THE FRAME'S DAY NUMBER → A CALENDAR WEEKDAY, AND IT IS NO LONGER HARD-WIRED.
 *
 * This was `DAY_NAMES[day.day - 1]` — frame day 1 always Monday, so the long run was Saturday for
 * every athlete alive. **That was itself a rotation, offset zero, that nobody chose.** The work
 * order: *"THE DAY ORDER IS NOT THE LAW. THE PAIRINGS ARE"* — p246 numbers its days and names no
 * weekday anywhere. A rotation moves every day by the same amount, so the pairings, the gaps and the
 * rest day's position all survive exactly; only the calendar day the block opens on changes.
 *
 * ⚠️ ABSENT `dayOffset` IS OFFSET ZERO, so an athlete who pinned nothing gets the identical week.
 */
function dayNameFor(args: ComposeArgs, frameDay: number): Weekday {
  return weekdayForFrameDay(frameDay, args.dayOffset ?? 0);
}

export type ComposeArgs = {
  frame: FrameId;
  week: number;
  column: ColumnKind;
  /** ⛔ THE COMPETITION LIFTS. His p275 permission, pivot §6: the lift the athlete wants a number on
   *  enters the ME slot. These are also what the `Accessory:` role EXCLUDES. */
  competitionLifts: Partial<Record<ViadaPattern, string>>;
  /** Working numbers from week one's test. Absent in the test week itself. */
  workingNumbers?: Partial<Record<TestedLift, WorkingNumber>>;
  /** Stored 1RMs — the SEED for the test's warm-up weights, never the working number. */
  seed1RMs?: Partial<Record<TestedLift, number>>;
  baselines?: EnduranceBaselines;
  equipment?: string[] | null;
  /** Endurance levels the athlete chose, per family. Absent → the frame's own level. */
  levelOverrides?: Partial<Record<string, Level>>;
  /** ⛔ DEMONSTRATED, not intended. Gates the advanced tier — see `advancedTierSessions`. */
  demonstratedWeeklyMiles?: number | null;
  roundTo?: number;
  smallestPlatePairLb?: number | null;
  /**
   * ⛔ WHICH CALENDAR DAY THE FRAME OPENS ON — `chooseDayMap` decides it from the athlete's pins.
   * Frame day 1 lands this many days after Monday. Absent = 0 = the Monday-start week.
   */
  dayOffset?: number;
  /**
   * ⛔ SKIP WEEK ONE'S TEST — offered ONLY when logged history already carries a trustworthy max
   * (Michael, 2026-08-23). ⚠️ Never a bare athlete preference: the caller must have derived
   * `workingNumbers` from evidence (`evidenceWorkingNumbers`) before setting this, and a block with
   * this true and no working numbers would prescribe nothing at all. Default is the test.
   */
  skipTestWeek?: boolean;
};

export type ComposeNote = { kind: 'source' | 'ours' | 'inferred' | 'gap' | 'warning'; text: string; cite?: string };

export type ComposedWeek = {
  frame: FrameId;
  week: number;
  column: ColumnKind;
  isTestWeek: boolean;
  sessions: PlanSession[];
  /** ⛔ THE DOSING LEDGER FOR THE WHOLE WEEK, strength sets included — p147's bucket. */
  ledger: DoseLedger;
  notes: ComposeNote[];
};

/**
 * ⛔ THE WEEKLY ME/DE ROTATION (p247). Odd weeks take the slot's own pattern; even weeks swap it
 * with its partner. His cadence, not ours — see `StrengthSlot.rotatesWith`.
 */
function patternForWeek(slot: StrengthSlot, week: number): ViadaPattern {
  if (!slot.rotatesWith) return slot.pattern;
  return week % 2 === 1 ? slot.pattern : slot.rotatesWith;
}


/**
 * ⛔ HIS REPS-IN-RESERVE, STAMPED ON THE ROW — and NOT stamped where he says there is none.
 *
 * p218 gives a reserve for three of the four intents (DE and SKILL 3-4, HYP 0-2) and says of ME, in
 * as many words, that there is **no RIR target**. `materialize-plan:2335` honours a row's own
 * `target_rir` above everything else (`getTargetRir` precedence 1), so stamping it here is how his
 * number reaches the logger instead of a protocol-wide average standing in for four different ones.
 *
 * ⚠️ MIDPOINT OF HIS BAND, rounded to the half. The band is his; picking a single number out of it
 * is ours, and it is the only choice in this function.
 *
 * ⚠️ AND AN ME ROW STILL RECEIVES A DERIVED TARGET DOWNSTREAM. `protocolUsesRir` is a
 * protocol-wide flag, not a per-slot one, so `materialize-plan` reads a target off the RPE chart for
 * any row that carries none. On an ME row (90-100%, 1-5 reps) that lands at essentially zero
 * reserve, which restates the prescription rather than contradicting it — but it is not the same as
 * p218's "no target". ⛔ RECORDED AS A GAP for the slice that touches the RIR seam; it is not fixed
 * by widening a shared flag on this stage's account.
 */
function targetRirForIntent(intent: 'ME' | 'DE' | 'SKILL' | 'HYP'): number | null {
  const p = prescribe(intent, 'barbell');
  if (p.kind !== 'barbell' || !p.rir) return null;
  return Math.round(((p.rir.lo + p.rir.hi) / 2) * 2) / 2;
}

/** ⛔ Percent of the working number, per intent. Stage 2 owns the bands; this only picks the top. */
function pctForIntent(intent: 'ME' | 'DE' | 'SKILL' | 'HYP'): number | null {
  const p = prescribe(intent, 'barbell');
  if (p.kind !== 'barbell' || !p.pctOf1RM) return null;
  return p.pctOf1RM.hi;
}

const LIFT_FOR_PATTERN: Record<ViadaPattern, TestedLift> = {
  push_upper: 'bench',
  pull_upper: 'bench',
  hinge_lower: 'deadlift',
  press_lower: 'squat',
};

const LOWER_PATTERNS: ViadaPattern[] = ['hinge_lower', 'press_lower'];

/**
 * ⛔ WHICH PATTERN'S COMPETITION LIFT IS THIS TESTED LIFT — and the `null` is the load-bearing half.
 *
 * ⚠️ IT IS NOT THE INVERSE OF `LIFT_FOR_PATTERN`, deliberately. That map answers *"if this pattern
 * carried a number, whose would it be"*; `pull_upper` answers `bench` there because a pull slot
 * shares no tested lift of its own. Inverting it would seed a competition lift onto `pull_upper` and
 * hand a barbell row the bench press's working number — `pull up @ 205 lb`, the first defect the
 * composer's own smoke run found, re-entering through the name table.
 *
 * ⚠️ AND OVERHEAD PRESS RESOLVES TO `null`. Neither column of `strength_5k` carries a `push_upper`
 * competition slot the athlete would fill with a press rather than a bench, so the frame tests the
 * press and never spends its number. p246 is the law; inventing a slot for it would be authorship.
 */
export const PATTERN_FOR_TESTED_LIFT: Record<TestedLift, ViadaPattern | null> = {
  bench: 'push_upper',
  squat: 'press_lower',
  deadlift: 'hinge_lower',
  overheadPress: null,
};

/**
 * ⛔ THE ONE TABLE OF WHAT EACH TESTED LIFT IS CALLED IN THIS BLOCK — written by the test session,
 * read back by whatever reads the test.
 *
 * ⚠️ SLICE 2 FOUND THE ROUND TRIP BROKEN. The test session named its exercises by the raw key
 * (`overheadPress`), so the athlete saw a key on a card and the reader could not find the one set
 * every weight in the block depends on. The name is resolved once, here, and both ends use it.
 */
export function testWeekLiftNames(
  competitionLifts: Partial<Record<ViadaPattern, string>>,
): Record<TestedLift, string> {
  const out = {} as Record<TestedLift, string>;
  for (const lift of TESTED_LIFTS) {
    const pattern = PATTERN_FOR_TESTED_LIFT[lift];
    out[lift] = testedLiftName(lift, pattern ? competitionLifts[pattern] : null);
  }
  return out;
}

/**
 * ⛔ ONE STRENGTH SLOT → ONE EXERCISE ROW.
 *
 * The `Accessory:` role is a FILTER on top of stage 2, exactly as p247 defines it: exclude the
 * athlete's competition movement for that pattern, then take the grid's answer.
 */
function exerciseForSlot(
  slot: StrengthSlot,
  args: ComposeArgs,
  notes: ComposeNote[],
  /** ⛔ ALREADY ON THIS DAY. Two slots resolving to the same movement is a real outcome of the grid
   *  — a hip thrust satisfies both `primary press_lower` and `secondary hinge_lower` — and it reads
   *  as an engine that lost its place. The later slot takes the next option instead. */
  takenToday: Set<string>,
): { exercise: StrengthExercise; movement: string; sets: number } {
  const pattern = patternForWeek(slot, args.week);
  const competition = args.competitionLifts[pattern] ?? null;

  const resolved = resolveSlot({
    category: slot.category,
    pattern,
    intent: slot.intent,
    equipment: args.equipment ?? null,
  });

  let movement: string;
  if (slot.role === 'competition' && competition) {
    // ⛔ *"All first lifts of the day should be a competition movement"* (p247). The athlete named it,
    // and it is never deduped away — the frame asks for it by name.
    movement = competition;
  } else {
    // ⛔ THE ROLE FILTER. A noncompetition variant in the same gross pattern.
    const options = slot.role === 'accessory' && competition
      ? resolved.options.filter((o) => o.name.toLowerCase() !== competition.toLowerCase())
      : resolved.options;
    let fresh = options.find((o) => !takenToday.has(o.name.toLowerCase()));

    /**
     * ⛔ IF THE CELL IS EXHAUSTED, WIDEN THE CATEGORY — NOT THE PATTERN.
     *
     * A bodyweight-only athlete has two or three movements in a lower-body cell, and two slots on
     * one day can empty it. p247 defines an accessory as *"a noncompetition lift with a similar
     * gross movement PATTERN"* — the pattern is the part that must hold, so the category is what
     * gives. ⚠️ This is the same widening stage 2's own ladder does for equipment, asked here for a
     * different reason, and it goes through `resolveSlot` rather than reimplementing it.
     */
    if (!fresh) {
      for (const alt of ['secondary', 'braced', 'focused', 'primary'] as const) {
        if (alt === slot.category) continue;
        const wider = resolveSlot({ category: alt, pattern, intent: slot.intent, equipment: args.equipment ?? null });
        fresh = wider.options.find((o) =>
          !takenToday.has(o.name.toLowerCase())
          && (!competition || o.name.toLowerCase() !== competition.toLowerCase()));
        if (fresh) break;
      }
    }
    // ⚠️ AND ONLY THEN A REPEAT. A duplicated movement is worse than nothing only until it is the
    // difference between a slot and a hole.
    movement = (fresh ?? options[0] ?? resolved.chosen).name;
  }
  takenToday.add(movement.toLowerCase());

  if (slot.ambiguousNotation && !notes.some((n) => n.text === slot.ambiguousNotation)) {
    notes.push({ kind: 'gap', text: slot.ambiguousNotation, cite: 'Viada p246' });
  }

  const p = prescribe(slot.intent, 'barbell');
  const sets = p.kind === 'barbell' ? p.sets : 1;
  const reps = p.kind === 'barbell' ? `${p.reps.lo}-${p.reps.hi}` : '';
  const isLower = LOWER_PATTERNS.includes(pattern);
  const pct = pctForIntent(slot.intent);

  /**
   * ⛔ A WORKING NUMBER BELONGS TO A TESTED LIFT, NOT TO A PATTERN — and getting this wrong is
   * D-322's disease with a new face. The pretest measures four lifts. A pull-up shares the
   * `pull_upper` pattern with nothing that was tested, and a hip thrust shares `hinge_lower` with the
   * deadlift; prescribing either off the neighbouring lift's number produces "Pull Up @ 205 lb" —
   * a real weight, for a movement that has none.
   *
   * ⚠️ SO THE LOAD IS PRESCRIBED ONLY WHERE THE MOVEMENT **IS** THE LIFT THAT WAS TESTED. Everything
   * else takes the app's existing auto-regulated contract: the plan states the movement and the reps
   * and nothing about the weight.
   */
  const testedLift = LIFT_FOR_PATTERN[pattern];
  const movementIsTested = testedLift != null
    && args.competitionLifts[pattern] != null
    && movement.toLowerCase() === String(args.competitionLifts[pattern]).toLowerCase();
  const working = movementIsTested ? args.workingNumbers?.[testedLift] : undefined;

  // ⛔ HYP CARRIES NO PERCENTAGE (p218 gives it reps, tempo and RIR and no load), so a HYP row states
  // the movement and the reps and NOTHING about the weight — the same `load_prescribed: false`
  // contract the app already has for auto-regulated work.
  const targetRir = targetRirForIntent(slot.intent);

  if (!working || pct == null) {
    return {
      exercise: {
        name: movement,
        sets,
        reps,
        weight: 'By feel',
        load_prescribed: false,
        ...(targetRir != null ? { target_rir: targetRir } : {}),
        notes: slot.sourceText,
      },
      movement,
      sets,
    };
  }

  const { weight, haircut } = prescribedLoad({
    working,
    frame: args.frame,
    week: args.week,
    isLower,
    pctOfWorkingNumber: pct,
    roundTo: args.roundTo ?? 5,
  });

  if (isLower && haircut < 1 && !notes.some((n) => n.cite === 'Viada p247' && n.text.includes('lower-body'))) {
    notes.push({
      kind: 'source',
      text: 'The lower-body weights start about three and a half per cent under where the test put '
        + 'them, because the run the day before is still in the legs. That comes back over the first '
        + 'nine weeks.',
      cite: 'Viada p247',
    });
  }

  return {
    exercise: {
      name: movement,
      sets,
      reps,
      weight,
      percent_1rm: pct,
      ...(targetRir != null ? { target_rir: targetRir } : {}),
      set_plan: Array.from({ length: sets }, () => ({
        weight,
        reps: p.kind === 'barbell' ? p.reps.hi : 1,
      })),
      notes: slot.sourceText,
    },
    movement,
    sets,
  };
}

/**
 * ⛔ THE TEST WEEK (Michael, 2026-08-23). Week one's ME days run the p215 pretest as guided
 * sessions — upper on day 1, lower on day 2 — and the stored 1RM only aims the warm-ups.
 */
function testDaySession(day: FrameDay, args: ComposeArgs, notes: ComposeNote[]): PlanSession | null {
  const lifts = TEST_DAY_LIFTS[day.day];
  if (!lifts) return null;
  // ⛔ THE TEST TESTS THE MOVEMENT THE BLOCK WILL PRESCRIBE — see `testWeekLiftNames`.
  const names = testWeekLiftNames(args.competitionLifts);
  const exercises: StrengthExercise[] = [];
  for (const lift of lifts) {
    const seed = args.seed1RMs?.[lift];
    const steps = seed ? pretestSession(lift, seed, args.roundTo ?? 5) : null;
    if (!steps) {
      // ⛔ NO SEED IS NOT A REASON TO SKIP THE TEST. It is a reason to run it by feel and say so.
      exercises.push({
        name: names[lift],
        reps: '6, 5, max',
        weight: 'By feel',
        load_prescribed: false,
        notes: 'No max on file to aim the warm-ups — work up until the last set is genuinely hard.',
      });
      continue;
    }
    exercises.push({
      name: names[lift],
      sets: steps.length,
      reps: steps.map((s) => s.reps).join(', '),
      weight: steps[steps.length - 1].weight,
      load_prescribed: true,
      notes: 'Test set — the last set is taken for max clean reps, and it sets the block\'s numbers.',
      set_plan: steps.map((s) => ({
        weight: s.weight,
        reps: s.reps === 'max' ? 1 : s.reps,
        amrap: s.reps === 'max',
      })),
    });
  }
  if (exercises.length === 0) return null;
  if (!notes.some((n) => n.text.includes('first week is the test'))) {
    notes.push({
      kind: 'source',
      text: 'The first week is the test. Two guided sessions set the numbers the rest of the block '
        + 'is built on, and fully prescribed weights start in week two. Testing before a programme '
        + 'is the source\'s own advice.',
      cite: 'Viada p215, p247',
    });
  }
  return {
    day: dayNameFor(args, day.day),
    type: 'strength',
    name: day.day === 1 ? 'Test: Upper' : 'Test: Lower',
    description: 'Work up in three steps. The last set is max clean reps and it is what the block reads.',
    duration: 45,
    strength_exercises: exercises,
    tags: ['standing_plan', 'test_week'],
  };
}

/** ⛔ THE PLYO DAY. Drill count and stop rule are his (p227); the effort count is ours. */
function plyoSession(day: FrameDay, args: ComposeArgs, notes: ComposeNote[]): PlanSession {
  if (!notes.some((n) => n.text === PLYO_DOSE.effortCountIsOurs)) {
    notes.push({ kind: 'ours', text: PLYO_DOSE.effortCountIsOurs });
    notes.push({ kind: 'source', text: PLYO_DOSE.stopRule, cite: PLYO_DOSE.stopRuleIsHis });
  }
  return {
    day: dayNameFor(args, day.day),
    type: 'strength',
    name: 'Plyometrics',
    description: PLYO_DOSE.stopRule,
    duration: 20,
    strength_exercises: [{
      name: 'Plyometric drills',
      sets: PLYO_DOSE.drillsPerDay,
      reps: PLYO_DOSE.effortsPerDrill,
      weight: 'Bodyweight',
      load_prescribed: false,
      notes: `${PLYO_DOSE.drillsPerDay} drills, about ${PLYO_DOSE.effortsPerDrill} efforts each, full rest between.`,
    }],
    tags: ['standing_plan', 'plyo'],
  };
}

/** ⛔ COMPOSE ONE WEEK. */
export function composeWeek(args: ComposeArgs): ComposedWeek {
  const frame = FRAMES[args.frame];
  if (!frame) throw new Error(`unknown frame: ${args.frame}`);
  const days = frame.columns[args.column];
  if (!days) throw new Error(`unknown column: ${args.column}`);

  const notes: ComposeNote[] = [];
  const sessions: PlanSession[] = [];
  const dosing: DosingSession[] = [];
  /**
   * ⛔ WEEK ONE IS THE TEST WEEK — UNLESS THE ATHLETE TOOK THE SKIP (Michael, 2026-08-23), and the
   * skip is only offerable when logged history already carries a trustworthy max for every lift the
   * block prescribes from. `skipTestWeek` is not a preference the composer honours on its own: the
   * caller must have derived the working numbers from that evidence first.
   *
   * ⚠️ A SKIP WITH NO WORKING NUMBERS IS REFUSED HERE rather than obeyed. That combination would
   * drop the test AND prescribe nothing — twelve weeks of "By feel" with no way to fix it — which is
   * a worse outcome than either branch alone. Falling back to the test is the safe direction.
   */
  const skipping = args.skipTestWeek === true
    && Object.keys(args.workingNumbers ?? {}).length > 0;
  const testWeek = isTestWeek(args.week) && !skipping;
  const anchors = resolveEnduranceAnchors(args.baselines);

  for (const day of days) {
    if (day.rest) continue;

    // ── strength ──────────────────────────────────────────────────────────────────────────────
    if (day.plyo) {
      sessions.push(plyoSession(day, args, notes));
    } else if (day.strength.length > 0) {
      const test = testWeek ? testDaySession(day, args, notes) : null;
      if (test) {
        sessions.push(test);
        {
          // ⛔ THE TEST'S SETS STILL COST THE WEEK. p147 counts a heavy set as a work set whatever
          // its purpose, so the ledger sees them.
          dosing.push({
            label: test.name,
            sets: (test.strength_exercises ?? []).map((e) => ({
              movement: e.name,
              intent: 'ME' as const,
              sets: e.sets ?? 1,
            })),
          });
        }
      } else {
        // ⛔ THE TEST WEEK IS STILL A WEEK. Days 1 and 2 are the pretest; days 4 and 5 run their own
        // slots as normal — by feel, because there is no working number until the test is done. A
        // week that simply drops half its lifting days is not what "the first week is the test"
        // means, and the athlete would find two empty days with no explanation.
        const exercises: StrengthExercise[] = [];
        const dosed: DosingSession['sets'] = [];
        const takenToday = new Set<string>();
        for (const slot of day.strength) {
          const { exercise, movement, sets } = exerciseForSlot(slot, args, notes, takenToday);
          exercises.push(exercise);
          dosed.push({ movement, intent: slot.intent, sets });
        }
        if (testWeek && !notes.some((n) => n.text.includes('by feel this week'))) {
          notes.push({
            kind: 'source',
            text: 'The other lifting days run by feel this week — the numbers arrive once the test is done.',
            cite: 'Viada p215',
          });
        }
        sessions.push({
          day: dayNameFor(args, day.day),
          type: 'strength',
          name: day.label ?? 'Strength',
          description: '',
          duration: 55,
          strength_exercises: exercises,
          tags: ['standing_plan', `frame:${frame.id}`, `column:${args.column}`],
        });
        dosing.push({ label: day.label ?? `day ${day.day}`, sets: dosed });
      }
    }

    // ── endurance ─────────────────────────────────────────────────────────────────────────────
    for (const slot of day.endurance) {
      const level = (args.levelOverrides?.[slot.family] as Level | undefined) ?? slot.level;
      const built = buildEnduranceSession({
        family: slot.family,
        level,
        archetype: slot.archetype,
        anchors,
      });
      const row = translateEnduranceSession(built, { raceTempo: slot.raceTempo });
      sessions.push({ day: dayNameFor(args, day.day), ...row });
    }
  }

  // ── the advanced tier: a PROGRAM tier, gated on demonstrated history ──────────────────────────
  const extraVt1 = advancedTierSessions(args.demonstratedWeeklyMiles);
  if (extraVt1 > 0 && args.column === 'standard') {
    const openDays = days.filter((d) => !d.rest && d.endurance.length === 0 && d.strength.length === 0);
    const targets = openDays.length > 0 ? openDays : days.filter((d) => !d.rest && d.endurance.length === 0);
    for (let i = 0; i < extraVt1 && i < targets.length; i++) {
      const built = buildEnduranceSession({ family: 'run_vt1', level: 1, anchors });
      const row = translateEnduranceSession(built);
      sessions.push({ day: dayNameFor(args, targets[i].day), ...row, tags: [...row.tags, 'advanced_tier'] });
    }
    notes.push({
      kind: 'source',
      text: 'An extra easy run, because the running already on file supports it. The source '
        + 'recommends one or two for more advanced runners, to test recovery.',
      cite: 'Viada p247',
    });
  }

  // ── accessories: stage 3's floor, over the WHOLE week ─────────────────────────────────────────
  //
  // ⛔ THE LEDGER SEES THE STRENGTH SETS TOO. p147 puts high-intensity work sets from strength work
  // in the same bucket as accessory sets; a ledger fed only accessories under-reports every session.
  const filled = fillMuscleFloor(dosing, { equipment: args.equipment ?? null });
  const ledger = ledgerFor(filled.sessions);
  for (const add of filled.added) {
    const target = sessions.find((s) => s.type === 'strength' && (s.name === add.session || s.day === add.session));
    if (!target) continue;
    target.strength_exercises = [
      ...(target.strength_exercises ?? []),
      {
        name: add.movement,
        sets: add.sets,
        reps: '8-10',
        weight: 'By feel',
        load_prescribed: false,
        notes: `Floor: ${add.muscle} had nothing else this week.`,
      },
    ];
  }
  for (const n of filled.notes) notes.push({ kind: n.kind === 'source' ? 'source' : 'ours', text: n.text, cite: n.cite });
  for (const u of filled.unfilled) {
    notes.push({ kind: 'warning', text: `${u.muscle}: ${u.reason}` });
  }

  return { frame: args.frame, week: args.week, column: args.column, isTestWeek: testWeek, sessions, ledger, notes };
}

/** Every week of a block. ⛔ Week one is the test week; the taper column is the hold variant. */
export function composeBlock(
  args: Omit<ComposeArgs, 'week' | 'column'> & { weeks: number; taperWeeks?: number[] },
): ComposedWeek[] {
  const out: ComposedWeek[] = [];
  const taper = new Set(args.taperWeeks ?? []);
  for (let week = 1; week <= args.weeks; week++) {
    out.push(composeWeek({ ...args, week, column: taper.has(week) ? 'taper' : 'standard' }));
  }
  return out;
}
