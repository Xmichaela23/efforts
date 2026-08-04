/**
 * ⛔ THE MILEAGE FLOOR WARNS AND DOES NOT WALL — pinned structurally.
 *
 * ⛔ WHY THIS FILE EXISTS AT ALL. The floor shipped for one day as a hard block on Continue, and
 * the block was wrong: this codebase's own §5.2b says *"breach states cost and never refuses"*, and
 * the same rule is written out twice more (`place-week`'s `compromises[]` contract, and *"None is a
 * real answer with a stated cost"*). It was re-decided as advisory — Michael, 2026-08-04:
 * **"warn, no wall."**
 *
 * That is a DECISION, not a detail, and the shape of the code is the only place it lives. A future
 * session reading `validateWeeklyMiles` returning `ok: false` will reach for a gate — it is the
 * obvious thing to do with a false. This test is what stops that, and it names the reason so the
 * reach is answered before it is made.
 *
 * ⛔ SOURCE-SCANNED, BECAUSE THERE IS NO COMPONENT TEST RIG. The repo has no vitest / jest /
 * testing-library and not one `.test.tsx`; adding a framework to assert one boolean would be a far
 * bigger change than the thing it guards. Same call, same pattern, as
 * `create-goal-and-materialize-plan/preview-no-write.test.ts` and the D-377 vocabulary guard: when
 * the defect is "a decision got wired into a call site", scan the call site.
 *
 * ⚠️ WHAT THIS DOES **NOT** COVER. It cannot prove the button is clickable on a device — only that
 * the gate does not consult the verdict, and that the notice is still rendered. The device check is
 * the walk in the slice report.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/weekly-miles-advisory.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateWeeklyMiles } from './run-volume-tables.ts';

const SRC = await Deno.readTextFile(new URL('../components/NonRaceBuilder.tsx', import.meta.url));

Deno.test('the run step\'s Continue does not consult the mileage verdict', () => {
  const decl = SRC.match(/const runCanContinue = ([^;]+);/);
  assert(decl, 'runCanContinue has gone — if the gate was renamed, re-point this test, do not delete it');

  const expr = decl[1].trim();
  assertEquals(expr, 'true', `runCanContinue is "${expr}" — the mileage floor is walling again, and it is meant to warn`);

  // Belt and braces: whatever it is called, the run card's gate must not reference the verdict.
  assert(
    !/canContinue=\{[^}]*milesVerdict/.test(SRC),
    'a StepLayout canContinue references milesVerdict — the floor must not gate a step',
  );
});

Deno.test('the notice is still rendered — warn-no-wall is not the same as dropping the warning', () => {
  // The failure this catches is the lazy version of "warn, no wall": delete the gate AND the copy,
  // and the athlete silently gets a plan built on a base that does not support it. That is the
  // original bug back again, with a decision's name on it.
  assert(
    /milesVerdict\?\.ok === false && \(/.test(SRC),
    'the under-floor notice is no longer rendered — warning removed rather than un-walled',
  );
  // It must still say the number, the risk, and that carrying on is allowed.
  assert(/injury risk/.test(SRC), 'the notice no longer names the injury risk');
  assert(/milesFloorDisplay/.test(SRC), 'the notice no longer names the floor');
  assert(/this is a note, not a stop/.test(SRC), 'the notice no longer tells the athlete they may proceed');
});

Deno.test('⛔ the TIMELINE gate stays hard — it is a different kind of claim', () => {
  // Michael kept exactly one refusal on this path. A date in the past is arithmetic; a body that is
  // not ready is a judgement about a person. Only the first may refuse.
  const decl = SRC.match(/const raceCanContinue = ([^;]+);/);
  assert(decl, 'raceCanContinue has gone — the timeline gate was the one hard refusal and it stays');
  const expr = decl[1];
  assert(/raceWeeks !== null/.test(expr), 'the race gate no longer rejects a date that has passed');
  assert(/state\.raceDate/.test(expr) && /state\.fitness/.test(expr),
    'the race gate no longer requires both a date and a level');
});

Deno.test('the verdict itself is unchanged — still reports, still refuses to guess', () => {
  // The validator is the SIGNAL. Un-walling changed who acts on it, not what it says, so the
  // under-floor verdicts must still come back false with a named cause.
  const beginnerLow = validateWeeklyMiles('marathon', 'beginner', 20);
  assertEquals(beginnerLow?.ok, false, 'a beginner at 20 mi/wk should still be WARNED (and now allowed)');
  assertEquals(beginnerLow && !beginnerLow.ok ? beginnerLow.bound : null, 'base_floor');

  // and it still stays silent where it has no basis to speak
  assertEquals(validateWeeklyMiles('marathon', 'intermediate', null), null);
});
