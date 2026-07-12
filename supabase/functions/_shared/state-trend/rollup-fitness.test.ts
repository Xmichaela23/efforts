/**
 * Q-162 — the overall fitness_direction rollup must be only as confident as its inputs.
 *
 * Before: rollupFitnessDirection OR-combined all 4 discipline verdicts and IGNORED each one's
 * `provisional` flag, so a thin/clustered trend (e.g. a bike verdict on 3 rides, or a Q-038-clouded
 * swim) could assert a confident "your fitness is improving" while the per-discipline breakdown right
 * below it hedged the SAME trend as "[provisional — sparse/limited data]". Un-weighted headline.
 *
 * After: the confident direction is decided by SOLID (non-provisional) verdicts only — thin data can
 * never ASSERT the headline. But it isn't silently swallowed either: when holding a thin mover out
 * changes the read, `thinHeldOut` names it so the narrative is honest about the data gap.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/rollup-fitness.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rollupFitness, rollupFitnessDirection } from './assemble.ts';

type D = { verdict?: string; provisional?: boolean };
const solid = (verdict: string): D => ({ verdict, provisional: false });
const thin = (verdict: string): D => ({ verdict, provisional: true });
const v1 = (parts: { strength?: D; bike?: D; run?: D; swim?: D }) => parts as any;

Deno.test('all solid, one improving → improving, no gap (baseline unchanged)', () => {
  const r = rollupFitness(v1({ run: solid('improving'), strength: solid('holding') }));
  assertEquals(r.direction, 'improving');
  assertEquals(r.thinHeldOut, []);
});

Deno.test('THIN data cannot assert a direction — thin-improving swim ≠ improving headline', () => {
  // Everything solid is flat; only swim is moving, on too little data → headline holds, swim named.
  const r = rollupFitness(v1({ strength: solid('holding'), run: solid('holding'), swim: thin('improving') }));
  assertEquals(r.direction, 'stable');
  assertEquals(r.thinHeldOut, ['swim']);
});

Deno.test('thin mover with NOTHING solid → stable but NOT silent (gap is named)', () => {
  const r = rollupFitness(v1({ swim: thin('improving') }));
  assertEquals(r.direction, 'stable');
  assertEquals(r.thinHeldOut, ['swim']); // "not enough swim data yet", never a silent flat read
});

Deno.test('solid decides, thin contradiction is held out and named', () => {
  // Run solidly improving, swim thinly sliding: old logic → 'mixed'; new → 'improving' + gap flag.
  const r = rollupFitness(v1({ run: solid('improving'), swim: thin('sliding') }));
  assertEquals(r.direction, 'improving');
  assertEquals(r.thinHeldOut, ['swim']);
});

Deno.test('thin verdict that AGREES with solid adds no noise', () => {
  const r = rollupFitness(v1({ run: solid('improving'), swim: thin('improving') }));
  assertEquals(r.direction, 'improving');
  assertEquals(r.thinHeldOut, []); // excluding it didn't change the headline → nothing to flag
});

Deno.test('two solid, opposing → mixed', () => {
  const r = rollupFitness(v1({ run: solid('improving'), bike: solid('sliding') }));
  assertEquals(r.direction, 'mixed');
  assertEquals(r.thinHeldOut, []);
});

Deno.test('needs_data is ignored (not asserted as a direction)', () => {
  const r = rollupFitness(v1({ run: solid('improving'), swim: { verdict: 'needs_data', provisional: false } }));
  assertEquals(r.direction, 'improving');
  assertEquals(r.thinHeldOut, []);
});

Deno.test('no signal at all → stable (cold-start contract unchanged)', () => {
  assertEquals(rollupFitness(v1({})).direction, 'stable');
  assertEquals(rollupFitness(null).direction, 'stable');
  assertEquals(rollupFitness(undefined).thinHeldOut, []);
});

Deno.test('back-compat: rollupFitnessDirection returns the direction only', () => {
  assertEquals(rollupFitnessDirection(v1({ run: solid('sliding') })), 'declining');
  // and it now reflects the provisional guard too:
  assertEquals(rollupFitnessDirection(v1({ swim: thin('improving') })), 'stable');
});
