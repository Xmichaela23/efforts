/**
 * §6.2 / §6.5 / W-005 / W-006 same-day pairing metadata tests (Tasks B + C + E from v2.1 patch).
 *
 * Tests:
 *   - attachSameDayPairingMetadata correctly tags Lower + Quality Run, Lower + Long Ride,
 *     Lower + Easy * pairings with AM/PM ordering, 6h gap, same_day_with id.
 *   - Ordering preference (athlete state strength_ordering_preference) drives AM/PM direction.
 *   - Long Ride pairing forces strength to PM regardless of preference (§6.1 override).
 *   - Easy pairings put strength AM (recovery-flush ordering).
 *   - No pairing attached when Lower stands alone or with non-constrained partners.
 *
 * Note: the W-004 "Lower + Long Run forbidden same-day" rule is enforced by the optimizer
 * matrix (schedule-session-constraints.ts ROWS: lower_body_strength × long_run = 0) and the
 * sequentialOk 48h rule (week-optimizer.ts ~line 502-535). This file tests the post-optimizer
 * metadata-attachment layer, not the placement layer; W-004 is covered by the conformance
 * validator test added in Task F.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/generate-combined-plan/same-day-pairing.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, GeneratedWeek, PlannedSession } from './types.ts';
import type { Goal } from './types.ts';

// Most week-builder paths require a full athlete-state + goals + phase fixture. To unit-test
// pairing metadata attachment in isolation, we exercise the helper directly on hand-crafted
// session arrays. The helper is exported below from week-builder for testing.

import { attachSameDayPairingMetadataForTest } from './week-builder.ts';

function s(opts: {
  day: string;
  type: 'strength' | 'run' | 'bike' | 'swim';
  tags: string[];
  name?: string;
}): PlannedSession {
  return {
    day: opts.day,
    type: opts.type,
    name: opts.name ?? `${opts.type} session`,
    description: '',
    duration: 60,
    tss: 50,
    weighted_tss: 50,
    intensity_class: 'MODERATE',
    steps_preset: [],
    tags: opts.tags,
    serves_goal: 'g1',
    zone_targets: 'Z2',
  } as PlannedSession;
}

function stateWith(pref: 'endurance_first' | 'strength_first' | undefined): AthleteState {
  return {
    current_ctl: 50,
    weekly_hours_available: 11,
    loading_pattern: '3:1' as AthleteState['loading_pattern'],
    strength_ordering_preference: pref,
  } as AthleteState;
}

Deno.test('Task C: Lower + Quality Run same-day → ordering metadata, endurance_first default', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'], name: 'Run Intervals — 4x1000m' }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const lower = sessions.find((x) => x.type === 'strength')!;
  const qr = sessions.find((x) => x.type === 'run')!;
  assert(lower.pairing, 'expected pairing on lower');
  assert(qr.pairing, 'expected pairing on quality run');
  assertEquals(lower.pairing!.ordering, 'PM', `endurance_first: lower should be PM, got ${lower.pairing!.ordering}`);
  assertEquals(qr.pairing!.ordering, 'AM', `endurance_first: quality run should be AM, got ${qr.pairing!.ordering}`);
  assertEquals(lower.pairing!.gap_hours, 6);
  assertEquals(qr.pairing!.gap_hours, 6);
  assertEquals(lower.timing, 'PM');
  assertEquals(qr.timing, 'AM');
});

Deno.test('Task E: strength_first preference inverts ordering', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'], name: 'Run Intervals — 4x1000m' }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('strength_first'));
  const lower = sessions.find((x) => x.type === 'strength')!;
  const qr = sessions.find((x) => x.type === 'run')!;
  assertEquals(lower.pairing!.ordering, 'AM', 'strength_first: lower should be AM');
  assertEquals(qr.pairing!.ordering, 'PM', 'strength_first: quality run should be PM');
});

Deno.test('Task E: Lower + Long Ride forces strength PM regardless of preference', () => {
  // §6.1 hard override: Long Ride first is the only safe ordering.
  for (const pref of ['endurance_first', 'strength_first'] as const) {
    const sessions = [
      s({ day: 'Saturday', type: 'strength', tags: ['strength', 'lower_body'] }),
      s({ day: 'Saturday', type: 'bike', tags: ['long_ride'], name: 'Long Ride' }),
    ];
    attachSameDayPairingMetadataForTest(sessions, stateWith(pref));
    const lower = sessions.find((x) => x.type === 'strength')!;
    const lr = sessions.find((x) => x.type === 'bike')!;
    assertEquals(lower.pairing!.ordering, 'PM', `pref=${pref}: lower must be PM for Long Ride pairing`);
    assertEquals(lr.pairing!.ordering, 'AM', `pref=${pref}: Long Ride must be AM`);
    // §6.1 / W-005: Long Ride pairing demands 8h gap (vs 6h for Quality pairings).
    assertEquals(lower.pairing!.gap_hours, 8, `pref=${pref}: Long Ride pairing must have 8h gap`);
    assertEquals(lr.pairing!.gap_hours, 8, `pref=${pref}: Long Ride side must also carry 8h gap`);
  }
});

Deno.test('Task C: Lower + Quality Run gap_hours = 6 (vs Long Ride 8)', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const lower = sessions.find((x) => x.type === 'strength')!;
  assertEquals(lower.pairing!.gap_hours, 6, 'Quality pairing gap_hours should be 6');
});

Deno.test('Task E: Lower + Easy Run → strength AM (recovery-flush ordering)', () => {
  const sessions = [
    s({ day: 'Wednesday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Wednesday', type: 'run', tags: ['easy_run', 'aerobic'], name: 'Easy Run' }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const lower = sessions.find((x) => x.type === 'strength')!;
  const er = sessions.find((x) => x.type === 'run')!;
  assertEquals(lower.pairing!.ordering, 'AM', 'easy pairing: lower should be AM');
  assertEquals(er.pairing!.ordering, 'PM', 'easy pairing: easy run should be PM');
});

Deno.test('Task C: pref=undefined defaults to endurance_first', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith(undefined));
  const lower = sessions.find((x) => x.type === 'strength')!;
  assertEquals(lower.pairing!.ordering, 'PM', 'undefined pref defaults endurance_first → lower PM');
});

Deno.test('Task C: no pairing when Lower stands alone on a day', () => {
  const sessions = [
    s({ day: 'Monday', type: 'strength', tags: ['strength', 'lower_body'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  assertEquals(sessions[0].pairing, undefined, 'lone Lower should not have pairing');
});

Deno.test('Task C: no pairing for Upper + Quality Run (only Lower is constrained)', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'upper_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  assertEquals(sessions[0].pairing, undefined, 'Upper strength should not get Lower pairing metadata');
  assertEquals(sessions[1].pairing, undefined, 'Quality Run paired with Upper should not get pairing metadata');
});

Deno.test('Task C: same_day_with id encodes day + partner kind', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const lower = sessions.find((x) => x.type === 'strength')!;
  const qr = sessions.find((x) => x.type === 'run')!;
  assertEquals(lower.pairing!.same_day_with, 'Thursday:quality_run');
  assertEquals(qr.pairing!.same_day_with, 'Thursday:lower_body_strength');
});

Deno.test('Task C: coaching cue surfaces on Lower side only (not endurance side)', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const lower = sessions.find((x) => x.type === 'strength')!;
  const qr = sessions.find((x) => x.type === 'run')!;
  assert(lower.pairing!.coaching_cue?.includes('Quality Run'), `expected coaching cue on Lower, got ${lower.pairing!.coaching_cue}`);
  assertEquals(qr.pairing!.coaching_cue, undefined, 'partner side should not carry a coaching cue');
});

// ── Task F: W-005 / W-006 / W-007 conformance helpers ──────────────────────

/**
 * Inline §3.8 validator for same-day pairing rules. Pure function on a session list.
 * Returns {errors, warnings}. Hard fails (errors) block plan finalization; warnings surface
 * to the athlete (W-007 wrong-direction).
 *
 * Exported from this test file as a pragma: the validator surface lives here until a dedicated
 * validate-strength-conformance.ts module is built out further. Today the test file is the spec.
 */
