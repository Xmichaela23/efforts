/**
 * Holistic BODY heart-rate response — read from the SPINE, covering every discipline whose HR is
 * trustworthy (run aerobic decoupling + bike HR-at-power), swim excluded (in-water HR unreliable).
 * Replaces the coach's run-only re-derived HR-drift. Provisional-aware: a thin read can't assert the
 * verdict (Q-162 pattern), but the contributor is still named.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/rollup-hr-response.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rollupHrResponse } from './assemble.ts';

type D = { verdict?: string; provisional?: boolean; newestAgeDays?: number | null };
const v1 = (parts: { run?: D; bike?: D }) => ({
  run: parts.run ? { decoupling: parts.run } : undefined,
  bike: parts.bike ? { efficiency: parts.bike } : undefined,
}) as any;

Deno.test('run + bike both holding → holding; stamp = OLDEST contributor (never overstates freshness)', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'holding', newestAgeDays: 14 }, bike: { verdict: 'holding', newestAgeDays: 5 } }));
  assertEquals(r.verdict, 'holding');
  assertEquals(r.contributors.map((c) => c.discipline), ['run', 'bike']);
  assertEquals(r.asOfAgeDays, 14); // the STALEST input (run 14d), not the fresh bike (5d) — the real bug fix
});

Deno.test('any SOLID contributor sliding → sliding (HR response worsening)', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'holding' }, bike: { verdict: 'sliding' } }));
  assertEquals(r.verdict, 'sliding');
});

Deno.test('bike-only (run needs_data) → reads the bike verdict', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'needs_data' }, bike: { verdict: 'improving', newestAgeDays: 2 } }));
  assertEquals(r.verdict, 'improving');
  assertEquals(r.contributors.map((c) => c.discipline), ['bike']);
  assertEquals(r.asOfAgeDays, 2);
});

Deno.test('THIN read cannot assert — provisional bike-improving does not flip a solid run-holding', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'holding' }, bike: { verdict: 'improving', provisional: true } }));
  assertEquals(r.verdict, 'holding');            // solid decides
  assertEquals(r.contributors.length, 2);        // …but the thin contributor is still named
});

Deno.test('all contributors provisional → holding (nothing solid asserts), still lists them', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'sliding', provisional: true }, bike: { verdict: 'sliding', provisional: true } }));
  assertEquals(r.verdict, 'holding'); // no solid → can't confidently call it sliding
  assertEquals(r.contributors.length, 2);
});

Deno.test('run improving + bike sliding (both solid) → holding, split named by contributors', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'improving' }, bike: { verdict: 'sliding' } }));
  assertEquals(r.verdict, 'holding');
  assertEquals(r.contributors.length, 2);
});

Deno.test('no reliable-HR endurance data → needs_data (swim never contributes)', () => {
  assertEquals(rollupHrResponse(v1({})).verdict, 'needs_data');
  assertEquals(rollupHrResponse(v1({ run: { verdict: 'needs_data' } })).verdict, 'needs_data');
  assertEquals(rollupHrResponse(null).verdict, 'needs_data');
});
