/**
 * ⛔⛔⛔ A TIME-PRESCRIBED STEP REACHES THE ATHLETE AS TIME — the regression test for a defect found
 * on a real athlete's exported plan (2026-08-31).
 *
 * ⛔ THE CHAIN IT GUARDS. The library prescribes a fifteen-second surge. `materialize-plan` computes
 * `distanceMeters = seconds ÷ pace` for total accounting — a legitimate internal number. **Two
 * readers then treated that by-product as the prescription:** the planned view printed *"101 yd"*
 * and never showed the time, and the Garmin export sent `durationType: 'DISTANCE'`, so the watch
 * counted down 101 metres for an interval the page prescribes in seconds. **The distance is only
 * true if the athlete is already on target pace — slow day it runs long, fast day short.**
 *
 * ⚠️ SOURCE CONTRACTS, NOT EXECUTION, AND SAID SO: both edge files are `@ts-nocheck` HTTP handlers
 * and are not importable here. What is asserted is that each site still carries the rule — which is
 * what a rebuild-property-by-property or a copy-paste of the old expression would break.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));

Deno.test('⛔ THE DERIVED DISTANCE IS MARKED AT ITS SOURCE', () => {
  const mat = read('../../materialize-plan/index.ts');
  assert(/out\.distanceDerived = true;/.test(mat),
    '⛔ materialize-plan no longer marks the distance it derives from duration and pace — every '
    + 'reader downstream is back to guessing which dimension was prescribed');
  // ⚠️ AND ONLY ON THE TIME-BASED BRANCH. A distance-prescribed step must not be marked derived, or
  // the readers flip the other way and a real distance step exports as time.
  const marks = mat.match(/out\.distanceDerived = true;/g) ?? [];
  assert(marks.length === 1, `the derived mark is set in ${marks.length} places, expected 1`);
});

Deno.test('⛔⛔ THE WATCH GETS TIME FOR A TIME-PRESCRIBED STEP — both export paths', () => {
  const gar = read('../../send-workout-to-garmin/index.ts');
  /**
   * ⛔ BOTH PATHS, AND THE SEGMENT ONE IS THE ONE THAT MATTERS MOST: most quality work is segmented
   * intervals, so fixing only the simple path would have left the defect where it actually lives.
   */
  assert(/const derivedDistance = \(interval as any\)\?\.distanceDerived === true/.test(gar),
    'the single-step export path stopped asking whether the distance was derived');
  assert(/const sDerived = \(seg as any\)\?\.distanceDerived === true/.test(gar),
    'the SEGMENT export path stopped asking whether the distance was derived');
  assert(/const meters = derivedDistance \? NaN : Number\(interval\?\.distanceMeters\)/.test(gar),
    'the single-step path reads the derived distance as a distance again');
  assert(/const sMeters = sDerived \? NaN : Number\(seg\?\.distanceMeters\)/.test(gar),
    'the segment path reads the derived distance as a distance again');
  /**
   * ⚠️ AND THE RUN-DISTANCE DURATION SUPPRESSION MUST SKIP A DERIVED STEP. It blanks the duration on
   * a running distance step so the watch shows no confusing clock — correct for a real distance step,
   * and fatal for a derived one: the step would carry neither a distance nor its prescribed time and
   * the malformed guard would silently drop it from the export.
   */
  assert(/isRun && !sDerived && Number\(seg\?\.distanceMeters\) > 0/.test(gar),
    '⛔ the duration suppression no longer exempts a derived distance — such a step would be dropped');
});

Deno.test('⛔ THE SCREEN SHOWS THE PRESCRIBED DIMENSION TOO', () => {
  const view = Deno.readTextFileSync(
    new URL('../../../../src/components/StructuredPlannedView.tsx', import.meta.url));
  assert(/const derived = \(st as \{ distanceDerived\?: boolean \}\)\?\.distanceDerived === true;/.test(view),
    'the planned view stopped asking whether the distance was derived');
  assert(/if \(!derived && typeof distM==='number' && distM>0\)/.test(view),
    '⛔ the planned view prints a derived distance as the prescription again — a fifteen-second '
    + 'surge reads as a yardage and the time never appears');
});
