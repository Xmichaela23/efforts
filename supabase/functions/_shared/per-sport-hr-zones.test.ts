/**
 * ⛔ HEART-RATE ZONES ARE PER SPORT (2026-08-20).
 *
 * `TrainingBaselines` built ONE `zones` array from `runLTHR || rideLTHR` — run preferred — and
 * `compute-workout-analysis` read it as **priority 1** for every discipline, above every resolver.
 * So a RIDE was binned against the athlete's RUNNING zones. Cycling heart rate sits 5-10 bpm under
 * running at the same effort, so every ride landed a zone too easy: threshold work counted as tempo,
 * and the time-in-zone the 80/20 read rests on was wrong for the bike.
 *
 * ⚠️ THIS IS A SOURCE-SHAPE TEST, AND IT HAS TO BE. `compute-workout-analysis` is `@ts-nocheck` and
 * 5,000 lines with no unit tests, so neither the typechecker nor a fixture will catch the two ways
 * this regresses: reading the shared array for a ride again, or referring to a sport flag that is not
 * in scope at that point in the file (the first draft did exactly that — `isRideSport` is declared
 * inside the baselines block and the zone code runs 600 lines later, which `@ts-nocheck` hid).
 *
 * Run: deno test --allow-read supabase/functions/_shared/per-sport-hr-zones.test.ts
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const analysisSrc = await Deno.readTextFile(new URL('supabase/functions/compute-workout-analysis/index.ts', REPO));
const baselinesSrc = await Deno.readTextFile(new URL('src/components/TrainingBaselines.tsx', REPO));

Deno.test('the WRITER emits a per-sport zone array for each discipline', () => {
  assert(/zones_run\b/.test(baselinesSrc), 'no run zone array is written');
  assert(/zones_ride\b/.test(baselinesSrc), 'no ride zone array is written');
  // And the shared one stays — Strava writes the same key with genuinely sport-agnostic zones.
  assert(/configuredZones\.zones\s*=\s*zones\b/.test(baselinesSrc), 'the legacy shared array stopped being written');
});

Deno.test('the READER prefers the sport-specific array', () => {
  assert(/zones_ride\s*\?\?\s*configuredHrZones\?\.zones\b/.test(analysisSrc), 'a ride no longer prefers ride zones');
  assert(/zones_run\s*\?\?\s*configuredHrZones\?\.zones\b/.test(analysisSrc), 'a run no longer prefers run zones');
});

Deno.test('the zone block derives its own sport flag — the outer one is out of scope', () => {
  const zoneBlock = analysisSrc.slice(analysisSrc.indexOf('Priority 1: Athlete-configured'));
  assert(/const zoneIsRide\s*=/.test(zoneBlock), 'the zone block no longer derives its own sport flag');
  // ⛔ `isRideSport` is declared inside the baselines block hundreds of lines earlier. Referring to it
  // here is a runtime ReferenceError that `@ts-nocheck` will not report.
  const codeOnly = zoneBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\bisRideSport\b/.test(codeOnly), 'the zone block reaches for an out-of-scope sport flag');
});

Deno.test('the receipt says WHICH array was used', () => {
  // A ride binned on shared zones and a ride binned on ride zones must not log identically — that is
  // how this went unnoticed in the first place.
  assert(/whichArray/.test(analysisSrc), 'the zone schema no longer records which array it used');
});

Deno.test('the shared scalar is not written when it would be ambiguous', () => {
  // ⛔ `threshold_heart_rate` was `runLTHR || rideLTHR` — one number claiming both sports. An athlete
  // with BOTH now gets null there, so no reader can pick up the wrong sport's anchor by accident;
  // an athlete with only one still gets it, because then it is unambiguous.
  assert(
    /threshold_heart_rate:\s*\(effectiveRunLTHR\s*&&\s*effectiveRideLTHR\)\s*\?\s*null\s*:\s*primaryLTHR/.test(baselinesSrc),
    'the shared threshold is being written as if it belonged to both sports again',
  );
  assert(
    /max_heart_rate:\s*\(effectiveRunMax\s*&&\s*effectiveRideMax\)\s*\?\s*null\s*:\s*primaryMax/.test(baselinesSrc),
    'the shared max HR is being written as if it belonged to both sports again',
  );
});

Deno.test('the SCREEN resolves its anchors — it cannot show zones the engine refuses', () => {
  // ⛔ FOUND ON A REAL SCREEN. Max HR 175, LTHR 158 — and 175 x 0.90 = 157.5 -> 158, which is the
  // learner's `90% of observed max (estimated)` fallback, sample_count 0. The card called it
  // "learned". Every server surface now refuses that value, so a raw read here would save and display
  // zones built on a number the engine will not use.
  assert(
    /effectiveRideLTHR\s*=\s*manualRideLTHR\s*\|\|\s*resolveCurrentLthr\([^)]*\{\s*sport:\s*'ride'\s*\}\)/.test(baselinesSrc),
    'the bike anchor is being read raw on the screen again',
  );
  assert(
    /effectiveRunLTHR\s*=\s*manualRunLTHR\s*\|\|\s*resolveCurrentLthr\([^)]*\{\s*sport:\s*'run'\s*\}\)/.test(baselinesSrc),
    'the run anchor is being read raw on the screen again',
  );
  const codeOnly = baselinesSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(
    !/learnedFitness\?\.(run|ride)_threshold_hr\?\.value/.test(codeOnly),
    'the screen reaches past the resolver to the raw threshold column',
  );
});
