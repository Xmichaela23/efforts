/**
 * ⛔ AN ATHLETE WITH AN EASY PACE GETS PACES, NOT RPE — the rung that was missing (2026-08-06).
 *
 * THE INSTANCE. Every "getting to the finish" race builds on the sustainable generator, and that
 * generator prints a pace band only when a VDOT reaches it. Two rungs could supply one and neither
 * fires for a beginner: `create-goal` sends `effort_score` on the performance_build branch ONLY, and
 * a self-reported calibration needs an easy pace AND a 5K (`calibrationFromPaces` returns null with
 * one of the two). So the athlete who typed their easy pace — or whose easy pace was LEARNED from
 * their own runs — got "easy, conversational" where the app already knew the number.
 *
 * The rung itself was never missing from the codebase: `mergeRunPerformanceSeeds` has had
 * `estimateVdotFromBasePace` off the base pace the whole time. It just never ran on this path.
 *
 * TWO HALVES, because the defect spans both: the CHAIN (pace → VDOT → zone band) is arithmetic and
 * testable; the WIRING is one ordered ladder inside a 700-line `Deno.serve` handler that cannot be
 * imported without running it, so it is checked as a property of the source — same reasoning as
 * `create-goal…/preview-no-write.test.ts`.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/generate-run-plan/pace-ladder.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { estimateVdotFromBasePace, estimateVdotFromPace, formatPace } from './effort-score.ts';
import { paceZonesFromVdot } from '../_shared/endurance/index.ts';
import { resolveCurrentRunEasyPace } from '../../../src/lib/resolve-current-run-pace.ts';

Deno.test('easy pace ALONE resolves to a VDOT and a printable pace band', () => {
  // A learned easy pace and nothing else — no threshold pace, no effort score, no 5K.
  const easy = resolveCurrentRunEasyPace({
    learned_fitness: {
      run_easy_pace_sec_per_km: { value: 372, confidence: 'medium', sample_count: 9 }, // ~10:00/mi
    },
  } as never);
  assert(easy.sec_per_mi != null, 'the resolver must find the learned easy pace');
  assertEquals(easy.source, 'learned');

  const vdot = estimateVdotFromBasePace(easy.sec_per_mi!);
  assert(vdot != null && vdot > 0, `expected a VDOT off a ${easy.sec_per_mi}s/mi easy pace, got ${vdot}`);

  const zones = paceZonesFromVdot(vdot!);
  assert(zones.base > 0, 'the zone band must carry a base pace');
  assert(/^\d+:\d\d$/.test(formatPace(zones.base)), `expected a printable pace, got ${formatPace(zones.base)}`);
});

Deno.test('a typed easy pace counts too — the resolver\'s manual tier, not just the learned one', () => {
  const easy = resolveCurrentRunEasyPace({ performance_numbers: { easyPace: '9:30' } } as never);
  assertEquals(easy.sec_per_mi, 570);
  assert(estimateVdotFromBasePace(570) != null, 'a typed easy pace must reach a VDOT as well');
});

Deno.test('nothing on file stays null — no VDOT is invented (Law 2)', () => {
  const easy = resolveCurrentRunEasyPace({ learned_fitness: {}, performance_numbers: {} } as never);
  assertEquals(easy.sec_per_mi, null);
});

Deno.test('the threshold rung still outranks the easy one (it is the better measurement)', () => {
  // 4:20/km threshold ≈ 6:58/mi → a much higher VDOT than a 10:00/mi easy pace implies.
  const fromThreshold = estimateVdotFromPace(260 * 1.60934)!;
  const fromEasy = estimateVdotFromBasePace(600)!;
  assert(fromThreshold > fromEasy, `threshold ${fromThreshold} should outrank easy ${fromEasy}`);
});

Deno.test('⛔ THE WIRING: the handler\'s VDOT ladder ends on the easy pace, after the other two', () => {
  const SRC = Deno.readTextFileSync(new URL('./index.ts', import.meta.url));
  const at = (needle: string) => {
    const i = SRC.indexOf(needle);
    assert(i > 0, `the VDOT ladder no longer contains \`${needle}\``);
    return i;
  };
  const threshold = at('estimateVdotFromPace(thrSecPerKm');
  const effort = at('zoneVdot = effortScore');
  const easy = at('estimateVdotFromBasePace(easy.sec_per_mi)');

  assert(threshold < effort, 'the learned threshold pace must be tried before the effort score');
  assert(effort < easy, 'the easy pace is the LAST rung — it is the weakest signal, not the first');
  // Read through the resolver, never off `learned_fitness` directly (D-285/D-287).
  assert(
    SRC.includes('resolveCurrentRunEasyPace({ learned_fitness: lf, performance_numbers: pn }'),
    'the easy rung must read through the ONE run-pace resolver',
  );
  // And it stays guarded: the easy pace may not overwrite a VDOT the rungs above already found.
  const guard = SRC.lastIndexOf('if (zoneVdot === undefined) {', easy);
  assert(guard > effort, 'the easy rung must only run when nothing above it produced a VDOT');
});
