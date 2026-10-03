/**
 * The old assistance menu files no lift against the book (week builder Stage 1, 2026-10-02).
 *
 *   ~/.deno/bin/deno test --allow-read src/lib/assistance-catalog.test.ts --no-check
 *
 * A lift's heading lives in one place: `taxonomy.ts FILING`. This menu groups movements into its own three buckets; the
 * single-leg/core bucket held the front squat (p219, primary push lower) and the bench reverse hyper (p220, secondary
 * hinge). The guard: nothing the book files as a two-legged primary or secondary lift sits in single-leg/core.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { ASSISTANCE_CATALOG } from './assistance-catalog.ts';
import { filingOf, isAsymmetrical } from '../../supabase/functions/_shared/strength-grid/taxonomy.ts';

Deno.test('single-leg/core holds no two-legged primary or secondary lift', () => {
  const misfiled = ASSISTANCE_CATALOG
    .filter((e) => e.category === 'single_leg_core')
    .filter((e) => {
      const f = filingOf(e.name);
      return (f?.category === 'primary' || f?.category === 'secondary') && !isAsymmetrical(e.name);
    })
    .map((e) => `${e.name} (${filingOf(e.name)?.category} ${filingOf(e.name)?.pattern}, ${filingOf(e.name)?.cite})`);
  assertEquals(misfiled, []);
});

Deno.test('push holds only upper pushes and pull only upper pulls, where the book files the lift', () => {
  const off = ASSISTANCE_CATALOG.filter((e) => {
    const f = filingOf(e.name);
    if (!f) return false;
    if (e.category === 'push') return f.pattern !== 'push_upper';
    if (e.category === 'pull') return f.pattern !== 'pull_upper';
    return false;
  }).map((e) => `${e.name} → ${filingOf(e.name)?.pattern}`);
  assertEquals(off, []);
});
