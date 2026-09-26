/**
 * ⛔ HEART-RATE ZONES ARE PER SPORT (2026-08-20).
 *
 * `TrainingBaselines` built ONE `zones` array from `runLTHR || rideLTHR` — run preferred — and
 * `compute-workout-analysis` read it as **priority 1** for every discipline, above every resolver.
 * So a RIDE was binned against the athlete's RUNNING zones. Cycling heart rate sits 5-10 bpm under
 * running at the same effort, so every ride landed a zone too easy: threshold work counted as tempo,
 * and the time-in-zone the 80/20 read rests on was wrong for the bike.
 *
 * ⛔ THE WRITER MOVED TO THE SERVER (2026-09-10). `TrainingBaselines` no longer derives or writes the
 * zones; `save-baselines/derive.ts` does. The writer assertions below read that file, and one more pins
 * that the screen stays out of zone maths. Behaviour of the derivation itself is pinned in
 * `supabase/functions/save-baselines/derive.test.ts`.
 *
 * ⚠️ THIS IS A SOURCE-SHAPE TEST, AND IT HAS TO BE. `compute-workout-analysis` is `@ts-nocheck` and
 * 5,000 lines with no unit tests, so neither the typechecker nor a fixture will catch the two ways
 * this regresses: reading the shared array for a ride again, or referring to a sport flag that is not
 * in scope at that point in the file (the first draft did exactly that — `isRideSport` is declared
 * inside the baselines block and the zone code runs 600 lines later, which `@ts-nocheck` hid).
 *
 * ⛔ AND THE READERS STOPPED READING THEM (2026-09-26, Michael). The stored arrays — Strava's automatic table
 * among them — outranked the threshold: one ride was counted on Strava's 110/137/150/164 while the learned ride
 * threshold was 153. The analysis and the Baselines zone table now both take their zones from ONE chain,
 * `heartRateZoneSet` (`_shared/endurance/display-zones.ts`): the threshold on Baselines → % of max → age
 * estimate. The writer below still writes the arrays; nothing in this chain reads them.
 *
 * Run: deno test --allow-read supabase/functions/_shared/per-sport-hr-zones.test.ts
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const analysisSrc = await Deno.readTextFile(new URL('supabase/functions/compute-workout-analysis/index.ts', REPO));
const baselinesSrc = await Deno.readTextFile(new URL('src/components/TrainingBaselines.tsx', REPO));
const writerSrc = await Deno.readTextFile(new URL('supabase/functions/save-baselines/derive.ts', REPO));
const readoutSrc = await Deno.readTextFile(new URL('supabase/functions/save-baselines/zones.ts', REPO));

Deno.test('the WRITER emits a per-sport zone array for each discipline', () => {
  assert(/zones_run\b/.test(writerSrc), 'no run zone array is written');
  assert(/zones_ride\b/.test(writerSrc), 'no ride zone array is written');
  // And the shared one stays — Strava writes the same key with genuinely sport-agnostic zones.
  assert(/cfg\.zones\s*=\s*zones\b/.test(writerSrc), 'the legacy shared array stopped being written');
});

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

Deno.test('the READERS read no stored zone table: the analysis and Baselines both ask heartRateZoneSet (2026-09-26)', () => {
  const analysisCode = stripComments(analysisSrc);
  assert(!/zones_ride|zones_run|configuredHrZones|configured_hr_zones\?*\.zones\b|cfg\.zones\b/.test(analysisCode), 'the analysis reads a stored zone table again');
  assert(/heartRateZoneSet\(baselineRow, zoneSport,/.test(analysisCode), 'the analysis no longer counts heart rate on the one chain');
  assert(/timeInZones\(hr_bpm, time_s, hrSet\.tops\)/.test(analysisCode), 'the analysis counts heart rate by a rule of its own');
  const readoutCode = stripComments(readoutSrc);
  assert(!/zones_ride|zones_run|cfg\.zones\b/.test(readoutCode), 'the Baselines zone table reads a stored zone table again');
  assert(/heartRateZoneSet\(row, 'run', \{ today \}\)/.test(readoutCode) && /heartRateZoneSet\(row, 'ride', \{ today \}\)/.test(readoutCode),
    'the Baselines zone table left the chain the analysis counts by');
});

Deno.test('the zone block derives its own sport flag — the outer one is out of scope', () => {
  const zoneBlock = analysisSrc.slice(analysisSrc.indexOf('TIME IN ZONE — THE ONE TABLE PER METRIC'));
  assert(/const zoneSport\s*=\s*hrZoneSport\(sport\)/.test(zoneBlock), 'the zone block no longer derives its own sport flag');
  // ⛔ `isRideSport` was declared inside the baselines block hundreds of lines earlier. Referring to it
  // here is a runtime ReferenceError that `@ts-nocheck` will not report.
  assert(!/\bisRideSport\b/.test(stripComments(zoneBlock)), 'the zone block reaches for an out-of-scope sport flag');
});

Deno.test('the receipt says WHICH zone set and anchor the session was counted in', () => {
  // A ride counted on the threshold and a ride counted on an age estimate must not store identically — the
  // card's words, and the next audit, are written from these two fields.
  assert(/schema: hrSet\.schema/.test(analysisSrc) && /anchor_bpm: hrSet\.anchor_bpm/.test(analysisSrc), 'the zone set is no longer stored with the bins');
});

Deno.test('the shared scalar is not written when it would be ambiguous', () => {
  // ⛔ `threshold_heart_rate` was `runLTHR || rideLTHR` — one number claiming both sports. An athlete
  // with BOTH now gets null there, so no reader can pick up the wrong sport's anchor by accident;
  // an athlete with only one still gets it, because then it is unambiguous.
  assert(
    /threshold_heart_rate:\s*\(runLthr\s*&&\s*rideLthr\)\s*\?\s*null\s*:\s*primaryLthr/.test(writerSrc),
    'the shared threshold is being written as if it belonged to both sports again',
  );
  assert(
    /max_heart_rate:\s*\(runMax\s*&&\s*rideMax\)\s*\?\s*null\s*:\s*primaryMax/.test(writerSrc),
    'the shared max HR is being written as if it belonged to both sports again',
  );
});

Deno.test('the WRITER resolves its anchors — it cannot save zones the engine refuses', () => {
  // ⛔ FOUND ON A REAL SCREEN. Max HR 175, LTHR 158 — and 175 x 0.90 = 157.5 -> 158, which is the
  // learner's `90% of observed max (estimated)` fallback, sample_count 0. The card called it
  // "learned". Every server surface now refuses that value, so a raw read would save zones built on
  // a number the engine will not use.
  assert(
    /rideLthr\s*=\s*m\.rideLthr\s*\|\|\s*resolveCurrentLthr\([^)]*\{\s*sport:\s*'ride'\s*\}\)/.test(writerSrc),
    'the bike anchor is being read raw by the writer',
  );
  assert(
    /runLthr\s*=\s*m\.runLthr\s*\|\|\s*resolveCurrentLthr\([^)]*\{\s*sport:\s*'run'\s*\}\)/.test(writerSrc),
    'the run anchor is being read raw by the writer',
  );
  const codeOnly = baselinesSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(
    !/learnedFitness\?\.(run|ride)_threshold_hr\?\.value/.test(codeOnly),
    'the screen reaches past the resolver to the raw threshold column',
  );
});

Deno.test('the SCREEN does no zone maths and writes no zones (2026-09-10)', () => {
  const codeOnly = baselinesSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/frielRunZones|getFrielZones|getKarvonenZones|getHRZones/.test(codeOnly), 'the screen computes zone tables again');
  assert(!/configured_hr_zones\s*:\s*configuredZones|update\(\{\s*configured_hr_zones/.test(codeOnly), 'the screen writes configured_hr_zones again');
});

Deno.test('the SCREEN shows the stored threshold heart rate or nothing — no estimate from max or age (2026-09-10)', () => {
  // ⛔ Michael, 2026-09-10: remove the 88%-of-max threshold estimate from Profile. This test used to pin
  // that estimate (and an age tier below it); both were numbers the engine refuses to use, shown as if
  // they were the athlete's threshold. The row now prints the resolver's value or nothing.
  const codeOnly = baselinesSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // d3f7f3a4 (Stage 4 session 1): the row is built on the server (`save-baselines/zones.ts`); the screen prints it.
  assert(/value=\{side\?\.lthr\.value \?\? null\}/.test(codeOnly), 'the threshold row no longer prints the server row');
  const readoutCode = readoutSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/value: lthr\.bpm != null \? `\$\{Math\.round\(lthr\.bpm\)\} bpm[^`]*` : null,/.test(readoutCode), 'the threshold row falls back to an estimate again');
  assert(!/\*\s*0\.88\b/.test(codeOnly), 'an 88%-of-max threshold estimate is back on the screen');
  assert(!/thresholdHR/.test(codeOnly), 'an age-based threshold estimate is back on the screen');
  assert(!/\*\s*0\.88\b/.test(readoutCode), 'an 88%-of-max threshold estimate is back in the server row');
  assert(!/thresholdHR/.test(readoutCode), 'an age-based threshold estimate is back in the server row');
});

Deno.test('the HR inputs show the SAME number the zones are built from', () => {
  // ⛔ FOUND ON SCREEN, 2026-08-20. The LTHR box kept its own copy of the tier chain — ending in the
  // age estimate — while `effectiveLTHR` moved to estimating from the measured max. The box read 148
  // (Tanaka(57) x 0.88) beneath a label that said "est. from max", which would have been 154. One
  // number, two chains, one component. The zones and the label used one; the input used the other.
  // 6c3d3c1a then d3f7f3a4: the inputs print the server readout row, built with the same resolver calls as the zone writer.
  assert(/value=\{side\?\.lthr\.value \?\? null\}/.test(baselinesSrc), 'the LTHR input carries its own chain again');
  assert(/value=\{side\?\.max_hr\.value \?\? null\}/.test(baselinesSrc), 'the max HR input carries its own chain again');
  assert(/resolveCurrentLthr\(baselinesLike, \{ sport \}\)/.test(readoutSrc), 'the readout threshold row left the resolver');
  assert(/resolveCurrentLthr\(baselinesForHr, \{ sport: 'run' \}\)/.test(writerSrc), 'the zone writer left the resolver');
  assert(/\{ sport, allowAgeEstimate: false \}/.test(readoutSrc), 'the readout max row takes an age estimate the zone writer refuses');
  assert(/allowAgeEstimate: false/.test(writerSrc), 'the zone writer takes an age estimate');
  const codeOnly = baselinesSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(
    !/value=\{sport\.manual(LTHR|MaxHR)\s*\|\|/.test(codeOnly),
    'an HR input is rebuilding the tier chain instead of reading the resolved value',
  );
});
