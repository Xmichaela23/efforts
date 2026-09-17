/**
 * ⛔ THE RUN THRESHOLD TEST IS OFFERED, AND ITS RESULT OBEYS THE SAME RULES (2026-08-20).
 *
 * Abstaining when the app cannot measure a threshold is correct — Garmin greys the number out too.
 * Abstaining SILENTLY is not. The bike card schedules an FTP test and the swim card explains its
 * 400/200 protocol; the run card offered nothing, while the 12-minute time trial had been built end
 * to end for months: `materialize-plan:1334` expands the session, `compute-workout-analysis:843`
 * finds the ~720 s lap and writes the threshold. Built, tested, unreachable.
 *
 * ⚠️ SOURCE-SHAPE, DELIBERATELY. The writer lives in a 5,000-line `@ts-nocheck` edge function with no
 * fixtures, and the button lives in a React tree with none either. These pin the two things that
 * silently break: the TAG CONTRACT (rename the session freely; drop `run_test` and the test measures
 * nothing) and the two rules the result must obey now that it is the primary path.
 *
 * Run: deno test --allow-read supabase/functions/_shared/run-threshold-test.test.ts
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const card = await Deno.readTextFile(new URL('src/components/TrainingBaselines.tsx', REPO));
const analysis = await Deno.readTextFile(new URL('supabase/functions/compute-workout-analysis/index.ts', REPO));
const materialize = await Deno.readTextFile(new URL('supabase/functions/materialize-plan/index.ts', REPO));
// 6c3d3c1a / bb277dcb: the offer is Adjust's Retest row, and the session row is built by the shared test-row helper.
const adjust = await Deno.readTextFile(new URL('src/components/context/StateAdjustLens.tsx', REPO));
const testRows = await Deno.readTextFile(new URL('supabase/functions/_shared/baseline-test-rows.ts', REPO));
// ⛔ THE TIME-TRIAL MATHS MOVED INTO THE LEARNER (bc6d7b98, Stage 7 session 1): `learn-fitness-profile` is where the
// result is computed and checked now, so the invariant is read there.
const learner = await Deno.readTextFile(new URL('supabase/functions/learn-fitness-profile/index.ts', REPO));

Deno.test('the run card OFFERS the test when the threshold is not measured', () => {
  // 6c3d3c1a (Profile rebuilt like Adjust; tests live on Adjust, Michael 2026-09-05): Adjust's Retest row offers it.
  assert(/onClick=\{\(\) => scheduleTest\('run'\)\}[^>]*>Threshold</.test(adjust), 'Adjust no longer offers the run test');
  assert(/kind === 'run' \? runThresholdTestRow\(date\)/.test(adjust), 'the offer no longer builds the threshold test row');
  // 6c3d3c1a replaced the "only when unmeasured" gate: Adjust's Retest row offers the test whether or not a threshold is on
  // file; the one condition is whether a test is already scheduled (then it offers to remove it, so it cannot be doubled).
  assert(/\{scheduled\.run \? \(\s*<button[^>]*onClick=\{\(\) => removeTest\('run'\)\}/.test(adjust), 'a scheduled run test is no longer shown as one to remove');
});

Deno.test('⛔ THE TAG CONTRACT — `run_test` is what makes it a test', () => {
  // The name is cosmetic. `run_test` is what the expander and the analyser both key on; dropping it
  // turns the session into an ordinary hard run that measures nothing, with no error anywhere.
  // bb277dcb: the session row moved to the shared helper (`_shared/baseline-test-rows.ts`), which Adjust and week one call.
  const sched = testRows.slice(testRows.indexOf('export function runThresholdTestRow'), testRows.indexOf('export function ftpTestRow'));
  assert(/'run_test'/.test(sched), 'the scheduled session lost the run_test tag');
  assert(/type: 'run'/.test(sched), 'the scheduled session is no longer a run');
  assert(/tags\.includes\('run_test'\)/.test(materialize), 'the expander no longer keys on run_test');
  assert(/tags\.includes\('run_test'\)/.test(analysis), 'the analyser no longer keys on run_test');
});

Deno.test('the TEST RESULT obeys the invariant — faster than easy, or refused', () => {
  // ⛔ It is now the primary path to a measured threshold and writes at `confidence: 'high'`, which
  // every consumer trusts. A TT slower than the athlete's own easy pace is a mis-detected lap, a GPS
  // dropout, or an abandoned test — not a threshold.
  const block = learner.slice(learner.indexOf('const slowerThanEasy'));
  assert(learner.includes('const slowerThanEasy'), 'the test result no longer checks the invariant');
  assert(
    /paceSecPerKm > 180 && paceSecPerKm < 600 && !slowerThanEasy/.test(block.slice(0, 3000)),
    'the invariant is computed but not applied to the write',
  );
});

Deno.test('the TEST RESULT carries the date field readers actually use', () => {
  // ⛔ It wrote only `tested_at`. Every reader — and `resolveCurrentRunThresholdPace` — uses `as_of`,
  // so the app's most authoritative threshold reading reported as UNDATED.
  // ⚠️ The window is generous because the reason lives in a comment beside the code — a tight slice
  // made this fail on a passing implementation, which is the false alarm that gets a test deleted.
  // b1064203 renamed the source (p210, 88% of trial speed); bc6d7b98 moved the write into the learner.
  const at = learner.indexOf("source: 'Run time trial — 88% of vVO2 speed (Viada p210)'");
  assert(at >= 0, 'the learner no longer writes the time-trial threshold');
  const block = learner.slice(at, at + 1400);
  assert(/as_of:/.test(block), 'the test result is undated to every reader again');
  assert(/is_estimate: false/.test(block), 'the test result no longer declares itself measured');
});

Deno.test('an FTP built on rides that never went hard SAYS SO', () => {
  // ⛔ FTP is 95% of the best 20-minute power across the athlete's rides. That is only an FTP if one
  // of those twenty minutes was actually hard — otherwise it is their best EASY twenty minutes
  // wearing an FTP's name, and every power zone and plan target is built on it.
  //
  // ⚠️ THE SIGNAL IS ALREADY COMPUTED. `analyzeRides` marks `ride_threshold_hr` as an estimate when
  // it finds no hard rides; if there were none to detect a threshold heart rate from, there were none
  // to produce a maximal twenty minutes either. No new field, no new threshold.
  assert(/No hard rides on file/.test(card), 'the FTP card no longer flags an easy-rides estimate');
  assert(
    /rideThr\?\.is_estimate === true/.test(card),
    'the flag no longer keys on the already-computed no-hard-rides signal',
  );
  assert(
    /ftp_source[\s\S]{0,80}'learned'/.test(card),
    'the flag fires even when the athlete is on their own typed FTP, which it must not',
  );
});
