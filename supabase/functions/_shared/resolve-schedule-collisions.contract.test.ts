/**
 * Contract tests for resolve-schedule-collisions.ts
 *
 * Run: deno test supabase/functions/_shared/resolve-schedule-collisions.contract.test.ts
 */
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveScheduleRules,
  validateScheduleCollisionInvariants,
  ScheduleCollisionError,
  type PlannedSession,
} from './resolve-schedule-collisions.ts';

const base = (overrides: Partial<PlannedSession>): PlannedSession => ({
  id: overrides.id ?? crypto.randomUUID(),
  type: overrides.type ?? 'easy_run',
  day: overrides.day ?? 'monday',
  intensity: overrides.intensity ?? 'Z2',
  isWeightBearing: overrides.isWeightBearing ?? true,
  ...overrides,
});

Deno.test('Rule 1: separates quality_run from quality_bike onto first legal day', () => {
  const sessions: PlannedSession[] = [
    base({ id: 'qb', type: 'quality_bike', day: 'wednesday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'wednesday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'lr', type: 'long_ride', day: 'saturday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'ln', type: 'long_run', day: 'sunday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'er', type: 'easy_run', day: 'friday', intensity: 'Z2', isWeightBearing: true }),
  ];
  const out = resolveScheduleRules(sessions);
  const qb = out.find((s) => s.type === 'quality_bike')!;
  const qr = out.find((s) => s.type === 'quality_run')!;
  assertEquals(qb.day, 'wednesday');
  assertEquals(qr.day !== qb.day, true);
  assertEquals(['friday', 'saturday', 'sunday'].includes(qr.day), false);
});

Deno.test('Rule 2: moves lower_body_lift off high-stress day preferring non-weight-bearing day', () => {
  const sessions: PlannedSession[] = [
    base({ id: 'qb', type: 'quality_bike', day: 'tuesday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'thursday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'lr', type: 'long_ride', day: 'saturday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'ln', type: 'long_run', day: 'sunday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'lb', type: 'lower_body_lift', day: 'tuesday', intensity: 'Z3', isWeightBearing: false }),
    base({ id: 'eb', type: 'easy_bike', day: 'monday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'er', type: 'easy_run', day: 'wednesday', intensity: 'Z2', isWeightBearing: true }),
    // Empty Friday would score higher than Monday easy bike; anchor light WB here so Monday wins.
    base({ id: 'erf', type: 'easy_run', day: 'friday', intensity: 'Z2', isWeightBearing: true }),
  ];
  const out = resolveScheduleRules(sessions);
  const lb = out.find((s) => s.type === 'lower_body_lift')!;
  assertEquals(lb.day, 'monday');
});

Deno.test('Rule 3: relocates swim away from overcrowded day and prefers lighter loaded day over inflated rest', () => {
  const sessions: PlannedSession[] = [
    base({ id: 's1', type: 'swim', day: 'tuesday', intensity: 'Z3', isWeightBearing: false }),
    base({ id: 'er', type: 'easy_run', day: 'tuesday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'eb2', type: 'easy_bike', day: 'tuesday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'qb', type: 'quality_bike', day: 'thursday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'friday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'eb', type: 'easy_bike', day: 'wednesday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'erw', type: 'easy_run', day: 'wednesday', intensity: 'Z2', isWeightBearing: true }),
  ];
  const out = resolveScheduleRules(sessions);
  const swim = out.find((s) => s.type === 'swim')!;
  assertEquals(swim.day === 'tuesday', false);
  // Thursday has one session (quality_bike); Wednesday has two — lowest effective load wins before rest inflation (50).
  assertEquals(swim.day, 'thursday');
});

Deno.test('validateScheduleCollisionInvariants throws SCHEDULE_GRIDLOCK_LOWER_BODY', () => {
  const bad: PlannedSession[] = [
    base({ id: 'qb', type: 'quality_bike', day: 'monday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'lb', type: 'lower_body_lift', day: 'monday', intensity: 'Z3', isWeightBearing: false }),
  ];
  assertThrows(
    () => validateScheduleCollisionInvariants(bad),
    ScheduleCollisionError,
    'SCHEDULE_GRIDLOCK:',
  );
});

Deno.test('resolveScheduleRules does not mutate input', () => {
  const sessions: PlannedSession[] = [
    base({ id: 'qr', type: 'quality_run', day: 'wednesday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'qb', type: 'quality_bike', day: 'wednesday', intensity: 'Z4', isWeightBearing: false }),
  ];
  const snap = JSON.stringify(sessions);
  resolveScheduleRules(sessions);
  assertEquals(JSON.stringify(sessions), snap);
});
