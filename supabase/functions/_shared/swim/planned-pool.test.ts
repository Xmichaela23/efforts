/**
 * The pool a planned swim carries (audit H-D18).
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/swim/planned-pool.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { plannedPoolFor } from './planned-pool.ts';

Deno.test('no pool set: the row\'s units decide, then the athlete\'s', () => {
  assertEquals(plannedPoolFor({ type: 'swim', units: 'imperial' }, true), { pool_unit: 'yd', pool_length_m: 22.86 });
  assertEquals(plannedPoolFor({ type: 'swim', units: 'metric' }, false), { pool_unit: 'm', pool_length_m: 25 });
  assertEquals(plannedPoolFor({ type: 'swim' }, true), { pool_unit: 'm', pool_length_m: 25 });
  assertEquals(plannedPoolFor({ type: 'swim' }, false), { pool_unit: 'yd', pool_length_m: 22.86 });
});

Deno.test('a pool the athlete set is kept as it is', () => {
  assertEquals(plannedPoolFor({ type: 'swim', units: 'imperial', pool_unit: 'm', pool_length_m: 50 }, false), { pool_unit: 'm', pool_length_m: 50 });
  assertEquals(plannedPoolFor({ type: 'swim', units: 'imperial', pool_unit: 'yd' }, true), { pool_unit: 'yd', pool_length_m: 22.86 });
  assertEquals(plannedPoolFor({ type: 'swim', units: 'metric', pool_length_m: 33.33 }, true), { pool_unit: 'm', pool_length_m: 33.33 });
});

Deno.test('not a pool swim: nothing', () => {
  assertEquals(plannedPoolFor({ type: 'swim', environment: 'open_water', units: 'imperial' }, false), null);
  assertEquals(plannedPoolFor({ type: 'run', units: 'imperial' }, false), null);
  assertEquals(plannedPoolFor(null, false), null);
});
