// ============================================================================
// THE FRAME RULES — the laws every programme must satisfy, checked over EVERY frame and every kit.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/frame-rules.test.ts
//
// ⛔⛔ WHY THIS FILE EXISTS, AND IT IS THE WHOLE POINT OF IT. Michael, 2026-09-01: *"this will
// essentially be the template that we build a lot of programs off of, so this is really where the
// rule should be set."* Three defects were found and fixed on ONE week of ONE programme on
// 2026-08-31/09-01 — a missing movement pattern, a movement printed under equipment the athlete does
// not own, and a tested lift that priced nothing. **Each was fixed where it was found.** That fixes
// today's programme and does nothing for the next one.
//
// ⛔ SO THE RULES ARE ASSERTED OVER `FRAMES` — every frame, every column, several kits — rather than
// over the week somebody happened to be reading. A new programme transcribed next month is held to
// them the moment it is added to that table, by a test nobody has to remember to write.
//
// ⚠️ EACH RULE NAMES THE DEFECT IT CAME FROM. A rule whose origin is forgotten gets "fixed" by the
// next session that finds it inconvenient.
// ============================================================================

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, type StrengthExercise } from './compose.ts';
import { FRAMES, type ColumnKind, type FrameId } from './frames.ts';
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';
import { equipmentFitRank } from '../../../../src/lib/strength-gear.ts';

/**
 * ⚠️ KITS THAT SPAN THE GATE, not a list of real people. One that reaches the machines the pages
 * print, one that reaches none of them, and one bare enough that the substitution ladder is doing
 * all of the work.
 */
const KITS: Record<string, string[]> = {
  'commercial gym': ['Commercial gym'],
  'home gym': ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage',
    'Bench (flat/adjustable)', 'Pull-up bar', 'Resistance bands', 'Ab wheel', 'Incline bench'],
  'barbell only': ['Barbell + plates', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'],
};

const tested = (lift: string, oneRm: number) => ({
  lift, predicted1RM: oneRm, workingNumber: oneRm * 0.96,
  measured: { weight: Math.round(oneRm * 0.85), reps: 5 }, cite: 'frame-rules fixture',
});

const weekOf = (frame: FrameId, column: ColumnKind, equipment: string[]) =>
  composeWeek({
    frame, column, week: 2, roundTo: 5, equipment,
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    workingNumbers: {
      bench: tested('bench', 155), squat: tested('squat', 190),
      deadlift: tested('deadlift', 230), overheadPress: tested('overheadPress', 105),
    },
  } as never);

const rowsOf = (frame: FrameId, column: ColumnKind, equipment: string[]): StrengthExercise[] =>
  weekOf(frame, column, equipment).sessions
    .filter((s) => s.type === 'strength')
    .flatMap((s) => s.strength_exercises ?? []);

const FRAME_IDS = Object.keys(FRAMES) as FrameId[];
const COLUMNS: ColumnKind[] = ['standard', 'taper'];

// ════════════════════════════════════════════════════════════════════════════════════════════════
// RULE 1 — A PROGRAMME'S STANDARD WEEK PRESSES OVERHEAD, AND PULLS BOTH WAYS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ THE DEFECT (2026-09-01, Michael reading his own week): *"there's really no overhead press work
 * in that plan."* True, and nothing could have caught it — the muscle floor counts MUSCLES, and
 * deltoids were covered twice by the bench and the lateral raises, so every check passed.
 * **A movement pattern is not a muscle.**
 *
 * ⚠️ THE THREE ASSERTED HERE ARE THE ONES A LIFTING WEEK CANNOT OMIT AND STILL CLAIM TO BE ONE:
 * press overhead, pull vertically, pull horizontally. Squat and hinge are asserted below with them.
 * ⛔ NOT ASSERTED: calves, core, plyometrics. Those are legitimately absent from a given page — core
 * is opt-in on this app and the floor owns the rest — and demanding them here would force a row the
 * page does not print, which is how a leg raise ended up on a max-test day.
 * ⚠️ THE STANDARD COLUMN ONLY. A taper column is a deliberate subtraction; holding it to the same
 * spread would forbid the very thing it is for.
 */
const REQUIRED_PATTERNS = ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
  'hip_dominant', 'knee_dominant'] as const;

/** ⚠️ A raise is not a press. `vertical_push` is the catalogue's tag for both, so the pattern alone
 *  would have been satisfied by the two lateral raises that were there all along. */
const isPress = (name: string) => /press|dip|push up|pushup/i.test(name);

