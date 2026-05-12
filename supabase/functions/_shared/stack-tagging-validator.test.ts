/**
 * Unit tests for `validateNonBrickStackTagging` — the policy "same-day bike+run = brick or
 * nothing" backstop. See `docs/BRICK-PROTOCOL.md` for the source-of-truth policy. Matrix-layer
 * prevention lives in `schedule-session-constraints.ts` (Theme A commit 4); this validator is
 * the detection layer that catches anything that slips through.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/_shared/stack-tagging-validator.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  hasBrickTag,
  isBikeDiscipline,
  isRunDiscipline,
  validateNonBrickStackTagging,
  validateNonBrickStackTaggingFlat,
  type ValidatableSession,
} from './stack-tagging-validator.ts';

// ── discipline detectors ──────────────────────────────────────────────────────

Deno.test('isBikeDiscipline: accepts bike / ride / cycling (case-insensitive)', () => {
  assert(isBikeDiscipline({ type: 'bike' }));
  assert(isBikeDiscipline({ type: 'BIKE' }));
  assert(isBikeDiscipline({ type: 'ride' }));
  assert(isBikeDiscipline({ type: 'Cycling' }));
  assert(!isBikeDiscipline({ type: 'run' }));
  assert(!isBikeDiscipline({ type: 'swim' }));
  assert(!isBikeDiscipline({ type: undefined }));
});

Deno.test('isRunDiscipline: accepts run / running', () => {
  assert(isRunDiscipline({ type: 'run' }));
  assert(isRunDiscipline({ type: 'RUN' }));
  assert(isRunDiscipline({ type: 'running' }));
  assert(!isRunDiscipline({ type: 'bike' }));
});

Deno.test('hasBrickTag: detects the brick tag (case-insensitive); ignores other tags', () => {
  assert(hasBrickTag({ tags: ['brick', 'bike'] }));
  assert(hasBrickTag({ tags: ['BRICK', 'run'] }));
  assert(!hasBrickTag({ tags: ['quality', 'bike'] }));
  assert(!hasBrickTag({ tags: [] }));
  assert(!hasBrickTag({}));
});

// ── reject paths — non-brick same-day bike+run ────────────────────────────────

Deno.test('reject: same-day easy_bike + easy_run without brick tag', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Wednesday: [
      { type: 'bike', name: 'Easy Bike', tags: ['easy'] },
      { type: 'run', name: 'Easy Run', tags: ['easy'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 1);
  assertEquals(violations[0].day, 'Wednesday');
  assertEquals(violations[0].reason, 'neither_brick');
  assert(/BRICK-PROTOCOL\.md/.test(violations[0].message));
});

Deno.test('reject: same-day quality_bike + easy_run without brick tag', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Tuesday: [
      { type: 'bike', name: 'Sweet Spot Intervals', tags: ['quality'] },
      { type: 'run', name: 'Easy Run', tags: ['easy'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 1);
  assertEquals(violations[0].reason, 'neither_brick');
});

Deno.test('reject: same-day quality_bike + quality_run without brick tag', () => {
  // Even though §4.5 prevents this at placement, the validator catches it as a backstop.
  const sessions: Record<string, ValidatableSession[]> = {
    Thursday: [
      { type: 'bike', name: 'Race-Pace Intervals', tags: ['quality'] },
      { type: 'run', name: 'VO2max', tags: ['quality'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 1);
});

Deno.test('reject: asymmetric brick tagging — bike tagged, run not', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Saturday: [
      { type: 'bike', name: 'Long Ride (Brick)', tags: ['brick', 'bike', 'build'] },
      { type: 'run', name: 'Easy Run', tags: ['easy'] }, // missing brick tag
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 1);
  assertEquals(violations[0].reason, 'bike_only_brick');
});

Deno.test('reject: asymmetric brick tagging — run tagged, bike not', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Saturday: [
      { type: 'bike', name: 'Long Ride', tags: ['long_ride'] }, // missing brick tag
      { type: 'run', name: 'Brick Run', tags: ['brick', 'run', 'build'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 1);
  assertEquals(violations[0].reason, 'run_only_brick');
});

// ── accept paths — sanctioned pairings or non-pairings ────────────────────────

Deno.test('accept: same-day bike + run when BOTH carry brick tag (intentional brick)', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Saturday: [
      { type: 'bike', name: 'Long Ride (Brick)', tags: ['brick', 'bike', 'build'] },
      { type: 'run', name: 'Brick Run', tags: ['brick', 'run', 'build'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 0);
});

Deno.test('accept: bike-only day (no run = no possible violation)', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Monday: [{ type: 'bike', name: 'Easy Bike', tags: ['easy'] }],
  };
  assertEquals(validateNonBrickStackTagging(sessions).length, 0);
});

Deno.test('accept: run-only day', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Thursday: [{ type: 'run', name: 'VO2max', tags: ['quality'] }],
  };
  assertEquals(validateNonBrickStackTagging(sessions).length, 0);
});

Deno.test('accept: bike + swim same day (not a bike+run pair)', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Wednesday: [
      { type: 'bike', name: 'Quality Bike', tags: ['quality'] },
      { type: 'swim', name: 'Easy Swim', tags: ['easy'] },
    ],
  };
  assertEquals(validateNonBrickStackTagging(sessions).length, 0);
});

Deno.test('accept: run + strength same day', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Thursday: [
      { type: 'run', name: 'Quality Run', tags: ['quality'] },
      { type: 'strength', name: 'Lower Body', tags: ['lower'] },
    ],
  };
  assertEquals(validateNonBrickStackTagging(sessions).length, 0);
});

Deno.test('accept: bike-only day with brick tag (orphaned tag, no run partner)', () => {
  // Edge case: bike carries brick tag but no run paired. Not technically a brick, but the
  // validator only fires on actual same-day bike+run pairings. The orphan tag is benign here.
  const sessions: Record<string, ValidatableSession[]> = {
    Saturday: [{ type: 'bike', name: 'Long Ride (Brick)', tags: ['brick'] }],
  };
  assertEquals(validateNonBrickStackTagging(sessions).length, 0);
});

// ── multi-pair detection ──────────────────────────────────────────────────────

Deno.test('reject: day with 2 bikes + 1 run produces 2 violations (each pair flagged)', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Thursday: [
      { type: 'bike', name: 'Easy Bike AM', tags: ['easy'] },
      { type: 'bike', name: 'Easy Bike PM', tags: ['easy'] },
      { type: 'run', name: 'Easy Run', tags: ['easy'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 2);
});

Deno.test('reject: only the non-brick pair flagged when mixed', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Saturday: [
      { type: 'bike', name: 'Long Ride (Brick)', tags: ['brick'] },
      { type: 'run', name: 'Brick Run', tags: ['brick'] },
      // Add an extra non-brick run — that should pair with the bike and violate
      { type: 'run', name: 'Easy Run PM', tags: ['easy'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  // 1 bike × 2 runs = 2 pairs; only the (brick bike, non-brick run) pair violates.
  assertEquals(violations.length, 1);
  assertEquals(violations[0].reason, 'bike_only_brick');
});

// ── flat-array adapter ────────────────────────────────────────────────────────

Deno.test('validateNonBrickStackTaggingFlat: groups by day field correctly', () => {
  const sessions = [
    { day: 'Wednesday', type: 'bike', name: 'Easy Bike', tags: ['easy'] },
    { day: 'Wednesday', type: 'run', name: 'Easy Run', tags: ['easy'] },
    { day: 'Saturday', type: 'bike', name: 'Brick Bike', tags: ['brick'] },
    { day: 'Saturday', type: 'run', name: 'Brick Run', tags: ['brick'] },
  ];
  const violations = validateNonBrickStackTaggingFlat(sessions);
  assertEquals(violations.length, 1);
  assertEquals(violations[0].day, 'Wednesday');
});

Deno.test('validateNonBrickStackTaggingFlat: skips sessions with missing day field', () => {
  const sessions = [
    { type: 'bike', name: 'Orphan Bike', tags: ['easy'] }, // no day
    { day: 'Tuesday', type: 'run', name: 'Easy Run', tags: ['easy'] },
  ];
  assertEquals(validateNonBrickStackTaggingFlat(sessions).length, 0);
});

// ── integration: produces no violations for the optimizer's output ────────────
// This is the architectural payoff — matrix flip (commit 4) should prevent the validator
// from ever firing on a clean optimizer output. The validator is a backstop, not the
// primary defense. We assert this by constructing a representative GeneratedWeek-like
// shape and verifying zero violations.

Deno.test('integration: realistic week output produces zero violations', () => {
  const sessions: Record<string, ValidatableSession[]> = {
    Sunday: [{ type: 'run', name: 'Long Run', tags: ['long_run', 'build'] }],
    Monday: [
      { type: 'bike', name: 'Easy Bike', tags: ['easy'] },
      { type: 'strength', name: 'Upper Body', tags: ['upper'] },
    ],
    Tuesday: [{ type: 'bike', name: 'Quality Bike', tags: ['quality'] }],
    Wednesday: [{ type: 'swim', name: 'Quality Swim', tags: ['quality'] }],
    Thursday: [{ type: 'run', name: 'Quality Run', tags: ['quality'] }],
    Friday: [{ type: 'swim', name: 'Easy Swim', tags: ['easy'] }],
    Saturday: [
      { type: 'bike', name: 'Long Ride (Brick)', tags: ['brick', 'bike', 'build'] },
      { type: 'run', name: 'Brick Run', tags: ['brick', 'run', 'build'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(
    violations.length, 0,
    `expected zero violations for clean week; got: ${JSON.stringify(violations, null, 2)}`,
  );
});

Deno.test('integration: pre-fix Wed bug pattern (easy_bike + easy_run same day) is flagged', () => {
  // The original bug: matrix allowed easy_bike × easy_run = ✓, so dense weeks stacked them
  // on Wednesday as an untagged accidental brick. Post-fix Commit 4 prevents this at the
  // matrix layer; Commit 5 catches it if it slips through.
  const sessions: Record<string, ValidatableSession[]> = {
    Wednesday: [
      { type: 'bike', name: 'Easy Bike', tags: ['easy'] },
      { type: 'run', name: 'Easy Run', tags: ['easy'] },
    ],
  };
  const violations = validateNonBrickStackTagging(sessions);
  assertEquals(violations.length, 1, 'pre-fix bug pattern must be flagged by the validator');
  assertEquals(violations[0].reason, 'neither_brick');
});