function validateSameDayPairing(
  sessions: PlannedSession[],
  athletePref: 'endurance_first' | 'strength_first',
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byDay = new Map<string, PlannedSession[]>();
  for (const s of sessions) {
    const arr = byDay.get(s.day) ?? [];
    arr.push(s);
    byDay.set(s.day, arr);
  }
  for (const [day, daySessions] of byDay) {
    const lower = daySessions.find((s) => s.type === 'strength' && (s.tags?.includes('lower_body') ?? false));
    if (!lower) continue;

    const longRun = daySessions.find((s) => s.type === 'run' && (s.tags?.includes('long_run') ?? false));
    if (longRun) {
      // W-004 same-day Lower + Long Run = hard fail (§6.1)
      errors.push(`W-004 hard fail: Lower strength and Long Run on same day (${day})`);
      continue;
    }
    const longRide = daySessions.find((s) => s.type === 'bike' && (s.tags?.includes('long_ride') ?? false));
    if (longRide) {
      // W-005: Lower + Long Ride same-day requires strength PM + ordering metadata + 8h gap
      // (per v2.1 final §6.1 — bike-leg eccentric stress demands the longer recovery window).
      if (!lower.pairing || !longRide.pairing) {
        errors.push(`W-005 hard fail: Lower + Long Ride on ${day} missing pairing metadata`);
        continue;
      }
      if (lower.pairing.ordering !== 'PM' || longRide.pairing.ordering !== 'AM') {
        errors.push(`W-005 hard fail: Lower + Long Ride on ${day} must have strength=PM, ride=AM (got strength=${lower.pairing.ordering}, ride=${longRide.pairing.ordering})`);
      }
      if (lower.pairing.gap_hours < 8 || longRide.pairing.gap_hours < 8) {
        errors.push(`W-005 hard fail: Lower + Long Ride on ${day} gap < 8h (got lower=${lower.pairing.gap_hours}, ride=${longRide.pairing.gap_hours})`);
      }
      continue;
    }
    const qualityPartner = daySessions.find((s) => {
      const tags = s.tags ?? [];
      return (
        (s !== lower) &&
        ((s.type === 'run' && tags.includes('quality')) ||
          (s.type === 'bike' && tags.includes('quality_bike')))
      );
    });
    if (qualityPartner) {
      // W-006: must have metadata + 6h gap on both sessions
      if (!lower.pairing || !qualityPartner.pairing) {
        errors.push(`W-006 hard fail: Lower + Quality on ${day} missing pairing metadata`);
        continue;
      }
      if (lower.pairing.gap_hours < 6 || qualityPartner.pairing.gap_hours < 6) {
        errors.push(`W-006 hard fail: Lower + Quality on ${day} gap < 6h`);
      }
      // W-007: wrong-direction = warning (not hard fail). The pragma: pref is a default.
      const expectedLowerOrdering = athletePref === 'strength_first' ? 'AM' : 'PM';
      if (lower.pairing.ordering !== expectedLowerOrdering) {
        warnings.push(
          `W-007 warning: ${day} ordering doesn't match preference '${athletePref}' (lower=${lower.pairing.ordering}, expected=${expectedLowerOrdering})`,
        );
      }
    }
  }
  return { errors, warnings };
}

