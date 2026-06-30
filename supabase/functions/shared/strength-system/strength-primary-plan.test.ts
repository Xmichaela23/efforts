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

Deno.test('CURVE — peak is heavy DOUBLES (no near-max single); the single is the retest check only', () => {
  const peak = buildArcPhases(12).phases.find((p) => p.name === 'Peak')!;
  const last = benchEx(peak.end_week)[0];
  assertEquals(last.reps, 2, 'final peak week = a double, NOT a single (one near-max moment, at retest)');
  const pk = Number((last.weight.match(/([\d.]+)%/) || [])[1]);
  assert(pk >= 92 && pk <= 95, `peak double ~94%, got ${last.weight}`);
  // the ONE near-max single lives at the retest (wk12 check), and it's ABOVE the peak double
  const retestSingle = Math.max(...strengthOf(12).filter((s) => s.tags.includes('optional'))
    .flatMap((s) => s.strength_exercises ?? []).map((e) => parseFloat(e.weight)));
  assert(retestSingle > pk, `the retest check (${retestSingle}%) must exceed the peak double (${pk}%)`);
  assertEquals(benchPct(1), 72, 'base wk1 = 72%');
});

Deno.test('COURTESY RETEST — sparing, NOT four max-out days; the CHECK expresses a gain (above the peak)', () => {
  const sessions = strengthOf(12);
  // exactly the 2 KEY lifts are optional max-CHECKS; the other 2 estimate from a working set
  const checks = sessions.filter((s) => s.tags.includes('optional'));
  assertEquals(checks.length, 2, 'only 2 optional max-checks (squat+bench), not 4 max-out days');
  const checkText = JSON.stringify(checks).toLowerCase();
  assert(/bench press/.test(checkText) && /back squat/.test(checkText), 'the checks are squat + bench');
  // the CHECK expresses a gain: prescribed ABOVE the wk11 peak single (97%), e1RM > start
  const checkPct = checks.flatMap((s) => s.strength_exercises ?? []).map((e) => parseFloat(e.weight));
  assert(checkPct.every((p) => p >= 100), `the check must work up ABOVE the old max (≥100%), got ${checkPct}`);
  assert(Math.max(...checkPct) > 97, 'the check renders above the wk11 peak single (97%)');
  // the other 2 ESTIMATE from a top working set (not a formal max)
  const estimates = sessions.filter((s) => !s.tags.includes('optional'));
  assertEquals(estimates.length, 2);
  assert(estimates.flatMap((s) => s.strength_exercises ?? []).every((e) => e.reps === 3), 'estimates are a working triple');
  const t = allText(12);
  assert(t.includes('optional') && (t.includes('epley') || t.includes('estimate')), 'optional + estimate framing');
  assert(sessions.every((s) => s.tags.includes('1rm_test') && s.tags.includes('estimate_1rm')), 'tagged for e1RM write-back');
});

Deno.test('honest copy — measured gain, optional courtesy retest (not mandatory max-out)', () => {
  const d = PLAN.description.toLowerCase();
  assert(d.includes('measured') && d.includes('modest'), 'promise is tempered');
  assert(d.includes('deload') && d.includes('optional') && d.includes('no mandatory max-out'), 'names the deload + courtesy retest');
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
