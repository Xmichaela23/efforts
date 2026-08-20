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

Deno.test('the run card OFFERS the test when the threshold is not measured', () => {
  assert(/Schedule a threshold test/.test(card), 'the run card no longer offers the test');
  assert(
    /thrBasis\.state !== 'measured' && thrBasis\.state !== 'stated'/.test(card),
    'the offer is no longer gated on the threshold being unmeasured — it would nag an athlete who has one',
  );
});

Deno.test('⛔ THE TAG CONTRACT — `run_test` is what makes it a test', () => {
  // The name is cosmetic. `run_test` is what the expander and the analyser both key on; dropping it
  // turns the session into an ordinary hard run that measures nothing, with no error anywhere.
  const sched = card.slice(card.indexOf('const scheduleRunTest'), card.indexOf('const deleteRunTest'));
  assert(/'run_test'/.test(sched), 'the scheduled session lost the run_test tag');
  assert(/type: 'run'/.test(sched), 'the scheduled session is no longer a run');
  assert(/tags\.includes\('run_test'\)/.test(materialize), 'the expander no longer keys on run_test');
  assert(/tags\.includes\('run_test'\)/.test(analysis), 'the analyser no longer keys on run_test');
});

Deno.test('the TEST RESULT obeys the invariant — faster than easy, or refused', () => {
  // ⛔ It is now the primary path to a measured threshold and writes at `confidence: 'high'`, which
  // every consumer trusts. A TT slower than the athlete's own easy pace is a mis-detected lap, a GPS
  // dropout, or an abandoned test — not a threshold.
  const block = analysis.slice(analysis.indexOf("tags.includes('run_test')"));
  assert(/slowerThanEasy/.test(block.slice(0, 3000)), 'the test result no longer checks the invariant');
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
  const block = analysis.slice(analysis.indexOf("source: 'Run 12-min time trial'"), analysis.indexOf("source: 'Run 12-min time trial'") + 1400);
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
