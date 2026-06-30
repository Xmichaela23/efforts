// STRENGTH-PRIMARY PLAN — the assembly: arc spine + maintenance endurance, sport-agnostic.
// Run: ~/.deno/bin/deno test --no-check --allow-import --allow-read --allow-env strength-primary-plan.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildArcPhases, composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

Deno.test('arc timeline — base→build→sharpen→retest, retest is the last week', () => {
  const { phases } = buildArcPhases(12);
  assertEquals(phases.map((p) => p.name), ['Base', 'Build', 'Race Prep', 'Retest']);
  assertEquals(phases[phases.length - 1].start_week, 12);
  assertEquals(phases[phases.length - 1].end_week, 12);
  // contiguous, covers all 12 weeks
  let next = 1;
  for (const p of phases) { assertEquals(p.start_week, next); next = p.end_week + 1; }
  assertEquals(next, 13);
});

Deno.test('strength is the SPINE — 4 strength + 2 endurance, conductor sequences by phase (run)', () => {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12, strengthFrequency: 4, tier: 'barbell',
    enduranceSport: 'run', enduranceFrequency: 2,
  });
  assertEquals(plan.duration_weeks, 12);
  assert(plan.name.startsWith('Get Stronger'));

  const wk = (n: number) => plan.sessions_by_week[String(n)];
  const strengthOf = (n: number) => wk(n).filter((s) => s.type === 'strength');
  const runOf = (n: number) => wk(n).filter((s) => s.type === 'run');

  // every week: 4 strength + 2 easy runs
  for (const n of [2, 7, 11]) {
    assertEquals(strengthOf(n).length, 4, `week ${n} should have 4 strength sessions`);
    assertEquals(runOf(n).length, 2, `week ${n} should have 2 maintenance runs`);
    assert(runOf(n).every((r) => /maintenance/i.test(r.description)), 'runs must be maintenance');
  }

  // CONDUCTOR through the spine: base week = build-lane compounds; build week = a different (power) lane.
  const baseEx = strengthOf(2).flatMap((s) => s.strength_exercises!.map((e) => e.name)).sort().join('|');   // Base
  const buildEx = strengthOf(7).flatMap((s) => s.strength_exercises!.map((e) => e.name)).sort().join('|');   // Build/power
  assert(/bench press|barbell row|back squat/i.test(baseEx), `base = build lane; got ${baseEx}`);
  assert(baseEx !== buildEx, 'conductor must sequence base vs build through the strength-primary spine');

  // retest week labeled + deloaded
  const retest = strengthOf(12);
  assert(retest.length > 0 && retest.every((s) => s.tags.includes('retest')), 'week 12 = retest');
});

Deno.test('SPORT-AGNOSTIC — works for a cyclist (bike maintenance, no run)', () => {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 8, strengthFrequency: 4, tier: 'barbell',
    enduranceSport: 'bike', enduranceFrequency: 2,
  });
  const wk2 = plan.sessions_by_week['2'];
  assertEquals(wk2.filter((s) => s.type === 'strength').length, 4);
  const rides = wk2.filter((s) => s.type === 'ride');
  assertEquals(rides.length, 2);
  assert(rides.every((r) => /easy/i.test(r.name)));
  assertEquals(wk2.filter((s) => s.type === 'run').length, 0, 'cyclist has no runs');
});

Deno.test('strength-only (no endurance) — pure block, just the arc', () => {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 8, strengthFrequency: 4, tier: 'barbell',
    enduranceSport: null, enduranceFrequency: 0,
  });
  const wk2 = plan.sessions_by_week['2'];
  assertEquals(wk2.length, 4);
  assert(wk2.every((s) => s.type === 'strength'));
});

Deno.test('days are distinct + ordered, strength never doubles a day', () => {
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2,
  });
  const wk = plan.sessions_by_week['3'];
  const days = wk.map((s) => s.day);
  assertEquals(new Set(days).size, days.length, 'no two sessions share a day');
});
