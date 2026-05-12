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
  // Olympic tier: max 2 sessions/day before swim relocation (stricter than 70.3).
  const out = resolveScheduleRules(sessions, 'olympic');
  const swim = out.find((s) => s.type === 'swim')!;
  assertEquals(swim.day === 'tuesday', false);
  // Thursday has one session (quality_bike); Wednesday has two — lowest effective load wins before rest inflation (50).
  assertEquals(swim.day, 'thursday');
});

Deno.test('Rule 1.5: 70.3 separates long_run from long_ride when stacked', () => {
  const sessions: PlannedSession[] = [
    base({ id: 'lr', type: 'long_ride', day: 'saturday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'ln', type: 'long_run', day: 'saturday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'qb', type: 'quality_bike', day: 'wednesday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'thursday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'lb', type: 'lower_body_lift', day: 'friday', intensity: 'Z3', isWeightBearing: false }),
  ];
  const out = resolveScheduleRules(sessions, '70.3');
  assertEquals(out.find((s) => s.type === 'long_ride')!.day, 'saturday');
  assertEquals(out.find((s) => s.type === 'long_run')!.day, 'monday');
});

Deno.test('sprint keeps long_ride and long_run on same day when allowLongStack', () => {
  const sessions: PlannedSession[] = [
    base({ id: 'lr', type: 'long_ride', day: 'sunday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'ln', type: 'long_run', day: 'sunday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'qb', type: 'quality_bike', day: 'tuesday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'thursday', intensity: 'Z4', isWeightBearing: true }),
  ];
  const out = resolveScheduleRules(sessions, 'sprint');
  assertEquals(out.find((s) => s.type === 'long_ride')!.day, 'sunday');
  assertEquals(out.find((s) => s.type === 'long_run')!.day, 'sunday');
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

// ── Bug 3 regression: §5.2 perf+coeq consolidated hard-day exception ──────────
//
// RULE 2 (lower_body off high-stress days) was relocating lower_body_lift OFF quality_run day
// without honoring the §5.2 consolidated hard-day pattern (lower + QR same-day AM/PM is
// sanctioned for performance + co-equal athletes). Plan 51 reference geometry:
//   Sat long_ride, Sun long_run, Tue quality_bike, Thu quality_run.
// Optimizer placed Thu lower (consolidated). RULE 2 relocated it to Monday (highest-scored
// non-stress day). After fix: with `isPerformanceCoequal: true`, Thursday lower stays.

Deno.test('Bug 3: perf+coeq exception keeps lower_body_lift on quality_run day (Thu consolidated)', () => {
  const sessions: PlannedSession[] = [
    base({ id: 'qb', type: 'quality_bike', day: 'tuesday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'thursday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'lr', type: 'long_ride', day: 'saturday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'lrun', type: 'long_run', day: 'sunday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'lb', type: 'lower_body_lift', day: 'thursday', intensity: 'Z3', isWeightBearing: false }),
    base({ id: 'ub', type: 'upper_body_lift', day: 'friday', intensity: 'Z3', isWeightBearing: false }),
  ];
  const out = resolveScheduleRules(sessions, '70.3', { isPerformanceCoequal: true });
  const lb = out.find((s) => s.type === 'lower_body_lift')!;
  assertEquals(lb.day, 'thursday', `expected lb to stay on Thursday under perf+coeq; got ${lb.day}`);
});

Deno.test('Bug 3: WITHOUT perf+coeq flag, lower_body_lift IS relocated off quality_run day', () => {
  // Default behavior preserved — non-perf-coeq athletes still get RULE 2 relocation.
  const sessions: PlannedSession[] = [
    base({ id: 'qb', type: 'quality_bike', day: 'tuesday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'thursday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'lr', type: 'long_ride', day: 'saturday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'lrun', type: 'long_run', day: 'sunday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'lb', type: 'lower_body_lift', day: 'thursday', intensity: 'Z3', isWeightBearing: false }),
  ];
  const out = resolveScheduleRules(sessions, '70.3'); // no options → default
  const lb = out.find((s) => s.type === 'lower_body_lift')!;
  assertEquals(lb.day !== 'thursday', true, `expected lb relocated off Thursday for non-perf-coeq; got ${lb.day}`);
});

Deno.test('Bug 3: perf+coeq exception does NOT extend to long_ride / long_run / quality_bike days', () => {
  // Only quality_run day gets the exception (consolidated AM/PM rule per §5.2). lower_body on
  // long_ride / long_run / quality_bike is still a violation — relocate.
  for (const stressDay of ['tuesday', 'saturday', 'sunday'] as const) {
    const sessions: PlannedSession[] = [
      base({ id: 'qb', type: 'quality_bike', day: 'tuesday', intensity: 'Z4', isWeightBearing: false }),
      base({ id: 'qr', type: 'quality_run', day: 'thursday', intensity: 'Z4', isWeightBearing: true }),
      base({ id: 'lr', type: 'long_ride', day: 'saturday', intensity: 'Z2', isWeightBearing: false }),
      base({ id: 'lrun', type: 'long_run', day: 'sunday', intensity: 'Z2', isWeightBearing: true }),
      base({ id: 'lb', type: 'lower_body_lift', day: stressDay, intensity: 'Z3', isWeightBearing: false }),
    ];
    const out = resolveScheduleRules(sessions, '70.3', { isPerformanceCoequal: true });
    const lb = out.find((s) => s.type === 'lower_body_lift')!;
    assertEquals(
      lb.day !== stressDay,
      true,
      `lower_body on ${stressDay} (non-QR stress day) must still relocate; got ${lb.day}`,
    );
  }
});

Deno.test('Bug 3: validateScheduleCollisionInvariants accepts lb-on-QR for perf+coeq', () => {
  const sessions: PlannedSession[] = [
    base({ id: 'qb', type: 'quality_bike', day: 'tuesday', intensity: 'Z4', isWeightBearing: false }),
    base({ id: 'qr', type: 'quality_run', day: 'thursday', intensity: 'Z4', isWeightBearing: true }),
    base({ id: 'lr', type: 'long_ride', day: 'saturday', intensity: 'Z2', isWeightBearing: false }),
    base({ id: 'lrun', type: 'long_run', day: 'sunday', intensity: 'Z2', isWeightBearing: true }),
    base({ id: 'lb', type: 'lower_body_lift', day: 'thursday', intensity: 'Z3', isWeightBearing: false }),
  ];
  // Without flag: throws (lb on quality_run day = high stress).
  assertThrows(
    () => validateScheduleCollisionInvariants(sessions),
    ScheduleCollisionError,
    'SCHEDULE_GRIDLOCK:',
  );
  // With flag: passes (consolidated hard-day).
  validateScheduleCollisionInvariants(sessions, { isPerformanceCoequal: true });
});