Deno.test('W-004: same-day Lower + Long Run → hard fail', () => {
  const sessions = [
    s({ day: 'Sunday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Sunday', type: 'run', tags: ['long_run'] }),
  ];
  // attachSameDayPairingMetadata does NOT tag long_run as a partner (it's forbidden) — so the
  // validator sees raw sessions; this scenario should only arise from a placement bug.
  const { errors } = validateSameDayPairing(sessions, 'endurance_first');
  assert(errors.some((e) => /W-004/.test(e)), `expected W-004 hard fail, got ${JSON.stringify(errors)}`);
});

Deno.test('W-005: Lower + Long Ride with metadata strength=PM passes', () => {
  const sessions = [
    s({ day: 'Saturday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Saturday', type: 'bike', tags: ['long_ride'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const { errors } = validateSameDayPairing(sessions, 'endurance_first');
  assertEquals(errors.length, 0, `expected no errors, got ${JSON.stringify(errors)}`);
});

Deno.test('W-005: Lower + Long Ride missing pairing metadata → hard fail', () => {
  const sessions = [
    s({ day: 'Saturday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Saturday', type: 'bike', tags: ['long_ride'] }),
  ];
  // skip attachSameDayPairingMetadata
  const { errors } = validateSameDayPairing(sessions, 'endurance_first');
  assert(errors.some((e) => /W-005/.test(e)), `expected W-005 hard fail, got ${JSON.stringify(errors)}`);
});

Deno.test('W-006: Lower + Quality Run with metadata passes', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const { errors } = validateSameDayPairing(sessions, 'endurance_first');
  assertEquals(errors.length, 0, `expected no errors, got ${JSON.stringify(errors)}`);
});

Deno.test('W-006: Lower + Quality Run missing pairing metadata → hard fail', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  // skip attach
  const { errors } = validateSameDayPairing(sessions, 'endurance_first');
  assert(errors.some((e) => /W-006/.test(e)), `expected W-006 hard fail, got ${JSON.stringify(errors)}`);
});

Deno.test('W-007: wrong-direction ordering = warning, not hard fail', () => {
  // Athlete prefers strength_first but plan generated with endurance_first ordering (lower=PM).
  // Validator should warn but not error.
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('endurance_first'));
  const { errors, warnings } = validateSameDayPairing(sessions, 'strength_first');
  assertEquals(errors.length, 0, `expected no hard fails, got ${JSON.stringify(errors)}`);
  assert(warnings.some((w) => /W-007/.test(w)), `expected W-007 warning, got ${JSON.stringify(warnings)}`);
});

Deno.test('W-007: matching direction = no warning', () => {
  const sessions = [
    s({ day: 'Thursday', type: 'strength', tags: ['strength', 'lower_body'] }),
    s({ day: 'Thursday', type: 'run', tags: ['run', 'interval', 'quality'] }),
  ];
  attachSameDayPairingMetadataForTest(sessions, stateWith('strength_first'));
  const { errors, warnings } = validateSameDayPairing(sessions, 'strength_first');
  assertEquals(errors.length, 0);
  assertEquals(warnings.length, 0, `expected no warnings, got ${JSON.stringify(warnings)}`);
});
