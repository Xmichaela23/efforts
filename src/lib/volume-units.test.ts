/**
 * ⛔⛔ TWO UNITS NEVER SHARE A FIELD — the hours-as-miles defect (2026-08-26).
 *
 * The Standing Plan's running ask became HOURS and its dropdown wrote into `state.targetMiles`,
 * which is the source of `target_weekly_miles`. So a pick of "4 hours" left the client as
 * **`target_weekly_miles: 4` — four MILES** — and reached every reader of that field: the coach
 * payload's upkeep comparison, the State screen's accent (`unit: 'mile'`), `create-goal`'s
 * untouched-seed test against the 20/30/40 tier seeds, `athlete-weekly-intent`, and the Get Stronger
 * generator. The same field also fed `accessoryBands`, which computed the endurance tier as
 * `targetMiles × pace / 60` — about a sixth of the real figure once it held hours.
 *
 * ⛔ NO ENGINE TEST COULD HAVE CAUGHT IT. The unit lives entirely in client state; the composer
 * receives whatever key it is handed and both keys are plain numbers. The payload comment warning
 * against a silent unit change was written one layer BELOW where the change was made.
 *
 * ⚠️ SO THIS IS A SOURCE-TEXT GUARD, AND ITS LIMITS ARE STATED RATHER THAN HIDDEN. `NonRaceBuilder`
 * is a 6,000-line TSX component that `deno test` cannot import (JSX), which is why the existing
 * `strength-none.test.ts` pins its rule the same way. This asserts the WIRING as written, not the
 * runtime value: it catches the two fields being crossed again, and it would not catch a unit error
 * that never touches these identifiers. That is worth having; it is not worth mistaking for proof.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/volume-units.test.ts
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(
  new URL('../components/NonRaceBuilder.tsx', import.meta.url),
);

Deno.test('⛔ THE HOURS ASK HAS ITS OWN FIELD, and it is not the miles field', () => {
  // ⛔ `target_run_hours` COMES FROM `targetRunHours`. If this line ever reads `targetMiles` again,
  // the wizard is shipping hours to five readers that mean miles.
  assert(
    /target_run_hours:\s*Number\(state\.targetRunHours\)/.test(SRC),
    'target_run_hours is no longer fed from state.targetRunHours',
  );
  assert(
    !/target_run_hours:\s*Number\(state\.targetMiles\)/.test(SRC),
    '⛔ target_run_hours is being fed from the MILES field again — the 2026-08-26 defect',
  );

  // ⛔ AND THE RUNNING DROPDOWN WRITES THE HOURS FIELD. This is the line that crossed them.
  assert(
    /onRunVolume=\{\(v\) => setState\(\(st\) => \(\{\s*\.\.\.st,\s*targetRunHours:/.test(SRC),
    'the running volume control no longer writes state.targetRunHours',
  );
});

Deno.test('⛔ `target_weekly_miles` STILL MEANS MILES', () => {
  /**
   * ⚠️ IT IS NOT ASSERTED ABSENT. On the strength path it now carries only the tier card's seed
   * (20/30/40), which is exactly what `create-goal`'s untouched-seed test was built to recognise.
   * What must stay true is its SOURCE: the canonicalised miles value, never the hours pick.
   */
  assert(
    /target_weekly_miles:\s*targetWeeklyMiles/.test(SRC),
    'target_weekly_miles changed source',
  );
  assert(
    !/target_weekly_miles:\s*Number\(state\.targetRunHours\)/.test(SRC),
    '⛔ the hours pick is being shipped as miles',
  );
  // ⛔ AND ITS CANONICALISER STILL READS THE MILES FIELD, with the unit conversion intact — that
  // conversion is what makes it miles rather than "whatever the box held".
  assert(
    /const canonMiles[\s\S]{0,220}state\.targetMiles[\s\S]{0,120}1\.609344/.test(SRC),
    'the miles canonicaliser no longer reads state.targetMiles through the km conversion',
  );
});

Deno.test('⛔ THE ACCESSORY BAND TAKES HOURS DIRECTLY — no pace conversion left to go stale', () => {
  /**
   * ⛔ IT DERIVED RUN HOURS AS `miles × pace / 60`. Once the field held hours that was a sixth of
   * the real figure, dropping the endurance tier and handing out accessory volume the week cannot
   * carry. The conversion is DELETED rather than corrected: the screen has the hours.
   */
  assert(
    /const runHours = Number\(state\.targetRunHours\) > 0/.test(SRC),
    'the accessory band no longer reads the hours field directly',
  );
  assert(
    !/const runHours = miles != null && paceMinPerMile > 0/.test(SRC),
    '⛔ the miles×pace derivation came back',
  );
});
