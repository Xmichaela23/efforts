// D-210 Cut 3 — the maintain clamp + the §3 collapse, tested on getBaseDistribution directly.
// Run: ~/.deno/bin/deno test --no-check supabase/functions/generate-combined-plan/posture-distribution.test.ts
import { assertEquals, assert, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getBaseDistribution, effectiveDisciplinePosture } from './science.ts';

const sum = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + (b || 0), 0);
// shorthand: tri 70.3, no limiter/swim shift, at the given phase + posture
const dist = (phase: any, posture?: any) =>
  getBaseDistribution('triathlon', '70.3', undefined, undefined, undefined, phase, posture);

Deno.test('effectiveDisciplinePosture — collapses at every terminal; absent → {}', () => {
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'build'), { bike: 'maintain' });
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'race_specific'), { bike: 'maintain' });
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'taper'), {});      // §3 collapse
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'recovery'), {});   // §3 collapse
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'rebuild'), {});    // §3 collapse
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'retest'), {});     // §3 collapse (D-213 Cut 4)
  assertEquals(effectiveDisciplinePosture(undefined, 'build'), {});                 // absent ≡ all-develop
});

Deno.test('maintain clamp — discipline drops to its floor; freed budget redistributes zero-sum', () => {
  const base  = dist('build');
  const maint = dist('build', { bike: 'maintain' });
  assert(base.bike > 0.12, 'precondition: tri 70.3 base bike > the 0.12 floor');
  assertAlmostEquals(maint.bike, 0.12, 1e-9);                 // clamped to MAINTENANCE_FLOORS.bike.pct
  assertAlmostEquals(sum(maint), sum(base), 1e-9);            // zero-sum: total preserved
  assert(maint.run > base.run, 'run (develop) claims freed budget');
  assert(maint.swim > base.swim, 'swim (develop) claims freed budget');
});

Deno.test('maintain clamp — §3 collapse: maintain is ignored at a terminal block', () => {
  const base = dist('build');
  const taperMaint = dist('taper', { bike: 'maintain' });    // collapsed → all-develop → NOT clamped
  assertEquals(taperMaint.bike, base.bike);
});

Deno.test('default (absent posture) is byte-parity with the no-posture call', () => {
  assertEquals(dist('build'), dist('build', undefined));
});
