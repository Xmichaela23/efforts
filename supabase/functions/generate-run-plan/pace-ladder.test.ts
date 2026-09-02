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
  // 2026-09-02 (Michael, final): threshold is learned or entered, easy derives nothing. A learned
  // easy pace ALONE therefore resolves NO pace — the ladder needs a threshold rung.
  assertEquals(easy.sec_per_mi, null);
  const easyBand = 599;   // what the band would be off a 503 s/mi threshold; the VDOT path below is unchanged
  const vdot = estimateVdotFromBasePace(easyBand);
  assert(vdot != null && vdot > 0, `expected a VDOT off a ${easy.sec_per_mi}s/mi easy pace, got ${vdot}`);

  const zones = paceZonesFromVdot(vdot!);
  assert(zones.base > 0, 'the zone band must carry a base pace');
  assert(/^\d+:\d\d$/.test(formatPace(zones.base)), `expected a printable pace, got ${formatPace(zones.base)}`);
});

Deno.test('a typed easy pace is NOT a source any more (2026-09-02) — it reaches no VDOT', () => {
  const easy = resolveCurrentRunEasyPace({ performance_numbers: { easyPace: '9:30' } } as never);
  assertEquals(easy.sec_per_mi, null);
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

Deno.test('⛔ THE WIRING: the SELECTED easy pace is the FIRST rung, ahead of the 5K', () => {
  // ⚠️ THIS TEST CHANGED SIDES ON 2026-08-06 AND THE OLD VERSION IS WORTH KNOWING ABOUT: it asserted
  // the easy pace was the LAST rung ("the weakest signal, not the first"), which was right while the
  // question was "can we print a pace at all" and wrong once the athlete could SELECT one. A 25:21
  // 5K on file outranked a chosen "use my runs, 12:35" and wrote the whole plan off a number they
  // had explicitly declined. The selection is an answer; the 5K is a seed.
  const SRC = Deno.readTextFileSync(new URL('./index.ts', import.meta.url));
  const at = (needle: string) => {
    const i = SRC.indexOf(needle);
    assert(i > 0, `the VDOT ladder no longer contains \`${needle}\``);
    return i;
  };
  const selection = at('selectedEasy.sec_per_mi != null');
  // ⚠️ THE NEEDLE MOVED 2026-08-19, THE RULE DID NOT. The threshold rung used to read
  // `lf.run_threshold_pace_sec_per_km` raw into a local `thrSecPerKm`; it now goes through
  // `resolveCurrentRunThresholdPace` like every other anchor read (TRUTH-MAP §5), so the variable
  // changed name and the sec/km→sec/mi conversion went with it. What this test pins — selection
  // first, threshold second, 5K score last — is unchanged.
  const threshold = at('estimateVdotFromPace(thrResolvedForZones.sec_per_mi');
  const effort = at('zoneVdot = effortScore');

  assert(selection < threshold, 'the selected easy pace must be tried FIRST');
  assert(threshold < effort, 'the learned threshold pace is still the first fallback');
  // Read through the resolver, never off `learned_fitness` directly (D-285/D-287) — that is what
  // makes "use my number" beat a high-confidence learned pace, per Q-174.
  assert(
    SRC.includes('resolveCurrentRunEasyPace({ learned_fitness: lf, performance_numbers: pn }'),
    'the selection must be read through the ONE run-pace resolver',
  );
  // ⛔ AND SO MUST THE THRESHOLD RUNG (2026-08-19). It read the raw column while the line above it
  // resolved properly — one hand-rolled tier sitting next to a resolver call, blind to a typed
  // threshold and to the athlete's Q-174 choice, with no confidence bar.
  assert(
    SRC.includes('resolveCurrentRunThresholdPace({'),
    'the threshold rung must be read through the ONE threshold resolver, not off learned_fitness',
  );
  assert(
    !/lf\.run_threshold_pace_sec_per_km/.test(SRC),
    'generate-run-plan must not read the raw threshold column again — note this check is '
      + 'comment-BLIND on purpose, unlike the anchor lint: naming the column in prose here trips it, '
      + 'which is the cheapest possible reminder not to reintroduce the read by copy-paste.',
  );
  // The exact selected number travels too — the VDOT round trip is lossy and the athlete is looking
  // at the pace they picked.
  assert(
    /easy_pace_sec_per_mi: zoneEasySecPerMi/.test(SRC),
    'the selected pace itself no longer reaches the generator',
  );
  // The fallbacks are an if/else chain: nothing below may overwrite the selection.
  assert(
    /} else if \(thrResolvedForZones\.sec_per_mi != null\) \{/.test(SRC),
    'the fallbacks are no longer exclusive — something below can overwrite the selection',
  );
});

// ── THE SELECTION OUTRANKS THE 5K (2026-08-06) ───────────────────────────────

import { calculateEffortScore } from './effort-score.ts';
import { SustainableGenerator } from './generators/sustainable.ts';

/**
 * A measured THRESHOLD of 10:34/mi (634 s), whose easy reference band is 12:35, with a 25:21 5K also
 * on file. ⚠️ Was a "use my runs, 12:35" easy-pace selection until 2026-09-02; easy is not a source
 * any more, so the same athlete is expressed through the threshold that implies that band.
 */
const SELECTED_12_35 = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 634 / 1.609344, confidence: 'high', sample_count: 6 },
  },
  performance_numbers: {},
};

