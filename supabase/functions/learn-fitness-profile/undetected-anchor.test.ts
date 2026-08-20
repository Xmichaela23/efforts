/**
 * ⛔ A NUMBER NOBODY DETECTED MAY NOT ANCHOR ANYTHING (2026-08-20).
 *
 * ⛔ THE LIVE CHAIN THIS REPRODUCES, from a real account after a re-learn:
 *   1. STEP 2 found no clear threshold and filled the hole — `95th percentile of sustained efforts`,
 *      146 bpm, confidence low, **sample_count 18** (the count of the efforts it took a percentile OF).
 *   2. `sample_count !== 0` was the only measured-vs-invented gate, so it passed everything.
 *   3. The easy band anchored at 89% × 146 = **130 bpm**. That athlete's easy runs sit at 133-141.
 *      ZERO qualified → `run_easy_pace_sec_per_km` went **null**.
 *   4. No easy pace → no ceiling on the threshold-pace filter → contaminated candidates published at
 *      **12:51/mi**, slower than his own easy pace, labelled "Measured from your runs".
 *
 * One mislabelled number took out four layers. The fix is the writer stating `is_estimate` outright
 * instead of readers inferring it from a sample count.
 *
 * ⚠️ Q-171 IS NOT REVERSED — see `easy-hr.test.ts`. Weak-but-MEASURED still anchors.
 *
 * Run: deno test supabase/functions/learn-fitness-profile/undetected-anchor.test.ts --no-check --allow-net
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeRuns } from './index.ts';
import { resolveRunEasyHrBand } from '../_shared/easy-hr.ts';

let seq = 0;
const run = (p: Record<string, unknown>): any => ({
  id: `w${++seq}`, type: 'run', date: '2026-08-01',
  duration: 45, moving_time: 45, distance: 6,
  avg_heart_rate: 137, max_heart_rate: 174, avg_pace: 470,
  avg_power: 0, normalized_power: 0, avg_speed: 0,
  workout_status: 'completed', computed: null, ...p,
});

/**
 * His shape: max 174, easy runs at 133-141, and NO clean threshold efforts — so STEP 2 falls to the
 * percentile branch. The hill sessions average near that percentile and their whole-activity pace
 * includes the walk-backs, which is what published 12:51.
 */
const athlete = () => [
  ...Array.from({ length: 10 }, (_, i) => run({
    avg_heart_rate: 133 + (i % 8), avg_pace: 470, date: `2026-08-0${(i % 9) + 1}`,
  })),
  ...Array.from({ length: 4 }, (_, i) => run({
    avg_heart_rate: 146, avg_pace: 479, duration: 40, moving_time: 40, date: `2026-08-1${i + 1}`,
  })),
];

Deno.test('THE BAND: an undetected threshold HR does not set the easy ceiling', () => {
  const band = resolveRunEasyHrBand({
    run_threshold_hr: {
      value: 146, confidence: 'low', sample_count: 18, is_estimate: true,
      source: '95th percentile of sustained efforts (no clear threshold data)',
    },
    run_max_hr_observed: { value: 174, confidence: 'high', sample_count: 25 },
  } as never);
  assertEquals(band.anchor, 'max_hr', 'an undetected threshold HR still anchored the band');
  assertEquals(band.ceiling, Math.round(174 * 0.80));   // 139 — captures runs at 133-141
  assert(band.ceiling! > 135, `ceiling ${band.ceiling} still excludes real easy runs`);
});

Deno.test('END TO END: the easy pace learns again, and the contaminated threshold does NOT publish', () => {
  const out = analyzeRuns(athlete() as never);

  // The anchor is honest about itself.
  assertEquals(out.threshold_hr?.is_estimate, true, 'the percentile branch still claims to be measured');

  // Which is the whole point: the easy pace comes back.
  assert(out.easy_pace != null, 'easy pace is still starved — the chain has not recovered');
  assert(out.easy_pace!.value > 0);

  // And the pace read refuses to measure against an anchor nobody detected.
  assertEquals(out.threshold_pace, null, `published a threshold against an undetected HR: ${out.threshold_pace?.source}`);
});

Deno.test('THE INVARIANT, restated end to end: nothing publishes a threshold slower than easy', () => {
  const out = analyzeRuns(athlete() as never);
  if (out.threshold_pace != null && out.easy_pace != null) {
    assert(
      out.threshold_pace.value < out.easy_pace.value,
      `threshold ${out.threshold_pace.value} s/km is not faster than easy ${out.easy_pace.value} s/km`,
    );
  }
});

Deno.test('a DETECTED threshold HR still works exactly as before', () => {
  // Real threshold efforts in the 85-92% band (174 × 0.85 = 148 … × 0.92 = 160).
  const withRealEfforts = [
    ...Array.from({ length: 10 }, (_, i) => run({ avg_heart_rate: 133 + (i % 8), avg_pace: 470, date: `2026-08-0${(i % 9) + 1}` })),
    ...Array.from({ length: 4 }, (_, i) => run({
      avg_heart_rate: 155, avg_pace: 400, duration: 35, moving_time: 35, date: `2026-08-2${i + 1}`,
    })),
  ];
  const out = analyzeRuns(withRealEfforts as never);
  assert(out.threshold_hr != null);
  assert(out.threshold_hr!.is_estimate !== true, 'a real detection was marked an estimate');
  assert(out.threshold_pace != null, 'a detected anchor no longer produces a threshold pace');
  assert(out.threshold_pace!.value < out.easy_pace!.value, 'threshold came out slower than easy');
});

Deno.test('the gate BITES where the easy-pace ceiling cannot: fast candidates, guessed anchor', () => {
  // ⛔ WRITTEN BECAUSE MUTATION SHOWED THE GATE WAS UNPINNED. In the chain above the easy-pace ceiling
  // already drops the candidates, so removing the detected-anchor check changed nothing. It bites in
  // the case the ceiling passes: candidates FASTER than easy pace, measured against a threshold HR
  // that was never detected. The ceiling is happy — the number is physiologically possible — and the
  // athlete is told "Measured from your runs" about a pace measured against a guess.
  const rows = [
    // Ten easy runs at 470 s/km → easy pace learns, ceiling = 470.
    ...Array.from({ length: 10 }, (_, i) => run({
      avg_heart_rate: 133 + (i % 8), avg_pace: 470, date: `2026-08-0${(i % 9) + 1}`,
    })),
    // Four runs FASTER than easy, sitting BELOW the 85% detection floor (174 × 0.85 = 148), so STEP 2
    // detects nothing and falls to the percentile branch — while these sail past the ceiling.
    ...Array.from({ length: 4 }, (_, i) => run({
      avg_heart_rate: 144, avg_pace: 400, duration: 40, moving_time: 40, date: `2026-08-1${i + 1}`,
    })),
  ];
  const out = analyzeRuns(rows as never);

  assertEquals(out.threshold_hr?.is_estimate, true, 'fixture no longer exercises the guessed-anchor branch');
  assert(out.easy_pace != null, 'fixture no longer learns an easy pace, so the ceiling is not in play');
  // The ceiling would ALLOW these — 400 is faster than 470. Only the detected-anchor gate refuses them.
  assert(
    out.threshold_pace == null,
    `measured a pace against an undetected anchor and published it: ${out.threshold_pace?.source}`,
  );
});
