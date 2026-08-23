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
import { prescribedLoad } from './progression.ts';
import { translateEnduranceSession } from './session-vocabulary.ts';
import {
  isTestWeek,
  pretestSession,
  TEST_DAY_LIFTS,
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

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
  if (!working || pct == null) {
    return {
      exercise: {
        name: movement,
        sets,
        reps,
        weight: 'By feel',
        load_prescribed: false,
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
  const exercises: StrengthExercise[] = [];
  for (const lift of lifts) {
    const seed = args.seed1RMs?.[lift];
    const steps = seed ? pretestSession(lift, seed, args.roundTo ?? 5) : null;
    if (!steps) {
      // ⛔ NO SEED IS NOT A REASON TO SKIP THE TEST. It is a reason to run it by feel and say so.
      exercises.push({
        name: lift,
        reps: '6, 5, max',
        weight: 'By feel',
        load_prescribed: false,
        notes: 'No max on file to aim the warm-ups — work up until the last set is genuinely hard.',
      });
      continue;
    }
    exercises.push({
      name: lift,
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
    day: DAY_NAMES[day.day - 1],
    type: 'strength',
    name: day.day === 1 ? 'Test: Upper' : 'Test: Lower',
    description: 'Work up in three steps. The last set is max clean reps and it is what the block reads.',
    duration: 45,
    strength_exercises: exercises,
    tags: ['standing_plan', 'test_week'],
  };
}

/** ⛔ THE PLYO DAY. Drill count and stop rule are his (p227); the effort count is ours. */
function plyoSession(day: FrameDay, notes: ComposeNote[]): PlanSession {
  if (!notes.some((n) => n.text === PLYO_DOSE.effortCountIsOurs)) {
    notes.push({ kind: 'ours', text: PLYO_DOSE.effortCountIsOurs });
    notes.push({ kind: 'source', text: PLYO_DOSE.stopRule, cite: PLYO_DOSE.stopRuleIsHis });
  }
  return {
    day: DAY_NAMES[day.day - 1],
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
  const testWeek = isTestWeek(args.week);
  const anchors = resolveEnduranceAnchors(args.baselines);

  for (const day of days) {
    if (day.rest) continue;

    // ── strength ──────────────────────────────────────────────────────────────────────────────
    if (day.plyo) {
      sessions.push(plyoSession(day, notes));
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
          day: DAY_NAMES[day.day - 1],
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
      sessions.push({ day: DAY_NAMES[day.day - 1], ...row });
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
      sessions.push({ day: DAY_NAMES[targets[i].day - 1], ...row, tags: [...row.tags, 'advanced_tier'] });
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
