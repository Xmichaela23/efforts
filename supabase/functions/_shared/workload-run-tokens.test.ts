/**
 * Gap B fixture (2026-07-05) — the generator's real run token families must map to a
 * prescribed intensity, not silently fall to the 0.75 per-type default.
 *
 * Root cause: getStepsIntensity matches factor keys by substring. The keys were
 * easypace / warmup_run_easy / cooldown_easy / marathon_pace, but the generator emits
 * run_easy_50min / warmup_run_quality_12min / run_mp_4mi — none a substring of any key —
 * so 109 tokenized run rows (run_easy_* alone ×19+) defaulted to 0.75, reading HOTTER than
 * a prescribed easy run (0.65). Verified against stored planned_workouts (user 45d122e7):
 *   run_easy_30min@30min → stored 28 (0.75)  ... now 21 (0.65)
 *   run_easy_50min@50min → stored 47 (0.75)  ... now 35 (0.65)
 *
 * Permanent regression: these tokens must never re-default, and quality/long-run
 * sessions must be UNCHANGED (the harder token still wins the max).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  getStepsIntensity,
  getDefaultIntensityForType,
  calculateDurationWorkload,
} from './workload.ts';

// --- the three families that used to miss now match ---

Deno.test('run_easy_* maps to easy (0.65), not the 0.75 default', () => {
  assertEquals(getStepsIntensity(['run_easy_50min'], 'run'), 0.65);
  assertEquals(getStepsIntensity(['run_easy_35min'], 'run'), 0.65);
  assertEquals(getStepsIntensity(['run_easy_5mi'], 'run'), 0.65);
  assertEquals(getStepsIntensity(['run_easy_4mi'], 'run'), 0.65);
});

Deno.test('warmup_run_quality_* maps to easy (0.65)', () => {
  assertEquals(getStepsIntensity(['warmup_run_quality_12min'], 'run'), 0.65);
});

Deno.test('run_mp_* maps to marathon pace (0.82)', () => {
  assertEquals(getStepsIntensity(['run_mp_4mi'], 'run'), 0.82);
  assertEquals(getStepsIntensity(['run_mp_26.2mi'], 'run'), 0.82);
  assertEquals(getStepsIntensity(['run_mp_1.2mi'], 'run'), 0.82);
});

// --- quality / long-run sessions UNCHANGED (max wins; the added easy keys don't lower them) ---

Deno.test('interval session still 0.95 (interval/5kpace win the max, warmup no longer defaults up)', () => {
  assertEquals(
    getStepsIntensity(['warmup_run_quality_12min', 'interval_6x800m_5kpace_r90s', 'cooldown_easy_10min'], 'run'),
    0.95,
  );
});

Deno.test('strides session still 1.05', () => {
  assertEquals(getStepsIntensity(['run_easy_30min', 'strides_4x100m'], 'run'), 1.05);
});

Deno.test('tempo session = 0.88 (the specific 5kpace_plus0:45 pace key wins over bare 5kpace)', () => {
  // Substring matcher breaks on the first matching key in insertion order, so the
  // pace-specific 5kpace_plus0:45 (0.88) is picked before bare 5kpace (0.95) — the
  // honest tempo intensity. The added easy warmup/cooldown keys don't change the max.
  assertEquals(getStepsIntensity(['warmup_run_quality_12min', 'tempo_5mi_5kpace_plus0:45', 'cooldown_easy_10min'], 'run'), 0.88);
});

Deno.test('long run still matches easypace (0.65), unaffected by the new keys', () => {
  assertEquals(getStepsIntensity(['longrun_90min_easypace_last10steady'], 'run'), 0.65);
});

// --- no over-reach: a genuinely unknown token still hits the honest default ---

Deno.test('unknown token still falls to the per-type default (0.75)', () => {
  assertEquals(getStepsIntensity(['totally_unknown_token'], 'run'), getDefaultIntensityForType('run'));
  assertEquals(getStepsIntensity([], 'run'), 0.75);
});

// --- end-to-end load matches the corrected numbers ---

Deno.test('end-to-end: easy run load drops from the inflated default to the honest 0.65', () => {
  assertEquals(calculateDurationWorkload(30, getStepsIntensity(['run_easy_30min'], 'run')), 21); // was 28
  assertEquals(calculateDurationWorkload(50, getStepsIntensity(['run_easy_50min'], 'run')), 35); // was 47
});
