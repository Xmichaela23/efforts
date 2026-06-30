// STRENGTH-PRIMARY PLAN — the loading curve must PROGRESS THE MAX: accumulate → intensify →
// realize (96–97% single) → open PR retest (≥100%). Run: ~/.deno/bin/deno test --no-check ...
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildArcPhases, composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2,
});
const wk = (n: number) => PLAN.sessions_by_week[String(n)];
const strengthOf = (n: number) => wk(n).filter((s) => s.type === 'strength');
const benchEx = (n: number) =>
  strengthOf(n).flatMap((s) => s.strength_exercises ?? []).filter((e) => /^Bench Press/i.test(e.name));
const allText = (n: number) => JSON.stringify(wk(n)).toLowerCase();

Deno.test('arc timeline — base→power→sharpen→retest', () => {
  assertEquals(buildArcPhases(12).phases.map((p) => p.name), ['Base', 'Power', 'Sharpen', 'Retest']);
});

Deno.test('#1 — every work phase is 4 REAL barbell sessions; no fillers/bodyweight copy', () => {
  for (const n of [2, 7, 10]) {
    assertEquals(strengthOf(n).length, 4);
    const t = allText(n);
    assert(!t.includes('bodyweight tier cannot') && !t.includes('glute bridges') && !t.includes('walking lunges'));
  }
});

Deno.test('CURVE — accumulate(72→82) → intensify(83→90) → PEAK reaches a 97% SINGLE', () => {
  const benchPct = (n: number) => Number((benchEx(n)[0]?.weight.match(/([\d.]+)%/) || [])[1]);
  assertEquals(benchPct(1), 72, 'base wk1 = 72%');           // accumulate start
  assert(benchPct(5) >= 80, `base end should reach ~82%, got ${benchPct(5)}`);
  assert(benchPct(6) >= 83, `power start ≥83%, got ${benchPct(6)}`);
  assert(benchPct(6) > benchPct(5), 'NO RESET: power > base end');
  assert(benchPct(9) >= 90, `power end ~90%, got ${benchPct(9)}`);
  // PEAK: the LAST sharpen week (wk11) is a near-maximal SINGLE on the main lift
  const peak = benchEx(11)[0];
  assertEquals(peak.reps, 1, 'wk11 bench must be a single');
  assert(Number((peak.weight.match(/([\d.]+)%/) || [])[1]) >= 96, `peak single ≥96%, got ${peak.weight}`);
});

Deno.test('#3 — retest OPENS at 100% + prescribes a PR attempt ABOVE it; never below; tagged for write-back', () => {
  const ex = strengthOf(12).flatMap((s) => s.strength_exercises ?? []);
  const weights = ex.map((e) => e.weight);
  assert(weights.includes('100% 1RM'), 'retest must open at 100% (renders at/above the start)');
  assert(weights.includes('102.5% 1RM'), 'retest must prescribe a PR attempt above 100%');
  const t = allText(12);
  assert(!t.includes('45%') && !t.includes('ramp 50→85'), 'no deload / no unparseable free-text weight');
  assert(!t.includes('≥100% of current'), 'the old free-text string that failed to parse is gone');
  // every retest weight is ≥100% (never below start) + clean "% 1RM"
  for (const w of weights) assert(/^\d[\d.]*% 1RM$/.test(w) && parseFloat(w) >= 100, `retest weight below start / unparseable: ${w}`);
  // tagged so logging it writes the new 1RM (lifecycle)
  assert(strengthOf(12).every((s) => s.tags.includes('1rm_test')), 'retest tagged 1rm_test for write-back');
  // tests all four main lifts
  for (const lift of ['Bench Press', 'Back Squat', 'Overhead Press', 'Deadlift']) assert(t.includes(lift.toLowerCase()));
});

Deno.test('accessories never get a 97% single (back-off volume in the peak)', () => {
  const accessories = strengthOf(11).flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => /Pull Up|Barbell Row|Romanian/i.test(e.name));
  assert(accessories.length > 0);
  assert(accessories.every((e) => Number((e.weight.match(/([\d.]+)%/) || [])[1]) <= 90), 'accessories stay ≤90% in the peak');
});

Deno.test('guard — maintenance runs + sport-agnostic preserved', () => {
  assertEquals(wk(7).filter((s) => s.type === 'run').length, 2);
  const bike = composeStrengthPrimaryPlan({ durationWeeks: 8, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'bike', enduranceFrequency: 2 });
  assertEquals(bike.sessions_by_week['2'].filter((s) => s.type === 'ride').length, 2);
});