for (const frame of FRAME_IDS) {
  Deno.test(`⛔ RULE 1 — ${frame}'s standard week covers every pattern a lifting week must have`, () => {
    for (const [kitName, kit] of Object.entries(KITS)) {
      const rows = rowsOf(frame, 'standard', kit);
      const patterns = rows.map((e) => String(resolveExerciseConfig(String(e.name)).config?.pattern ?? ''));
      for (const want of REQUIRED_PATTERNS) {
        assert(patterns.includes(want),
          `⛔ ${frame} @ ${kitName}: the week contains no ${want}.\n`
          + `   rows: ${rows.map((e) => e.name).join(', ')}`);
      }
      const overhead = rows.filter((e) =>
        String(resolveExerciseConfig(String(e.name)).config?.pattern) === 'vertical_push'
        && isPress(String(e.name)));
      assert(overhead.length > 0,
        `⛔ ${frame} @ ${kitName}: vertical push is present but nothing PRESSES — a lateral raise is `
        + 'not an overhead press, and that is exactly how this went unnoticed for twelve weeks.');
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// RULE 2 — NO ROW NAMES EQUIPMENT THE ATHLETE DOES NOT OWN
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ THE DEFECT (Michael, on his own screen): a row reading **"Rear Delt Machine"** at a kit with no
 * machine. He reaches it with dumbbells on an incline bench — the movement is right, the NAME was a
 * station he does not own. Same class as *"Lat Pulldown"* on a gym with no cable stack.
 *
 * ⚠️ THE RULE IS ABOUT THE WORDS, NOT THE MOVEMENT. `execution_name` carries the honest name and the
 * canonical one stays put underneath, because it is what logged-vs-planned matching keys on.
 */
const NAMES_A_STATION = /machine|pulldown|pull down|cable|smith|hack squat|leg press|pec deck/i;

for (const frame of FRAME_IDS) {
  Deno.test(`⛔ RULE 2 — ${frame} never prints equipment the kit cannot reach`, () => {
    for (const [kitName, kit] of Object.entries(KITS)) {
      if (kitName === 'commercial gym') continue; // owns the stations; the name is the right one
      for (const column of COLUMNS) {
        for (const e of rowsOf(frame, column, kit)) {
          const shown = String((e as { execution_name?: string }).execution_name ?? e.name);
          assert(!NAMES_A_STATION.test(shown),
            `⛔ ${frame} ${column} @ ${kitName}: the row reads "${shown}", which names a station this `
            + 'athlete does not own. The movement may be right; the WORDS are the defect — give it an '
            + 'execution name, do not gate it out.');
        }
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// RULE 3 — EVERY MOVEMENT ON THE WEEK IS ONE THE ATHLETE CAN ACTUALLY PERFORM
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ THE DEFECT THIS GUARDS is the oldest one in this subsystem: declaring MORE equipment bought a
 * WORSE pick, because the gate emptied a cell of its untagged rivals. It is fixed; this keeps it
 * fixed on every frame rather than on the one cell it was found in.
 * ⚠️ `null` from the rank means the athlete cannot perform it at all. Bodyweight and untagged
 * movements rank 0 and are fine.
 */
for (const frame of FRAME_IDS) {
  Deno.test(`⛔ RULE 3 — ${frame} prescribes nothing the athlete cannot perform`, () => {
    for (const [kitName, kit] of Object.entries(KITS)) {
      for (const column of COLUMNS) {
        for (const e of rowsOf(frame, column, kit)) {
          assert(equipmentFitRank(String(e.name), kit) !== null,
            `⛔ ${frame} ${column} @ ${kitName}: "${e.name}" cannot be performed with this kit`);
        }
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// RULE 4 — A TESTED LIFT EITHER PRICES SOMETHING OR IS NOT TESTED
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ THE DEFECT (Michael, 2026-09-01): *"will the estimated one rep max help secondary lifts?"* The
 * overhead press was tested in week one of every block and priced NOTHING, because the push pattern
 * named `bench` as its only tested lift. An athlete performing a maximal effort for a number nothing
 * consumes is being asked to do work for nothing.
 *
 * ⚠️ THE ASSERTION IS DELIBERATELY WEAK — *"appears somewhere in the standard week"*, not *"prices a
 * row"*. A per-hand movement correctly stays by feel, so demanding a WEIGHT would forbid a dumbbell
 * variant the page itself lists. What may not happen is the lift being absent altogether.
 */
/**
 * ⚠️ ASKED OF THE CATALOGUE, NOT OF THE NAME (2026-09-01). A name list broke the moment the day-1
 * speed cell resolved to `Seated DB Press` — his own p220 movement, and a string no regex here had
 * thought of. The catalogue already records which tested lift each movement loads against; asking
 * IT means the rule survives a movement being renamed or swapped for another of his.
 */
const REF_FOR_TESTED: Record<string, string> = {
  bench: 'bench', squat: 'squat', deadlift: 'deadlift', overheadPress: 'overhead',
};

for (const frame of FRAME_IDS) {
  Deno.test(`⛔ RULE 4 — every lift ${frame} TESTS also appears in its standard week`, () => {
    for (const [kitName, kit] of Object.entries(KITS)) {
      /**
       * ⛔⛔ THE BARBELL-ONLY KIT IS EXEMPT, AND THE EXEMPTION IS A FINDING RATHER THAN A LOOPHOLE
       * (2026-09-01). p220 defines SECONDARY as *"compound noncontested movements, **dumbbell
       * variants**"*, and his two overhead entries for that cell are the seated DB press and the
       * Arnold press. **An athlete with a barbell and a bench cannot reach either**, and the barbell
       * overhead press is on his PRIMARY list — the day-opening competition slot, not this one.
       *
       * ⛔ SO THAT ATHLETE IS TESTED ON A LIFT THIS PROGRAMME CANNOT TRAIN THEM ON, and no
       * substitution fixes it without moving a movement out of the category he filed it under.
       * Closing it takes one of two rulings: stop testing the press for a kit that cannot train it,
       * or let the athlete name the press as their competition lift. **Neither is ours to make**, so
       * the rule holds where his list is reachable and this comment carries the rest.
       */
      if (kitName === 'barbell only') continue;
      const rows = rowsOf(frame, 'standard', kit);
      const refs = new Set(rows.map((e) => String(resolveExerciseConfig(String(e.name)).config?.primaryRef ?? '')));
      for (const [lift, ref] of Object.entries(REF_FOR_TESTED)) {
        assert(refs.has(ref),
          `⛔ ${frame} @ ${kitName}: week one tests the ${lift} and nothing in the programme loads `
          + `against it.\n   rows: ${rows.map((e) => e.name).join(', ')}`);
      }
    }
  });
}
