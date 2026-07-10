// b2 scale-up (Q-149) — the lead-discipline resolver. Pins:
//  - single-sport plans resolve to their own discipline (run/ride lead honestly, not run-by-default)
//  - strength stays one decision (delegates to resolvePlanPrimary)
//  - triathlon/duathlon do NOT collapse to a single lead (multi — the client must not hoist one)
//  - swim resolves but (per product) will never be primary; still honest if it ever is
//  - un-nameable plan → 'unknown' (no forced lead), never a silent run-default
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolvePrimarySport } from './load-status-reconcile.ts';

Deno.test('strength-primary → strength (one decision, via resolvePlanPrimary)', () => {
  assertEquals(resolvePrimarySport({ source: 'strength_primary' }), 'strength');
  assertEquals(resolvePrimarySport({ plan_version: 'strength_primary_v2' }), 'strength');
});

Deno.test('run plan → run', () => {
  assertEquals(resolvePrimarySport({ discipline: 'run' }), 'run');
  assertEquals(resolvePrimarySport({ sport: 'running' }), 'run');
  assertEquals(resolvePrimarySport({ source: 'run' }), 'run');
});

Deno.test('cycling plan → ride (bike-forward now leads with bike, not run)', () => {
  assertEquals(resolvePrimarySport({ sport: 'cycling' }), 'ride');
  assertEquals(resolvePrimarySport({ discipline: 'bike' }), 'ride');
  assertEquals(resolvePrimarySport({ sport: 'ride' }), 'ride');
});

Deno.test('triathlon → triathlon (multi — no single lead)', () => {
  assertEquals(resolvePrimarySport({ sport: 'triathlon' }), 'triathlon');
  assertEquals(resolvePrimarySport({ discipline: 'triathlon' }), 'triathlon');
});

Deno.test('duathlon → duathlon (multi)', () => {
  assertEquals(resolvePrimarySport({ sport: 'duathlon' }), 'duathlon');
});

Deno.test('swim resolves honestly if ever primary (product: never a focus)', () => {
  assertEquals(resolvePrimarySport({ discipline: 'swim' }), 'swim');
});

Deno.test('plan_type fallback when config has no sport field', () => {
  assertEquals(resolvePrimarySport({}, 'cycling'), 'ride');
  assertEquals(resolvePrimarySport({}, 'run'), 'run');
});

Deno.test('un-nameable plan → unknown (no forced run-default)', () => {
  assertEquals(resolvePrimarySport({}), 'unknown');
  assertEquals(resolvePrimarySport({ source: 'endurance_generic' }), 'unknown');
  assertEquals(resolvePrimarySport(null), 'unknown');
});

Deno.test('does not mistake "strength" endurance-hybrid: hybrid without a named sport → hybrid', () => {
  assertEquals(resolvePrimarySport({ source: 'hybrid' }), 'hybrid');
  assertEquals(resolvePrimarySport({ source: 'combined' }), 'hybrid');
});
