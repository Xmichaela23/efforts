// STRENGTH-PRIMARY PLAN — ATR arc with a DELOAD, peak to a 96–97% single, and a SAFE retest
// (heavy sub-max triple → estimate e1RM, no solo max-grind). Off the entered 1RM, no inflation.
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildArcPhases, composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2,
});
const wk = (n: number) => PLAN.sessions_by_week[String(n)];
const strengthOf = (n: number) => wk(n).filter((s) => s.type === 'strength');
const benchEx = (n: number) =>
  strengthOf(n).flatMap((s) => s.strength_exercises ?? []).filter((e) => /^Bench Press/i.test(e.name));
const benchPct = (n: number) => Number((benchEx(n)[0]?.weight.match(/([\d.]+)%/) || [])[1]);
const allText = (n: number) => JSON.stringify(wk(n)).toLowerCase();

Deno.test('ATR arc with a DELOAD — accumulate→intensify→deload→peak→retest', () => {
  const { phases, recovery_weeks } = buildArcPhases(12);
  assertEquals(phases.map((p) => p.name), ['Base', 'Power', 'Deload', 'Peak', 'Retest']);
  // deload sits BETWEEN intensify and peak, ~6–8 wk in
  const deload = phases.find((p) => p.name === 'Deload')!;
  assert(deload.start_week >= 6 && deload.start_week <= 8, `deload at wk ${deload.start_week}, want 6–8`);
  assertEquals(recovery_weeks, [deload.start_week]);
});

Deno.test('DELOAD week recovers — lower volume + intensity than the weeks around it', () => {
  const deWk = buildArcPhases(12).phases.find((p) => p.name === 'Deload')!.start_week;
  const dePct = benchPct(deWk);
  assert(dePct <= 70, `deload bench ${dePct}% should drop (≤70)`);
  assert(dePct < benchPct(deWk - 1), 'deload intensity < the intensify week before it');
  assert(dePct < benchPct(deWk + 1), 'deload intensity < the peak week after it');
  // volume drop: deload sets < base sets
  const deSets = benchEx(deWk)[0].sets;
  assert(deSets <= 3, `deload volume should drop (sets ${deSets})`);
});

Deno.test('CURVE — peak still lands a 96–97% SINGLE in the final loading week (post-deload)', () => {
  const peak = buildArcPhases(12).phases.find((p) => p.name === 'Peak')!;
  const lastLoad = benchEx(peak.end_week)[0];
  assertEquals(lastLoad.reps, 1, 'final peak week = a single');
  assert(Number((lastLoad.weight.match(/([\d.]+)%/) || [])[1]) >= 96, `peak single ≥96%, got ${lastLoad.weight}`);
  assertEquals(benchPct(1), 72, 'base wk1 = 72%');
});

Deno.test('SAFE RETEST — heavy sub-max TRIPLE → estimate e1RM (NOT a solo max single)', () => {
  const ex = strengthOf(12).flatMap((s) => s.strength_exercises ?? []);
  assert(ex.length > 0);
  assert(ex.every((e) => e.reps === 3), 'retest is a TRIPLE, not a single');
  assert(ex.every((e) => parseFloat(e.weight) <= 92), 'retest is sub-max (≤~90%), not a near-max grind');
  const t = allText(12);
  assert(!t.includes('102.5%') && !t.includes('attempt a new max'), 'no solo near-max single attempt');
  assert(t.includes('triple') && (t.includes('epley') || t.includes('estimate')), 'estimate e1RM from a triple');
  assert(strengthOf(12).every((s) => s.tags.includes('estimate_1rm') && s.tags.includes('1rm_test')), 'tagged for e1RM write-back');
  for (const lift of ['Bench Press', 'Back Squat', 'Overhead Press', 'Deadlift']) assert(t.includes(lift.toLowerCase()));
});

Deno.test('honest copy — measured gain, not a hyped PR; no solo max attempt', () => {
  const d = PLAN.description.toLowerCase();
  assert(d.includes('measured') && d.includes('modest'), 'promise is tempered');
  assert(d.includes('deload') && d.includes('no solo max'), 'arc names the deload + the safe retest');
});

Deno.test('guard — real barbell every work phase, maintenance runs, sport-agnostic', () => {
  for (const n of [2, 6, 9]) {
    assertEquals(strengthOf(n).length, 4);
    const t = allText(n);
    assert(!t.includes('bodyweight tier cannot') && !t.includes('glute bridges'));
    assertEquals(wk(n).filter((s) => s.type === 'run').length, 2);
  }
  const bike = composeStrengthPrimaryPlan({ durationWeeks: 8, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'bike', enduranceFrequency: 2 });
  assertEquals(bike.sessions_by_week['2'].filter((s) => s.type === 'ride').length, 2);
});
