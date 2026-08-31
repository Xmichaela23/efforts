/**
 * ⛔ THE DAY THAT PRINTED THREE LUNGES — Michael's own export, 2026-08-31.
 *
 * p274 day 5 built as **Back Squat · back extension · bulgarian split squat · walking lunge ·
 * reverse lunge** at a barbell kit. Three single-leg movements in a five-row day, and only one of
 * them sits on the row that asks for one.
 *
 * ⚠️ THE CAUSE WAS SUBSTITUTION, NOT THE PAGE. p221's braced push lower and focused push lower are
 * both machine lists; at a barbell kit both fall to the ladder, and the ladder's quad answers are
 * lunges. Two independent cells gave the same correct answer as each other and as the SKILL row.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { isAsymmetrical } from '../strength-grid/index.ts';
import { isBodyweightLoad } from '../strength-grid/index.ts';

const BARBELL_KIT = ['Barbell + plates', 'Dumbbells', 'Flat bench'];

function lowerPushDay(equipment: string[]) {
  const wk = composeWeek({
    frame: 'all_rounder',
    column: 'standard',
    week: 2,
    roundTo: 5,
    equipment,
    competitionLifts: {
      push_upper: 'Bench Press',
      pull_upper: 'Pull Up',
      press_lower: 'Back Squat',
      hinge_lower: 'Deadlift',
    },
    seed1RMs: { bench: 153, overheadPress: 100, squat: 113, deadlift: 153 },
  } as never);
  const day = wk.sessions.find((s) => s.name === 'Lower body: Push')!;
  return day.strength_exercises!.map((e) => e.name);
}

Deno.test('the day\'s asymmetrical row owns the single-leg pattern', () => {
  const names = lowerPushDay(BARBELL_KIT);
  const asym = names.filter((n) => isAsymmetrical(n));
  // ⛔ THE FRAME PRINTS EXACTLY ONE ASYMMETRICAL CELL ON THIS DAY. Before the fix this was three.
  // ⚠️ Two is the honest bound, not one: the focused quad cell's only remaining loaded options are
  // single-leg, and a LOADED single-leg beats an UNLOADED bilateral one — see the bodyweight key.
  // Tightening this to 1 is what §13 item 2 buys (a loaded bilateral quad isolation).
  if (asym.length > 2) {
    throw new Error(`day 5 built ${asym.length} asymmetrical movements: ${names.join(' · ')}`);
  }
});

Deno.test('⛔ the fix never trades a lunge for a bodyweight squat', () => {
  /**
   * The first cut of the asymmetry rule did exactly this: `Bodyweight Squat · Air Squat · Bulgarian
   * Split Squat`. A volume cell for an athlete who owns a barbell is loaded work (REFERENCE §3).
   *
   * ⚠️ THE TEST NAMES THE QUAD CELLS RATHER THAN SCANNING THE WHOLE DAY, and the first draft of it
   * did the latter and failed on `Back Extension` and `Calf Raise`. Both are correct: the back
   * extension is the barbell kit's stand-in for p221's MACHINE back extension in the braced hinge
   * cell, and the calf raise is a muscle-floor row, not one of the cells this sort reorders.
   * `isBodyweightLoad` is right about both; a day-wide assertion was the wrong question.
   */
  const names = lowerPushDay(BARBELL_KIT);
  const squatPattern = names.filter((n) => /squat|lunge/i.test(n) && !/back squat/i.test(n));
  const unloaded = squatPattern.filter((n) => isBodyweightLoad(n));
  assertEquals(unloaded, [], `unloaded quad work for a barbell owner: ${names.join(' · ')}`);
});

Deno.test('a bodyweight athlete still gets a full day', () => {
  // ⚠️ THE RULE IS A SORT, NOT A FILTER. An athlete with nothing to load with is never emptied —
  // for them the catalogue IS bodyweight and the alternative is no work at all.
  const names = lowerPushDay([]);
  assertEquals(names.length > 0, true);
});
