/**
 * Fixtures for the D-263 measured HR-quality gate.
 * Run: deno test supabase/functions/_shared/hr-quality.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assessHrQuality, HR_MAX_DROPOUT_PCT } from './hr-quality.ts';

// Build a series of `n` points, first `zeros` of them with heartRate 0.
function series(n: number, zeros: number, hr = 140) {
  return Array.from({ length: n }, (_, i) => ({ heartRate: i < zeros ? 0 : hr }));
}

// ── Real clean sessions (user 45d122e7 — earn 'ok' from measured quality) ──
Deno.test("FR965 strap run: ~1.6% dropout, avg 138 → ok", () => {
  const r = assessHrQuality(series(300, 5, 138), 138); // 5/300 ≈ 1.7%
  assertEquals(r.hr_quality, 'ok');
});
Deno.test("FORM swim: ~5.2% dropout, avg 119 → ok (not a 'trap' — measured clean)", () => {
  const r = assessHrQuality(series(500, 26, 119), 119); // 26/500 = 5.2%
  assertEquals(r.hr_quality, 'ok');
  assertEquals(r.reason, 'ok');
});

// ── PIN: start-of-activity zeros (the artifact that briefly fooled the audit) ──
// A short leading zero-run in a long clean series is a low overall % → ok. v1
// percentage handles it; distribution nuance documented, not yet needed.
Deno.test('leading start zeros in a long clean series → ok (percentage absorbs it)', () => {
  const r = assessHrQuality(series(600, 8, 120), 120); // 8 leading zeros / 600 ≈ 1.3%
  assertEquals(r.hr_quality, 'ok');
});

// ── High dropout → low → (consumer falls back to sRPE/duration) ──
Deno.test('30% dropout → low (high_dropout)', () => {
  const r = assessHrQuality(series(100, 30, 140), 140);
  assertEquals(r.hr_quality, 'low');
  assertEquals(r.reason, 'high_dropout');
});
Deno.test(`boundary: exactly ${HR_MAX_DROPOUT_PCT}% → ok; just over → low`, () => {
  assertEquals(assessHrQuality(series(100, 15, 140), 140).hr_quality, 'ok');  // 15% == threshold, not over
  assertEquals(assessHrQuality(series(100, 16, 140), 140).hr_quality, 'low'); // 16% > 15%
});

// ── Implausible physiology → low ──
Deno.test('avg HR out of physiological range → low (implausible)', () => {
  assertEquals(assessHrQuality(series(200, 2, 250), 250).hr_quality, 'low'); // 250 bpm avg
  assertEquals(assessHrQuality(series(200, 2, 30), 30).hr_quality, 'low');   // 30 bpm avg
  assertEquals(assessHrQuality(series(200, 2, 250), 250).reason, 'implausible');
});

// ── No HR at all → none (strength / manual) ──
Deno.test('no series and no avg → none (no_hr)', () => {
  assertEquals(assessHrQuality(null, null).hr_quality, 'none');
  assertEquals(assessHrQuality([], null).hr_quality, 'none');
});
Deno.test('all-zero series → none (no valid points)', () => {
  const r = assessHrQuality(series(100, 100), null);
  assertEquals(r.hr_quality, 'none');
  assertEquals(r.reason, 'no_hr');
});

// ── Summary-only (no series): trust plausible avg, reject implausible ──
Deno.test('summary avg only, plausible → ok; implausible → low', () => {
  assertEquals(assessHrQuality(null, 145).hr_quality, 'ok');
  assertEquals(assessHrQuality(null, 5).hr_quality, 'low');
});
