// STRENGTH-PRIMARY PLAN — arc spine + maintenance endurance, sport-agnostic, with the
// three loading fixes (real power sessions / continuous loading / retest-to-a-single).
// Run: ~/.deno/bin/deno test --no-check --allow-import --allow-read --allow-env strength-primary-plan.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildArcPhases, composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2,
});
const wk = (n: number) => PLAN.sessions_by_week[String(n)];
const strengthOf = (n: number) => wk(n).filter((s) => s.type === 'strength');
const exNames = (n: number) => strengthOf(n).flatMap((s) => (s.strength_exercises ?? []).map((e) => e.name));
const allText = (n: number) => JSON.stringify(wk(n)).toLowerCase();
const pctOf = (n: number) => {
  const m = JSON.stringify(strengthOf(n)).match(/(\d+(?:\.\d+)?)% 1rm/i);
  return m ? Number(m[1]) : NaN;
};

Deno.test('arc timeline — base→power→sharpen→retest', () => {
  const { phases } = buildArcPhases(12);
  assertEquals(phases.map((p) => p.name), ['Base', 'Power', 'Sharpen', 'Retest']);
  assertEquals(phases[phases.length - 1].start_week, 12);
});

Deno.test('#1 — every work phase is 4 REAL barbell sessions; NO maintenance fillers / bodyweight copy', () => {
  for (const n of [2, 7, 11]) { // base, power, sharpen
    assertEquals(strengthOf(n).length, 4, `week ${n} must have 4 strength sessions`);
    const t = allText(n);
    assert(!t.includes('bodyweight tier cannot'), `week ${n} leaked the false bodyweight copy`);
    assert(!t.includes('glute bridges') && !t.includes('walking lunges'), `week ${n} leaked maintenance-filler content`);
    assert(!t.includes('maintenance (optional)') && !t.includes('light lower body maintenance'), `week ${n} leaked a filler session`);
  }
  // power week is real barbell compounds at a real %
  const p = exNames(7);
  assert(p.includes('Bench Press') && p.includes('Back Squat'), `power week should be barbell compounds; got ${p}`);
});

Deno.test('#2 — continuous loading off the 1RM, NO phase reset (base<power<sharpen)', () => {
  const base = pctOf(5);   // base end
  const power = pctOf(6);  // power start
  const sharpen = pctOf(10);
  assert(base >= 70 && base <= 77, `base ${base} out of range`);
  assert(power >= 80, `power ${power} should start ≥80`);
  assert(power > base, `NO RESET: power (${power}) must exceed base end (${base})`);
  assert(sharpen >= 88, `sharpen ${sharpen} should be ≥88`);
  // reps drop by phase: base 5×5, power 5×3, sharpen 3×3
  assert(JSON.stringify(strengthOf(2)).includes('"reps":5'), 'base = 5-rep');
  assert(JSON.stringify(strengthOf(7)).includes('"reps":3'), 'power = 3-rep');
});

Deno.test('#2 — week-1 base is 70% (unchanged structure), squat present (base untouched)', () => {
  assertEquals(pctOf(1), 70);
  assert(exNames(1).includes('Back Squat') && exNames(1).includes('Bench Press'));
});

Deno.test('#3 — retest week works UP to a single, NOT a 45% deload', () => {
  const t = allText(12);
  assert(!t.includes('45% 1rm'), 'retest must NOT be a 45% deload');
  assert(t.includes('work up to') && (t.includes('new max') || t.includes('new 1rm')), 'retest must ramp to a new max');
  assert(t.includes('deadlift') && t.includes('back squat') && t.includes('bench press'), 'retest tests the main lifts');
});

Deno.test('maintenance endurance + structure preserved (guard)', () => {
  for (const n of [2, 7]) {
    const runs = wk(n).filter((s) => s.type === 'run');
    assertEquals(runs.length, 2, 'Wed/Sat easy runs preserved');
    assert(runs.every((r) => /maintenance/i.test(r.description)));
  }
  // distinct days, no doubling
  const days = wk(3).map((s) => s.day);
  assertEquals(new Set(days).size, days.length);
});

Deno.test('SPORT-AGNOSTIC — cyclist gets bike maintenance, no run', () => {
  const plan = composeStrengthPrimaryPlan({ durationWeeks: 8, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'bike', enduranceFrequency: 2 });
  const w2 = plan.sessions_by_week['2'];
  assertEquals(w2.filter((s) => s.type === 'strength').length, 4);
  assertEquals(w2.filter((s) => s.type === 'ride').length, 2);
  assertEquals(w2.filter((s) => s.type === 'run').length, 0);
});