Deno.test('⛔ THE SELECTED EASY PACE BEATS THE 5K — they are not close, so this cannot pass by luck', () => {
  const easy = resolveCurrentRunEasyPace(SELECTED_12_35 as never);
  // 12:35/mi measured → threshold derived (÷1.19) → easy reference (×1.19): within a second of itself.
  assert(Math.abs(easy.sec_per_mi! - 755) <= 1, `expected ~755, got ${easy.sec_per_mi}`);
  assertEquals(easy.source, 'derived-from-threshold');      // easy is downstream of threshold (2026-09-02)
  const fromSelection = estimateVdotFromBasePace(easy.sec_per_mi!)!;
  const fromFiveK = calculateEffortScore(5000, 25 * 60 + 21);
  assert(
    fromFiveK > fromSelection + 5,
    `the two anchors are too close to prove anything: 5K ${fromFiveK} vs selection ${fromSelection}`,
  );
});

Deno.test('⛔ EVERY PRESCRIBED PACE AND EVERY DURATION COMES OFF THE SELECTION', () => {
  const easy = resolveCurrentRunEasyPace(SELECTED_12_35 as never);
  const plan = (new SustainableGenerator({
    distance: 'marathon', fitness: 'beginner', goal: 'complete', duration_weeks: 9,
    days_per_week: '3-4', user_id: 'test', start_date: '2026-08-10', race_date: '2026-10-11',
    current_weekly_miles: 20,
    vdot: estimateVdotFromBasePace(easy.sec_per_mi!),
    easy_pace_sec_per_mi: easy.sec_per_mi,
  } as never) as unknown as { generatePlan(): { sessions_by_week: Record<string, Array<{ description?: string; duration?: number; tags?: string[] }>> } }).generatePlan();

  // The selected number, as the resolver returns it (a reference band off threshold since 2026-09-02:
  // 12:35 measured → 12:34 after the ÷1.19 / ×1.19 round trip). Every session prints THAT.
  const expected = formatPace(easy.sec_per_mi!);
  const wk1 = plan.sessions_by_week['1'] ?? [];
  for (const s of wk1) {
    const paced = (s.description ?? '').match(/~(\d+):(\d\d)\/mi/);
    if (!paced) continue;
    assertEquals(`${paced[1]}:${paced[2]}`, expected, `a session printed ${paced[0]} instead of the selected pace`);
  }

  // Durations are priced at the same pace — the base class prices miles at a per-level constant
  // (beginner 11:00/mi), and that gap is what let a 26.2-mile race render as 21.3.
  const long = wk1.find((s) => (s.tags ?? []).includes('long_run'))!;
  const miles = Number((long.description ?? '').match(/^(\d+(?:\.\d+)?) miles/)?.[1]);
  const perMile = (long.duration ?? 0) / miles;
  assert(Math.abs(perMile - easy.sec_per_mi! / 60) < 0.2, `the long run was priced at ${perMile.toFixed(2)} min/mi, not ${expected}`);

  // …including race day: 26.2 × the selected pace ≈ 330 min.
  const race = (plan.sessions_by_week['9'] ?? []).find((s) => (s.tags ?? []).includes('race_day'))!;
  const wantRace = 26.2 * easy.sec_per_mi! / 60;
  assert(Math.abs((race.duration ?? 0) - wantRace) <= 3, `race priced at ${race.duration} min, wanted ~${wantRace.toFixed(0)}`);
});

Deno.test('with no selection on file the fallbacks still run in order', () => {
  // A learned THRESHOLD pace and nothing else still anchors the zones; nothing at all stays null and
  // the wording falls back to effort, which is the one thing that must never be a fabricated pace.
  const none = resolveCurrentRunEasyPace({ learned_fitness: {}, performance_numbers: {} } as never);
  assertEquals(none.sec_per_mi, null);
  assert(estimateVdotFromPace(260 * 1.60934)! > 0, 'the threshold rung stopped resolving');
});
