/**
 * ⛔ THE DAY COUNT THE ATHLETE PICKED IS THE ONE THEY GET (2026-08-06).
 *
 * Michael, on the preview: *"asking for 4 runs its giving 5."* `create-goal` built `${n}-${n+1}`
 * from the intake's number and `getRunningDaysForWeek` takes the band's MAX on every build week — so
 * the band OPENED at the answer and the block ran a day above it for the whole plan.
 *
 * Two silent 400s lived in the same expression: seven days built `'7-8'` (not a legal string) and
 * six days built `'6-7'`, which `sustainable` does not support — so picking the top option on the
 * app's most common race goal could not build a plan at all.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/create-goal-and-materialize-plan/run-days.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveRunDaysPerWeek } from './non-race-routing.ts';
import { APPROACH_CONSTRAINTS } from '../generate-run-plan/types.ts';

const SUSTAINABLE = APPROACH_CONSTRAINTS.sustainable.supported_days;
const PERFORMANCE = APPROACH_CONSTRAINTS.performance_build.supported_days;

/** What the generator will actually run on a build week: the band's MAX, capped at 6. */
const buildWeekDays = (range: string) => Math.min(6, Number(range.split('-')[1]));

Deno.test('⛔ THE BUG: 4 days asked is 4 days built, not 5', () => {
  const { range, advisory } = resolveRunDaysPerWeek(4, SUSTAINABLE);
  assertEquals(range, '3-4');
  assertEquals(buildWeekDays(range), 4);
  assertEquals(advisory, null, 'nothing was overridden, so nothing should be announced');
});

Deno.test('every number the intake offers comes back as itself on a completion plan', () => {
  for (const asked of [4, 5, 6]) {
    const { range } = resolveRunDaysPerWeek(asked, SUSTAINABLE);
    assert(SUSTAINABLE.includes(range), `${asked} produced ${range}, which the approach rejects`);
    assertEquals(buildWeekDays(range), asked, `${asked} days built ${buildWeekDays(range)}`);
  }
});

Deno.test('⛔ AND THE CUTBACK WEEK STILL DROPS A DAY — the band was not flattened', () => {
  // The band earns its keep at the bottom: recovery weeks and the taper use the MIN.
  const { range } = resolveRunDaysPerWeek(5, SUSTAINABLE);
  assertEquals(range, '4-5');
  assertEquals(Number(range.split('-')[0]), 4, 'a recovery week should run one day lighter');
});

Deno.test('⛔ THE TWO SILENT 400s: 6 and 7 now produce strings the engine accepts', () => {
  for (const asked of [6, 7]) {
    const { range } = resolveRunDaysPerWeek(asked, SUSTAINABLE);
    assert(SUSTAINABLE.includes(range), `${asked} days still produces an illegal band: ${range}`);
  }
  // 7 is above what any block places (the generator caps at 6 to keep a rest day) — so it is
  // adjusted, and the adjustment is stated rather than silent.
  const seven = resolveRunDaysPerWeek(7, SUSTAINABLE);
  assertEquals(buildWeekDays(seven.range), 6);
  assert(seven.advisory, 'seven days was quietly reduced to six with nothing said');
  assert(seven.advisory!.message.includes('7'), 'the notice must name what they asked for');
  assert(seven.advisory!.message.includes('6'), 'the notice must name what they get');
});

Deno.test('a time goal cannot take four, gets five, and SAYS so', () => {
  // performance_build has no 3-4 band: two quality sessions plus a long run do not fit four days.
  const { range, advisory } = resolveRunDaysPerWeek(4, PERFORMANCE);
  assertEquals(range, '4-5');
  assertEquals(buildWeekDays(range), 5);
  assert(advisory, 'the override was silent — the exact failure this file exists to prevent');
  assertEquals(advisory!.code, 'run_days_adjusted');
  assert(advisory!.message.includes('4') && advisory!.message.includes('5'));
});

Deno.test('a time goal at 5, 6 and 7 is honoured exactly, with nothing announced', () => {
  for (const asked of [5, 6, 7]) {
    const { range, advisory } = resolveRunDaysPerWeek(asked, PERFORMANCE);
    assert(PERFORMANCE.includes(range), `${asked} produced ${range}`);
    assertEquals(buildWeekDays(range), Math.min(6, asked));
    if (asked <= 6) assertEquals(advisory, null, `${asked} days announced an override it did not make`);
  }
});

Deno.test('an unusable answer falls back to the engine default, silently', () => {
  for (const junk of [undefined, null, 'four', 0, -3, NaN]) {
    const { range, advisory } = resolveRunDaysPerWeek(junk, SUSTAINABLE);
    assertEquals(range, '4-5', `${String(junk)} produced ${range}`);
    assertEquals(advisory, null);
  }
});
