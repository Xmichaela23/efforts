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
 * estimate. And since the race band and the export read that chain too, the writer stopped writing the arrays and
 * the one-number scalars (2026-09-26): it stores the typed numbers and nothing derived from them.
 *
 * Run: deno test --allow-read supabase/functions/_shared/per-sport-hr-zones.test.ts
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const analysisSrc = await Deno.readTextFile(new URL('supabase/functions/compute-workout-analysis/index.ts', REPO));
const baselinesSrc = await Deno.readTextFile(new URL('src/components/TrainingBaselines.tsx', REPO));
const writerSrc = await Deno.readTextFile(new URL('supabase/functions/save-baselines/derive.ts', REPO));
const readoutSrc = await Deno.readTextFile(new URL('supabase/functions/save-baselines/zones.ts', REPO));

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

Deno.test('the WRITER stores what was typed and no zone table or one-number scalar (2026-09-26)', () => {
  // Nothing reads `zones`, `zones_run`, `zones_ride`, their model names, or the one-number `threshold_heart_rate` /
  // `max_heart_rate` the writer used to derive: every zone edge is `heartRateZoneSet`, worked out at read time.
  const writerCode = stripComments(writerSrc);
  assert(!/zones_run|zones_ride|_model\b|cfg\.zones\s*=/.test(writerCode), 'the writer derives and stores a zone table again');
  assert(!/threshold_heart_rate\s*:|max_heart_rate\s*:/.test(writerCode), 'the writer stores a one-number threshold or max again');
  assert(/manual_run_lthr: m\.runLthr/.test(writerCode) && /manual_ride_lthr: m\.rideLthr/.test(writerCode), 'the typed thresholds are no longer stored');
  assert(/source: hasManual \? 'manual' : 'learned'/.test(writerCode), 'the source the Strava and watch-file writers check is no longer stored');
});

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

Deno.test('the SCREEN reads no raw threshold column', () => {
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
  assert(/\{ sport, allowAgeEstimate: false \}/.test(readoutSrc), 'the readout max row takes an age estimate');
  const codeOnly = baselinesSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(
    !/value=\{sport\.manual(LTHR|MaxHR)\s*\|\|/.test(codeOnly),
    'an HR input is rebuilding the tier chain instead of reading the resolved value',
  );
});
